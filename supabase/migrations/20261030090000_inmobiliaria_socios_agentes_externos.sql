BEGIN;

CREATE TABLE IF NOT EXISTS public.inmobiliaria_socios_comerciales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    tipo text NOT NULL DEFAULT 'inmobiliaria',
    nombre text NOT NULL,
    rfc text,
    contacto_nombre text,
    correo text,
    telefono text,
    comision_porcentaje numeric(5, 2),
    activo boolean NOT NULL DEFAULT true,
    notas text,
    creado_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inmobiliaria_socios_comerciales_tipo_chk
        CHECK (tipo IN ('inmobiliaria', 'broker_independiente', 'agencia')),
    CONSTRAINT inmobiliaria_socios_comerciales_comision_chk
        CHECK (comision_porcentaje IS NULL OR (comision_porcentaje >= 0 AND comision_porcentaje <= 100))
);

CREATE UNIQUE INDEX IF NOT EXISTS inmobiliaria_socios_comerciales_nombre_uidx
    ON public.inmobiliaria_socios_comerciales (organizacion_id, lower(btrim(nombre)));
ALTER TABLE public.inmobiliaria_socios_comerciales
    ADD CONSTRAINT inmobiliaria_socios_comerciales_org_id_uidx UNIQUE (organizacion_id, id);
CREATE INDEX IF NOT EXISTS inmobiliaria_socios_comerciales_activos_idx
    ON public.inmobiliaria_socios_comerciales (organizacion_id, activo, nombre);

CREATE TABLE IF NOT EXISTS public.inmobiliaria_agentes_externos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    socio_comercial_id uuid NOT NULL REFERENCES public.inmobiliaria_socios_comerciales(id) ON DELETE RESTRICT,
    nombre text NOT NULL,
    correo text,
    telefono text,
    referencia_externa text,
    activo boolean NOT NULL DEFAULT true,
    notas text,
    creado_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inmobiliaria_agentes_externos_socio_org_chk CHECK (organizacion_id IS NOT NULL),
    CONSTRAINT inmobiliaria_agentes_externos_socio_org_fkey
        FOREIGN KEY (organizacion_id, socio_comercial_id)
        REFERENCES public.inmobiliaria_socios_comerciales(organizacion_id, id)
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS inmobiliaria_agentes_externos_nombre_uidx
    ON public.inmobiliaria_agentes_externos (organizacion_id, socio_comercial_id, lower(btrim(nombre)));
CREATE INDEX IF NOT EXISTS inmobiliaria_agentes_externos_socio_idx
    ON public.inmobiliaria_agentes_externos (organizacion_id, socio_comercial_id, activo, nombre);

ALTER TABLE public.operaciones_inmobiliarias
    ADD COLUMN IF NOT EXISTS origen_venta text NOT NULL DEFAULT 'interno',
    ADD COLUMN IF NOT EXISTS socio_comercial_externo_id uuid REFERENCES public.inmobiliaria_socios_comerciales(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS agente_externo_id uuid REFERENCES public.inmobiliaria_agentes_externos(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS registrado_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS responsable_interno_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS referencia_externa text,
    ADD COLUMN IF NOT EXISTS fecha_evento_externo timestamptz,
    ADD COLUMN IF NOT EXISTS comision_porcentaje numeric(5, 2),
    ADD COLUMN IF NOT EXISTS comision_monto numeric(18, 2),
    ADD COLUMN IF NOT EXISTS comision_estado text;

ALTER TABLE public.operaciones_inmobiliarias
    DROP CONSTRAINT IF EXISTS operaciones_inmobiliarias_origen_venta_chk,
    DROP CONSTRAINT IF EXISTS operaciones_inmobiliarias_externo_atribucion_chk,
    DROP CONSTRAINT IF EXISTS operaciones_inmobiliarias_comision_chk;

ALTER TABLE public.operaciones_inmobiliarias
    ADD CONSTRAINT operaciones_inmobiliarias_origen_venta_chk
        CHECK (origen_venta IN ('interno', 'externo')),
    ADD CONSTRAINT operaciones_inmobiliarias_externo_atribucion_chk
        CHECK (
            origen_venta = 'interno'
            OR (socio_comercial_externo_id IS NOT NULL AND agente_externo_id IS NOT NULL)
        ),
    ADD CONSTRAINT operaciones_inmobiliarias_comision_chk
        CHECK (
            (comision_porcentaje IS NULL OR (comision_porcentaje >= 0 AND comision_porcentaje <= 100))
            AND (comision_monto IS NULL OR comision_monto >= 0)
            AND (comision_estado IS NULL OR comision_estado IN ('pendiente', 'autorizada', 'pagada', 'cancelada'))
        );

CREATE INDEX IF NOT EXISTS operaciones_inmobiliarias_origen_externo_idx
    ON public.operaciones_inmobiliarias (organizacion_id, origen_venta, estado, actualizado_en DESC);
CREATE INDEX IF NOT EXISTS operaciones_inmobiliarias_agente_externo_idx
    ON public.operaciones_inmobiliarias (organizacion_id, agente_externo_id, estado);
CREATE INDEX IF NOT EXISTS operaciones_inmobiliarias_socio_externo_idx
    ON public.operaciones_inmobiliarias (organizacion_id, socio_comercial_externo_id, estado);

ALTER TABLE public.inmobiliaria_socios_comerciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_socios_comerciales FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_agentes_externos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmobiliaria_agentes_externos FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.inmobiliaria_socios_comerciales FROM anon;
REVOKE ALL ON public.inmobiliaria_agentes_externos FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.inmobiliaria_socios_comerciales TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inmobiliaria_agentes_externos TO authenticated;

DROP POLICY IF EXISTS inmobiliaria_socios_comerciales_org ON public.inmobiliaria_socios_comerciales;
CREATE POLICY inmobiliaria_socios_comerciales_org
    ON public.inmobiliaria_socios_comerciales
    FOR ALL TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

DROP POLICY IF EXISTS inmobiliaria_agentes_externos_org ON public.inmobiliaria_agentes_externos;
CREATE POLICY inmobiliaria_agentes_externos_org
    ON public.inmobiliaria_agentes_externos
    FOR ALL TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES
    ('inmobiliaria.brokers.manage', 'Administrar socios y agentes comerciales externos', 577),
    ('inmobiliaria.operaciones_externas.create', 'Registrar operaciones inmobiliarias de origen externo', 578),
    ('inmobiliaria.operaciones_externas.validate', 'Validar operaciones inmobiliarias de origen externo', 579),
    ('inmobiliaria.commissions.manage', 'Administrar comisiones de socios comerciales externos', 580)
ON CONFLICT (codigo) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    activo = true,
    actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('owner', 'inmobiliaria.brokers.manage'),
    ('admin_operativo', 'inmobiliaria.brokers.manage'),
    ('gerente_comercial', 'inmobiliaria.brokers.manage'),
    ('owner', 'inmobiliaria.operaciones_externas.create'),
    ('admin_operativo', 'inmobiliaria.operaciones_externas.create'),
    ('gerente_comercial', 'inmobiliaria.operaciones_externas.create'),
    ('coordinador', 'inmobiliaria.operaciones_externas.create'),
    ('owner', 'inmobiliaria.operaciones_externas.validate'),
    ('admin_operativo', 'inmobiliaria.operaciones_externas.validate'),
    ('gerente_comercial', 'inmobiliaria.operaciones_externas.validate'),
    ('owner', 'inmobiliaria.commissions.manage'),
    ('admin_operativo', 'inmobiliaria.commissions.manage'),
    ('gerente_comercial', 'inmobiliaria.commissions.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT o.id, p.codigo, p.descripcion
FROM public.organizaciones o
CROSS JOIN public.tenant_default_permissions p
WHERE p.codigo IN (
    'inmobiliaria.brokers.manage',
    'inmobiliaria.operaciones_externas.create',
    'inmobiliaria.operaciones_externas.validate',
    'inmobiliaria.commissions.manage'
)
ON CONFLICT (organizacion_id, codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion;

INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT r.organizacion_id, r.id, p.id
FROM public.roles r
JOIN public.tenant_default_role_permissions rp
  ON rp.rol_codigo = lower(trim(r.nombre))
JOIN public.permisos p
  ON p.organizacion_id = r.organizacion_id
 AND p.codigo = rp.permiso_codigo
WHERE rp.permiso_codigo IN (
    'inmobiliaria.brokers.manage',
    'inmobiliaria.operaciones_externas.create',
    'inmobiliaria.operaciones_externas.validate',
    'inmobiliaria.commissions.manage'
)
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

COMMIT;
