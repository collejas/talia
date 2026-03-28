-- Security hardening phase 1
-- Objetivo: reducir exposición en tablas públicas sin romper flujo multi-tenant.
-- Nota: aplicar primero en staging aislado.

BEGIN;

-- ============================================================================
-- 1) Tablas tenant-scoped sin RLS (catalogo productos/media + desarrollos mix)
-- ============================================================================

ALTER TABLE IF EXISTS public.lineas_de_negocio ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.familias_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.modelos_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.recursos_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.propiedad_desarrollos_mix ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.propiedad_desarrollos_mix_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lineas_de_negocio_admin_all ON public.lineas_de_negocio;
DROP POLICY IF EXISTS lineas_de_negocio_member_org ON public.lineas_de_negocio;
CREATE POLICY lineas_de_negocio_admin_all
  ON public.lineas_de_negocio
  FOR ALL
  TO authenticated
  USING (public.es_admin(auth.uid()))
  WITH CHECK (public.es_admin(auth.uid()));
CREATE POLICY lineas_de_negocio_member_org
  ON public.lineas_de_negocio
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
  WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS familias_productos_admin_all ON public.familias_productos;
DROP POLICY IF EXISTS familias_productos_member_org ON public.familias_productos;
CREATE POLICY familias_productos_admin_all
  ON public.familias_productos
  FOR ALL
  TO authenticated
  USING (public.es_admin(auth.uid()))
  WITH CHECK (public.es_admin(auth.uid()));
CREATE POLICY familias_productos_member_org
  ON public.familias_productos
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
  WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS modelos_productos_admin_all ON public.modelos_productos;
DROP POLICY IF EXISTS modelos_productos_member_org ON public.modelos_productos;
CREATE POLICY modelos_productos_admin_all
  ON public.modelos_productos
  FOR ALL
  TO authenticated
  USING (public.es_admin(auth.uid()))
  WITH CHECK (public.es_admin(auth.uid()));
CREATE POLICY modelos_productos_member_org
  ON public.modelos_productos
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
  WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS recursos_media_admin_all ON public.recursos_media;
DROP POLICY IF EXISTS recursos_media_member_org ON public.recursos_media;
CREATE POLICY recursos_media_admin_all
  ON public.recursos_media
  FOR ALL
  TO authenticated
  USING (public.es_admin(auth.uid()))
  WITH CHECK (public.es_admin(auth.uid()));
CREATE POLICY recursos_media_member_org
  ON public.recursos_media
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
  WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS propiedad_desarrollos_mix_admin_all ON public.propiedad_desarrollos_mix;
DROP POLICY IF EXISTS propiedad_desarrollos_mix_member_org ON public.propiedad_desarrollos_mix;
CREATE POLICY propiedad_desarrollos_mix_admin_all
  ON public.propiedad_desarrollos_mix
  FOR ALL
  TO authenticated
  USING (public.es_admin(auth.uid()))
  WITH CHECK (public.es_admin(auth.uid()));
CREATE POLICY propiedad_desarrollos_mix_member_org
  ON public.propiedad_desarrollos_mix
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
  WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS propiedad_desarrollos_mix_items_admin_all ON public.propiedad_desarrollos_mix_items;
DROP POLICY IF EXISTS propiedad_desarrollos_mix_items_member_org ON public.propiedad_desarrollos_mix_items;
CREATE POLICY propiedad_desarrollos_mix_items_admin_all
  ON public.propiedad_desarrollos_mix_items
  FOR ALL
  TO authenticated
  USING (public.es_admin(auth.uid()))
  WITH CHECK (public.es_admin(auth.uid()));
CREATE POLICY propiedad_desarrollos_mix_items_member_org
  ON public.propiedad_desarrollos_mix_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.propiedad_desarrollos_mix m
      WHERE m.id = mix_id
        AND m.organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.propiedad_desarrollos_mix m
      WHERE m.id = mix_id
        AND m.organizacion_id = public.usuario_organizacion_id(auth.uid())
    )
  );

-- ============================================================================
-- 2) Tablas internas de plataforma: acceso exclusivo service_role
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_admins',
    'organizacion_rutas_canal',
    'roles_codigo_counters',
    'sales_notification_jobs',
    'tenant_bootstrap_catalog',
    'scian_vector_store_progress'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_service_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t,
        t
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 3) Tabla legacy con RLS habilitado sin policy (advisor lint)
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.propiedad_niveles') IS NOT NULL THEN
    ALTER TABLE public.propiedad_niveles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS propiedad_niveles_service_all ON public.propiedad_niveles;
    CREATE POLICY propiedad_niveles_service_all
      ON public.propiedad_niveles
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 4) Catálogos SCIAN sin organizacion_id: lectura autenticada + escritura service_role
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scian_sector',
    'scian_subsector',
    'scian_rama',
    'scian_subrama',
    'scian_clase',
    'scian_clase_indice'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_authenticated_read ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_authenticated_read ON public.%I FOR SELECT TO authenticated USING (true)',
        t,
        t
      );
      EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_service_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t,
        t
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
