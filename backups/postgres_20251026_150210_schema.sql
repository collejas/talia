--
-- PostgreSQL database dump
--

\restrict KngbSnC8axmSVW9UCravON1V0U0tHFFMsv6PExsK95iT2r2GKjstPqcLMqiMKQT

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6 (Ubuntu 17.6-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- Name: EXTENSION pg_graphql; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_graphql IS 'pg_graphql: GraphQL support';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: fuente_resultado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fuente_resultado AS ENUM (
    'google_places',
    'denue'
);


--
-- Name: lead_categoria; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_categoria AS ENUM (
    'abierta',
    'ganada',
    'perdida'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
begin
    raise debug 'PgBouncer auth request: %', p_usename;

    return query
    select 
        rolname::text, 
        case when rolvaliduntil < now() 
            then null 
            else rolpassword::text 
        end 
    from pg_authid 
    where rolname=$1 and rolcanlogin;
end;
$_$;


--
-- Name: crear_busqueda(public.fuente_resultado, text, integer, double precision, double precision, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_busqueda(p_fuente public.fuente_resultado, p_query text, p_radio_m integer, p_lat double precision, p_lng double precision, p_total integer, p_meta jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare v_id uuid;
begin
  insert into public.busquedas(fuente, query, radio_m, lat, lng, total_encontrados, meta)
  values (p_fuente, p_query, p_radio_m, p_lat, p_lng, p_total, coalesce(p_meta,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end$$;


--
-- Name: es_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_admin(uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.usuarios_roles ur
    join public.roles r on r.id = ur.rol_id
    where ur.usuario_id = uid and r.codigo = 'admin'
  );
$$;


--
-- Name: FUNCTION es_admin(uid uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.es_admin(uid uuid) IS 'Devuelve true si el usuario tiene el rol admin. SECURITY DEFINER para evitar recursión con RLS.';


--
-- Name: manejar_usuario_auth_nuevo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manejar_usuario_auth_nuevo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.usuarios (id, correo, nombre_completo, telefono_e164)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'full_name'), new.email),
    coalesce(nullif(new.phone, ''), '+00000000000')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


--
-- Name: prevent_remove_last_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_remove_last_admin() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  admin_role_id uuid;
  remaining_admins int;
  affected_role_id uuid;
begin
  -- Resolver rol afectado según operación
  if TG_OP = 'DELETE' then
    affected_role_id := OLD.rol_id;
  elsif TG_OP = 'UPDATE' then
    -- si cambia el rol_id desde admin a otro
    affected_role_id := OLD.rol_id; -- evaluamos el rol previo
  else
    return null;
  end if;

  -- Obtener id del rol admin
  select id into admin_role_id from public.roles where codigo = 'admin' limit 1;
  if admin_role_id is null then
    return null; -- si no existe, no aplica
  end if;

  -- Solo validar si el cambio afecta a una fila con rol admin
  if affected_role_id = admin_role_id then
    -- Contar admins restantes excluyendo la fila que se borra o cambia
    select count(*) into remaining_admins
    from public.usuarios_roles ur
    where ur.rol_id = admin_role_id
      and not (ur.usuario_id = OLD.usuario_id and ur.rol_id = OLD.rol_id);

    if remaining_admins <= 0 then
      raise exception 'Debe existir al menos un usuario con rol admin';
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;


--
-- Name: puede_ver_conversacion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_ver_conversacion(p_conversacion_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.conversaciones c
        LEFT JOIN public.contactos ct ON ct.id = c.contacto_id
        WHERE c.id = p_conversacion_id
          AND (
            ct.propietario_usuario_id = auth.uid()
            OR c.asignado_a_usuario_id = auth.uid()
          )
    );
$$;


--
-- Name: FUNCTION puede_ver_conversacion(p_conversacion_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.puede_ver_conversacion(p_conversacion_id uuid) IS 'Retorna true cuando la conversación pertenece al usuario actual (propietario del contacto o asignado).';


--
-- Name: puede_ver_lead(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_ver_lead(p_tarjeta_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.lead_tarjetas lt
          JOIN public.contactos ct ON ct.id = lt.contacto_id
         WHERE lt.id = p_tarjeta_id
           AND (
                public.es_admin(auth.uid())
                OR ct.propietario_usuario_id = auth.uid()
                OR lt.propietario_usuario_id = auth.uid()
                OR lt.asignado_a_usuario_id = auth.uid()
            )
    );
$$;


--
-- Name: FUNCTION puede_ver_lead(p_tarjeta_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.puede_ver_lead(p_tarjeta_id uuid) IS 'True cuando el usuario actual es admin, propietario o asignado a la tarjeta.';


--
-- Name: puede_ver_mensaje(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_ver_mensaje(p_mensaje_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.mensajes m
        WHERE m.id = p_mensaje_id
          AND public.puede_ver_conversacion(m.conversacion_id)
    );
$$;


--
-- Name: FUNCTION puede_ver_mensaje(p_mensaje_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.puede_ver_mensaje(p_mensaje_id uuid) IS 'Retorna true cuando el mensaje pertenece a una conversación visible para el usuario actual.';


--
-- Name: puede_ver_tablero(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_ver_tablero(p_tablero_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.lead_tableros t
         WHERE t.id = p_tablero_id
           AND (
                public.es_admin(auth.uid())
                OR t.propietario_usuario_id = auth.uid()
                OR t.es_default = TRUE
            )
    );
$$;


--
-- Name: FUNCTION puede_ver_tablero(p_tablero_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.puede_ver_tablero(p_tablero_id uuid) IS 'Determina si el usuario actual puede visualizar el tablero especificado.';


--
-- Name: registrar_mensaje_webchat(text, text, text, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_mensaje_webchat(p_session_id text, p_author text, p_content text, p_response_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_inactivity_hours integer DEFAULT NULL::integer) RETURNS TABLE(conversacion_id uuid, mensaje_id uuid, conversacion_openai_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_contact_id uuid;
    v_conversacion_id uuid;
    v_mensaje_id uuid;
    v_direction text;
    v_estado text;
    v_now timestamptz := now();
    v_conv_openai text;
    v_last_activity timestamptz;
    v_hours integer := COALESCE(p_inactivity_hours, 24);
BEGIN
    IF p_session_id IS NULL OR length(trim(p_session_id)) = 0 THEN
        RAISE EXCEPTION 'session_id requerido';
    END IF;

    SELECT c.id
      INTO v_contact_id
      FROM public.identidades_canal ic
      JOIN public.contactos c ON c.id = ic.contacto_id
     WHERE ic.canal = 'webchat'
       AND ic.id_externo = p_session_id
     LIMIT 1;

    IF NOT FOUND THEN
        INSERT INTO public.contactos (nombre_completo, origen, contacto_datos)
        VALUES ('Visitante Webchat', 'webchat', jsonb_build_object('session_id', p_session_id))
        RETURNING id INTO v_contact_id;

        INSERT INTO public.identidades_canal (contacto_id, canal, id_externo, metadatos)
        VALUES (v_contact_id, 'webchat', p_session_id, coalesce(p_metadata, '{}'::jsonb));
    END IF;

    -- Busca conversación abierta reciente (<= v_hours) para continuar el hilo
    SELECT c.id, c.ultimo_mensaje_en, c.conversacion_openai_id
      INTO v_conversacion_id, v_last_activity, v_conv_openai
      FROM public.conversaciones AS c
     WHERE contacto_id = v_contact_id
       AND canal = 'webchat'
       AND estado <> 'cerrada'
     ORDER BY iniciada_en DESC
     LIMIT 1;

    IF FOUND THEN
        IF v_last_activity IS NULL OR v_last_activity < (v_now - make_interval(hours => v_hours)) THEN
            -- Más de 24h sin actividad: abrir nueva conversación
            v_conversacion_id := NULL;
        END IF;
    END IF;

    IF v_conversacion_id IS NULL THEN
        INSERT INTO public.conversaciones (
            contacto_id, canal, estado, iniciada_en, ultimo_mensaje_en, ultimo_entrante_en
        )
        VALUES (v_contact_id, 'webchat', 'abierta', v_now, v_now, v_now)
        RETURNING id INTO v_conversacion_id;
        v_conv_openai := NULL; -- reinicia el id de conversación de OpenAI en nuevo hilo
    END IF;

    IF coalesce(p_author, 'user') = 'user' THEN
        v_direction := 'entrante';
        v_estado := 'entregada';
    ELSE
        v_direction := 'saliente';
        v_estado := 'enviada';
    END IF;

    INSERT INTO public.mensajes (
        conversacion_id,
        direccion,
        tipo_contenido,
        texto,
        datos,
        estado,
        creado_en,
        cantidad_medios
    )
    VALUES (
        v_conversacion_id,
        v_direction,
        'texto',
        p_content,
        jsonb_build_object('session_id', p_session_id, 'author', p_author) || coalesce(p_metadata, '{}'::jsonb),
        v_estado,
        v_now,
        0
    )
    RETURNING id INTO v_mensaje_id;

    -- Si el mensaje es del asistente y viene el openai conv id, actualiza la conversación
    IF v_direction = 'saliente' THEN
        v_conv_openai := coalesce(v_conv_openai, NULLIF((p_metadata->>'openai_conversation_id'), ''));
        IF v_conv_openai IS NOT NULL AND position('conv' in v_conv_openai) = 1 THEN
            UPDATE public.conversaciones AS c
               SET conversacion_openai_id = v_conv_openai
             WHERE c.id = v_conversacion_id;
        END IF;
    END IF;

    UPDATE public.conversaciones AS c
       SET ultimo_mensaje_en = v_now,
           ultimo_mensaje_id = v_mensaje_id,
           ultimo_entrante_en = CASE WHEN v_direction = 'entrante' THEN v_now ELSE ultimo_entrante_en END,
           ultimo_saliente_en = CASE WHEN v_direction = 'saliente' THEN v_now ELSE ultimo_saliente_en END,
           last_response_id = COALESCE(p_response_id, last_response_id)
     WHERE c.id = v_conversacion_id
     RETURNING c.conversacion_openai_id INTO v_conv_openai;

    RETURN QUERY SELECT v_conversacion_id, v_mensaje_id, v_conv_openai;
END;
$$;


--
-- Name: FUNCTION registrar_mensaje_webchat(p_session_id text, p_author text, p_content text, p_response_id text, p_metadata jsonb, p_inactivity_hours integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_mensaje_webchat(p_session_id text, p_author text, p_content text, p_response_id text, p_metadata jsonb, p_inactivity_hours integer) IS 'Registra mensajes del webchat, reinicia conversación si han pasado >24h y persiste el conversation_id de OpenAI (conv_...).';


--
-- Name: t_set_actualizado_en(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.t_set_actualizado_en() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.actualizado_en = now();
  return new;
end;$$;


--
-- Name: tg_conversaciones_auto_tarjeta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_conversaciones_auto_tarjeta() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_tablero uuid;
    v_etapa uuid;
BEGIN
    IF NEW.estado = 'cerrada' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.lead_tarjetas lt
         WHERE lt.conversacion_id = NEW.id
    ) THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_tablero
      FROM public.lead_tableros
     WHERE es_default = TRUE
     ORDER BY creado_en
     LIMIT 1;

    IF v_tablero IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_etapa
      FROM public.lead_etapas
     WHERE tablero_id = v_tablero
     ORDER BY orden
     LIMIT 1;

    IF v_etapa IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.lead_tarjetas (
        contacto_id,
        conversacion_id,
        tablero_id,
        etapa_id,
        canal,
        propietario_usuario_id,
        asignado_a_usuario_id,
        fuente,
        metadata
    )
    VALUES (
        NEW.contacto_id,
        NEW.id,
        v_tablero,
        v_etapa,
        NEW.canal,
        NEW.asignado_a_usuario_id,
        NEW.asignado_a_usuario_id,
        'asistente',
        jsonb_build_object('auto', true, 'motivo', 'conversacion_nueva')
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION tg_conversaciones_auto_tarjeta(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_conversaciones_auto_tarjeta() IS 'Crea una tarjeta de lead cuando inicia una conversación ligada a un lead.';


--
-- Name: tg_lead_tarjetas_after_write(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_lead_tarjetas_after_write() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_old_cat public.lead_categoria;
    v_new_cat public.lead_categoria;
    v_actor uuid;
BEGIN
    v_actor := coalesce(auth.uid(), NEW.asignado_a_usuario_id, NEW.propietario_usuario_id);

    SELECT categoria INTO v_new_cat FROM public.lead_etapas WHERE id = NEW.etapa_id;
    IF TG_OP = 'UPDATE' THEN
        SELECT categoria INTO v_old_cat FROM public.lead_etapas WHERE id = OLD.etapa_id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.lead_movimientos (tarjeta_id, etapa_destino_id, cambiado_por, fuente, metadata)
        VALUES (NEW.id, NEW.etapa_id, v_actor, coalesce(NEW.fuente, 'api'), jsonb_build_object('evento', 'create'));
    ELSIF TG_OP = 'UPDATE' AND NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
        INSERT INTO public.lead_movimientos (tarjeta_id, etapa_origen_id, etapa_destino_id, cambiado_por, fuente, metadata)
        VALUES (
            NEW.id,
            OLD.etapa_id,
            NEW.etapa_id,
            v_actor,
            coalesce(NEW.fuente, 'humano'),
            jsonb_build_object('evento', 'move')
        );
    END IF;

    IF NEW.contacto_id IS NOT NULL THEN
        IF v_new_cat = 'ganada' THEN
            UPDATE public.contactos
               SET estado = 'activo'
             WHERE id = NEW.contacto_id;
        ELSIF v_new_cat = 'perdida' THEN
            UPDATE public.contactos
               SET estado = 'lead'
             WHERE id = NEW.contacto_id;
        ELSIF TG_OP = 'UPDATE' AND v_old_cat IN ('ganada','perdida') AND v_new_cat = 'abierta' THEN
            UPDATE public.contactos
               SET estado = 'lead'
             WHERE id = NEW.contacto_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION tg_lead_tarjetas_after_write(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_lead_tarjetas_after_write() IS 'Registra movimientos y sincroniza estados de contacto tras cambios en la tarjeta.';


--
-- Name: tg_lead_tarjetas_before_write(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_lead_tarjetas_before_write() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_default_tablero uuid;
    v_categoria public.lead_categoria;
    v_etapa_id uuid;
    v_conv_canal text;
    v_conv_asignado uuid;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.actualizado_en := now();
    ELSE
        IF NEW.creado_en IS NULL THEN
            NEW.creado_en := now();
        END IF;
        NEW.actualizado_en := now();
    END IF;

    IF NEW.tablero_id IS NULL THEN
        SELECT id INTO v_default_tablero
          FROM public.lead_tableros
         WHERE es_default IS TRUE
         ORDER BY creado_en
         LIMIT 1;

        IF v_default_tablero IS NULL THEN
            RAISE EXCEPTION 'No se encontró tablero por defecto para leads';
        END IF;
        NEW.tablero_id := v_default_tablero;
    END IF;

    IF NEW.etapa_id IS NULL THEN
        SELECT id INTO v_etapa_id
          FROM public.lead_etapas
         WHERE tablero_id = NEW.tablero_id
         ORDER BY orden
         LIMIT 1;
        IF v_etapa_id IS NULL THEN
            RAISE EXCEPTION 'El tablero % no tiene etapas configuradas', NEW.tablero_id;
        END IF;
        NEW.etapa_id := v_etapa_id;
    END IF;

    IF NEW.propietario_usuario_id IS NULL THEN
        SELECT propietario_usuario_id INTO NEW.propietario_usuario_id
          FROM public.contactos
         WHERE id = NEW.contacto_id;
    END IF;

    IF NEW.metadata IS NULL THEN
        NEW.metadata := '{}'::jsonb;
    END IF;

    IF NEW.fuente IS NULL THEN
        NEW.fuente := 'api';
    END IF;

    IF NEW.conversacion_id IS NOT NULL THEN
        SELECT canal, asignado_a_usuario_id
          INTO v_conv_canal, v_conv_asignado
          FROM public.conversaciones
         WHERE id = NEW.conversacion_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La conversación % no existe', NEW.conversacion_id;
        END IF;
        IF NEW.canal IS NULL THEN
            NEW.canal := v_conv_canal;
        END IF;
        IF NEW.asignado_a_usuario_id IS NULL THEN
            NEW.asignado_a_usuario_id := v_conv_asignado;
        END IF;
    END IF;

    IF NEW.canal IS NULL AND NEW.conversacion_id IS NULL THEN
        IF NEW.metadata ? 'canal' THEN
            NEW.canal := NEW.metadata ->> 'canal';
        END IF;
    END IF;

    IF NEW.lead_score IS NULL AND NEW.conversacion_id IS NOT NULL THEN
        SELECT lead_score INTO NEW.lead_score
          FROM public.conversaciones_insights
         WHERE conversacion_id = NEW.conversacion_id;
    END IF;

    SELECT categoria INTO v_categoria
      FROM public.lead_etapas
     WHERE id = NEW.etapa_id;

    IF v_categoria IN ('ganada','perdida') THEN
        IF NEW.cerrado_en IS NULL THEN
            NEW.cerrado_en := now();
        END IF;
    ELSE
        NEW.cerrado_en := NULL;
        NEW.motivo_cierre := NULL;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION tg_lead_tarjetas_before_write(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_lead_tarjetas_before_write() IS 'Ajusta valores por defecto y sincroniza datos antes de insertar/actualizar tarjetas.';


--
-- Name: tg_sync_lead_score_from_insights(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_sync_lead_score_from_insights() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE public.lead_tarjetas
       SET lead_score = NEW.lead_score,
           metadata = metadata || jsonb_build_object('siguiente_accion', NEW.siguiente_accion)
     WHERE conversacion_id = NEW.conversacion_id;
    RETURN NEW;
END;
$$;


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.actualizado_en := now();
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION tg_touch_updated_at(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_touch_updated_at() IS 'Actualiza la columna actualizado_en al momento actual.';


--
-- Name: touch_conversaciones_controles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_conversaciones_controles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


--
-- Name: trg_busquedas_set_centro(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_busquedas_set_centro() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.lat is not null and new.lng is not null then
    new.centro := ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  else
    new.centro := null;
  end if;
  return new;
end$$;


--
-- Name: trg_resultados_set_geom(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_resultados_set_geom() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  else
    new.geom := null;
  end if;
  return new;
end$$;


--
-- Name: trg_resultados_set_tsv(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_resultados_set_tsv() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.tsv :=
    setweight(to_tsvector('spanish', coalesce(unaccent(new.name),'')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(unaccent(new.actividad),'')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(unaccent(new.address),'')), 'C');
  return new;
end$$;


--
-- Name: upsert_resultados_lote(uuid, public.fuente_resultado, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_resultados_lote(p_busqueda_id uuid, p_fuente public.fuente_resultado, p_items jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_count int := 0;
  v_it jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;

  for v_it in select * from jsonb_array_elements(p_items)
  loop
    insert into public.resultados(
      busqueda_id, fuente, external_id, clee,
      name, razon_social, actividad, estrato,
      phone, email, website, address,
      lat, lng, rating, reviews, maps_url, raw
    )
    values (
      p_busqueda_id,
      p_fuente,
      coalesce(v_it->>'external_id', v_it->>'id'),
      v_it->>'clee',
      v_it->>'name',
      v_it->>'razon_social',
      v_it->>'actividad',
      v_it->>'estrato',
      v_it->>'phone',
      v_it->>'email',
      v_it->>'website',
      v_it->>'address',
      nullif(v_it->>'lat','')::double precision,
      nullif(v_it->>'lng','')::double precision,
      nullif(v_it->>'rating','')::numeric,
      nullif(v_it->>'reviews','')::int,
      coalesce(v_it->>'maps_url', v_it->>'maps'),
      v_it
    )
    on conflict (busqueda_id, fuente, external_id) do update
      set name         = excluded.name,
          razon_social = excluded.razon_social,
          actividad    = excluded.actividad,
          estrato      = excluded.estrato,
          phone        = excluded.phone,
          email        = excluded.email,
          website      = excluded.website,
          address      = excluded.address,
          lat          = excluded.lat,
          lng          = excluded.lng,
          rating       = excluded.rating,
          reviews      = excluded.reviews,
          maps_url     = excluded.maps_url,
          raw          = excluded.raw;

    v_count := v_count + 1;
  end loop;

  return v_count;
end$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_;

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    declare
      res jsonb;
    begin
      execute format('select to_jsonb(%L::'|| type_::text || ')', val)  into res;
      return res;
    end
    $$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS SETOF realtime.wal_rls
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
      with pub as (
        select
          concat_ws(
            ',',
            case when bool_or(pubinsert) then 'insert' else null end,
            case when bool_or(pubupdate) then 'update' else null end,
            case when bool_or(pubdelete) then 'delete' else null end
          ) as w2j_actions,
          coalesce(
            string_agg(
              realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
              ','
            ) filter (where ppt.tablename is not null and ppt.tablename not like '% %'),
            ''
          ) w2j_add_tables
        from
          pg_publication pp
          left join pg_publication_tables ppt
            on pp.pubname = ppt.pubname
        where
          pp.pubname = publication
        group by
          pp.pubname
        limit 1
      ),
      w2j as (
        select
          x.*, pub.w2j_add_tables
        from
          pub,
          pg_logical_slot_get_changes(
            slot_name, null, max_changes,
            'include-pk', 'true',
            'include-transaction', 'false',
            'include-timestamp', 'true',
            'include-type-oids', 'true',
            'format-version', '2',
            'actions', pub.w2j_actions,
            'add-tables', pub.w2j_add_tables
          ) x
      )
      select
        xyz.wal,
        xyz.is_rls_enabled,
        xyz.subscription_ids,
        xyz.errors
      from
        w2j,
        realtime.apply_rls(
          wal := w2j.data::jsonb,
          max_record_bytes := max_record_bytes
        ) xyz(wal, is_rls_enabled, subscription_ids, errors)
      where
        w2j.w2j_add_tables <> ''
        and xyz.subscription_ids[1] is not null
    $$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  BEGIN
    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (payload, event, topic, private, extension)
    VALUES (payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
    declare
        col_names text[] = coalesce(
                array_agg(c.column_name order by c.ordinal_position),
                '{}'::text[]
            )
            from
                information_schema.columns c
            where
                format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    format('%I.%I', c.table_schema, c.table_name)::regclass,
                    c.column_name,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
    begin
        for filter in select * from unnest(new.filters) loop
            -- Filtered column is valid
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            -- Type is sanitized and safe for string interpolation
            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            -- Set maximum number of entries for in filter
            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            else
                -- raises an exception if value is not coercable to type
                perform realtime.cast(filter.value, col_type);
            end if;

        end loop;

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: add_prefixes(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.add_prefixes(_bucket_id text, _name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    prefixes text[];
BEGIN
    prefixes := "storage"."get_prefixes"("_name");

    IF array_length(prefixes, 1) > 0 THEN
        INSERT INTO storage.prefixes (name, bucket_id)
        SELECT UNNEST(prefixes) as name, "_bucket_id" ON CONFLICT DO NOTHING;
    END IF;
END;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: delete_leaf_prefixes(text[], text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_leaf_prefixes(bucket_ids text[], names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_rows_deleted integer;
BEGIN
    LOOP
        WITH candidates AS (
            SELECT DISTINCT
                t.bucket_id,
                unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        ),
        uniq AS (
             SELECT
                 bucket_id,
                 name,
                 storage.get_level(name) AS level
             FROM candidates
             WHERE name <> ''
             GROUP BY bucket_id, name
        ),
        leaf AS (
             SELECT
                 p.bucket_id,
                 p.name,
                 p.level
             FROM storage.prefixes AS p
                  JOIN uniq AS u
                       ON u.bucket_id = p.bucket_id
                           AND u.name = p.name
                           AND u.level = p.level
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM storage.objects AS o
                 WHERE o.bucket_id = p.bucket_id
                   AND o.level = p.level + 1
                   AND o.name COLLATE "C" LIKE p.name || '/%'
             )
             AND NOT EXISTS (
                 SELECT 1
                 FROM storage.prefixes AS c
                 WHERE c.bucket_id = p.bucket_id
                   AND c.level = p.level + 1
                   AND c.name COLLATE "C" LIKE p.name || '/%'
             )
        )
        DELETE
        FROM storage.prefixes AS p
            USING leaf AS l
        WHERE p.bucket_id = l.bucket_id
          AND p.name = l.name
          AND p.level = l.level;

        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
        EXIT WHEN v_rows_deleted = 0;
    END LOOP;
END;
$$;


--
-- Name: delete_prefix(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix(_bucket_id text, _name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Check if we can delete the prefix
    IF EXISTS(
        SELECT FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name") + 1
          AND "prefixes"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    )
    OR EXISTS(
        SELECT FROM "storage"."objects"
        WHERE "objects"."bucket_id" = "_bucket_id"
          AND "storage"."get_level"("objects"."name") = "storage"."get_level"("_name") + 1
          AND "objects"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    ) THEN
    -- There are sub-objects, skip deletion
    RETURN false;
    ELSE
        DELETE FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name")
          AND "prefixes"."name" = "_name";
        RETURN true;
    END IF;
END;
$$;


--
-- Name: delete_prefix_hierarchy_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix_hierarchy_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    prefix text;
BEGIN
    prefix := "storage"."get_prefix"(OLD."name");

    IF coalesce(prefix, '') != '' THEN
        PERFORM "storage"."delete_prefix"(OLD."bucket_id", prefix);
    END IF;

    RETURN OLD;
END;
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts,1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_level(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_level(name text) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
SELECT array_length(string_to_array("name", '/'), 1);
$$;


--
-- Name: get_prefix(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefix(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
SELECT
    CASE WHEN strpos("name", '/') > 0 THEN
             regexp_replace("name", '[\/]{1}[^\/]+\/?$', '')
         ELSE
             ''
        END;
$_$;


--
-- Name: get_prefixes(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefixes(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
DECLARE
    parts text[];
    prefixes text[];
    prefix text;
BEGIN
    -- Split the name into parts by '/'
    parts := string_to_array("name", '/');
    prefixes := '{}';

    -- Construct the prefixes, stopping one level below the last part
    FOR i IN 1..array_length(parts, 1) - 1 LOOP
            prefix := array_to_string(parts[1:i], '/');
            prefixes := array_append(prefixes, prefix);
    END LOOP;

    RETURN prefixes;
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(name COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                        substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1)))
                    ELSE
                        name
                END AS name, id, metadata, updated_at
            FROM
                storage.objects
            WHERE
                bucket_id = $5 AND
                name ILIKE $1 || ''%'' AND
                CASE
                    WHEN $6 != '''' THEN
                    name COLLATE "C" > $6
                ELSE true END
                AND CASE
                    WHEN $4 != '''' THEN
                        CASE
                            WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                                substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                name COLLATE "C" > $4
                            END
                    ELSE
                        true
                END
            ORDER BY
                name COLLATE "C" ASC) as e order by name COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_token, bucket_id, start_after;
END;
$_$;


--
-- Name: lock_top_prefixes(text[], text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.lock_top_prefixes(bucket_ids text[], names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket text;
    v_top text;
BEGIN
    FOR v_bucket, v_top IN
        SELECT DISTINCT t.bucket_id,
            split_part(t.name, '/', 1) AS top
        FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        WHERE t.name <> ''
        ORDER BY 1, 2
        LOOP
            PERFORM pg_advisory_xact_lock(hashtextextended(v_bucket || '/' || v_top, 0));
        END LOOP;
END;
$$;


--
-- Name: objects_delete_cleanup(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_delete_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket_ids text[];
    v_names      text[];
BEGIN
    IF current_setting('storage.gc.prefixes', true) = '1' THEN
        RETURN NULL;
    END IF;

    PERFORM set_config('storage.gc.prefixes', '1', true);

    SELECT COALESCE(array_agg(d.bucket_id), '{}'),
           COALESCE(array_agg(d.name), '{}')
    INTO v_bucket_ids, v_names
    FROM deleted AS d
    WHERE d.name <> '';

    PERFORM storage.lock_top_prefixes(v_bucket_ids, v_names);
    PERFORM storage.delete_leaf_prefixes(v_bucket_ids, v_names);

    RETURN NULL;
END;
$$;


--
-- Name: objects_insert_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_insert_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    NEW.level := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- Name: objects_update_cleanup(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    -- NEW - OLD (destinations to create prefixes for)
    v_add_bucket_ids text[];
    v_add_names      text[];

    -- OLD - NEW (sources to prune)
    v_src_bucket_ids text[];
    v_src_names      text[];
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NULL;
    END IF;

    -- 1) Compute NEW−OLD (added paths) and OLD−NEW (moved-away paths)
    WITH added AS (
        SELECT n.bucket_id, n.name
        FROM new_rows n
        WHERE n.name <> '' AND position('/' in n.name) > 0
        EXCEPT
        SELECT o.bucket_id, o.name FROM old_rows o WHERE o.name <> ''
    ),
    moved AS (
         SELECT o.bucket_id, o.name
         FROM old_rows o
         WHERE o.name <> ''
         EXCEPT
         SELECT n.bucket_id, n.name FROM new_rows n WHERE n.name <> ''
    )
    SELECT
        -- arrays for ADDED (dest) in stable order
        COALESCE( (SELECT array_agg(a.bucket_id ORDER BY a.bucket_id, a.name) FROM added a), '{}' ),
        COALESCE( (SELECT array_agg(a.name      ORDER BY a.bucket_id, a.name) FROM added a), '{}' ),
        -- arrays for MOVED (src) in stable order
        COALESCE( (SELECT array_agg(m.bucket_id ORDER BY m.bucket_id, m.name) FROM moved m), '{}' ),
        COALESCE( (SELECT array_agg(m.name      ORDER BY m.bucket_id, m.name) FROM moved m), '{}' )
    INTO v_add_bucket_ids, v_add_names, v_src_bucket_ids, v_src_names;

    -- Nothing to do?
    IF (array_length(v_add_bucket_ids, 1) IS NULL) AND (array_length(v_src_bucket_ids, 1) IS NULL) THEN
        RETURN NULL;
    END IF;

    -- 2) Take per-(bucket, top) locks: ALL prefixes in consistent global order to prevent deadlocks
    DECLARE
        v_all_bucket_ids text[];
        v_all_names text[];
    BEGIN
        -- Combine source and destination arrays for consistent lock ordering
        v_all_bucket_ids := COALESCE(v_src_bucket_ids, '{}') || COALESCE(v_add_bucket_ids, '{}');
        v_all_names := COALESCE(v_src_names, '{}') || COALESCE(v_add_names, '{}');

        -- Single lock call ensures consistent global ordering across all transactions
        IF array_length(v_all_bucket_ids, 1) IS NOT NULL THEN
            PERFORM storage.lock_top_prefixes(v_all_bucket_ids, v_all_names);
        END IF;
    END;

    -- 3) Create destination prefixes (NEW−OLD) BEFORE pruning sources
    IF array_length(v_add_bucket_ids, 1) IS NOT NULL THEN
        WITH candidates AS (
            SELECT DISTINCT t.bucket_id, unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(v_add_bucket_ids, v_add_names) AS t(bucket_id, name)
            WHERE name <> ''
        )
        INSERT INTO storage.prefixes (bucket_id, name)
        SELECT c.bucket_id, c.name
        FROM candidates c
        ON CONFLICT DO NOTHING;
    END IF;

    -- 4) Prune source prefixes bottom-up for OLD−NEW
    IF array_length(v_src_bucket_ids, 1) IS NOT NULL THEN
        -- re-entrancy guard so DELETE on prefixes won't recurse
        IF current_setting('storage.gc.prefixes', true) <> '1' THEN
            PERFORM set_config('storage.gc.prefixes', '1', true);
        END IF;

        PERFORM storage.delete_leaf_prefixes(v_src_bucket_ids, v_src_names);
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: objects_update_level_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_level_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Ensure this is an update operation and the name has changed
    IF TG_OP = 'UPDATE' AND (NEW."name" <> OLD."name" OR NEW."bucket_id" <> OLD."bucket_id") THEN
        -- Set the new level
        NEW."level" := "storage"."get_level"(NEW."name");
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: objects_update_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    old_prefixes TEXT[];
BEGIN
    -- Ensure this is an update operation and the name has changed
    IF TG_OP = 'UPDATE' AND (NEW."name" <> OLD."name" OR NEW."bucket_id" <> OLD."bucket_id") THEN
        -- Retrieve old prefixes
        old_prefixes := "storage"."get_prefixes"(OLD."name");

        -- Remove old prefixes that are only used by this object
        WITH all_prefixes as (
            SELECT unnest(old_prefixes) as prefix
        ),
        can_delete_prefixes as (
             SELECT prefix
             FROM all_prefixes
             WHERE NOT EXISTS (
                 SELECT 1 FROM "storage"."objects"
                 WHERE "bucket_id" = OLD."bucket_id"
                   AND "name" <> OLD."name"
                   AND "name" LIKE (prefix || '%')
             )
         )
        DELETE FROM "storage"."prefixes" WHERE name IN (SELECT prefix FROM can_delete_prefixes);

        -- Add new prefixes
        PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    END IF;
    -- Set the new level
    NEW."level" := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: prefixes_delete_cleanup(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.prefixes_delete_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket_ids text[];
    v_names      text[];
BEGIN
    IF current_setting('storage.gc.prefixes', true) = '1' THEN
        RETURN NULL;
    END IF;

    PERFORM set_config('storage.gc.prefixes', '1', true);

    SELECT COALESCE(array_agg(d.bucket_id), '{}'),
           COALESCE(array_agg(d.name), '{}')
    INTO v_bucket_ids, v_names
    FROM deleted AS d
    WHERE d.name <> '';

    PERFORM storage.lock_top_prefixes(v_bucket_ids, v_names);
    PERFORM storage.delete_leaf_prefixes(v_bucket_ids, v_names);

    RETURN NULL;
END;
$$;


--
-- Name: prefixes_insert_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.prefixes_insert_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    RETURN NEW;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
declare
    can_bypass_rls BOOLEAN;
begin
    SELECT rolbypassrls
    INTO can_bypass_rls
    FROM pg_roles
    WHERE rolname = coalesce(nullif(current_setting('role', true), 'none'), current_user);

    IF can_bypass_rls THEN
        RETURN QUERY SELECT * FROM storage.search_v1_optimised(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    ELSE
        RETURN QUERY SELECT * FROM storage.search_legacy_v1(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    END IF;
end;
$$;


--
-- Name: search_legacy_v1(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select path_tokens[$1] as folder
           from storage.objects
             where objects.name ilike $2 || $3 || ''%''
               and bucket_id = $4
               and array_length(objects.path_tokens, 1) <> $1
           group by folder
           order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: search_v1_optimised(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v1_optimised(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select (string_to_array(name, ''/''))[level] as name
           from storage.prefixes
             where lower(prefixes.name) like lower($2 || $3) || ''%''
               and bucket_id = $4
               and level = $1
           order by name ' || v_sort_order || '
     )
     (select name,
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[level] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where lower(objects.name) like lower($2 || $3) || ''%''
       and bucket_id = $4
       and level = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    sort_col text;
    sort_ord text;
    cursor_op text;
    cursor_expr text;
    sort_expr text;
BEGIN
    -- Validate sort_order
    sort_ord := lower(sort_order);
    IF sort_ord NOT IN ('asc', 'desc') THEN
        sort_ord := 'asc';
    END IF;

    -- Determine cursor comparison operator
    IF sort_ord = 'asc' THEN
        cursor_op := '>';
    ELSE
        cursor_op := '<';
    END IF;
    
    sort_col := lower(sort_column);
    -- Validate sort column  
    IF sort_col IN ('updated_at', 'created_at') THEN
        cursor_expr := format(
            '($5 = '''' OR ROW(date_trunc(''milliseconds'', %I), name COLLATE "C") %s ROW(COALESCE(NULLIF($6, '''')::timestamptz, ''epoch''::timestamptz), $5))',
            sort_col, cursor_op
        );
        sort_expr := format(
            'COALESCE(date_trunc(''milliseconds'', %I), ''epoch''::timestamptz) %s, name COLLATE "C" %s',
            sort_col, sort_ord, sort_ord
        );
    ELSE
        cursor_expr := format('($5 = '''' OR name COLLATE "C" %s $5)', cursor_op);
        sort_expr := format('name COLLATE "C" %s', sort_ord);
    END IF;

    RETURN QUERY EXECUTE format(
        $sql$
        SELECT * FROM (
            (
                SELECT
                    split_part(name, '/', $4) AS key,
                    name,
                    NULL::uuid AS id,
                    updated_at,
                    created_at,
                    NULL::timestamptz AS last_accessed_at,
                    NULL::jsonb AS metadata
                FROM storage.prefixes
                WHERE name COLLATE "C" LIKE $1 || '%%'
                    AND bucket_id = $2
                    AND level = $4
                    AND %s
                ORDER BY %s
                LIMIT $3
            )
            UNION ALL
            (
                SELECT
                    split_part(name, '/', $4) AS key,
                    name,
                    id,
                    updated_at,
                    created_at,
                    last_accessed_at,
                    metadata
                FROM storage.objects
                WHERE name COLLATE "C" LIKE $1 || '%%'
                    AND bucket_id = $2
                    AND level = $4
                    AND %s
                ORDER BY %s
                LIMIT $3
            )
        ) obj
        ORDER BY %s
        LIMIT $3
        $sql$,
        cursor_expr,    -- prefixes WHERE
        sort_expr,      -- prefixes ORDER BY
        cursor_expr,    -- objects WHERE
        sort_expr,      -- objects ORDER BY
        sort_expr       -- final ORDER BY
    )
    USING prefix, bucket_name, limits, levels, start_after, sort_column_after;
END;
$_$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text NOT NULL,
    code_challenge_method auth.code_challenge_method NOT NULL,
    code_challenge text NOT NULL,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'stores metadata for pkce logins';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: adjuntos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adjuntos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mensaje_id uuid NOT NULL,
    url text,
    mime text,
    tamano_bytes bigint,
    proveedor_id text
);


--
-- Name: agentes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    canal text NOT NULL,
    modelo text DEFAULT 'gpt-4o-mini'::text NOT NULL,
    temperatura numeric(3,2) DEFAULT 0.30 NOT NULL,
    max_output_tokens integer DEFAULT 600 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agentes_canal_check CHECK ((canal = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'webchat'::text, 'voz'::text, 'api'::text])))
);


--
-- Name: busquedas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.busquedas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fuente public.fuente_resultado NOT NULL,
    query text NOT NULL,
    radio_m integer,
    lat double precision,
    lng double precision,
    centro public.geography(Point,4326),
    total_encontrados integer,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    creado_por uuid DEFAULT auth.uid()
);


--
-- Name: contactos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contactos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre_completo text,
    correo text,
    telefono_e164 text,
    origen text,
    propietario_usuario_id uuid,
    estado text DEFAULT 'lead'::text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    contacto_datos jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT contactos_estado_check CHECK ((estado = ANY (ARRAY['lead'::text, 'activo'::text, 'bloqueado'::text])))
);


--
-- Name: conversaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contacto_id uuid NOT NULL,
    canal text NOT NULL,
    estado text DEFAULT 'abierta'::text NOT NULL,
    asignado_a_usuario_id uuid,
    iniciada_en timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_mensaje_en timestamp with time zone,
    prioridad integer DEFAULT 0 NOT NULL,
    conversacion_openai_id text,
    no_leidos integer DEFAULT 0 NOT NULL,
    ultimo_entrante_en timestamp with time zone,
    ultimo_saliente_en timestamp with time zone,
    ultimo_mensaje_id uuid,
    last_response_id text,
    CONSTRAINT conversaciones_canal_check CHECK ((canal = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'webchat'::text, 'voz'::text]))),
    CONSTRAINT conversaciones_estado_check CHECK ((estado = ANY (ARRAY['abierta'::text, 'pendiente'::text, 'cerrada'::text])))
);


--
-- Name: conversaciones_controles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversaciones_controles (
    conversacion_id uuid NOT NULL,
    manual_override boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid NOT NULL,
    correo text,
    nombre_completo text,
    estado text DEFAULT 'activo'::text NOT NULL,
    ultimo_acceso_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    telefono_e164 text DEFAULT '+00000000000'::text NOT NULL,
    CONSTRAINT usuarios_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'inactivo'::text]))),
    CONSTRAINT usuarios_telefono_e164_check CHECK ((telefono_e164 ~ '^\+[0-9]{7,15}$'::text))
);


--
-- Name: conversaciones_en_curso; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.conversaciones_en_curso AS
 SELECT c.id AS conversacion_id,
    c.canal,
    c.estado,
    c.prioridad,
    c.iniciada_en,
    c.ultimo_mensaje_en,
    ct.id AS contacto_id,
    ct.nombre_completo AS contacto_nombre,
    ct.telefono_e164 AS contacto_telefono,
    ct.correo AS contacto_correo,
    u.id AS asignado_usuario_id,
    u.nombre_completo AS asignado_usuario_nombre,
    u.correo AS asignado_usuario_correo
   FROM ((public.conversaciones c
     JOIN public.contactos ct ON ((ct.id = c.contacto_id)))
     LEFT JOIN public.usuarios u ON ((u.id = c.asignado_a_usuario_id)))
  WHERE (c.estado = ANY (ARRAY['abierta'::text, 'pendiente'::text]));


--
-- Name: conversaciones_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversaciones_insights (
    conversacion_id uuid NOT NULL,
    resumen text,
    intencion text,
    sentimiento text,
    tags jsonb,
    lead_score integer,
    siguiente_accion text,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversaciones_insights_sentimiento_check CHECK (((sentimiento = ANY (ARRAY['positivo'::text, 'neutral'::text, 'negativo'::text])) OR (sentimiento IS NULL)))
);


--
-- Name: custom_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agente_id uuid NOT NULL,
    entidad text NOT NULL,
    nombre text NOT NULL,
    etiqueta text NOT NULL,
    data_type text NOT NULL,
    requerido boolean DEFAULT false NOT NULL,
    opciones jsonb DEFAULT '[]'::jsonb NOT NULL,
    fuente text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_fields_data_type_check CHECK ((data_type = ANY (ARRAY['string'::text, 'number'::text, 'boolean'::text, 'enum'::text, 'date'::text, 'json'::text]))),
    CONSTRAINT custom_fields_entidad_check CHECK ((entidad = 'contacto'::text))
);


--
-- Name: departamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    departamento_padre_id uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ejecuciones_asistente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ejecuciones_asistente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversacion_id uuid NOT NULL,
    conversacion_openai_id text,
    prompt_id text,
    response_id text,
    estado text,
    iniciado_en timestamp with time zone DEFAULT now(),
    completado_en timestamp with time zone,
    tokens_entrada integer,
    tokens_salida integer,
    costo_estimado numeric(12,6),
    error text
);


--
-- Name: lead_tarjetas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_tarjetas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contacto_id uuid NOT NULL,
    conversacion_id uuid,
    tablero_id uuid NOT NULL,
    etapa_id uuid NOT NULL,
    canal text,
    propietario_usuario_id uuid,
    asignado_a_usuario_id uuid,
    monto_estimado numeric(12,2),
    moneda character(3) DEFAULT 'MXN'::bpchar NOT NULL,
    probabilidad_override numeric(5,2),
    motivo_cierre text,
    cerrado_en timestamp with time zone,
    lead_score integer,
    tags text[],
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    asistido_por text,
    fuente text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_tarjetas_amount_check CHECK (((monto_estimado IS NULL) OR (monto_estimado >= (0)::numeric))),
    CONSTRAINT lead_tarjetas_canal_check CHECK (((canal IS NULL) OR (canal = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'webchat'::text, 'voz'::text, 'api'::text])))),
    CONSTRAINT lead_tarjetas_fuente_check CHECK (((fuente IS NULL) OR (fuente = ANY (ARRAY['humano'::text, 'asistente'::text, 'api'::text])))),
    CONSTRAINT lead_tarjetas_probability_check CHECK (((probabilidad_override IS NULL) OR ((probabilidad_override >= (0)::numeric) AND (probabilidad_override <= (100)::numeric))))
);

ALTER TABLE ONLY public.lead_tarjetas REPLICA IDENTITY FULL;


--
-- Name: embudo; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.embudo AS
 SELECT lt.id,
    lt.tablero_id,
    lt.etapa_id,
    lt.contacto_id,
    ct.nombre_completo AS contacto_nombre,
    ct.estado AS contacto_estado,
    ct.telefono_e164 AS contacto_telefono,
    ct.correo AS contacto_correo,
    lt.conversacion_id,
    COALESCE(lt.canal, conv.canal) AS canal,
    conv.estado AS conversacion_estado,
    conv.ultimo_mensaje_en,
    lt.monto_estimado,
    lt.moneda,
    lt.probabilidad_override,
    lt.lead_score,
    lt.tags,
    lt.metadata,
    lt.asignado_a_usuario_id,
    usr.nombre_completo AS asignado_nombre,
    lt.propietario_usuario_id,
    up.nombre_completo AS propietario_nombre,
    lt.cerrado_en,
    lt.motivo_cierre,
    lt.creado_en,
    lt.actualizado_en,
    ci.resumen,
    ci.intencion,
    ci.sentimiento,
    ci.siguiente_accion
   FROM (((((public.lead_tarjetas lt
     JOIN public.contactos ct ON ((ct.id = lt.contacto_id)))
     LEFT JOIN public.conversaciones conv ON ((conv.id = lt.conversacion_id)))
     LEFT JOIN public.conversaciones_insights ci ON ((ci.conversacion_id = lt.conversacion_id)))
     LEFT JOIN public.usuarios usr ON ((usr.id = lt.asignado_a_usuario_id)))
     LEFT JOIN public.usuarios up ON ((up.id = lt.propietario_usuario_id)));


--
-- Name: empleados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empleados (
    usuario_id uuid NOT NULL,
    departamento_id uuid,
    puesto text,
    es_gestor boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: eventos_auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos_auditoria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_usuario_id uuid,
    entidad text NOT NULL,
    entidad_id uuid NOT NULL,
    accion text NOT NULL,
    datos jsonb,
    id_solicitud text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: eventos_entrega; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos_entrega (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mensaje_id uuid NOT NULL,
    proveedor text DEFAULT 'twilio'::text NOT NULL,
    evento text NOT NULL,
    proveedor_ts timestamp with time zone,
    codigo_error text,
    payload_crudo jsonb,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT eventos_entrega_evento_check CHECK ((evento = ANY (ARRAY['en_cola'::text, 'enviado'::text, 'entregado'::text, 'leido'::text, 'fallido'::text])))
);


--
-- Name: identidades_canal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identidades_canal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contacto_id uuid NOT NULL,
    canal text NOT NULL,
    id_externo text NOT NULL,
    metadatos jsonb,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT identidades_canal_canal_check CHECK ((canal = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'webchat'::text, 'voz'::text])))
);


--
-- Name: lead_etapas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_etapas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tablero_id uuid NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    orden smallint NOT NULL,
    categoria public.lead_categoria DEFAULT 'abierta'::public.lead_categoria NOT NULL,
    probabilidad numeric(5,2),
    sla_horas integer,
    metadatos jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_etapas_probabilidad_check CHECK (((probabilidad IS NULL) OR ((probabilidad >= (0)::numeric) AND (probabilidad <= (100)::numeric)))),
    CONSTRAINT lead_etapas_sla_check CHECK (((sla_horas IS NULL) OR (sla_horas >= 0)))
);


--
-- Name: lead_movimientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_movimientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tarjeta_id uuid NOT NULL,
    etapa_origen_id uuid,
    etapa_destino_id uuid NOT NULL,
    cambiado_por uuid,
    cambiado_en timestamp with time zone DEFAULT now() NOT NULL,
    motivo text,
    fuente text DEFAULT 'humano'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT lead_movimientos_fuente_check CHECK ((fuente = ANY (ARRAY['humano'::text, 'asistente'::text, 'api'::text])))
);

ALTER TABLE ONLY public.lead_movimientos REPLICA IDENTITY FULL;


--
-- Name: lead_recordatorios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_recordatorios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tarjeta_id uuid NOT NULL,
    descripcion text NOT NULL,
    due_at timestamp with time zone NOT NULL,
    creado_por uuid NOT NULL,
    completado boolean DEFAULT false NOT NULL,
    completado_en timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.lead_recordatorios REPLICA IDENTITY FULL;


--
-- Name: lead_tableros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_tableros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    slug text NOT NULL,
    descripcion text,
    departamento_id uuid,
    propietario_usuario_id uuid,
    es_default boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: llamadas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llamadas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contacto_id uuid,
    direccion text NOT NULL,
    sid_llamada text,
    desde_numero text,
    hacia_numero text,
    estado text,
    iniciada_en timestamp with time zone,
    finalizada_en timestamp with time zone,
    duracion_seg integer,
    transcripcion text,
    CONSTRAINT llamadas_direccion_check CHECK ((direccion = ANY (ARRAY['entrante'::text, 'saliente'::text])))
);


--
-- Name: mensajes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensajes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversacion_id uuid NOT NULL,
    direccion text NOT NULL,
    tipo_contenido text NOT NULL,
    texto text,
    datos jsonb,
    proveedor_mensaje_id text,
    estado text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    twilio_message_sid text,
    codigo_error text,
    error text,
    cantidad_medios integer DEFAULT 0 NOT NULL,
    CONSTRAINT mensajes_direccion_check CHECK ((direccion = ANY (ARRAY['entrante'::text, 'saliente'::text]))),
    CONSTRAINT mensajes_estado_check CHECK ((estado = ANY (ARRAY['enviada'::text, 'entregada'::text, 'leida'::text, 'fallida'::text]))),
    CONSTRAINT mensajes_tipo_contenido_check CHECK ((tipo_contenido = ANY (ARRAY['texto'::text, 'medio'::text, 'sistema'::text])))
);


--
-- Name: resultados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resultados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    busqueda_id uuid NOT NULL,
    fuente public.fuente_resultado NOT NULL,
    external_id text NOT NULL,
    clee text,
    name text,
    razon_social text,
    actividad text,
    estrato text,
    phone text,
    email text,
    website text,
    address text,
    lat double precision,
    lng double precision,
    geom public.geography(Point,4326),
    rating numeric,
    reviews integer,
    maps_url text,
    raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    tsv tsvector,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mv_resultados_por_actividad; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_resultados_por_actividad AS
 SELECT actividad,
    fuente,
    count(*) AS total,
    max(creado_en) AS ultima_captura
   FROM public.resultados
  GROUP BY actividad, fuente
  WITH NO DATA;


--
-- Name: permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permisos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    descripcion text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prompt_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_bindings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agente_id uuid NOT NULL,
    prompt_id uuid NOT NULL,
    version_id uuid,
    region text,
    activo boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prompt_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prompt_id uuid NOT NULL,
    version_num integer NOT NULL,
    system_instructions text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    tools jsonb DEFAULT '[]'::jsonb NOT NULL,
    few_shots jsonb DEFAULT '[]'::jsonb NOT NULL,
    guardrails jsonb DEFAULT '[]'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pv_fs_is_array CHECK ((jsonb_typeof(few_shots) = 'array'::text)),
    CONSTRAINT pv_gr_is_array CHECK ((jsonb_typeof(guardrails) = 'array'::text)),
    CONSTRAINT pv_tools_is_array CHECK ((jsonb_typeof(tools) = 'array'::text)),
    CONSTRAINT pv_vars_is_array CHECK ((jsonb_typeof(variables) = 'array'::text))
);


--
-- Name: prompts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    archivado boolean DEFAULT false NOT NULL,
    latest_version_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles_permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles_permisos (
    rol_id uuid NOT NULL,
    permiso_id uuid NOT NULL
);


--
-- Name: secretos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secretos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clave text NOT NULL,
    valor_cifrado text NOT NULL,
    nonce text NOT NULL,
    etiqueta text,
    version integer DEFAULT 1 NOT NULL,
    creado_por uuid,
    actualizado_por uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: usuarios_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_roles (
    usuario_id uuid NOT NULL,
    rol_id uuid NOT NULL
);


--
-- Name: v_resultados_mapa; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_resultados_mapa AS
 SELECT id,
    busqueda_id,
    fuente,
    external_id,
    COALESCE(NULLIF(name, ''::text), NULLIF(razon_social, ''::text)) AS display_name,
    actividad,
    rating,
    reviews,
    address,
    phone,
    website,
    geom
   FROM public.resultados r
  WHERE (geom IS NOT NULL);


--
-- Name: v_resultados_unificados; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_resultados_unificados AS
 SELECT r.id,
    r.busqueda_id,
    b.fuente AS fuente_busqueda,
    r.fuente AS fuente_resultado,
    r.external_id,
    r.clee,
    COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
    r.name,
    r.razon_social,
    r.actividad,
    r.estrato,
    r.phone,
    r.email,
    r.website,
    r.address,
    r.lat,
    r.lng,
    r.rating,
    r.reviews,
    r.maps_url,
    r.creado_en
   FROM (public.resultados r
     JOIN public.busquedas b ON ((b.id = r.busqueda_id)));


--
-- Name: webhooks_entrantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhooks_entrantes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canal text NOT NULL,
    id_solicitud text,
    recibido_en timestamp with time zone DEFAULT now() NOT NULL,
    carga jsonb,
    processed_ok boolean,
    error text
);


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: messages_2025_10_23; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_10_23 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_10_24; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_10_24 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_10_25; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_10_25 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_10_26; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_10_26 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_10_27; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_10_27 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_10_28; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_10_28 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2025_10_29; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_10_29 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb,
    level integer
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: prefixes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.prefixes (
    bucket_id text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    level integer GENERATED ALWAYS AS (storage.get_level(name)) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text
);


--
-- Name: seed_files; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.seed_files (
    path text NOT NULL,
    hash text NOT NULL
);


--
-- Name: messages_2025_10_23; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_10_23 FOR VALUES FROM ('2025-10-23 00:00:00') TO ('2025-10-24 00:00:00');


--
-- Name: messages_2025_10_24; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_10_24 FOR VALUES FROM ('2025-10-24 00:00:00') TO ('2025-10-25 00:00:00');


--
-- Name: messages_2025_10_25; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_10_25 FOR VALUES FROM ('2025-10-25 00:00:00') TO ('2025-10-26 00:00:00');


--
-- Name: messages_2025_10_26; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_10_26 FOR VALUES FROM ('2025-10-26 00:00:00') TO ('2025-10-27 00:00:00');


--
-- Name: messages_2025_10_27; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_10_27 FOR VALUES FROM ('2025-10-27 00:00:00') TO ('2025-10-28 00:00:00');


--
-- Name: messages_2025_10_28; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_10_28 FOR VALUES FROM ('2025-10-28 00:00:00') TO ('2025-10-29 00:00:00');


--
-- Name: messages_2025_10_29; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_10_29 FOR VALUES FROM ('2025-10-29 00:00:00') TO ('2025-10-30 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: agentes agentes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes
    ADD CONSTRAINT agentes_pkey PRIMARY KEY (id);


--
-- Name: adjuntos attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: busquedas busquedas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.busquedas
    ADD CONSTRAINT busquedas_pkey PRIMARY KEY (id);


--
-- Name: llamadas calls_call_sid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llamadas
    ADD CONSTRAINT calls_call_sid_key UNIQUE (sid_llamada);


--
-- Name: llamadas calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llamadas
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);


--
-- Name: identidades_canal channel_identities_channel_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidades_canal
    ADD CONSTRAINT channel_identities_channel_external_id_key UNIQUE (canal, id_externo);


--
-- Name: identidades_canal channel_identities_contact_id_channel_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidades_canal
    ADD CONSTRAINT channel_identities_contact_id_channel_key UNIQUE (contacto_id, canal);


--
-- Name: identidades_canal channel_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidades_canal
    ADD CONSTRAINT channel_identities_pkey PRIMARY KEY (id);


--
-- Name: contactos contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contactos
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: conversaciones_controles conversaciones_controles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones_controles
    ADD CONSTRAINT conversaciones_controles_pkey PRIMARY KEY (conversacion_id);


--
-- Name: conversaciones_insights conversaciones_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones_insights
    ADD CONSTRAINT conversaciones_insights_pkey PRIMARY KEY (conversacion_id);


--
-- Name: conversaciones conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: custom_fields custom_fields_agente_id_entidad_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_agente_id_entidad_nombre_key UNIQUE (agente_id, entidad, nombre);


--
-- Name: custom_fields custom_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_pkey PRIMARY KEY (id);


--
-- Name: departamentos departments_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departments_name_key UNIQUE (nombre);


--
-- Name: departamentos departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: ejecuciones_asistente ejecuciones_asistente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ejecuciones_asistente
    ADD CONSTRAINT ejecuciones_asistente_pkey PRIMARY KEY (id);


--
-- Name: empleados employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT employees_pkey PRIMARY KEY (usuario_id);


--
-- Name: eventos_entrega eventos_entrega_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_entrega
    ADD CONSTRAINT eventos_entrega_pkey PRIMARY KEY (id);


--
-- Name: eventos_auditoria events_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_auditoria
    ADD CONSTRAINT events_audit_pkey PRIMARY KEY (id);


--
-- Name: lead_etapas lead_etapas_codigo_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_etapas
    ADD CONSTRAINT lead_etapas_codigo_unique UNIQUE (tablero_id, codigo);


--
-- Name: lead_etapas lead_etapas_orden_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_etapas
    ADD CONSTRAINT lead_etapas_orden_unique UNIQUE (tablero_id, orden);


--
-- Name: lead_etapas lead_etapas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_etapas
    ADD CONSTRAINT lead_etapas_pkey PRIMARY KEY (id);


--
-- Name: lead_movimientos lead_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_movimientos
    ADD CONSTRAINT lead_movimientos_pkey PRIMARY KEY (id);


--
-- Name: lead_recordatorios lead_recordatorios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_recordatorios
    ADD CONSTRAINT lead_recordatorios_pkey PRIMARY KEY (id);


--
-- Name: lead_tableros lead_tableros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tableros
    ADD CONSTRAINT lead_tableros_pkey PRIMARY KEY (id);


--
-- Name: lead_tableros lead_tableros_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tableros
    ADD CONSTRAINT lead_tableros_slug_key UNIQUE (slug);


--
-- Name: lead_tarjetas lead_tarjetas_contacto_tablero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tarjetas
    ADD CONSTRAINT lead_tarjetas_contacto_tablero_key UNIQUE (contacto_id, tablero_id);


--
-- Name: lead_tarjetas lead_tarjetas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tarjetas
    ADD CONSTRAINT lead_tarjetas_pkey PRIMARY KEY (id);


--
-- Name: mensajes messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: permisos permissions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos
    ADD CONSTRAINT permissions_code_key UNIQUE (codigo);


--
-- Name: permisos permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: prompt_bindings prompt_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_bindings
    ADD CONSTRAINT prompt_bindings_pkey PRIMARY KEY (id);


--
-- Name: prompt_versions prompt_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_versions
    ADD CONSTRAINT prompt_versions_pkey PRIMARY KEY (id);


--
-- Name: prompt_versions prompt_versions_prompt_id_version_num_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_versions
    ADD CONSTRAINT prompt_versions_prompt_id_version_num_key UNIQUE (prompt_id, version_num);


--
-- Name: prompts prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompts
    ADD CONSTRAINT prompts_pkey PRIMARY KEY (id);


--
-- Name: resultados resultados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados
    ADD CONSTRAINT resultados_pkey PRIMARY KEY (id);


--
-- Name: roles_permisos role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (rol_id, permiso_id);


--
-- Name: roles roles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_code_key UNIQUE (codigo);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: secretos secretos_clave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretos
    ADD CONSTRAINT secretos_clave_key UNIQUE (clave);


--
-- Name: secretos secretos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretos
    ADD CONSTRAINT secretos_pkey PRIMARY KEY (id);


--
-- Name: usuarios_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (usuario_id, rol_id);


--
-- Name: usuarios users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT users_email_key UNIQUE (correo);


--
-- Name: usuarios users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: resultados ux_resultados_busqueda_fte_ext; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados
    ADD CONSTRAINT ux_resultados_busqueda_fte_ext UNIQUE (busqueda_id, fuente, external_id);


--
-- Name: webhooks_entrantes webhooks_incoming_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks_entrantes
    ADD CONSTRAINT webhooks_incoming_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_10_23 messages_2025_10_23_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_10_23
    ADD CONSTRAINT messages_2025_10_23_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_10_24 messages_2025_10_24_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_10_24
    ADD CONSTRAINT messages_2025_10_24_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_10_25 messages_2025_10_25_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_10_25
    ADD CONSTRAINT messages_2025_10_25_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_10_26 messages_2025_10_26_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_10_26
    ADD CONSTRAINT messages_2025_10_26_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_10_27 messages_2025_10_27_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_10_27
    ADD CONSTRAINT messages_2025_10_27_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_10_28 messages_2025_10_28_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_10_28
    ADD CONSTRAINT messages_2025_10_28_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_10_29 messages_2025_10_29_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_10_29
    ADD CONSTRAINT messages_2025_10_29_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: prefixes prefixes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT prefixes_pkey PRIMARY KEY (bucket_id, level, name);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: seed_files seed_files_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.seed_files
    ADD CONSTRAINT seed_files_pkey PRIMARY KEY (path);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: agentes_canal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agentes_canal_idx ON public.agentes USING btree (canal);


--
-- Name: contactos_datos_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contactos_datos_gin ON public.contactos USING gin (contacto_datos);


--
-- Name: idx_attachments_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attachments_message ON public.adjuntos USING btree (mensaje_id);


--
-- Name: idx_calls_contact_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_contact_time ON public.llamadas USING btree (contacto_id, iniciada_en DESC);


--
-- Name: idx_channel_identities_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_identities_contact ON public.identidades_canal USING btree (contacto_id);


--
-- Name: idx_contacts_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_owner ON public.contactos USING btree (propietario_usuario_id);


--
-- Name: idx_conversaciones_conv_openai; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversaciones_conv_openai ON public.conversaciones USING btree (conversacion_openai_id);


--
-- Name: idx_conversaciones_insights_intencion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversaciones_insights_intencion ON public.conversaciones_insights USING btree (intencion);


--
-- Name: idx_conversations_assigned_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_assigned_status ON public.conversaciones USING btree (asignado_a_usuario_id, estado);


--
-- Name: idx_conversations_contact_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_contact_status ON public.conversaciones USING btree (contacto_id, estado);


--
-- Name: idx_conversations_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_last_message ON public.conversaciones USING btree (ultimo_mensaje_en DESC);


--
-- Name: idx_ejecuciones_conv_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ejecuciones_conv_time ON public.ejecuciones_asistente USING btree (conversacion_id, iniciado_en DESC);


--
-- Name: idx_eventos_entrega_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_entrega_evento ON public.eventos_entrega USING btree (evento);


--
-- Name: idx_eventos_entrega_mensaje; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_entrega_mensaje ON public.eventos_entrega USING btree (mensaje_id, creado_en);


--
-- Name: idx_events_audit_entity_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_audit_entity_time ON public.eventos_auditoria USING btree (entidad, entidad_id, creado_en);


--
-- Name: idx_events_audit_req; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_audit_req ON public.eventos_auditoria USING btree (id_solicitud);


--
-- Name: idx_mensajes_sid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensajes_sid ON public.mensajes USING btree (twilio_message_sid);


--
-- Name: idx_messages_conversation_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation_time ON public.mensajes USING btree (conversacion_id, creado_en);


--
-- Name: idx_secretos_clave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secretos_clave ON public.secretos USING btree (clave);


--
-- Name: idx_user_roles_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user ON public.usuarios_roles USING btree (usuario_id);


--
-- Name: idx_webhooks_incoming_channel_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhooks_incoming_channel_time ON public.webhooks_entrantes USING btree (canal, recibido_en DESC);


--
-- Name: idx_webhooks_incoming_req; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhooks_incoming_req ON public.webhooks_entrantes USING btree (id_solicitud);


--
-- Name: ix_mv_actividad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_mv_actividad ON public.mv_resultados_por_actividad USING btree (actividad);


--
-- Name: ix_resultados_act_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_resultados_act_trgm ON public.resultados USING gist (actividad public.gist_trgm_ops);


--
-- Name: ix_resultados_fuente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_resultados_fuente ON public.resultados USING btree (fuente);


--
-- Name: ix_resultados_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_resultados_geom ON public.resultados USING gist (geom);


--
-- Name: ix_resultados_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_resultados_name_trgm ON public.resultados USING gist (name public.gist_trgm_ops);


--
-- Name: ix_resultados_tsv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_resultados_tsv ON public.resultados USING gin (tsv);


--
-- Name: lead_etapas_tablero_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_etapas_tablero_idx ON public.lead_etapas USING btree (tablero_id, orden);


--
-- Name: lead_movimientos_tarjeta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_movimientos_tarjeta_idx ON public.lead_movimientos USING btree (tarjeta_id, cambiado_en DESC);


--
-- Name: lead_recordatorios_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_recordatorios_due_idx ON public.lead_recordatorios USING btree (due_at, completado);


--
-- Name: lead_tarjetas_asignado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_tarjetas_asignado_idx ON public.lead_tarjetas USING btree (asignado_a_usuario_id);


--
-- Name: lead_tarjetas_categoria_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_tarjetas_categoria_idx ON public.lead_tarjetas USING btree (((metadata ->> 'categoria'::text)));


--
-- Name: lead_tarjetas_conversacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_tarjetas_conversacion_idx ON public.lead_tarjetas USING btree (conversacion_id);


--
-- Name: lead_tarjetas_tablero_etapa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_tarjetas_tablero_etapa_idx ON public.lead_tarjetas USING btree (tablero_id, etapa_id);


--
-- Name: prompt_bindings_agente_activo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prompt_bindings_agente_activo_idx ON public.prompt_bindings USING btree (agente_id) WHERE (activo = true);


--
-- Name: uniq_ejecuciones_response_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_ejecuciones_response_id ON public.ejecuciones_asistente USING btree (response_id) WHERE (response_id IS NOT NULL);


--
-- Name: uniq_ejecuciones_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_ejecuciones_run_id ON public.ejecuciones_asistente USING btree (response_id) WHERE (response_id IS NOT NULL);


--
-- Name: uniq_eventos_entrega_msg_evt_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_eventos_entrega_msg_evt_ts ON public.eventos_entrega USING btree (mensaje_id, evento, proveedor_ts);


--
-- Name: uniq_mensajes_twilio_sid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_mensajes_twilio_sid ON public.mensajes USING btree (twilio_message_sid) WHERE (twilio_message_sid IS NOT NULL);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_10_23_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_10_23_inserted_at_topic_idx ON realtime.messages_2025_10_23 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_10_24_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_10_24_inserted_at_topic_idx ON realtime.messages_2025_10_24 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_10_25_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_10_25_inserted_at_topic_idx ON realtime.messages_2025_10_25 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_10_26_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_10_26_inserted_at_topic_idx ON realtime.messages_2025_10_26 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_10_27_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_10_27_inserted_at_topic_idx ON realtime.messages_2025_10_27 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_10_28_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_10_28_inserted_at_topic_idx ON realtime.messages_2025_10_28 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_10_29_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_10_29_inserted_at_topic_idx ON realtime.messages_2025_10_29 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_key ON realtime.subscription USING btree (subscription_id, entity, filters);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_name_bucket_level_unique; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_name_bucket_level_unique ON storage.objects USING btree (name COLLATE "C", bucket_id, level);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_lower_name ON storage.objects USING btree ((path_tokens[level]), lower(name) text_pattern_ops, bucket_id, level);


--
-- Name: idx_prefixes_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_prefixes_lower_name ON storage.prefixes USING btree (bucket_id, level, ((string_to_array(name, '/'::text))[level]), lower(name) text_pattern_ops);


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: objects_bucket_id_level_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX objects_bucket_id_level_idx ON storage.objects USING btree (bucket_id, level, name COLLATE "C");


--
-- Name: messages_2025_10_23_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_10_23_inserted_at_topic_idx;


--
-- Name: messages_2025_10_23_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_10_23_pkey;


--
-- Name: messages_2025_10_24_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_10_24_inserted_at_topic_idx;


--
-- Name: messages_2025_10_24_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_10_24_pkey;


--
-- Name: messages_2025_10_25_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_10_25_inserted_at_topic_idx;


--
-- Name: messages_2025_10_25_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_10_25_pkey;


--
-- Name: messages_2025_10_26_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_10_26_inserted_at_topic_idx;


--
-- Name: messages_2025_10_26_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_10_26_pkey;


--
-- Name: messages_2025_10_27_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_10_27_inserted_at_topic_idx;


--
-- Name: messages_2025_10_27_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_10_27_pkey;


--
-- Name: messages_2025_10_28_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_10_28_inserted_at_topic_idx;


--
-- Name: messages_2025_10_28_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_10_28_pkey;


--
-- Name: messages_2025_10_29_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_10_29_inserted_at_topic_idx;


--
-- Name: messages_2025_10_29_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_10_29_pkey;


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.manejar_usuario_auth_nuevo();


--
-- Name: conversaciones conversaciones_auto_tarjeta; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversaciones_auto_tarjeta AFTER INSERT ON public.conversaciones FOR EACH ROW EXECUTE FUNCTION public.tg_conversaciones_auto_tarjeta();


--
-- Name: lead_etapas lead_etapas_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_etapas_touch_updated_at BEFORE UPDATE ON public.lead_etapas FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: lead_recordatorios lead_recordatorios_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_recordatorios_touch_updated_at BEFORE UPDATE ON public.lead_recordatorios FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: lead_tableros lead_tableros_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_tableros_touch_updated_at BEFORE UPDATE ON public.lead_tableros FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: lead_tarjetas lead_tarjetas_after_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_tarjetas_after_write AFTER INSERT OR UPDATE ON public.lead_tarjetas FOR EACH ROW EXECUTE FUNCTION public.tg_lead_tarjetas_after_write();


--
-- Name: lead_tarjetas lead_tarjetas_before_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_tarjetas_before_write BEFORE INSERT OR UPDATE ON public.lead_tarjetas FOR EACH ROW EXECUTE FUNCTION public.tg_lead_tarjetas_before_write();


--
-- Name: conversaciones_insights lead_tarjetas_sync_from_insights; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_tarjetas_sync_from_insights AFTER INSERT OR UPDATE ON public.conversaciones_insights FOR EACH ROW EXECUTE FUNCTION public.tg_sync_lead_score_from_insights();


--
-- Name: secretos t_secretos_set_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_secretos_set_updated BEFORE UPDATE ON public.secretos FOR EACH ROW EXECUTE FUNCTION public.t_set_actualizado_en();


--
-- Name: busquedas tg_busquedas_set_centro; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_busquedas_set_centro BEFORE INSERT OR UPDATE OF lat, lng ON public.busquedas FOR EACH ROW EXECUTE FUNCTION public.trg_busquedas_set_centro();


--
-- Name: resultados tg_resultados_set_geom; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_resultados_set_geom BEFORE INSERT OR UPDATE OF lat, lng ON public.resultados FOR EACH ROW EXECUTE FUNCTION public.trg_resultados_set_geom();


--
-- Name: resultados tg_resultados_set_tsv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_resultados_set_tsv BEFORE INSERT OR UPDATE OF name, actividad, address ON public.resultados FOR EACH ROW EXECUTE FUNCTION public.trg_resultados_set_tsv();


--
-- Name: conversaciones_controles trg_conversaciones_controles_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_conversaciones_controles_touch BEFORE UPDATE ON public.conversaciones_controles FOR EACH ROW EXECUTE FUNCTION public.touch_conversaciones_controles_updated_at();


--
-- Name: usuarios_roles trg_prevent_remove_last_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_remove_last_admin BEFORE DELETE OR UPDATE ON public.usuarios_roles FOR EACH ROW EXECUTE FUNCTION public.prevent_remove_last_admin();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: objects objects_delete_delete_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- Name: objects objects_insert_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();


--
-- Name: objects objects_update_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();


--
-- Name: prefixes prefixes_create_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();


--
-- Name: prefixes prefixes_delete_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: adjuntos attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos
    ADD CONSTRAINT attachments_message_id_fkey FOREIGN KEY (mensaje_id) REFERENCES public.mensajes(id) ON DELETE CASCADE;


--
-- Name: llamadas calls_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llamadas
    ADD CONSTRAINT calls_contact_id_fkey FOREIGN KEY (contacto_id) REFERENCES public.contactos(id) ON DELETE SET NULL;


--
-- Name: identidades_canal channel_identities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidades_canal
    ADD CONSTRAINT channel_identities_contact_id_fkey FOREIGN KEY (contacto_id) REFERENCES public.contactos(id) ON DELETE CASCADE;


--
-- Name: contactos contacts_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contactos
    ADD CONSTRAINT contacts_owner_user_id_fkey FOREIGN KEY (propietario_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: conversaciones_controles conversaciones_controles_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones_controles
    ADD CONSTRAINT conversaciones_controles_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES public.conversaciones(id) ON DELETE CASCADE;


--
-- Name: conversaciones_insights conversaciones_insights_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones_insights
    ADD CONSTRAINT conversaciones_insights_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES public.conversaciones(id) ON DELETE CASCADE;


--
-- Name: conversaciones conversaciones_ultimo_mensaje_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones
    ADD CONSTRAINT conversaciones_ultimo_mensaje_fk FOREIGN KEY (ultimo_mensaje_id) REFERENCES public.mensajes(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


--
-- Name: conversaciones conversations_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones
    ADD CONSTRAINT conversations_assigned_to_user_id_fkey FOREIGN KEY (asignado_a_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: conversaciones conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones
    ADD CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contacto_id) REFERENCES public.contactos(id) ON DELETE CASCADE;


--
-- Name: custom_fields custom_fields_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.agentes(id) ON DELETE CASCADE;


--
-- Name: departamentos departments_parent_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departments_parent_department_id_fkey FOREIGN KEY (departamento_padre_id) REFERENCES public.departamentos(id) ON DELETE SET NULL;


--
-- Name: ejecuciones_asistente ejecuciones_asistente_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ejecuciones_asistente
    ADD CONSTRAINT ejecuciones_asistente_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES public.conversaciones(id) ON DELETE CASCADE;


--
-- Name: empleados employees_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT employees_department_id_fkey FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id) ON DELETE SET NULL;


--
-- Name: empleados employees_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: eventos_entrega eventos_entrega_mensaje_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_entrega
    ADD CONSTRAINT eventos_entrega_mensaje_id_fkey FOREIGN KEY (mensaje_id) REFERENCES public.mensajes(id) ON DELETE CASCADE;


--
-- Name: eventos_auditoria events_audit_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_auditoria
    ADD CONSTRAINT events_audit_actor_user_id_fkey FOREIGN KEY (actor_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: lead_etapas lead_etapas_tablero_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_etapas
    ADD CONSTRAINT lead_etapas_tablero_id_fkey FOREIGN KEY (tablero_id) REFERENCES public.lead_tableros(id) ON DELETE CASCADE;


--
-- Name: lead_movimientos lead_movimientos_cambiado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_movimientos
    ADD CONSTRAINT lead_movimientos_cambiado_por_fkey FOREIGN KEY (cambiado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: lead_movimientos lead_movimientos_etapa_destino_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_movimientos
    ADD CONSTRAINT lead_movimientos_etapa_destino_id_fkey FOREIGN KEY (etapa_destino_id) REFERENCES public.lead_etapas(id);


--
-- Name: lead_movimientos lead_movimientos_etapa_origen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_movimientos
    ADD CONSTRAINT lead_movimientos_etapa_origen_id_fkey FOREIGN KEY (etapa_origen_id) REFERENCES public.lead_etapas(id);


--
-- Name: lead_movimientos lead_movimientos_tarjeta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_movimientos
    ADD CONSTRAINT lead_movimientos_tarjeta_id_fkey FOREIGN KEY (tarjeta_id) REFERENCES public.lead_tarjetas(id) ON DELETE CASCADE;


--
-- Name: lead_recordatorios lead_recordatorios_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_recordatorios
    ADD CONSTRAINT lead_recordatorios_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: lead_recordatorios lead_recordatorios_tarjeta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_recordatorios
    ADD CONSTRAINT lead_recordatorios_tarjeta_id_fkey FOREIGN KEY (tarjeta_id) REFERENCES public.lead_tarjetas(id) ON DELETE CASCADE;


--
-- Name: lead_tableros lead_tableros_departamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tableros
    ADD CONSTRAINT lead_tableros_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id) ON DELETE SET NULL;


--
-- Name: lead_tableros lead_tableros_propietario_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tableros
    ADD CONSTRAINT lead_tableros_propietario_usuario_id_fkey FOREIGN KEY (propietario_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: lead_tarjetas lead_tarjetas_asignado_a_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tarjetas
    ADD CONSTRAINT lead_tarjetas_asignado_a_usuario_id_fkey FOREIGN KEY (asignado_a_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: lead_tarjetas lead_tarjetas_contacto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tarjetas
    ADD CONSTRAINT lead_tarjetas_contacto_id_fkey FOREIGN KEY (contacto_id) REFERENCES public.contactos(id) ON DELETE CASCADE;


--
-- Name: lead_tarjetas lead_tarjetas_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tarjetas
    ADD CONSTRAINT lead_tarjetas_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES public.conversaciones(id) ON DELETE SET NULL;


--
-- Name: lead_tarjetas lead_tarjetas_etapa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tarjetas
    ADD CONSTRAINT lead_tarjetas_etapa_id_fkey FOREIGN KEY (etapa_id) REFERENCES public.lead_etapas(id) ON DELETE RESTRICT;


--
-- Name: lead_tarjetas lead_tarjetas_propietario_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tarjetas
    ADD CONSTRAINT lead_tarjetas_propietario_usuario_id_fkey FOREIGN KEY (propietario_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: lead_tarjetas lead_tarjetas_tablero_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tarjetas
    ADD CONSTRAINT lead_tarjetas_tablero_id_fkey FOREIGN KEY (tablero_id) REFERENCES public.lead_tableros(id) ON DELETE CASCADE;


--
-- Name: mensajes messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversacion_id) REFERENCES public.conversaciones(id) ON DELETE CASCADE;


--
-- Name: prompt_bindings prompt_bindings_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_bindings
    ADD CONSTRAINT prompt_bindings_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.agentes(id) ON DELETE CASCADE;


--
-- Name: prompt_bindings prompt_bindings_prompt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_bindings
    ADD CONSTRAINT prompt_bindings_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.prompts(id) ON DELETE CASCADE;


--
-- Name: prompt_bindings prompt_bindings_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_bindings
    ADD CONSTRAINT prompt_bindings_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.prompt_versions(id) ON DELETE SET NULL;


--
-- Name: prompt_versions prompt_versions_prompt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_versions
    ADD CONSTRAINT prompt_versions_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.prompts(id) ON DELETE CASCADE;


--
-- Name: resultados resultados_busqueda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados
    ADD CONSTRAINT resultados_busqueda_id_fkey FOREIGN KEY (busqueda_id) REFERENCES public.busquedas(id) ON DELETE CASCADE;


--
-- Name: roles_permisos role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permiso_id) REFERENCES public.permisos(id) ON DELETE CASCADE;


--
-- Name: roles_permisos role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: secretos secretos_actualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretos
    ADD CONSTRAINT secretos_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES public.usuarios(id);


--
-- Name: secretos secretos_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretos
    ADD CONSTRAINT secretos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: usuarios_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: usuarios_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: usuarios users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: prefixes prefixes_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT "prefixes_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: adjuntos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.adjuntos ENABLE ROW LEVEL SECURITY;

--
-- Name: adjuntos adjuntos_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY adjuntos_admin_todo ON public.adjuntos USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: busquedas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.busquedas ENABLE ROW LEVEL SECURITY;

--
-- Name: contactos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY;

--
-- Name: contactos contactos_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contactos_admin_todo ON public.contactos USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: contactos contactos_propietario_crud; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contactos_propietario_crud ON public.contactos TO authenticated USING ((propietario_usuario_id = auth.uid())) WITH CHECK ((propietario_usuario_id = auth.uid()));


--
-- Name: conversaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: conversaciones conversaciones_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_admin_todo ON public.conversaciones USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: conversaciones_controles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversaciones_controles ENABLE ROW LEVEL SECURITY;

--
-- Name: conversaciones_controles conversaciones_controles_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_controles_service_role ON public.conversaciones_controles TO service_role USING (true) WITH CHECK (true);


--
-- Name: conversaciones_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversaciones_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: conversaciones_insights conversaciones_insights_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_insights_admin_todo ON public.conversaciones_insights USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: conversaciones conversaciones_miembro_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_miembro_delete ON public.conversaciones FOR DELETE TO authenticated USING (public.puede_ver_conversacion(id));


--
-- Name: conversaciones conversaciones_miembro_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_miembro_insert ON public.conversaciones FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.contactos ct
  WHERE ((ct.id = conversaciones.contacto_id) AND (ct.propietario_usuario_id = auth.uid())))) OR (asignado_a_usuario_id = auth.uid())));


--
-- Name: conversaciones conversaciones_miembro_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_miembro_select ON public.conversaciones FOR SELECT TO authenticated USING (public.puede_ver_conversacion(id));


--
-- Name: conversaciones conversaciones_miembro_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_miembro_update ON public.conversaciones FOR UPDATE TO authenticated USING (public.puede_ver_conversacion(id)) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.contactos ct
  WHERE ((ct.id = conversaciones.contacto_id) AND (ct.propietario_usuario_id = auth.uid())))) OR (asignado_a_usuario_id = auth.uid())));


--
-- Name: departamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: departamentos departamentos_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departamentos_admin_todo ON public.departamentos USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: ejecuciones_asistente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ejecuciones_asistente ENABLE ROW LEVEL SECURITY;

--
-- Name: ejecuciones_asistente ejecuciones_asistente_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ejecuciones_asistente_admin_todo ON public.ejecuciones_asistente USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: empleados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;

--
-- Name: empleados empleados_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empleados_admin_todo ON public.empleados USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: empleados empleados_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empleados_self_read ON public.empleados FOR SELECT USING (((usuario_id = auth.uid()) OR public.es_admin(auth.uid())));


--
-- Name: eventos_auditoria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventos_auditoria ENABLE ROW LEVEL SECURITY;

--
-- Name: eventos_auditoria eventos_auditoria_actor_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_auditoria_actor_delete ON public.eventos_auditoria FOR DELETE TO authenticated USING ((actor_usuario_id = auth.uid()));


--
-- Name: eventos_auditoria eventos_auditoria_actor_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_auditoria_actor_modify ON public.eventos_auditoria FOR INSERT TO authenticated WITH CHECK ((actor_usuario_id = auth.uid()));


--
-- Name: eventos_auditoria eventos_auditoria_actor_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_auditoria_actor_select ON public.eventos_auditoria FOR SELECT TO authenticated USING ((actor_usuario_id = auth.uid()));


--
-- Name: eventos_auditoria eventos_auditoria_actor_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_auditoria_actor_update ON public.eventos_auditoria FOR UPDATE TO authenticated USING ((actor_usuario_id = auth.uid())) WITH CHECK ((actor_usuario_id = auth.uid()));


--
-- Name: eventos_auditoria eventos_auditoria_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_auditoria_admin_todo ON public.eventos_auditoria USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: eventos_entrega; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventos_entrega ENABLE ROW LEVEL SECURITY;

--
-- Name: eventos_entrega eventos_entrega_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_entrega_admin_todo ON public.eventos_entrega USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: eventos_entrega eventos_entrega_mensaje_visible_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_entrega_mensaje_visible_delete ON public.eventos_entrega FOR DELETE TO authenticated USING (public.puede_ver_mensaje(mensaje_id));


--
-- Name: eventos_entrega eventos_entrega_mensaje_visible_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_entrega_mensaje_visible_modify ON public.eventos_entrega FOR INSERT TO authenticated WITH CHECK (public.puede_ver_mensaje(mensaje_id));


--
-- Name: eventos_entrega eventos_entrega_mensaje_visible_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_entrega_mensaje_visible_select ON public.eventos_entrega FOR SELECT TO authenticated USING (public.puede_ver_mensaje(mensaje_id));


--
-- Name: eventos_entrega eventos_entrega_mensaje_visible_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_entrega_mensaje_visible_update ON public.eventos_entrega FOR UPDATE TO authenticated USING (public.puede_ver_mensaje(mensaje_id)) WITH CHECK (public.puede_ver_mensaje(mensaje_id));


--
-- Name: identidades_canal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.identidades_canal ENABLE ROW LEVEL SECURITY;

--
-- Name: identidades_canal identidades_canal_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY identidades_canal_admin_todo ON public.identidades_canal USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: lead_etapas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_etapas ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_etapas lead_etapas_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_etapas_admin_all ON public.lead_etapas USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: lead_etapas lead_etapas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_etapas_select ON public.lead_etapas FOR SELECT TO authenticated USING (public.puede_ver_tablero(tablero_id));


--
-- Name: lead_movimientos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_movimientos ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_movimientos lead_movimientos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_movimientos_admin_all ON public.lead_movimientos USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: lead_movimientos lead_movimientos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_movimientos_select ON public.lead_movimientos FOR SELECT TO authenticated USING (public.puede_ver_lead(tarjeta_id));


--
-- Name: lead_recordatorios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_recordatorios ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_recordatorios lead_recordatorios_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_recordatorios_admin_all ON public.lead_recordatorios USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: lead_recordatorios lead_recordatorios_crud; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_recordatorios_crud ON public.lead_recordatorios TO authenticated USING (public.puede_ver_lead(tarjeta_id)) WITH CHECK (public.puede_ver_lead(tarjeta_id));


--
-- Name: lead_tableros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_tableros ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_tableros lead_tableros_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_tableros_admin_all ON public.lead_tableros USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: lead_tableros lead_tableros_select_default; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_tableros_select_default ON public.lead_tableros FOR SELECT TO authenticated USING (public.puede_ver_tablero(id));


--
-- Name: lead_tarjetas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_tarjetas ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_tarjetas lead_tarjetas_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_tarjetas_admin_all ON public.lead_tarjetas USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: lead_tarjetas lead_tarjetas_member_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_tarjetas_member_delete ON public.lead_tarjetas FOR DELETE TO authenticated USING (public.puede_ver_lead(id));


--
-- Name: lead_tarjetas lead_tarjetas_member_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_tarjetas_member_insert ON public.lead_tarjetas FOR INSERT TO authenticated WITH CHECK ((public.es_admin(auth.uid()) OR (auth.uid() = propietario_usuario_id) OR (auth.uid() = asignado_a_usuario_id) OR (EXISTS ( SELECT 1
   FROM public.contactos ct
  WHERE ((ct.id = lead_tarjetas.contacto_id) AND (ct.propietario_usuario_id = auth.uid()))))));


--
-- Name: lead_tarjetas lead_tarjetas_member_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_tarjetas_member_select ON public.lead_tarjetas FOR SELECT TO authenticated USING (public.puede_ver_lead(id));


--
-- Name: lead_tarjetas lead_tarjetas_member_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_tarjetas_member_update ON public.lead_tarjetas FOR UPDATE TO authenticated USING (public.puede_ver_lead(id)) WITH CHECK (public.puede_ver_lead(id));


--
-- Name: llamadas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.llamadas ENABLE ROW LEVEL SECURITY;

--
-- Name: llamadas llamadas_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY llamadas_admin_todo ON public.llamadas USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: mensajes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;

--
-- Name: mensajes mensajes_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mensajes_admin_todo ON public.mensajes USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: mensajes mensajes_conversacion_visible_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mensajes_conversacion_visible_delete ON public.mensajes FOR DELETE TO authenticated USING (public.puede_ver_mensaje(id));


--
-- Name: mensajes mensajes_conversacion_visible_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mensajes_conversacion_visible_modify ON public.mensajes FOR INSERT TO authenticated WITH CHECK (public.puede_ver_conversacion(conversacion_id));


--
-- Name: mensajes mensajes_conversacion_visible_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mensajes_conversacion_visible_select ON public.mensajes FOR SELECT TO authenticated USING (public.puede_ver_mensaje(id));


--
-- Name: mensajes mensajes_conversacion_visible_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mensajes_conversacion_visible_update ON public.mensajes FOR UPDATE TO authenticated USING (public.puede_ver_mensaje(id)) WITH CHECK (public.puede_ver_conversacion(conversacion_id));


--
-- Name: busquedas p_insert_busquedas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_insert_busquedas ON public.busquedas FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: resultados p_insert_resultados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_insert_resultados ON public.resultados FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: busquedas p_select_busquedas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_select_busquedas ON public.busquedas FOR SELECT TO authenticated USING (true);


--
-- Name: resultados p_select_resultados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_select_resultados ON public.resultados FOR SELECT TO authenticated USING (true);


--
-- Name: permisos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;

--
-- Name: permisos permisos_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permisos_admin_todo ON public.permisos USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: resultados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resultados ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: roles roles_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_admin_todo ON public.roles USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: roles_permisos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles_permisos ENABLE ROW LEVEL SECURITY;

--
-- Name: roles_permisos roles_permisos_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_permisos_admin_todo ON public.roles_permisos USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: secretos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.secretos ENABLE ROW LEVEL SECURITY;

--
-- Name: secretos secretos_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY secretos_admin_todo ON public.secretos USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios usuarios_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_admin_todo ON public.usuarios USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: usuarios_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios_roles usuarios_roles_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_roles_admin_todo ON public.usuarios_roles USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: usuarios usuarios_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_self_read ON public.usuarios FOR SELECT USING (((id = auth.uid()) OR public.es_admin(auth.uid())));


--
-- Name: usuarios usuarios_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_self_update ON public.usuarios FOR UPDATE USING (((id = auth.uid()) OR public.es_admin(auth.uid()))) WITH CHECK (((id = auth.uid()) OR public.es_admin(auth.uid())));


--
-- Name: webhooks_entrantes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhooks_entrantes ENABLE ROW LEVEL SECURITY;

--
-- Name: webhooks_entrantes webhooks_entrantes_admin_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhooks_entrantes_admin_todo ON public.webhooks_entrantes USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: prefixes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.prefixes ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: -
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict KngbSnC8axmSVW9UCravON1V0U0tHFFMsv6PExsK95iT2r2GKjstPqcLMqiMKQT

