BEGIN;

ALTER VIEW public.v_asignaciones_vendedores SET (security_invoker = true);

DO $$
BEGIN
    IF to_regclass('public.v_asignaciones_vendedores_whatsapp') IS NOT NULL THEN
        EXECUTE 'ALTER VIEW public.v_asignaciones_vendedores_whatsapp SET (security_invoker = true)';
    END IF;
END $$;

ALTER TABLE public.crm_response_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_response_cache FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.crm_response_cache FROM anon;
REVOKE ALL ON public.crm_response_cache FROM authenticated;

DROP POLICY IF EXISTS crm_response_cache_service_role_all ON public.crm_response_cache;
CREATE POLICY crm_response_cache_service_role_all
    ON public.crm_response_cache
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.normalize_phone_for_dedupe(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
with cleaned as (
  select regexp_replace(coalesce(value, ''), '[^0-9]+', '', 'g') as digits
),
stripped as (
  select case
    when left(digits, 2) = '00' then substring(digits from 3)
    else digits
  end as digits
  from cleaned
)
select case
  when digits = '' then null
  when left(digits, 2) = '52' then
    case
      when length(digits) > 2 and substring(digits from 3 for 1) = '1' then '+' || digits
      when length(digits) > 2 then '+52' || '1' || substring(digits from 3)
      else '+' || digits
    end
  when length(digits) = 10 then '+52' || '1' || digits
  else '+' || digits
end
from stripped;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_persona_id_for_contact(p_organizacion uuid, p_contacto uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
    select coalesce(
        (
            select p.id
            from public.personas p
            where p.organizacion_id = p_organizacion
              and p.id = p_contacto
            limit 1
        ),
        (
            select p.id
            from public.personas p
            where p.organizacion_id = p_organizacion
              and p.metadata->>'legacy_contacto_id' = p_contacto::text
            limit 1
        ),
        p_contacto
    );
$function$;

CREATE OR REPLACE FUNCTION public.sync_oportunidades_materialized_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    persona_nombre text;
    restart_raw text;
BEGIN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);

    IF NEW.canal IS NULL OR btrim(NEW.canal) = '' THEN
        NEW.canal := lower(NULLIF(NEW.metadata ->> 'canal', ''));
        IF NEW.canal IS NULL THEN
            NEW.canal := lower(NULLIF(NEW.metadata ->> 'channel', ''));
        END IF;
    ELSE
        NEW.canal := lower(btrim(NEW.canal));
    END IF;

    IF NEW.contacto_nombre IS NULL OR btrim(NEW.contacto_nombre) = '' THEN
        SELECT p.nombre_completo
        INTO persona_nombre
        FROM public.personas AS p
        WHERE p.organizacion_id = NEW.organizacion_id
          AND p.id = NEW.contacto_principal_id
        LIMIT 1;

        NEW.contacto_nombre := COALESCE(
            NULLIF(persona_nombre, ''),
            NULLIF(NEW.metadata ->> 'contacto_nombre', ''),
            NULLIF(NEW.titulo, '')
        );
    ELSE
        NEW.contacto_nombre := btrim(NEW.contacto_nombre);
    END IF;

    restart_raw := NEW.metadata ->> 'restart_sequence';
    IF NEW.restart_sequence IS NULL OR NEW.restart_sequence < 1 THEN
        IF restart_raw ~ '^[0-9]+$' THEN
            NEW.restart_sequence := GREATEST(restart_raw::integer, 1);
        ELSE
            NEW.restart_sequence := 1;
        END IF;
    ELSE
        NEW.restart_sequence := GREATEST(NEW.restart_sequence, 1);
    END IF;

    IF NEW.canal IS NOT NULL THEN
        NEW.metadata := jsonb_set(NEW.metadata, '{canal}', to_jsonb(NEW.canal), true);
        NEW.metadata := jsonb_set(NEW.metadata, '{channel}', to_jsonb(NEW.canal), true);
    END IF;
    IF NEW.contacto_nombre IS NOT NULL THEN
        NEW.metadata := jsonb_set(NEW.metadata, '{contacto_nombre}', to_jsonb(NEW.contacto_nombre), true);
    END IF;
    NEW.metadata := jsonb_set(
        NEW.metadata,
        '{restart_sequence}',
        to_jsonb(NEW.restart_sequence),
        true
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_sync_contacto_persona_datos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
begin
    new.persona_datos := coalesce(new.persona_datos, new.contacto_datos, '{}'::jsonb);
    new.contacto_datos := coalesce(new.contacto_datos, new.persona_datos, '{}'::jsonb);
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_sync_persona_contacto_ids()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
begin
    if new.persona_id is null and new.contacto_id is not null then
        new.persona_id := public.resolve_persona_id_for_contact(new.organizacion_id, new.contacto_id);
    end if;
    if new.contacto_id is null and new.persona_id is not null then
        new.contacto_id := new.persona_id;
    end if;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_sync_persona_datos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
begin
    new.persona_datos := coalesce(new.persona_datos, new.metadata, '{}'::jsonb);
    new.metadata := coalesce(new.metadata, new.persona_datos, '{}'::jsonb);
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_sync_persona_geo_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.pais := COALESCE(
        NULLIF(NEW.persona_datos #>> '{ubicacion,country_code}', ''),
        NULLIF(NEW.persona_datos #>> '{ubicacion,country}', ''),
        NULLIF(NEW.persona_datos #>> '{country_code}', ''),
        NULLIF(NEW.persona_datos #>> '{country}', ''),
        NULLIF(NEW.persona_datos #>> '{ubicacion,pais_codigo}', ''),
        NULLIF(NEW.persona_datos #>> '{ubicacion,pais}', ''),
        NULLIF(NEW.persona_datos #>> '{pais_codigo}', ''),
        NULLIF(NEW.persona_datos #>> '{pais}', '')
    );
    NEW.clave_entidad := COALESCE(
        NULLIF(NEW.persona_datos #>> '{ubicacion,cve_ent}', ''),
        NULLIF(NEW.persona_datos #>> '{cve_ent}', '')
    );
    NEW.entidad := COALESCE(
        NULLIF(NEW.persona_datos #>> '{ubicacion,nom_ent}', ''),
        NULLIF(NEW.persona_datos #>> '{nom_ent}', '')
    );
    NEW.clave_municipio := COALESCE(
        NULLIF(NEW.persona_datos #>> '{ubicacion,cve_mun}', ''),
        NULLIF(NEW.persona_datos #>> '{cve_mun}', '')
    );
    NEW.municipio := COALESCE(
        NULLIF(NEW.persona_datos #>> '{ubicacion,nom_mun}', ''),
        NULLIF(NEW.persona_datos #>> '{nom_mun}', '')
    );
    RETURN NEW;
END;
$function$;

COMMIT;
