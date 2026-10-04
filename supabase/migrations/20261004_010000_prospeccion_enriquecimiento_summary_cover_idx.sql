-- El checklist de Prospectos calcula todos sus indicadores en una sola
-- agregación por organización. Mantener las columnas explícitas en un índice
-- de cobertura evita leer la fila ancha de prospectos para cada apertura.
create index if not exists prospeccion_prospectos_org_enriquecimiento_summary_cover_idx
    on public.prospeccion_prospectos (organizacion_id)
    include (
        phone,
        lookup_status,
        email,
        email_lookup_status,
        website,
        website_lookup_status
    );
