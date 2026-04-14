-- =========================================================
-- PUI SaaS Multitenant Base Schema v2
-- PostgreSQL 14+
-- Ajustado para PUI con RLS, RBAC completo,
-- trazabilidad, soporte a JWT corto y secretos versionados.
--
-- NOTAS DE IMPLEMENTACION:
-- 1) Tu app debe setear por request:
--      set local app.user_id   = '<uuid-del-usuario>';
--      set local app.tenant_id = '<uuid-del-tenant>';
-- 2) El usuario global platform_owner debe existir en users con:
--      is_global = true
--      tenant_id = null
-- 3) No guardes biometricos en claro. Guarda rutas/objetos cifrados.
-- 4) La validacion fuerte de passwords va en backend.
-- =========================================================

begin;

create extension if not exists pgcrypto;

create schema if not exists app;

-- =========================================================
-- ENUMS
-- =========================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tenant_status_enum') then
    create type tenant_status_enum as enum ('onboarding', 'active', 'suspended', 'disabled');
  end if;

  if not exists (select 1 from pg_type where typname = 'integration_environment_enum') then
    create type integration_environment_enum as enum ('sandbox', 'qa', 'production');
  end if;

  if not exists (select 1 from pg_type where typname = 'integration_type_enum') then
    create type integration_type_enum as enum ('standard', 'api', 'db_direct', 'legacy', 'multi_site', 'multi_system');
  end if;

  if not exists (select 1 from pg_type where typname = 'contact_type_enum') then
    create type contact_type_enum as enum ('legal', 'technical', 'security', 'operations', 'billing');
  end if;

  if not exists (select 1 from pg_type where typname = 'address_type_enum') then
    create type address_type_enum as enum ('fiscal', 'operational', 'notifications');
  end if;

  if not exists (select 1 from pg_type where typname = 'user_status_enum') then
    create type user_status_enum as enum ('pending', 'active', 'blocked', 'disabled');
  end if;

  if not exists (select 1 from pg_type where typname = 'role_scope_enum') then
    create type role_scope_enum as enum ('global', 'tenant');
  end if;

  if not exists (select 1 from pg_type where typname = 'mfa_factor_type_enum') then
    create type mfa_factor_type_enum as enum ('totp', 'webauthn', 'backup_code');
  end if;

  if not exists (select 1 from pg_type where typname = 'factor_status_enum') then
    create type factor_status_enum as enum ('active', 'revoked', 'pending');
  end if;

  if not exists (select 1 from pg_type where typname = 'endpoint_code_enum') then
    create type endpoint_code_enum as enum (
      'login',
      'activar_reporte',
      'activar_reporte_prueba',
      'desactivar_reporte',
      'notificar_coincidencia',
      'busqueda_finalizada'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'http_method_enum') then
    create type http_method_enum as enum ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_origin_enum') then
    create type report_origin_enum as enum ('production', 'test');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_status_enum') then
    create type report_status_enum as enum ('active', 'closed', 'cancelled', 'error');
  end if;

  if not exists (select 1 from pg_type where typname = 'phase_status_enum') then
    create type phase_status_enum as enum ('pending', 'processing', 'completed', 'error', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'search_phase_enum') then
    create type search_phase_enum as enum ('1', '2', '3');
  end if;

  if not exists (select 1 from pg_type where typname = 'search_type_enum') then
    create type search_type_enum as enum ('basic_data', 'historical', 'continuous');
  end if;

  if not exists (select 1 from pg_type where typname = 'job_trigger_enum') then
    create type job_trigger_enum as enum ('activation', 'cron', 'retry', 'resync', 'manual');
  end if;

  if not exists (select 1 from pg_type where typname = 'execution_status_enum') then
    create type execution_status_enum as enum ('queued', 'running', 'completed', 'error', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_status_enum') then
    create type notification_status_enum as enum ('pending', 'sent', 'acknowledged', 'error');
  end if;

  if not exists (select 1 from pg_type where typname = 'direction_enum') then
    create type direction_enum as enum ('inbound', 'outbound');
  end if;

  if not exists (select 1 from pg_type where typname = 'actor_type_enum') then
    create type actor_type_enum as enum ('system', 'user', 'pui');
  end if;

  if not exists (select 1 from pg_type where typname = 'data_source_type_enum') then
    create type data_source_type_enum as enum ('postgres', 'mysql', 'sqlserver', 'oracle', 'api_rest', 'sftp', 'csv', 'legacy');
  end if;

  if not exists (select 1 from pg_type where typname = 'sync_status_enum') then
    create type sync_status_enum as enum ('idle', 'running', 'ok', 'error', 'disabled');
  end if;

  if not exists (select 1 from pg_type where typname = 'credential_kind_enum') then
    create type credential_kind_enum as enum ('integration_secret', 'biometric_secret', 'source_secret');
  end if;
end $$;

-- =========================================================
-- SECURITY / MASTER
-- =========================================================

create table if not exists platform_security_policies (
  id uuid primary key default gen_random_uuid(),
  code varchar(100) not null unique,
  name varchar(200) not null,
  min_password_length smallint not null default 14,
  max_password_length smallint not null default 128,
  require_uppercase boolean not null default true,
  require_lowercase boolean not null default true,
  require_number boolean not null default true,
  require_special boolean not null default true,
  password_history_count smallint not null default 5,
  max_failed_login_attempts smallint not null default 5,
  lock_minutes integer not null default 15,
  admin_mfa_required boolean not null default true,
  session_idle_timeout_minutes integer not null default 30,
  session_absolute_timeout_minutes integer not null default 720,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_policy_password_lengths check (min_password_length <= max_password_length)
);

insert into platform_security_policies (
  code,
  name,
  min_password_length,
  max_password_length,
  require_uppercase,
  require_lowercase,
  require_number,
  require_special,
  password_history_count,
  max_failed_login_attempts,
  lock_minutes,
  admin_mfa_required,
  session_idle_timeout_minutes,
  session_absolute_timeout_minutes,
  is_default
)
values (
  'base_secure',
  'Base Secure',
  14,
  128,
  true,
  true,
  true,
  true,
  5,
  5,
  15,
  true,
  30,
  720,
  true
)
on conflict (code) do nothing;

-- =========================================================
-- TENANTS
-- =========================================================

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) not null unique,
  rfc varchar(13) not null unique,
  business_name varchar(255) not null,
  trade_name varchar(255),
  business_line varchar(255),
  integration_type integration_type_enum not null default 'standard',
  status tenant_status_enum not null default 'onboarding',
  security_policy_id uuid references platform_security_policies(id),
  registered_via_llavemx boolean not null default false,
  pui_registered boolean not null default false,
  notes varchar(500),
  activated_at timestamptz,
  suspended_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_tenants_rfc_format check (rfc ~ '^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$')
);

create index if not exists idx_tenants_status on tenants(status);
create index if not exists idx_tenants_integration_type on tenants(integration_type);

create table if not exists tenant_addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  address_type address_type_enum not null,
  street varchar(255),
  exterior_number varchar(50),
  interior_number varchar(50),
  neighborhood varchar(150),
  municipality varchar(150),
  state varchar(150),
  postal_code varchar(10),
  country varchar(100) not null default 'México',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_addresses_tenant on tenant_addresses(tenant_id);
create unique index if not exists ux_tenant_addresses_primary
  on tenant_addresses(tenant_id, address_type)
  where is_primary = true;

create table if not exists tenant_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_type contact_type_enum not null,
  first_name varchar(100) not null,
  last_name varchar(100),
  middle_name varchar(100),
  email varchar(255) not null,
  phone varchar(30),
  position_title varchar(150),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create index if not exists idx_tenant_contacts_tenant on tenant_contacts(tenant_id);
create index if not exists idx_tenant_contacts_type on tenant_contacts(tenant_id, contact_type);
create unique index if not exists ux_tenant_contacts_primary
  on tenant_contacts(tenant_id, contact_type)
  where is_primary = true;

create table if not exists tenant_llavemx_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  legal_representative_full_name varchar(255),
  legal_representative_curp varchar(18),
  legal_entity_rfc varchar(13),
  efirma_serial_number varchar(100),
  efirma_expires_at date,
  moral_profile_confirmed boolean not null default false,
  llavemx_account_email varchar(255),
  registration_folio varchar(100),
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_llavemx_curp_format
    check (legal_representative_curp is null or legal_representative_curp ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$')
);

-- =========================================================
-- USERS / RBAC
-- =========================================================

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  email varchar(255) not null unique,
  username varchar(100) not null unique,
  first_name varchar(100) not null,
  last_name varchar(100),
  middle_name varchar(100),
  phone varchar(30),
  is_global boolean not null default false,
  status user_status_enum not null default 'pending',
  must_change_password boolean not null default true,
  mfa_enabled boolean not null default false,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  password_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_users_scope
    check (
      (is_global = true and tenant_id is null) or
      (is_global = false and tenant_id is not null)
    )
);

create index if not exists idx_users_tenant on users(tenant_id);
create index if not exists idx_users_status on users(status);
create index if not exists idx_users_global on users(is_global);

create table if not exists user_password_credentials (
  user_id uuid primary key references users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  password_hash text not null,
  password_algorithm varchar(50) not null default 'argon2id',
  hash_memory_cost integer,
  hash_time_cost integer,
  hash_parallelism integer,
  pepper_version varchar(50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_password_credentials_tenant on user_password_credentials(tenant_id);

create table if not exists user_password_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  password_hash text not null,
  password_algorithm varchar(50) not null default 'argon2id',
  created_at timestamptz not null default now()
);

create index if not exists idx_user_password_history_user on user_password_history(user_id, created_at desc);
create index if not exists idx_user_password_history_tenant on user_password_history(tenant_id, created_at desc);

create table if not exists user_mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  factor_type mfa_factor_type_enum not null,
  factor_label varchar(100),
  secret_ciphertext text,
  secret_key_id varchar(150),
  status factor_status_enum not null default 'pending',
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  last_used_at timestamptz
);

create index if not exists idx_user_mfa_factors_user on user_mfa_factors(user_id);
create index if not exists idx_user_mfa_factors_status on user_mfa_factors(user_id, status);
create index if not exists idx_user_mfa_factors_tenant on user_mfa_factors(tenant_id);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  scope role_scope_enum not null,
  code varchar(100) not null unique,
  name varchar(150) not null,
  description varchar(500),
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  code varchar(150) not null unique,
  module varchar(100) not null,
  action varchar(100) not null,
  description varchar(500)
);

create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_roles_user on user_roles(user_id);
create index if not exists idx_user_roles_role on user_roles(role_id);
create index if not exists idx_user_roles_tenant on user_roles(tenant_id);
create unique index if not exists ux_user_roles_global on user_roles(user_id, role_id) where tenant_id is null;
create unique index if not exists ux_user_roles_tenant on user_roles(user_id, role_id, tenant_id) where tenant_id is not null;

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  idle_expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason varchar(255),
  ip_address inet,
  user_agent varchar(500),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_sessions_user on user_sessions(user_id);
create index if not exists idx_user_sessions_tenant on user_sessions(tenant_id);
create index if not exists idx_user_sessions_expires on user_sessions(expires_at);

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip inet,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_tokens_user on password_reset_tokens(user_id, created_at desc);
create index if not exists idx_password_reset_tokens_tenant on password_reset_tokens(tenant_id, created_at desc);

-- =========================================================
-- PUI INTEGRATION CONFIG
-- =========================================================

create table if not exists tenant_pui_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  environment integration_environment_enum not null,
  institution_base_url varchar(500) not null,
  pui_base_url varchar(500),
  institution_public_ip inet,
  pui_username varchar(3) not null default 'PUI',
  auth_enabled boolean not null default true,
  jwt_enabled boolean not null default true,
  tls_enabled boolean not null default true,
  ip_allowlist_enabled boolean not null default false,
  active boolean not null default false,
  credential_status varchar(50) not null default 'pending',
  last_connectivity_test_at timestamptz,
  last_functional_test_at timestamptz,
  last_security_validation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, environment),
  constraint chk_pui_username_fixed check (pui_username = 'PUI')
);

create index if not exists idx_tenant_pui_integrations_tenant on tenant_pui_integrations(tenant_id);
create index if not exists idx_tenant_pui_integrations_env on tenant_pui_integrations(environment);

create table if not exists tenant_secret_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tenant_pui_integration_id uuid references tenant_pui_integrations(id) on delete cascade,
  credential_kind credential_kind_enum not null,
  version_number integer not null,
  ciphertext text not null,
  key_reference varchar(255) not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  rotates_at timestamptz,
  revoked_at timestamptz,
  unique (tenant_id, credential_kind, version_number)
);

create index if not exists idx_tenant_secret_versions_lookup
  on tenant_secret_versions(tenant_id, credential_kind, is_current);
create unique index if not exists ux_tenant_secret_versions_current
  on tenant_secret_versions(tenant_id, credential_kind)
  where is_current = true and revoked_at is null;

create table if not exists tenant_endpoint_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tenant_pui_integration_id uuid not null references tenant_pui_integrations(id) on delete cascade,
  endpoint_code endpoint_code_enum not null,
  http_method http_method_enum not null,
  route_path varchar(255) not null,
  requires_jwt boolean not null default true,
  requires_bearer boolean not null default true,
  timeout_ms integer not null default 15000,
  retry_count smallint not null default 3,
  rate_limit_per_minute integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_pui_integration_id, endpoint_code, http_method)
);

create index if not exists idx_tenant_endpoint_policies_tenant on tenant_endpoint_policies(tenant_id);

create table if not exists pui_api_token_issuances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tenant_pui_integration_id uuid not null references tenant_pui_integrations(id) on delete cascade,
  environment integration_environment_enum not null,
  token_jti varchar(100) not null unique,
  issued_to varchar(50) not null default 'PUI',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason varchar(255),
  last_used_at timestamptz,
  source_ip inet,
  created_at timestamptz not null default now(),
  constraint chk_pui_api_token_validity check (expires_at > issued_at)
);

create index if not exists idx_pui_api_token_issuances_tenant on pui_api_token_issuances(tenant_id, issued_at desc);
create index if not exists idx_pui_api_token_issuances_jti on pui_api_token_issuances(token_jti);

-- =========================================================
-- SOURCE SYSTEMS / CONNECTORS
-- =========================================================

create table if not exists tenant_data_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code varchar(50) not null,
  name varchar(200) not null,
  source_type data_source_type_enum not null,
  criticality varchar(30),
  active boolean not null default true,
  sync_status sync_status_enum not null default 'idle',
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_tenant_data_sources_tenant on tenant_data_sources(tenant_id);

create table if not exists tenant_data_source_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tenant_data_source_id uuid not null references tenant_data_sources(id) on delete cascade,
  version_number integer not null,
  ciphertext text not null,
  key_reference varchar(255) not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_data_source_id, version_number)
);

create index if not exists idx_tenant_data_source_credentials_tenant on tenant_data_source_credentials(tenant_id);
create unique index if not exists ux_tenant_data_source_credentials_current
  on tenant_data_source_credentials(tenant_data_source_id)
  where is_current = true and revoked_at is null;

create table if not exists tenant_data_source_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tenant_data_source_id uuid not null references tenant_data_sources(id) on delete cascade,
  logical_source_name varchar(150) not null,
  physical_source_name varchar(255) not null,
  primary_key_column varchar(100),
  curp_column varchar(100),
  name_column varchar(100),
  first_last_name_column varchar(100),
  second_last_name_column varchar(100),
  birth_date_column varchar(100),
  event_date_column varchar(100),
  phone_column varchar(100),
  email_column varchar(100),
  street_column varchar(100),
  number_column varchar(100),
  neighborhood_column varchar(100),
  postal_code_column varchar(100),
  municipality_column varchar(100),
  state_column varchar(100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_data_source_mappings_tenant on tenant_data_source_mappings(tenant_id);

create table if not exists tenant_field_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tenant_data_source_id uuid not null references tenant_data_sources(id) on delete cascade,
  source_field varchar(100) not null,
  target_field varchar(100) not null,
  transform_rule varchar(255),
  required boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_data_source_id, source_field, target_field)
);

create index if not exists idx_tenant_field_mappings_tenant on tenant_field_mappings(tenant_id);

-- =========================================================
-- PUI REPORTS / CASES
-- =========================================================

create table if not exists pui_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tenant_pui_integration_id uuid not null references tenant_pui_integrations(id) on delete cascade,
  pui_search_id varchar(75) not null,
  fub varchar(50),
  investigation_case_number varchar(100),
  curp varchar(18) not null,
  first_name varchar(100),
  first_last_name varchar(100),
  second_last_name varchar(100),
  birth_date date,
  birth_place varchar(150),
  assigned_sex varchar(1),
  phone varchar(30),
  email varchar(255),
  full_address varchar(255),
  street varchar(150),
  street_number varchar(50),
  neighborhood varchar(150),
  postal_code varchar(10),
  municipality_or_borough varchar(150),
  state varchar(150),
  disappearance_date date,
  activation_date timestamptz,
  deactivation_date timestamptz,
  origin report_origin_enum not null default 'production',
  status report_status_enum not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, pui_search_id),
  constraint chk_pui_reports_curp_format
    check (curp ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$')
);

create index if not exists idx_pui_reports_tenant_status on pui_reports(tenant_id, status);
create index if not exists idx_pui_reports_tenant_curp on pui_reports(tenant_id, curp);
create index if not exists idx_pui_reports_tenant_origin on pui_reports(tenant_id, origin);

create table if not exists pui_report_phase_status (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pui_report_id uuid not null references pui_reports(id) on delete cascade,
  phase search_phase_enum not null,
  status phase_status_enum not null default 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  last_error_code varchar(50),
  last_error_message varchar(500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pui_report_id, phase)
);

create index if not exists idx_pui_report_phase_status_tenant on pui_report_phase_status(tenant_id, phase, status);

create table if not exists pui_report_deactivations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pui_report_id uuid not null references pui_reports(id) on delete cascade,
  reason varchar(255),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_pui_report_deactivations_tenant on pui_report_deactivations(tenant_id, requested_at desc);

-- =========================================================
-- SEARCHES / MATCHES
-- =========================================================

create table if not exists executed_searches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pui_report_id uuid not null references pui_reports(id) on delete cascade,
  phase search_phase_enum not null,
  search_type search_type_enum not null,
  trigger_source job_trigger_enum not null,
  date_from timestamptz,
  date_to timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status execution_status_enum not null default 'queued',
  total_records_scanned bigint not null default 0,
  total_matches bigint not null default 0,
  engine_version varchar(100),
  created_at timestamptz not null default now()
);

create index if not exists idx_executed_searches_tenant_report on executed_searches(tenant_id, pui_report_id);
create index if not exists idx_executed_searches_tenant_phase on executed_searches(tenant_id, phase, status);

create table if not exists pui_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pui_report_id uuid not null references pui_reports(id) on delete cascade,
  executed_search_id uuid not null references executed_searches(id) on delete cascade,
  phase search_phase_enum not null,
  curp varchar(18),
  first_name varchar(100),
  first_last_name varchar(100),
  second_last_name varchar(100),
  birth_date date,
  birth_place varchar(150),
  assigned_sex varchar(1),
  phone varchar(30),
  email varchar(255),
  street varchar(150),
  street_number varchar(50),
  neighborhood varchar(150),
  postal_code varchar(10),
  municipality_or_borough varchar(150),
  state varchar(150),
  event_type varchar(500),
  event_date timestamptz,
  event_place_description varchar(500),
  event_address varchar(500),
  source_system varchar(150),
  match_detected_at timestamptz not null default now(),
  notified_to_pui_at timestamptz,
  notification_status notification_status_enum not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists idx_pui_matches_tenant_report on pui_matches(tenant_id, pui_report_id);
create index if not exists idx_pui_matches_notification_status on pui_matches(tenant_id, notification_status);
create index if not exists idx_pui_matches_curp on pui_matches(tenant_id, curp);

create table if not exists pui_match_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pui_match_id uuid not null references pui_matches(id) on delete cascade,
  sequence_number integer not null default 1,
  encrypted_storage_path varchar(500) not null,
  file_format varchar(20),
  sha256_hash char(64),
  created_at timestamptz not null default now(),
  unique (pui_match_id, sequence_number)
);

create index if not exists idx_pui_match_photos_tenant on pui_match_photos(tenant_id);

create table if not exists pui_match_fingerprints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pui_match_id uuid not null references pui_matches(id) on delete cascade,
  fingerprint_label varchar(20) not null,
  fingerprint_description varchar(150),
  encrypted_storage_path varchar(500) not null,
  file_format varchar(20),
  sha256_hash char(64),
  created_at timestamptz not null default now(),
  unique (pui_match_id, fingerprint_label)
);

create index if not exists idx_pui_match_fingerprints_tenant on pui_match_fingerprints(tenant_id);

-- =========================================================
-- CONTINUOUS SEARCH / JOBS / RESYNC
-- =========================================================

create table if not exists scheduled_search_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pui_report_id uuid not null references pui_reports(id) on delete cascade,
  phase search_phase_enum not null,
  frequency_minutes integer not null,
  next_run_at timestamptz,
  last_run_at timestamptz,
  status execution_status_enum not null default 'queued',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pui_report_id, phase)
);

create index if not exists idx_scheduled_search_jobs_next_run on scheduled_search_jobs(active, next_run_at);

create table if not exists job_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  scheduled_search_job_id uuid references scheduled_search_jobs(id) on delete cascade,
  pui_report_id uuid references pui_reports(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status execution_status_enum not null default 'running',
  processed_records bigint not null default 0,
  matched_records bigint not null default 0,
  error_code varchar(50),
  error_message varchar(500),
  created_at timestamptz not null default now()
);

create index if not exists idx_job_executions_tenant on job_executions(tenant_id, status);

create table if not exists resync_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pui_report_id uuid not null references pui_reports(id) on delete cascade,
  reason varchar(255) not null,
  date_from timestamptz,
  date_to timestamptz,
  status execution_status_enum not null default 'queued',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_resync_tasks_tenant on resync_tasks(tenant_id, status);

-- =========================================================
-- AUDIT / TRACEABILITY
-- =========================================================

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  actor_type actor_type_enum not null,
  module varchar(100) not null,
  action varchar(100) not null,
  resource_type varchar(100) not null,
  resource_id varchar(100),
  result varchar(50) not null,
  ip_address inet,
  user_agent varchar(500),
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_tenant_created on audit_events(tenant_id, created_at desc);
create index if not exists idx_audit_events_user_created on audit_events(user_id, created_at desc);

create table if not exists integration_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tenant_pui_integration_id uuid not null references tenant_pui_integrations(id) on delete cascade,
  direction direction_enum not null,
  endpoint_code endpoint_code_enum not null,
  http_method http_method_enum not null,
  request_identifier varchar(100),
  http_status integer,
  remote_ip inet,
  jwt_valid boolean,
  signature_valid boolean,
  received_at timestamptz not null default now(),
  responded_at timestamptz,
  duration_ms integer,
  error_code varchar(50),
  error_summary varchar(500),
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_requests_tenant on integration_requests(tenant_id, received_at desc);
create index if not exists idx_integration_requests_endpoint on integration_requests(tenant_id, endpoint_code, received_at desc);

create table if not exists integration_request_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  integration_request_id uuid not null references integration_requests(id) on delete cascade,
  field_name varchar(100) not null,
  field_value_redacted varchar(1000),
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_request_fields_request on integration_request_fields(integration_request_id);
create index if not exists idx_integration_request_fields_tenant on integration_request_fields(tenant_id);

create table if not exists source_query_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pui_report_id uuid references pui_reports(id) on delete cascade,
  executed_search_id uuid references executed_searches(id) on delete cascade,
  tenant_data_source_id uuid references tenant_data_sources(id) on delete set null,
  source_name varchar(150),
  query_type varchar(50),
  primary_filter varchar(255),
  affected_rows bigint,
  executed_at timestamptz not null default now(),
  duration_ms integer
);

create index if not exists idx_source_query_audit_tenant on source_query_audit(tenant_id, executed_at desc);

-- =========================================================
-- OPTIONAL: BIOMETRIC ACCESS CONTROL
-- =========================================================

create table if not exists biometric_access_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  pui_match_id uuid references pui_matches(id) on delete set null,
  access_type varchar(50) not null,
  justification varchar(500),
  ip_address inet,
  created_at timestamptz not null default now()
);

create index if not exists idx_biometric_access_events_tenant on biometric_access_events(tenant_id, created_at desc);

-- =========================================================
-- SUPPORT / BREAK GLASS
-- =========================================================

create table if not exists support_access_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  granted_to_user_id uuid not null references users(id) on delete cascade,
  granted_by_user_id uuid not null references users(id) on delete cascade,
  reason varchar(500) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint chk_support_access_window check (ends_at > starts_at)
);

create index if not exists idx_support_access_grants_tenant on support_access_grants(tenant_id, active, ends_at);

-- =========================================================
-- SEED: BASE ROLES
-- =========================================================

insert into roles (code, scope, name, description, is_system)
values
  ('platform_owner', 'global', 'Platform Owner', 'Acceso total a toda la plataforma', true),
  ('platform_security_admin', 'global', 'Platform Security Admin', 'Administra seguridad global', true),
  ('platform_ops', 'global', 'Platform Operations', 'Operación y monitoreo global', true),
  ('tenant_owner', 'tenant', 'Tenant Owner', 'Administrador principal del tenant', true),
  ('tenant_security_admin', 'tenant', 'Tenant Security Admin', 'Administra seguridad del tenant', true),
  ('tenant_operator', 'tenant', 'Tenant Operator', 'Operación diaria del tenant', true),
  ('tenant_auditor', 'tenant', 'Tenant Auditor', 'Solo lectura de evidencia y auditoría', true),
  ('support_scoped', 'global', 'Support Scoped', 'Acceso temporal y restringido', true)
on conflict (code) do nothing;

-- =========================================================
-- SEED: BASE PERMISSIONS
-- =========================================================

insert into permissions (code, module, action, description)
values
  ('platform.tenants.read', 'platform', 'read', 'Ver todos los tenants'),
  ('platform.tenants.write', 'platform', 'write', 'Crear, actualizar o suspender tenants'),
  ('platform.users.read', 'platform', 'read', 'Ver usuarios globales y cross-tenant'),
  ('platform.users.write', 'platform', 'write', 'Administrar usuarios globales'),
  ('platform.security.read', 'platform', 'read', 'Ver configuración de seguridad global'),
  ('platform.security.write', 'platform', 'write', 'Administrar políticas de seguridad global'),
  ('platform.audit.read', 'platform', 'read', 'Ver auditoría global'),
  ('platform.support.write', 'platform', 'write', 'Otorgar o revocar soporte temporal'),

  ('tenant.users.read', 'tenant', 'read', 'Ver usuarios del tenant'),
  ('tenant.users.write', 'tenant', 'write', 'Administrar usuarios del tenant'),
  ('tenant.roles.read', 'tenant', 'read', 'Ver roles y asignaciones del tenant'),
  ('tenant.roles.write', 'tenant', 'write', 'Administrar asignaciones del tenant'),
  ('tenant.contacts.read', 'tenant', 'read', 'Ver contactos y direcciones del tenant'),
  ('tenant.contacts.write', 'tenant', 'write', 'Administrar contactos y direcciones del tenant'),
  ('tenant.integrations.read', 'tenant', 'read', 'Ver integración PUI y políticas de endpoint'),
  ('tenant.integrations.write', 'tenant', 'write', 'Administrar integración PUI y políticas de endpoint'),
  ('tenant.credentials.rotate', 'tenant', 'write', 'Rotar secretos del tenant'),
  ('tenant.data_sources.read', 'tenant', 'read', 'Ver orígenes de datos del tenant'),
  ('tenant.data_sources.write', 'tenant', 'write', 'Administrar orígenes de datos del tenant'),
  ('tenant.reports.read', 'tenant', 'read', 'Ver reportes activos PUI'),
  ('tenant.reports.write', 'tenant', 'write', 'Administrar reportes PUI'),
  ('tenant.search.execute', 'tenant', 'execute', 'Ejecutar búsquedas y resincronizaciones'),
  ('tenant.matches.read', 'tenant', 'read', 'Ver coincidencias'),
  ('tenant.matches.write', 'tenant', 'write', 'Gestionar coincidencias y notificaciones'),
  ('tenant.audit.read', 'tenant', 'read', 'Ver auditoría del tenant'),
  ('tenant.biometric.read', 'tenant', 'read', 'Ver biométricos cifrados y eventos asociados'),
  ('tenant.biometric.write', 'tenant', 'write', 'Gestionar accesos a biométricos'),
  ('tenant.support.read', 'tenant', 'read', 'Ver accesos temporales de soporte')
on conflict (code) do nothing;

-- =========================================================
-- SEED: ROLE -> PERMISSIONS
-- =========================================================

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'platform.tenants.read',
  'platform.tenants.write',
  'platform.users.read',
  'platform.users.write',
  'platform.security.read',
  'platform.security.write',
  'platform.audit.read',
  'platform.support.write',
  'tenant.users.read',
  'tenant.users.write',
  'tenant.roles.read',
  'tenant.roles.write',
  'tenant.contacts.read',
  'tenant.contacts.write',
  'tenant.integrations.read',
  'tenant.integrations.write',
  'tenant.credentials.rotate',
  'tenant.data_sources.read',
  'tenant.data_sources.write',
  'tenant.reports.read',
  'tenant.reports.write',
  'tenant.search.execute',
  'tenant.matches.read',
  'tenant.matches.write',
  'tenant.audit.read',
  'tenant.biometric.read',
  'tenant.biometric.write',
  'tenant.support.read'
)
where r.code = 'platform_owner'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'platform.security.read',
  'platform.security.write',
  'platform.audit.read',
  'tenant.audit.read',
  'tenant.biometric.read',
  'tenant.biometric.write'
)
where r.code = 'platform_security_admin'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'platform.tenants.read',
  'platform.users.read',
  'platform.audit.read',
  'tenant.integrations.read',
  'tenant.reports.read',
  'tenant.search.execute',
  'tenant.matches.read',
  'tenant.audit.read'
)
where r.code = 'platform_ops'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'tenant.users.read',
  'tenant.users.write',
  'tenant.roles.read',
  'tenant.roles.write',
  'tenant.contacts.read',
  'tenant.contacts.write',
  'tenant.integrations.read',
  'tenant.integrations.write',
  'tenant.credentials.rotate',
  'tenant.data_sources.read',
  'tenant.data_sources.write',
  'tenant.reports.read',
  'tenant.reports.write',
  'tenant.search.execute',
  'tenant.matches.read',
  'tenant.matches.write',
  'tenant.audit.read',
  'tenant.biometric.read',
  'tenant.biometric.write',
  'tenant.support.read'
)
where r.code = 'tenant_owner'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'tenant.users.read',
  'tenant.roles.read',
  'tenant.integrations.read',
  'tenant.integrations.write',
  'tenant.credentials.rotate',
  'tenant.audit.read',
  'tenant.biometric.read',
  'tenant.biometric.write',
  'tenant.support.read'
)
where r.code = 'tenant_security_admin'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'tenant.contacts.read',
  'tenant.integrations.read',
  'tenant.data_sources.read',
  'tenant.data_sources.write',
  'tenant.reports.read',
  'tenant.reports.write',
  'tenant.search.execute',
  'tenant.matches.read',
  'tenant.matches.write'
)
where r.code = 'tenant_operator'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'tenant.users.read',
  'tenant.roles.read',
  'tenant.contacts.read',
  'tenant.integrations.read',
  'tenant.data_sources.read',
  'tenant.reports.read',
  'tenant.matches.read',
  'tenant.audit.read',
  'tenant.support.read'
)
where r.code = 'tenant_auditor'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'tenant.integrations.read',
  'tenant.reports.read',
  'tenant.matches.read',
  'tenant.audit.read',
  'tenant.support.read'
)
where r.code = 'support_scoped'
on conflict do nothing;

-- =========================================================
-- RLS HELPER FUNCTIONS
-- =========================================================

create or replace function app.current_user_id()
returns uuid
language plpgsql
stable
as $$
declare
  v text;
begin
  v := nullif(current_setting('app.user_id', true), '');
  if v is null then
    return null;
  end if;
  return v::uuid;
exception when others then
  return null;
end;
$$;

create or replace function app.current_tenant_id()
returns uuid
language plpgsql
stable
as $$
declare
  v text;
begin
  v := nullif(current_setting('app.tenant_id', true), '');
  if v is null then
    return null;
  end if;
  return v::uuid;
exception when others then
  return null;
end;
$$;

create or replace function app.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from users u
    join user_roles ur on ur.user_id = u.id
    join roles r on r.id = ur.role_id
    where u.id = app.current_user_id()
      and u.is_global = true
      and r.code = 'platform_owner'
  );
$$;

create or replace function app.has_active_support_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from support_access_grants s
    where s.tenant_id = p_tenant_id
      and s.granted_to_user_id = app.current_user_id()
      and s.active = true
      and now() between s.starts_at and s.ends_at
  );
$$;

create or replace function app.can_access_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if app.is_platform_owner() then
    return true;
  end if;

  if p_tenant_id is null then
    return false;
  end if;

  if app.current_tenant_id() = p_tenant_id then
    return true;
  end if;

  if app.has_active_support_access(p_tenant_id) then
    return true;
  end if;

  return false;
end;
$$;

-- =========================================================
-- ENABLE RLS + GENERIC TENANT POLICIES
-- =========================================================

do $$
declare
  rec record;
begin
  for rec in
    select c.table_schema, c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'tenant_id'
    group by c.table_schema, c.table_name
  loop
    execute format('alter table %I.%I enable row level security;', rec.table_schema, rec.table_name);

    execute format('drop policy if exists %I_select_policy on %I.%I;', rec.table_name, rec.table_schema, rec.table_name);
    execute format('create policy %I_select_policy on %I.%I for select using (app.can_access_tenant(tenant_id));',
      rec.table_name, rec.table_schema, rec.table_name);

    execute format('drop policy if exists %I_insert_policy on %I.%I;', rec.table_name, rec.table_schema, rec.table_name);
    execute format('create policy %I_insert_policy on %I.%I for insert with check (app.can_access_tenant(tenant_id));',
      rec.table_name, rec.table_schema, rec.table_name);

    execute format('drop policy if exists %I_update_policy on %I.%I;', rec.table_name, rec.table_schema, rec.table_name);
    execute format('create policy %I_update_policy on %I.%I for update using (app.can_access_tenant(tenant_id)) with check (app.can_access_tenant(tenant_id));',
      rec.table_name, rec.table_schema, rec.table_name);

    execute format('drop policy if exists %I_delete_policy on %I.%I;', rec.table_name, rec.table_schema, rec.table_name);
    execute format('create policy %I_delete_policy on %I.%I for delete using (app.can_access_tenant(tenant_id));',
      rec.table_name, rec.table_schema, rec.table_name);
  end loop;
end $$;

-- =========================================================
-- TRIGGERS FOR updated_at
-- =========================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  rec record;
begin
  for rec in
    select table_name
    from information_schema.columns
    where column_name = 'updated_at'
      and table_schema = 'public'
  loop
    execute format('
      drop trigger if exists trg_%I_updated_at on %I;
      create trigger trg_%I_updated_at
      before update on %I
      for each row execute function set_updated_at();',
      rec.table_name, rec.table_name, rec.table_name, rec.table_name
    );
  end loop;
end $$;

-- =========================================================
-- BOOTSTRAP SUGERIDO DEL SUPERUSUARIO GLOBAL
-- =========================================================
-- 1) Inserta el usuario global en users con is_global = true y tenant_id = null.
-- 2) Inserta su hash en user_password_credentials con tenant_id = null.
-- 3) Asignale el rol platform_owner en user_roles con tenant_id = null.
-- 4) Activa MFA desde user_mfa_factors.
-- 5) No reutilices este bloque con datos reales dentro del repo.

commit;