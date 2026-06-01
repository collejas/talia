BEGIN;

-- Extension del modulo de proveedores:
-- - contactos multiples por proveedor
-- - cuentas bancarias multiples por proveedor
-- - compatibilidad con el proveedor actual como cabecera

CREATE TABLE IF NOT EXISTS public.proveedor_contactos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    proveedor_id uuid NOT NULL,
    persona_id uuid NOT NULL,
    rol_en_proveedor text NOT NULL DEFAULT 'general',
    es_principal boolean NOT NULL DEFAULT false,
    es_compras boolean NOT NULL DEFAULT false,
    es_facturacion boolean NOT NULL DEFAULT false,
    es_logistica boolean NOT NULL DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    fecha_inicio date,
    fecha_fin date,
    notas text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT proveedor_contactos_fechas_chk CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio),
    CONSTRAINT proveedor_contactos_rol_chk CHECK (length(trim(rol_en_proveedor)) > 0)
);

COMMENT ON TABLE public.proveedor_contactos IS 'Relacion de personas y roles por proveedor.';

CREATE TABLE IF NOT EXISTS public.proveedor_cuentas_bancarias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    proveedor_id uuid NOT NULL,
    alias text,
    banco_nombre text NOT NULL,
    banco_clave text,
    pais text NOT NULL DEFAULT 'MX',
    moneda character(3) NOT NULL DEFAULT 'MXN',
    tipo_cuenta text,
    titular text,
    numero_cuenta text,
    clabe text,
    swift text,
    iban text,
    es_principal boolean NOT NULL DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    observaciones text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT proveedor_cuentas_bancarias_moneda_chk CHECK (char_length(moneda) = 3),
    CONSTRAINT proveedor_cuentas_bancarias_pais_chk CHECK (char_length(pais) = 2),
    CONSTRAINT proveedor_cuentas_bancarias_identificador_chk CHECK (
        COALESCE(length(trim(coalesce(numero_cuenta, ''))), 0) > 0
        OR COALESCE(length(trim(coalesce(clabe, ''))), 0) > 0
        OR COALESCE(length(trim(coalesce(iban, ''))), 0) > 0
        OR COALESCE(length(trim(coalesce(swift, ''))), 0) > 0
    )
);

COMMENT ON TABLE public.proveedor_cuentas_bancarias IS 'Cuentas bancarias asociadas a un proveedor.';

CREATE UNIQUE INDEX IF NOT EXISTS proveedores_org_id_uidx
    ON public.proveedores (organizacion_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS proveedor_contactos_org_proveedor_persona_rol_uidx
    ON public.proveedor_contactos (organizacion_id, proveedor_id, persona_id, rol_en_proveedor);

CREATE INDEX IF NOT EXISTS proveedor_contactos_org_proveedor_idx
    ON public.proveedor_contactos (organizacion_id, proveedor_id, activo, es_principal);

CREATE INDEX IF NOT EXISTS proveedor_contactos_org_persona_idx
    ON public.proveedor_contactos (organizacion_id, persona_id, activo);

CREATE UNIQUE INDEX IF NOT EXISTS proveedor_contactos_principal_activo_uidx
    ON public.proveedor_contactos (organizacion_id, proveedor_id)
    WHERE es_principal AND activo;

CREATE UNIQUE INDEX IF NOT EXISTS proveedor_cuentas_bancarias_org_proveedor_clabe_uidx
    ON public.proveedor_cuentas_bancarias (organizacion_id, proveedor_id, clabe)
    WHERE clabe IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS proveedor_cuentas_bancarias_org_proveedor_numero_uidx
    ON public.proveedor_cuentas_bancarias (organizacion_id, proveedor_id, numero_cuenta)
    WHERE numero_cuenta IS NOT NULL;

CREATE INDEX IF NOT EXISTS proveedor_cuentas_bancarias_org_proveedor_idx
    ON public.proveedor_cuentas_bancarias (organizacion_id, proveedor_id, activo, es_principal);

CREATE UNIQUE INDEX IF NOT EXISTS proveedor_cuentas_bancarias_principal_activa_uidx
    ON public.proveedor_cuentas_bancarias (organizacion_id, proveedor_id)
    WHERE es_principal AND activo;

ALTER TABLE public.proveedor_contactos
    ADD CONSTRAINT proveedor_contactos_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.proveedor_contactos
    ADD CONSTRAINT proveedor_contactos_proveedor_org_fkey
    FOREIGN KEY (organizacion_id, proveedor_id)
    REFERENCES public.proveedores(organizacion_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.proveedor_contactos
    ADD CONSTRAINT proveedor_contactos_persona_org_fkey
    FOREIGN KEY (organizacion_id, persona_id)
    REFERENCES public.personas(organizacion_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.proveedor_cuentas_bancarias
    ADD CONSTRAINT proveedor_cuentas_bancarias_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.proveedor_cuentas_bancarias
    ADD CONSTRAINT proveedor_cuentas_bancarias_proveedor_org_fkey
    FOREIGN KEY (organizacion_id, proveedor_id)
    REFERENCES public.proveedores(organizacion_id, id)
    ON DELETE CASCADE;

DROP TRIGGER IF EXISTS proveedor_contactos_set_org ON public.proveedor_contactos;
CREATE TRIGGER proveedor_contactos_set_org
    BEFORE INSERT ON public.proveedor_contactos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS proveedor_contactos_touch_updated_at ON public.proveedor_contactos;
CREATE TRIGGER proveedor_contactos_touch_updated_at
    BEFORE UPDATE ON public.proveedor_contactos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS proveedor_cuentas_bancarias_set_org ON public.proveedor_cuentas_bancarias;
CREATE TRIGGER proveedor_cuentas_bancarias_set_org
    BEFORE INSERT ON public.proveedor_cuentas_bancarias
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS proveedor_cuentas_bancarias_touch_updated_at ON public.proveedor_cuentas_bancarias;
CREATE TRIGGER proveedor_cuentas_bancarias_touch_updated_at
    BEFORE UPDATE ON public.proveedor_cuentas_bancarias
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['proveedor_contactos', 'proveedor_cuentas_bancarias'] LOOP
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

INSERT INTO public.proveedor_contactos (
    organizacion_id,
    proveedor_id,
    persona_id,
    rol_en_proveedor,
    es_principal,
    es_compras,
    es_facturacion,
    es_logistica,
    activo,
    notas,
    metadata,
    creado_en,
    actualizado_en
)
SELECT DISTINCT
    p.organizacion_id,
    p.id,
    p.contacto_principal_persona_id,
    'general',
    true,
    false,
    false,
    false,
    true,
    'Migrado desde proveedor.contacto_principal_persona_id',
    '{}'::jsonb,
    p.creado_en,
    p.actualizado_en
FROM public.proveedores p
WHERE p.contacto_principal_persona_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
