import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ValidationError,
} from '@nestjs/common';
import type { Response } from 'express';

/** Section 20: API error codes. The frontend maps each code to its Vietnamese message (UI-2). */
export const ErrorCode = {
  Internal: 'internal',
  InvalidCredentials: 'invalid_credentials',
  Unauthenticated: 'unauthenticated',
  Forbidden: 'forbidden',
  NotFound: 'not_found',
  InvalidInput: 'invalid_input',
  RateLimited: 'rate_limited',
  EmailTaken: 'email_taken',
  AgentCodeTaken: 'agent_code_taken',
  AgentCodeRequired: 'agent_code_required',
  LastGaHead: 'last_ga_head',
  CannotDisableSelf: 'cannot_disable_self',
  InvitePending: 'invite_pending',
  NotInvited: 'not_invited',
  UserHasHistory: 'user_has_history',
  UnknownOption: 'unknown_option',
  StaleSettings: 'stale_settings',
  ProgramExists: 'program_exists',
  ProgramInUse: 'program_in_use',
  UnknownProgram: 'unknown_program',
  /** TENANT-5: a product code that is not in the catalogue, or a hidden product. */
  UnknownProduct: 'unknown_product',
  /** Decided 26/11/2026: a province or commune code that does not exist, or a commune of another province. */
  UnknownPlace: 'unknown_place',
  ProgramRepeated: 'program_repeated',
  PolicyExists: 'policy_exists',
  ClientNotYours: 'client_not_yours',
  /** Decided 25/11/2026: a client is added on a policy outside the person's scope. */
  PolicyNotYours: 'policy_not_yours',
  /** CUS-11: a policy has one holder. */
  HolderExists: 'holder_exists',
  /** The same person (name and birth date) is already on that policy. */
  PersonOnPolicy: 'person_on_policy',
  AgentRequired: 'agent_required',
  /** LEAD-32 */
  ClientAlreadyLinked: 'client_already_linked',
  /** LEAD-32: linking starts at PROPOSAL, or once the lead is won. */
  LeadNotLinkable: 'lead_not_linkable',
  /** FAM-3 */
  SameClient: 'same_client',
  /** FAM-4 */
  AlreadyClient: 'already_client',
  OptionExists: 'option_exists',
  OptionBuiltIn: 'option_built_in',
  OptionInUse: 'option_in_use',
  InviteInvalid: 'invite_invalid',
  GaCodeTaken: 'ga_code_taken',
  InvalidCurrentPassword: 'invalid_current_password',
  PasswordUnchanged: 'password_unchanged',
  CannotResetSelf: 'cannot_reset_self',
  UserDisabled: 'user_disabled',
  PasswordTooWeak: 'password_too_weak',
  ServerBusy: 'server_busy',
  ServiceUnavailable: 'service_unavailable',
  ManagerNotFound: 'manager_not_found',
  ManagerCycle: 'manager_cycle',
  ManagerRankTooLow: 'manager_rank_too_low',
  AgentExists: 'agent_exists',
  ImportNotOpen: 'import_not_open',
  ImportNotValidated: 'import_not_validated',
  SheetNotReady: 'sheet_not_ready',
  ImportTooLarge: 'import_too_large',
  AgentNotFound: 'agent_not_found',
  CampaignNotFound: 'campaign_not_found',
  /** CMP-1 */
  CampaignExists: 'campaign_exists',
  /** CMP-5 + DATA-8 */
  CampaignInUse: 'campaign_in_use',
  /** CMP-2 */
  CampaignNotSeminar: 'campaign_not_seminar',
  InvalidPhone: 'invalid_phone',
  PhoneExists: 'phone_exists',
  InterestLocked: 'interest_locked',
  LostReasonRequired: 'lost_reason_required',
  OwnLeadLocked: 'own_lead_locked',
  /** POL-7: only a hand-entered policy no import has touched, within 7 days */
  PolicyNotDeletable: 'policy_not_deletable',
  /** Open question 4: a line manager assigns only to agents of their line */
  AgentOutOfLine: 'agent_out_of_line',
  WonNeedsNumbers: 'won_needs_numbers',
  InvalidApplicationNo: 'invalid_application_no',
  InvalidPolicyNo: 'invalid_policy_no',
  LeadNotYours: 'lead_not_yours',
  /** CMT-5 */
  MentionNotVisible: 'mention_not_visible',
  /** Section 14.4 */
  AiProviderMissing: 'ai_provider_missing',
  AiProviderError: 'ai_provider_error',
  AiRateLimited: 'ai_rate_limited',
  AiKeyInvalid: 'ai_key_invalid',
  AiModelUnavailable: 'ai_model_unavailable',
  /** LEAD-40 */
  LeadNotRestorable: 'lead_not_restorable',
  /** LEAD-41 */
  LeadMergeConflict: 'lead_merge_conflict',
  /** NOTE-8 */
  NoteNotEditable: 'note_not_editable',
  /** LEAD-38 */
  FilterExists: 'filter_exists',
  FilterLimit: 'filter_limit',
  /** CMP-4 */
  FormUnavailable: 'form_unavailable',
  CaptchaFailed: 'captcha_failed',
  /** USER-16 MFA */
  InvalidCode: 'invalid_code',
  MfaRequired: 'mfa_required',
  MfaSetupRequired: 'mfa_setup_required',
  MfaMandatory: 'mfa_mandatory',
  /** USER-16: set-up is for an account without MFA; a new phone goes through disable or a reset. */
  MfaAlreadyEnabled: 'mfa_already_enabled',
  /** Section 5.2 plan limits */
  PlanUserLimit: 'plan_user_limit',
  PlanAiLimit: 'plan_ai_limit',
  /** Chat (C2, C3) */
  ChatMemberInactive: 'chat_member_inactive',
  ChatEditWindowClosed: 'chat_edit_window_closed',
  ChatGroupTooLarge: 'chat_group_too_large',
  /** Chat files (C4, K8) */
  ChatFileTooLarge: 'chat_file_too_large',
  ChatFileType: 'chat_file_type',
  ChatTooManyFiles: 'chat_too_many_files',
  PlanStorageLimit: 'plan_storage_limit',
  StorageUnavailable: 'storage_unavailable',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface Issue {
  path: string;
  message: string;
}

export class ApiException extends HttpException {
  constructor(
    status: number,
    code: ErrorCode,
    extra?: { issues?: Issue[]; leadId?: string },
    /** Sent as the Retry-After header. */
    readonly retryAfterSeconds?: number,
  ) {
    super({ error: code, ...extra }, status);
  }
}

export const notFound = () =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound);
export const forbidden = () =>
  new ApiException(HttpStatus.FORBIDDEN, ErrorCode.Forbidden);
export const unauthenticated = () =>
  new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.Unauthenticated);

export function validationException(errors: ValidationError[]): ApiException {
  const flatten = (items: ValidationError[], parent = ''): Issue[] =>
    items.flatMap((error) => {
      const path = parent ? `${parent}.${error.property}` : error.property;
      const own = Object.values(error.constraints ?? {}).map((message) => ({
        path,
        message,
      }));
      return [...own, ...flatten(error.children ?? [], path)];
    });
  return new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput, {
    issues: flatten(errors),
  });
}

/** PostgreSQL unique indexes and the error each one means to the API. */
const UNIQUE_ERRORS: Record<string, ErrorCode> = {
  users_email_key: ErrorCode.EmailTaken,
  users_agent_code_key: ErrorCode.AgentCodeTaken,
  tenants_ga_code_key: ErrorCode.GaCodeTaken,
};

/** The PostgreSQL error behind a TypeORM QueryFailedError, if any. */
export const pgError = (
  error: unknown,
): { code?: string; constraint?: string } | undefined =>
  (error as { driverError?: { code?: string; constraint?: string } })
    ?.driverError;

/** Maps a unique-index violation (23505) to its domain error; rethrows anything else. */
export function mapDuplicateKey(error: unknown): never {
  const driver = pgError(error);
  const code =
    driver?.code === '23505' && driver.constraint
      ? UNIQUE_ERRORS[driver.constraint]
      : undefined;
  if (code) throw new ApiException(HttpStatus.CONFLICT, code);
  throw error;
}

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ErrorCode.InvalidInput,
  401: ErrorCode.Unauthenticated,
  403: ErrorCode.Forbidden,
  404: ErrorCode.NotFound,
  413: ErrorCode.InvalidInput,
  429: ErrorCode.RateLimited,
};

/** The database cannot be reached: a temporary state, not a bug in the request. */
function isDatabaseDown(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = pgError(error)?.code ?? (error as { code?: string }).code;
  // 08xxx connection exceptions, 57P0x shutdown / cannot connect now, 53300 too many connections
  return (
    /^(08|57P0)/.test(code ?? '') ||
    code === '53300' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    /timeout exceeded when trying to connect|Connection terminated/.test(
      error.message,
    )
  );
}

/** Section 2.5: every error leaves the API as { error: <code>, issues?: [...] }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiException) {
      if (exception.retryAfterSeconds) {
        response.setHeader('Retry-After', exception.retryAfterSeconds);
      }
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response
        .status(status)
        .json({ error: CODE_BY_STATUS[status] ?? ErrorCode.Internal });
      return;
    }
    if (isDatabaseDown(exception)) {
      this.logger.error(
        `Database unavailable: ${(exception as Error).message}`,
      );
      response
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .setHeader('Retry-After', 5)
        .json({ error: ErrorCode.ServiceUnavailable });
      return;
    }
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: ErrorCode.Internal });
  }
}
