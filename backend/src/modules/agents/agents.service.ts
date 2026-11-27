import { HttpStatus, Injectable } from '@nestjs/common';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
} from '../../common/errors.js';
import { normalizeName, parsePhone } from '../../common/normalize.js';
import { escapeLike } from '../../common/pagination.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { Permission, Role } from '../../common/rbac.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { buildTree } from './agent-tree.js';
import type {
  CreateAgentDto,
  ListAgentsQueryDto,
  UpdateAgentDto,
} from './agents.dto.js';
import {
  Agent,
  AGENT_RANKS,
  AGENT_STATUSES,
  type AgentRank,
} from './infrastructure/agent.entity.js';

const OPTIONAL_FIELDS = [
  'gender',
  'dob',
  'phone',
  'endDate',
  'officeCode',
] as const;

const STOPPED = AGENT_STATUSES[1];

/** The tree rank of an account added by hand, from its highest agent role (ROLE-2). */
const RANK_OF_ROLE: readonly (readonly [Role, AgentRank])[] = [
  [Role.GAD, 'SUM'],
  [Role.BM, 'BM'],
  [Role.UM, 'UM'],
  [Role.FC, 'FC'],
];

/** DATA-4: stored as `0xxxxxxxxx` when it is a Vietnamese number; other text is kept as written. */
export function normalizePhone(value: string): string {
  return parsePhone(value) ?? value;
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
  ) {}

  /** A platform account belongs to no GA, so there is no tree for it to read. */
  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  /** AGT-6 + SCOPE-2: the actor's own code and everyone below it, computed on the server. */
  private visible(builder: SelectQueryBuilder<Agent>, actor: Actor) {
    if (actor.permissions.includes(Permission.AgentsViewAll)) return builder;
    if (!actor.agentCode) return builder.andWhere('false');
    return builder.andWhere(
      '(agent.agentCode = :own OR agent.ancestors @> ARRAY[:own]::text[])',
      { own: actor.agentCode },
    );
  }

  private agents(db: EntityManager, scope: Scope) {
    return db
      .getRepository(Agent)
      .createQueryBuilder('agent')
      .where('agent.tenantId = :tenantId', { tenantId: scope.tenantId });
  }

  /** AGT-6: date of birth and phone are for GA_HEAD and ADMIN only. */
  private seesPersonalData(actor: Actor): boolean {
    return (
      actor.roles.includes(Role.GAD) || actor.roles.includes(Role.Admin)
    );
  }

  private async managerNames(
    db: EntityManager,
    scope: Scope,
    agents: { managerCode: string | null }[],
  ): Promise<Map<string, string>> {
    const codes = [
      ...new Set(agents.flatMap(({ managerCode }) => managerCode ?? [])),
    ];
    return this.namesByCode(scope, codes, db);
  }

  async list(actor: Actor, query: ListAgentsQueryDto) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const builder = this.visible(this.agents(db, scope), actor);
      if (query.rank)
        builder.andWhere('agent.rank = :rank', { rank: query.rank });
      if (query.status)
        builder.andWhere('agent.status = :status', { status: query.status });
      if (query.q)
        builder.andWhere(
          '(agent.agentCode LIKE :code OR agent.nameNorm LIKE :name)',
          {
            code: `%${escapeLike(query.q)}%`,
            name: `%${escapeLike(normalizeName(query.q))}%`,
          },
        );
      const [items, total] = await builder
        .orderBy('agent.agentCode', 'ASC')
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getManyAndCount();
      const names = await this.managerNames(db, scope, items);
      return {
        items: items.map((agent) => ({
          agentCode: agent.agentCode,
          name: agent.name,
          rank: agent.rank,
          managerCode: agent.managerCode,
          managerName: agent.managerCode
            ? (names.get(agent.managerCode) ?? null)
            : null,
          status: agent.status,
        })),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    });
  }

  /** Section 17.6: the whole visible tree at once; the screen builds and counts branches from it. */
  async tree(actor: Actor) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const items = await this.visible(this.agents(db, scope), actor)
        .select([
          'agent.agentCode',
          'agent.name',
          'agent.rank',
          'agent.managerCode',
          'agent.ancestors',
          'agent.depth',
          'agent.status',
        ])
        .orderBy('agent.agentCode', 'ASC')
        .getMany();
      const users = (await db.query(
        `SELECT id, agent_code FROM users WHERE tenant_id = $1 AND agent_code = ANY($2::text[])`,
        [scope.tenantId, items.map((agent) => agent.agentCode)],
      )) as { id: string; agent_code: string }[];
      const userByCode = new Map(
        users.map((user) => [user.agent_code, user.id]),
      );
      return {
        items: items.map((agent) => ({
          agentCode: agent.agentCode,
          name: agent.name,
          rank: agent.rank,
          managerCode: agent.managerCode,
          ancestors: agent.ancestors,
          depth: agent.depth,
          status: agent.status,
          userId: userByCode.get(agent.agentCode) ?? null,
        })),
      };
    });
  }

  async get(actor: Actor, code: string, outer?: EntityManager) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(
      scope,
      async (db) => {
        const agent = await this.visible(this.agents(db, scope), actor)
          .andWhere('agent.agentCode = :code', { code })
          .getOne();
        // TEN-3: another GA's agent, and one outside the actor's branch, both look missing
        if (!agent) throw notFound();
        const names = await this.managerNames(db, scope, [agent]);
        const personal = this.seesPersonalData(actor);
        return {
          agentCode: agent.agentCode,
          name: agent.name,
          rank: agent.rank,
          managerCode: agent.managerCode,
          managerName: agent.managerCode
            ? (names.get(agent.managerCode) ?? null)
            : null,
          managerFixed: agent.managerFixed,
          ancestors: agent.ancestors,
          depth: agent.depth,
          status: agent.status,
          gender: agent.gender,
          startDate: agent.startDate,
          endDate: agent.endDate,
          officeCode: agent.officeCode,
          ...(personal && { dob: agent.dob, phone: agent.phone }),
        };
      },
      outer,
    );
  }

  async create(actor: Actor, dto: CreateAgentDto) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const agents = db.getRepository(Agent);
      if (
        await agents.existsBy({
          tenantId: scope.tenantId,
          agentCode: dto.agentCode,
        })
      )
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.AgentExists);
      if (
        dto.managerCode &&
        !(await agents.existsBy({
          tenantId: scope.tenantId,
          agentCode: dto.managerCode,
        }))
      )
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.ManagerNotFound,
        );
      await agents.insert({
        tenantId: scope.tenantId,
        agentCode: dto.agentCode,
        name: dto.name,
        nameNorm: normalizeName(dto.name),
        rank: dto.rank,
        status: dto.status,
        startDate: dto.startDate ?? null,
        gender: dto.gender || null,
        dob: dto.dob || null,
        endDate: dto.endDate || null,
        officeCode: dto.officeCode || null,
        phone: dto.phone ? normalizePhone(dto.phone) : null,
        managerCode: dto.managerCode ?? null,
      });
      await this.rebuildTree(scope, db);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'agent',
          entityId: dto.agentCode,
          // AUD-4: no birth date or phone in the log
          meta: { rank: dto.rank, managerCode: dto.managerCode ?? null },
        },
        db,
      );
      return this.get(actor, dto.agentCode, db);
    });
  }

  /**
   * Decided 26/11/2026: an account with an agent role (ROLE-2) whose code is not on the tree yet
   * joins it when the account is saved, in the same transaction, so a staff member added by hand
   * shows in every agent picker (AGT-9), owns clients and leads, and gives their manager a line
   * (SCOPE-1). The rank follows the highest agent role; the manager is the one the form picked.
   * The manager must rank above the account.
   * A code already on the tree is left as it is: the tree stays the place to move an agent, and a
   * later 01_Agents import updates the agent like any other.
   * Returns whether the agent was added. Without `agents.edit_tree` nothing is added and the
   * user list keeps warning about the code (USER-7).
   */
  async addForUser(
    scope: Scope,
    actor: Actor,
    user: {
      agentCode: string | null;
      name: string;
      roles: readonly string[];
      managerCode?: string | null;
    },
    db: EntityManager,
  ): Promise<boolean> {
    const rank = RANK_OF_ROLE.find(([role]) => user.roles.includes(role))?.[1];
    if (!rank || !user.agentCode) return false;
    if (!actor.permissions.includes(Permission.AgentsEditTree)) return false;
    const agents = db.getRepository(Agent);
    if (
      await agents.existsBy({
        tenantId: scope.tenantId,
        agentCode: user.agentCode,
      })
    )
      return false;
    const managerCode = user.managerCode || null;
    // Decided 27/11/2026: every agent hangs under someone above them, unless nobody is yet
    if (
      !managerCode &&
      AGENT_RANKS.indexOf(rank) > 0 &&
      (await agents
        .createQueryBuilder('agent')
        .where('agent.tenantId = :tenantId', { tenantId: scope.tenantId })
        .andWhere('agent.rank IN (:...above)', {
          above: AGENT_RANKS.slice(0, AGENT_RANKS.indexOf(rank)),
        })
        .getExists())
    )
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ManagerRequired);
    if (managerCode) {
      const manager =
        managerCode === user.agentCode
          ? null
          : await agents.findOneBy({
              tenantId: scope.tenantId,
              agentCode: managerCode,
            });
      if (!manager)
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.ManagerNotFound,
        );
      // Decided 26/11/2026: a direct manager ranks above the account (SUM > BM > UM > SA > FC)
      if (AGENT_RANKS.indexOf(manager.rank) >= AGENT_RANKS.indexOf(rank))
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.ManagerRankTooLow,
        );
    }
    await agents.insert({
      tenantId: scope.tenantId,
      agentCode: user.agentCode,
      name: user.name,
      nameNorm: normalizeName(user.name),
      rank,
      status: AGENT_STATUSES[0],
      managerCode,
    });
    await this.rebuildTree(scope, db);
    await this.audit.record(
      {
        tenantId: scope.tenantId,
        userId: actor.id,
        action: AuditAction.Create,
        entity: 'agent',
        entityId: user.agentCode,
        meta: { rank, managerCode, from: 'user' },
      },
      db,
    );
    return true;
  }

  async update(actor: Actor, code: string, dto: UpdateAgentDto) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const agent = await this.requireAgent(scope, code, db);
      const patch: Partial<Agent> = {};
      for (const field of ['name', 'rank', 'status', 'startDate'] as const) {
        const value = dto[field];
        if (value !== undefined && value !== agent[field])
          Object.assign(patch, { [field]: value });
      }
      if (dto.name) patch.nameNorm = normalizeName(dto.name);
      for (const field of OPTIONAL_FIELDS) {
        if (dto[field] === undefined) continue;
        const raw = dto[field] || null;
        const value = field === 'phone' && raw ? normalizePhone(raw) : raw;
        if (value !== agent[field]) Object.assign(patch, { [field]: value });
      }
      const changed = Object.keys(patch).filter(
        (field) => field !== 'nameNorm',
      );
      if (changed.length > 0) {
        await db.getRepository(Agent).update({ id: agent.id }, patch);
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Update,
            entity: 'agent',
            entityId: code,
            // AUD-4: field names only, because these values include personal data
            meta: { fields: changed },
          },
          db,
        );
      }
      return this.get(actor, code, db);
    });
  }

  /** AGT-5 */
  async setManager(actor: Actor, code: string, managerCode: string | null) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const agent = await this.requireAgent(scope, code, db);
      if (managerCode) {
        if (managerCode === code)
          throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ManagerCycle);
        const manager = await db
          .getRepository(Agent)
          .findOneBy({ tenantId: scope.tenantId, agentCode: managerCode });
        if (!manager)
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ErrorCode.ManagerNotFound,
          );
        if (manager.ancestors.includes(code))
          throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ManagerCycle);
      }
      await db
        .getRepository(Agent)
        .update({ id: agent.id }, { managerCode, managerFixed: true });
      await this.rebuildTree(scope, db);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'agent',
          entityId: code,
          meta: {
            before: { managerCode: agent.managerCode },
            after: { managerCode },
          },
        },
        db,
      );
      return this.get(actor, code, db);
    });
  }

  private async requireAgent(
    scope: Scope,
    code: string,
    db: EntityManager,
  ): Promise<Agent> {
    // Locked: two changes to one agent's place in the tree must not interleave
    const agent = await db
      .getRepository(Agent)
      .createQueryBuilder('agent')
      .where('agent.tenantId = :tenantId AND agent.agentCode = :code', {
        tenantId: scope.tenantId,
        code,
      })
      .setLock('pessimistic_write')
      .getOne();
    if (!agent) throw notFound();
    return agent;
  }

  /** AGT-3: recomputes the whole tenant and writes only what moved. Returns the agents split off cycles. */
  async rebuildTree(scope: Scope, db: EntityManager): Promise<string[]> {
    const all = (await db.query(
      `SELECT agent_code AS "agentCode", manager_code AS "managerCode", ancestors, depth
         FROM agents WHERE tenant_id = $1`,
      [scope.tenantId],
    )) as {
      agentCode: string;
      managerCode: string | null;
      ancestors: string[];
      depth: number;
    }[];
    const { positions, cycles } = buildTree(
      all.map((agent) => ({
        ...agent,
        managerCode: agent.managerCode ?? undefined,
      })),
    );
    const moved = all.flatMap((agent) => {
      const position = positions.get(agent.agentCode)!;
      return agent.depth !== position.depth ||
        agent.ancestors.join() !== position.ancestors.join()
        ? [{ code: agent.agentCode, ...position }]
        : [];
    });
    if (moved.length > 0)
      // One statement for every moved agent
      await db.query(
        `UPDATE agents a SET ancestors = m.ancestors, depth = m.depth
           FROM jsonb_to_recordset($2::jsonb) AS m(code text, ancestors text[], depth int)
          WHERE a.tenant_id = $1 AND a.agent_code = m.code`,
        [scope.tenantId, JSON.stringify(moved)],
      );
    return cycles;
  }

  /**
   * SCOPE-1 to SCOPE-3: the agent codes whose records this person may see. Their own code counts even
   * before the tree is loaded. An FC reaches only themselves, whatever the tree says.
   */
  async scopeCodes(actor: Actor, outer?: EntityManager): Promise<string[]> {
    if (!actor.tenantId || !actor.agentCode || actor.reach === 'NONE')
      return [];
    if (actor.reach === 'OWN') return [actor.agentCode];
    const below = (await this.tenantDb.run(
      { tenantId: actor.tenantId },
      (db) =>
        db.query(
          `SELECT agent_code FROM agents WHERE tenant_id = $1 AND ancestors @> ARRAY[$2]::text[]`,
          [actor.tenantId, actor.agentCode],
        ),
      outer,
    )) as { agent_code: string }[];
    return [actor.agentCode, ...below.map((agent) => agent.agent_code)];
  }

  async existingCodes(scope: Scope, codes: string[]): Promise<Set<string>> {
    const found = await this.namesByCode(scope, codes);
    return new Set(found.keys());
  }

  async namesByCode(
    scope: Scope,
    codes: string[],
    outer?: EntityManager,
  ): Promise<Map<string, string>> {
    if (codes.length === 0) return new Map();
    const rows = (await this.tenantDb.run(
      scope,
      (db) =>
        db.query(
          `SELECT agent_code, name FROM agents WHERE tenant_id = $1 AND agent_code = ANY($2::text[])`,
          [scope.tenantId, codes],
        ),
      outer,
    )) as { agent_code: string; name: string }[];
    return new Map(rows.map((row) => [row.agent_code, row.name]));
  }

  /** LEAD-23: agents still working here, for choosing who gets a lead. */
  /** Active agents for a picker; `codes` limits it to a line (open question 4). */
  listForPicker(
    scope: Scope,
    q?: string,
    codes?: string[],
  ): Promise<{ agentCode: string; name: string }[]> {
    return this.tenantDb.run(scope, (db) => {
      const builder = db
        .getRepository(Agent)
        .createQueryBuilder('agent')
        .select(['agent.agentCode', 'agent.name'])
        .where('agent.tenantId = :tenantId AND agent.status <> :stopped', {
          tenantId: scope.tenantId,
          stopped: STOPPED,
        });
      if (codes) builder.andWhere('agent.agentCode = ANY(:codes)', { codes });
      if (q)
        builder.andWhere(
          '(agent.agentCode LIKE :code OR agent.nameNorm LIKE :name)',
          {
            code: `%${escapeLike(q)}%`,
            name: `%${escapeLike(normalizeName(q))}%`,
          },
        );
      return builder
        .orderBy('agent.nameNorm', 'ASC')
        .limit(5000)
        .getMany()
        .then((rows) =>
          rows.map(({ agentCode, name }) => ({ agentCode, name })),
        );
    });
  }

  /** AGT-7: of these users, the ones whose account is active and whose agent is still working. */
  async workingUsers(
    scope: Scope,
    userIds: string[],
    outer?: EntityManager,
  ): Promise<Set<string>> {
    const rows = (await this.tenantDb.run(
      scope,
      (db) =>
        db.query(
          `SELECT u.id FROM users u JOIN agents a
              ON a.tenant_id = u.tenant_id AND a.agent_code = u.agent_code
            WHERE u.tenant_id = $1 AND u.id = ANY($2::uuid[]) AND u.status = 'ACTIVE'
              AND a.status <> $3 AND a.end_date IS NULL`,
          [scope.tenantId, userIds, STOPPED],
        ),
      outer,
    )) as { id: string }[];
    return new Set(rows.map((row) => row.id));
  }

  /** Section 27.2 fixture. Leaves a GA that already has a tree alone. */
  async seedDemo(
    scope: Scope,
    rows: Pick<
      Agent,
      'agentCode' | 'name' | 'rank' | 'status' | 'managerCode' | 'startDate'
    >[],
  ): Promise<void> {
    await this.tenantDb.run(scope, async (db) => {
      const agents = db.getRepository(Agent);
      if (await agents.existsBy({ tenantId: scope.tenantId })) return;
      await agents.insert(
        rows.map((row) => ({
          ...row,
          tenantId: scope.tenantId,
          nameNorm: normalizeName(row.name),
        })),
      );
      await this.rebuildTree(scope, db);
    });
  }
}
