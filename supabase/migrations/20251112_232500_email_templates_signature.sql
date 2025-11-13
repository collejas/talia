-- -------------------------------------------------------------
-- Agrega campos para personalizar la firma del correo manual.
-- -------------------------------------------------------------

alter table public.panel_email_templates
    add column if not exists signature_salutation text not null default 'Saludos,',
    add column if not exists signature text not null default 'Equipo Geoactiv · Tal-IA';

update public.panel_email_templates
set
    signature_salutation = coalesce(signature_salutation, 'Saludos,'),
    signature = coalesce(signature, 'Equipo Geoactiv · Tal-IA')
where slug = 'default';
