BEGIN;

GRANT EXECUTE ON FUNCTION public.panel_leads_list(
    uuid,
    uuid,
    public.lead_categoria,
    uuid,
    timestamptz,
    timestamptz,
    text,
    text,
    text,
    integer,
    integer
) TO postgres, service_role, authenticated;

GRANT EXECUTE ON FUNCTION public.panel_lead_update(
    uuid,
    jsonb,
    jsonb,
    boolean
) TO postgres, service_role, authenticated;

GRANT EXECUTE ON FUNCTION public.panel_lead_move(
    uuid,
    uuid,
    uuid,
    text,
    text,
    jsonb,
    uuid
) TO postgres, service_role, authenticated;

COMMIT;
