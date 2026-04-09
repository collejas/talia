BEGIN;

-- 1) Fecha de incorporacion con fecha+hora (timestamptz) y autogenerada.
ALTER TABLE public.contactos
  ALTER COLUMN fecha_incorporacion TYPE timestamptz USING (
    CASE WHEN fecha_incorporacion IS NULL THEN NULL ELSE fecha_incorporacion::timestamptz END
  ),
  ALTER COLUMN fecha_incorporacion SET DEFAULT now();

ALTER TABLE public.cuentas
  ALTER COLUMN fecha_incorporacion TYPE timestamptz USING (
    CASE WHEN fecha_incorporacion IS NULL THEN NULL ELSE fecha_incorporacion::timestamptz END
  ),
  ALTER COLUMN fecha_incorporacion SET DEFAULT now();

UPDATE public.contactos SET fecha_incorporacion = now() WHERE fecha_incorporacion IS NULL;
UPDATE public.cuentas SET fecha_incorporacion = now() WHERE fecha_incorporacion IS NULL;

-- 2) Generadores secuenciales por organizacion: Con1, Con2... / Emp1, Emp2...
CREATE OR REPLACE FUNCTION public.gen_codigo_contacto(p_organizacion_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF p_organizacion_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('contactos_codigo_' || p_organizacion_id::text));

  SELECT COALESCE(MAX(substring(c.codigo_contacto FROM '^Con([0-9]+)$')::bigint), 0) + 1
    INTO v_next
  FROM public.contactos c
  WHERE c.organizacion_id = p_organizacion_id
    AND c.codigo_contacto ~ '^Con[0-9]+$';

  RETURN 'Con' || v_next::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.gen_codigo_cuenta(p_organizacion_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF p_organizacion_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cuentas_codigo_' || p_organizacion_id::text));

  SELECT COALESCE(MAX(substring(c.codigo_cuenta FROM '^Emp([0-9]+)$')::bigint), 0) + 1
    INTO v_next
  FROM public.cuentas c
  WHERE c.organizacion_id = p_organizacion_id
    AND c.codigo_cuenta ~ '^Emp[0-9]+$';

  RETURN 'Emp' || v_next::text;
END;
$$;

-- 3) Triggers: siempre autogenerar en INSERT, asegurar fecha_incorporacion.
CREATE OR REPLACE FUNCTION public.tg_contactos_codigo_y_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_email text;
  v_correo text;
  v_old_email text;
  v_old_correo text;
  v_email_changed boolean := false;
  v_correo_changed boolean := false;
  v_resolved_email text;

  v_tel text;
  v_tel_e164 text;
  v_old_tel text;
  v_old_tel_e164 text;
  v_tel_changed boolean := false;
  v_tel_e164_changed boolean := false;
  v_resolved_tel text;

  v_notas text;
  v_notes text;
  v_old_notas text;
  v_old_notes text;
  v_notas_changed boolean := false;
  v_notes_changed boolean := false;
  v_resolved_notas text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.codigo_contacto := public.gen_codigo_contacto(NEW.organizacion_id);
  ELSIF COALESCE(NULLIF(btrim(NEW.codigo_contacto), ''), NULL) IS NULL THEN
    NEW.codigo_contacto := public.gen_codigo_contacto(NEW.organizacion_id);
  ELSE
    NEW.codigo_contacto := btrim(NEW.codigo_contacto);
  END IF;

  IF NEW.fecha_incorporacion IS NULL THEN
    NEW.fecha_incorporacion := now();
  END IF;

  v_email := NULLIF(btrim(COALESCE(NEW.email, '')), '');
  v_correo := NULLIF(btrim(COALESCE(NEW.correo, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_email := NULLIF(btrim(COALESCE(OLD.email, '')), '');
    v_old_correo := NULLIF(btrim(COALESCE(OLD.correo, '')), '');
    v_email_changed := v_email IS DISTINCT FROM v_old_email;
    v_correo_changed := v_correo IS DISTINCT FROM v_old_correo;

    IF v_email_changed AND NOT v_correo_changed THEN
      v_resolved_email := v_email;
    ELSIF v_correo_changed AND NOT v_email_changed THEN
      v_resolved_email := v_correo;
    ELSIF v_email_changed AND v_correo_changed THEN
      v_resolved_email := COALESCE(v_email, v_correo);
    ELSE
      v_resolved_email := COALESCE(v_email, v_correo, v_old_email, v_old_correo);
    END IF;
  ELSE
    v_resolved_email := COALESCE(v_email, v_correo);
  END IF;

  NEW.email := v_resolved_email;
  NEW.correo := v_resolved_email;

  v_tel := NULLIF(btrim(COALESCE(NEW.telefono, '')), '');
  v_tel_e164 := NULLIF(btrim(COALESCE(NEW.telefono_e164, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_tel := NULLIF(btrim(COALESCE(OLD.telefono, '')), '');
    v_old_tel_e164 := NULLIF(btrim(COALESCE(OLD.telefono_e164, '')), '');
    v_tel_changed := v_tel IS DISTINCT FROM v_old_tel;
    v_tel_e164_changed := v_tel_e164 IS DISTINCT FROM v_old_tel_e164;

    IF v_tel_changed AND NOT v_tel_e164_changed THEN
      v_resolved_tel := v_tel;
    ELSIF v_tel_e164_changed AND NOT v_tel_changed THEN
      v_resolved_tel := v_tel_e164;
    ELSIF v_tel_changed AND v_tel_e164_changed THEN
      v_resolved_tel := COALESCE(v_tel_e164, v_tel);
    ELSE
      v_resolved_tel := COALESCE(v_tel_e164, v_tel, v_old_tel_e164, v_old_tel);
    END IF;
  ELSE
    v_resolved_tel := COALESCE(v_tel_e164, v_tel);
  END IF;

  NEW.telefono := v_resolved_tel;
  NEW.telefono_e164 := v_resolved_tel;

  v_notas := NULLIF(btrim(COALESCE(NEW.notas, '')), '');
  v_notes := NULLIF(btrim(COALESCE(NEW.notes, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_notas := NULLIF(btrim(COALESCE(OLD.notas, '')), '');
    v_old_notes := NULLIF(btrim(COALESCE(OLD.notes, '')), '');
    v_notas_changed := v_notas IS DISTINCT FROM v_old_notas;
    v_notes_changed := v_notes IS DISTINCT FROM v_old_notes;

    IF v_notas_changed AND NOT v_notes_changed THEN
      v_resolved_notas := v_notas;
    ELSIF v_notes_changed AND NOT v_notas_changed THEN
      v_resolved_notas := v_notes;
    ELSIF v_notas_changed AND v_notes_changed THEN
      v_resolved_notas := COALESCE(v_notas, v_notes);
    ELSE
      v_resolved_notas := COALESCE(v_notas, v_notes, v_old_notas, v_old_notes);
    END IF;
  ELSE
    v_resolved_notas := COALESCE(v_notas, v_notes);
  END IF;

  NEW.notas := v_resolved_notas;
  NEW.notes := v_resolved_notas;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_cuentas_codigo_y_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_email text;
  v_correo text;
  v_old_email text;
  v_old_correo text;
  v_email_changed boolean := false;
  v_correo_changed boolean := false;
  v_resolved_email text;

  v_web text;
  v_sitio text;
  v_old_web text;
  v_old_sitio text;
  v_web_changed boolean := false;
  v_sitio_changed boolean := false;
  v_resolved_web text;

  v_tipo_industria text;
  v_industria text;
  v_old_tipo_industria text;
  v_old_industria text;
  v_tipo_industria_changed boolean := false;
  v_industria_changed boolean := false;
  v_resolved_industria text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.codigo_cuenta := public.gen_codigo_cuenta(NEW.organizacion_id);
  ELSIF COALESCE(NULLIF(btrim(NEW.codigo_cuenta), ''), NULL) IS NULL THEN
    NEW.codigo_cuenta := public.gen_codigo_cuenta(NEW.organizacion_id);
  ELSE
    NEW.codigo_cuenta := btrim(NEW.codigo_cuenta);
  END IF;

  IF NEW.fecha_incorporacion IS NULL THEN
    NEW.fecha_incorporacion := now();
  END IF;

  v_email := NULLIF(btrim(COALESCE(NEW.email, '')), '');
  v_correo := NULLIF(btrim(COALESCE(NEW.correo, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_email := NULLIF(btrim(COALESCE(OLD.email, '')), '');
    v_old_correo := NULLIF(btrim(COALESCE(OLD.correo, '')), '');
    v_email_changed := v_email IS DISTINCT FROM v_old_email;
    v_correo_changed := v_correo IS DISTINCT FROM v_old_correo;

    IF v_email_changed AND NOT v_correo_changed THEN
      v_resolved_email := v_email;
    ELSIF v_correo_changed AND NOT v_email_changed THEN
      v_resolved_email := v_correo;
    ELSIF v_email_changed AND v_correo_changed THEN
      v_resolved_email := COALESCE(v_email, v_correo);
    ELSE
      v_resolved_email := COALESCE(v_email, v_correo, v_old_email, v_old_correo);
    END IF;
  ELSE
    v_resolved_email := COALESCE(v_email, v_correo);
  END IF;

  NEW.email := v_resolved_email;
  NEW.correo := v_resolved_email;

  v_web := NULLIF(btrim(COALESCE(NEW.website, '')), '');
  v_sitio := NULLIF(btrim(COALESCE(NEW.sitio_web, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_web := NULLIF(btrim(COALESCE(OLD.website, '')), '');
    v_old_sitio := NULLIF(btrim(COALESCE(OLD.sitio_web, '')), '');
    v_web_changed := v_web IS DISTINCT FROM v_old_web;
    v_sitio_changed := v_sitio IS DISTINCT FROM v_old_sitio;

    IF v_web_changed AND NOT v_sitio_changed THEN
      v_resolved_web := v_web;
    ELSIF v_sitio_changed AND NOT v_web_changed THEN
      v_resolved_web := v_sitio;
    ELSIF v_web_changed AND v_sitio_changed THEN
      v_resolved_web := COALESCE(v_web, v_sitio);
    ELSE
      v_resolved_web := COALESCE(v_web, v_sitio, v_old_web, v_old_sitio);
    END IF;
  ELSE
    v_resolved_web := COALESCE(v_web, v_sitio);
  END IF;

  NEW.website := v_resolved_web;
  NEW.sitio_web := v_resolved_web;

  v_tipo_industria := NULLIF(btrim(COALESCE(NEW.tipo_industria, '')), '');
  v_industria := NULLIF(btrim(COALESCE(NEW.industria, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_tipo_industria := NULLIF(btrim(COALESCE(OLD.tipo_industria, '')), '');
    v_old_industria := NULLIF(btrim(COALESCE(OLD.industria, '')), '');
    v_tipo_industria_changed := v_tipo_industria IS DISTINCT FROM v_old_tipo_industria;
    v_industria_changed := v_industria IS DISTINCT FROM v_old_industria;

    IF v_tipo_industria_changed AND NOT v_industria_changed THEN
      v_resolved_industria := v_tipo_industria;
    ELSIF v_industria_changed AND NOT v_tipo_industria_changed THEN
      v_resolved_industria := v_industria;
    ELSIF v_tipo_industria_changed AND v_industria_changed THEN
      v_resolved_industria := COALESCE(v_tipo_industria, v_industria);
    ELSE
      v_resolved_industria := COALESCE(v_tipo_industria, v_industria, v_old_tipo_industria, v_old_industria);
    END IF;
  ELSE
    v_resolved_industria := COALESCE(v_tipo_industria, v_industria);
  END IF;

  NEW.tipo_industria := v_resolved_industria;
  NEW.industria := v_resolved_industria;

  RETURN NEW;
END;
$$;

-- 4) Backfill codigos al nuevo formato secuencial.
UPDATE public.contactos c
SET codigo_contacto = public.gen_codigo_contacto(c.organizacion_id)
WHERE c.codigo_contacto IS NULL OR btrim(c.codigo_contacto) = '' OR c.codigo_contacto !~ '^Con[0-9]+$';

UPDATE public.cuentas a
SET codigo_cuenta = public.gen_codigo_cuenta(a.organizacion_id)
WHERE a.codigo_cuenta IS NULL OR btrim(a.codigo_cuenta) = '' OR a.codigo_cuenta !~ '^Emp[0-9]+$';

-- 5) Extender listado de contactos para columnas nuevas (sin metadata json en respuesta).
DROP FUNCTION IF EXISTS public.panel_contactos_list(
  text,
  text,
  text,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  text,
  text,
  text,
  integer,
  integer
);

CREATE OR REPLACE FUNCTION public.panel_contactos_list(
  p_estado text DEFAULT NULL::text,
  p_captura text DEFAULT NULL::text,
  p_origen text DEFAULT NULL::text,
  p_propietario uuid DEFAULT NULL::uuid,
  p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_search text DEFAULT NULL::text,
  p_order_by text DEFAULT 'creado_en'::text,
  p_order_dir text DEFAULT 'desc'::text,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  contacto_id uuid,
  codigo_contacto text,
  codigo_cuenta text,
  nombre text,
  correo text,
  telefono text,
  estado text,
  captura_estado text,
  origen text,
  creado_en timestamp with time zone,
  actualizado_en timestamp with time zone,
  company_name text,
  propietario_id uuid,
  propietario_nombre text,
  ultimo_contacto_en timestamp with time zone,
  conversaciones integer,
  notes text,
  rfc text,
  puesto text,
  area text,
  rol_decision text,
  codigo_postal text,
  entidad text,
  municipio text,
  pais text,
  website text,
  tipo_establecimiento text,
  fecha_incorporacion timestamp with time zone,
  total_rows bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH base AS (
    SELECT
        c.id AS contacto_id,
        c.codigo_contacto,
        a.codigo_cuenta,
        COALESCE(NULLIF(c.nombre_completo, ''), 'Sin nombre') AS nombre,
        NULLIF(c.correo, '') AS correo,
        NULLIF(c.telefono_e164, '') AS telefono,
        COALESCE(NULLIF(c.estado, ''), 'desconocido') AS estado,
        COALESCE(NULLIF(c.captura_estado, ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(c.origen, ''), 'otro') AS origen,
        c.creado_en,
        NULLIF(c.company_name, '') AS company_name,
        c.propietario_usuario_id AS propietario_id,
        owner.nombre_completo AS propietario_nombre,
        c.notes,
        c.rfc,
        c.puesto,
        c.area,
        c.rol_decision,
        c.codigo_postal,
        c.entidad,
        c.municipio,
        c.pais,
        c.website,
        c.tipo_establecimiento,
        c.fecha_incorporacion
    FROM public.contactos c
    LEFT JOIN public.usuarios owner ON owner.id = c.propietario_usuario_id
    LEFT JOIN public.cuentas a ON a.id = c.cuenta_id AND a.organizacion_id = c.organizacion_id
    WHERE (p_estado IS NULL OR lower(c.estado) = lower(p_estado))
      AND (p_captura IS NULL OR lower(c.captura_estado) = lower(p_captura))
      AND (p_origen IS NULL OR lower(c.origen) = lower(p_origen))
      AND (p_propietario IS NULL OR c.propietario_usuario_id = p_propietario)
      AND (p_from IS NULL OR c.creado_en >= p_from)
      AND (p_to IS NULL OR c.creado_en <= p_to)
      AND (
        p_search IS NULL OR p_search = '' OR
        c.nombre_completo ILIKE '%' || p_search || '%' OR
        c.correo ILIKE '%' || p_search || '%' OR
        c.telefono_e164 ILIKE '%' || p_search || '%' OR
        c.company_name ILIKE '%' || p_search || '%' OR
        c.notes ILIKE '%' || p_search || '%' OR
        c.codigo_contacto ILIKE '%' || p_search || '%' OR
        c.rfc ILIKE '%' || p_search || '%'
      )
      AND public.puede_ver_contacto(c.id)
),
conversation_stats AS (
    SELECT
        conv.contacto_id,
        COUNT(*) AS conversaciones,
        MAX(conv.ultimo_mensaje_en) AS ultimo_contacto_en
    FROM public.conversaciones conv
    WHERE conv.contacto_id IS NOT NULL
    GROUP BY conv.contacto_id
),
annotated AS (
    SELECT
        b.*,
        COALESCE(cs.ultimo_contacto_en, b.creado_en) AS actualizado_en,
        cs.conversaciones,
        cs.ultimo_contacto_en,
        COUNT(*) OVER () AS total_rows
    FROM base b
    LEFT JOIN conversation_stats cs ON cs.contacto_id = b.contacto_id
),
ordered AS (
    SELECT *
    FROM annotated
    ORDER BY
        CASE WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) = 'asc' THEN actualizado_en END ASC,
        CASE WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) <> 'asc' THEN actualizado_en END DESC,
        CASE WHEN lower(p_order_by) = 'ultimo_contacto_en' AND lower(p_order_dir) = 'asc' THEN ultimo_contacto_en END ASC,
        CASE WHEN lower(p_order_by) = 'ultimo_contacto_en' AND lower(p_order_dir) <> 'asc' THEN ultimo_contacto_en END DESC,
        CASE WHEN lower(p_order_by) = 'nombre' AND lower(p_order_dir) = 'asc' THEN nombre END ASC,
        CASE WHEN lower(p_order_by) = 'nombre' AND lower(p_order_dir) <> 'asc' THEN nombre END DESC,
        CASE WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) = 'asc' THEN creado_en END ASC,
        CASE WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) <> 'asc' THEN creado_en END DESC,
        creado_en DESC,
        contacto_id
)
SELECT
    contacto_id,
    codigo_contacto,
    codigo_cuenta,
    nombre,
    correo,
    telefono,
    estado,
    captura_estado,
    origen,
    creado_en,
    actualizado_en,
    company_name,
    propietario_id,
    propietario_nombre,
    ultimo_contacto_en,
    COALESCE(conversaciones, 0) AS conversaciones,
    notes,
    rfc,
    puesto,
    area,
    rol_decision,
    codigo_postal,
    entidad,
    municipio,
    pais,
    website,
    tipo_establecimiento,
    fecha_incorporacion,
    total_rows
FROM ordered
LIMIT COALESCE(NULLIF(p_limit, 0), 100)
OFFSET GREATEST(p_offset, 0);
$$;

COMMIT;
