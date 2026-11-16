import type { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_TABLES = [
  'campaigns',
  'campaign_members',
  'lead_options',
  'leads',
  'lead_history',
  'interactions',
  'comments',
  'tasks',
  'saved_filters',
  'notifications',
  'notice_keys',
];

/**
 * Leads and what hangs off them: history, notes and contacts, comments, tasks, saved filters, the
 * GA's lead catalogue, campaigns (the table only; the module moves later) and notifications.
 */
export class Leads1763049600000 implements MigrationInterface {
  name = 'Leads1763049600000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      -- Section 18.4 (CMP-1, CMP-2). Every field but the name is optional (IMP-28).
      CREATE TABLE campaigns (
        id            uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id     uuid NOT NULL REFERENCES tenants (id),
        name          text NOT NULL CHECK (btrim(name) <> ''),
        type          text NOT NULL DEFAULT 'OTHER'
                      CHECK (type IN ('ADS', 'SEMINAR', 'TELESALES', 'REFERRAL', 'SOCIAL_ZALO', 'EVENT', 'OTHER')),
        status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PLANNED', 'ACTIVE', 'ENDED')),
        channel       text,
        start_date    date,
        end_date      date,
        budget_vnd    bigint CHECK (budget_vnd >= 0),
        owner_user_id uuid,
        notes         text,
        -- CMP-2: a seminar's date, time and place
        event_at      timestamptz,
        location      text,
        -- CMP-4: the public lead form; its slug is unique across the platform
        public_form   jsonb,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT campaigns_tenant_id_id_key UNIQUE (tenant_id, id)
      );
      CREATE UNIQUE INDEX campaigns_name_key ON campaigns (tenant_id, name);
      CREATE UNIQUE INDEX campaigns_form_slug_key ON campaigns ((public_form ->> 'slug'))
        WHERE public_form ->> 'slug' IS NOT NULL;

      -- OPT-1: a GA's lead catalogue
      CREATE TABLE lead_options (
        id             uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id      uuid NOT NULL REFERENCES tenants (id),
        kind           text NOT NULL CHECK (kind IN ('interest', 'care_status', 'source')),
        -- What leads store. Never changes, so renaming keeps every lead's value (OPT-3)
        code           text NOT NULL,
        label          text NOT NULL CHECK (btrim(label) <> ''),
        -- OPT-4: the label without case or marks, so near-duplicates collide
        label_norm     text NOT NULL,
        is_opportunity boolean NOT NULL DEFAULT false,
        is_final       boolean NOT NULL DEFAULT false,
        active         boolean NOT NULL DEFAULT true,
        sort_order     integer NOT NULL,
        built_in       boolean NOT NULL DEFAULT false,
        created_at     timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX lead_options_code_key ON lead_options (tenant_id, kind, code);
      CREATE UNIQUE INDEX lead_options_label_key ON lead_options (tenant_id, kind, label_norm);

      -- Section 18.4. updated_at is set by the code, never by a trigger: it is the time of the last
      -- change to the lead's data, and the import rule compares against it (IMP-26).
      CREATE TABLE leads (
        id                  uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id           uuid NOT NULL REFERENCES tenants (id),
        external_id         text,
        full_name           text NOT NULL,
        name_norm           text NOT NULL,
        -- DATA-4 + LEAD-1: one lead per phone in a tenant; a deleted lead frees it (LEAD-40)
        phone               text NOT NULL,
        email               text,
        gender              text,
        dob                 text,
        age                 integer,
        province            text,
        region              text,
        source              text NOT NULL,
        phone_source        text,
        campaign_id         uuid,
        -- LEAD-5: never changes after creation
        lead_date           date NOT NULL,
        registered_at       text,
        product_interest    text,
        product_secondary   text,
        value_vnd           bigint,
        ref_link            text,
        extra_info          text,
        stage               text NOT NULL
                            CHECK (stage IN ('NEW', 'CONTACTED', 'APPOINTMENT', 'MET', 'PROPOSAL', 'SUBMITTED', 'ISSUED', 'LOST')),
        interest            text,
        care_status         text,
        lost_reason         text,
        -- PDP-2: may hold health details the agent wrote down; never sent to AI
        progress_note       text,
        message_status      text,
        origin              text NOT NULL CHECK (origin IN ('GA', 'IMPORT', 'FC_OWN', 'PUBLIC_FORM', 'REFERRAL')),
        assigned_agent_code text,
        assigned_by         uuid,
        assigned_at         timestamptz,
        assignee_seen_at    timestamptz,
        assignee_viewed_at  timestamptz,
        last_comment_at     timestamptz,
        last_comment_by     uuid,
        first_contact_at    timestamptz,
        last_contact_at     timestamptz,
        next_action_at      timestamptz,
        consent_marketing   boolean NOT NULL,
        consent_at          timestamptz,
        consent_source      text,
        consent_ip_hash     text,
        application_no      text,
        policy_no           text,
        -- LEAD-32: the client this lead became, once someone confirmed it
        client_code         text,
        link_status         text CHECK (link_status IN ('NONE', 'CONFIRMED')),
        linked_by           uuid,
        linked_at           timestamptz,
        created_by          uuid,
        created_at          timestamptz NOT NULL,
        updated_at          timestamptz NOT NULL,
        last_import_id      uuid,
        -- LEAD-40: soft delete. The phone moves to deleted_phone so a new lead may take the number
        deleted_at          timestamptz,
        deleted_by          uuid,
        delete_reason       text,
        deleted_phone       text,
        -- LEAD-41: the lead this one was merged into
        merged_into         uuid,
        -- PDP-6: personal fields erased on request
        erased_at           timestamptz,
        CONSTRAINT leads_tenant_id_id_key UNIQUE (tenant_id, id),
        FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns (tenant_id, id)
      );
      CREATE UNIQUE INDEX leads_phone_key ON leads (tenant_id, phone);
      -- LEAD-32: a client is linked to one lead at most
      CREATE UNIQUE INDEX leads_client_link_key ON leads (tenant_id, client_code)
        WHERE link_status = 'CONFIRMED';
      CREATE INDEX leads_assignee_idx ON leads (tenant_id, assigned_agent_code, care_status)
        WHERE deleted_at IS NULL;
      CREATE INDEX leads_lead_date_idx ON leads (tenant_id, lead_date) WHERE deleted_at IS NULL;
      CREATE INDEX leads_assigned_at_idx ON leads (tenant_id, assigned_at) WHERE deleted_at IS NULL;
      CREATE INDEX leads_campaign_idx ON leads (tenant_id, campaign_id);
      CREATE INDEX leads_deleted_idx ON leads (tenant_id, deleted_at) WHERE deleted_at IS NOT NULL;
      -- Search by any part of a name (DATA-5 normalised) or a phone
      CREATE INDEX leads_name_trgm_idx ON leads USING gin (name_norm gin_trgm_ops);
      CREATE INDEX leads_phone_trgm_idx ON leads USING gin (phone gin_trgm_ops);

      -- CMP-2: a lead taking part in a seminar
      CREATE TABLE campaign_members (
        id          uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id   uuid NOT NULL REFERENCES tenants (id),
        campaign_id uuid NOT NULL,
        lead_id     uuid NOT NULL,
        status      text NOT NULL CHECK (status IN ('INVITED', 'REGISTERED', 'ATTENDED', 'NO_SHOW')),
        updated_by  uuid,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns (tenant_id, id),
        FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX campaign_members_key ON campaign_members (tenant_id, campaign_id, lead_id);
      CREATE INDEX campaign_members_lead_idx ON campaign_members (tenant_id, lead_id);

      -- LEAD-20
      CREATE TABLE lead_history (
        id         uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id  uuid NOT NULL REFERENCES tenants (id),
        lead_id    uuid NOT NULL,
        field      text NOT NULL,
        old_value  text,
        new_value  text,
        note       text,
        import_id  uuid,
        changed_by uuid NOT NULL,
        changed_at timestamptz NOT NULL,
        FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id) ON DELETE CASCADE
      );
      CREATE INDEX lead_history_lead_idx ON lead_history (tenant_id, lead_id, changed_at);
      CREATE INDEX lead_history_field_idx ON lead_history (tenant_id, field, new_value, changed_at);

      -- NOTE-1..8: notes and contacts, on a lead or on a client
      CREATE TABLE interactions (
        id          uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id   uuid NOT NULL REFERENCES tenants (id),
        agent_code  text,
        lead_id     uuid,
        client_code text,
        type        text NOT NULL CHECK (type IN ('NOTE', 'CALL', 'ZALO', 'MEETING', 'SEMINAR')),
        outcome     text,
        note        text NOT NULL,
        occurred_at timestamptz NOT NULL,
        source      text NOT NULL DEFAULT 'APP' CHECK (source IN ('APP', 'IMPORT', 'FORM')),
        -- NOTE-8: when the author last changed the text
        edited_at   timestamptz,
        -- NOTE-6: the note written when the lead was created
        initial     boolean NOT NULL DEFAULT false,
        -- Empty for an entry the public form wrote (CMP-4)
        created_by  uuid,
        created_at  timestamptz NOT NULL,
        CHECK (lead_id IS NOT NULL OR client_code IS NOT NULL),
        FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id) ON DELETE CASCADE
      );
      CREATE INDEX interactions_lead_idx ON interactions (tenant_id, lead_id, occurred_at);
      CREATE INDEX interactions_client_idx ON interactions (tenant_id, client_code, occurred_at);
      CREATE INDEX interactions_agent_idx ON interactions (tenant_id, agent_code, type, occurred_at);

      -- CMT-1 + CMT-5: a comment is on a lead or on a client
      CREATE TABLE comments (
        id             uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id      uuid NOT NULL REFERENCES tenants (id),
        lead_id        uuid,
        client_code    text,
        author_user_id uuid NOT NULL,
        body           text NOT NULL,
        mentions       uuid[],
        created_at     timestamptz NOT NULL,
        CHECK (lead_id IS NOT NULL OR client_code IS NOT NULL),
        FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id) ON DELETE CASCADE
      );
      CREATE INDEX comments_lead_idx ON comments (tenant_id, lead_id, created_at);
      CREATE INDEX comments_client_idx ON comments (tenant_id, client_code, created_at);

      -- TASK-1: a task belongs to a lead, to a client, or (with neither) to the person who made it
      CREATE TABLE tasks (
        id                  uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id           uuid NOT NULL REFERENCES tenants (id),
        lead_id             uuid,
        client_code         text,
        -- SIG-2: the signal a task was made from
        signal              text,
        agent_code          text,
        title               text NOT NULL,
        due_at              timestamptz NOT NULL,
        status              text NOT NULL CHECK (status IN ('OPEN', 'DONE', 'CANCELLED')),
        source              text NOT NULL CHECK (source IN ('APP', 'AUTO_ASSIGN', 'NEXT_ACTION', 'SIGNAL')),
        done_at             timestamptz,
        done_by             uuid,
        -- LEAD-40: cancelled because its lead was deleted; reopened if the lead is restored
        suspended_by_delete boolean,
        created_by          uuid NOT NULL,
        created_at          timestamptz NOT NULL,
        FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id) ON DELETE CASCADE
      );
      CREATE INDEX tasks_lead_idx ON tasks (tenant_id, lead_id);
      CREATE INDEX tasks_agent_idx ON tasks (tenant_id, agent_code, status, due_at);
      CREATE INDEX tasks_creator_idx ON tasks (tenant_id, created_by, status, due_at);
      CREATE INDEX tasks_client_idx ON tasks (tenant_id, client_code);

      -- LEAD-38: a lead-list filter a user saved for themself
      CREATE TABLE saved_filters (
        id         uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id  uuid NOT NULL REFERENCES tenants (id),
        user_id    uuid NOT NULL,
        screen     text NOT NULL DEFAULT 'leads',
        name       text NOT NULL,
        query      jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
      );
      CREATE UNIQUE INDEX saved_filters_name_key ON saved_filters (tenant_id, user_id, screen, name);

      -- Section 18.7. data holds counts and ids, never a name or a phone (NTF-4)
      CREATE TABLE notifications (
        id         uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id  uuid NOT NULL REFERENCES tenants (id),
        user_id    uuid NOT NULL,
        type       text NOT NULL,
        data       jsonb NOT NULL DEFAULT '{}',
        link       text NOT NULL,
        read_at    timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
      );
      CREATE INDEX notifications_user_idx ON notifications (tenant_id, user_id, created_at DESC);
      CREATE INDEX notifications_unread_idx ON notifications (tenant_id, user_id) WHERE read_at IS NULL;
      CREATE INDEX notifications_created_idx ON notifications (created_at);

      -- A reminder the scheduler already sent, so it goes out once even when a round runs again
      CREATE TABLE notice_keys (
        tenant_id  uuid NOT NULL REFERENCES tenants (id),
        key        text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, key)
      );
      CREATE INDEX notice_keys_created_idx ON notice_keys (created_at);

      CREATE TRIGGER campaigns_touch BEFORE UPDATE ON campaigns
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
    `);
    for (const table of TENANT_TABLES)
      await db.query(`
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON ${table}
          USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
        GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO crm_app, crm_platform;
      `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`DROP TABLE ${[...TENANT_TABLES].reverse().join(', ')}`);
  }
}
