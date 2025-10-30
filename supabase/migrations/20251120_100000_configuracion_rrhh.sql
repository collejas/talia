BEGIN;

CREATE TABLE IF NOT EXISTS public.puestos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre text NOT NULL,
    descripcion text,
    departamento_id uuid REFERENCES public.departamentos(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_puestos_departamento ON public.puestos USING btree (departamento_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_puestos_departamento_nombre ON public.puestos (departamento_id, lower(nombre));

ALTER TABLE public.puestos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'puestos' AND policyname = 'puestos_admin_todo'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY puestos_admin_todo
            ON public.puestos
            USING (public.es_admin(auth.uid()))
            WITH CHECK (public.es_admin(auth.uid()));
        $policy$;
    END IF;
END
$$;

ALTER TABLE public.empleados ADD COLUMN IF NOT EXISTS puesto_id uuid;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'empleados' AND column_name = 'puesto'
    ) THEN
        EXECUTE $sql$
            WITH distinct_puestos AS (
                SELECT DISTINCT
                    COALESCE(NULLIF(btrim(puesto), ''), 'Sin especificar') AS nombre,
                    departamento_id
                FROM public.empleados
            )
            INSERT INTO public.puestos (nombre, departamento_id)
                SELECT nombre, departamento_id
                FROM distinct_puestos
                WHERE nombre IS NOT NULL
                ON CONFLICT (departamento_id, lower(nombre)) DO NOTHING;
        $sql$;

        EXECUTE $sql$
            UPDATE public.empleados e
            SET puesto_id = p.id
            FROM public.puestos p
            WHERE p.nombre = COALESCE(NULLIF(btrim(e.puesto), ''), 'Sin especificar')
              AND (
                    (p.departamento_id = e.departamento_id)
                    OR (p.departamento_id IS NULL AND e.departamento_id IS NULL)
              );
        $sql$;

        EXECUTE 'ALTER TABLE public.empleados DROP COLUMN IF EXISTS puesto';
    END IF;
END
$$;

UPDATE public.empleados e
SET puesto_id = NULL
WHERE puesto_id IS NOT NULL
  AND NOT EXISTS (
        SELECT 1
        FROM public.puestos p
        WHERE p.id = e.puesto_id
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'employees_position_id_fkey'
            AND conrelid = 'public.empleados'::regclass
    ) THEN
        EXECUTE $sql$
            ALTER TABLE public.empleados
                ADD CONSTRAINT employees_position_id_fkey
                FOREIGN KEY (puesto_id) REFERENCES public.puestos(id) ON DELETE SET NULL;
        $sql$;
    END IF;
END
$$;

INSERT INTO public.puestos (nombre, descripcion, departamento_id)
VALUES
    ('Chief Technology Officer (CTO)', 'Define la hoja de ruta tecnica y lidera al equipo de tecnologia.', '04308d0a-fd82-4248-b414-f37eefe2e99e'),
    ('Lider de Desarrollo', 'Coordina proyectos de software y revisa estandares de calidad.', '04308d0a-fd82-4248-b414-f37eefe2e99e'),
    ('Ingeniero DevOps', 'Automatiza despliegues y supervisa infraestructura en la nube.', '04308d0a-fd82-4248-b414-f37eefe2e99e'),
    ('Chief Executive Officer (CEO)', 'Define vision y estrategia general de la empresa.', '28cf6467-f6f7-4061-9b3c-3f947893da8c'),
    ('Asistente de Direccion', 'Gestiona agenda ejecutiva y coordina comunicacion interna clave.', '28cf6467-f6f7-4061-9b3c-3f947893da8c'),
    ('Chief Marketing Officer (CMO)', 'Diseña campañas y estrategia de crecimiento de marca.', '35cec7ba-9e47-491c-9432-a73ddb9d0d6f'),
    ('Especialista en Performance', 'Optimiza anuncios digitales y mide retornos de inversion.', '35cec7ba-9e47-491c-9432-a73ddb9d0d6f'),
    ('Content Manager', 'Produce contenidos y coordina calendario editorial.', '35cec7ba-9e47-491c-9432-a73ddb9d0d6f'),
    ('Gerente de Customer Success', 'Supervisa a los equipos de soporte y retencion de clientes.', '6056a362-905d-4e87-b33b-c2ad38de3179'),
    ('Especialista de Soporte', 'Atiende tickets multicanal y documenta soluciones recurrentes.', '6056a362-905d-4e87-b33b-c2ad38de3179'),
    ('Analista de Calidad de Servicio', 'Monitorea NPS y propone mejoras en la experiencia del cliente.', '6056a362-905d-4e87-b33b-c2ad38de3179'),
    ('Chief Financial Officer (CFO)', 'Gestiona finanzas corporativas y planeacion presupuestal.', '9de45f31-8246-492f-bbde-15afc62f56c3'),
    ('Contador Senior', 'Lleva registros contables y asegura cumplimiento fiscal.', '9de45f31-8246-492f-bbde-15afc62f56c3'),
    ('Analista Financiero', 'Construye reportes y modelos de flujo de efectivo.', '9de45f31-8246-492f-bbde-15afc62f56c3'),
    ('Chief Operations Officer (COO)', 'Optimiza procesos end-to-end y define indicadores clave.', 'ab294a1b-0a7e-4933-b140-6f0ef872ae70'),
    ('Coordinador de Operaciones', 'Supervisa cumplimiento de SLA y documenta procedimientos.', 'ab294a1b-0a7e-4933-b140-6f0ef872ae70'),
    ('Analista de Procesos', 'Mapea workflows e identifica puntos de mejora continua.', 'ab294a1b-0a7e-4933-b140-6f0ef872ae70'),
    ('Chief Revenue Officer (CRO)', 'Dirige estrategia comercial y cumplimiento de metas de venta.', 'b03cddb5-0b93-42d2-a442-a889e28b4a30'),
    ('Account Executive', 'Gestiona negociaciones con cuentas clave y cierre de contratos.', 'b03cddb5-0b93-42d2-a442-a889e28b4a30'),
    ('Sales Development Representative (SDR)', 'Prospeccion inicial y calificacion de oportunidades.', 'b03cddb5-0b93-42d2-a442-a889e28b4a30')
ON CONFLICT (departamento_id, lower(nombre)) DO NOTHING;

CREATE OR REPLACE VIEW public.v_configuracion_personal AS
SELECT
    u.id AS usuario_id,
    u.correo,
    u.nombre_completo,
    u.estado,
    u.telefono_e164,
    u.ultimo_acceso_en,
    u.creado_en AS usuario_creado_en,
    e.es_gestor,
    e.creado_en AS empleado_creado_en,
    e.departamento_id,
    d.nombre AS departamento_nombre,
    e.puesto_id,
    p.nombre AS puesto_nombre,
    p.descripcion AS puesto_descripcion,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'rol_id', ur.rol_id,
                    'codigo', r.codigo,
                    'nombre', r.nombre
                )
                ORDER BY r.codigo
            )
            FROM public.usuarios_roles ur
            JOIN public.roles r ON r.id = ur.rol_id
            WHERE ur.usuario_id = u.id
        ),
        '[]'::jsonb
    ) AS roles
FROM public.usuarios u
LEFT JOIN public.empleados e ON e.usuario_id = u.id
LEFT JOIN public.departamentos d ON d.id = e.departamento_id
LEFT JOIN public.puestos p ON p.id = e.puesto_id;

GRANT SELECT ON public.v_configuracion_personal TO authenticated, service_role;

COMMIT;
