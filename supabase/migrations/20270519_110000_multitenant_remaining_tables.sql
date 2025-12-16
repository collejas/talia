BEGIN;

-- Helpers para poblar organizacion_id desde llaves foráneas (para inserts de service_role donde auth.uid() no existe).
CREATE OR REPLACE FUNCTION public.tg_set_org_from_contacto_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF NEW.organizacion_id IS NOT NULL AND NEW.organizacion_id <> '00000000-0000-0000-0000-000000000001'::uuid THEN
        RETURN NEW;
    END IF;
    IF NEW.contacto_id IS NOT NULL THEN
        SELECT c.organizacion_id INTO v_org
        FROM public.contactos c
        WHERE c.id = NEW.contacto_id;
        IF v_org IS NOT NULL THEN
            NEW.organizacion_id := v_org;
            RETURN NEW;
        END IF;
    END IF;
    BEGIN
        v_org := public.usuario_organizacion_id(auth.uid());
    EXCEPTION
        WHEN others THEN
            v_org := NULL;
    END;
    IF v_org IS NOT NULL THEN
        NEW.organizacion_id := v_org;
    ELSIF NEW.organizacion_id IS NULL THEN
        NEW.organizacion_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_org_from_conversacion_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF NEW.organizacion_id IS NOT NULL AND NEW.organizacion_id <> '00000000-0000-0000-0000-000000000001'::uuid THEN
        RETURN NEW;
    END IF;
    IF NEW.conversacion_id IS NOT NULL THEN
        SELECT c.organizacion_id INTO v_org
        FROM public.conversaciones c
        WHERE c.id = NEW.conversacion_id;
        IF v_org IS NOT NULL THEN
            NEW.organizacion_id := v_org;
            RETURN NEW;
        END IF;
    END IF;
    BEGIN
        v_org := public.usuario_organizacion_id(auth.uid());
    EXCEPTION
        WHEN others THEN
            v_org := NULL;
    END;
    IF v_org IS NOT NULL THEN
        NEW.organizacion_id := v_org;
    ELSIF NEW.organizacion_id IS NULL THEN
        NEW.organizacion_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_org_from_mensaje_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF NEW.organizacion_id IS NOT NULL AND NEW.organizacion_id <> '00000000-0000-0000-0000-000000000001'::uuid THEN
        RETURN NEW;
    END IF;
    IF NEW.mensaje_id IS NOT NULL THEN
        SELECT m.organizacion_id INTO v_org
        FROM public.mensajes m
        WHERE m.id = NEW.mensaje_id;
        IF v_org IS NOT NULL THEN
            NEW.organizacion_id := v_org;
            RETURN NEW;
        END IF;
    END IF;
    BEGIN
        v_org := public.usuario_organizacion_id(auth.uid());
    EXCEPTION
        WHEN others THEN
            v_org := NULL;
    END;
    IF v_org IS NOT NULL THEN
        NEW.organizacion_id := v_org;
    ELSIF NEW.organizacion_id IS NULL THEN
        NEW.organizacion_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_org_from_usuario_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF NEW.organizacion_id IS NOT NULL AND NEW.organizacion_id <> '00000000-0000-0000-0000-000000000001'::uuid THEN
        RETURN NEW;
    END IF;
    IF NEW.usuario_id IS NOT NULL THEN
        SELECT u.organizacion_id INTO v_org
        FROM public.usuarios u
        WHERE u.id = NEW.usuario_id;
        IF v_org IS NOT NULL THEN
            NEW.organizacion_id := v_org;
            RETURN NEW;
        END IF;
    END IF;
    BEGIN
        v_org := public.usuario_organizacion_id(auth.uid());
    EXCEPTION
        WHEN others THEN
            v_org := NULL;
    END;
    IF v_org IS NOT NULL THEN
        NEW.organizacion_id := v_org;
    ELSIF NEW.organizacion_id IS NULL THEN
        NEW.organizacion_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_org_from_cotizacion_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF NEW.organizacion_id IS NOT NULL AND NEW.organizacion_id <> '00000000-0000-0000-0000-000000000001'::uuid THEN
        RETURN NEW;
    END IF;
    IF NEW.cotizacion_id IS NOT NULL THEN
        SELECT c.organizacion_id INTO v_org
        FROM public.cotizaciones c
        WHERE c.id = NEW.cotizacion_id;
        IF v_org IS NOT NULL THEN
            NEW.organizacion_id := v_org;
            RETURN NEW;
        END IF;
    END IF;
    BEGIN
        v_org := public.usuario_organizacion_id(auth.uid());
    EXCEPTION
        WHEN others THEN
            v_org := NULL;
    END;
    IF v_org IS NOT NULL THEN
        NEW.organizacion_id := v_org;
    ELSIF NEW.organizacion_id IS NULL THEN
        NEW.organizacion_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_org_from_lead_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF NEW.organizacion_id IS NOT NULL AND NEW.organizacion_id <> '00000000-0000-0000-0000-000000000001'::uuid THEN
        RETURN NEW;
    END IF;
    IF NEW.lead_id IS NOT NULL THEN
        SELECT l.organizacion_id INTO v_org
        FROM public.leads l
        WHERE l.id = NEW.lead_id;
        IF v_org IS NOT NULL THEN
            NEW.organizacion_id := v_org;
            RETURN NEW;
        END IF;
    END IF;
    BEGIN
        v_org := public.usuario_organizacion_id(auth.uid());
    EXCEPTION
        WHEN others THEN
            v_org := NULL;
    END;
    IF v_org IS NOT NULL THEN
        NEW.organizacion_id := v_org;
    ELSIF NEW.organizacion_id IS NULL THEN
        NEW.organizacion_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
    RETURN NEW;
END;
$$;

-- Índices únicos de apoyo para FKs compuestas (organizacion_id, id)
CREATE UNIQUE INDEX IF NOT EXISTS contactos_org_id_id_key
    ON public.contactos (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_org_id_id_key
    ON public.usuarios (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS cotizaciones_org_id_id_key
    ON public.cotizaciones (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS productos_org_id_id_key
    ON public.productos (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS leads_org_id_id_key
    ON public.leads (organizacion_id, id);

-- =================
-- Inbox: conversaciones / mensajes / adjuntos y derivados
-- =================

ALTER TABLE public.conversaciones
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
-- Backfill: la conversación pertenece a la org del contacto.
UPDATE public.conversaciones c
SET organizacion_id = ct.organizacion_id
FROM public.contactos ct
WHERE ct.id = c.contacto_id
  AND c.organizacion_id <> ct.organizacion_id;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='conversaciones_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.conversaciones
            ADD CONSTRAINT conversaciones_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS conversaciones_org_id_id_key
    ON public.conversaciones (organizacion_id, id);

ALTER TABLE public.conversaciones
    DROP CONSTRAINT IF EXISTS conversaciones_contacto_id_fkey;
ALTER TABLE public.conversaciones
    DROP CONSTRAINT IF EXISTS conversations_contact_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='conversaciones_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.conversaciones
            ADD CONSTRAINT conversaciones_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

DROP TRIGGER IF EXISTS t_conversaciones_set_org ON public.conversaciones;
CREATE TRIGGER t_conversaciones_set_org
    BEFORE INSERT ON public.conversaciones
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_contacto_id();

ALTER TABLE public.mensajes
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
-- Backfill: el mensaje pertenece a la org de la conversación.
UPDATE public.mensajes m
SET organizacion_id = c.organizacion_id
FROM public.conversaciones c
WHERE c.id = m.conversacion_id
  AND m.organizacion_id <> c.organizacion_id;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='mensajes_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.mensajes
            ADD CONSTRAINT mensajes_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS mensajes_org_id_id_key
    ON public.mensajes (organizacion_id, id);

ALTER TABLE public.mensajes
    DROP CONSTRAINT IF EXISTS mensajes_conversacion_id_fkey;
ALTER TABLE public.mensajes
    DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='mensajes_conversacion_org_fkey'
    ) THEN
        ALTER TABLE public.mensajes
            ADD CONSTRAINT mensajes_conversacion_org_fkey
            FOREIGN KEY (organizacion_id, conversacion_id)
            REFERENCES public.conversaciones(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

DROP TRIGGER IF EXISTS t_mensajes_set_org ON public.mensajes;
CREATE TRIGGER t_mensajes_set_org
    BEFORE INSERT ON public.mensajes
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_conversacion_id();

ALTER TABLE public.adjuntos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
-- Backfill: el adjunto pertenece a la org del mensaje.
UPDATE public.adjuntos a
SET organizacion_id = m.organizacion_id
FROM public.mensajes m
WHERE m.id = a.mensaje_id
  AND a.organizacion_id <> m.organizacion_id;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='adjuntos_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.adjuntos
            ADD CONSTRAINT adjuntos_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS adjuntos_org_id_id_key
    ON public.adjuntos (organizacion_id, id);

ALTER TABLE public.adjuntos
    DROP CONSTRAINT IF EXISTS attachments_message_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='adjuntos_mensaje_org_fkey'
    ) THEN
        ALTER TABLE public.adjuntos
            ADD CONSTRAINT adjuntos_mensaje_org_fkey
            FOREIGN KEY (organizacion_id, mensaje_id)
            REFERENCES public.mensajes(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

DROP TRIGGER IF EXISTS t_adjuntos_set_org ON public.adjuntos;
CREATE TRIGGER t_adjuntos_set_org
    BEFORE INSERT ON public.adjuntos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_mensaje_id();

-- conversation_summaries: endurece FK a conversacion por tenant
-- Backfill: por si quedó en legacy por defecto.
UPDATE public.conversation_summaries cs
SET organizacion_id = c.organizacion_id
FROM public.conversaciones c
WHERE c.id = cs.conversacion_id
  AND cs.organizacion_id <> c.organizacion_id;
ALTER TABLE public.conversation_summaries
    DROP CONSTRAINT IF EXISTS conversation_summaries_conversacion_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='conversation_summaries_conversacion_org_fkey'
    ) THEN
        ALTER TABLE public.conversation_summaries
            ADD CONSTRAINT conversation_summaries_conversacion_org_fkey
            FOREIGN KEY (organizacion_id, conversacion_id)
            REFERENCES public.conversaciones(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- Tablas 1:1 por conversacion_id
ALTER TABLE public.conversaciones_controles
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE public.conversaciones_controles cc
SET organizacion_id = c.organizacion_id
FROM public.conversaciones c
WHERE c.id = cc.conversacion_id
  AND cc.organizacion_id <> c.organizacion_id;
ALTER TABLE public.conversaciones_controles
    DROP CONSTRAINT IF EXISTS conversaciones_controles_conversacion_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='conversaciones_controles_conversacion_org_fkey'
    ) THEN
        ALTER TABLE public.conversaciones_controles
            ADD CONSTRAINT conversaciones_controles_conversacion_org_fkey
            FOREIGN KEY (organizacion_id, conversacion_id)
            REFERENCES public.conversaciones(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;
DROP TRIGGER IF EXISTS t_conversaciones_controles_set_org ON public.conversaciones_controles;
CREATE TRIGGER t_conversaciones_controles_set_org
    BEFORE INSERT ON public.conversaciones_controles
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_conversacion_id();

ALTER TABLE public.conversaciones_insights
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE public.conversaciones_insights ci
SET organizacion_id = c.organizacion_id
FROM public.conversaciones c
WHERE c.id = ci.conversacion_id
  AND ci.organizacion_id <> c.organizacion_id;
ALTER TABLE public.conversaciones_insights
    DROP CONSTRAINT IF EXISTS conversaciones_insights_conversacion_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='conversaciones_insights_conversacion_org_fkey'
    ) THEN
        ALTER TABLE public.conversaciones_insights
            ADD CONSTRAINT conversaciones_insights_conversacion_org_fkey
            FOREIGN KEY (organizacion_id, conversacion_id)
            REFERENCES public.conversaciones(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;
DROP TRIGGER IF EXISTS t_conversaciones_insights_set_org ON public.conversaciones_insights;
CREATE TRIGGER t_conversaciones_insights_set_org
    BEFORE INSERT ON public.conversaciones_insights
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_conversacion_id();

ALTER TABLE public.ejecuciones_asistente
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE public.ejecuciones_asistente ea
SET organizacion_id = c.organizacion_id
FROM public.conversaciones c
WHERE c.id = ea.conversacion_id
  AND ea.organizacion_id <> c.organizacion_id;
ALTER TABLE public.ejecuciones_asistente
    DROP CONSTRAINT IF EXISTS ejecuciones_asistente_conversacion_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='ejecuciones_asistente_conversacion_org_fkey'
    ) THEN
        ALTER TABLE public.ejecuciones_asistente
            ADD CONSTRAINT ejecuciones_asistente_conversacion_org_fkey
            FOREIGN KEY (organizacion_id, conversacion_id)
            REFERENCES public.conversaciones(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;
DROP TRIGGER IF EXISTS t_ejecuciones_asistente_set_org ON public.ejecuciones_asistente;
CREATE TRIGGER t_ejecuciones_asistente_set_org
    BEFORE INSERT ON public.ejecuciones_asistente
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_conversacion_id();

-- Delivery events: por mensaje
ALTER TABLE public.eventos_entrega
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE public.eventos_entrega ee
SET organizacion_id = m.organizacion_id
FROM public.mensajes m
WHERE m.id = ee.mensaje_id
  AND ee.organizacion_id <> m.organizacion_id;
ALTER TABLE public.eventos_entrega
    DROP CONSTRAINT IF EXISTS eventos_entrega_mensaje_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='eventos_entrega_mensaje_org_fkey'
    ) THEN
        ALTER TABLE public.eventos_entrega
            ADD CONSTRAINT eventos_entrega_mensaje_org_fkey
            FOREIGN KEY (organizacion_id, mensaje_id)
            REFERENCES public.mensajes(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;
DROP TRIGGER IF EXISTS t_eventos_entrega_set_org ON public.eventos_entrega;
CREATE TRIGGER t_eventos_entrega_set_org
    BEFORE INSERT ON public.eventos_entrega
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_mensaje_id();

-- =================
-- CRM/operación: departamentos/puestos/empleados
-- =================

ALTER TABLE public.departamentos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='departamentos_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.departamentos
            ADD CONSTRAINT departamentos_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS departamentos_org_id_id_key
    ON public.departamentos (organizacion_id, id);

ALTER TABLE public.departamentos
    DROP CONSTRAINT IF EXISTS departamentos_departamento_padre_id_fkey;
ALTER TABLE public.departamentos
    DROP CONSTRAINT IF EXISTS departments_parent_department_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='departamentos_padre_org_fkey'
    ) THEN
        ALTER TABLE public.departamentos
            ADD CONSTRAINT departamentos_padre_org_fkey
            FOREIGN KEY (organizacion_id, departamento_padre_id)
            REFERENCES public.departamentos(organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

DROP TRIGGER IF EXISTS t_departamentos_set_org ON public.departamentos;
CREATE TRIGGER t_departamentos_set_org
    BEFORE INSERT ON public.departamentos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

ALTER TABLE public.puestos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='puestos_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.puestos
            ADD CONSTRAINT puestos_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS puestos_org_id_id_key
    ON public.puestos (organizacion_id, id);

ALTER TABLE public.puestos
    DROP CONSTRAINT IF EXISTS puestos_departamento_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='puestos_departamento_org_fkey'
    ) THEN
        ALTER TABLE public.puestos
            ADD CONSTRAINT puestos_departamento_org_fkey
            FOREIGN KEY (organizacion_id, departamento_id)
            REFERENCES public.departamentos(organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

DROP TRIGGER IF EXISTS t_puestos_set_org ON public.puestos;
CREATE TRIGGER t_puestos_set_org
    BEFORE INSERT ON public.puestos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

ALTER TABLE public.empleados
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
-- Backfill: el empleado pertenece a la org del usuario.
UPDATE public.empleados e
SET organizacion_id = u.organizacion_id
FROM public.usuarios u
WHERE u.id = e.usuario_id
  AND e.organizacion_id <> u.organizacion_id;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='empleados_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.empleados
            ADD CONSTRAINT empleados_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE public.empleados
    DROP CONSTRAINT IF EXISTS empleados_usuario_id_fkey;
ALTER TABLE public.empleados
    DROP CONSTRAINT IF EXISTS employees_user_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='empleados_usuario_org_fkey'
    ) THEN
        ALTER TABLE public.empleados
            ADD CONSTRAINT empleados_usuario_org_fkey
            FOREIGN KEY (organizacion_id, usuario_id)
            REFERENCES public.usuarios(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE public.empleados
    DROP CONSTRAINT IF EXISTS empleados_departamento_id_fkey;
ALTER TABLE public.empleados
    DROP CONSTRAINT IF EXISTS employees_department_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='empleados_departamento_org_fkey'
    ) THEN
        ALTER TABLE public.empleados
            ADD CONSTRAINT empleados_departamento_org_fkey
            FOREIGN KEY (organizacion_id, departamento_id)
            REFERENCES public.departamentos(organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

ALTER TABLE public.empleados
    DROP CONSTRAINT IF EXISTS empleados_puesto_id_fkey;
ALTER TABLE public.empleados
    DROP CONSTRAINT IF EXISTS employees_position_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='empleados_puesto_org_fkey'
    ) THEN
        ALTER TABLE public.empleados
            ADD CONSTRAINT empleados_puesto_org_fkey
            FOREIGN KEY (organizacion_id, puesto_id)
            REFERENCES public.puestos(organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

DROP TRIGGER IF EXISTS t_empleados_set_org ON public.empleados;
CREATE TRIGGER t_empleados_set_org
    BEFORE INSERT ON public.empleados
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_usuario_id();

-- =================
-- Cotizaciones: items
-- =================

ALTER TABLE public.cotizacion_items
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE public.cotizacion_items ci
SET organizacion_id = c.organizacion_id
FROM public.cotizaciones c
WHERE c.id = ci.cotizacion_id
  AND ci.organizacion_id <> c.organizacion_id;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='cotizacion_items_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.cotizacion_items
            ADD CONSTRAINT cotizacion_items_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;
CREATE INDEX IF NOT EXISTS cotizacion_items_org_idx
    ON public.cotizacion_items (organizacion_id, cotizacion_id);

ALTER TABLE public.cotizacion_items
    DROP CONSTRAINT IF EXISTS cotizacion_items_cotizacion_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='cotizacion_items_cotizacion_org_fkey'
    ) THEN
        ALTER TABLE public.cotizacion_items
            ADD CONSTRAINT cotizacion_items_cotizacion_org_fkey
            FOREIGN KEY (organizacion_id, cotizacion_id)
            REFERENCES public.cotizaciones(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE public.cotizacion_items
    DROP CONSTRAINT IF EXISTS cotizacion_items_producto_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='cotizacion_items_producto_org_fkey'
    ) THEN
        ALTER TABLE public.cotizacion_items
            ADD CONSTRAINT cotizacion_items_producto_org_fkey
            FOREIGN KEY (organizacion_id, producto_id)
            REFERENCES public.productos(organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

DROP TRIGGER IF EXISTS t_cotizacion_items_set_org ON public.cotizacion_items;
CREATE TRIGGER t_cotizacion_items_set_org
    BEFORE INSERT ON public.cotizacion_items
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_cotizacion_id();

-- =================
-- Leads: eventos
-- =================

ALTER TABLE public.lead_eventos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE public.lead_eventos le
SET organizacion_id = l.organizacion_id
FROM public.leads l
WHERE l.id = le.lead_id
  AND le.organizacion_id <> l.organizacion_id;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='lead_eventos_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.lead_eventos
            ADD CONSTRAINT lead_eventos_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE public.lead_eventos
    DROP CONSTRAINT IF EXISTS lead_eventos_lead_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='lead_eventos_lead_org_fkey'
    ) THEN
        ALTER TABLE public.lead_eventos
            ADD CONSTRAINT lead_eventos_lead_org_fkey
            FOREIGN KEY (organizacion_id, lead_id)
            REFERENCES public.leads(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

DROP TRIGGER IF EXISTS t_lead_eventos_set_org ON public.lead_eventos;
CREATE TRIGGER t_lead_eventos_set_org
    BEFORE INSERT ON public.lead_eventos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_lead_id();

-- =================
-- Identidades de canal (por contacto)
-- =================

ALTER TABLE public.identidades_canal
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE public.identidades_canal ic
SET organizacion_id = c.organizacion_id
FROM public.contactos c
WHERE c.id = ic.contacto_id
  AND ic.organizacion_id <> c.organizacion_id;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='identidades_canal_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.identidades_canal
            ADD CONSTRAINT identidades_canal_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE public.identidades_canal
    DROP CONSTRAINT IF EXISTS channel_identities_contact_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='identidades_canal_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.identidades_canal
            ADD CONSTRAINT identidades_canal_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- Uniques por tenant (evita colisiones cross-tenant)
ALTER TABLE public.identidades_canal
    DROP CONSTRAINT IF EXISTS channel_identities_channel_external_id_key;
ALTER TABLE public.identidades_canal
    DROP CONSTRAINT IF EXISTS channel_identities_contact_id_channel_key;

CREATE UNIQUE INDEX IF NOT EXISTS identidades_canal_org_canal_externo_key
    ON public.identidades_canal (organizacion_id, canal, id_externo);
CREATE UNIQUE INDEX IF NOT EXISTS identidades_canal_org_contacto_canal_key
    ON public.identidades_canal (organizacion_id, contacto_id, canal);

DROP TRIGGER IF EXISTS t_identidades_canal_set_org ON public.identidades_canal;
CREATE TRIGGER t_identidades_canal_set_org
    BEFORE INSERT ON public.identidades_canal
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_contacto_id();

-- =================
-- Llamadas (por contacto)
-- =================

ALTER TABLE public.llamadas
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE public.llamadas lla
SET organizacion_id = c.organizacion_id
FROM public.contactos c
WHERE c.id = lla.contacto_id
  AND lla.contacto_id IS NOT NULL
  AND lla.organizacion_id <> c.organizacion_id;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='llamadas_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.llamadas
            ADD CONSTRAINT llamadas_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE public.llamadas
    DROP CONSTRAINT IF EXISTS calls_contact_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='llamadas_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.llamadas
            ADD CONSTRAINT llamadas_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos(organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

DROP TRIGGER IF EXISTS t_llamadas_set_org ON public.llamadas;
CREATE TRIGGER t_llamadas_set_org
    BEFORE INSERT ON public.llamadas
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_contacto_id();

-- =================
-- Logos / Quote templates (por tenant)
-- =================

ALTER TABLE public.logos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
-- Backfill: si el logo fue subido por un usuario, usa su org.
UPDATE public.logos l
SET organizacion_id = u.organizacion_id
FROM public.usuarios u
WHERE u.id = l.uploaded_by
  AND l.organizacion_id <> u.organizacion_id;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='logos_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.logos
            ADD CONSTRAINT logos_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

DROP TRIGGER IF EXISTS t_logos_set_org ON public.logos;
CREATE TRIGGER t_logos_set_org
    BEFORE INSERT ON public.logos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

ALTER TABLE public.quote_templates
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='quote_templates_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.quote_templates
            ADD CONSTRAINT quote_templates_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE public.quote_templates
    DROP CONSTRAINT IF EXISTS quote_templates_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS quote_templates_org_slug_key
    ON public.quote_templates (organizacion_id, slug);

DROP TRIGGER IF EXISTS t_quote_templates_set_org ON public.quote_templates;
CREATE TRIGGER t_quote_templates_set_org
    BEFORE INSERT ON public.quote_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

-- =================
-- Panel settings/email templates: slug deja de ser global (PK compuesto)
-- =================

ALTER TABLE public.panel_calendar_settings
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='panel_calendar_settings_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.panel_calendar_settings
            ADD CONSTRAINT panel_calendar_settings_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;
ALTER TABLE public.panel_calendar_settings
    DROP CONSTRAINT IF EXISTS panel_calendar_settings_pkey;
ALTER TABLE public.panel_calendar_settings
    ADD CONSTRAINT panel_calendar_settings_pkey PRIMARY KEY (organizacion_id, slug);
CREATE INDEX IF NOT EXISTS panel_calendar_settings_org_idx
    ON public.panel_calendar_settings (organizacion_id, updated_at DESC);

DROP TRIGGER IF EXISTS t_panel_calendar_settings_set_org ON public.panel_calendar_settings;
CREATE TRIGGER t_panel_calendar_settings_set_org
    BEFORE INSERT ON public.panel_calendar_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

ALTER TABLE public.panel_email_templates
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='panel_email_templates_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.panel_email_templates
            ADD CONSTRAINT panel_email_templates_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;
ALTER TABLE public.panel_email_templates
    DROP CONSTRAINT IF EXISTS panel_email_templates_pkey;
ALTER TABLE public.panel_email_templates
    ADD CONSTRAINT panel_email_templates_pkey PRIMARY KEY (organizacion_id, slug);
CREATE INDEX IF NOT EXISTS panel_email_templates_org_idx
    ON public.panel_email_templates (organizacion_id, updated_at DESC);

DROP TRIGGER IF EXISTS t_panel_email_templates_set_org ON public.panel_email_templates;
CREATE TRIGGER t_panel_email_templates_set_org
    BEFORE INSERT ON public.panel_email_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

-- =================
-- Permisos / roles_permisos: tenant-scoped
-- =================

ALTER TABLE public.permisos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='permisos_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.permisos
            ADD CONSTRAINT permisos_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS permisos_org_id_id_key
    ON public.permisos (organizacion_id, id);

ALTER TABLE public.permisos
    DROP CONSTRAINT IF EXISTS permissions_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS permisos_org_codigo_key
    ON public.permisos (organizacion_id, codigo);

DROP TRIGGER IF EXISTS t_permisos_set_org ON public.permisos;
CREATE TRIGGER t_permisos_set_org
    BEFORE INSERT ON public.permisos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

ALTER TABLE public.roles
    DROP CONSTRAINT IF EXISTS roles_organizacion_id_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS roles_org_id_id_key
    ON public.roles (organizacion_id, id);

ALTER TABLE public.roles_permisos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='roles_permisos_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.roles_permisos
            ADD CONSTRAINT roles_permisos_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE public.roles_permisos
    DROP CONSTRAINT IF EXISTS role_permissions_role_id_fkey;
ALTER TABLE public.roles_permisos
    DROP CONSTRAINT IF EXISTS role_permissions_permission_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='roles_permisos_rol_org_fkey'
    ) THEN
        ALTER TABLE public.roles_permisos
            ADD CONSTRAINT roles_permisos_rol_org_fkey
            FOREIGN KEY (organizacion_id, rol_id)
            REFERENCES public.roles(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='roles_permisos_permiso_org_fkey'
    ) THEN
        ALTER TABLE public.roles_permisos
            ADD CONSTRAINT roles_permisos_permiso_org_fkey
            FOREIGN KEY (organizacion_id, permiso_id)
            REFERENCES public.permisos(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE public.roles_permisos
    DROP CONSTRAINT IF EXISTS role_permissions_pkey;
ALTER TABLE public.roles_permisos
    ADD CONSTRAINT roles_permisos_pkey PRIMARY KEY (organizacion_id, rol_id, permiso_id);

DROP TRIGGER IF EXISTS t_roles_permisos_set_org ON public.roles_permisos;
CREATE TRIGGER t_roles_permisos_set_org
    BEFORE INSERT ON public.roles_permisos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

-- =================
-- Secretos: tenant-scoped (clave deja de ser global)
-- =================

ALTER TABLE public.secretos
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='secretos_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.secretos
            ADD CONSTRAINT secretos_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

ALTER TABLE public.secretos
    DROP CONSTRAINT IF EXISTS secretos_clave_key;
CREATE UNIQUE INDEX IF NOT EXISTS secretos_org_clave_key
    ON public.secretos (organizacion_id, clave);

DROP TRIGGER IF EXISTS t_secretos_set_org ON public.secretos;
CREATE TRIGGER t_secretos_set_org
    BEFORE INSERT ON public.secretos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

-- =================
-- Webchat: session_id deja de ser global (PK compuesto). Org se deriva de contacto si existe.
-- =================

ALTER TABLE public.webchat_visitantes
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE public.webchat_visitantes wv
SET organizacion_id = c.organizacion_id
FROM public.contactos c
WHERE c.id = wv.contacto_id
  AND wv.contacto_id IS NOT NULL
  AND wv.organizacion_id <> c.organizacion_id;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='webchat_visitantes_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.webchat_visitantes
            ADD CONSTRAINT webchat_visitantes_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;
ALTER TABLE public.webchat_visitantes
    DROP CONSTRAINT IF EXISTS webchat_visitantes_contacto_fk;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='webchat_visitantes_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.webchat_visitantes
            ADD CONSTRAINT webchat_visitantes_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;
ALTER TABLE public.webchat_visitantes
    DROP CONSTRAINT IF EXISTS webchat_visitantes_pkey;
ALTER TABLE public.webchat_visitantes
    ADD CONSTRAINT webchat_visitantes_pkey PRIMARY KEY (organizacion_id, session_id);

DROP TRIGGER IF EXISTS t_webchat_visitantes_set_org ON public.webchat_visitantes;
CREATE TRIGGER t_webchat_visitantes_set_org
    BEFORE INSERT ON public.webchat_visitantes
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_contacto_id();

ALTER TABLE public.webchat_session_closures
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
UPDATE public.webchat_session_closures wc
SET organizacion_id = c.organizacion_id
FROM public.contactos c
WHERE c.id = wc.contacto_id
  AND wc.contacto_id IS NOT NULL
  AND wc.organizacion_id <> c.organizacion_id;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='webchat_session_closures_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.webchat_session_closures
            ADD CONSTRAINT webchat_session_closures_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;
ALTER TABLE public.webchat_session_closures
    DROP CONSTRAINT IF EXISTS webchat_session_closures_contacto_fk;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='webchat_session_closures_contacto_org_fkey'
    ) THEN
        ALTER TABLE public.webchat_session_closures
            ADD CONSTRAINT webchat_session_closures_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos(organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;
ALTER TABLE public.webchat_session_closures
    DROP CONSTRAINT IF EXISTS webchat_session_closures_pkey;
ALTER TABLE public.webchat_session_closures
    ADD CONSTRAINT webchat_session_closures_pkey PRIMARY KEY (organizacion_id, session_id);

DROP TRIGGER IF EXISTS t_webchat_session_closures_set_org ON public.webchat_session_closures;
CREATE TRIGGER t_webchat_session_closures_set_org
    BEFORE INSERT ON public.webchat_session_closures
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_org_from_contacto_id();

-- =================
-- Webhooks entrantes: tenant-scoped (requiere que backend setee organizacion_id al insertar)
-- =================

ALTER TABLE public.webhooks_entrantes
    ADD COLUMN IF NOT EXISTS organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='webhooks_entrantes_organizacion_id_fkey'
    ) THEN
        ALTER TABLE public.webhooks_entrantes
            ADD CONSTRAINT webhooks_entrantes_organizacion_id_fkey
            FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;
    END IF;
END
$$;

DROP TRIGGER IF EXISTS t_webhooks_entrantes_set_org ON public.webhooks_entrantes;
CREATE TRIGGER t_webhooks_entrantes_set_org
    BEFORE INSERT ON public.webhooks_entrantes
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

-- =================
-- Organizaciones: RLS para que un usuario solo vea su organización
-- =================

ALTER TABLE public.organizaciones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.organizaciones FROM anon;

DROP POLICY IF EXISTS organizaciones_select_member ON public.organizaciones;
DROP POLICY IF EXISTS organizaciones_update_admin ON public.organizaciones;

CREATE POLICY organizaciones_select_member
    ON public.organizaciones
    FOR SELECT
    TO authenticated
    USING (id = public.usuario_organizacion_id((SELECT auth.uid())));

CREATE POLICY organizaciones_update_admin
    ON public.organizaciones
    FOR UPDATE
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        AND id = public.usuario_organizacion_id((SELECT auth.uid()))
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        AND id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

-- =================
-- Ajustes de RLS para tablas que tenían SELECT true (ahora por tenant)
-- =================

-- Logos
DROP POLICY IF EXISTS logos_select ON public.logos;
CREATE POLICY logos_select
    ON public.logos
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

-- Quote templates
DROP POLICY IF EXISTS quote_templates_select ON public.quote_templates;
CREATE POLICY quote_templates_select
    ON public.quote_templates
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

-- Panel settings/templates
DROP POLICY IF EXISTS panel_calendar_settings_select_authenticated ON public.panel_calendar_settings;
CREATE POLICY panel_calendar_settings_select_authenticated
    ON public.panel_calendar_settings
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

DROP POLICY IF EXISTS panel_email_templates_select_authenticated ON public.panel_email_templates;
CREATE POLICY panel_email_templates_select_authenticated
    ON public.panel_email_templates
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

-- Endurece admin-only: permisos, roles_permisos, secretos, departamentos, puestos, webhooks
-- (mantiene el patrón de "solo admin", pero por tenant)
DROP POLICY IF EXISTS permisos_admin ON public.permisos;
CREATE POLICY permisos_admin
    ON public.permisos
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS roles_permisos_admin ON public.roles_permisos;
CREATE POLICY roles_permisos_admin
    ON public.roles_permisos
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS secretos_admin ON public.secretos;
CREATE POLICY secretos_admin
    ON public.secretos
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS departamentos_admin ON public.departamentos;
CREATE POLICY departamentos_admin
    ON public.departamentos
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS puestos_admin ON public.puestos;
CREATE POLICY puestos_admin
    ON public.puestos
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS webhooks_entrantes_admin ON public.webhooks_entrantes;
CREATE POLICY webhooks_entrantes_admin
    ON public.webhooks_entrantes
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

COMMIT;
