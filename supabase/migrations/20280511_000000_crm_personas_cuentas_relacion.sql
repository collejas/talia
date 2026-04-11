BEGIN;

-- ============================================================================
-- Funciones auxiliares
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_personas_derive_nombre_completo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.nombre := btrim(NEW.nombre);
    NEW.apellido_paterno := NULLIF(btrim(COALESCE(NEW.apellido_paterno, '')), '');
    NEW.apellido_materno := NULLIF(btrim(COALESCE(NEW.apellido_materno, '')), '');
    NEW.nombre_completo := btrim(concat_ws(' ', NEW.nombre, NEW.apellido_paterno, NEW.apellido_materno));
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_personas_derive_nombre_completo()
    IS 'Mantiene nombre_completo como campo materializado a partir de nombre y apellidos.';

-- ============================================================================
-- Personas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.personas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    apellido_paterno text,
    apellido_materno text,
    nombre_completo text NOT NULL,
    correo_principal text,
    telefono_principal_e164 text,
    puesto text,
    area text,
    rol_decision text,
    estado text NOT NULL DEFAULT 'activo',
    origen text,
    notas text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    propietario_usuario_id uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.personas
    ADD CONSTRAINT personas_propietario_usuario_org_fkey
    FOREIGN KEY (organizacion_id, propietario_usuario_id)
    REFERENCES public.usuarios (organizacion_id, id)
    ON DELETE SET NULL;

ALTER TABLE public.personas
    ADD CONSTRAINT personas_estado_chk
    CHECK (estado IN ('lead', 'activo', 'inactivo', 'bloqueado'));

ALTER TABLE public.personas
    ADD CONSTRAINT personas_nombre_chk
    CHECK (btrim(nombre) <> '');

ALTER TABLE public.personas
    ADD CONSTRAINT personas_nombre_completo_chk
    CHECK (btrim(nombre_completo) <> '');

CREATE UNIQUE INDEX IF NOT EXISTS personas_org_id_id_key
    ON public.personas (organizacion_id, id);

CREATE INDEX IF NOT EXISTS personas_org_idx
    ON public.personas (organizacion_id);

CREATE INDEX IF NOT EXISTS personas_org_owner_idx
    ON public.personas (organizacion_id, propietario_usuario_id);

CREATE INDEX IF NOT EXISTS personas_org_email_idx
    ON public.personas (organizacion_id, lower(correo_principal))
    WHERE correo_principal IS NOT NULL AND btrim(correo_principal) <> '';

CREATE INDEX IF NOT EXISTS personas_org_phone_idx
    ON public.personas (organizacion_id, telefono_principal_e164)
    WHERE telefono_principal_e164 IS NOT NULL AND btrim(telefono_principal_e164) <> '';

DROP TRIGGER IF EXISTS personas_touch_updated_at ON public.personas;
CREATE TRIGGER personas_touch_updated_at
    BEFORE UPDATE ON public.personas
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS personas_derive_nombre_completo ON public.personas;
CREATE TRIGGER personas_derive_nombre_completo
    BEFORE INSERT OR UPDATE ON public.personas
    FOR EACH ROW EXECUTE FUNCTION public.tg_personas_derive_nombre_completo();

COMMENT ON TABLE public.personas IS 'Entidad humana real dentro del CRM.';

-- ============================================================================
-- Direcciones
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.direcciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    tipo text NOT NULL,
    pais text,
    clave_entidad text,
    entidad text,
    clave_municipio text,
    municipio text,
    clave_localidad text,
    localidad text,
    tipo_vialidad text,
    nombre_vialidad text,
    numero_exterior text,
    letra_exterior text,
    edificio text,
    edificio_piso text,
    numero_interior text,
    letra_interior text,
    tipo_asentamiento text,
    nombre_asentamiento text,
    tipo_centro_comercial text,
    corredor_industrial text,
    numero_local text,
    codigo_postal text,
    latitud numeric(10,7),
    longitud numeric(10,7),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.direcciones
    ADD CONSTRAINT direcciones_tipo_chk
    CHECK (tipo IN ('fiscal', 'operativa', 'facturacion', 'envio', 'personal', 'otro'));

CREATE UNIQUE INDEX IF NOT EXISTS direcciones_org_id_id_key
    ON public.direcciones (organizacion_id, id);

CREATE INDEX IF NOT EXISTS direcciones_org_idx
    ON public.direcciones (organizacion_id);

CREATE INDEX IF NOT EXISTS direcciones_org_tipo_idx
    ON public.direcciones (organizacion_id, tipo);

CREATE INDEX IF NOT EXISTS direcciones_org_cp_idx
    ON public.direcciones (organizacion_id, codigo_postal)
    WHERE codigo_postal IS NOT NULL AND btrim(codigo_postal) <> '';

DROP TRIGGER IF EXISTS direcciones_touch_updated_at ON public.direcciones;
CREATE TRIGGER direcciones_touch_updated_at
    BEFORE UPDATE ON public.direcciones
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

COMMENT ON TABLE public.direcciones IS 'Direcciones reutilizables para cuentas o personas.';

-- ============================================================================
-- Relacion cuenta-persona
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cuenta_personas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    cuenta_id uuid NOT NULL,
    persona_id uuid NOT NULL,
    rol_en_cuenta text NOT NULL,
    rol_catalogo_id uuid,
    puesto text,
    es_contacto_principal boolean NOT NULL DEFAULT false,
    es_contacto_facturacion boolean NOT NULL DEFAULT false,
    es_representante_legal boolean NOT NULL DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    fecha_inicio date,
    fecha_fin date,
    notas text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cuenta_personas
    ADD CONSTRAINT cuenta_personas_cuenta_org_fkey
    FOREIGN KEY (organizacion_id, cuenta_id)
    REFERENCES public.cuentas (organizacion_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.cuenta_personas
    ADD CONSTRAINT cuenta_personas_persona_org_fkey
    FOREIGN KEY (organizacion_id, persona_id)
    REFERENCES public.personas (organizacion_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.cuenta_personas
    ADD CONSTRAINT cuenta_personas_fechas_chk
    CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio);

CREATE INDEX IF NOT EXISTS cuenta_personas_org_idx
    ON public.cuenta_personas (organizacion_id);

CREATE INDEX IF NOT EXISTS cuenta_personas_cuenta_idx
    ON public.cuenta_personas (organizacion_id, cuenta_id);

CREATE INDEX IF NOT EXISTS cuenta_personas_persona_idx
    ON public.cuenta_personas (organizacion_id, persona_id);

CREATE UNIQUE INDEX IF NOT EXISTS cuenta_personas_cuenta_persona_rol_uidx
    ON public.cuenta_personas (cuenta_id, persona_id, rol_en_cuenta);

DROP TRIGGER IF EXISTS cuenta_personas_touch_updated_at ON public.cuenta_personas;
CREATE TRIGGER cuenta_personas_touch_updated_at
    BEFORE UPDATE ON public.cuenta_personas
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

COMMENT ON TABLE public.cuenta_personas IS 'Relacion flexible entre personas y cuentas.';

-- ============================================================================
-- Relacion cuenta-direccion
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cuenta_direcciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    cuenta_id uuid NOT NULL,
    direccion_id uuid NOT NULL,
    tipo_relacion text NOT NULL,
    es_principal boolean NOT NULL DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    notas text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cuenta_direcciones
    ADD CONSTRAINT cuenta_direcciones_cuenta_org_fkey
    FOREIGN KEY (organizacion_id, cuenta_id)
    REFERENCES public.cuentas (organizacion_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.cuenta_direcciones
    ADD CONSTRAINT cuenta_direcciones_direccion_org_fkey
    FOREIGN KEY (organizacion_id, direccion_id)
    REFERENCES public.direcciones (organizacion_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.cuenta_direcciones
    ADD CONSTRAINT cuenta_direcciones_tipo_chk
    CHECK (tipo_relacion IN ('fiscal', 'operativa', 'envio', 'sucursal', 'historial', 'otro'));

CREATE INDEX IF NOT EXISTS cuenta_direcciones_org_idx
    ON public.cuenta_direcciones (organizacion_id);

CREATE INDEX IF NOT EXISTS cuenta_direcciones_cuenta_idx
    ON public.cuenta_direcciones (organizacion_id, cuenta_id);

CREATE INDEX IF NOT EXISTS cuenta_direcciones_direccion_idx
    ON public.cuenta_direcciones (organizacion_id, direccion_id);

CREATE UNIQUE INDEX IF NOT EXISTS cuenta_direcciones_cuenta_direccion_tipo_uidx
    ON public.cuenta_direcciones (cuenta_id, direccion_id, tipo_relacion);

DROP TRIGGER IF EXISTS cuenta_direcciones_touch_updated_at ON public.cuenta_direcciones;
CREATE TRIGGER cuenta_direcciones_touch_updated_at
    BEFORE UPDATE ON public.cuenta_direcciones
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

COMMENT ON TABLE public.cuenta_direcciones IS 'Pivote reutilizable para multiples direcciones por cuenta.';

-- ============================================================================
-- RLS y permisos
-- ============================================================================

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['personas', 'direcciones', 'cuentas', 'cuenta_personas', 'cuenta_direcciones'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', tbl);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', tbl);

        EXECUTE format('DROP POLICY IF EXISTS %I_admin_all ON public.%I', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I_member_org ON public.%I', tbl, tbl);

        EXECUTE format(
            'CREATE POLICY %I_admin_all ON public.%I FOR ALL TO authenticated USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()))',
            tbl,
            tbl
        );

        EXECUTE format(
            'CREATE POLICY %I_member_org ON public.%I FOR ALL TO authenticated USING (organizacion_id = public.usuario_organizacion_id(auth.uid())) WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()))',
            tbl,
            tbl
        );
    END LOOP;
END;
$$;

COMMIT;
