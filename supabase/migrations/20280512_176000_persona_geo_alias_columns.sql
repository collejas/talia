BEGIN;

ALTER TABLE public.personas
    ADD COLUMN IF NOT EXISTS pais text,
    ADD COLUMN IF NOT EXISTS clave_entidad text,
    ADD COLUMN IF NOT EXISTS entidad text,
    ADD COLUMN IF NOT EXISTS clave_municipio text,
    ADD COLUMN IF NOT EXISTS municipio text;

UPDATE public.personas p
SET
    pais = COALESCE(
        NULLIF(p.persona_datos #>> '{ubicacion,country_code}', ''),
        NULLIF(p.persona_datos #>> '{ubicacion,country}', ''),
        NULLIF(p.persona_datos #>> '{country_code}', ''),
        NULLIF(p.persona_datos #>> '{country}', ''),
        NULLIF(p.persona_datos #>> '{ubicacion,pais_codigo}', ''),
        NULLIF(p.persona_datos #>> '{ubicacion,pais}', ''),
        NULLIF(p.persona_datos #>> '{pais_codigo}', ''),
        NULLIF(p.persona_datos #>> '{pais}', '')
    ),
    clave_entidad = COALESCE(
        NULLIF(p.persona_datos #>> '{ubicacion,cve_ent}', ''),
        NULLIF(p.persona_datos #>> '{cve_ent}', '')
    ),
    entidad = COALESCE(
        NULLIF(p.persona_datos #>> '{ubicacion,nom_ent}', ''),
        NULLIF(p.persona_datos #>> '{nom_ent}', '')
    ),
    clave_municipio = COALESCE(
        NULLIF(p.persona_datos #>> '{ubicacion,cve_mun}', ''),
        NULLIF(p.persona_datos #>> '{cve_mun}', '')
    ),
    municipio = COALESCE(
        NULLIF(p.persona_datos #>> '{ubicacion,nom_mun}', ''),
        NULLIF(p.persona_datos #>> '{nom_mun}', '')
    );

CREATE OR REPLACE FUNCTION public.tg_sync_persona_geo_aliases()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS tg_sync_persona_geo_aliases ON public.personas;
CREATE TRIGGER tg_sync_persona_geo_aliases
BEFORE INSERT OR UPDATE OF persona_datos
ON public.personas
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_persona_geo_aliases();

COMMIT;
