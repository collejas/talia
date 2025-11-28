-- -------------------------------------------------------------
-- Extiende panel_email_templates con banderas para incluir o
-- excluir secciones del correo (summary, highlights, resources).
-- -------------------------------------------------------------

alter table public.panel_email_templates
    add column if not exists use_summary boolean not null default true,
    add column if not exists use_highlights boolean not null default true,
    add column if not exists use_resources boolean not null default true;

update public.panel_email_templates
set
    use_summary = true,
    use_highlights = true,
    use_resources = true
where slug = 'default';
