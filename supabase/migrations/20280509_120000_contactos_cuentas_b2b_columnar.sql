-- B2B columnar expansion for contactos and cuentas
-- Non-destructive migration: adds requested fields as explicit columns.

BEGIN;

-- =========================
-- CONTACTOS (persona)
-- =========================
ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS codigo_contacto text,
  ADD COLUMN IF NOT EXISTS nombre_nombres text,
  ADD COLUMN IF NOT EXISTS apellido_paterno text,
  ADD COLUMN IF NOT EXISTS apellido_materno text,
  ADD COLUMN IF NOT EXISTS persona_fisica_moral text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS rfc text,
  ADD COLUMN IF NOT EXISTS uso_cfdi text,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS forma_pago text,
  ADD COLUMN IF NOT EXISTS email_facturacion text,
  ADD COLUMN IF NOT EXISTS tipo_industria text,
  ADD COLUMN IF NOT EXISTS tamano text,
  ADD COLUMN IF NOT EXISTS puesto text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS rol_decision text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS tipo_vialidad text,
  ADD COLUMN IF NOT EXISTS nombre_vialidad text,
  ADD COLUMN IF NOT EXISTS numero_exterior text,
  ADD COLUMN IF NOT EXISTS letra_exterior text,
  ADD COLUMN IF NOT EXISTS edificio text,
  ADD COLUMN IF NOT EXISTS edificio_piso text,
  ADD COLUMN IF NOT EXISTS numero_interior text,
  ADD COLUMN IF NOT EXISTS letra_interior text,
  ADD COLUMN IF NOT EXISTS tipo_asentamiento text,
  ADD COLUMN IF NOT EXISTS nombre_asentamiento text,
  ADD COLUMN IF NOT EXISTS tipo_centro_comercial text,
  ADD COLUMN IF NOT EXISTS corredor_industrial text,
  ADD COLUMN IF NOT EXISTS numero_local text,
  ADD COLUMN IF NOT EXISTS codigo_postal text,
  ADD COLUMN IF NOT EXISTS clave_entidad text,
  ADD COLUMN IF NOT EXISTS entidad text,
  ADD COLUMN IF NOT EXISTS clave_municipio text,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS clave_localidad text,
  ADD COLUMN IF NOT EXISTS localidad text,
  ADD COLUMN IF NOT EXISTS pais text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS tipo_establecimiento text,
  ADD COLUMN IF NOT EXISTS latitud numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitud numeric(10,7),
  ADD COLUMN IF NOT EXISTS fecha_incorporacion date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contactos_persona_fisica_moral_chk'
      AND conrelid = 'public.contactos'::regclass
  ) THEN
    ALTER TABLE public.contactos
      ADD CONSTRAINT contactos_persona_fisica_moral_chk
      CHECK (
        persona_fisica_moral IS NULL
        OR lower(persona_fisica_moral) IN ('fisica', 'moral')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contactos_latitud_chk'
      AND conrelid = 'public.contactos'::regclass
  ) THEN
    ALTER TABLE public.contactos
      ADD CONSTRAINT contactos_latitud_chk
      CHECK (latitud IS NULL OR (latitud >= -90 AND latitud <= 90));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contactos_longitud_chk'
      AND conrelid = 'public.contactos'::regclass
  ) THEN
    ALTER TABLE public.contactos
      ADD CONSTRAINT contactos_longitud_chk
      CHECK (longitud IS NULL OR (longitud >= -180 AND longitud <= 180));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS contactos_org_codigo_contacto_uidx
  ON public.contactos (organizacion_id, codigo_contacto)
  WHERE codigo_contacto IS NOT NULL AND btrim(codigo_contacto) <> '';

CREATE INDEX IF NOT EXISTS contactos_org_rfc_idx
  ON public.contactos (organizacion_id, upper(rfc))
  WHERE rfc IS NOT NULL AND btrim(rfc) <> '';

CREATE INDEX IF NOT EXISTS contactos_org_email_idx
  ON public.contactos (organizacion_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE INDEX IF NOT EXISTS contactos_org_telefono_idx
  ON public.contactos (organizacion_id, telefono)
  WHERE telefono IS NOT NULL AND btrim(telefono) <> '';

-- =========================
-- CUENTAS (empresa)
-- =========================
ALTER TABLE public.cuentas
  ADD COLUMN IF NOT EXISTS codigo_cuenta text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS rfc text,
  ADD COLUMN IF NOT EXISTS uso_cfdi text,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS forma_pago text,
  ADD COLUMN IF NOT EXISTS email_facturacion text,
  ADD COLUMN IF NOT EXISTS tipo_industria text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS necesidad_proposito text,
  ADD COLUMN IF NOT EXISTS tipo_vialidad text,
  ADD COLUMN IF NOT EXISTS nombre_vialidad text,
  ADD COLUMN IF NOT EXISTS numero_exterior text,
  ADD COLUMN IF NOT EXISTS letra_exterior text,
  ADD COLUMN IF NOT EXISTS edificio text,
  ADD COLUMN IF NOT EXISTS edificio_piso text,
  ADD COLUMN IF NOT EXISTS numero_interior text,
  ADD COLUMN IF NOT EXISTS letra_interior text,
  ADD COLUMN IF NOT EXISTS tipo_asentamiento text,
  ADD COLUMN IF NOT EXISTS nombre_asentamiento text,
  ADD COLUMN IF NOT EXISTS tipo_centro_comercial text,
  ADD COLUMN IF NOT EXISTS corredor_industrial text,
  ADD COLUMN IF NOT EXISTS numero_local text,
  ADD COLUMN IF NOT EXISTS codigo_postal text,
  ADD COLUMN IF NOT EXISTS clave_entidad text,
  ADD COLUMN IF NOT EXISTS entidad text,
  ADD COLUMN IF NOT EXISTS clave_municipio text,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS clave_localidad text,
  ADD COLUMN IF NOT EXISTS localidad text,
  ADD COLUMN IF NOT EXISTS pais text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS tipo_establecimiento text,
  ADD COLUMN IF NOT EXISTS latitud numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitud numeric(10,7),
  ADD COLUMN IF NOT EXISTS fecha_incorporacion date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cuentas_latitud_chk'
      AND conrelid = 'public.cuentas'::regclass
  ) THEN
    ALTER TABLE public.cuentas
      ADD CONSTRAINT cuentas_latitud_chk
      CHECK (latitud IS NULL OR (latitud >= -90 AND latitud <= 90));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cuentas_longitud_chk'
      AND conrelid = 'public.cuentas'::regclass
  ) THEN
    ALTER TABLE public.cuentas
      ADD CONSTRAINT cuentas_longitud_chk
      CHECK (longitud IS NULL OR (longitud >= -180 AND longitud <= 180));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cuentas_org_codigo_cuenta_uidx
  ON public.cuentas (organizacion_id, codigo_cuenta)
  WHERE codigo_cuenta IS NOT NULL AND btrim(codigo_cuenta) <> '';

CREATE INDEX IF NOT EXISTS cuentas_org_rfc_idx
  ON public.cuentas (organizacion_id, upper(rfc))
  WHERE rfc IS NOT NULL AND btrim(rfc) <> '';

CREATE INDEX IF NOT EXISTS cuentas_org_email_idx
  ON public.cuentas (organizacion_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

COMMIT;
