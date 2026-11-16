#!/bin/sh
# Runs once, when the data volume is created. Roles are cluster-wide, so every database
# (ga_crm, ga_crm_test, load-test ones) shares them. Migrations run as the owner (POSTGRES_USER).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$PG_APP_PASSWORD" -v platform_password="$PG_PLATFORM_PASSWORD" <<'SQL'
-- TEN-1: the API's everyday role. Not an owner and no BYPASSRLS, so row-level security always applies.
CREATE ROLE crm_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'app_password';
-- TEN-6: sign-in, session lookup, invites and audited platform reads. Kept apart so code must ask for it.
CREATE ROLE crm_platform LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS PASSWORD :'platform_password';
SQL
