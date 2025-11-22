BEGIN;

-- Añadir organizacion_id y políticas RLS a tablas legadas para mantener compatibilidad con el nuevo esquema multi-tenant.
DO $$
DECLARE
  default_org uuid;
  table_name text;
  policy_tenant text;
  policy_service text;
  constraint_name text;
  column_exists boolean;
  constraint_exists boolean;
BEGIN
  SELECT id
  INTO default_org
  FROM public.organizaciones
  ORDER BY creado_en
  LIMIT 1;

  IF default_org IS NULL THEN
    INSERT INTO public.organizaciones (nombre)
    VALUES ('Legacy Org')
    RETURNING id INTO default_org;
  END IF;

  FOR table_name IN
    SELECT UNNEST(
      ARRAY[
        'clientes',
        'contactos',
        'usuarios',
        'roles',
        'usuarios_roles',
        'lead_tableros',
        'lead_etapas',
        'lead_tarjetas',
        'lead_movimientos',
        'conversaciones',
        'llamadas'
      ]
    )
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = ''public'' AND table_name = %L AND column_name = ''organizacion_id'')',
        table_name
      )
      INTO column_exists;

      IF NOT column_exists THEN
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN organizacion_id uuid', table_name);
      END IF;

      EXECUTE format('UPDATE public.%I SET organizacion_id = $1 WHERE organizacion_id IS NULL', table_name)
        USING default_org;

      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organizacion_id SET NOT NULL', table_name);

      constraint_name := format('%s_organizacion_id_fkey', table_name);
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = ''public'' AND table_name = %L AND constraint_name = %L)',
        table_name,
        constraint_name
      )
      INTO constraint_exists;

      IF NOT constraint_exists THEN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones (id) ON DELETE CASCADE',
          table_name,
          constraint_name
        );
      END IF;

      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (organizacion_id)',
        table_name || '_organizacion_id_idx',
        table_name);

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

      policy_tenant := format('%s_by_tenant', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_tenant, table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (organizacion_id = public.current_organizacion_id()) WITH CHECK (organizacion_id = public.current_organizacion_id())',
        policy_tenant,
        table_name
      );

      policy_service := format('%s_service_role_all', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_service, table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        policy_service,
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;
