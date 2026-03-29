create table if not exists public.openai_projects_catalog (
    project_id text primary key,
    display_name text not null,
    source_kind text not null default 'openai',
    metadata jsonb not null default '{}'::jsonb,
    last_synced_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.openai_assistants_catalog (
    resource_id text primary key,
    resource_kind text not null,
    display_name text not null,
    openai_project_id text null,
    source_kind text not null default 'tenant_config',
    metadata jsonb not null default '{}'::jsonb,
    last_synced_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint openai_assistants_catalog_resource_kind_check
        check (resource_kind in ('assistant', 'prompt'))
);
