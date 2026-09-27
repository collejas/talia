-- Propaga la cuenta CRM del contacto a oportunidades y cotizaciones cuando
-- existe una única relación activa. Si hay varias, exige selección explícita.

CREATE OR REPLACE FUNCTION public.crm_resolver_cuenta_unica_contacto(
    p_organizacion_id uuid,
    p_persona_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT CASE
        WHEN count(DISTINCT c.id) = 1 THEN (array_agg(DISTINCT c.id))[1]
        ELSE NULL
    END
    FROM public.cuenta_personas cp
    JOIN public.cuentas c
      ON c.id = cp.cuenta_id
     AND c.organizacion_id = cp.organizacion_id
    WHERE cp.organizacion_id = p_organizacion_id
      AND cp.persona_id = p_persona_id
      AND cp.activo IS TRUE
      AND c.archived_at IS NULL
      AND c.merged_into_cuenta_id IS NULL;
$$;

REVOKE ALL ON FUNCTION public.crm_resolver_cuenta_unica_contacto(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_resolver_cuenta_unica_contacto(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_resolver_cuenta_unica_contacto(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_asignar_cuenta_unica_oportunidad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_persona_id uuid;
BEGIN
    IF NEW.cuenta_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_persona_id := COALESCE(NEW.contacto_principal_id, NEW.persona_id);
    IF v_persona_id IS NOT NULL THEN
        NEW.cuenta_id := public.crm_resolver_cuenta_unica_contacto(
            NEW.organizacion_id,
            v_persona_id
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oportunidades_asignar_cuenta_unica_contacto ON public.oportunidades;
CREATE TRIGGER oportunidades_asignar_cuenta_unica_contacto
BEFORE INSERT OR UPDATE OF cuenta_id, contacto_principal_id, persona_id
ON public.oportunidades
FOR EACH ROW
EXECUTE FUNCTION public.crm_asignar_cuenta_unica_oportunidad();

CREATE OR REPLACE FUNCTION public.crm_propagar_cuenta_oportunidad_cotizaciones()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.cuenta_id IS NOT NULL THEN
        UPDATE public.cotizaciones
           SET cuenta_id = NEW.cuenta_id
         WHERE organizacion_id = NEW.organizacion_id
           AND oportunidad_id = NEW.id
           AND cuenta_id IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oportunidades_propagar_cuenta_cotizaciones ON public.oportunidades;
CREATE TRIGGER oportunidades_propagar_cuenta_cotizaciones
AFTER INSERT OR UPDATE OF cuenta_id
ON public.oportunidades
FOR EACH ROW
EXECUTE FUNCTION public.crm_propagar_cuenta_oportunidad_cotizaciones();

CREATE OR REPLACE FUNCTION public.crm_asignar_cuenta_oportunidad_desde_relacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_organizacion_id uuid;
    v_persona_id uuid;
    v_cuenta_id uuid;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        v_organizacion_id := OLD.organizacion_id;
        v_persona_id := OLD.persona_id;
        v_cuenta_id := public.crm_resolver_cuenta_unica_contacto(v_organizacion_id, v_persona_id);
        UPDATE public.oportunidades
           SET cuenta_id = v_cuenta_id
         WHERE organizacion_id = v_organizacion_id
           AND cuenta_id IS NULL
           AND COALESCE(contacto_principal_id, persona_id) = v_persona_id
           AND v_cuenta_id IS NOT NULL;
    END IF;

    IF TG_OP <> 'DELETE' THEN
        v_organizacion_id := NEW.organizacion_id;
        v_persona_id := NEW.persona_id;
        v_cuenta_id := public.crm_resolver_cuenta_unica_contacto(v_organizacion_id, v_persona_id);
        UPDATE public.oportunidades
           SET cuenta_id = v_cuenta_id
         WHERE organizacion_id = v_organizacion_id
           AND cuenta_id IS NULL
           AND COALESCE(contacto_principal_id, persona_id) = v_persona_id
           AND v_cuenta_id IS NOT NULL;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cuenta_personas_resolver_cuenta_oportunidades ON public.cuenta_personas;
CREATE TRIGGER cuenta_personas_resolver_cuenta_oportunidades
AFTER INSERT OR UPDATE OR DELETE
ON public.cuenta_personas
FOR EACH ROW
EXECUTE FUNCTION public.crm_asignar_cuenta_oportunidad_desde_relacion();

-- Backfill seguro: solo asigna relaciones únicas y nunca reemplaza una cuenta
-- ya seleccionada. El trigger de oportunidad completa las cotizaciones vacías.
UPDATE public.oportunidades o
   SET cuenta_id = public.crm_resolver_cuenta_unica_contacto(
       o.organizacion_id,
       COALESCE(o.contacto_principal_id, o.persona_id)
   )
 WHERE o.cuenta_id IS NULL
   AND COALESCE(o.contacto_principal_id, o.persona_id) IS NOT NULL
   AND public.crm_resolver_cuenta_unica_contacto(
       o.organizacion_id,
       COALESCE(o.contacto_principal_id, o.persona_id)
   ) IS NOT NULL;

UPDATE public.cotizaciones q
   SET cuenta_id = o.cuenta_id
  FROM public.oportunidades o
 WHERE q.organizacion_id = o.organizacion_id
   AND q.oportunidad_id = o.id
   AND q.cuenta_id IS NULL
   AND o.cuenta_id IS NOT NULL;
