--
-- PostgreSQL database dump
--

\restrict SPiWQ8bxip5PieHbjMdq87DSXvYnb1sQcN3jMz8bIxIuEXZ9EqfiQazD0SSLdb2

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7 (Ubuntu 17.7-3.pgdg24.04+1)

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
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: hypopg; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS hypopg WITH SCHEMA extensions;


--
-- Name: EXTENSION hypopg; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION hypopg IS 'Hypothetical indexes for PostgreSQL';


--
-- Name: index_advisor; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS index_advisor WITH SCHEMA extensions;


--
-- Name: EXTENSION index_advisor; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION index_advisor IS 'Query index advisor';


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
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


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
-- Name: catalog_item_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.catalog_item_tipo AS ENUM (
    'producto',
    'servicio',
    'paquete'
);


--
-- Name: cliente_documento_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cliente_documento_estado AS ENUM (
    'pendiente',
    'recibido',
    'validado',
    'rechazado'
);


--
-- Name: cliente_documento_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cliente_documento_tipo AS ENUM (
    'constancia_fiscal',
    'comprobante_domicilio',
    'identificacion_oficial',
    'contrato_servicio',
    'nda',
    'otro'
);


--
-- Name: cliente_onboarding_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cliente_onboarding_estado AS ENUM (
    'pendiente',
    'en_progreso',
    'completado'
);


--
-- Name: fuente_resultado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fuente_resultado AS ENUM (
    'google_places',
    'denue',
    'usuario'
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
-- Name: lead_cotizacion_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_cotizacion_estado AS ENUM (
    'borrador',
    'enviada',
    'aceptada',
    'rechazada',
    'cancelada'
);


--
-- Name: TYPE lead_cotizacion_estado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.lead_cotizacion_estado IS 'Estados válidos para el ciclo de vida de una cotización ligada a un lead.';


--
-- Name: property_desarrollo_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.property_desarrollo_tipo AS ENUM (
    'horizontal',
    'vertical',
    'mixto'
);


--
-- Name: propiedad_desarrollo_modo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.propiedad_desarrollo_modo AS ENUM (
    'horizontal',
    'vertical'
);


--
-- Name: propiedad_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.propiedad_status AS ENUM (
    'disponible',
    'apartado',
    'vendido',
    'reservado'
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
    'ANALYTICS',
    'VECTOR'
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
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


--
-- Name: _apply_quote_items(uuid, jsonb, character); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._apply_quote_items(p_cotizacion_id uuid, p_items jsonb, p_default_moneda character) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    r_item record;
    v_catalog_item uuid;
    v_titulo text;
    v_descripcion text;
    v_unidad text;
    v_cantidad numeric;
    v_precio_unitario numeric;
    v_descuento numeric;
    v_subtotal numeric;
    v_impuestos numeric;
    v_total numeric;
    v_moneda char(3);
    v_metadatos jsonb;
    v_orden integer;
    v_text text;
BEGIN
    IF p_cotizacion_id IS NULL THEN
        RETURN;
    END IF;

    DELETE FROM public.lead_cotizacion_items WHERE cotizacion_id = p_cotizacion_id;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RETURN;
    END IF;

    FOR r_item IN
        SELECT value, ordinality
        FROM jsonb_array_elements(p_items) WITH ORDINALITY AS elem(value, ordinality)
    LOOP
        v_catalog_item := NULL;
        v_titulo := NULLIF(r_item.value->>'titulo', '');
        v_descripcion := NULLIF(r_item.value->>'descripcion', '');
        v_unidad := NULLIF(r_item.value->>'unidad', '');
        IF v_unidad IS NULL THEN
            v_unidad := 'unidad';
        END IF;

        v_text := NULLIF(r_item.value->>'catalog_item_id', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_catalog_item := v_text::uuid;
            EXCEPTION WHEN invalid_text_representation THEN
                v_catalog_item := NULL;
            END;
        END IF;

        v_text := NULLIF(r_item.value->>'cantidad', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_cantidad := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_cantidad := NULL;
            END;
        ELSE
            v_cantidad := NULL;
        END IF;
        IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
            v_cantidad := 1;
        END IF;

        v_text := NULLIF(r_item.value->>'precio_unitario', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_precio_unitario := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_precio_unitario := NULL;
            END;
        ELSE
            v_precio_unitario := NULL;
        END IF;

        v_text := NULLIF(r_item.value->>'descuento', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_descuento := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_descuento := NULL;
            END;
        ELSE
            v_descuento := NULL;
        END IF;

        v_text := NULLIF(r_item.value->>'subtotal', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_subtotal := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_subtotal := NULL;
            END;
        ELSE
            v_subtotal := NULL;
        END IF;

        v_text := NULLIF(r_item.value->>'impuestos', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_impuestos := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_impuestos := NULL;
            END;
        ELSE
            v_impuestos := NULL;
        END IF;

        v_text := NULLIF(r_item.value->>'total', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_total := v_text::numeric;
            EXCEPTION WHEN invalid_text_representation THEN
                v_total := NULL;
            END;
        ELSE
            v_total := NULL;
        END IF;

        v_text := NULLIF(r_item.value->>'moneda', '');
        IF v_text IS NOT NULL THEN
            v_moneda := SUBSTRING(upper(v_text) FROM 1 FOR 3);
        ELSE
            v_moneda := NULL;
        END IF;
        IF v_moneda IS NULL OR char_length(v_moneda) <> 3 THEN
            v_moneda := COALESCE(p_default_moneda, 'MXN');
        END IF;

        v_metadatos := '{}'::jsonb;
        IF r_item.value ? 'metadatos' AND jsonb_typeof(r_item.value->'metadatos') = 'object' THEN
            v_metadatos := r_item.value->'metadatos';
        END IF;

        v_orden := r_item.ordinality;
        v_text := NULLIF(r_item.value->>'orden', '');
        IF v_text IS NOT NULL THEN
            BEGIN
                v_orden := GREATEST(1, v_text::integer);
            EXCEPTION WHEN invalid_text_representation THEN
                v_orden := r_item.ordinality;
            END;
        END IF;

        IF v_catalog_item IS NULL AND v_titulo IS NULL AND v_descripcion IS NULL
           AND v_subtotal IS NULL AND v_total IS NULL THEN
            CONTINUE;
        END IF;

        INSERT INTO public.lead_cotizacion_items (
            cotizacion_id,
            catalog_item_id,
            titulo,
            descripcion,
            unidad,
            cantidad,
            precio_unitario,
            descuento,
            subtotal,
            impuestos,
            total,
            moneda,
            orden,
            metadatos
        ) VALUES (
            p_cotizacion_id,
            v_catalog_item,
            v_titulo,
            v_descripcion,
            COALESCE(v_unidad, 'unidad'),
            v_cantidad,
            v_precio_unitario,
            v_descuento,
            v_subtotal,
            v_impuestos,
            v_total,
            v_moneda,
            v_orden,
            v_metadatos
        );
    END LOOP;
END;
$$;


--
-- Name: _contacto_captura_estado(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._contacto_captura_estado(p_nombre text, p_correo text, p_telefono text, p_notes text, p_necesidad text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
    SELECT CASE
        WHEN COALESCE(NULLIF(btrim(p_nombre), ''), NULL) IS NOT NULL
         AND COALESCE(NULLIF(btrim(p_correo), ''), NULL) IS NOT NULL
         AND COALESCE(NULLIF(btrim(p_telefono), ''), NULL) IS NOT NULL
         AND COALESCE(NULLIF(btrim(p_notes), ''), NULL) IS NOT NULL
         AND COALESCE(NULLIF(btrim(p_necesidad), ''), NULL) IS NOT NULL
        THEN 'completo'
        ELSE 'incompleto'
    END;
$$;


--
-- Name: FUNCTION _contacto_captura_estado(p_nombre text, p_correo text, p_telefono text, p_notes text, p_necesidad text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public._contacto_captura_estado(p_nombre text, p_correo text, p_telefono text, p_notes text, p_necesidad text) IS 'Determina si un contacto tiene todos los campos de captura completados.';


--
-- Name: _lead_tarjeta_auto_precalificar(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._lead_tarjeta_auto_precalificar(p_tarjeta_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public, pg_temp'
    AS $$
DECLARE
    v_tablero_id uuid;
    v_contacto_id uuid;
    v_etapa_actual uuid;
    v_contacto record;
    v_etapa_pre uuid;
    v_etapa_pre_orden smallint;
    v_etapa_actual_orden smallint;
BEGIN
    IF p_tarjeta_id IS NULL THEN
        RETURN;
    END IF;

    SELECT lt.tablero_id,
           lt.contacto_id,
           lt.etapa_id
      INTO v_tablero_id,
           v_contacto_id,
           v_etapa_actual
      FROM public.lead_tarjetas lt
     WHERE lt.id = p_tarjeta_id;

    IF v_tablero_id IS NULL OR v_contacto_id IS NULL OR v_etapa_actual IS NULL THEN
        RETURN;
    END IF;

    SELECT c.nombre_completo,
           c.correo,
           c.telefono_e164,
           c.company_name
      INTO v_contacto
      FROM public.contactos c
     WHERE c.id = v_contacto_id;

    IF v_contacto IS NULL THEN
        RETURN;
    END IF;

    IF NOT (
        COALESCE(NULLIF(btrim(v_contacto.nombre_completo), ''), NULL) IS NOT NULL
        AND COALESCE(NULLIF(btrim(v_contacto.correo), ''), NULL) IS NOT NULL
        AND COALESCE(NULLIF(btrim(v_contacto.telefono_e164), ''), NULL) IS NOT NULL
        AND COALESCE(NULLIF(btrim(v_contacto.company_name), ''), NULL) IS NOT NULL
    ) THEN
        RETURN;
    END IF;

    SELECT le.id, le.orden
      INTO v_etapa_pre, v_etapa_pre_orden
      FROM public.lead_etapas le
     WHERE le.tablero_id = v_tablero_id
       AND le.codigo = 'precalificado'
     LIMIT 1;

    IF v_etapa_pre IS NULL THEN
        RETURN;
    END IF;

    IF v_etapa_pre = v_etapa_actual THEN
        RETURN;
    END IF;

    SELECT le.orden
      INTO v_etapa_actual_orden
      FROM public.lead_etapas le
     WHERE le.id = v_etapa_actual;

    IF v_etapa_actual_orden IS NULL OR v_etapa_pre_orden IS NULL THEN
        RETURN;
    END IF;

    -- Solo promociona cuando la etapa actual está antes de "precalificado".
    IF v_etapa_actual_orden >= v_etapa_pre_orden THEN
        RETURN;
    END IF;

    UPDATE public.lead_tarjetas
       SET etapa_id = v_etapa_pre
     WHERE id = p_tarjeta_id
       AND etapa_id IS DISTINCT FROM v_etapa_pre;
END;
$$;


--
-- Name: FUNCTION _lead_tarjeta_auto_precalificar(p_tarjeta_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public._lead_tarjeta_auto_precalificar(p_tarjeta_id uuid) IS 'Promueve automáticamente la tarjeta a la etapa "precalificado" cuando el contacto tiene nombre, correo, teléfono y empresa.';


--
-- Name: asignar_vendedor_round_robin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.asignar_vendedor_round_robin(p_organizacion_id uuid) RETURNS TABLE(usuario_id uuid, nombre text, correo text, telefono_e164 text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
    return query
    with next_emp as (
        select e.usuario_id
        from public.empleados e
        where e.organizacion_id = p_organizacion_id
          and coalesce(e.es_vendedor, false)
        order by coalesce(e.ultimo_lead_asignado_en, timestamptz '1970-01-01 00:00:00+00') asc,
                 e.usuario_id
        limit 1
        for update skip locked
    ),
    updated as (
        update public.empleados e
        set ultimo_lead_asignado_en = now()
        from next_emp
        where e.usuario_id = next_emp.usuario_id
        returning e.usuario_id
    )
    select u.id,
           coalesce(u.nombre_completo, u.correo) as nombre,
           u.correo,
           u.telefono_e164
    from updated
    join public.usuarios u on u.id = updated.usuario_id;
end;
$$;


--
-- Name: FUNCTION asignar_vendedor_round_robin(p_organizacion_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.asignar_vendedor_round_robin(p_organizacion_id uuid) IS 'Selecciona al siguiente vendedor (empleados.es_vendedor) de forma round-robin y actualiza su timestamp.';


--
-- Name: catalog_document_embeddings_delete_missing(uuid, text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.catalog_document_embeddings_delete_missing(p_organizacion_id uuid, p_entity_type text, p_keep_ids uuid[] DEFAULT NULL::uuid[]) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF p_keep_ids IS NULL OR cardinality(p_keep_ids) = 0 THEN
    DELETE FROM public.catalog_document_embeddings
    WHERE organizacion_id = p_organizacion_id
      AND entity_type = p_entity_type;
  ELSE
    DELETE FROM public.catalog_document_embeddings
    WHERE organizacion_id = p_organizacion_id
      AND entity_type = p_entity_type
      AND NOT (entity_id = ANY (p_keep_ids));
  END IF;
END;
$$;


--
-- Name: catalog_document_embeddings_search(uuid, public.vector, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.catalog_document_embeddings_search(p_organizacion_id uuid, p_embedding public.vector, p_limit integer DEFAULT 20) RETURNS TABLE(id uuid, organizacion_id uuid, entity_type text, entity_id uuid, contenido text, metadata jsonb, actualizado_en timestamp with time zone, similarity double precision)
    LANGUAGE sql STABLE
    AS $$
SELECT
  id,
  organizacion_id,
  entity_type,
  entity_id,
  contenido,
  metadata,
  actualizado_en,
  embedding <=> p_embedding AS similarity
FROM public.catalog_document_embeddings
WHERE organizacion_id = p_organizacion_id
ORDER BY similarity
LIMIT p_limit;
$$;


--
-- Name: check_missing_pipeline_stages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_missing_pipeline_stages() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    missing jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO missing
    FROM public.organizaciones_missing_etapas_pipeline t;

    IF jsonb_array_length(missing) = 0 THEN
        RETURN;
    END IF;

    RAISE EXCEPTION USING
        MESSAGE = 'missing_pipeline_stages',
        DETAIL = missing::text;
END;
$$;


--
-- Name: FUNCTION check_missing_pipeline_stages(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_missing_pipeline_stages() IS 'Lanza una excepción si algún tenant no tiene las etapas canónicas; úsala en jobs/cron (SELECT check_missing_pipeline_stages()).';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contacto_id uuid NOT NULL,
    legacy_lead_id uuid,
    tablero_id uuid,
    etapa_id uuid,
    estado_onboarding public.cliente_onboarding_estado DEFAULT 'pendiente'::public.cliente_onboarding_estado NOT NULL,
    rfc text,
    razon_social text,
    domicilio_fiscal text,
    domicilio_fisico text,
    regimen_fiscal text,
    datos_facturacion jsonb DEFAULT '{}'::jsonb NOT NULL,
    fuente text,
    monto_estimado numeric(12,2),
    moneda character(3) DEFAULT 'MXN'::bpchar NOT NULL,
    metadatos jsonb DEFAULT '{}'::jsonb NOT NULL,
    ganado_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL,
    oportunidad_id uuid,
    cuenta_id uuid NOT NULL,
    CONSTRAINT clientes_moneda_check CHECK ((char_length(moneda) = 3)),
    CONSTRAINT clientes_monto_check CHECK (((monto_estimado IS NULL) OR (monto_estimado >= (0)::numeric)))
);

ALTER TABLE ONLY public.clientes REPLICA IDENTITY FULL;

ALTER TABLE ONLY public.clientes FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE clientes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.clientes IS 'Clientes derivados de leads ganados con datos fiscales y de onboarding.';


--
-- Name: COLUMN clientes.contacto_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.contacto_id IS 'Referencia 1:1 con el contacto original del lead.';


--
-- Name: COLUMN clientes.legacy_lead_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.legacy_lead_id IS 'ID legacy en lead_tarjetas (solo auditoría).';


--
-- Name: COLUMN clientes.estado_onboarding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.estado_onboarding IS 'Estatus general del proceso de alta (pendiente, en_progreso, completado).';


--
-- Name: COLUMN clientes.rfc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.rfc IS 'RFC para facturación.';


--
-- Name: COLUMN clientes.razon_social; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.razon_social IS 'Razón social a facturar.';


--
-- Name: COLUMN clientes.domicilio_fiscal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.domicilio_fiscal IS 'Domicilio fiscal registrado.';


--
-- Name: COLUMN clientes.domicilio_fisico; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.domicilio_fisico IS 'Domicilio físico/operativo cuando difiere del fiscal.';


--
-- Name: COLUMN clientes.regimen_fiscal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.regimen_fiscal IS 'Régimen fiscal declarado por el cliente.';


--
-- Name: COLUMN clientes.datos_facturacion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.datos_facturacion IS 'Metadatos adicionales de facturación (uso CFDI, forma de pago, etc.).';


--
-- Name: COLUMN clientes.oportunidad_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.oportunidad_id IS 'Oportunidad CRM que originó el cliente.';


--
-- Name: COLUMN clientes.cuenta_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.cuenta_id IS 'Cuenta CRM asociada al cliente.';


--
-- Name: convertir_lead_en_cliente(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convertir_lead_en_cliente(p_tarjeta_id uuid, p_forzar boolean DEFAULT false) RETURNS public.clientes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_categoria text;
    v_estado text;
BEGIN
    SELECT
        lower(coalesce(ep.categoria, '')),
        lower(coalesce(o.estado, ''))
      INTO v_categoria, v_estado
      FROM public.oportunidades o
      LEFT JOIN public.etapas_pipeline ep ON ep.id = o.etapa_id
     WHERE o.id = p_tarjeta_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'oportunidad_no_encontrada';
    END IF;

    IF NOT p_forzar
       AND coalesce(v_categoria, '') <> 'ganada'
       AND coalesce(v_estado, '') <> 'ganada' THEN
        RAISE EXCEPTION 'oportunidad_no_ganada';
    END IF;

    RETURN public.ensure_cliente_from_oportunidad(p_tarjeta_id);
END;
$$;


--
-- Name: FUNCTION convertir_lead_en_cliente(p_tarjeta_id uuid, p_forzar boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.convertir_lead_en_cliente(p_tarjeta_id uuid, p_forzar boolean) IS 'Forza la creación de un cliente a partir de una oportunidad ganada del CRM.';


--
-- Name: crear_busqueda(public.fuente_resultado, text, integer, double precision, double precision, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_busqueda(p_fuente public.fuente_resultado, p_query text, p_radio_m integer, p_lat double precision, p_lng double precision, p_total integer, p_meta jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public, pg_temp'
    AS $$
declare
    v_id uuid;
begin
    INSERT INTO public.busquedas (fuente, query, radio_m, lat, lng, total_encontrados, meta)
    VALUES (p_fuente, p_query, p_radio_m, p_lat, p_lng, p_total, COALESCE(p_meta, '{}'::jsonb))
    RETURNING id INTO v_id;
    RETURN v_id;
end;
$$;


--
-- Name: crm_contact_restart_stats(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_contact_restart_stats(p_organizacion_id uuid, p_min_restart_sequence integer DEFAULT 2, p_limit integer DEFAULT 200) RETURNS TABLE(contacto_id uuid, contacto_nombre text, contacto_correo text, contacto_telefono text, total_ciclos integer, ciclo_actual integer, monto_total numeric, monto_ciclo_actual numeric, monto_ciclos_previos numeric, oportunidad_id uuid, etapa_id uuid, etapa_nombre text, estado text, vendedor_id uuid, vendedor_nombre text, actualizado_en timestamp with time zone, primer_ciclo_en timestamp with time zone, ultimo_reinicio_en timestamp with time zone, metadata jsonb, ciclos_detalle jsonb, reengage_attempts integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH base AS (
    SELECT
        o.id AS oportunidad_id,
        o.contacto_principal_id AS contacto_id,
        o.organizacion_id,
        COALESCE((o.metadata->>'restart_sequence')::integer, 1) AS restart_sequence,
        COALESCE(o.monto_estimado, 0) AS monto_estimado,
        o.estado,
        o.etapa_id,
        o.asignado_a_usuario_id,
        COALESCE(o.actualizado_en, o.creado_en) AS actualizado_en,
        o.creado_en,
        o.metadata
    FROM public.oportunidades o
    WHERE
        o.organizacion_id = p_organizacion_id
        AND o.contacto_principal_id IS NOT NULL
),
ranked AS (
    SELECT
        b.*,
        ROW_NUMBER() OVER (
            PARTITION BY b.contacto_id
            ORDER BY b.restart_sequence DESC,
                     b.actualizado_en DESC,
                     b.creado_en DESC
        ) AS rn
    FROM base b
),
aggregated AS (
    SELECT
        contacto_id,
        COUNT(*)::integer AS total_ciclos,
        MAX(restart_sequence)::integer AS ciclo_actual,
        SUM(monto_estimado)::numeric AS monto_total,
        MIN(creado_en) AS primer_ciclo_en,
        MAX(
            CASE
                WHEN restart_sequence > 1 THEN COALESCE(actualizado_en, creado_en)
                ELSE NULL
            END
        ) AS ultimo_reinicio_en
    FROM base
    GROUP BY contacto_id
),
current_cycle AS (
    SELECT r.*
    FROM ranked r
    WHERE r.rn = 1
),
history AS (
    SELECT
        contacto_id,
        jsonb_agg(
            jsonb_build_object(
                'oportunidad_id', oportunidad_id,
                'restart_sequence', restart_sequence,
                'monto_estimado', monto_estimado,
                'etapa_id', etapa_id,
                'estado', estado,
                'asignado_a_usuario_id', asignado_a_usuario_id,
                'actualizado_en', actualizado_en,
                'creado_en', creado_en
            )
            ORDER BY restart_sequence ASC, creado_en ASC
        ) AS ciclos_detalle
    FROM base
    GROUP BY contacto_id
)
SELECT
    agg.contacto_id,
    ct.nombre_completo AS contacto_nombre,
    ct.correo AS contacto_correo,
    ct.telefono_e164 AS contacto_telefono,
    agg.total_ciclos,
    agg.ciclo_actual,
    agg.monto_total,
    cur.monto_estimado AS monto_ciclo_actual,
    (agg.monto_total - cur.monto_estimado) AS monto_ciclos_previos,
    cur.oportunidad_id,
    cur.etapa_id,
    ep.nombre AS etapa_nombre,
    cur.estado,
    cur.asignado_a_usuario_id AS vendedor_id,
    usr.nombre_completo AS vendedor_nombre,
    cur.actualizado_en,
    agg.primer_ciclo_en,
    agg.ultimo_reinicio_en,
    cur.metadata,
    history.ciclos_detalle,
    COALESCE((cur.metadata->'whatsapp_followup'->'reengage'->>'attempts')::integer, 0) AS reengage_attempts
FROM aggregated agg
JOIN current_cycle cur ON cur.contacto_id = agg.contacto_id
JOIN public.contactos ct ON ct.id = agg.contacto_id
LEFT JOIN public.etapas_pipeline ep ON ep.id = cur.etapa_id
LEFT JOIN public.usuarios usr ON usr.id = cur.asignado_a_usuario_id
LEFT JOIN history ON history.contacto_id = agg.contacto_id
WHERE agg.ciclo_actual >= GREATEST(p_min_restart_sequence, 1)
ORDER BY agg.ciclo_actual DESC, agg.total_ciclos DESC, cur.actualizado_en DESC
LIMIT COALESCE(NULLIF(p_limit, 0), 200);
$$;


--
-- Name: FUNCTION crm_contact_restart_stats(p_organizacion_id uuid, p_min_restart_sequence integer, p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.crm_contact_restart_stats(p_organizacion_id uuid, p_min_restart_sequence integer, p_limit integer) IS 'Devuelve métricas de reinicio de oportunidades agrupadas por contacto, incluyendo conteos de reenganches y línea de tiempo básica.';


--
-- Name: crm_propiedad_hierarquia(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_propiedad_hierarquia(p_organizacion uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
WITH desarrollos AS (
    SELECT jsonb_build_object(
        'id', d.id,
        'nombre', d.nombre,
        'tipo', d.tipo,
        'status', d.status,
        'pais_codigo', d.pais_codigo,
        'estado_cve', d.estado_cve,
        'municipio_cve', d.municipio_cve,
        'codigo_postal', d.codigo_postal,
        'colonia', d.colonia,
        'metadata', d.metadata,
        'poligono_id', (
            SELECT pp.id
            FROM public.propiedad_poligonos pp
            WHERE pp.target_type = 'desarrollo' AND pp.target_id = d.id
            LIMIT 1
        ),
        'geom', (
            SELECT ST_AsGeoJSON(pp.geom)::jsonb
            FROM public.propiedad_poligonos pp
            WHERE pp.target_type = 'desarrollo' AND pp.target_id = d.id
            LIMIT 1
        ),
        'capas', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', c.id,
                    'nombre', c.nombre,
                    'nivel', c.nivel,
                    'altura', c.altura,
                    'status', c.metadata ->> 'status',
                    'metadata', c.metadata,
                    'poligono_id', (
                        SELECT pp.id
                        FROM public.propiedad_poligonos pp
                        WHERE pp.target_type = 'capa' AND pp.target_id = c.id
                        LIMIT 1
                    ),
                    'geom', (
                        SELECT ST_AsGeoJSON(pp.geom)::jsonb
                        FROM public.propiedad_poligonos pp
                        WHERE pp.target_type = 'capa' AND pp.target_id = c.id
                        LIMIT 1
                    ),
                    'unidades', (
                        SELECT COALESCE(jsonb_agg(
                            jsonb_build_object(
                                'id', u.id,
                                'unidad', u.unidad,
                                'nombre', u.nombre,
                                'status', u.status,
                                'tipo_id', u.tipo_id,
                                'precio', u.precio,
                                'area_m2', u.area_m2,
                                'linea_id', u.linea_id,
                                'familia_id', u.familia_id,
                                'modelo_id', u.modelo_id,
                                'descripcion', u.descripcion,
                                'metadata', u.metadata,
                                'poligono_id', (
                                    SELECT pp.id
                                    FROM public.propiedad_poligonos pp
                                    WHERE pp.target_type = 'unidad' AND pp.target_id = u.id
                                    LIMIT 1
                                ),
                                'geom', (
                                    SELECT ST_AsGeoJSON(pp.geom)::jsonb
                                    FROM public.propiedad_poligonos pp
                                    WHERE pp.target_type = 'unidad' AND pp.target_id = u.id
                                    LIMIT 1
                                )
                            )
                            ORDER BY u.unidad
                        ), '[]'::jsonb)
                        FROM public.propiedad_unidades u
                        WHERE u.nivel_id = c.id
                    )
                )
                ORDER BY c.nivel
            ), '[]'::jsonb)
            FROM public.propiedad_capas c
            WHERE c.desarrollo_id = d.id
        )
    ) AS desarrollo
    FROM public.propiedad_desarrollos d
    WHERE d.organizacion_id = p_organizacion
),
mixtos AS (
    SELECT jsonb_build_object(
        'id', m.id,
        'nombre', m.nombre,
        'tipo', m.tipo,
        'status', m.status,
        'metadata', m.metadata,
        'poligono_id', (
            SELECT pp.id
            FROM public.propiedad_poligonos pp
            WHERE pp.target_type = 'mix' AND pp.target_id = m.id
            LIMIT 1
        ),
        'geom', (
            SELECT ST_AsGeoJSON(pp.geom)::jsonb
            FROM public.propiedad_poligonos pp
            WHERE pp.target_type = 'mix' AND pp.target_id = m.id
            LIMIT 1
        ),
        'items', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', i.id,
                    'modo', i.modo,
                    'status', i.status,
                    'metadata', i.metadata,
                    'desarrollo_id', i.desarrollo_id
                )
            ), '[]'::jsonb)
            FROM public.propiedad_desarrollos_mix_items i
            WHERE i.mix_id = m.id
        )
    ) AS desarrollo
    FROM public.propiedad_desarrollos_mix m
    WHERE m.organizacion_id = p_organizacion
)
SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(desarrollo), '[]'::jsonb)
) FROM (
    SELECT desarrollo FROM desarrollos
    UNION ALL
    SELECT desarrollo FROM mixtos
) q;
$$;


--
-- Name: crm_propiedades_geojson(uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_propiedades_geojson(p_organizacion uuid, p_nivel integer DEFAULT NULL::integer, p_tipo uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
WITH unidad_features AS (
    SELECT jsonb_build_object(
        'type', 'Feature',
        'id', u.id,
        'layer', 'unidad',
        'geometry', ST_AsGeoJSON(pp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', u.nombre,
            'unidad', u.unidad,
            'status', u.status,
            'status_color', CASE u.status
                WHEN 'disponible' THEN '#2ECC71'
                WHEN 'apartado' THEN '#F1C40F'
                WHEN 'vendido' THEN '#E74C3C'
                WHEN 'reservado' THEN '#9B59B6'
                ELSE pt.color
            END,
            'tipo', pt.nombre,
            'tipo_color', pt.color,
            'tipo_id', pt.id,
            'nivel', c.nivel,
            'altura', c.altura,
            'capa_nombre', c.nombre,
            'desarrollo_id', d.id,
            'desarrollo_nombre', d.nombre,
            'desarrollo_tipo', d.tipo,
            'desarrollo_status', d.status,
            'pais_codigo', d.pais_codigo,
            'estado_cve', d.estado_cve,
            'municipio_cve', d.municipio_cve,
            'codigo_postal', d.codigo_postal,
            'colonia', d.colonia,
            'precio', u.precio,
            'area_m2', u.area_m2,
            'metadata', u.metadata,
            'linea_id', u.linea_id,
            'linea_nombre', l.nombre,
            'familia_id', u.familia_id,
            'familia_nombre', f.nombre,
            'modelo_id', u.modelo_id,
            'modelo_nombre', m.nombre,
            'poligono_id', pp.id,
            'poligono_metadata', pp.metadata,
            'color', COALESCE(pp.metadata->> 'color', pt.color, '#95A5A6'),
            'height', COALESCE(
                c.altura,
                NULLIF(pp.metadata->> 'height', '')::numeric,
                NULLIF(pp.metadata->> 'altura', '')::numeric,
                0
            ),
            'min_height', COALESCE(
                NULLIF(pp.metadata->> 'base', '')::numeric,
                NULLIF(pp.metadata->> 'min_height', '')::numeric,
                0
            ),
            'levels', COALESCE(
                NULLIF(pp.metadata->> 'levels', '')::int,
                NULLIF(pp.metadata->> 'nivel', '')::int,
                c.nivel,
                0
            )
        )
    ) AS feature
    FROM public.propiedad_unidades u
    JOIN public.propiedad_capas c ON c.id = u.nivel_id
    JOIN public.propiedad_desarrollos d ON d.id = COALESCE(u.desarrollo_id, c.desarrollo_id)
    LEFT JOIN public.propiedad_tipos pt ON pt.id = u.tipo_id
    LEFT JOIN public.propiedad_poligonos pp ON pp.target_type = 'unidad' AND pp.target_id = u.id
    LEFT JOIN public.lineas_de_negocio l ON l.id = u.linea_id
    LEFT JOIN public.familias_productos f ON f.id = u.familia_id
    LEFT JOIN public.modelos_productos m ON m.id = u.modelo_id
    WHERE d.organizacion_id = p_organizacion
      AND (p_nivel IS NULL OR c.nivel = p_nivel)
      AND (p_tipo IS NULL OR u.tipo_id = p_tipo)
),
capa_features AS (
    SELECT jsonb_build_object(
        'type', 'Feature',
        'id', c.id,
        'layer', 'capa',
        'geometry', ST_AsGeoJSON(pp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', c.nombre,
            'nivel', c.nivel,
            'altura', c.altura,
            'status', (c.metadata->>'status')::public.propiedad_status,
            'desarrollo_id', c.desarrollo_id,
            'desarrollo_nombre', d.nombre,
            'desarrollo_tipo', d.tipo,
            'desarrollo_status', d.status,
            'pais_codigo', d.pais_codigo,
            'estado_cve', d.estado_cve,
            'municipio_cve', d.municipio_cve,
            'metadata', c.metadata,
            'poligono_id', pp.id,
            'poligono_metadata', pp.metadata,
            'color', COALESCE(pp.metadata->> 'color', '#95A5A6'),
            'height', COALESCE(
                c.altura,
                NULLIF(pp.metadata->> 'height', '')::numeric,
                NULLIF(pp.metadata->> 'altura', '')::numeric,
                0
            ),
            'min_height', COALESCE(
                NULLIF(pp.metadata->> 'base', '')::numeric,
                NULLIF(pp.metadata->> 'min_height', '')::numeric,
                0
            ),
            'levels', COALESCE(
                NULLIF(pp.metadata->> 'levels', '')::int,
                c.nivel,
                0
            )
        )
    ) AS feature
    FROM public.propiedad_capas c
    JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
    LEFT JOIN public.propiedad_poligonos pp ON pp.target_type = 'capa' AND pp.target_id = c.id
    WHERE d.organizacion_id = p_organizacion
    AND (p_nivel IS NULL OR c.nivel = p_nivel)
),
desarrollo_features AS (
    SELECT jsonb_build_object(
        'type', 'Feature',
        'id', d.id,
        'layer', 'desarrollo',
        'geometry', ST_AsGeoJSON(pp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', d.nombre,
            'status', d.status,
            'desarrollo_tipo', d.tipo,
            'pais_codigo', d.pais_codigo,
            'estado_cve', d.estado_cve,
            'municipio_cve', d.municipio_cve,
            'descripcion', d.descripcion,
            'metadata', d.metadata,
            'poligono_id', pp.id,
            'poligono_metadata', pp.metadata,
            'color', COALESCE(pp.metadata->> 'color', '#95A5A6'),
            'height', COALESCE(
                NULLIF(pp.metadata->> 'height', '')::numeric,
                NULLIF(pp.metadata->> 'altura', '')::numeric,
                0
            ),
            'min_height', COALESCE(
                NULLIF(pp.metadata->> 'base', '')::numeric,
                NULLIF(pp.metadata->> 'min_height', '')::numeric,
                0
            ),
            'levels', COALESCE(
                NULLIF(pp.metadata->> 'levels', '')::int,
                NULLIF(pp.metadata->> 'nivel', '')::int,
                0
            )
        )
    ) AS feature
    FROM public.propiedad_desarrollos d
    LEFT JOIN public.propiedad_poligonos pp ON pp.target_type = 'desarrollo' AND pp.target_id = d.id
    WHERE d.organizacion_id = p_organizacion
),
mix_features AS (
    SELECT jsonb_build_object(
        'type', 'Feature',
        'id', m.id,
        'layer', 'mix',
        'geometry', ST_AsGeoJSON(pp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', m.nombre,
            'status', m.status,
            'desarrollo_tipo', m.tipo,
            'pais_codigo', m.pais_codigo,
            'estado_cve', m.estado_cve,
            'municipio_cve', m.municipio_cve,
            'descripcion', m.descripcion,
            'metadata', m.metadata,
            'poligono_id', pp.id,
            'poligono_metadata', pp.metadata,
            'color', COALESCE(pp.metadata->> 'color', '#95A5A6'),
            'height', COALESCE(
                NULLIF(pp.metadata->> 'height', '')::numeric,
                NULLIF(pp.metadata->> 'altura', '')::numeric,
                0
            ),
            'min_height', COALESCE(
                NULLIF(pp.metadata->> 'base', '')::numeric,
                NULLIF(pp.metadata->> 'min_height', '')::numeric,
                0
            ),
            'levels', COALESCE(
                NULLIF(pp.metadata->> 'levels', '')::int,
                NULLIF(pp.metadata->> 'nivel', '')::int,
                0
            )
        )
    ) AS feature
    FROM public.propiedad_desarrollos_mix m
    LEFT JOIN public.propiedad_poligonos pp ON pp.target_type = 'mix' AND pp.target_id = m.id
    WHERE m.organizacion_id = p_organizacion
),
combined_features AS (
    SELECT feature FROM unidad_features
    UNION ALL
    SELECT feature FROM capa_features
    UNION ALL
    SELECT feature FROM desarrollo_features
    UNION ALL
    SELECT feature FROM mix_features
)
SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
) FROM combined_features;
$$;


--
-- Name: dashboard_kpis(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dashboard_kpis(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH conv_base AS (
        SELECT
            COALESCE(NULLIF(lower(estado), ''), 'desconocido') AS estado,
            lower(NULLIF(canal, '')) AS canal
        FROM public.conversaciones
        WHERE (p_from IS NULL OR iniciada_en >= p_from)
          AND (p_to IS NULL OR iniciada_en <= p_to)
    ),
    conv_totals AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE canal = 'webchat') AS webchat_total,
            COUNT(DISTINCT canal) FILTER (WHERE canal IS NOT NULL) AS canales_activos
        FROM conv_base
    ),
    conv_by_state AS (
        SELECT estado, COUNT(*) AS total
        FROM conv_base
        GROUP BY estado
    ),
    contactos_base AS (
        SELECT
            COALESCE(NULLIF(lower(estado), ''), 'desconocido') AS estado,
            COALESCE(NULLIF(lower(captura_estado), ''), 'incompleto') AS captura_estado,
            COALESCE(NULLIF(lower(origen), ''), 'desconocido') AS origen
        FROM public.contactos
        WHERE (p_from IS NULL OR creado_en >= p_from)
          AND (p_to IS NULL OR creado_en <= p_to)
    ),
    contactos_totals AS (
        SELECT COUNT(*) AS total FROM contactos_base WHERE captura_estado = 'completo'
    ),
    contactos_webchat_completos AS (
        SELECT COUNT(*) AS total
        FROM contactos_base
        WHERE captura_estado = 'completo'
          AND origen = 'webchat'
    ),
    contactos_by_state AS (
        SELECT estado, COUNT(*) AS total
        FROM contactos_base
        GROUP BY estado
    ),
    captura_by_state AS (
        SELECT captura_estado, COUNT(*) AS total
        FROM contactos_base
        GROUP BY captura_estado
    ),
    visitantes AS (
        SELECT COALESCE(total, 0) AS total
        FROM public.embudo_visitantes_contador(p_from, p_to)
    ),
    webchat_visitas AS (
        SELECT
            COALESCE((SELECT total FROM visitantes), 0) AS visitas_sin_chat,
            COALESCE((SELECT webchat_total FROM conv_totals), 0) AS conversaciones
    ),
    lead_visitas AS (
        SELECT COUNT(*)::bigint AS total
        FROM public.panel_leads_geo_base(NULL, p_from, p_to)
    ),
    total_visitas AS (
        SELECT
            COALESCE((SELECT total FROM visitantes), 0)
            + COALESCE((SELECT total FROM lead_visitas), 0) AS total
    ),
    mensajes_base AS (
        SELECT
            conversacion_id,
            direccion,
            creado_en
        FROM public.mensajes
        WHERE direccion IN ('entrante', 'saliente')
          AND (p_from IS NULL OR creado_en >= p_from)
          AND (p_to IS NULL OR creado_en <= p_to)
    ),
    first_responses AS (
        SELECT
            m_in.conversacion_id,
            m_in.creado_en AS entrante_en,
            MIN(m_out.creado_en) AS respuesta_en
        FROM mensajes_base m_in
        LEFT JOIN mensajes_base m_out
          ON m_in.conversacion_id = m_out.conversacion_id
         AND m_out.direccion = 'saliente'
         AND m_out.creado_en >= m_in.creado_en
        WHERE m_in.direccion = 'entrante'
        GROUP BY m_in.conversacion_id, m_in.creado_en
    ),
    response_metrics AS (
        SELECT EXTRACT(EPOCH FROM (respuesta_en - entrante_en)) AS segundos
        FROM first_responses
        WHERE respuesta_en IS NOT NULL
          AND respuesta_en > entrante_en
    ),
    response_summary AS (
        SELECT
            AVG(segundos) AS promedio_segundos,
            MAX(segundos) AS maximo_segundos
        FROM response_metrics
    )
    SELECT jsonb_build_object(
        'conversaciones', jsonb_build_object(
            'total', COALESCE((SELECT total FROM conv_totals), 0),
            'por_estado', COALESCE((
                SELECT jsonb_object_agg(estado, total ORDER BY estado)
                FROM conv_by_state
            ), '{}'::jsonb),
            'webchat_total', COALESCE((SELECT webchat_total FROM conv_totals), 0),
            'canales_activos', COALESCE((SELECT canales_activos FROM conv_totals), 0)
        ),
        'contactos', jsonb_build_object(
            'total', COALESCE((SELECT total FROM contactos_totals), 0),
            'por_estado', COALESCE((
                SELECT jsonb_object_agg(estado, total ORDER BY estado)
                FROM contactos_by_state
            ), '{}'::jsonb),
            'captura', COALESCE((
                SELECT jsonb_object_agg(captura_estado, total ORDER BY captura_estado)
                FROM captura_by_state
            ), '{}'::jsonb)
        ),
        'visitantes', COALESCE((SELECT total FROM visitantes), 0),
        'visitas_totales', COALESCE((SELECT total FROM total_visitas), 0),
        'tiempos_respuesta', (
            SELECT jsonb_build_object(
                'promedio', promedio_segundos,
                'maximo', maximo_segundos
            )
            FROM response_summary
        ),
        'webchat', (
            SELECT jsonb_build_object(
                'visitas_sin_chat', visitas_sin_chat,
                'conversaciones', conversaciones,
                'visitas_totales', visitas_sin_chat + conversaciones,
                'contactos_completos', COALESCE((
                    SELECT total FROM contactos_webchat_completos
                ), 0)
            )
            FROM webchat_visitas
        )
    );
$$;


--
-- Name: embudo_visitantes_contador(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.embudo_visitantes_contador(p_closed_after timestamp with time zone DEFAULT (now() - '30 days'::interval)) RETURNS TABLE(total bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH base AS (
        SELECT sc.session_id
          FROM public.webchat_session_closures sc
         WHERE p_closed_after IS NULL OR sc.closed_at >= p_closed_after
    ),
    filtered AS (
        SELECT b.session_id
          FROM base b
          LEFT JOIN public.mensajes m
            ON m.datos ->> 'session_id' = b.session_id
           AND m.direccion = 'entrante'
        WHERE m.id IS NULL
    )
    SELECT COUNT(*)::bigint AS total
    FROM filtered;
$$;


--
-- Name: embudo_visitantes_contador(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.embudo_visitantes_contador(p_closed_after timestamp with time zone DEFAULT (now() - '30 days'::interval), p_closed_before timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(total bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH base AS (
        SELECT sc.session_id
          FROM public.webchat_session_closures sc
         WHERE (p_closed_after IS NULL OR sc.closed_at >= p_closed_after)
           AND (p_closed_before IS NULL OR sc.closed_at <= p_closed_before)
    ),
    filtered AS (
        SELECT b.session_id
          FROM base b
          LEFT JOIN public.mensajes m
            ON m.datos ->> 'session_id' = b.session_id
           AND m.direccion = 'entrante'
        WHERE m.id IS NULL
    )
    SELECT COUNT(*)::bigint AS total
    FROM filtered;
$$;


--
-- Name: embudo_visitantes_whatsapp(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.embudo_visitantes_whatsapp(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(total bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH visibles AS (
    SELECT c.id
      FROM public.conversaciones c
     WHERE c.canal = 'whatsapp'
       AND public.puede_ver_conversacion(c.id)
       AND (p_from IS NULL OR c.iniciada_en >= p_from)
       AND (p_to IS NULL OR c.iniciada_en <= p_to)
)
SELECT COUNT(*)::bigint AS total
  FROM visibles;
$$;


--
-- Name: FUNCTION embudo_visitantes_whatsapp(p_from timestamp with time zone, p_to timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.embudo_visitantes_whatsapp(p_from timestamp with time zone, p_to timestamp with time zone) IS 'Cuenta conversaciones de WhatsApp visibles para el usuario en el periodo indicado.';


--
-- Name: ensure_cliente_from_lead(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_cliente_from_lead(p_tarjeta_id uuid) RETURNS public.clientes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN public.ensure_cliente_from_oportunidad(p_tarjeta_id);
END;
$$;


--
-- Name: FUNCTION ensure_cliente_from_lead(p_tarjeta_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ensure_cliente_from_lead(p_tarjeta_id uuid) IS 'Compatibilidad: redirige al nuevo flujo basado en oportunidades.';


--
-- Name: ensure_cliente_from_oportunidad(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_cliente_from_oportunidad(p_oportunidad_id uuid) RETURNS public.clientes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_op public.oportunidades%ROWTYPE;
    v_categoria text;
    v_cliente public.clientes%ROWTYPE;
    v_tablero uuid;
    v_fuente text;
    v_metadata jsonb;
BEGIN
    SELECT *
      INTO v_op
      FROM public.oportunidades
     WHERE id = p_oportunidad_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'oportunidad_no_encontrada';
    END IF;

    SELECT lower(coalesce(categoria, ''))
      INTO v_categoria
      FROM public.etapas_pipeline
     WHERE id = v_op.etapa_id
     LIMIT 1;

    IF v_op.etapa_id IS NOT NULL AND v_categoria IS NULL THEN
        RAISE EXCEPTION 'etapa_no_encontrada';
    END IF;

    IF coalesce(v_categoria, '') <> 'ganada'
       AND lower(coalesce(v_op.estado, '')) <> 'ganada' THEN
        RETURN NULL;
    END IF;

    IF v_op.contacto_principal_id IS NULL THEN
        RAISE EXCEPTION 'oportunidad_sin_contacto';
    END IF;

    IF v_op.cuenta_id IS NULL THEN
        RAISE EXCEPTION 'oportunidad_sin_cuenta';
    END IF;

    v_tablero := NULL;
    IF v_op.metadata ? 'tablero_id' THEN
        BEGIN
            v_tablero := nullif(v_op.metadata ->> 'tablero_id', '')::uuid;
        EXCEPTION
            WHEN invalid_text_representation THEN
                v_tablero := NULL;
        END;
    END IF;

    v_fuente := COALESCE(
        v_op.metadata ->> 'fuente',
        v_op.metadata ->> 'lead_source',
        v_op.metadata ->> 'origen',
        'pipeline'
    );

    v_metadata := COALESCE(v_op.metadata, '{}'::jsonb) || jsonb_build_object(
        'oportunidad_id', v_op.id,
        'oportunidad_estado', v_op.estado
    );

    INSERT INTO public.clientes (
        contacto_id,
        oportunidad_id,
        cuenta_id,
        organizacion_id,
        tablero_id,
        etapa_id,
        monto_estimado,
        moneda,
        fuente,
        metadatos,
        ganado_en
    )
    VALUES (
        v_op.contacto_principal_id,
        v_op.id,
        v_op.cuenta_id,
        v_op.organizacion_id,
        v_tablero,
        v_op.etapa_id,
        v_op.monto_estimado,
        v_op.moneda,
        v_fuente,
        v_metadata,
        COALESCE(v_op.cerrado_en, now())
    )
    ON CONFLICT (contacto_id) DO UPDATE
        SET oportunidad_id = EXCLUDED.oportunidad_id,
            cuenta_id = EXCLUDED.cuenta_id,
            organizacion_id = EXCLUDED.organizacion_id,
            tablero_id = COALESCE(EXCLUDED.tablero_id, public.clientes.tablero_id),
            etapa_id = EXCLUDED.etapa_id,
            monto_estimado = COALESCE(EXCLUDED.monto_estimado, public.clientes.monto_estimado),
            moneda = COALESCE(EXCLUDED.moneda, public.clientes.moneda),
            fuente = COALESCE(EXCLUDED.fuente, public.clientes.fuente),
            metadatos = public.clientes.metadatos || jsonb_build_object('ultimo_oportunidad', EXCLUDED.oportunidad_id),
            ganado_en = COALESCE(public.clientes.ganado_en, EXCLUDED.ganado_en),
            actualizado_en = now()
    RETURNING * INTO v_cliente;

    RETURN v_cliente;
END;
$$;


--
-- Name: FUNCTION ensure_cliente_from_oportunidad(p_oportunidad_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ensure_cliente_from_oportunidad(p_oportunidad_id uuid) IS 'Crea o actualiza un cliente a partir de una oportunidad ganada del nuevo CRM.';


--
-- Name: es_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_admin(uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH org AS (
    SELECT public.usuario_organizacion_id(uid) AS org_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_roles ur
    JOIN public.roles r ON r.id = ur.rol_id
    CROSS JOIN org
    WHERE ur.usuario_id = uid
      AND org.org_id IS NOT NULL
      AND ur.organizacion_id = org.org_id
      AND r.organizacion_id = org.org_id
      AND r.codigo = 'admin'
  );
$$;


--
-- Name: FUNCTION es_admin(uid uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.es_admin(uid uuid) IS 'Devuelve true si el usuario tiene el rol admin. SECURITY DEFINER para evitar recursión con RLS.';


--
-- Name: fn_calendar_booking_stats(uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_booking_stats(p_resource_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(confirmed integer, cancelled integer, upcoming integer, past integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH base AS (
        SELECT * FROM public.calendar_bookings cb
        WHERE cb.resource_id = p_resource_id
          AND (p_from IS NULL OR cb.start_at >= p_from)
          AND (p_to IS NULL OR cb.end_at <= p_to)
    )
    SELECT
        COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COUNT(*) FILTER (
            WHERE status = 'confirmed'
              AND cb.start_at >= now()
        ) AS upcoming,
        COUNT(*) FILTER (
            WHERE status = 'confirmed'
              AND cb.end_at < now()
        ) AS past
    FROM base cb;
$$;


--
-- Name: FUNCTION fn_calendar_booking_stats(p_resource_id uuid, p_from timestamp with time zone, p_to timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_booking_stats(p_resource_id uuid, p_from timestamp with time zone, p_to timestamp with time zone) IS 'Entrega totales básicos (confirmadas, canceladas, próximas y pasadas) para un recurso.';


--
-- Name: fn_calendar_cancel_booking(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_cancel_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text) RETURNS TABLE(booking_id uuid, resource_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_booking public.calendar_bookings%ROWTYPE;
BEGIN
    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'booking_id_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_booking
    FROM public.calendar_bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_booking.status = 'cancelled' THEN
        RETURN QUERY SELECT v_booking.id, v_booking.resource_id, v_booking.start_at, v_booking.end_at, v_booking.status;
        RETURN;
    END IF;

    UPDATE public.calendar_bookings
    SET status = 'cancelled',
        notes = COALESCE(NULLIF(p_reason, ''), notes),
        metadata = metadata || jsonb_build_object(
            'cancel_reason', NULLIF(p_reason, ''),
            'cancelled_at', now()
        ),
        updated_at = now()
    WHERE id = p_booking_id;

    IF v_booking.hold_id IS NOT NULL THEN
        PERFORM * FROM public.fn_calendar_release_hold(v_booking.hold_id, 'booking_cancelled');
    END IF;

    v_booking.status := 'cancelled';

    RETURN QUERY
    SELECT v_booking.id, v_booking.resource_id, v_booking.start_at, v_booking.end_at, v_booking.status;
END;
$$;


--
-- Name: FUNCTION fn_calendar_cancel_booking(p_booking_id uuid, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_cancel_booking(p_booking_id uuid, p_reason text) IS 'Cancela una cita confirmada, adjunta el motivo y libera el hold original.';


--
-- Name: fn_calendar_confirm_slot(uuid, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_confirm_slot(p_hold_id uuid, p_notes text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_meeting_url text DEFAULT NULL::text, p_external_join_url text DEFAULT NULL::text) RETURNS TABLE(booking_id uuid, resource_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, timezone text, status text, hold_id uuid, tarjeta_id uuid, metadata jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_hold public.calendar_slot_holds%ROWTYPE;
    v_resource public.calendar_resources%ROWTYPE;
    v_capacity integer;
    v_booked integer;
    v_booking_id uuid;
BEGIN
    IF p_hold_id IS NULL THEN
        RAISE EXCEPTION 'hold_id_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_hold
    FROM public.calendar_slot_holds
    WHERE id = p_hold_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'hold_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_hold.status <> 'active' THEN
        RAISE EXCEPTION 'hold_not_active' USING ERRCODE = 'P0001';
    END IF;

    IF v_hold.expires_at <= now() THEN
        UPDATE public.calendar_slot_holds
        SET status = 'expired'
        WHERE id = p_hold_id;
        RAISE EXCEPTION 'hold_expired' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_resource
    FROM public.calendar_resources
    WHERE id = v_hold.resource_id;

    IF NOT FOUND OR NOT v_resource.is_active THEN
        RAISE EXCEPTION 'calendar_resource_not_found' USING ERRCODE = 'P0002';
    END IF;

    v_capacity := v_resource.capacity_per_slot;

    SELECT COUNT(*)
    INTO v_booked
    FROM public.calendar_bookings cb
    WHERE cb.resource_id = v_resource.id
      AND cb.status = 'confirmed'
      AND cb.start_at < v_hold.end_at
      AND cb.end_at > v_hold.start_at;

    IF v_booked >= v_capacity THEN
        RAISE EXCEPTION 'slot_already_booked' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.calendar_bookings (
        resource_id,
        hold_id,
        contact_id,
        conversacion_id,
        tarjeta_id,
        start_at,
        end_at,
        timezone,
        status,
        notes,
        meeting_url,
        external_join_url,
        metadata,
        created_at,
        updated_at
    ) VALUES (
        v_resource.id,
        v_hold.id,
        v_hold.contact_id,
        v_hold.conversacion_id,
        v_hold.tarjeta_id,
        v_hold.start_at,
        v_hold.end_at,
        v_resource.timezone,
        'confirmed',
        NULLIF(p_notes, ''),
        NULLIF(p_meeting_url, ''),
        NULLIF(p_external_join_url, ''),
        COALESCE(p_metadata, '{}'::jsonb),
        now(),
        now()
    ) RETURNING id INTO v_booking_id;

    UPDATE public.calendar_slot_holds
    SET status = 'confirmed', updated_at = now()
    WHERE id = p_hold_id;

    RETURN QUERY
    SELECT
        cb.id,
        cb.resource_id,
        cb.start_at,
        cb.end_at,
        cb.timezone,
        cb.status,
        cb.hold_id,
        cb.tarjeta_id,
        cb.metadata
    FROM public.calendar_bookings cb
    WHERE cb.id = v_booking_id;
END;
$$;


--
-- Name: FUNCTION fn_calendar_confirm_slot(p_hold_id uuid, p_notes text, p_metadata jsonb, p_meeting_url text, p_external_join_url text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_confirm_slot(p_hold_id uuid, p_notes text, p_metadata jsonb, p_meeting_url text, p_external_join_url text) IS 'Convierte un hold activo en una cita confirmada dentro del calendario.';


--
-- Name: fn_calendar_exception_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_exception_delete(p_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_found boolean;
BEGIN
    DELETE FROM public.calendar_exceptions
    WHERE id = p_id;
    GET DIAGNOSTICS v_found = ROW_COUNT;
    RETURN COALESCE(v_found, false);
END;
$$;


--
-- Name: FUNCTION fn_calendar_exception_delete(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_exception_delete(p_id uuid) IS 'Elimina una excepción puntual del calendario.';


--
-- Name: calendar_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_id uuid NOT NULL,
    kind text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    capacity integer,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    organizacion_id uuid NOT NULL,
    CONSTRAINT calendar_exceptions_kind_check CHECK ((kind = ANY (ARRAY['block'::text, 'extra'::text]))),
    CONSTRAINT calendar_exceptions_time_check CHECK ((end_at > start_at))
);

ALTER TABLE ONLY public.calendar_exceptions FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE calendar_exceptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.calendar_exceptions IS 'Bloqueos (kind=block) o ventanas adicionales (kind=extra) aplicadas a un recurso.';


--
-- Name: fn_calendar_exception_upsert(uuid, text, timestamp with time zone, timestamp with time zone, integer, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_exception_upsert(p_resource_id uuid, p_kind text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_capacity integer DEFAULT NULL::integer, p_reason text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_id uuid DEFAULT NULL::uuid) RETURNS public.calendar_exceptions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_result public.calendar_exceptions%ROWTYPE;
BEGIN
    IF p_kind NOT IN ('block', 'extra') THEN
        RAISE EXCEPTION 'exception_kind_invalid' USING ERRCODE = '22023';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.calendar_exceptions (
            resource_id, kind, start_at, end_at,
            capacity, reason, metadata
        ) VALUES (
            p_resource_id,
            p_kind,
            p_start_at,
            p_end_at,
            CASE WHEN p_kind = 'extra' THEN GREATEST(1, COALESCE(p_capacity, 1)) ELSE NULL END,
            NULLIF(p_reason, ''),
            COALESCE(p_metadata, '{}'::jsonb)
        ) RETURNING * INTO v_result;
    ELSE
        UPDATE public.calendar_exceptions
        SET resource_id = COALESCE(p_resource_id, resource_id),
            kind = COALESCE(p_kind, kind),
            start_at = COALESCE(p_start_at, start_at),
            end_at = COALESCE(p_end_at, end_at),
            capacity = CASE
                WHEN COALESCE(p_kind, kind) = 'extra'
                    THEN GREATEST(1, COALESCE(p_capacity, capacity, 1))
                ELSE NULL
            END,
            reason = COALESCE(NULLIF(p_reason, ''), reason),
            metadata = COALESCE(p_metadata, metadata),
            updated_at = now()
        WHERE id = p_id
        RETURNING * INTO v_result;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'exception_not_found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN v_result;
END;
$$;


--
-- Name: FUNCTION fn_calendar_exception_upsert(p_resource_id uuid, p_kind text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_capacity integer, p_reason text, p_metadata jsonb, p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_exception_upsert(p_resource_id uuid, p_kind text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_capacity integer, p_reason text, p_metadata jsonb, p_id uuid) IS 'Gestiona bloqueos o ventanas extra del calendario.';


--
-- Name: fn_calendar_expire_holds(timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_expire_holds(p_now timestamp with time zone DEFAULT now(), p_batch integer DEFAULT 200) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_total integer;
BEGIN
    WITH candidates AS (
        SELECT id
        FROM public.calendar_slot_holds
        WHERE status = 'active'
          AND expires_at <= p_now
        ORDER BY expires_at
        LIMIT p_batch
    )
    UPDATE public.calendar_slot_holds sh
    SET status = 'expired',
        metadata = sh.metadata || jsonb_build_object('expired_at', p_now),
        updated_at = p_now
    WHERE sh.id IN (SELECT id FROM candidates);

    GET DIAGNOSTICS v_total = ROW_COUNT;
    RETURN COALESCE(v_total, 0);
END;
$$;


--
-- Name: FUNCTION fn_calendar_expire_holds(p_now timestamp with time zone, p_batch integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_expire_holds(p_now timestamp with time zone, p_batch integer) IS 'Marca como expirados los holds activos cuyo tiempo haya vencido.';


--
-- Name: fn_calendar_hold_slot(uuid, timestamp with time zone, uuid, uuid, integer, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_hold_slot(p_resource_id uuid, p_slot_start timestamp with time zone, p_conversacion_id uuid, p_contact_id uuid DEFAULT NULL::uuid, p_hold_minutes integer DEFAULT 5, p_metadata jsonb DEFAULT '{}'::jsonb, p_tarjeta_id uuid DEFAULT NULL::uuid) RETURNS TABLE(hold_id uuid, resource_id uuid, slot_start timestamp with time zone, slot_end timestamp with time zone, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_resource public.calendar_resources%ROWTYPE;
    v_slot_end timestamptz;
    v_slot_duration interval;
    v_expires timestamptz;
    v_capacity integer;
    v_hold_limit integer;
    v_active_holds integer;
    v_booked integer;
    v_local_date date;
    v_local_time time;
    v_slot_end_local time;
    v_blocked boolean;
    v_available_capacity integer;
    v_today date;
    v_hold_id uuid;
BEGIN
    IF p_resource_id IS NULL OR p_slot_start IS NULL THEN
        RAISE EXCEPTION 'resource_and_slot_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_resource
    FROM public.calendar_resources
    WHERE id = p_resource_id AND is_active;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'calendar_resource_not_found' USING ERRCODE = 'P0002';
    END IF;

    v_today := (now() AT TIME ZONE v_resource.timezone)::date;
    v_slot_duration := make_interval(mins => v_resource.slot_minutes);
    v_slot_end := p_slot_start + v_slot_duration;
    v_expires := now() + make_interval(mins => GREATEST(1, LEAST(p_hold_minutes, 15)));
    v_hold_limit := GREATEST(1, v_resource.max_holds_per_slot);
    v_local_date := (p_slot_start AT TIME ZONE v_resource.timezone)::date;
    v_local_time := (p_slot_start AT TIME ZONE v_resource.timezone)::time;
    v_slot_end_local := (v_slot_end AT TIME ZONE v_resource.timezone)::time;

    IF v_local_date < v_today - 1 THEN
        RAISE EXCEPTION 'slot_out_of_range' USING ERRCODE = '22023';
    END IF;
    IF v_local_date > v_today + v_resource.max_days_visible THEN
        RAISE EXCEPTION 'slot_out_of_range' USING ERRCODE = '22023';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM calendar_exceptions ce
        WHERE ce.resource_id = v_resource.id
          AND ce.kind = 'block'
          AND tstzrange(ce.start_at, ce.end_at, '[)') && tstzrange(p_slot_start, v_slot_end, '[)')
    ) INTO v_blocked;

    IF v_blocked THEN
        RAISE EXCEPTION 'slot_blocked' USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(ap.capacity, v_resource.capacity_per_slot)
    INTO v_capacity
    FROM calendar_availability_patterns ap
    WHERE ap.resource_id = v_resource.id
      AND ap.is_active
      AND ap.weekday = EXTRACT(DOW FROM v_local_date)
      AND (ap.start_date IS NULL OR ap.start_date <= v_local_date)
      AND (ap.end_date IS NULL OR ap.end_date >= v_local_date)
      AND v_local_time >= ap.start_time
      AND v_slot_end_local <= ap.end_time
    ORDER BY ap.priority DESC, ap.start_time
    LIMIT 1;

    IF v_capacity IS NULL THEN
        SELECT COALESCE(ce.capacity, v_resource.capacity_per_slot)
        INTO v_capacity
        FROM calendar_exceptions ce
        WHERE ce.resource_id = v_resource.id
          AND ce.kind = 'extra'
          AND p_slot_start >= ce.start_at
          AND v_slot_end <= ce.end_at
        ORDER BY ce.start_at
        LIMIT 1;
    END IF;

    v_capacity := COALESCE(v_capacity, v_resource.capacity_per_slot);

    SELECT COUNT(*)
    INTO v_booked
    FROM calendar_bookings cb
    WHERE cb.resource_id = v_resource.id
      AND cb.status = 'confirmed'
      AND cb.start_at < v_slot_end
      AND cb.end_at > p_slot_start;

    IF v_booked >= v_capacity THEN
        RAISE EXCEPTION 'slot_already_booked' USING ERRCODE = 'P0001';
    END IF;

    v_available_capacity := GREATEST(v_capacity - v_booked, 0);

    SELECT COUNT(*)
    INTO v_active_holds
    FROM calendar_slot_holds sh
    WHERE sh.resource_id = v_resource.id
      AND sh.status = 'active'
      AND sh.expires_at > now()
      AND sh.start_at < v_slot_end
      AND sh.end_at > p_slot_start;

    IF v_active_holds >= LEAST(v_hold_limit, v_available_capacity) THEN
        RAISE EXCEPTION 'slot_hold_limit_reached' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.calendar_slot_holds (
        resource_id,
        start_at,
        end_at,
        contact_id,
        conversacion_id,
        tarjeta_id,
        status,
        expires_at,
        metadata
    ) VALUES (
        v_resource.id,
        p_slot_start,
        v_slot_end,
        p_contact_id,
        p_conversacion_id,
        p_tarjeta_id,
        'active',
        v_expires,
        COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_hold_id;

    RETURN QUERY
    SELECT v_hold_id, v_resource.id, p_slot_start, v_slot_end, v_expires;
END;
$$;


--
-- Name: FUNCTION fn_calendar_hold_slot(p_resource_id uuid, p_slot_start timestamp with time zone, p_conversacion_id uuid, p_contact_id uuid, p_hold_minutes integer, p_metadata jsonb, p_tarjeta_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_hold_slot(p_resource_id uuid, p_slot_start timestamp with time zone, p_conversacion_id uuid, p_contact_id uuid, p_hold_minutes integer, p_metadata jsonb, p_tarjeta_id uuid) IS 'Bloquea temporalmente un slot disponible mientras el visitante confirma la cita.';


--
-- Name: fn_calendar_list_bookings(uuid, timestamp with time zone, timestamp with time zone, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_list_bookings(p_resource_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0) RETURNS TABLE(booking_id uuid, resource_id uuid, contact_id uuid, conversacion_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, status text, notes text, metadata jsonb)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT
        cb.id,
        cb.resource_id,
        cb.contact_id,
        cb.conversacion_id,
        cb.start_at,
        cb.end_at,
        cb.status,
        cb.notes,
        cb.metadata
    FROM public.calendar_bookings cb
    WHERE cb.resource_id = p_resource_id
      AND (p_status IS NULL OR cb.status = p_status)
      AND (p_from IS NULL OR cb.start_at >= p_from)
      AND (p_to IS NULL OR cb.end_at <= p_to)
    ORDER BY cb.start_at
    LIMIT COALESCE(NULLIF(p_limit, 0), 200)
    OFFSET GREATEST(p_offset, 0);
$$;


--
-- Name: FUNCTION fn_calendar_list_bookings(p_resource_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_status text, p_limit integer, p_offset integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_list_bookings(p_resource_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_status text, p_limit integer, p_offset integer) IS 'Devuelve las reservas del calendario con filtros básicos para el panel.';


--
-- Name: fn_calendar_list_slots(uuid, date, date, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_list_slots(p_resource_id uuid, p_from date, p_to date, p_timezone text DEFAULT NULL::text, p_max_days integer DEFAULT 31) RETURNS TABLE(resource_id uuid, slot_start timestamp with time zone, slot_end timestamp with time zone, timezone text, local_date date, local_time text, capacity integer, booked integer, holds integer, is_available boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_resource public.calendar_resources%ROWTYPE;
    v_from date;
    v_to date;
    v_timezone text;
    v_slot_duration interval;
    v_slot_step interval;
BEGIN
    IF p_resource_id IS NULL THEN
        RAISE EXCEPTION 'resource_id_required' USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_resource
    FROM public.calendar_resources
    WHERE id = p_resource_id AND is_active;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'calendar_resource_not_found' USING ERRCODE = 'P0002';
    END IF;

    v_from := COALESCE(p_from, CURRENT_DATE);
    v_to := COALESCE(p_to, v_from + v_resource.max_days_visible);

    IF v_to < v_from THEN
        RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
    END IF;

    IF (v_to - v_from) > LEAST(p_max_days, v_resource.max_days_visible) THEN
        v_to := v_from + LEAST(p_max_days, v_resource.max_days_visible);
    END IF;

    v_timezone := COALESCE(NULLIF(p_timezone, ''), v_resource.timezone);
    v_slot_duration := make_interval(mins => v_resource.slot_minutes);
    v_slot_step := make_interval(mins => v_resource.slot_minutes + v_resource.buffer_minutes);

    RETURN QUERY
    WITH params AS (
        SELECT v_timezone AS timezone,
               v_slot_duration AS slot_duration,
               v_slot_step AS slot_step,
               v_resource.capacity_per_slot AS default_capacity
    ),
    day_series AS (
        SELECT gs::date AS day
        FROM generate_series(v_from, v_to, '1 day') gs
    ),
    pattern_windows AS (
        SELECT
            ap.id AS pattern_id,
            ap.capacity,
            ((ds.day + ap.start_time)::timestamp AT TIME ZONE v_resource.timezone) AS window_start,
            ((ds.day + ap.end_time)::timestamp AT TIME ZONE v_resource.timezone) AS window_end
        FROM calendar_availability_patterns ap
        JOIN day_series ds ON ds.day BETWEEN COALESCE(ap.start_date, ds.day)
                              AND COALESCE(ap.end_date, ds.day)
        WHERE ap.resource_id = v_resource.id
          AND ap.is_active
          AND ap.weekday = EXTRACT(DOW FROM ds.day)
    ),
    extra_windows AS (
        SELECT
            ce.id AS pattern_id,
            COALESCE(ce.capacity, v_resource.capacity_per_slot) AS capacity,
            ce.start_at AS window_start,
            ce.end_at AS window_end
        FROM calendar_exceptions ce
        WHERE ce.resource_id = v_resource.id
          AND ce.kind = 'extra'
          AND ce.end_at >= (v_from::timestamp)
          AND ce.start_at <= (v_to::timestamp + INTERVAL '1 day')
    ),
    blocked_ranges AS (
        SELECT tstzrange(ce.start_at, ce.end_at, '[)') AS range
        FROM calendar_exceptions ce
        WHERE ce.resource_id = v_resource.id
          AND ce.kind = 'block'
          AND ce.end_at >= (v_from::timestamp)
          AND ce.start_at <= (v_to::timestamp + INTERVAL '1 day')
    ),
    windows AS (
        SELECT * FROM pattern_windows
        UNION ALL
        SELECT * FROM extra_windows
    ),
    slot_candidates AS (
        SELECT
            v_resource.id AS resource_id,
            w.pattern_id,
            w.capacity,
            gs AS slot_start,
            gs + params.slot_duration AS slot_end,
            params.default_capacity
        FROM windows w
        CROSS JOIN params
        CROSS JOIN LATERAL generate_series(
            w.window_start,
            w.window_end - params.slot_duration,
            params.slot_step
        ) AS gs
        WHERE w.window_end > w.window_start
    )
    SELECT
        sc.resource_id,
        sc.slot_start,
        sc.slot_end,
        params.timezone AS timezone,
        (sc.slot_start AT TIME ZONE params.timezone)::date AS local_date,
        to_char(sc.slot_start AT TIME ZONE params.timezone, 'HH24:MI') AS local_time,
        COALESCE(sc.capacity, params.default_capacity) AS capacity,
        COALESCE(booked.count, 0) AS booked,
        COALESCE(holds.count, 0) AS holds,
        CASE
            WHEN EXISTS (
                SELECT 1 FROM blocked_ranges br
                WHERE br.range && tstzrange(sc.slot_start, sc.slot_end, '[)')
            ) THEN FALSE
            WHEN COALESCE(booked.count, 0) >= COALESCE(sc.capacity, params.default_capacity) THEN FALSE
            WHEN COALESCE(holds.count, 0) >= LEAST(v_resource.max_holds_per_slot, COALESCE(sc.capacity, params.default_capacity)) THEN FALSE
            ELSE TRUE
        END AS is_available
    FROM slot_candidates sc
    CROSS JOIN params
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer
        FROM calendar_bookings cb
        WHERE cb.resource_id = sc.resource_id
          AND cb.status = 'confirmed'
          AND cb.start_at < sc.slot_end
          AND cb.end_at > sc.slot_start
    ) AS booked ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer
        FROM calendar_slot_holds sh
        WHERE sh.resource_id = sc.resource_id
          AND sh.status = 'active'
          AND sh.expires_at > now()
          AND sh.start_at < sc.slot_end
          AND sh.end_at > sc.slot_start
    ) AS holds ON TRUE
    WHERE sc.slot_end > now() - INTERVAL '5 minutes'
    ORDER BY sc.slot_start;
END;
$$;


--
-- Name: FUNCTION fn_calendar_list_slots(p_resource_id uuid, p_from date, p_to date, p_timezone text, p_max_days integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_list_slots(p_resource_id uuid, p_from date, p_to date, p_timezone text, p_max_days integer) IS 'Genera la disponibilidad por slot considerando patrones, excepciones, holds y reservas confirmadas.';


--
-- Name: fn_calendar_pattern_delete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_pattern_delete(p_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_found boolean;
BEGIN
    DELETE FROM public.calendar_availability_patterns
    WHERE id = p_id;
    GET DIAGNOSTICS v_found = ROW_COUNT;
    RETURN COALESCE(v_found, false);
END;
$$;


--
-- Name: FUNCTION fn_calendar_pattern_delete(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_pattern_delete(p_id uuid) IS 'Elimina un patrón recurrente del calendario.';


--
-- Name: calendar_availability_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_availability_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_id uuid NOT NULL,
    weekday smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    start_date date,
    end_date date,
    capacity integer DEFAULT 1 NOT NULL,
    priority smallint DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL,
    CONSTRAINT calendar_availability_patterns_capacity_check CHECK ((capacity >= 1)),
    CONSTRAINT calendar_availability_patterns_time_check CHECK ((end_time > start_time)),
    CONSTRAINT calendar_availability_patterns_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);

ALTER TABLE ONLY public.calendar_availability_patterns FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE calendar_availability_patterns; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.calendar_availability_patterns IS 'Definiciones semanales para generar slots disponibles automáticamente.';


--
-- Name: fn_calendar_pattern_upsert(uuid, smallint, time without time zone, time without time zone, date, date, integer, smallint, boolean, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_pattern_upsert(p_resource_id uuid, p_weekday smallint, p_start_time time without time zone, p_end_time time without time zone, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_capacity integer DEFAULT 1, p_priority smallint DEFAULT 0, p_is_active boolean DEFAULT true, p_metadata jsonb DEFAULT '{}'::jsonb, p_id uuid DEFAULT NULL::uuid) RETURNS public.calendar_availability_patterns
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_result public.calendar_availability_patterns%ROWTYPE;
BEGIN
    IF p_weekday NOT BETWEEN 0 AND 6 THEN
        RAISE EXCEPTION 'weekday_invalid' USING ERRCODE = '22023';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.calendar_availability_patterns (
            resource_id, weekday, start_time, end_time,
            start_date, end_date, capacity, priority,
            is_active, metadata
        ) VALUES (
            p_resource_id,
            p_weekday,
            p_start_time,
            p_end_time,
            p_start_date,
            p_end_date,
            GREATEST(1, p_capacity),
            COALESCE(p_priority, 0),
            COALESCE(p_is_active, true),
            COALESCE(p_metadata, '{}'::jsonb)
        ) RETURNING * INTO v_result;
    ELSE
        UPDATE public.calendar_availability_patterns
        SET resource_id = COALESCE(p_resource_id, resource_id),
            weekday = COALESCE(p_weekday, weekday),
            start_time = COALESCE(p_start_time, start_time),
            end_time = COALESCE(p_end_time, end_time),
            start_date = COALESCE(p_start_date, start_date),
            end_date = COALESCE(p_end_date, end_date),
            capacity = GREATEST(1, COALESCE(p_capacity, capacity)),
            priority = COALESCE(p_priority, priority),
            is_active = COALESCE(p_is_active, is_active),
            metadata = COALESCE(p_metadata, metadata),
            updated_at = now()
        WHERE id = p_id
        RETURNING * INTO v_result;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'pattern_not_found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN v_result;
END;
$$;


--
-- Name: FUNCTION fn_calendar_pattern_upsert(p_resource_id uuid, p_weekday smallint, p_start_time time without time zone, p_end_time time without time zone, p_start_date date, p_end_date date, p_capacity integer, p_priority smallint, p_is_active boolean, p_metadata jsonb, p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_pattern_upsert(p_resource_id uuid, p_weekday smallint, p_start_time time without time zone, p_end_time time without time zone, p_start_date date, p_end_date date, p_capacity integer, p_priority smallint, p_is_active boolean, p_metadata jsonb, p_id uuid) IS 'Crea o actualiza las reglas recurrentes de disponibilidad.';


--
-- Name: fn_calendar_release_hold(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_release_hold(p_hold_id uuid, p_reason text DEFAULT NULL::text) RETURNS TABLE(hold_id uuid, resource_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_hold public.calendar_slot_holds%ROWTYPE;
BEGIN
    IF p_hold_id IS NULL THEN
        RAISE EXCEPTION 'hold_id_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_hold
    FROM public.calendar_slot_holds
    WHERE id = p_hold_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'hold_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_hold.status = 'active' THEN
        UPDATE public.calendar_slot_holds
        SET status = 'released',
            metadata = metadata || jsonb_build_object(
                'released_reason', COALESCE(NULLIF(p_reason, ''), 'manual'),
                'released_at', now()
            ),
            updated_at = now()
        WHERE id = p_hold_id;
        v_hold.status := 'released';
    END IF;

    RETURN QUERY
    SELECT v_hold.id, v_hold.resource_id, v_hold.start_at, v_hold.end_at, v_hold.status;
END;
$$;


--
-- Name: FUNCTION fn_calendar_release_hold(p_hold_id uuid, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_release_hold(p_hold_id uuid, p_reason text) IS 'Marca un hold como liberado y adjunta el motivo en metadata.';


--
-- Name: fn_calendar_reschedule_booking(uuid, timestamp with time zone, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_reschedule_booking(p_booking_id uuid, p_new_slot_start timestamp with time zone, p_notes text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(booking_id uuid, resource_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, timezone text, status text, hold_id uuid, tarjeta_id uuid, metadata jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_booking public.calendar_bookings%ROWTYPE;
    v_new_hold record;
    v_old_hold uuid;
BEGIN
    IF p_booking_id IS NULL OR p_new_slot_start IS NULL THEN
        RAISE EXCEPTION 'booking_and_slot_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_booking
    FROM public.calendar_bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_booking.status <> 'confirmed' THEN
        RAISE EXCEPTION 'booking_not_confirmed' USING ERRCODE = 'P0001';
    END IF;

    SELECT *
    INTO v_new_hold
    FROM public.fn_calendar_hold_slot(
        v_booking.resource_id,
        p_new_slot_start,
        v_booking.conversacion_id,
        v_booking.contact_id,
        5,
        jsonb_build_object('reschedule_from', v_booking.start_at),
        v_booking.tarjeta_id
    ) AS hold_data;

    UPDATE public.calendar_slot_holds csh
    SET status = 'confirmed',
        metadata = csh.metadata
            || jsonb_build_object('confirmed_via', 'reschedule', 'confirmed_at', now()),
        updated_at = now()
    WHERE csh.id = v_new_hold.hold_id;

    v_old_hold := v_booking.hold_id;

    UPDATE public.calendar_bookings cb
    SET start_at = v_new_hold.slot_start,
        end_at = v_new_hold.slot_end,
        hold_id = v_new_hold.hold_id,
        tarjeta_id = v_booking.tarjeta_id,
        metadata = cb.metadata
            || COALESCE(p_metadata, '{}'::jsonb)
            || jsonb_build_object(
                'rescheduled_from', v_booking.start_at,
                'rescheduled_at', now()
            ),
        notes = COALESCE(NULLIF(p_notes, ''), cb.notes),
        updated_at = now()
    WHERE cb.id = v_booking.id;

    IF v_old_hold IS NOT NULL THEN
        PERFORM * FROM public.fn_calendar_release_hold(v_old_hold, 'rescheduled');
    END IF;

    RETURN QUERY
    SELECT
        cb.id,
        cb.resource_id,
        cb.start_at,
        cb.end_at,
        cb.timezone,
        cb.status,
        cb.hold_id,
        cb.tarjeta_id,
        cb.metadata
    FROM public.calendar_bookings cb
    WHERE cb.id = v_booking.id;
END;
$$;


--
-- Name: FUNCTION fn_calendar_reschedule_booking(p_booking_id uuid, p_new_slot_start timestamp with time zone, p_notes text, p_metadata jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_reschedule_booking(p_booking_id uuid, p_new_slot_start timestamp with time zone, p_notes text, p_metadata jsonb) IS 'Genera un nuevo hold, actualiza la cita con el horario elegido y libera el hold anterior.';


--
-- Name: calendar_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text,
    timezone text DEFAULT 'America/Mexico_City'::text NOT NULL,
    slot_minutes integer DEFAULT 45 NOT NULL,
    buffer_minutes integer DEFAULT 15 NOT NULL,
    capacity_per_slot integer DEFAULT 1 NOT NULL,
    max_holds_per_slot integer DEFAULT 1 NOT NULL,
    max_days_visible integer DEFAULT 45 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    organizacion_id uuid NOT NULL,
    CONSTRAINT calendar_resources_capacity_per_slot_check CHECK ((capacity_per_slot >= 1)),
    CONSTRAINT calendar_resources_max_days_visible_check CHECK (((max_days_visible >= 1) AND (max_days_visible <= 120))),
    CONSTRAINT calendar_resources_max_holds_per_slot_check CHECK ((max_holds_per_slot >= 1))
);

ALTER TABLE ONLY public.calendar_resources FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE calendar_resources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.calendar_resources IS 'Catálogo de recursos (personas/calendarios) que exponen disponibilidad en el webchat.';


--
-- Name: fn_calendar_resource_upsert(text, text, integer, integer, integer, integer, integer, boolean, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_resource_upsert(p_name text, p_timezone text DEFAULT 'America/Mexico_City'::text, p_slot_minutes integer DEFAULT 45, p_buffer_minutes integer DEFAULT 15, p_capacity_per_slot integer DEFAULT 1, p_max_holds integer DEFAULT 1, p_max_days_visible integer DEFAULT 45, p_is_active boolean DEFAULT true, p_metadata jsonb DEFAULT '{}'::jsonb, p_id uuid DEFAULT NULL::uuid) RETURNS public.calendar_resources
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_result public.calendar_resources%ROWTYPE;
BEGIN
    IF p_id IS NULL THEN
        INSERT INTO public.calendar_resources (
            name, timezone, slot_minutes, buffer_minutes,
            capacity_per_slot, max_holds_per_slot, max_days_visible,
            is_active, metadata
        ) VALUES (
            p_name,
            COALESCE(NULLIF(p_timezone, ''), 'America/Mexico_City'),
            GREATEST(15, p_slot_minutes),
            GREATEST(0, p_buffer_minutes),
            GREATEST(1, p_capacity_per_slot),
            GREATEST(1, p_max_holds),
            GREATEST(1, LEAST(p_max_days_visible, 120)),
            COALESCE(p_is_active, true),
            COALESCE(p_metadata, '{}'::jsonb)
        ) RETURNING * INTO v_result;
    ELSE
        UPDATE public.calendar_resources
        SET name = COALESCE(NULLIF(p_name, ''), name),
            timezone = COALESCE(NULLIF(p_timezone, ''), timezone),
            slot_minutes = GREATEST(15, COALESCE(p_slot_minutes, slot_minutes)),
            buffer_minutes = GREATEST(0, COALESCE(p_buffer_minutes, buffer_minutes)),
            capacity_per_slot = GREATEST(1, COALESCE(p_capacity_per_slot, capacity_per_slot)),
            max_holds_per_slot = GREATEST(1, COALESCE(p_max_holds, max_holds_per_slot)),
            max_days_visible = GREATEST(1, LEAST(COALESCE(p_max_days_visible, max_days_visible), 120)),
            is_active = COALESCE(p_is_active, is_active),
            metadata = COALESCE(p_metadata, metadata),
            updated_at = now()
        WHERE id = p_id
        RETURNING * INTO v_result;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'calendar_resource_not_found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN v_result;
END;
$$;


--
-- Name: FUNCTION fn_calendar_resource_upsert(p_name text, p_timezone text, p_slot_minutes integer, p_buffer_minutes integer, p_capacity_per_slot integer, p_max_holds integer, p_max_days_visible integer, p_is_active boolean, p_metadata jsonb, p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_resource_upsert(p_name text, p_timezone text, p_slot_minutes integer, p_buffer_minutes integer, p_capacity_per_slot integer, p_max_holds integer, p_max_days_visible integer, p_is_active boolean, p_metadata jsonb, p_id uuid) IS 'Crea o actualiza recursos del calendario de forma segura.';


--
-- Name: fn_calendar_sync_tarjeta_stage(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calendar_sync_tarjeta_stage(p_tarjeta_id uuid, p_status text, p_booking_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_tarjeta public.lead_tarjetas%ROWTYPE;
    v_target_stage uuid;
    v_target_code text;
    v_actor uuid;
BEGIN
    IF p_tarjeta_id IS NULL OR p_status IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO v_tarjeta
    FROM public.lead_tarjetas
    WHERE id = p_tarjeta_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF p_status = 'confirmed' THEN
        v_target_code := 'demo';
    ELSIF p_status = 'cancelled' THEN
        v_target_code := 'precalificado';
    ELSE
        RETURN;
    END IF;

    SELECT id INTO v_target_stage
    FROM public.lead_etapas
    WHERE tablero_id = v_tarjeta.tablero_id
      AND codigo = v_target_code
    ORDER BY orden
    LIMIT 1;

    IF v_target_stage IS NULL AND p_status = 'cancelled' THEN
        SELECT id INTO v_target_stage
        FROM public.lead_etapas
        WHERE tablero_id = v_tarjeta.tablero_id
        ORDER BY orden
        LIMIT 1;
    END IF;

    IF v_target_stage IS NULL OR v_target_stage = v_tarjeta.etapa_id THEN
        RETURN;
    END IF;

    v_actor := coalesce(auth.uid(), v_tarjeta.asignado_a_usuario_id, v_tarjeta.propietario_usuario_id);

    UPDATE public.lead_tarjetas
    SET etapa_id = v_target_stage,
        actualizado_en = now()
    WHERE id = v_tarjeta.id;

    INSERT INTO public.lead_movimientos (
        tarjeta_id,
        etapa_origen_id,
        etapa_destino_id,
        cambiado_por,
        fuente,
        metadata
    ) VALUES (
        v_tarjeta.id,
        v_tarjeta.etapa_id,
        v_target_stage,
        v_actor,
        'asistente',
        jsonb_build_object(
            'source', 'calendar_booking',
            'booking_id', p_booking_id,
            'status', p_status
        )
    );
END;
$$;


--
-- Name: FUNCTION fn_calendar_sync_tarjeta_stage(p_tarjeta_id uuid, p_status text, p_booking_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_calendar_sync_tarjeta_stage(p_tarjeta_id uuid, p_status text, p_booking_id uuid) IS 'Sincroniza la etapa de la tarjeta cuando cambia el estado de una cita del calendario.';


--
-- Name: manejar_usuario_auth_nuevo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manejar_usuario_auth_nuevo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $_$
declare
  v_org uuid;
  v_nombre text;
  v_tel text;
begin
  v_org := nullif(
    coalesce(
      new.raw_user_meta_data->>'organizacion_id',
      new.raw_app_meta_data->>'organizacion_id'
    ),
    ''
  )::uuid;

  if v_org is null then
    raise exception 'organizacion_id requerido (no se pudo inferir el tenant)'
      using errcode = '23514';
  end if;

  v_nombre := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'nombre',
    new.email
  );

  v_tel := coalesce(nullif(new.phone, ''), '+00000000000');
  -- Remove whitespace and enforce E.164; fallback to default if invalid
  v_tel := regexp_replace(v_tel, '\s+', '', 'g');
  if v_tel is null or v_tel !~ '^\+[0-9]{7,15}$' then
    v_tel := '+00000000000';
  end if;

  insert into public.usuarios (id, correo, nombre_completo, telefono_e164, organizacion_id)
  values (new.id, new.email, v_nombre, v_tel, v_org)
  on conflict (id) do update
    set correo = excluded.correo,
        nombre_completo = excluded.nombre_completo,
        telefono_e164 = excluded.telefono_e164,
        organizacion_id = excluded.organizacion_id;

  return new;
end;
$_$;


--
-- Name: next_role_codigo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_role_codigo(p_org uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_next bigint;
begin
  if p_org is null then
    raise exception 'organizacion_id requerido para generar el código'
      using errcode = '23514';
  end if;

  insert into public.roles_codigo_counters (organizacion_id, consecutivo)
  values (p_org, 1)
  on conflict (organizacion_id)
  do update set consecutivo = public.roles_codigo_counters.consecutivo + 1,
                actualizado_en = now()
  returning public.roles_codigo_counters.consecutivo into v_next;

  return lpad(v_next::text, 4, '0');
end;
$$;


--
-- Name: next_vendedor_round_robin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_vendedor_round_robin() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_usuario uuid;
BEGIN
    SELECT usuario_id
      INTO v_usuario
      FROM public.empleados
     WHERE es_vendedor = TRUE
     ORDER BY COALESCE(ultimo_lead_asignado_en, to_timestamp(0)), creado_en, usuario_id
     FOR UPDATE SKIP LOCKED
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE public.empleados
       SET ultimo_lead_asignado_en = now()
     WHERE usuario_id = v_usuario;

    RETURN v_usuario;
END;
$$;


--
-- Name: FUNCTION next_vendedor_round_robin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.next_vendedor_round_robin() IS 'Regresa el siguiente vendedor disponible usando un round robin simple y actualiza su marca temporal.';


--
-- Name: panel_contactos_list(text, text, text, uuid, timestamp with time zone, timestamp with time zone, text, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_contactos_list(p_estado text DEFAULT NULL::text, p_captura text DEFAULT NULL::text, p_origen text DEFAULT NULL::text, p_propietario uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_search text DEFAULT NULL::text, p_order_by text DEFAULT 'creado_en'::text, p_order_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0) RETURNS TABLE(contacto_id uuid, nombre text, correo text, telefono text, estado text, captura_estado text, origen text, creado_en timestamp with time zone, actualizado_en timestamp with time zone, company_name text, propietario_id uuid, propietario_nombre text, ultimo_contacto_en timestamp with time zone, conversaciones integer, notas text, metadata jsonb, total_rows bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH base AS (
    SELECT
        c.id AS contacto_id,
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
        c.contacto_datos AS metadata
    FROM public.contactos c
    LEFT JOIN public.usuarios owner ON owner.id = c.propietario_usuario_id
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
        c.notes ILIKE '%' || p_search || '%'
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
    metadata,
    total_rows
FROM ordered
LIMIT COALESCE(NULLIF(p_limit, 0), 100)
OFFSET GREATEST(p_offset, 0);
$$;


--
-- Name: panel_contactos_resumen(timestamp with time zone, timestamp with time zone, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_contactos_resumen(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_propietario uuid DEFAULT NULL::uuid, p_origen text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH base AS (
    SELECT
        c.id,
        COALESCE(NULLIF(lower(c.estado), ''), 'desconocido') AS estado,
        COALESCE(NULLIF(lower(c.captura_estado), ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(lower(c.origen), ''), 'otro') AS origen,
        c.propietario_usuario_id,
        c.creado_en
    FROM public.contactos c
    WHERE (p_from IS NULL OR c.creado_en >= p_from)
      AND (p_to IS NULL OR c.creado_en <= p_to)
      AND (p_propietario IS NULL OR c.propietario_usuario_id = p_propietario)
      AND (p_origen IS NULL OR lower(c.origen) = lower(p_origen))
      AND public.puede_ver_contacto(c.id)
),
counts AS (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE captura_estado = 'completo') AS completos,
        COUNT(*) FILTER (WHERE captura_estado <> 'completo') AS incompletos,
        COUNT(*) FILTER (WHERE estado = 'activo') AS activos,
        COUNT(*) FILTER (WHERE estado = 'lead') AS leads,
        COUNT(*) FILTER (WHERE origen = 'webchat') AS webchat,
        COUNT(DISTINCT propietario_usuario_id) FILTER (WHERE propietario_usuario_id IS NOT NULL) AS propietarios
    FROM base
),
recent AS (
    SELECT MAX(creado_en) AS ultimo_creado
    FROM base
)
SELECT jsonb_build_object(
    'total', COALESCE((SELECT total FROM counts), 0),
    'completos', COALESCE((SELECT completos FROM counts), 0),
    'incompletos', COALESCE((SELECT incompletos FROM counts), 0),
    'activos', COALESCE((SELECT activos FROM counts), 0),
    'leads', COALESCE((SELECT leads FROM counts), 0),
    'webchat', COALESCE((SELECT webchat FROM counts), 0),
    'propietarios', COALESCE((SELECT propietarios FROM counts), 0),
    'ultimo', (SELECT ultimo_creado FROM recent)
);
$$;


--
-- Name: panel_contactos_timeline(timestamp with time zone, timestamp with time zone, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_contactos_timeline(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_propietario uuid DEFAULT NULL::uuid, p_origen text DEFAULT NULL::text) RETURNS TABLE(bucket_date date, nuevos bigint, completos bigint, webchat bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH bounds AS (
    SELECT
        COALESCE(date_trunc('day', p_from), date_trunc('day', now() - INTERVAL '29 days'))::date AS start_date,
        COALESCE(date_trunc('day', p_to), date_trunc('day', now()))::date AS end_date
),
series AS (
    SELECT generate_series(start_date, end_date, '1 day')::date AS bucket_date
    FROM bounds
),
base AS (
    SELECT
        c.id,
        c.creado_en::date AS creado_date,
        COALESCE(NULLIF(lower(c.captura_estado), ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(lower(c.origen), ''), 'otro') AS origen
    FROM public.contactos c
    WHERE (p_from IS NULL OR c.creado_en >= p_from)
      AND (p_to IS NULL OR c.creado_en <= p_to)
      AND (p_propietario IS NULL OR c.propietario_usuario_id = p_propietario)
      AND (p_origen IS NULL OR lower(c.origen) = lower(p_origen))
      AND public.puede_ver_contacto(c.id)
),
agg_new AS (
    SELECT creado_date AS bucket_date, COUNT(*) AS nuevos
    FROM base
    WHERE creado_date IS NOT NULL
    GROUP BY creado_date
),
agg_completos AS (
    SELECT creado_date AS bucket_date, COUNT(*) AS completos
    FROM base
    WHERE captura_estado = 'completo' AND creado_date IS NOT NULL
    GROUP BY creado_date
),
agg_webchat AS (
    SELECT creado_date AS bucket_date, COUNT(*) AS webchat
    FROM base
    WHERE origen = 'webchat' AND creado_date IS NOT NULL
    GROUP BY creado_date
)
SELECT
    s.bucket_date,
    COALESCE(agg_new.nuevos, 0) AS nuevos,
    COALESCE(agg_completos.completos, 0) AS completos,
    COALESCE(agg_webchat.webchat, 0) AS webchat
FROM series s
LEFT JOIN agg_new ON agg_new.bucket_date = s.bucket_date
LEFT JOIN agg_completos ON agg_completos.bucket_date = s.bucket_date
LEFT JOIN agg_webchat ON agg_webchat.bucket_date = s.bucket_date
ORDER BY s.bucket_date;
$$;


--
-- Name: panel_inbox_messages(uuid, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_inbox_messages(p_conversacion_id uuid, p_limit integer DEFAULT 100, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(message_id uuid, conversacion_id uuid, author text, role text, body text[], tipo_contenido text, datos jsonb, creado_en timestamp with time zone, attachments jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH authorized AS (
    SELECT c.id, c.contacto_id, ct.nombre_completo AS contacto_nombre, u.nombre_completo AS asignado_nombre
    FROM public.conversaciones c
    JOIN public.contactos ct ON ct.id = c.contacto_id
    LEFT JOIN public.usuarios u ON u.id = c.asignado_a_usuario_id
    WHERE c.id = p_conversacion_id
      AND public.puede_ver_conversacion(c.id)
),
target_messages AS (
    SELECT
        m.id,
        m.conversacion_id,
        m.direccion,
        m.texto,
        m.tipo_contenido,
        m.datos,
        m.creado_en,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', a.id,
                        'url', a.url,
                        'mime', a.mime,
                        'size', COALESCE(a.size_bytes, a.tamano_bytes),
                        'name', a.nombre,
                        'provider_id', a.proveedor_id,
                        'path', a.path
                    ) ORDER BY a.creado_en ASC
                )
                FROM public.adjuntos a
                WHERE a.mensaje_id = m.id
            ),
            '[]'::jsonb
        ) AS attachments_json
    FROM public.mensajes m
    WHERE m.conversacion_id = p_conversacion_id
      AND (p_before IS NULL OR m.creado_en < p_before)
    ORDER BY m.creado_en DESC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
)
SELECT
    tm.id AS message_id,
    tm.conversacion_id,
    CASE
        WHEN tm.direccion = 'entrante' THEN COALESCE(a.contacto_nombre, 'Visitante')
        ELSE COALESCE(a.asignado_nombre, 'Equipo Tal-IA')
    END AS author,
    CASE WHEN tm.direccion = 'entrante' THEN 'contacto' ELSE 'usuario' END AS role,
    ARRAY[COALESCE(NULLIF(tm.texto, ''), '(mensaje sin texto)')] AS body,
    tm.tipo_contenido,
    tm.datos,
    tm.creado_en,
    tm.attachments_json AS attachments
FROM authorized a
JOIN target_messages tm ON tm.conversacion_id = a.id
ORDER BY tm.creado_en DESC;
$$;


--
-- Name: panel_inbox_resumen(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_inbox_resumen(p_estado text DEFAULT NULL::text, p_asignado uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH visibles AS (
    SELECT
        c.id,
        c.estado,
        c.no_leidos,
        c.asignado_a_usuario_id
    FROM public.conversaciones c
    WHERE public.puede_ver_conversacion(c.id)
      AND (p_estado IS NULL OR lower(c.estado) = lower(p_estado))
      AND (p_asignado IS NULL OR c.asignado_a_usuario_id = p_asignado)
),
counts AS (
    SELECT
        COUNT(*) AS total,
        COALESCE(SUM(GREATEST(no_leidos, 0)), 0) AS unread,
        COUNT(*) FILTER (WHERE lower(estado) = 'pendiente') AS awaiting,
        COUNT(*) FILTER (WHERE lower(estado) = 'abierta') AS abiertas,
        COUNT(*) FILTER (WHERE lower(estado) = 'cerrada') AS cerradas,
        COUNT(*) FILTER (WHERE asignado_a_usuario_id = auth.uid()) AS asignadas_a_mi
    FROM visibles
)
SELECT jsonb_build_object(
    'total', COALESCE((SELECT total FROM counts), 0),
    'unread', COALESCE((SELECT unread FROM counts), 0),
    'awaiting', COALESCE((SELECT awaiting FROM counts), 0),
    'open', COALESCE((SELECT abiertas FROM counts), 0),
    'closed', COALESCE((SELECT cerradas FROM counts), 0),
    'assigned', COALESCE((SELECT asignadas_a_mi FROM counts), 0),
    'folders', jsonb_build_array(
        jsonb_build_object('id', 'inbox', 'count', COALESCE((SELECT abiertas + awaiting FROM counts), 0)),
        jsonb_build_object('id', 'assigned', 'count', COALESCE((SELECT asignadas_a_mi FROM counts), 0)),
        jsonb_build_object('id', 'pending', 'count', COALESCE((SELECT awaiting FROM counts), 0)),
        jsonb_build_object('id', 'closed', 'count', COALESCE((SELECT cerradas FROM counts), 0))
    )
);
$$;


--
-- Name: panel_inbox_threads(text, uuid, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_inbox_threads(p_estado text DEFAULT NULL::text, p_asignado uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_message_limit integer DEFAULT 20) RETURNS TABLE(conversacion_id uuid, contacto_id uuid, contacto_nombre text, contacto_correo text, contacto_telefono text, canal text, estado text, prioridad integer, iniciada_en timestamp with time zone, ultimo_mensaje_en timestamp with time zone, no_leidos integer, asignado_id uuid, asignado_nombre text, tags text[], manual_override boolean, oportunidad_id uuid, parent_opportunity_id uuid, restart_sequence integer, conversation_history text[], last_message_preview text, last_message_at timestamp with time zone, messages jsonb, total_rows bigint, reengage_attempts integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH filtered AS (
    SELECT
        c.id AS conversacion_id,
        c.contacto_id,
        ct.nombre_completo AS contacto_nombre,
        NULLIF(ct.correo, '') AS contacto_correo,
        NULLIF(ct.telefono_e164, '') AS contacto_telefono,
        c.canal,
        c.estado,
        c.prioridad,
        c.iniciada_en,
        c.ultimo_mensaje_en,
        COALESCE(c.no_leidos, 0) AS no_leidos,
        c.asignado_a_usuario_id AS asignado_id,
        asignado.nombre_completo AS asignado_nombre,
        ARRAY(
            SELECT jsonb_array_elements_text(COALESCE(ci.tags, '[]'::jsonb))
        ) AS tags,
        COALESCE(cc.manual_override, false) AS manual_override,
        opp.oportunidad_id,
        (opp.oportunidad_metadata->>'parent_opportunity_id')::uuid AS parent_opportunity_id,
        COALESCE(
            (opp.oportunidad_metadata->>'restart_sequence')::integer,
            c.restart_sequence,
            1
        ) AS restart_sequence,
        COALESCE(
            (opp.oportunidad_metadata->'whatsapp_followup'->'reengage'->>'attempts')::integer,
            0
        ) AS reengage_attempts,
        COALESCE(
            ARRAY(
                SELECT jsonb_array_elements_text(
                    COALESCE(opp.oportunidad_metadata->'conversation_history', '[]'::jsonb)
                )
            ),
            ARRAY[c.id::text]
        ) AS conversation_history
    FROM public.conversaciones c
    JOIN public.contactos ct ON ct.id = c.contacto_id
    LEFT JOIN public.usuarios asignado ON asignado.id = c.asignado_a_usuario_id
    LEFT JOIN public.conversaciones_insights ci ON ci.conversacion_id = c.id
    LEFT JOIN public.conversaciones_controles cc ON cc.conversacion_id = c.id
    LEFT JOIN LATERAL (
        SELECT o.id AS oportunidad_id, o.metadata AS oportunidad_metadata
        FROM public.oportunidades o
        WHERE o.metadata->>'conversation_id' = c.id::text
        ORDER BY o.creado_en DESC
        LIMIT 1
    ) opp ON TRUE
    WHERE public.puede_ver_conversacion(c.id)
      AND (p_estado IS NULL OR lower(c.estado) = lower(p_estado))
      AND (p_asignado IS NULL OR c.asignado_a_usuario_id = p_asignado)
),
annotated AS (
    SELECT
        f.*,
        COUNT(*) OVER () AS total_rows,
        COALESCE(f.ultimo_mensaje_en, f.iniciada_en) AS sort_key
    FROM filtered f
),
messages_by_thread AS (
    SELECT
        a.conversacion_id,
        jsonb_agg(
            jsonb_build_object(
                'message_id', msg.id,
                'author', CASE
                    WHEN msg.direccion = 'entrante' THEN COALESCE(a.contacto_nombre, 'Visitante')
                    ELSE COALESCE(a.asignado_nombre, 'Equipo Tal-IA')
                END,
                'role', CASE WHEN msg.direccion = 'entrante' THEN 'contacto' ELSE 'usuario' END,
                'timestamp', msg.creado_en,
                'body', ARRAY[COALESCE(NULLIF(msg.texto, ''), '(mensaje sin texto)')],
                'tipo_contenido', msg.tipo_contenido,
                'datos', msg.datos,
                'attachments', COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', adj.id,
                                'url', adj.url,
                                'mime', adj.mime,
                                'size', COALESCE(adj.size_bytes, adj.tamano_bytes),
                                'name', adj.nombre,
                                'provider_id', adj.proveedor_id,
                                'path', adj.path
                            ) ORDER BY adj.creado_en ASC
                        )
                        FROM public.adjuntos adj
                        WHERE adj.mensaje_id = msg.id
                    ),
                    '[]'::jsonb
                )
            )
            ORDER BY msg.creado_en
        ) FILTER (WHERE msg.id IS NOT NULL) AS items
    FROM annotated a
    LEFT JOIN LATERAL (
        SELECT m.*
        FROM public.mensajes m
        WHERE m.conversacion_id = a.conversacion_id
        ORDER BY m.creado_en DESC
        LIMIT GREATEST(COALESCE(p_message_limit, 20), 1)
    ) AS msg ON TRUE
    GROUP BY a.conversacion_id
)
SELECT
    a.conversacion_id,
    a.contacto_id,
    a.contacto_nombre,
    a.contacto_correo,
    a.contacto_telefono,
    a.canal,
    a.estado,
    a.prioridad,
    a.iniciada_en,
    a.ultimo_mensaje_en,
    a.no_leidos,
    a.asignado_id,
    a.asignado_nombre,
    a.tags,
    a.manual_override,
    a.oportunidad_id,
    a.parent_opportunity_id,
    a.restart_sequence,
    a.conversation_history,
    last_msg.preview_text AS last_message_preview,
    last_msg.preview_at AS last_message_at,
    COALESCE(messages.items, '[]'::jsonb) AS messages,
    a.total_rows,
    a.reengage_attempts
FROM annotated a
LEFT JOIN LATERAL (
    SELECT
        m.texto AS preview_text,
        m.creado_en AS preview_at
    FROM public.mensajes m
    WHERE m.conversacion_id = a.conversacion_id
    ORDER BY m.creado_en DESC
    LIMIT 1
) last_msg ON TRUE
LEFT JOIN messages_by_thread messages ON messages.conversacion_id = a.conversacion_id
ORDER BY a.sort_key DESC
LIMIT COALESCE(NULLIF(p_limit, 0), 50)
OFFSET GREATEST(p_offset, 0);
$$;


--
-- Name: panel_leads_geo_base(text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_leads_geo_base(p_canales text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(contacto_id uuid, canal text, cve_ent text, nom_ent text, cve_mun text, nom_mun text, cvegeo text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
WITH scope AS (
    SELECT
        auth.uid() AS uid,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id,
        public.es_admin(auth.uid()) AS es_admin,
        lower(COALESCE(current_setting('request.jwt.claim.role', true), '')) = 'service_role' AS is_service_role
),
params AS (
    SELECT CASE
        WHEN p_canales IS NULL OR btrim(p_canales) = '' THEN NULL
        ELSE ARRAY(
            SELECT lower(btrim(value))
            FROM regexp_split_to_table(p_canales, ',') AS value
            WHERE btrim(value) <> ''
        )::text[]
    END AS canales
),
eligible AS (
    SELECT
        o.id AS oportunidad_id,
        COALESCE(
            o.contacto_principal_id,
            CASE
                WHEN COALESCE(o.metadata ->> 'legacy_contacto_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                    THEN (o.metadata ->> 'legacy_contacto_id')::uuid
                ELSE NULL
            END
        ) AS contacto_id,
        lower(
            NULLIF(
                COALESCE(o.metadata ->> 'canal', conv.canal, ''),
                ''
            )
        ) AS raw_canal,
        o.creado_en,
        ct.contacto_datos
    FROM public.oportunidades o
    CROSS JOIN scope s
    CROSS JOIN params p
    LEFT JOIN LATERAL (
        SELECT CASE
            WHEN COALESCE(o.metadata ->> 'conversacion_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (o.metadata ->> 'conversacion_id')::uuid
            ELSE NULL
        END AS conversacion_id
    ) conv_meta ON TRUE
    LEFT JOIN public.conversaciones conv ON conv.id = conv_meta.conversacion_id
    LEFT JOIN public.contactos ct ON ct.id = COALESCE(
        o.contacto_principal_id,
        CASE
            WHEN COALESCE(o.metadata ->> 'legacy_contacto_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (o.metadata ->> 'legacy_contacto_id')::uuid
            ELSE NULL
        END
    )
    WHERE
        (s.is_service_role OR s.es_admin OR (s.organizacion_id IS NOT NULL AND o.organizacion_id = s.organizacion_id))
        AND (p_from IS NULL OR o.creado_en >= p_from)
        AND (p_to IS NULL OR o.creado_en <= p_to)
        AND (
            p.canales IS NULL
            OR array_length(p.canales, 1) = 0
            OR lower(
                NULLIF(
                    COALESCE(o.metadata ->> 'canal', conv.canal, ''),
                    ''
                )
            ) = ANY (p.canales)
        )
),
normalized AS (
    SELECT
        e.contacto_id,
        CASE WHEN e.raw_canal IS NULL OR e.raw_canal = '' THEN 'desconocido' ELSE e.raw_canal END AS canal,
        e.contacto_datos
    FROM eligible e
)
SELECT
    n.contacto_id,
    n.canal,
    loc.cve_ent,
    loc.nom_ent,
    loc.cve_mun,
    loc.nom_mun,
    loc.cvegeo
FROM normalized n
LEFT JOIN LATERAL (
    WITH raw AS (
        SELECT
            NULLIF(n.contacto_datos #>> '{ubicacion,cve_ent}', '') AS u_cve_ent,
            NULLIF(n.contacto_datos #>> '{ubicacion,nom_ent}', '') AS u_nom_ent,
            NULLIF(n.contacto_datos #>> '{ubicacion,cve_mun}', '') AS u_cve_mun,
            NULLIF(n.contacto_datos #>> '{ubicacion,nom_mun}', '') AS u_nom_mun,
            NULLIF(n.contacto_datos #>> '{ubicacion,cvegeo}', '') AS u_cvegeo,
            NULLIF(n.contacto_datos #>> '{cve_ent}', '') AS d_cve_ent,
            NULLIF(n.contacto_datos #>> '{nom_ent}', '') AS d_nom_ent,
            NULLIF(n.contacto_datos #>> '{cve_mun}', '') AS d_cve_mun,
            NULLIF(n.contacto_datos #>> '{nom_mun}', '') AS d_nom_mun,
            NULLIF(n.contacto_datos #>> '{cvegeo}', '') AS d_cvegeo
    )
    SELECT
        CASE
            WHEN val_cve_ent IS NULL THEN NULL
            ELSE LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
        END AS cve_ent,
        val_nom_ent AS nom_ent,
        CASE
            WHEN val_cve_mun IS NULL THEN NULL
            ELSE LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
        END AS cve_mun,
        val_nom_mun AS nom_mun,
        CASE
            WHEN val_cvegeo IS NOT NULL THEN LPAD(REGEXP_REPLACE(val_cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN val_cve_ent IS NOT NULL AND val_cve_mun IS NOT NULL
                THEN LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0') || LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM (
        SELECT
            COALESCE(u_cve_ent, d_cve_ent) AS val_cve_ent,
            COALESCE(u_nom_ent, d_nom_ent) AS val_nom_ent,
            COALESCE(u_cve_mun, d_cve_mun) AS val_cve_mun,
            COALESCE(u_nom_mun, d_nom_mun) AS val_nom_mun,
            COALESCE(u_cvegeo, d_cvegeo) AS val_cvegeo
        FROM raw
    ) merged
) AS loc ON TRUE;
$_$;


--
-- Name: panel_leads_geo_base_ext(text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_leads_geo_base_ext(p_canales text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(lead_id uuid, contacto_id uuid, canal text, etapa_id uuid, etapa_codigo text, etapa_nombre text, etapa_categoria public.lead_categoria, etapa_orden integer, pais_codigo text, pais_nombre text, cve_ent text, nom_ent text, cve_mun text, nom_mun text, cvegeo text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
WITH scope AS (
    SELECT
        auth.uid() AS uid,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id,
        public.es_admin(auth.uid()) AS es_admin,
        lower(COALESCE(current_setting('request.jwt.claim.role', true), '')) = 'service_role' AS is_service_role
),
params AS (
    SELECT CASE
        WHEN p_canales IS NULL OR btrim(p_canales) = '' THEN NULL
        ELSE ARRAY(
            SELECT lower(btrim(value))
            FROM regexp_split_to_table(p_canales, ',') AS value
            WHERE btrim(value) <> ''
        )::text[]
    END AS canales
),
eligible AS (
    SELECT
        o.id AS lead_id,
        COALESCE(
            o.contacto_principal_id,
            CASE
                WHEN COALESCE(o.metadata ->> 'legacy_contacto_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                    THEN (o.metadata ->> 'legacy_contacto_id')::uuid
                ELSE NULL
            END
        ) AS contacto_id,
        lower(
            NULLIF(
                COALESCE(o.metadata ->> 'canal', conv.canal, ''),
                ''
            )
        ) AS raw_canal,
        o.etapa_id,
        ep.codigo AS etapa_codigo,
        ep.nombre AS etapa_nombre,
        CASE
            WHEN lower(COALESCE(ep.categoria, '')) IN ('ganada', 'ganado', 'cerrado_ganado') THEN 'ganada'::public.lead_categoria
            WHEN lower(COALESCE(ep.categoria, '')) IN ('perdida', 'perdido', 'cerrado_perdido') THEN 'perdida'::public.lead_categoria
            ELSE 'abierta'::public.lead_categoria
        END AS etapa_categoria,
        ep.orden AS etapa_orden,
        ct.contacto_datos,
        ct.telefono_e164
    FROM public.oportunidades o
    JOIN public.etapas_pipeline ep ON ep.id = o.etapa_id
    CROSS JOIN scope s
    CROSS JOIN params p
    LEFT JOIN LATERAL (
        SELECT CASE
            WHEN COALESCE(o.metadata ->> 'conversacion_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (o.metadata ->> 'conversacion_id')::uuid
            ELSE NULL
        END AS conversacion_id
    ) conv_meta ON TRUE
    LEFT JOIN public.conversaciones conv ON conv.id = conv_meta.conversacion_id
    LEFT JOIN public.contactos ct ON ct.id = COALESCE(
        o.contacto_principal_id,
        CASE
            WHEN COALESCE(o.metadata ->> 'legacy_contacto_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (o.metadata ->> 'legacy_contacto_id')::uuid
            ELSE NULL
        END
    )
    WHERE
        (s.is_service_role OR s.es_admin OR (s.organizacion_id IS NOT NULL AND o.organizacion_id = s.organizacion_id))
        AND (p_from IS NULL OR o.creado_en >= p_from)
        AND (p_to IS NULL OR o.creado_en <= p_to)
        AND (
            p.canales IS NULL
            OR array_length(p.canales, 1) = 0
            OR lower(
                NULLIF(
                    COALESCE(o.metadata ->> 'canal', conv.canal, ''),
                    ''
                )
            ) = ANY (p.canales)
        )
),
geo AS (
    SELECT
        e.*,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,country_code}', ''),
            NULLIF(e.contacto_datos #>> '{country_code}', ''),
            NULLIF(e.contacto_datos #>> '{ubicacion,pais_codigo}', ''),
            NULLIF(e.contacto_datos #>> '{pais_codigo}', '')
        ) AS raw_country_code,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,country_name}', ''),
            NULLIF(e.contacto_datos #>> '{country_name}', ''),
            NULLIF(e.contacto_datos #>> '{ubicacion,pais_nombre}', ''),
            NULLIF(e.contacto_datos #>> '{pais_nombre}', ''),
            NULLIF(e.contacto_datos #>> '{ubicacion,pais}', ''),
            NULLIF(e.contacto_datos #>> '{pais}', '')
        ) AS raw_country_name,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,cve_ent}', ''),
            NULLIF(e.contacto_datos #>> '{cve_ent}', '')
        ) AS raw_cve_ent,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,nom_ent}', ''),
            NULLIF(e.contacto_datos #>> '{nom_ent}', '')
        ) AS raw_nom_ent,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,cve_mun}', ''),
            NULLIF(e.contacto_datos #>> '{cve_mun}', '')
        ) AS raw_cve_mun,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,nom_mun}', ''),
            NULLIF(e.contacto_datos #>> '{nom_mun}', '')
        ) AS raw_nom_mun,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,cvegeo}', ''),
            NULLIF(e.contacto_datos #>> '{cvegeo}', '')
        ) AS raw_cvegeo,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,session_id}', ''),
            NULLIF(e.contacto_datos #>> '{session_id}', ''),
            NULLIF(e.contacto_datos #>> '{trazabilidad,session_id}', '')
        ) AS raw_session_id
    FROM eligible e
),
session_geo AS (
    SELECT
        g.*,
        w.cve_ent AS visitor_cve_ent,
        w.nom_ent AS visitor_nom_ent,
        w.cve_mun AS visitor_cve_mun,
        w.nom_mun AS visitor_nom_mun,
        w.cvegeo AS visitor_cvegeo,
        (w.geo -> 'ip_lookup' ->> 'country_code')::text AS visitor_country_code,
        (w.geo -> 'ip_lookup' ->> 'country_name')::text AS visitor_country_name
    FROM geo g
    LEFT JOIN public.webchat_visitantes w
        ON g.raw_session_id IS NOT NULL
       AND w.session_id = g.raw_session_id
),
normalized AS (
    SELECT
        g.lead_id,
        g.contacto_id,
        CASE WHEN g.raw_canal IS NULL OR g.raw_canal = '' THEN 'desconocido' ELSE g.raw_canal END AS canal,
        g.etapa_id,
        lower(COALESCE(g.etapa_codigo, '')) AS etapa_codigo,
        g.etapa_nombre,
        COALESCE(g.etapa_categoria, 'abierta'::public.lead_categoria) AS etapa_categoria,
        COALESCE(g.etapa_orden, 0) AS etapa_orden,
        CASE
            WHEN COALESCE(g.raw_country_code, g.visitor_country_code) IS NULL
                 OR COALESCE(g.raw_country_code, g.visitor_country_code) = '' THEN
                CASE
                    WHEN lower(COALESCE(g.raw_canal, '')) IN ('whatsapp', 'voz') THEN 'MX'
                    ELSE NULL
                END
            WHEN length(COALESCE(g.raw_country_code, g.visitor_country_code)) = 2 THEN upper(COALESCE(g.raw_country_code, g.visitor_country_code))
            WHEN length(COALESCE(g.raw_country_code, g.visitor_country_code)) = 3
                 AND COALESCE(g.raw_country_code, g.visitor_country_code) ~ '^[A-Za-z]{3}$'
                THEN upper(COALESCE(g.raw_country_code, g.visitor_country_code))
            ELSE upper(substr(COALESCE(g.raw_country_code, g.visitor_country_code), 1, 2))
        END AS pais_codigo,
        CASE
            WHEN g.raw_country_name IS NOT NULL AND g.raw_country_name <> '' THEN g.raw_country_name
            WHEN g.visitor_country_name IS NOT NULL AND g.visitor_country_name <> '' THEN g.visitor_country_name
            WHEN COALESCE(g.raw_country_code, g.visitor_country_code) IS NULL
                 AND lower(COALESCE(g.raw_canal, '')) IN ('whatsapp', 'voz') THEN 'México'
            WHEN COALESCE(g.raw_country_code, g.visitor_country_code) IS NOT NULL
                 AND upper(COALESCE(g.raw_country_code, g.visitor_country_code)) = 'MX' THEN 'México'
            ELSE g.raw_country_name
        END AS pais_nombre,
        CASE
            WHEN g.raw_cve_ent IS NOT NULL AND g.raw_cve_ent <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cve_ent, '\\D', '', 'g'), 2, '0')
            WHEN g.visitor_cve_ent IS NOT NULL AND g.visitor_cve_ent <> '' THEN LPAD(REGEXP_REPLACE(g.visitor_cve_ent, '\\D', '', 'g'), 2, '0')
            ELSE NULL
        END AS cve_ent,
        COALESCE(g.raw_nom_ent, g.visitor_nom_ent) AS nom_ent,
        CASE
            WHEN g.raw_cve_mun IS NOT NULL AND g.raw_cve_mun <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            WHEN g.visitor_cve_mun IS NOT NULL AND g.visitor_cve_mun <> '' THEN LPAD(REGEXP_REPLACE(g.visitor_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        COALESCE(g.raw_nom_mun, g.visitor_nom_mun) AS nom_mun,
        CASE
            WHEN g.raw_cvegeo IS NOT NULL AND g.raw_cvegeo <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN g.visitor_cvegeo IS NOT NULL AND g.visitor_cvegeo <> '' THEN LPAD(REGEXP_REPLACE(g.visitor_cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN (g.raw_cve_ent IS NOT NULL AND g.raw_cve_mun IS NOT NULL)
                THEN LPAD(REGEXP_REPLACE(g.raw_cve_ent, '\\D', '', 'g'), 2, '0')
                     || LPAD(REGEXP_REPLACE(g.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            WHEN (g.visitor_cve_ent IS NOT NULL AND g.visitor_cve_mun IS NOT NULL)
                THEN LPAD(REGEXP_REPLACE(g.visitor_cve_ent, '\\D', '', 'g'), 2, '0')
                     || LPAD(REGEXP_REPLACE(g.visitor_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM session_geo g
)
SELECT
    n.lead_id,
    n.contacto_id,
    n.canal,
    n.etapa_id,
    n.etapa_codigo,
    n.etapa_nombre,
    n.etapa_categoria,
    n.etapa_orden,
    n.pais_codigo,
    n.pais_nombre,
    n.cve_ent,
    n.nom_ent,
    n.cve_mun,
    n.nom_mun,
    n.cvegeo
FROM normalized n;
$_$;


--
-- Name: panel_leads_geo_estados(text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_leads_geo_estados(p_canales text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH base AS (
        SELECT * FROM public.panel_leads_geo_base(p_canales, p_from, p_to)
    ),
    summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cve_ent IS NOT NULL) AS ubicados,
            COUNT(*) FILTER (WHERE cve_ent IS NULL) AS sin_ubicacion
        FROM base
    ),
    per_state AS (
        SELECT
            b.cve_ent,
            MAX(b.nom_ent) AS nombre,
            SUM(b.total_por_canal) AS total,
            jsonb_object_agg(b.canal, b.total_por_canal ORDER BY b.canal) AS por_canal
        FROM (
            SELECT cve_ent, nom_ent, canal, COUNT(*) AS total_por_canal
            FROM base
            WHERE cve_ent IS NOT NULL
            GROUP BY cve_ent, nom_ent, canal
        ) b
        GROUP BY b.cve_ent
    )
    SELECT jsonb_build_object(
        'totals', jsonb_build_object(
            'total', COALESCE((SELECT total FROM summary), 0),
            'ubicados', COALESCE((SELECT ubicados FROM summary), 0),
            'sin_ubicacion', COALESCE((SELECT sin_ubicacion FROM summary), 0)
        ),
        'items', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'cve_ent', per_state.cve_ent,
                        'nombre', per_state.nombre,
                        'total', per_state.total,
                        'por_canal', per_state.por_canal
                    )
                    ORDER BY per_state.cve_ent
                ),
                '[]'::jsonb
            )
            FROM per_state
        )
    );
$$;


--
-- Name: panel_leads_geo_municipios(text, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_leads_geo_municipios(p_estado text, p_canales text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH state_code AS (
        SELECT CASE
            WHEN p_estado IS NULL THEN NULL
            ELSE LPAD(REGEXP_REPLACE(p_estado, '\\D', '', 'g'), 2, '0')
        END AS code
    ),
    base AS (
        SELECT b.*
        FROM public.panel_leads_geo_base(p_canales, p_from, p_to) b
        JOIN state_code s ON (s.code IS NOT NULL AND b.cve_ent = s.code)
    ),
    summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cvegeo IS NOT NULL) AS ubicados,
            COUNT(*) FILTER (WHERE cvegeo IS NULL) AS sin_ubicacion
        FROM base
    ),
    per_municipio AS (
        SELECT
            b.cvegeo,
            MAX(b.nom_mun) AS nombre,
            SUM(b.total_por_canal) AS total,
            jsonb_object_agg(b.canal, b.total_por_canal ORDER BY b.canal) AS por_canal
        FROM (
            SELECT cvegeo, nom_mun, canal, COUNT(*) AS total_por_canal
            FROM base
            WHERE cvegeo IS NOT NULL
            GROUP BY cvegeo, nom_mun, canal
        ) b
        GROUP BY b.cvegeo
    ),
    estado_info AS (
        SELECT
            MAX(cve_ent) AS cve_ent,
            MAX(nom_ent) AS nombre
        FROM base
    )
    SELECT jsonb_build_object(
        'estado', jsonb_build_object(
            'cve_ent', COALESCE((SELECT cve_ent FROM estado_info), (SELECT code FROM state_code)),
            'nombre', (SELECT nombre FROM estado_info)
        ),
        'totals', jsonb_build_object(
            'total', COALESCE((SELECT total FROM summary), 0),
            'ubicados', COALESCE((SELECT ubicados FROM summary), 0),
            'sin_ubicacion', COALESCE((SELECT sin_ubicacion FROM summary), 0)
        ),
        'items', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'cvegeo', per_municipio.cvegeo,
                        'nombre', per_municipio.nombre,
                        'total', per_municipio.total,
                        'por_canal', per_municipio.por_canal
                    )
                    ORDER BY per_municipio.cvegeo
                ),
                '[]'::jsonb
            )
            FROM per_municipio
        )
    )
    FROM state_code;
$$;


--
-- Name: panel_leads_geo_resumen(text, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_leads_geo_resumen(p_nivel text DEFAULT 'estado'::text, p_canales text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(location_level text, location_key text, location_name text, canal text, total bigint, abiertas bigint, ganadas bigint, perdidas bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH normalized_level AS (
    SELECT CASE
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'pais' THEN 'pais'
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'municipio' THEN 'municipio'
        ELSE 'estado'
    END AS nivel
),
base AS (
    SELECT
        n.nivel,
        g.*
    FROM normalized_level n
    JOIN public.panel_leads_geo_base_ext(p_canales, p_from, p_to) g ON TRUE
),
scoped AS (
    SELECT
        b.nivel,
        b.canal,
        b.etapa_categoria,
        CASE
            WHEN b.nivel = 'pais' THEN COALESCE(NULLIF(b.pais_codigo, ''), 'UNK')
            WHEN b.nivel = 'municipio' THEN COALESCE(NULLIF(b.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(b.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN b.nivel = 'pais' THEN
                COALESCE(
                    NULLIF(b.pais_nombre, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.pais_codigo, ''), '') = '' THEN 'Desconocido'
                        ELSE b.pais_codigo
                    END
                )
            WHEN b.nivel = 'municipio' THEN
                COALESCE(
                    NULLIF(b.nom_mun, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.cvegeo, ''), '') = '' THEN 'Municipio desconocido'
                        ELSE b.cvegeo
                    END
                )
            ELSE
                COALESCE(
                    NULLIF(b.nom_ent, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.cve_ent, ''), '') = '' THEN 'Estado desconocido'
                        ELSE b.cve_ent
                    END
                )
        END AS location_name
    FROM base b
)
SELECT
    s.nivel AS location_level,
    s.location_key,
    s.location_name,
    s.canal,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE s.etapa_categoria = 'abierta') AS abiertas,
    COUNT(*) FILTER (WHERE s.etapa_categoria = 'ganada') AS ganadas,
    COUNT(*) FILTER (WHERE s.etapa_categoria = 'perdida') AS perdidas
FROM scoped s
GROUP BY s.nivel, s.location_key, s.location_name, s.canal
ORDER BY s.nivel, s.location_name, s.canal;
$$;


--
-- Name: panel_leads_geo_resumen_ext(text, text, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_leads_geo_resumen_ext(p_nivel text DEFAULT 'estado'::text, p_canales text DEFAULT NULL::text, p_etapas text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(location_level text, location_key text, location_name text, canal text, etapa_codigo text, etapa_categoria public.lead_categoria, etapa_orden smallint, captado_orden smallint, total bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH normalized_level AS (
    SELECT CASE
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'pais' THEN 'pais'
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'municipio' THEN 'municipio'
        ELSE 'estado'
    END AS nivel
),
stage_values AS (
    SELECT lower(btrim(value)) AS value
    FROM regexp_split_to_table(COALESCE(p_etapas, ''), ',') AS value
),
stage_param AS (
    SELECT
        CASE
            WHEN EXISTS (
                SELECT 1 FROM stage_values sv
                WHERE sv.value IS NOT NULL
                  AND sv.value <> ''
                  AND sv.value <> 'captado_plus'
            )
            THEN ARRAY(
                SELECT sv.value
                FROM stage_values sv
                WHERE sv.value IS NOT NULL
                  AND sv.value <> ''
                  AND sv.value <> 'captado_plus'
            )::text[]
            ELSE NULL::text[]
        END AS etapas,
        COALESCE(
            (SELECT BOOL_OR(sv.value = 'captado_plus') FROM stage_values sv),
            FALSE
        ) AS include_captado_plus
),
base AS (
    SELECT
        n.nivel,
        COALESCE(NULLIF(g.canal, ''), 'desconocido') AS canal,
        lower(COALESCE(g.etapa_codigo, '')) AS etapa_codigo,
        COALESCE(g.etapa_categoria, 'abierta'::public.lead_categoria) AS etapa_categoria,
        COALESCE(g.etapa_orden, 0) AS etapa_orden,
        CASE
            WHEN n.nivel = 'pais' THEN COALESCE(NULLIF(g.pais_codigo, ''), 'UNK')
            WHEN n.nivel = 'municipio' THEN COALESCE(NULLIF(g.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(g.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN n.nivel = 'pais' THEN
                COALESCE(
                    NULLIF(g.pais_nombre, ''),
                    COALESCE(NULLIF(g.pais_codigo, ''), 'País desconocido')
                )
            WHEN n.nivel = 'municipio' THEN
                COALESCE(
                    NULLIF(g.nom_mun, ''),
                    COALESCE(NULLIF(g.cvegeo, ''), 'Municipio desconocido')
                )
            ELSE
                COALESCE(
                    NULLIF(g.nom_ent, ''),
                    COALESCE(NULLIF(g.cve_ent, ''), 'Estado desconocido')
                )
        END AS location_name
    FROM normalized_level n
    JOIN public.panel_leads_geo_base_ext(p_canales, p_from, p_to) g ON TRUE
),
bounds AS (
    SELECT COALESCE(MIN(b.etapa_orden) FILTER (WHERE b.etapa_codigo = 'captado'), 1) AS captado_orden
    FROM base b
),
filtered AS (
    SELECT
        b.*,
        bd.captado_orden
    FROM base b
    CROSS JOIN stage_param sp
    CROSS JOIN bounds bd
    WHERE
        (
            ((sp.etapas IS NULL OR array_length(sp.etapas, 1) = 0) AND NOT sp.include_captado_plus)
            OR (
                sp.etapas IS NOT NULL
                AND array_length(sp.etapas, 1) > 0
                AND b.etapa_codigo = ANY (sp.etapas)
            )
            OR (
                sp.include_captado_plus
                AND b.etapa_orden >= bd.captado_orden
            )
        )
)
SELECT
    f.nivel AS location_level,
    f.location_key,
    f.location_name,
    f.canal,
    f.etapa_codigo,
    f.etapa_categoria,
    f.etapa_orden::smallint,
    f.captado_orden::smallint,
    COUNT(*)::bigint AS total
FROM filtered f
GROUP BY
    f.nivel,
    f.location_key,
    f.location_name,
    f.canal,
    f.etapa_codigo,
    f.etapa_categoria,
    f.etapa_orden,
    f.captado_orden
ORDER BY f.nivel, f.location_name, f.canal, f.etapa_codigo;
$$;


--
-- Name: panel_leads_list(uuid, uuid, public.lead_categoria, uuid, timestamp with time zone, timestamp with time zone, text, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_leads_list(p_tablero uuid DEFAULT NULL::uuid, p_etapa uuid DEFAULT NULL::uuid, p_categoria public.lead_categoria DEFAULT NULL::public.lead_categoria, p_asignado uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_search text DEFAULT NULL::text, p_order_by text DEFAULT 'creado_en'::text, p_order_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0) RETURNS TABLE(tarjeta_id uuid, contacto_id uuid, contacto_nombre text, contacto_correo text, contacto_telefono text, contacto_empresa text, contacto_notas text, contacto_necesidad text, contacto_estado text, canal text, etapa_id uuid, etapa_nombre text, etapa_codigo text, etapa_metadatos jsonb, etapa_orden smallint, categoria public.lead_categoria, creado_en timestamp with time zone, actualizado_en timestamp with time zone, cerrado_en timestamp with time zone, monto_estimado numeric, moneda text, probabilidad numeric, proyecto_nombre text, proyecto_necesidades text, lead_score integer, asignado_id uuid, asignado_nombre text, propietario_id uuid, propietario_nombre text, conversacion_id uuid, ultimo_mensaje_en timestamp with time zone, motivo_cierre text, tags text[], metadata jsonb, total_rows bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH filtered AS (
    SELECT
        lt.id AS tarjeta_id,
        lt.contacto_id,
        ct.nombre_completo AS contacto_nombre,
        ct.correo AS contacto_correo,
        ct.telefono_e164 AS contacto_telefono,
        NULLIF(ct.company_name, '') AS contacto_empresa,
        NULLIF(ct.notes, '') AS contacto_notas,
        NULLIF(ct.necesidad_proposito, '') AS contacto_necesidad,
        COALESCE(NULLIF(ct.estado, ''), NULLIF(ct.captura_estado, '')) AS contacto_estado,
        COALESCE(NULLIF(lt.canal, ''), NULLIF(conv.canal, '')) AS canal,
        le.id AS etapa_id,
        le.nombre AS etapa_nombre,
        le.codigo AS etapa_codigo,
        le.metadatos AS etapa_metadatos,
        le.orden AS etapa_orden,
        le.categoria,
        lt.creado_en,
        lt.actualizado_en,
        lt.cerrado_en,
        lt.monto_estimado,
        lt.moneda,
        COALESCE(lt.probabilidad_override, le.probabilidad) AS probabilidad,
        lt.proyecto_nombre,
        lt.proyecto_necesidades,
        lt.lead_score,
        lt.asignado_a_usuario_id AS asignado_id,
        asignado.nombre_completo AS asignado_nombre,
        lt.propietario_usuario_id AS propietario_id,
        propietario.nombre_completo AS propietario_nombre,
        lt.conversacion_id,
        conv.ultimo_mensaje_en,
        lt.motivo_cierre,
        lt.tags,
        lt.metadata
    FROM public.lead_tarjetas lt
    JOIN public.lead_etapas le ON le.id = lt.etapa_id
    JOIN public.contactos ct ON ct.id = lt.contacto_id
    LEFT JOIN public.conversaciones conv ON conv.id = lt.conversacion_id
    LEFT JOIN public.usuarios asignado ON asignado.id = lt.asignado_a_usuario_id
    LEFT JOIN public.usuarios propietario ON propietario.id = lt.propietario_usuario_id
    WHERE public.puede_ver_lead(lt.id)
      AND (p_tablero IS NULL OR lt.tablero_id = p_tablero)
      AND (p_etapa IS NULL OR lt.etapa_id = p_etapa)
      AND (p_categoria IS NULL OR le.categoria = p_categoria)
      AND (p_asignado IS NULL OR lt.asignado_a_usuario_id = p_asignado)
      AND (p_from IS NULL OR lt.creado_en >= p_from)
      AND (p_to IS NULL OR lt.creado_en <= p_to)
      AND (
        p_search IS NULL OR p_search = '' OR
        ct.nombre_completo ILIKE '%' || p_search || '%' OR
        ct.correo ILIKE '%' || p_search || '%' OR
        ct.telefono_e164 ILIKE '%' || p_search || '%' OR
        le.nombre ILIKE '%' || p_search || '%' OR
        COALESCE(NULLIF(lt.canal, ''), NULLIF(conv.canal, '')) ILIKE '%' || p_search || '%' OR
        asignado.nombre_completo ILIKE '%' || p_search || '%' OR
        propietario.nombre_completo ILIKE '%' || p_search || '%'
      )
),
annotated AS (
    SELECT
        f.*,
        COUNT(*) OVER () AS total_rows
    FROM filtered f
),
ordered AS (
    SELECT *
    FROM annotated
    ORDER BY
        CASE WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) = 'asc' THEN actualizado_en END ASC,
        CASE WHEN lower(p_order_by) = 'actualizado_en' AND lower(p_order_dir) <> 'asc' THEN actualizado_en END DESC,
        CASE WHEN lower(p_order_by) = 'cerrado_en' AND lower(p_order_dir) = 'asc' THEN cerrado_en END ASC,
        CASE WHEN lower(p_order_by) = 'cerrado_en' AND lower(p_order_dir) <> 'asc' THEN cerrado_en END DESC,
        CASE WHEN lower(p_order_by) = 'monto_estimado' AND lower(p_order_dir) = 'asc' THEN monto_estimado END ASC,
        CASE WHEN lower(p_order_by) = 'monto_estimado' AND lower(p_order_dir) <> 'asc' THEN monto_estimado END DESC,
        CASE WHEN lower(p_order_by) = 'probabilidad' AND lower(p_order_dir) = 'asc' THEN probabilidad END ASC,
        CASE WHEN lower(p_order_by) = 'probabilidad' AND lower(p_order_dir) <> 'asc' THEN probabilidad END DESC,
        CASE WHEN lower(p_order_by) = 'lead_score' AND lower(p_order_dir) = 'asc' THEN lead_score END ASC,
        CASE WHEN lower(p_order_by) = 'lead_score' AND lower(p_order_dir) <> 'asc' THEN lead_score END DESC,
        CASE WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) = 'asc' THEN creado_en END ASC,
        CASE WHEN lower(p_order_by) = 'creado_en' AND lower(p_order_dir) <> 'asc' THEN creado_en END DESC,
        creado_en DESC,
        tarjeta_id
)
SELECT
    tarjeta_id,
    contacto_id,
    contacto_nombre,
    contacto_correo,
    contacto_telefono,
    contacto_empresa,
    contacto_notas,
    contacto_necesidad,
    contacto_estado,
    canal,
    etapa_id,
    etapa_nombre,
    etapa_codigo,
    etapa_metadatos,
    etapa_orden,
    categoria,
    creado_en,
    actualizado_en,
    cerrado_en,
    monto_estimado,
    moneda,
    probabilidad,
    proyecto_nombre,
    proyecto_necesidades,
    lead_score,
    asignado_id,
    asignado_nombre,
    propietario_id,
    propietario_nombre,
    conversacion_id,
    ultimo_mensaje_en,
    motivo_cierre,
    tags,
    metadata,
    total_rows
FROM ordered
LIMIT COALESCE(NULLIF(p_limit, 0), 100)
OFFSET GREATEST(p_offset, 0);
$$;


--
-- Name: panel_leads_resumen(timestamp with time zone, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_leads_resumen(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_tablero uuid DEFAULT NULL::uuid, p_asignado uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH base AS (
    SELECT
        lt.*,
        le.categoria,
        le.nombre AS etapa_nombre
    FROM public.lead_tarjetas lt
    JOIN public.lead_etapas le ON le.id = lt.etapa_id
    WHERE (p_from IS NULL OR lt.creado_en >= p_from)
      AND (p_to IS NULL OR lt.creado_en <= p_to)
      AND (p_tablero IS NULL OR lt.tablero_id = p_tablero)
      AND (p_asignado IS NULL OR lt.asignado_a_usuario_id = p_asignado)
      AND public.puede_ver_lead(lt.id)
),
counts AS (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE categoria = 'abierta') AS abiertas,
        COUNT(*) FILTER (WHERE categoria = 'ganada') AS ganadas,
        COUNT(*) FILTER (WHERE categoria = 'perdida') AS perdidas,
        COUNT(*) FILTER (
            WHERE lt.creado_en >= COALESCE(p_from, now() - INTERVAL '24 hours')
        ) AS nuevas,
        COUNT(DISTINCT asignado_a_usuario_id) FILTER (WHERE asignado_a_usuario_id IS NOT NULL) AS vendedores_activos
    FROM base lt
),
monto AS (
    SELECT COALESCE(SUM(monto_estimado), 0)::numeric AS monto_total
    FROM base
),
top_vendedor AS (
    SELECT asignado_a_usuario_id, COUNT(*) AS total
    FROM base
    WHERE asignado_a_usuario_id IS NOT NULL
    GROUP BY asignado_a_usuario_id
    ORDER BY total DESC
    LIMIT 1
),
top_vendedor_datos AS (
    SELECT
        u.id,
        u.nombre_completo,
        tv.total
    FROM top_vendedor tv
    LEFT JOIN public.usuarios u ON u.id = tv.asignado_a_usuario_id
)
SELECT jsonb_build_object(
    'total', COALESCE((SELECT total FROM counts), 0),
    'abiertas', COALESCE((SELECT abiertas FROM counts), 0),
    'ganadas', COALESCE((SELECT ganadas FROM counts), 0),
    'perdidas', COALESCE((SELECT perdidas FROM counts), 0),
    'nuevas', COALESCE((SELECT nuevas FROM counts), 0),
    'vendedores_activos', COALESCE((SELECT vendedores_activos FROM counts), 0),
    'monto_total', COALESCE((SELECT monto_total FROM monto), 0),
    'top_vendedor', COALESCE((
        SELECT jsonb_build_object(
            'id', id,
            'nombre', nombre_completo,
            'total', total
        )
        FROM top_vendedor_datos
    ), '{}'::jsonb)
);
$$;


--
-- Name: panel_leads_timeline(timestamp with time zone, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_leads_timeline(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_tablero uuid DEFAULT NULL::uuid, p_asignado uuid DEFAULT NULL::uuid) RETURNS TABLE(bucket_date date, nuevos bigint, ganados bigint, perdidos bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH bounds AS (
    SELECT
        COALESCE(date_trunc('day', p_from), date_trunc('day', now() - INTERVAL '29 days'))::date AS start_date,
        COALESCE(date_trunc('day', p_to), date_trunc('day', now()))::date AS end_date
),
series AS (
    SELECT generate_series(start_date, end_date, '1 day')::date AS bucket_date
    FROM bounds
),
visibles AS (
    SELECT
        lt.id,
        lt.creado_en::date AS creado_date,
        lt.cerrado_en::date AS cerrado_date,
        le.categoria
    FROM public.lead_tarjetas lt
    JOIN public.lead_etapas le ON le.id = lt.etapa_id
    WHERE (p_tablero IS NULL OR lt.tablero_id = p_tablero)
      AND (p_asignado IS NULL OR lt.asignado_a_usuario_id = p_asignado)
      AND (p_to IS NULL OR lt.creado_en <= p_to)
      AND public.puede_ver_lead(lt.id)
),
agg_new AS (
    SELECT creado_date AS bucket_date, COUNT(*) AS nuevos
    FROM visibles
    WHERE creado_date IS NOT NULL
      AND (p_from IS NULL OR creado_date >= p_from::date)
    GROUP BY creado_date
),
agg_closed AS (
    SELECT
        cerrado_date AS bucket_date,
        COUNT(*) FILTER (WHERE categoria = 'ganada') AS ganados,
        COUNT(*) FILTER (WHERE categoria = 'perdida') AS perdidos
    FROM visibles
    WHERE cerrado_date IS NOT NULL
      AND (p_from IS NULL OR cerrado_date >= p_from::date)
      AND (p_to IS NULL OR cerrado_date <= p_to::date)
    GROUP BY cerrado_date
)
SELECT
    s.bucket_date,
    COALESCE(agg_new.nuevos, 0) AS nuevos,
    COALESCE(agg_closed.ganados, 0) AS ganados,
    COALESCE(agg_closed.perdidos, 0) AS perdidos
FROM series s
LEFT JOIN agg_new ON agg_new.bucket_date = s.bucket_date
LEFT JOIN agg_closed ON agg_closed.bucket_date = s.bucket_date
ORDER BY s.bucket_date;
$$;


--
-- Name: panel_visitantes_geo_resumen(text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_visitantes_geo_resumen(p_nivel text DEFAULT 'estado'::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(location_level text, location_key text, location_name text, total_visitas bigint, visitas_con_chat bigint, visitas_sin_chat bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
WITH normalized_level AS (
    SELECT CASE
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'pais' THEN 'pais'
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'municipio' THEN 'municipio'
        ELSE 'estado'
    END AS nivel
),
visits AS (
    SELECT
        w.session_id,
        w.contacto_id,
        w.ultimo_evento_en,
        w.geo,
        sc.closed_at,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM public.mensajes m
                WHERE m.datos ->> 'session_id' = w.session_id
                  AND m.direccion = 'entrante'
            )
            THEN TRUE
            ELSE FALSE
        END AS tuvo_chat
    FROM public.webchat_visitantes w
    LEFT JOIN public.webchat_session_closures sc ON sc.session_id = w.session_id
    WHERE (p_from IS NULL OR w.ultimo_evento_en >= p_from)
      AND (p_to IS NULL OR w.ultimo_evento_en <= p_to)
),
geo AS (
    SELECT
        v.*,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'country_code', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((v.geo -> 'client') ->> 'country_code', ''),
            NULLIF((v.geo -> 'client') ->> 'country', ''),
            NULLIF(v.geo ->> 'country_code', ''),
            NULLIF(v.geo ->> 'country', '')
        ) AS raw_country_code,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'country_name', ''),
            NULLIF((v.geo -> 'client') ->> 'country_name', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((v.geo -> 'client') ->> 'country', '')
        ) AS raw_country_name,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'state_code', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'region', ''),
            NULLIF((v.geo -> 'client') ->> 'state_code', ''),
            NULLIF((v.geo -> 'client') ->> 'region', ''),
            NULLIF(v.geo ->> 'state_code', ''),
            NULLIF(v.geo ->> 'region', '')
        ) AS raw_state_code,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'state', ''),
            NULLIF((v.geo -> 'client') ->> 'state', ''),
            NULLIF(v.geo ->> 'state', '')
        ) AS raw_state_name,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'city', ''),
            NULLIF((v.geo -> 'client') ->> 'city', ''),
            NULLIF(v.geo ->> 'city', '')
        ) AS raw_city_name,
        COALESCE(
            NULLIF(v.geo ->> 'cve_ent', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'cve_ent', '')
        ) AS raw_cve_ent,
        COALESCE(
            NULLIF(v.geo ->> 'cve_mun', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'cve_mun', '')
        ) AS raw_cve_mun,
        COALESCE(
            NULLIF(v.geo ->> 'cvegeo', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'cvegeo', '')
        ) AS raw_cvegeo
    FROM visits v
),
normalized AS (
    SELECT
        g.session_id,
        g.tuvo_chat,
        CASE
            WHEN g.raw_country_code IS NULL OR g.raw_country_code = '' THEN 'UNK'
            WHEN length(g.raw_country_code) = 2 THEN upper(g.raw_country_code)
            WHEN length(g.raw_country_code) = 3 AND g.raw_country_code ~ '^[A-Za-z]{3}$' THEN upper(g.raw_country_code)
            ELSE upper(substr(g.raw_country_code, 1, 2))
        END AS country_code,
        CASE
            WHEN g.raw_country_name IS NOT NULL AND g.raw_country_name <> '' THEN g.raw_country_name
            WHEN upper(COALESCE(g.raw_country_code, '')) = 'MX' THEN 'México'
            ELSE g.raw_country_name
        END AS country_name,
        CASE
            WHEN g.raw_cve_ent IS NOT NULL AND g.raw_cve_ent <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cve_ent, '\\D', '', 'g'), 2, '0')
            WHEN upper(COALESCE(g.raw_country_code, '')) = 'MX' AND g.raw_state_code ~ '^[0-9]{1,2}$' THEN LPAD(g.raw_state_code, 2, '0')
            ELSE NULL
        END AS cve_ent,
        COALESCE(
            g.raw_state_name,
            g.raw_state_code,
            NULL
        ) AS nom_ent,
        CASE
            WHEN g.raw_cve_mun IS NOT NULL AND g.raw_cve_mun <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        COALESCE(
            g.raw_city_name,
            NULL
        ) AS nom_mun,
        CASE
            WHEN g.raw_cvegeo IS NOT NULL AND g.raw_cvegeo <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN upper(COALESCE(g.raw_country_code, '')) = 'MX' AND g.raw_cve_ent IS NOT NULL AND g.raw_cve_mun IS NOT NULL
                THEN LPAD(REGEXP_REPLACE(g.raw_cve_ent, '\\D', '', 'g'), 2, '0')
                     || LPAD(REGEXP_REPLACE(g.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM geo g
),
base AS (
    SELECT
        (SELECT nivel FROM normalized_level) AS nivel,
        n.*
    FROM normalized n
),
scoped AS (
    SELECT
        b.nivel,
        CASE
            WHEN b.nivel = 'pais' THEN COALESCE(NULLIF(b.country_code, ''), 'UNK')
            WHEN b.nivel = 'municipio' THEN COALESCE(NULLIF(b.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(b.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN b.nivel = 'pais' THEN
                COALESCE(
                    NULLIF(b.country_name, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.country_code, ''), '') = '' THEN 'Desconocido'
                        ELSE b.country_code
                    END
                )
            WHEN b.nivel = 'municipio' THEN
                COALESCE(
                    NULLIF(b.nom_mun, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.cvegeo, ''), '') = '' THEN 'Municipio desconocido'
                        ELSE b.cvegeo
                    END
                )
            ELSE
                COALESCE(
                    NULLIF(b.nom_ent, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.cve_ent, ''), '') = '' THEN 'Estado desconocido'
                        ELSE b.cve_ent
                    END
                )
        END AS location_name,
        b.tuvo_chat
    FROM base b
)
SELECT
    s.nivel AS location_level,
    s.location_key,
    s.location_name,
    COUNT(*) AS total_visitas,
    COUNT(*) FILTER (WHERE s.tuvo_chat) AS visitas_con_chat,
    COUNT(*) FILTER (WHERE NOT s.tuvo_chat) AS visitas_sin_chat
FROM scoped s
GROUP BY s.nivel, s.location_key, s.location_name
ORDER BY s.nivel, s.location_name;
$_$;


--
-- Name: panel_visitantes_geo_resumen_ext(text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_visitantes_geo_resumen_ext(p_nivel text DEFAULT 'estado'::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(location_level text, location_key text, location_name text, total_visitas bigint, visitas_con_chat bigint, visitas_sin_chat bigint, webchat_total bigint, webchat_con_chat bigint, webchat_sin_chat bigint, whatsapp_total bigint, voz_total bigint, has_data boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
WITH normalized_level AS (
    SELECT CASE
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'pais' THEN 'pais'
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'municipio' THEN 'municipio'
        ELSE 'estado'
    END AS nivel
),
webchat_visits AS (
    SELECT
        w.session_id,
        w.contacto_id,
        w.ultimo_evento_en,
        w.geo,
        COALESCE(w.cve_ent, NULLIF(w.geo ->> 'cve_ent', '')) AS cve_ent,
        COALESCE(w.nom_ent, NULLIF(w.geo ->> 'nom_ent', '')) AS nom_ent,
        COALESCE(w.cve_mun, NULLIF(w.geo ->> 'cve_mun', '')) AS cve_mun,
        COALESCE(w.nom_mun, NULLIF(w.geo ->> 'nom_mun', '')) AS nom_mun,
        COALESCE(w.cvegeo, NULLIF(w.geo ->> 'cvegeo', '')) AS cvegeo,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM public.mensajes m
                WHERE m.datos ->> 'session_id' = w.session_id
                  AND m.direccion = 'entrante'
            )
            THEN TRUE
            ELSE FALSE
        END AS tuvo_chat
    FROM public.webchat_visitantes w
    WHERE (p_from IS NULL OR w.ultimo_evento_en >= p_from)
      AND (p_to IS NULL OR w.ultimo_evento_en <= p_to)
),
webchat_geo AS (
    SELECT
        v.*,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'country_code', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((v.geo -> 'client') ->> 'country_code', ''),
            NULLIF((v.geo -> 'client') ->> 'country', '')
        ) AS raw_country_code,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'country_name', ''),
            NULLIF((v.geo -> 'client') ->> 'country_name', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((v.geo -> 'client') ->> 'country', '')
        ) AS raw_country_name
    FROM webchat_visits v
),
webchat_normalized AS (
    SELECT
        g.session_id,
        g.tuvo_chat,
        CASE
            WHEN g.raw_country_code IS NULL OR g.raw_country_code = '' THEN 'UNK'
            WHEN length(g.raw_country_code) = 2 THEN upper(g.raw_country_code)
            WHEN length(g.raw_country_code) = 3 AND g.raw_country_code ~ '^[A-Za-z]{3}$' THEN upper(g.raw_country_code)
            ELSE upper(substr(g.raw_country_code, 1, 2))
        END AS country_code,
        COALESCE(
            g.raw_country_name,
            CASE WHEN upper(COALESCE(g.raw_country_code, '')) = 'MX' THEN 'México' ELSE 'País desconocido' END
        ) AS country_name,
        CASE
            WHEN g.cve_ent IS NOT NULL AND g.cve_ent <> '' THEN LPAD(REGEXP_REPLACE(g.cve_ent, '\D', '', 'g'), 2, '0')
            ELSE NULL
        END AS cve_ent,
        g.nom_ent,
        CASE
            WHEN g.cve_mun IS NOT NULL AND g.cve_mun <> '' THEN LPAD(REGEXP_REPLACE(g.cve_mun, '\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        g.nom_mun,
        CASE
            WHEN g.cvegeo IS NOT NULL AND g.cvegeo <> '' THEN LPAD(REGEXP_REPLACE(g.cvegeo, '\D', '', 'g'), 5, '0')
            WHEN g.cve_ent IS NOT NULL AND g.cve_mun IS NOT NULL THEN
                LPAD(REGEXP_REPLACE(g.cve_ent, '\D', '', 'g'), 2, '0')
                || LPAD(REGEXP_REPLACE(g.cve_mun, '\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM webchat_geo g
),
webchat_scoped AS (
    SELECT
        nl.nivel,
        n.session_id,
        n.tuvo_chat,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_code, ''), 'UNK')
            WHEN nl.nivel = 'municipio' THEN COALESCE(NULLIF(n.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(n.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_name, ''), 'País desconocido')
            WHEN nl.nivel = 'municipio' THEN
                COALESCE(
                    NULLIF(n.nom_mun, ''),
                    COALESCE(NULLIF(n.cvegeo, ''), 'Municipio desconocido')
                )
            ELSE
                COALESCE(
                    NULLIF(n.nom_ent, ''),
                    COALESCE(NULLIF(n.cve_ent, ''), 'Estado desconocido')
                )
        END AS location_name
    FROM webchat_normalized n
    CROSS JOIN normalized_level nl
),
webchat_metrics AS (
    SELECT
        s.nivel AS location_level,
        s.location_key,
        s.location_name,
        COUNT(*)::bigint AS total_visitas,
        COUNT(*) FILTER (WHERE s.tuvo_chat) AS visitas_con_chat,
        COUNT(*) FILTER (WHERE NOT s.tuvo_chat) AS visitas_sin_chat,
        COUNT(*)::bigint AS webchat_total,
        COUNT(*) FILTER (WHERE s.tuvo_chat) AS webchat_con_chat,
        COUNT(*) FILTER (WHERE NOT s.tuvo_chat) AS webchat_sin_chat
    FROM webchat_scoped s
    GROUP BY s.nivel, s.location_key, s.location_name
),
conversation_base AS (
    SELECT
        conv.id,
        lower(COALESCE(conv.canal, '')) AS canal,
        COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) AS activity_at,
        ct.contacto_datos,
        ct.telefono_e164
    FROM public.conversaciones conv
    JOIN public.contactos ct ON ct.id = conv.contacto_id
    WHERE lower(COALESCE(conv.canal, '')) IN ('whatsapp', 'voz')
      AND public.puede_ver_contacto(ct.id)
      AND (p_from IS NULL OR COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) >= p_from)
      AND (p_to IS NULL OR COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) <= p_to)
),
conversation_geo AS (
    SELECT
        cb.*,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,country_code}', ''),
            NULLIF(cb.contacto_datos #>> '{country_code}', ''),
            NULLIF(cb.contacto_datos #>> '{ubicacion,pais_codigo}', ''),
            NULLIF(cb.contacto_datos #>> '{pais_codigo}', '')
        ) AS raw_country_code,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,country_name}', ''),
            NULLIF(cb.contacto_datos #>> '{country_name}', ''),
            NULLIF(cb.contacto_datos #>> '{ubicacion,pais_nombre}', ''),
            NULLIF(cb.contacto_datos #>> '{pais_nombre}', ''),
            NULLIF(cb.contacto_datos #>> '{ubicacion,pais}', ''),
            NULLIF(cb.contacto_datos #>> '{pais}', '')
        ) AS raw_country_name,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,cve_ent}', ''),
            NULLIF(cb.contacto_datos #>> '{cve_ent}', '')
        ) AS raw_cve_ent,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,nom_ent}', ''),
            NULLIF(cb.contacto_datos #>> '{nom_ent}', '')
        ) AS raw_nom_ent,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,cve_mun}', ''),
            NULLIF(cb.contacto_datos #>> '{cve_mun}', '')
        ) AS raw_cve_mun,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,nom_mun}', ''),
            NULLIF(cb.contacto_datos #>> '{nom_mun}', '')
        ) AS raw_nom_mun,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,cvegeo}', ''),
            NULLIF(cb.contacto_datos #>> '{cvegeo}', '')
        ) AS raw_cvegeo,
        regexp_replace(COALESCE(cb.telefono_e164, ''), '\D', '', 'g') AS telefono_digits
    FROM conversation_base cb
),
conversation_normalized AS (
    SELECT
        cg.id,
        cg.canal,
        CASE
            WHEN cg.raw_country_code IS NOT NULL AND cg.raw_country_code <> '' THEN
                CASE
                    WHEN length(cg.raw_country_code) = 2 THEN upper(cg.raw_country_code)
                    WHEN length(cg.raw_country_code) = 3 AND cg.raw_country_code ~ '^[A-Za-z]{3}$'
                        THEN upper(cg.raw_country_code)
                    ELSE upper(substr(cg.raw_country_code, 1, 2))
                END
            WHEN cg.telefono_digits LIKE '52%' THEN 'MX'
            ELSE 'UNK'
        END AS country_code,
        CASE
            WHEN cg.raw_country_name IS NOT NULL AND cg.raw_country_name <> '' THEN cg.raw_country_name
            WHEN cg.telefono_digits LIKE '52%' THEN 'México'
            ELSE 'País desconocido'
        END AS country_name,
        CASE
            WHEN cg.raw_cve_ent IS NOT NULL AND cg.raw_cve_ent <> '' THEN LPAD(REGEXP_REPLACE(cg.raw_cve_ent, '\D', '', 'g'), 2, '0')
            ELSE NULL
        END AS cve_ent,
        COALESCE(cg.raw_nom_ent, CASE WHEN cg.telefono_digits LIKE '52%' THEN 'Estado desconocido' END) AS nom_ent,
        CASE
            WHEN cg.raw_cve_mun IS NOT NULL AND cg.raw_cve_mun <> '' THEN LPAD(REGEXP_REPLACE(cg.raw_cve_mun, '\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        cg.raw_nom_mun AS nom_mun,
        CASE
            WHEN cg.raw_cvegeo IS NOT NULL AND cg.raw_cvegeo <> '' THEN LPAD(REGEXP_REPLACE(cg.raw_cvegeo, '\D', '', 'g'), 5, '0')
            WHEN cg.raw_cve_ent IS NOT NULL AND cg.raw_cve_mun IS NOT NULL THEN
                LPAD(REGEXP_REPLACE(cg.raw_cve_ent, '\D', '', 'g'), 2, '0')
                || LPAD(REGEXP_REPLACE(cg.raw_cve_mun, '\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM conversation_geo cg
),
conversation_scoped AS (
    SELECT
        nl.nivel,
        n.canal,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_code, ''), 'UNK')
            WHEN nl.nivel = 'municipio' THEN COALESCE(NULLIF(n.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(n.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_name, ''), 'País desconocido')
            WHEN nl.nivel = 'municipio' THEN
                COALESCE(
                    NULLIF(n.nom_mun, ''),
                    COALESCE(NULLIF(n.cvegeo, ''), 'Municipio desconocido')
                )
            ELSE
                COALESCE(
                    NULLIF(n.nom_ent, ''),
                    COALESCE(NULLIF(n.cve_ent, ''), 'Estado desconocido')
                )
        END AS location_name
    FROM conversation_normalized n
    CROSS JOIN normalized_level nl
),
conversation_metrics AS (
    SELECT
        cs.nivel AS location_level,
        cs.location_key,
        cs.location_name,
        COUNT(*) FILTER (WHERE cs.canal = 'whatsapp')::bigint AS whatsapp_total,
        COUNT(*) FILTER (WHERE cs.canal = 'voz')::bigint AS voz_total
    FROM conversation_scoped cs
    GROUP BY cs.nivel, cs.location_key, cs.location_name
),
metrics_union AS (
    SELECT
        wm.location_level,
        wm.location_key,
        wm.location_name,
        wm.total_visitas,
        wm.visitas_con_chat,
        wm.visitas_sin_chat,
        wm.webchat_total,
        wm.webchat_con_chat,
        wm.webchat_sin_chat,
        0::bigint AS whatsapp_total,
        0::bigint AS voz_total
    FROM webchat_metrics wm

    UNION ALL

    SELECT
        cm.location_level,
        cm.location_key,
        cm.location_name,
        0::bigint AS total_visitas,
        0::bigint AS visitas_con_chat,
        0::bigint AS visitas_sin_chat,
        0::bigint AS webchat_total,
        0::bigint AS webchat_con_chat,
        0::bigint AS webchat_sin_chat,
        COALESCE(cm.whatsapp_total, 0)::bigint AS whatsapp_total,
        COALESCE(cm.voz_total, 0)::bigint AS voz_total
    FROM conversation_metrics cm
)
SELECT
    mu.location_level,
    mu.location_key,
    mu.location_name,
    SUM(mu.total_visitas)::bigint AS total_visitas,
    SUM(mu.visitas_con_chat)::bigint AS visitas_con_chat,
    SUM(mu.visitas_sin_chat)::bigint AS visitas_sin_chat,
    SUM(mu.webchat_total)::bigint AS webchat_total,
    SUM(mu.webchat_con_chat)::bigint AS webchat_con_chat,
    SUM(mu.webchat_sin_chat)::bigint AS webchat_sin_chat,
    SUM(mu.whatsapp_total)::bigint AS whatsapp_total,
    SUM(mu.voz_total)::bigint AS voz_total,
    (
        SUM(mu.total_visitas)
        + SUM(mu.whatsapp_total)
        + SUM(mu.voz_total)
    ) > 0 AS has_data
FROM metrics_union mu
GROUP BY mu.location_level, mu.location_key, mu.location_name
ORDER BY mu.location_level, mu.location_name;
$_$;


--
-- Name: panel_visitantes_sin_chat_base(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_visitantes_sin_chat_base(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(session_id text, closed_at timestamp with time zone, cve_ent text, nom_ent text, cve_mun text, nom_mun text, cvegeo text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH closures AS (
        SELECT sc.session_id, sc.closed_at
        FROM public.webchat_session_closures sc
        WHERE (p_from IS NULL OR sc.closed_at >= p_from)
          AND (p_to IS NULL OR sc.closed_at <= p_to)
    ),
    filtered AS (
        SELECT c.session_id, c.closed_at
        FROM closures c
        LEFT JOIN public.mensajes m
          ON m.datos ->> 'session_id' = c.session_id
         AND m.direccion = 'entrante'
        WHERE m.id IS NULL
    )
    SELECT
        f.session_id,
        f.closed_at,
        COALESCE(
            NULLIF(v.cve_ent, ''),
            NULLIF(c.cve_ent, ''),
            CASE
                WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 2
                    THEN substr(v.cvegeo_digits, 1, 2)
                WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 2
                    THEN substr(c.cvegeo_digits, 1, 2)
                ELSE NULL
            END
        ) AS cve_ent,
        COALESCE(NULLIF(v.nom_ent, ''), NULLIF(c.nom_ent, '')) AS nom_ent,
        COALESCE(
            NULLIF(v.cve_mun, ''),
            NULLIF(c.cve_mun, ''),
            CASE
                WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 5
                    THEN substr(v.cvegeo_digits, 3, 3)
                WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 5
                    THEN substr(c.cvegeo_digits, 3, 3)
                ELSE NULL
            END
        ) AS cve_mun,
        COALESCE(NULLIF(v.nom_mun, ''), NULLIF(c.nom_mun, '')) AS nom_mun,
        COALESCE(
            NULLIF(v.cvegeo, ''),
            NULLIF(c.cvegeo, ''),
            CASE
                WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 5
                    THEN substr(v.cvegeo_digits, 1, 5)
                WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 5
                    THEN substr(c.cvegeo_digits, 1, 5)
                WHEN v.cve_ent IS NOT NULL AND v.cve_mun IS NOT NULL
                    THEN v.cve_ent || v.cve_mun
                WHEN c.cve_ent IS NOT NULL AND c.cve_mun IS NOT NULL
                    THEN c.cve_ent || c.cve_mun
                ELSE NULL
            END
        ) AS cvegeo
    FROM filtered f
    LEFT JOIN LATERAL (
        SELECT
            w.contacto_id,
            w.cve_ent,
            w.nom_ent,
            w.cve_mun,
            w.nom_mun,
            w.cvegeo,
            REGEXP_REPLACE(COALESCE(w.cvegeo, ''), '\\D', '', 'g') AS cvegeo_digits
        FROM public.webchat_visitantes w
        WHERE w.session_id = f.session_id
        LIMIT 1
    ) v ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            CASE
                WHEN val_cve_ent IS NULL THEN NULL
                ELSE LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
            END AS cve_ent,
            val_nom_ent AS nom_ent,
            CASE
                WHEN val_cve_mun IS NULL THEN NULL
                ELSE LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
            END AS cve_mun,
            val_nom_mun AS nom_mun,
            CASE
                WHEN val_cvegeo IS NOT NULL THEN LPAD(REGEXP_REPLACE(val_cvegeo, '\\D', '', 'g'), 5, '0')
                WHEN val_cve_ent IS NOT NULL AND val_cve_mun IS NOT NULL
                    THEN LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
                        || LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
                ELSE NULL
            END AS cvegeo,
            REGEXP_REPLACE(
                COALESCE(val_cvegeo,
                    CASE
                        WHEN val_cve_ent IS NOT NULL AND val_cve_mun IS NOT NULL
                            THEN LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
                                || LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
                        ELSE NULL
                    END
                ),
                '\\D',
                '',
                'g'
            ) AS cvegeo_digits
        FROM (
            SELECT
                COALESCE(
                    NULLIF(cd #>> '{ubicacion,cve_ent}', ''),
                    NULLIF(cd #>> '{cve_ent}', '')
                ) AS val_cve_ent,
                COALESCE(
                    NULLIF(cd #>> '{ubicacion,nom_ent}', ''),
                    NULLIF(cd #>> '{nom_ent}', '')
                ) AS val_nom_ent,
                COALESCE(
                    NULLIF(cd #>> '{ubicacion,cve_mun}', ''),
                    NULLIF(cd #>> '{cve_mun}', '')
                ) AS val_cve_mun,
                COALESCE(
                    NULLIF(cd #>> '{ubicacion,nom_mun}', ''),
                    NULLIF(cd #>> '{nom_mun}', '')
                ) AS val_nom_mun,
                COALESCE(
                    NULLIF(cd #>> '{ubicacion,cvegeo}', ''),
                    NULLIF(cd #>> '{cvegeo}', '')
                ) AS val_cvegeo
            FROM (
                SELECT contacto_datos AS cd
                FROM public.contactos
                WHERE id = v.contacto_id
                LIMIT 1
            ) raw
        ) merged
    ) c ON TRUE;
$$;


--
-- Name: panel_visitantes_sin_chat_estados(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_visitantes_sin_chat_estados(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH base AS (
        SELECT * FROM public.panel_visitantes_sin_chat_base(p_from, p_to)
    ),
    summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cve_ent IS NOT NULL) AS ubicados,
            COUNT(*) FILTER (WHERE cve_ent IS NULL) AS sin_ubicacion
        FROM base
    ),
    grouped AS (
        SELECT
            cve_ent,
            MAX(nom_ent) AS nombre,
            COUNT(*) AS total
        FROM base
        WHERE cve_ent IS NOT NULL
        GROUP BY cve_ent
    )
    SELECT jsonb_build_object(
        'totals', jsonb_build_object(
            'total', COALESCE(summary.total, 0),
            'ubicados', COALESCE(summary.ubicados, 0),
            'sin_ubicacion', COALESCE(summary.sin_ubicacion, 0)
        ),
        'items', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'cve_ent', grouped.cve_ent,
                        'nombre', grouped.nombre,
                        'total', grouped.total,
                        'por_canal', jsonb_build_object('visitantes', grouped.total)
                    )
                    ORDER BY grouped.cve_ent
                ),
                '[]'::jsonb
            )
            FROM grouped
        )
    )
    FROM summary;
$$;


--
-- Name: panel_visitantes_sin_chat_municipios(text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_visitantes_sin_chat_municipios(p_estado text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH state_code AS (
        SELECT LPAD(REGEXP_REPLACE(COALESCE(p_estado, ''), '\\D', '', 'g'), 2, '0') AS code
    ),
    base AS (
        SELECT b.*
        FROM public.panel_visitantes_sin_chat_base(p_from, p_to) b
        JOIN state_code s ON b.cve_ent = s.code
    ),
    summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cvegeo IS NOT NULL) AS ubicados,
            COUNT(*) FILTER (WHERE cvegeo IS NULL) AS sin_ubicacion
        FROM base
    ),
    grouped AS (
        SELECT
            cvegeo,
            MAX(nom_mun) AS nombre,
            COUNT(*) AS total
        FROM base
        WHERE cvegeo IS NOT NULL
        GROUP BY cvegeo
    ),
    estado_info AS (
        SELECT MAX(cve_ent) AS cve_ent, MAX(nom_ent) AS nombre FROM base
    )
    SELECT jsonb_build_object(
        'estado', jsonb_build_object(
            'cve_ent', COALESCE((SELECT cve_ent FROM estado_info), (SELECT code FROM state_code)),
            'nombre', (SELECT nombre FROM estado_info)
        ),
        'totals', jsonb_build_object(
            'total', COALESCE(summary.total, 0),
            'ubicados', COALESCE(summary.ubicados, 0),
            'sin_ubicacion', COALESCE(summary.sin_ubicacion, 0)
        ),
        'items', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'cvegeo', grouped.cvegeo,
                        'nombre', grouped.nombre,
                        'total', grouped.total,
                        'por_canal', jsonb_build_object('visitantes', grouped.total)
                    )
                    ORDER BY grouped.cvegeo
                ),
                '[]'::jsonb
            )
            FROM grouped
        )
    )
    FROM summary, state_code;
$$;


--
-- Name: panel_visitantes_world_paises(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_visitantes_world_paises(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
WITH base AS (
    SELECT
        w.session_id,
        w.ultimo_evento_en,
        w.geo,
        COALESCE(
            NULLIF(w.geo -> 'ip_lookup' ->> 'country_code', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((w.geo -> 'client') ->> 'country_code', ''),
            NULLIF((w.geo -> 'client') ->> 'country', ''),
            NULLIF(w.geo ->> 'country_code', ''),
            NULLIF(w.geo ->> 'country', '')
        ) AS raw_country,
        COALESCE(
            NULLIF(w.geo -> 'ip_lookup' ->> 'country_name', ''),
            NULLIF((w.geo -> 'client') ->> 'country_name', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((w.geo -> 'client') ->> 'country', '')
        ) AS raw_country_name,
        COALESCE(
            NULLIF(w.geo -> 'ip_lookup' ->> 'latitude', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'lat', ''),
            NULLIF((w.geo -> 'client') ->> 'latitude', ''),
            NULLIF((w.geo -> 'client') ->> 'lat', ''),
            NULLIF(w.geo ->> 'latitude', ''),
            NULLIF(w.geo ->> 'lat', '')
        ) AS raw_lat,
        COALESCE(
            NULLIF(w.geo -> 'ip_lookup' ->> 'longitude', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'lon', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'lng', ''),
            NULLIF((w.geo -> 'client') ->> 'longitude', ''),
            NULLIF((w.geo -> 'client') ->> 'lon', ''),
            NULLIF((w.geo -> 'client') ->> 'lng', ''),
            NULLIF(w.geo ->> 'longitude', ''),
            NULLIF(w.geo ->> 'lon', ''),
            NULLIF(w.geo ->> 'lng', '')
        ) AS raw_lng
    FROM public.webchat_visitantes w
    WHERE (p_from IS NULL OR w.ultimo_evento_en >= p_from)
      AND (p_to IS NULL OR w.ultimo_evento_en <= p_to)
),
normalized AS (
    SELECT
        CASE
            WHEN raw_country IS NULL OR raw_country = '' THEN 'UNK'
            WHEN length(raw_country) = 2 THEN upper(raw_country)
            WHEN length(raw_country) = 3 AND raw_country ~ '^[A-Za-z]{3}$' THEN upper(raw_country)
            ELSE upper(substr(raw_country, 1, 2))
        END AS country_code,
        CASE
            WHEN raw_country_name IS NULL OR raw_country_name = '' THEN NULL
            ELSE raw_country_name
        END AS country_name,
        CASE
            WHEN raw_lat ~ '^[+-]?[0-9]+([.][0-9]+)?$' THEN raw_lat::double precision
            ELSE NULL
        END AS lat,
        CASE
            WHEN raw_lng ~ '^[+-]?[0-9]+([.][0-9]+)?$' THEN raw_lng::double precision
            ELSE NULL
        END AS lng
    FROM base
),
aggregated AS (
    SELECT
        country_code,
        COALESCE(
            MAX(country_name) FILTER (WHERE country_name IS NOT NULL AND country_name <> ''),
            country_code
        ) AS nombre,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL) AS with_coordinates,
        AVG(lat) AS avg_lat,
        AVG(lng) AS avg_lng
    FROM normalized
    GROUP BY country_code
),
summary AS (
    SELECT
        COALESCE(SUM(total), 0) AS total,
        COALESCE(SUM(total) FILTER (WHERE country_code <> 'UNK'), 0) AS ubicados,
        COALESCE(SUM(total) FILTER (WHERE country_code = 'UNK'), 0) AS sin_pais
    FROM aggregated
)
SELECT jsonb_build_object(
    'totals', jsonb_build_object(
        'total', summary.total,
        'ubicados', summary.ubicados,
        'sin_pais', summary.sin_pais
    ),
    'items', COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'country_code', agg.country_code,
                    'nombre', agg.nombre,
                    'total', agg.total,
                    'avg_lat', agg.avg_lat,
                    'avg_lng', agg.avg_lng,
                    'with_coordinates', agg.with_coordinates
                )
                ORDER BY agg.total DESC, agg.country_code
            )
            FROM aggregated agg
        ),
        '[]'::jsonb
    )
)
FROM summary;
$_$;


--
-- Name: panel_webchat_visitas_detalle(timestamp with time zone, timestamp with time zone, boolean, text, text, text, text, text, integer, integer, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, double precision, text, text[], text, text, text, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_webchat_visitas_detalle(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_has_chat boolean DEFAULT NULL::boolean, p_country text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_session text DEFAULT NULL::text, p_ip text DEFAULT NULL::text, p_visit_min integer DEFAULT NULL::integer, p_visit_max integer DEFAULT NULL::integer, p_first_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_first_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_last_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_last_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_stay_min double precision DEFAULT NULL::double precision, p_stay_max double precision DEFAULT NULL::double precision, p_avg_stay_min double precision DEFAULT NULL::double precision, p_avg_stay_max double precision DEFAULT NULL::double precision, p_contact_status text DEFAULT NULL::text, p_device_types text[] DEFAULT NULL::text[], p_referrer text DEFAULT NULL::text, p_landing text DEFAULT NULL::text, p_order_by text DEFAULT NULL::text, p_order_dir text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0) RETURNS TABLE(session_id text, ip text, registrado_en timestamp with time zone, primera_visita_en timestamp with time zone, ultimo_evento_en timestamp with time zone, closed_at timestamp with time zone, stay_seconds double precision, avg_stay_seconds double precision, visit_count integer, total_visitas integer, tuvo_chat boolean, mensajes_entrantes integer, mensajes_salientes integer, primer_mensaje_en timestamp with time zone, ultimo_mensaje_conversacion timestamp with time zone, contacto_id uuid, contacto_nombre text, contacto_correo text, contacto_telefono text, contacto_empresa text, contacto_estado text, contacto_captura text, contacto_creado_en timestamp with time zone, country_code text, country_name text, state_name text, state_code text, city_name text, cve_ent text, nom_ent text, cve_mun text, nom_mun text, cvegeo text, ubicacion_cache jsonb, device_type text, dispositivo_cache jsonb, pantalla_cache jsonb, sistema_operativo text, idioma text, timezone text, prefiere_modo_oscuro boolean, referrer text, landing_url text, trazabilidad_cache jsonb, geo jsonb, total_rows bigint, total_chat_rows bigint, total_no_chat_rows bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH params AS (
    SELECT
        CASE
            WHEN p_state IS NULL OR btrim(p_state) = '' THEN NULL
            ELSE LPAD(REGEXP_REPLACE(p_state, '\D', '', 'g'), 2, '0')
        END AS state_code,
        CASE
            WHEN p_country IS NULL OR btrim(p_country) = '' THEN NULL
            ELSE UPPER(btrim(p_country))
        END AS country_code,
        CASE
            WHEN p_country IS NULL OR btrim(p_country) = '' THEN NULL
            ELSE btrim(p_country)
        END AS country_name,
        CASE
            WHEN p_city IS NULL OR btrim(p_city) = '' THEN NULL
            ELSE btrim(p_city)
        END AS city_name,
        CASE
            WHEN p_session IS NULL OR btrim(p_session) = '' THEN NULL
            ELSE btrim(p_session)
        END AS session_filter,
        CASE
            WHEN p_ip IS NULL OR btrim(p_ip) = '' THEN NULL
            ELSE btrim(p_ip)
        END AS ip_filter,
        CASE WHEN p_visit_min IS NULL THEN NULL ELSE p_visit_min END AS visit_min,
        CASE WHEN p_visit_max IS NULL THEN NULL ELSE p_visit_max END AS visit_max,
        p_first_from AS first_from,
        p_first_to AS first_to,
        p_last_from AS last_from,
        p_last_to AS last_to,
        CASE WHEN p_stay_min IS NULL THEN NULL ELSE p_stay_min END AS stay_min,
        CASE WHEN p_stay_max IS NULL THEN NULL ELSE p_stay_max END AS stay_max,
        CASE WHEN p_avg_stay_min IS NULL THEN NULL ELSE p_avg_stay_min END AS avg_stay_min,
        CASE WHEN p_avg_stay_max IS NULL THEN NULL ELSE p_avg_stay_max END AS avg_stay_max,
        CASE
            WHEN p_contact_status IS NULL OR btrim(p_contact_status) = '' THEN NULL
            ELSE lower(btrim(p_contact_status))
        END AS contact_status,
        CASE
            WHEN p_referrer IS NULL OR btrim(p_referrer) = '' THEN NULL
            ELSE btrim(p_referrer)
        END AS referrer_filter,
        CASE
            WHEN p_landing IS NULL OR btrim(p_landing) = '' THEN NULL
            ELSE btrim(p_landing)
        END AS landing_filter,
        CASE
            WHEN p_device_types IS NULL OR array_length(p_device_types, 1) IS NULL THEN NULL
            ELSE ARRAY(
                SELECT DISTINCT UPPER(btrim(value))
                FROM unnest(p_device_types) AS value
                WHERE value IS NOT NULL AND btrim(value) <> ''
            )
        END AS device_values,
        CASE
            WHEN p_order_by IS NULL OR btrim(p_order_by) = '' THEN 'ultimo'
            WHEN lower(btrim(p_order_by)) IN (
                'session', 'ip', 'visitas', 'primera', 'ultimo', 'stay',
                'avg_stay', 'chat', 'country', 'state', 'city', 'device',
                'referrer', 'landing'
            ) THEN lower(btrim(p_order_by))
            ELSE 'ultimo'
        END AS order_by,
        CASE
            WHEN lower(coalesce(p_order_dir, 'desc')) = 'asc' THEN 'asc'
            ELSE 'desc'
        END AS order_dir
),
base AS (
    SELECT
        w.session_id,
        COALESCE(w.contacto_id, ic.contacto_id) AS contacto_id,
        w.registrado_en,
        w.ultimo_evento_en,
        sc.closed_at,
        w.visit_count,
        w.cve_ent,
        w.nom_ent,
        w.cve_mun,
        w.nom_mun,
        w.cvegeo,
        w.ip,
        w.device_type,
        w.geo,
        w.referrer,
        w.landing_url,
        GREATEST(
            EXTRACT(
                EPOCH FROM (
                    COALESCE(sc.closed_at, w.ultimo_evento_en, w.registrado_en) - w.registrado_en
                )
            ),
            0
        ) AS duration_seconds
    FROM public.webchat_visitantes w
    LEFT JOIN public.identidades_canal ic
        ON ic.canal = 'webchat' AND ic.id_externo = w.session_id
    LEFT JOIN public.webchat_session_closures sc
        ON sc.session_id = w.session_id
),
messages AS (
    SELECT
        datos ->> 'session_id' AS session_id,
        COUNT(*) FILTER (WHERE direccion = 'entrante') AS entrantes,
        COUNT(*) FILTER (WHERE direccion = 'saliente') AS salientes,
        MIN(creado_en) FILTER (WHERE direccion = 'entrante') AS primer_mensaje_en,
        MAX(creado_en) AS ultimo_mensaje_en
    FROM public.mensajes
    WHERE datos ? 'session_id'
    GROUP BY datos ->> 'session_id'
),
contacts AS (
    SELECT
        c.id,
        c.nombre_completo,
        c.correo,
        c.telefono_e164,
        c.company_name,
        c.estado,
        c.captura_estado,
        c.creado_en,
        c.contacto_datos
    FROM public.contactos c
),
geo_unified AS (
    SELECT
        b.*,
        m.entrantes,
        m.salientes,
        m.primer_mensaje_en,
        m.ultimo_mensaje_en,
        ct.id AS contacto_ref,
        ct.nombre_completo,
        ct.correo,
        ct.telefono_e164,
        ct.company_name,
        ct.estado,
        ct.captura_estado,
        ct.creado_en,
        ct.contacto_datos,
        CASE
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'country_code'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'country_code', '')
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'country'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'country', '')
            WHEN (b.geo -> 'client') ? 'country_code'
                THEN NULLIF((b.geo -> 'client') ->> 'country_code', '')
            WHEN (b.geo -> 'client') ? 'country'
                THEN NULLIF((b.geo -> 'client') ->> 'country', '')
            ELSE NULL
        END AS geo_country_code,
        CASE
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'country_name'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'country_name', '')
            WHEN (b.geo -> 'client') ? 'country_name'
                THEN NULLIF((b.geo -> 'client') ->> 'country_name', '')
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'country'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'country', '')
            WHEN (b.geo -> 'client') ? 'country'
                THEN NULLIF((b.geo -> 'client') ->> 'country', '')
            ELSE NULL
        END AS geo_country_name,
        CASE
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'region'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'region', '')
            WHEN (b.geo -> 'client') ? 'region'
                THEN NULLIF((b.geo -> 'client') ->> 'region', '')
            WHEN (b.geo -> 'client') ? 'state'
                THEN NULLIF((b.geo -> 'client') ->> 'state', '')
            ELSE NULL
        END AS geo_region,
        CASE
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'city'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'city', '')
            WHEN (b.geo -> 'client') ? 'city'
                THEN NULLIF((b.geo -> 'client') ->> 'city', '')
            ELSE NULL
        END AS geo_city
    FROM base b
    LEFT JOIN messages m ON m.session_id = b.session_id
    LEFT JOIN contacts ct ON ct.id = b.contacto_id
) ,
result AS (
SELECT
    g.session_id,
    g.ip,
    g.registrado_en,
    g.registrado_en AS primera_visita_en,
    g.ultimo_evento_en,
    g.closed_at,
    g.duration_seconds AS stay_seconds,
    CASE
        WHEN COALESCE(g.visit_count, 0) > 0
            THEN g.duration_seconds / NULLIF(g.visit_count, 0)
        ELSE NULL
    END AS avg_stay_seconds,
    COALESCE(g.visit_count, 0) AS visit_count,
    COALESCE(g.visit_count, 0) AS total_visitas,
    COALESCE(g.entrantes, 0) > 0 AS tuvo_chat,
    COALESCE(g.entrantes, 0) AS mensajes_entrantes,
    COALESCE(g.salientes, 0) AS mensajes_salientes,
    g.primer_mensaje_en,
    g.ultimo_mensaje_en AS ultimo_mensaje_conversacion,
    g.contacto_ref AS contacto_id,
    g.nombre_completo AS contacto_nombre,
    g.correo AS contacto_correo,
    g.telefono_e164 AS contacto_telefono,
    g.company_name AS contacto_empresa,
    g.estado AS contacto_estado,
    g.captura_estado AS contacto_captura,
    g.creado_en AS contacto_creado_en,
    UPPER(
        COALESCE(
            NULLIF(g.geo_country_code, ''),
            NULLIF(g.contacto_datos #>> '{ubicacion,country_code}', ''),
            NULLIF(g.contacto_datos #>> '{ubicacion,country}', '')
        )
    ) AS country_code,
    COALESCE(
        g.geo_country_name,
        g.contacto_datos #>> '{ubicacion,country}',
        g.contacto_datos #>> '{ubicacion,nom_ent}',
        g.contacto_datos #>> '{ubicacion,nom_pais}'
    ) AS country_name,
    CASE
        WHEN UPPER(
            COALESCE(
                NULLIF(g.geo_country_code, ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country_code}', ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country}', '')
            )
        ) = 'MX'
        THEN COALESCE(
            g.nom_ent,
            g.contacto_datos #>> '{ubicacion,nom_ent}',
            g.geo_region
        )
        ELSE COALESCE(
            g.geo_region,
            g.contacto_datos #>> '{ubicacion,region}',
            g.contacto_datos #>> '{ubicacion,nom_ent}'
        )
    END AS state_name,
    CASE
        WHEN UPPER(
            COALESCE(
                NULLIF(g.geo_country_code, ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country_code}', ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country}', '')
            )
        ) = 'MX'
        THEN LPAD(
            COALESCE(
                NULLIF(g.cve_ent, ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,cve_ent}', '')
            ),
            2,
            '0'
        )
        ELSE NULL
    END AS state_code,
    CASE
        WHEN UPPER(
            COALESCE(
                NULLIF(g.geo_country_code, ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country_code}', ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country}', '')
            )
        ) = 'MX'
        THEN COALESCE(
            g.nom_mun,
            g.contacto_datos #>> '{ubicacion,nom_mun}',
            g.geo_city
        )
        ELSE COALESCE(
            g.geo_city,
            g.contacto_datos #>> '{ubicacion,city}',
            g.contacto_datos #>> '{ubicacion,nom_mun}'
        )
    END AS city_name,
    COALESCE(
        LPAD(NULLIF(g.cve_ent, ''), 2, '0'),
        LPAD(NULLIF(g.contacto_datos #>> '{ubicacion,cve_ent}', ''), 2, '0'),
        NULLIF(g.contacto_datos #>> '{cve_ent}', '')
    ) AS cve_ent,
    COALESCE(
        g.nom_ent,
        g.contacto_datos #>> '{ubicacion,nom_ent}',
        g.contacto_datos #>> '{nom_ent}'
    ) AS nom_ent,
    COALESCE(
        LPAD(NULLIF(g.cve_mun, ''), 3, '0'),
        LPAD(NULLIF(g.contacto_datos #>> '{ubicacion,cve_mun}', ''), 3, '0'),
        g.contacto_datos #>> '{cve_mun}'
    ) AS cve_mun,
    COALESCE(
        g.nom_mun,
        g.contacto_datos #>> '{ubicacion,nom_mun}',
        g.contacto_datos #>> '{nom_mun}'
    ) AS nom_mun,
    COALESCE(
        LPAD(NULLIF(g.cvegeo, ''), 5, '0'),
        LPAD(NULLIF(g.contacto_datos #>> '{ubicacion,cvegeo}', ''), 5, '0'),
        g.contacto_datos #>> '{cvegeo}'
    ) AS cvegeo,
    g.contacto_datos -> 'ubicacion' AS ubicacion_cache,
    g.device_type,
    g.contacto_datos -> 'dispositivo' AS dispositivo_cache,
    (g.contacto_datos -> 'dispositivo' -> 'pantalla') AS pantalla_cache,
    NULLIF(g.contacto_datos #>> '{dispositivo,plataforma}', '') AS sistema_operativo,
    NULLIF(g.contacto_datos #>> '{dispositivo,idioma}', '') AS idioma,
    NULLIF(g.contacto_datos #>> '{dispositivo,timezone}', '') AS timezone,
    CASE
        WHEN (g.contacto_datos #>> '{dispositivo,prefiere_modo_oscuro}') IN ('true', '1') THEN true
        WHEN (g.contacto_datos #>> '{dispositivo,prefiere_modo_oscuro}') IN ('false', '0') THEN false
        ELSE NULL
    END AS prefiere_modo_oscuro,
    COALESCE(g.referrer, NULLIF(g.contacto_datos #>> '{trazabilidad,referrer}', '')) AS referrer,
    COALESCE(g.landing_url, NULLIF(g.contacto_datos #>> '{trazabilidad,landing}', '')) AS landing_url,
    g.contacto_datos -> 'trazabilidad' AS trazabilidad_cache,
    g.geo,
    COUNT(*) OVER () AS total_rows,
    COUNT(*) FILTER (WHERE COALESCE(g.entrantes, 0) > 0) OVER () AS total_chat_rows,
    COUNT(*) FILTER (WHERE COALESCE(g.entrantes, 0) = 0) OVER () AS total_no_chat_rows
FROM geo_unified g
CROSS JOIN params pr
WHERE (p_from IS NULL OR COALESCE(g.ultimo_evento_en, g.registrado_en) >= p_from)
  AND (p_to IS NULL OR COALESCE(g.ultimo_evento_en, g.registrado_en) <= p_to)
  AND (
        pr.state_code IS NULL
        OR COALESCE(
            LPAD(NULLIF(g.cve_ent, ''), 2, '0'),
            LPAD(NULLIF(g.contacto_datos #>> '{ubicacion,cve_ent}', ''), 2, '0'),
            NULLIF(g.contacto_datos #>> '{cve_ent}', '')
        ) = pr.state_code
      )
  AND (
        pr.country_code IS NULL
        OR UPPER(
            COALESCE(
                NULLIF(g.geo_country_code, ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country_code}', ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country}', '')
            )
        ) = pr.country_code
        OR (
            pr.country_name IS NOT NULL AND pr.country_name <> '' AND
            COALESCE(
                g.geo_country_name,
                g.contacto_datos #>> '{ubicacion,country}',
                g.contacto_datos #>> '{ubicacion,nom_ent}',
                g.contacto_datos #>> '{ubicacion,nom_pais}'
            ) ILIKE '%' || pr.country_name || '%'
        )
      )
  AND (
        pr.city_name IS NULL
        OR (
            COALESCE(
                g.nom_mun,
                g.contacto_datos #>> '{ubicacion,nom_mun}',
                g.geo_city
            ) ILIKE '%' || pr.city_name || '%'
        )
      )
  AND (
        p_has_chat IS NULL
        OR (p_has_chat IS TRUE AND COALESCE(g.entrantes, 0) > 0)
        OR (p_has_chat IS FALSE AND COALESCE(g.entrantes, 0) = 0)
      )
  AND (
        pr.session_filter IS NULL
        OR g.session_id ILIKE '%' || pr.session_filter || '%'
      )
  AND (
        pr.ip_filter IS NULL
        OR COALESCE(g.ip, '') ILIKE '%' || pr.ip_filter || '%'
      )
  AND (
        pr.visit_min IS NULL
        OR COALESCE(g.visit_count, 0) >= pr.visit_min
      )
  AND (
        pr.visit_max IS NULL
        OR COALESCE(g.visit_count, 0) <= pr.visit_max
      )
  AND (
        pr.first_from IS NULL
        OR g.registrado_en >= pr.first_from
      )
  AND (
        pr.first_to IS NULL
        OR g.registrado_en <= pr.first_to
      )
  AND (
        pr.last_from IS NULL
        OR COALESCE(g.ultimo_evento_en, g.registrado_en) >= pr.last_from
      )
  AND (
        pr.last_to IS NULL
        OR COALESCE(g.ultimo_evento_en, g.registrado_en) <= pr.last_to
      )
  AND (
        pr.stay_min IS NULL
        OR g.duration_seconds >= pr.stay_min
      )
  AND (
        pr.stay_max IS NULL
        OR g.duration_seconds <= pr.stay_max
      )
  AND (
        pr.avg_stay_min IS NULL
        OR (
            CASE
                WHEN COALESCE(g.visit_count, 0) > 0
                    THEN g.duration_seconds / NULLIF(g.visit_count, 0)
                ELSE NULL
            END
        ) >= pr.avg_stay_min
      )
  AND (
        pr.avg_stay_max IS NULL
        OR (
            CASE
                WHEN COALESCE(g.visit_count, 0) > 0
                    THEN g.duration_seconds / NULLIF(g.visit_count, 0)
                ELSE NULL
            END
        ) <= pr.avg_stay_max
      )
  AND (
        pr.contact_status IS NULL
        OR pr.contact_status NOT IN ('completo', 'incompleto', 'sin', 'sin_contacto')
        OR (
            pr.contact_status = 'completo'
            AND (
                COALESCE(lower(g.captura_estado), '') = 'completo'
                OR (
                    COALESCE(btrim(g.correo), '') <> ''
                    AND COALESCE(btrim(g.telefono_e164), '') <> ''
                )
            )
        )
        OR (
            pr.contact_status = 'incompleto'
            AND COALESCE(lower(g.captura_estado), '') = 'incompleto'
        )
        OR (
            pr.contact_status IN ('sin', 'sin_contacto')
            AND g.contacto_ref IS NULL
        )
      )
  AND (
        pr.device_values IS NULL
        OR array_length(pr.device_values, 1) = 0
        OR UPPER(COALESCE(g.device_type, '')) = ANY(pr.device_values)
      )
  AND (
        pr.referrer_filter IS NULL
        OR COALESCE(g.referrer, '') ILIKE '%' || pr.referrer_filter || '%'
      )
  AND (
        pr.landing_filter IS NULL
        OR COALESCE(g.landing_url, '') ILIKE '%' || pr.landing_filter || '%'
      )
  AND (
        p_search IS NULL OR btrim(p_search) = '' OR
        (
            g.session_id ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.nombre_completo, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.correo, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.telefono_e164, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.referrer, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.landing_url, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.ip, '') ILIKE '%' || btrim(p_search) || '%'
        )
      )
)
SELECT r.*
FROM result r
CROSS JOIN params pr
ORDER BY
  CASE WHEN pr.order_by = 'session' AND pr.order_dir = 'asc' THEN r.session_id END ASC,
  CASE WHEN pr.order_by = 'session' AND pr.order_dir = 'desc' THEN r.session_id END DESC,
  CASE WHEN pr.order_by = 'ip' AND pr.order_dir = 'asc' THEN COALESCE(r.ip, '') END ASC,
  CASE WHEN pr.order_by = 'ip' AND pr.order_dir = 'desc' THEN COALESCE(r.ip, '') END DESC,
  CASE WHEN pr.order_by = 'visitas' AND pr.order_dir = 'asc' THEN COALESCE(r.total_visitas, 0) END ASC,
  CASE WHEN pr.order_by = 'visitas' AND pr.order_dir = 'desc' THEN COALESCE(r.total_visitas, 0) END DESC,
  CASE WHEN pr.order_by = 'primera' AND pr.order_dir = 'asc' THEN r.primera_visita_en END ASC,
  CASE WHEN pr.order_by = 'primera' AND pr.order_dir = 'desc' THEN r.primera_visita_en END DESC,
  CASE WHEN pr.order_by = 'ultimo' AND pr.order_dir = 'asc' THEN COALESCE(r.ultimo_evento_en, r.registrado_en) END ASC,
  CASE WHEN pr.order_by = 'ultimo' AND pr.order_dir = 'desc' THEN COALESCE(r.ultimo_evento_en, r.registrado_en) END DESC,
  CASE WHEN pr.order_by = 'stay' AND pr.order_dir = 'asc' THEN COALESCE(r.stay_seconds, 0) END ASC,
  CASE WHEN pr.order_by = 'stay' AND pr.order_dir = 'desc' THEN COALESCE(r.stay_seconds, 0) END DESC,
  CASE WHEN pr.order_by = 'avg_stay' AND pr.order_dir = 'asc' THEN COALESCE(r.avg_stay_seconds, 0) END ASC,
  CASE WHEN pr.order_by = 'avg_stay' AND pr.order_dir = 'desc' THEN COALESCE(r.avg_stay_seconds, 0) END DESC,
  CASE WHEN pr.order_by = 'chat' AND pr.order_dir = 'asc' THEN r.tuvo_chat END ASC,
  CASE WHEN pr.order_by = 'chat' AND pr.order_dir = 'desc' THEN r.tuvo_chat END DESC,
  CASE WHEN pr.order_by = 'country' AND pr.order_dir = 'asc' THEN COALESCE(r.country_name, '') END ASC,
  CASE WHEN pr.order_by = 'country' AND pr.order_dir = 'desc' THEN COALESCE(r.country_name, '') END DESC,
  CASE WHEN pr.order_by = 'state' AND pr.order_dir = 'asc' THEN COALESCE(r.state_name, '') END ASC,
  CASE WHEN pr.order_by = 'state' AND pr.order_dir = 'desc' THEN COALESCE(r.state_name, '') END DESC,
  CASE WHEN pr.order_by = 'city' AND pr.order_dir = 'asc' THEN COALESCE(r.city_name, '') END ASC,
  CASE WHEN pr.order_by = 'city' AND pr.order_dir = 'desc' THEN COALESCE(r.city_name, '') END DESC,
  CASE WHEN pr.order_by = 'device' AND pr.order_dir = 'asc' THEN COALESCE(r.device_type, '') END ASC,
  CASE WHEN pr.order_by = 'device' AND pr.order_dir = 'desc' THEN COALESCE(r.device_type, '') END DESC,
  CASE WHEN pr.order_by = 'referrer' AND pr.order_dir = 'asc' THEN COALESCE(r.referrer, '') END ASC,
  CASE WHEN pr.order_by = 'referrer' AND pr.order_dir = 'desc' THEN COALESCE(r.referrer, '') END DESC,
  CASE WHEN pr.order_by = 'landing' AND pr.order_dir = 'asc' THEN COALESCE(r.landing_url, '') END ASC,
  CASE WHEN pr.order_by = 'landing' AND pr.order_dir = 'desc' THEN COALESCE(r.landing_url, '') END DESC,
  COALESCE(r.ultimo_evento_en, r.registrado_en) DESC,
  r.session_id DESC
LIMIT COALESCE(NULLIF(p_limit, 0), 500)
OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;


--
-- Name: prevent_remove_last_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_remove_last_admin() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
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
-- Name: producto_metadata_schemes_updated_at_trg(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.producto_metadata_schemes_updated_at_trg() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: prospeccion_contacto_envio_resumen(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prospeccion_contacto_envio_resumen(batch_ids uuid[]) RETURNS TABLE(batch_id uuid, estado text, total bigint)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
    if batch_ids is null or array_length(batch_ids, 1) is null then
        return;
    end if;

    return query
    select
        e.batch_id,
        coalesce(nullif(trim(e.estado), ''), 'pendiente') as estado,
        count(*)::bigint as total
    from public.prospeccion_contacto_envio e
    where e.batch_id = any(batch_ids)
    group by e.batch_id, coalesce(nullif(trim(e.estado), ''), 'pendiente');
end;
$$;


--
-- Name: FUNCTION prospeccion_contacto_envio_resumen(batch_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.prospeccion_contacto_envio_resumen(batch_ids uuid[]) IS 'Agrupa envíos por lote y estado para la vista de campañas de prospección.';


--
-- Name: prospeccion_enriquecimiento_resumen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prospeccion_enriquecimiento_resumen() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH org AS (
        SELECT public.usuario_organizacion_id(auth.uid()) AS org_id
    )
    SELECT jsonb_build_object(
        'telefonos_pendientes', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_prospectos p
            JOIN org ON p.organizacion_id = org.org_id
            WHERE COALESCE(p.lookup_status, 'pendiente') = ANY (ARRAY['pendiente','sin_numero','error'])
        ), 0),
        'sin_email', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_prospectos p
            JOIN org ON p.organizacion_id = org.org_id
            WHERE p.email IS NULL OR btrim(p.email) = ''
        ), 0),
        'datos_incompletos', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_prospectos p
            JOIN org ON p.organizacion_id = org.org_id
            WHERE (p.phone IS NULL OR btrim(p.phone) = '')
               OR (p.website IS NULL OR btrim(p.website) = '')
               OR (p.segmento IS NULL OR btrim(p.segmento) = '')
        ), 0)
    );
$$;


--
-- Name: prospeccion_stage_resumen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prospeccion_stage_resumen() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH org AS (
        SELECT public.usuario_organizacion_id(auth.uid()) AS org_id
    )
    SELECT jsonb_build_object(
        'descubre', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.busquedas b
            JOIN org ON b.organizacion_id = org.org_id
            WHERE b.creado_en >= (now() - interval '30 days')
        ), 0),
        'enriquecer', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_prospectos p
            JOIN org ON p.organizacion_id = org.org_id
            WHERE COALESCE(p.lookup_status, 'pendiente') <> 'verificado'
        ), 0),
        'preparar', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_prospectos p
            JOIN org ON p.organizacion_id = org.org_id
            WHERE p.lookup_status = 'verificado'
        ), 0),
        'lanzar', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_contacto_batch c
            JOIN org ON c.organizacion_id = org.org_id
            WHERE c.estado = ANY (ARRAY['pendiente','en_proceso'])
        ), 0),
        'evaluar', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_contacto_batch c
            JOIN org ON c.organizacion_id = org.org_id
            WHERE c.estado = 'completado'
              AND c.creado_en >= (now() - interval '30 days')
        ), 0)
    );
$$;


--
-- Name: puede_ver_contacto(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_ver_contacto(p_contacto_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH scope AS (
    SELECT
        auth.uid() AS uid,
        public.es_admin(auth.uid()) AS es_admin,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id
),
contacto AS (
    SELECT
        c.id,
        c.propietario_usuario_id,
        c.organizacion_id
    FROM public.contactos c
    WHERE c.id = p_contacto_id
)
SELECT EXISTS (
    SELECT 1
    FROM contacto c
    CROSS JOIN scope s
    WHERE c.id IS NOT NULL
      AND (
            s.es_admin
        OR  c.propietario_usuario_id = s.uid
        OR (c.organizacion_id IS NOT NULL AND c.organizacion_id = s.organizacion_id)
      )
);
$$;


--
-- Name: FUNCTION puede_ver_contacto(p_contacto_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.puede_ver_contacto(p_contacto_id uuid) IS 'True cuando el usuario es admin o propietario del contacto o de una tarjeta relacionada.';


--
-- Name: puede_ver_conversacion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_ver_conversacion(p_conversacion_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH scope AS (
    SELECT
        auth.uid() AS uid,
        public.es_admin(auth.uid()) AS es_admin,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id
),
conversation AS (
    SELECT
        c.id,
        c.asignado_a_usuario_id,
        ct.propietario_usuario_id,
        ct.organizacion_id
    FROM public.conversaciones c
    LEFT JOIN public.contactos ct ON ct.id = c.contacto_id
    WHERE c.id = p_conversacion_id
)
SELECT EXISTS (
    SELECT 1
    FROM conversation c
    CROSS JOIN scope s
    WHERE c.id IS NOT NULL
      AND (
            s.es_admin
        OR  c.asignado_a_usuario_id = s.uid
        OR  c.propietario_usuario_id = s.uid
        OR (c.organizacion_id IS NOT NULL AND c.organizacion_id = s.organizacion_id)
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
-- Name: purge_organizacion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_organizacion(p_organizacion_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
    rec record;
    cascade_table text;
    cascade_tables constant text[] := array[
        'public.conversation_summaries',
        'public.conversaciones_insights',
        'public.conversaciones_controles',
        'public.conversaciones',
        'public.contactos',
        'public.prospeccion_contactos_log',
        'public.prospeccion_contacto_envio',
        'public.prospeccion_contacto_batch',
        'public.prospeccion_contacto_templates',
        'public.prospeccion_prospecto_contacto_stats',
        'public.prospeccion_buscador_resultados',
        'public.prospeccion_buscador_jobs',
        'public.webchat_session_closures',
        'public.webchat_visitantes',
        'public.webhooks_entrantes',
        'public.mensajes',
        'public.actividades',
        'public.leads',
        'public.oportunidad_etapas_historial',
        'public.oportunidades',
        'public.cotizacion_items',
        'public.cotizaciones',
        'public.busquedas',
        'public.eventos_entrega'
    ];
begin
    if p_organizacion_id is null then
        raise exception using message = 'organizacion_id_required';
    end if;

    if not exists (select 1 from public.organizaciones where id = p_organizacion_id) then
        raise exception using message = format('organizacion_no_encontrada: %s', p_organizacion_id);
    end if;

    perform set_config('row_security', 'off', true);

    for rec in
        with target_tables as (
            select n.nspname as schema_name, c.relname as table_name
            from pg_attribute a
            join pg_class c on c.oid = a.attrelid
            join pg_namespace n on n.oid = c.relnamespace
            where a.attname = 'organizacion_id'
              and n.nspname = 'public'
              and c.relkind = 'r'
        ),
        fk as (
            select
                child.schema_name as child_schema,
                child.table_name as child_table,
                parent.schema_name as parent_schema,
                parent.table_name as parent_table
            from pg_constraint con
            join pg_class child_c on child_c.oid = con.conrelid
            join pg_namespace child_n on child_n.oid = child_c.relnamespace
            join pg_class parent_c on parent_c.oid = con.confrelid
            join pg_namespace parent_n on parent_n.oid = parent_c.relnamespace
            join target_tables child on child.schema_name = child_n.nspname and child.table_name = child_c.relname
            join target_tables parent on parent.schema_name = parent_n.nspname and parent.table_name = parent_c.relname
            where con.contype = 'f'
        ),
        walk as (
            select schema_name, table_name, 0::int as depth
            from target_tables
            union all
            select fk.parent_schema, fk.parent_table, walk.depth + 1
            from walk
            join fk on fk.child_schema = walk.schema_name and fk.child_table = walk.table_name
        ),
        ordered as (
            select schema_name, table_name, max(depth) as depth
            from walk
            group by schema_name, table_name
        )
        select format('%I.%I', schema_name, table_name) as fqname
        from ordered
        order by depth asc, fqname
    loop
        execute format('delete from %s where organizacion_id = $1', rec.fqname)
        using p_organizacion_id;
    end loop;

    foreach cascade_table in array cascade_tables loop
        execute format('delete from %s where organizacion_id = $1', cascade_table)
        using p_organizacion_id;
    end loop;

    delete from public.organizaciones where id = p_organizacion_id;
end;
$_$;


--
-- Name: FUNCTION purge_organizacion(p_organizacion_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.purge_organizacion(p_organizacion_id uuid) IS 'Elimina todos los registros ligados a una organizacion_id (tablas con columna organizacion_id) y posteriormente borra la organización. Usar con precaución y siempre con respaldo previo.';


--
-- Name: purge_organizacion_preserve_rrhh(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_organizacion_preserve_rrhh(p_organizacion_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
    rec record;
    cascade_table text;
    skip_tables constant text[] := array[
        'public.empleados',
        'public.departamentos',
        'public.puestos',
        'public.identidades_canal',
        'public.etapas_pipeline',
        'public.catalog_items',
        'public.logos',
        'public.panel_calendar_settings',
        'public.panel_email_templates',
        'public.calendar_availability_patterns',
        'public.calendar_resources',
        'public.permisos',
        'public.roles',
        'public.roles_permisos',
        'public.roles_codigo_counters',
        'public.usuarios',
        'public.usuarios_roles',
        'public.quote_templates'
    ];
    cascade_tables constant text[] := array[
        'public.conversation_summaries',
        'public.conversaciones_insights',
        'public.conversaciones_controles',
        'public.conversaciones',
        'public.contactos',
        'public.prospeccion_contactos_log',
        'public.prospeccion_contacto_envio',
        'public.prospeccion_contacto_batch',
        'public.prospeccion_contacto_templates',
        'public.prospeccion_prospecto_contacto_stats',
        'public.prospeccion_buscador_resultados',
        'public.prospeccion_buscador_jobs',
        'public.webchat_session_closures',
        'public.webchat_visitantes',
        'public.webhooks_entrantes',
        'public.mensajes',
        'public.actividades',
        'public.leads',
        'public.oportunidad_etapas_historial',
        'public.oportunidades',
        'public.cotizacion_items',
        'public.cotizaciones',
        'public.busquedas',
        'public.eventos_entrega'
    ];
begin
    if p_organizacion_id is null then
        raise exception using message = 'organizacion_id_required';
    end if;

    if not exists (select 1 from public.organizaciones where id = p_organizacion_id) then
        raise exception using message = format('organizacion_no_encontrada: %s', p_organizacion_id);
    end if;

    perform set_config('row_security', 'off', true);

    for rec in
        with target_tables as (
            select n.nspname as schema_name, c.relname as table_name
            from pg_attribute a
            join pg_class c on c.oid = a.attrelid
            join pg_namespace n on n.oid = c.relnamespace
            where a.attname = 'organizacion_id'
              and n.nspname = 'public'
              and c.relkind = 'r'
            and format('%I.%I', n.nspname, c.relname) <> all(skip_tables)
        ),
        fk as (
            select
                child.schema_name as child_schema,
                child.table_name as child_table,
                parent.schema_name as parent_schema,
                parent.table_name as parent_table
            from pg_constraint con
            join pg_class child_c on child_c.oid = con.conrelid
            join pg_namespace child_n on child_n.oid = child_c.relnamespace
            join pg_class parent_c on parent_c.oid = con.confrelid
            join pg_namespace parent_n on parent_n.oid = parent_c.relnamespace
            join target_tables child on child.schema_name = child_n.nspname and child.table_name = child_c.relname
            join target_tables parent on parent.schema_name = parent_n.nspname and parent.table_name = parent_c.relname
            where con.contype = 'f'
        ),
        walk as (
            select schema_name, table_name, 0::int as depth
            from target_tables
            union all
            select fk.parent_schema, fk.parent_table, walk.depth + 1
            from walk
            join fk on fk.child_schema = walk.schema_name and fk.child_table = walk.table_name
        ),
        ordered as (
            select schema_name, table_name, max(depth) as depth
            from walk
            group by schema_name, table_name
        )
        select format('%I.%I', schema_name, table_name) as fqname
        from ordered
        order by depth asc, fqname
    loop
        execute format('delete from %s where organizacion_id = $1', rec.fqname)
        using p_organizacion_id;
    end loop;

    foreach cascade_table in array cascade_tables loop
        execute format('delete from %s where organizacion_id = $1', cascade_table)
        using p_organizacion_id;
    end loop;
end;
$_$;


--
-- Name: FUNCTION purge_organizacion_preserve_rrhh(p_organizacion_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.purge_organizacion_preserve_rrhh(p_organizacion_id uuid) IS 'Elimina todos los registros asociados a una organizacion_id excepto los módulos de RR.HH. (empleados/departamentos/puestos) y conserva la fila de organizaciones.';


--
-- Name: record_webchat_visitante(text, text, text, jsonb, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_webchat_visitante(p_session_id text, p_ip text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text, p_geo jsonb DEFAULT NULL::jsonb, p_cve_ent text DEFAULT NULL::text, p_nom_ent text DEFAULT NULL::text, p_cve_mun text DEFAULT NULL::text, p_nom_mun text DEFAULT NULL::text, p_cvegeo text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    PERFORM public.record_webchat_visitante(
        p_session_id,
        p_ip,
        p_device_type,
        p_geo,
        p_cve_ent,
        p_nom_ent,
        p_cve_mun,
        p_nom_mun,
        p_cvegeo,
        NULL,
        NULL
    );
END;
$$;


--
-- Name: record_webchat_visitante(text, text, text, jsonb, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_webchat_visitante(p_session_id text, p_ip text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text, p_geo jsonb DEFAULT NULL::jsonb, p_cve_ent text DEFAULT NULL::text, p_nom_ent text DEFAULT NULL::text, p_cve_mun text DEFAULT NULL::text, p_nom_mun text DEFAULT NULL::text, p_cvegeo text DEFAULT NULL::text, p_referrer text DEFAULT NULL::text, p_landing_url text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    INSERT INTO public.webchat_visitantes (
        session_id,
        ip,
        device_type,
        geo,
        cve_ent,
        nom_ent,
        cve_mun,
        nom_mun,
        cvegeo,
        referrer,
        landing_url,
        visit_count,
        registrado_en,
        ultimo_evento_en
    )
    VALUES (
        p_session_id,
        NULLIF(p_ip, ''),
        NULLIF(p_device_type, ''),
        CASE WHEN p_geo IS NULL OR p_geo = '{}'::jsonb THEN NULL ELSE p_geo END,
        NULLIF(p_cve_ent, ''),
        NULLIF(p_nom_ent, ''),
        NULLIF(p_cve_mun, ''),
        NULLIF(p_nom_mun, ''),
        NULLIF(p_cvegeo, ''),
        NULLIF(p_referrer, ''),
        NULLIF(p_landing_url, ''),
        1,
        now(),
        now()
    )
    ON CONFLICT (session_id) DO UPDATE
      SET ip = COALESCE(EXCLUDED.ip, public.webchat_visitantes.ip),
          device_type = COALESCE(EXCLUDED.device_type, public.webchat_visitantes.device_type),
          geo = COALESCE(EXCLUDED.geo, public.webchat_visitantes.geo),
          cve_ent = COALESCE(EXCLUDED.cve_ent, public.webchat_visitantes.cve_ent),
          nom_ent = COALESCE(EXCLUDED.nom_ent, public.webchat_visitantes.nom_ent),
          cve_mun = COALESCE(EXCLUDED.cve_mun, public.webchat_visitantes.cve_mun),
          nom_mun = COALESCE(EXCLUDED.nom_mun, public.webchat_visitantes.nom_mun),
          cvegeo = COALESCE(EXCLUDED.cvegeo, public.webchat_visitantes.cvegeo),
          referrer = COALESCE(EXCLUDED.referrer, public.webchat_visitantes.referrer),
          landing_url = COALESCE(EXCLUDED.landing_url, public.webchat_visitantes.landing_url),
          ultimo_evento_en = now(),
          visit_count = COALESCE(public.webchat_visitantes.visit_count, 0) + 1;
END;
$$;


--
-- Name: record_webchat_visitante(text, text, text, jsonb, text, text, text, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_webchat_visitante(p_session_id text, p_ip text DEFAULT NULL::text, p_device_type text DEFAULT NULL::text, p_geo jsonb DEFAULT NULL::jsonb, p_cve_ent text DEFAULT NULL::text, p_nom_ent text DEFAULT NULL::text, p_cve_mun text DEFAULT NULL::text, p_nom_mun text DEFAULT NULL::text, p_cvegeo text DEFAULT NULL::text, p_referrer text DEFAULT NULL::text, p_landing_url text DEFAULT NULL::text, p_organizacion_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_org uuid;
BEGIN
    v_org := p_organizacion_id;
    IF v_org IS NULL THEN
        BEGIN
            v_org := public.usuario_organizacion_id(auth.uid());
        EXCEPTION
            WHEN others THEN
                v_org := NULL;
        END;
    END IF;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'organizacion_id requerido (no se pudo inferir el tenant)'
            USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.webchat_visitantes (
        session_id,
        ip,
        device_type,
        geo,
        cve_ent,
        nom_ent,
        cve_mun,
        nom_mun,
        cvegeo,
        referrer,
        landing_url,
        visit_count,
        registrado_en,
        ultimo_evento_en,
        organizacion_id
    )
    VALUES (
        p_session_id,
        NULLIF(p_ip, ''),
        NULLIF(p_device_type, ''),
        CASE WHEN p_geo IS NULL OR p_geo = '{}'::jsonb THEN NULL ELSE p_geo END,
        NULLIF(p_cve_ent, ''),
        NULLIF(p_nom_ent, ''),
        NULLIF(p_cve_mun, ''),
        NULLIF(p_nom_mun, ''),
        NULLIF(p_cvegeo, ''),
        NULLIF(p_referrer, ''),
        NULLIF(p_landing_url, ''),
        1,
        now(),
        now(),
        v_org
    )
    ON CONFLICT (organizacion_id, session_id) DO UPDATE
      SET ip = COALESCE(EXCLUDED.ip, public.webchat_visitantes.ip),
          device_type = COALESCE(EXCLUDED.device_type, public.webchat_visitantes.device_type),
          geo = COALESCE(EXCLUDED.geo, public.webchat_visitantes.geo),
          cve_ent = COALESCE(EXCLUDED.cve_ent, public.webchat_visitantes.cve_ent),
          nom_ent = COALESCE(EXCLUDED.nom_ent, public.webchat_visitantes.nom_ent),
          cve_mun = COALESCE(EXCLUDED.cve_mun, public.webchat_visitantes.cve_mun),
          nom_mun = COALESCE(EXCLUDED.nom_mun, public.webchat_visitantes.nom_mun),
          cvegeo = COALESCE(EXCLUDED.cvegeo, public.webchat_visitantes.cvegeo),
          referrer = COALESCE(EXCLUDED.referrer, public.webchat_visitantes.referrer),
          landing_url = COALESCE(EXCLUDED.landing_url, public.webchat_visitantes.landing_url),
          ultimo_evento_en = now(),
          visit_count = COALESCE(public.webchat_visitantes.visit_count, 0) + 1;
END;
$$;


--
-- Name: registrar_mensaje_messenger(text, text, text, text, text, jsonb, integer, jsonb, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_mensaje_messenger(p_sender_id text, p_recipient_id text DEFAULT NULL::text, p_message_id text DEFAULT NULL::text, p_content text DEFAULT NULL::text, p_direction text DEFAULT 'entrante'::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_inactivity_hours integer DEFAULT NULL::integer, p_attachments jsonb DEFAULT '[]'::jsonb, p_response_id text DEFAULT NULL::text, p_organizacion_id uuid DEFAULT NULL::uuid) RETURNS TABLE(conversacion_id uuid, mensaje_id uuid, contacto_id uuid, conversacion_openai_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_contact_id uuid;
    v_contact_org uuid;
    v_conversacion_id uuid;
    v_mensaje_id uuid;
    v_last_activity timestamptz;
    v_conv_openai text;
    v_direction text := lower(COALESCE(NULLIF(p_direction, ''), 'entrante'));
    v_estado text := CASE WHEN v_direction = 'saliente' THEN 'enviada' ELSE 'entregada' END;
    v_now timestamptz := now();
    v_hours integer := COALESCE(p_inactivity_hours, 24);
    v_tipo_contenido text := 'texto';
    v_org uuid := p_organizacion_id;
    v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
    v_message_metadata jsonb;
BEGIN
    IF p_sender_id IS NULL OR length(trim(p_sender_id)) = 0 THEN
        RAISE EXCEPTION 'sender_id requerido';
    END IF;

    IF v_org IS NULL THEN
        RAISE EXCEPTION 'organizacion_id requerido para asignar un tenant';
    END IF;

    SELECT c.id, c.organizacion_id
      INTO v_contact_id, v_contact_org
      FROM public.identidades_canal ic
      JOIN public.contactos c ON c.id = ic.contacto_id
     WHERE ic.canal = 'messenger'
       AND ic.id_externo = p_sender_id
       AND (v_org IS NULL OR c.organizacion_id = v_org)
     ORDER BY ic.creado_en DESC
     LIMIT 1;

    IF FOUND AND v_contact_id IS NOT NULL THEN
        v_org := COALESCE(v_org, v_contact_org);
    END IF;

    IF v_contact_id IS NOT NULL THEN
        SELECT organizacion_id
          INTO v_contact_org
          FROM public.contactos
         WHERE id = v_contact_id
           AND organizacion_id = v_org;

        IF NOT FOUND THEN
            DELETE FROM public.identidades_canal
             WHERE organizacion_id = v_org
               AND canal = 'messenger'
               AND id_externo = p_sender_id;
            v_contact_id := NULL;
        ELSE
            v_org := v_contact_org;
        END IF;
    END IF;

    IF v_contact_id IS NULL THEN
        INSERT INTO public.contactos (nombre_completo, origen, contacto_datos, organizacion_id)
        VALUES (
            'Contacto Messenger',
            'messenger',
            jsonb_build_object(
                'sender_id', p_sender_id,
                'recipient_id', NULLIF(p_recipient_id, ''),
                'message_id', NULLIF(p_message_id, '')
            ),
            v_org
        )
        RETURNING id INTO v_contact_id;

        INSERT INTO public.identidades_canal (
            contacto_id,
            canal,
            id_externo,
            metadatos,
            organizacion_id
        )
        VALUES (
            v_contact_id,
            'messenger',
            p_sender_id,
            jsonb_build_object('recipient_id', NULLIF(p_recipient_id, '')),
            v_org
        )
        ON CONFLICT (organizacion_id, canal, id_externo)
        DO UPDATE
        SET
            metadatos = public.identidades_canal.metadatos || EXCLUDED.metadatos,
            contacto_id = EXCLUDED.contacto_id;
    END IF;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        IF COALESCE(trim(COALESCE(p_content, '')), '') = '' THEN
            v_tipo_contenido := 'medio';
        END IF;
    END IF;

    SELECT c.id, c.ultimo_mensaje_en, c.conversacion_openai_id
      INTO v_conversacion_id, v_last_activity, v_conv_openai
      FROM public.conversaciones AS c
     WHERE c.contacto_id = v_contact_id
       AND c.canal = 'messenger'
       AND c.estado <> 'cerrada'
     ORDER BY c.iniciada_en DESC
     LIMIT 1;

    IF FOUND THEN
        IF v_last_activity IS NULL OR v_last_activity < (v_now - make_interval(hours => v_hours)) THEN
            v_conversacion_id := NULL;
        END IF;
    END IF;

    IF v_conversacion_id IS NULL THEN
        INSERT INTO public.conversaciones (
            contacto_id,
            canal,
            estado,
            iniciada_en,
            ultimo_mensaje_en,
            ultimo_entrante_en
        )
        VALUES (
            v_contact_id,
            'messenger',
            'abierta',
            v_now,
            v_now,
            CASE WHEN v_direction = 'entrante' THEN v_now ELSE NULL END
        )
        RETURNING id INTO v_conversacion_id;
        v_conv_openai := NULL;
    END IF;

    v_message_metadata := jsonb_build_object(
        'sender_id', p_sender_id,
        'recipient_id', NULLIF(p_recipient_id, ''),
        'message_id', NULLIF(p_message_id, ''),
        'direction', v_direction
    )
    || jsonb_build_object('attachments', COALESCE(p_attachments, '[]'::jsonb))
    || v_metadata;

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
        v_tipo_contenido,
        p_content,
        v_message_metadata,
        v_estado,
        v_now,
        0
    )
    RETURNING id INTO v_mensaje_id;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        INSERT INTO public.adjuntos (mensaje_id, url, mime, tamano_bytes, proveedor_id, nombre, size_bytes, path)
        SELECT
            v_mensaje_id,
            NULLIF(elem->>'url', ''),
            NULLIF(elem->>'mime', ''),
            NULLIF(elem->>'size', '')::bigint,
            NULLIF(elem->>'provider_id', ''),
            NULLIF(elem->>'name', ''),
            NULLIF(elem->>'size', '')::bigint,
            NULLIF(elem->>'path', '')
        FROM jsonb_array_elements(p_attachments) AS elem;

        UPDATE public.mensajes
           SET cantidad_medios = (
               SELECT COUNT(*) FROM public.adjuntos WHERE public.adjuntos.mensaje_id = v_mensaje_id
           )
         WHERE id = v_mensaje_id;
    END IF;

    UPDATE public.conversaciones AS c
       SET ultimo_mensaje_en = v_now,
           ultimo_mensaje_id = v_mensaje_id,
           ultimo_entrante_en = CASE WHEN v_direction = 'entrante' THEN v_now ELSE ultimo_entrante_en END,
           ultimo_saliente_en = CASE WHEN v_direction = 'saliente' THEN v_now ELSE ultimo_saliente_en END,
           last_response_id = COALESCE(p_response_id, last_response_id)
     WHERE c.id = v_conversacion_id
     RETURNING c.conversacion_openai_id INTO v_conv_openai;

    RETURN QUERY SELECT v_conversacion_id, v_mensaje_id, v_contact_id, v_conv_openai;
END;
$$;


--
-- Name: FUNCTION registrar_mensaje_messenger(p_sender_id text, p_recipient_id text, p_message_id text, p_content text, p_direction text, p_metadata jsonb, p_inactivity_hours integer, p_attachments jsonb, p_response_id text, p_organizacion_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_mensaje_messenger(p_sender_id text, p_recipient_id text, p_message_id text, p_content text, p_direction text, p_metadata jsonb, p_inactivity_hours integer, p_attachments jsonb, p_response_id text, p_organizacion_id uuid) IS 'Registra mensajes entrantes del canal Messenger y conserva la conversación correspondiente.';


--
-- Name: registrar_mensaje_webchat(text, text, text, text, jsonb, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_mensaje_webchat(p_session_id text, p_author text, p_content text, p_response_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_inactivity_hours integer DEFAULT NULL::integer, p_attachments jsonb DEFAULT '[]'::jsonb) RETURNS TABLE(conversacion_id uuid, mensaje_id uuid, conversacion_openai_id text)
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
    v_last_activity timestamptz;
    v_conv_openai text;
    v_hours integer := COALESCE(p_inactivity_hours, 24);
    v_tipo_contenido text := 'texto';
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
        VALUES (v_contact_id, 'webchat', p_session_id, COALESCE(p_metadata, '{}'::jsonb));
    END IF;

    IF COALESCE(p_author, 'user') = 'user' THEN
        v_direction := 'entrante';
        v_estado := 'entregada';
    ELSE
        v_direction := 'saliente';
        v_estado := 'enviada';
    END IF;

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
            v_conversacion_id := NULL;
        END IF;
    END IF;

    IF v_conversacion_id IS NULL THEN
        INSERT INTO public.conversaciones (
            contacto_id,
            canal,
            estado,
            iniciada_en,
            ultimo_mensaje_en,
            ultimo_entrante_en
        )
        VALUES (
            v_contact_id,
            'webchat',
            'abierta',
            v_now,
            v_now,
            CASE WHEN v_direction = 'entrante' THEN v_now ELSE NULL END
        )
        RETURNING id INTO v_conversacion_id;
        v_conv_openai := NULL;
    END IF;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        IF COALESCE(trim(COALESCE(p_content, '')), '') = '' THEN
            v_tipo_contenido := 'medio';
        END IF;
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
        v_tipo_contenido,
        p_content,
        jsonb_build_object('session_id', p_session_id, 'author', p_author, 'attachments', COALESCE(p_attachments, '[]'::jsonb))
            || COALESCE(p_metadata, '{}'::jsonb),
        v_estado,
        v_now,
        0
    )
    RETURNING id INTO v_mensaje_id;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        INSERT INTO public.adjuntos (mensaje_id, url, mime, tamano_bytes, proveedor_id, nombre, size_bytes, path)
        SELECT
            v_mensaje_id,
            NULLIF(elem->>'url', ''),
            NULLIF(elem->>'mime', ''),
            NULLIF(elem->>'size', '')::bigint,
            NULLIF(elem->>'provider_id', ''),
            NULLIF(elem->>'name', ''),
            NULLIF(elem->>'size', '')::bigint,
            NULLIF(elem->>'path', '')
        FROM jsonb_array_elements(p_attachments) AS elem;

        UPDATE public.mensajes
           SET cantidad_medios = (
               SELECT COUNT(*) FROM public.adjuntos WHERE public.adjuntos.mensaje_id = v_mensaje_id
           )
         WHERE id = v_mensaje_id;
    END IF;

    IF v_direction = 'saliente' THEN
        v_conv_openai := COALESCE(v_conv_openai, NULLIF((p_metadata->>'openai_conversation_id'), ''));
        IF v_conv_openai IS NOT NULL AND position('conv' IN v_conv_openai) = 1 THEN
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
-- Name: FUNCTION registrar_mensaje_webchat(p_session_id text, p_author text, p_content text, p_response_id text, p_metadata jsonb, p_inactivity_hours integer, p_attachments jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_mensaje_webchat(p_session_id text, p_author text, p_content text, p_response_id text, p_metadata jsonb, p_inactivity_hours integer, p_attachments jsonb) IS 'Registra mensajes del webchat con soporte de adjuntos y mantiene la conversación sincronizada.';


--
-- Name: registrar_mensaje_webchat(text, text, text, text, jsonb, integer, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_mensaje_webchat(p_session_id text, p_author text, p_content text, p_response_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_inactivity_hours integer DEFAULT NULL::integer, p_attachments jsonb DEFAULT '[]'::jsonb, p_organizacion_id uuid DEFAULT NULL::uuid) RETURNS TABLE(conversacion_id uuid, mensaje_id uuid, conversacion_openai_id text)
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
    v_last_activity timestamptz;
    v_conv_openai text;
    v_hours integer := COALESCE(p_inactivity_hours, 24);
    v_tipo_contenido text := 'texto';
    v_org uuid := p_organizacion_id;
    v_contact_org uuid;
BEGIN
    IF p_session_id IS NULL OR length(trim(p_session_id)) = 0 THEN
        RAISE EXCEPTION 'session_id requerido';
    END IF;

    IF v_org IS NULL THEN
        BEGIN
            v_org := public.usuario_organizacion_id(auth.uid());
        EXCEPTION
            WHEN others THEN
                v_org := NULL;
        END;
    END IF;

    SELECT c.id, c.organizacion_id
      INTO v_contact_id, v_contact_org
      FROM public.identidades_canal ic
      JOIN public.contactos c ON c.id = ic.contacto_id
     WHERE ic.canal = 'webchat'
       AND ic.id_externo = p_session_id
       AND (v_org IS NULL OR c.organizacion_id = v_org)
     ORDER BY ic.creado_en DESC
     LIMIT 1;

    IF FOUND THEN
        v_org := COALESCE(v_org, v_contact_org);
    END IF;

    IF v_contact_id IS NULL THEN
        IF v_org IS NULL THEN
            RAISE EXCEPTION 'organizacion_id requerido (no se pudo inferir el tenant)'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.contactos (nombre_completo, origen, contacto_datos, organizacion_id)
        VALUES ('Visitante Webchat', 'webchat', jsonb_build_object('session_id', p_session_id), v_org)
        RETURNING id INTO v_contact_id;

        INSERT INTO public.identidades_canal (contacto_id, canal, id_externo, metadatos, organizacion_id)
        VALUES (v_contact_id, 'webchat', p_session_id, COALESCE(p_metadata, '{}'::jsonb), v_org)
        ON CONFLICT (organizacion_id, canal, id_externo) DO UPDATE
        SET contacto_id = EXCLUDED.contacto_id,
            metadatos = EXCLUDED.metadatos;
    END IF;

    IF COALESCE(p_author, 'user') = 'user' THEN
        v_direction := 'entrante';
        v_estado := 'entregada';
    ELSE
        v_direction := 'saliente';
        v_estado := 'enviada';
    END IF;

    SELECT c.id, c.ultimo_mensaje_en, c.conversacion_openai_id
      INTO v_conversacion_id, v_last_activity, v_conv_openai
      FROM public.conversaciones AS c
     WHERE c.contacto_id = v_contact_id
       AND c.canal = 'webchat'
       AND c.estado <> 'cerrada'
     ORDER BY c.iniciada_en DESC
     LIMIT 1;

    IF FOUND THEN
        IF v_last_activity IS NULL OR v_last_activity < (v_now - make_interval(hours => v_hours)) THEN
            v_conversacion_id := NULL;
        END IF;
    END IF;

    IF v_conversacion_id IS NULL THEN
        INSERT INTO public.conversaciones (
            contacto_id,
            canal,
            estado,
            iniciada_en,
            ultimo_mensaje_en,
            ultimo_entrante_en
        )
        VALUES (
            v_contact_id,
            'webchat',
            'abierta',
            v_now,
            v_now,
            CASE WHEN v_direction = 'entrante' THEN v_now ELSE NULL END
        )
        RETURNING id INTO v_conversacion_id;
        v_conv_openai := NULL;
    END IF;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        IF COALESCE(trim(COALESCE(p_content, '')), '') = '' THEN
            v_tipo_contenido := 'medio';
        END IF;
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
        v_tipo_contenido,
        p_content,
        jsonb_build_object('session_id', p_session_id, 'author', p_author, 'attachments', COALESCE(p_attachments, '[]'::jsonb))
            || COALESCE(p_metadata, '{}'::jsonb),
        v_estado,
        v_now,
        0
    )
    RETURNING id INTO v_mensaje_id;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        INSERT INTO public.adjuntos (mensaje_id, url, mime, tamano_bytes, proveedor_id, nombre, size_bytes, path)
        SELECT
            v_mensaje_id,
            NULLIF(elem->>'url', ''),
            NULLIF(elem->>'mime', ''),
            NULLIF(elem->>'size', '')::bigint,
            NULLIF(elem->>'provider_id', ''),
            NULLIF(elem->>'name', ''),
            NULLIF(elem->>'size', '')::bigint,
            NULLIF(elem->>'path', '')
        FROM jsonb_array_elements(p_attachments) AS elem;

        UPDATE public.mensajes
           SET cantidad_medios = (
               SELECT COUNT(*) FROM public.adjuntos WHERE public.adjuntos.mensaje_id = v_mensaje_id
           )
         WHERE id = v_mensaje_id;
    END IF;

    IF v_direction = 'saliente' THEN
        v_conv_openai := COALESCE(v_conv_openai, NULLIF((p_metadata->>'openai_conversation_id'), ''));
        IF v_conv_openai IS NOT NULL AND position('conv' IN v_conv_openai) = 1 THEN
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
-- Name: FUNCTION registrar_mensaje_webchat(p_session_id text, p_author text, p_content text, p_response_id text, p_metadata jsonb, p_inactivity_hours integer, p_attachments jsonb, p_organizacion_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_mensaje_webchat(p_session_id text, p_author text, p_content text, p_response_id text, p_metadata jsonb, p_inactivity_hours integer, p_attachments jsonb, p_organizacion_id uuid) IS 'Registra mensajes del webchat con soporte de adjuntos y respeta el tenant recibido.';


--
-- Name: registrar_mensaje_whatsapp(text, text, text, text, jsonb, text, text, uuid, uuid, text, integer, integer, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_mensaje_whatsapp(p_direction text, p_whatsapp_id text DEFAULT NULL::text, p_phone_e164 text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_message_sid text DEFAULT NULL::text, p_profile_name text DEFAULT NULL::text, p_conversation_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid, p_response_id text DEFAULT NULL::text, p_inactivity_hours integer DEFAULT 24, p_inactivity_minutes integer DEFAULT NULL::integer, p_attachments jsonb DEFAULT '[]'::jsonb, p_webhook_payload jsonb DEFAULT NULL::jsonb) RETURNS TABLE(conversacion_id uuid, mensaje_id uuid, contacto_id uuid, conversacion_openai_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_contact_id uuid;
    v_conversacion_id uuid;
    v_mensaje_id uuid;
    v_now timestamptz := now();
    v_last_activity timestamptz;
    v_conv_openai text;
    v_hours integer := GREATEST(1, COALESCE(p_inactivity_hours, 24));
    v_minutes integer := GREATEST(1, COALESCE(p_inactivity_minutes, v_hours * 60));
    v_tipo_contenido text := 'texto';
    v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
    v_existing record;
    v_webhook_id uuid;
    v_phone_digits text := regexp_replace(COALESCE(p_phone_e164, ''), '[^0-9]', '', 'g');
    v_phone_e164 text := NULL;
    v_country_code text := '52';
    v_mobile_prefix text := '1';
    v_rest text;
BEGIN
    IF p_webhook_payload IS NOT NULL THEN
        INSERT INTO public.webhooks_entrantes (canal, id_solicitud, carga, processed_ok)
        VALUES (
            'whatsapp',
            COALESCE(NULLIF(p_message_sid, ''), NULLIF(p_whatsapp_id, ''), NULLIF(p_phone_e164, '')),
            p_webhook_payload,
            NULL
        )
        RETURNING id INTO v_webhook_id;
    END IF;

    IF p_direction NOT IN ('entrante', 'saliente') THEN
        RAISE EXCEPTION 'Dirección inválida %', p_direction;
    END IF;

    IF p_direction = 'saliente' AND p_conversation_id IS NULL THEN
        RAISE EXCEPTION 'conversation_id requerido para mensajes salientes';
    END IF;

    IF v_phone_digits LIKE '00%' THEN
        v_phone_digits := substring(v_phone_digits FROM 3);
    END IF;
    IF v_phone_digits <> '' THEN
        IF v_phone_digits LIKE v_country_code || '%' THEN
            v_rest := substring(v_phone_digits FROM length(v_country_code) + 1);
            IF NOT v_rest LIKE v_mobile_prefix || '%' THEN
                v_phone_digits := v_country_code || v_mobile_prefix || v_rest;
            END IF;
        ELSIF length(v_phone_digits) = 10 THEN
            v_phone_digits := v_country_code || v_mobile_prefix || v_phone_digits;
        END IF;
        v_phone_e164 := '+' || v_phone_digits;
    END IF;

    IF p_message_sid IS NOT NULL THEN
        SELECT m.conversacion_id, m.id, c.contacto_id, c.conversacion_openai_id
          INTO v_existing
          FROM public.mensajes m
          JOIN public.conversaciones c ON c.id = m.conversacion_id
         WHERE m.twilio_message_sid = p_message_sid
         LIMIT 1;
        IF FOUND THEN
            RETURN QUERY SELECT v_existing.conversacion_id, v_existing.id, v_existing.contacto_id, v_existing.conversacion_openai_id;
            IF v_webhook_id IS NOT NULL THEN
                UPDATE public.webhooks_entrantes
                   SET processed_ok = TRUE,
                       error = NULL
                 WHERE id = v_webhook_id;
            END IF;
            RETURN;
        END IF;
    END IF;

    IF p_contact_id IS NOT NULL THEN
        SELECT id INTO v_contact_id FROM public.contactos WHERE id = p_contact_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Contacto % no existe', p_contact_id;
        END IF;
    END IF;

    IF p_conversation_id IS NOT NULL THEN
        SELECT c.id, c.contacto_id, c.conversacion_openai_id, c.ultimo_mensaje_en
          INTO v_conversacion_id, v_contact_id, v_conv_openai, v_last_activity
          FROM public.conversaciones c
         WHERE c.id = p_conversation_id
           AND c.canal = 'whatsapp'
         LIMIT 1;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La conversación % no pertenece al canal WhatsApp', p_conversation_id;
        END IF;
        IF p_contact_id IS NOT NULL AND v_contact_id <> p_contact_id THEN
            RAISE EXCEPTION 'El contacto % no coincide con la conversación %', p_contact_id, p_conversation_id;
        END IF;
    END IF;

    IF v_phone_digits <> '' THEN
        IF v_phone_digits LIKE '00%' THEN
            v_phone_digits := substring(v_phone_digits FROM 3);
        END IF;
        v_phone_e164 := CASE
            WHEN v_phone_digits <> '' THEN '+' || v_phone_digits
            ELSE NULL
        END;
    END IF;

    IF v_contact_id IS NULL AND COALESCE(p_whatsapp_id, '') <> '' THEN
        SELECT ic.contacto_id
          INTO v_contact_id
          FROM public.identidades_canal AS ic
         WHERE ic.canal = 'whatsapp'
           AND ic.id_externo = p_whatsapp_id
         LIMIT 1;
    END IF;

    IF v_contact_id IS NULL AND v_phone_digits <> '' THEN
        SELECT id
          INTO v_contact_id
          FROM public.contactos
         WHERE regexp_replace(COALESCE(telefono_e164, ''), '[^0-9]', '', 'g') = v_phone_digits
         LIMIT 1;
    END IF;

    IF v_contact_id IS NULL THEN
        INSERT INTO public.contactos (nombre_completo, telefono_e164, origen, contacto_datos)
        VALUES (
            COALESCE(NULLIF(p_profile_name, ''), 'Visitante WhatsApp'),
            v_phone_e164,
            'whatsapp',
            jsonb_build_object('wa_id', p_whatsapp_id, 'profile_name', p_profile_name)
        )
        RETURNING id INTO v_contact_id;
    END IF;

    IF COALESCE(p_whatsapp_id, '') <> '' THEN
        INSERT INTO public.identidades_canal (contacto_id, canal, id_externo, metadatos)
        VALUES (
            v_contact_id,
            'whatsapp',
            p_whatsapp_id,
            jsonb_build_object('telefono', v_phone_e164, 'profile_name', p_profile_name)
        )
        ON CONFLICT (canal, id_externo) DO UPDATE
        SET contacto_id = EXCLUDED.contacto_id,
            metadatos = EXCLUDED.metadatos;
    END IF;

    IF v_conversacion_id IS NULL THEN
        SELECT c.id, c.ultimo_mensaje_en, c.conversacion_openai_id
          INTO v_conversacion_id, v_last_activity, v_conv_openai
          FROM public.conversaciones AS c
         WHERE c.contacto_id = v_contact_id
           AND c.canal = 'whatsapp'
           AND c.estado <> 'cerrada'
         ORDER BY c.iniciada_en DESC
         LIMIT 1;
    END IF;

    IF p_direction = 'entrante' THEN
        IF v_conversacion_id IS NULL OR (
            v_last_activity IS NOT NULL AND v_last_activity < (v_now - make_interval(mins => v_minutes))
        ) THEN
            v_conversacion_id := NULL;
        END IF;
    END IF;

    IF v_conversacion_id IS NULL THEN
        INSERT INTO public.conversaciones (
            contacto_id,
            canal,
            estado,
            iniciada_en,
            ultimo_mensaje_en,
            ultimo_entrante_en
        )
        VALUES (
            v_contact_id,
            'whatsapp',
            'abierta',
            v_now,
            v_now,
            CASE WHEN p_direction = 'entrante' THEN v_now ELSE NULL END
        )
        RETURNING id INTO v_conversacion_id;
        v_conv_openai := NULL;
    END IF;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        IF COALESCE(trim(COALESCE(p_body, '')), '') = '' THEN
            v_tipo_contenido := 'medio';
        END IF;
        v_metadata := v_metadata || jsonb_build_object('attachments', p_attachments);
    END IF;

    INSERT INTO public.mensajes (
        conversacion_id,
        direccion,
        tipo_contenido,
        texto,
        datos,
        proveedor_mensaje_id,
        estado,
        creado_en,
        twilio_message_sid,
        cantidad_medios
    ) VALUES (
        v_conversacion_id,
        p_direction,
        v_tipo_contenido,
        NULLIF(p_body, ''),
        v_metadata,
        p_message_sid,
        CASE WHEN p_direction = 'entrante' THEN 'entregada' ELSE 'enviada' END,
        v_now,
        p_message_sid,
        CASE WHEN jsonb_typeof(p_attachments) = 'array' THEN jsonb_array_length(p_attachments) ELSE 0 END
    )
    RETURNING id INTO v_mensaje_id;

    IF p_direction = 'saliente' THEN
        IF v_metadata ? 'openai_conversation_id' THEN
            v_conv_openai := NULLIF(v_metadata->>'openai_conversation_id', '');
        END IF;
        UPDATE public.conversaciones
           SET conversacion_openai_id = COALESCE(v_conv_openai, public.conversaciones.conversacion_openai_id)
         WHERE id = v_conversacion_id;
    END IF;

    UPDATE public.conversaciones
       SET ultimo_mensaje_en = v_now,
           ultimo_mensaje_id = v_mensaje_id,
           ultimo_entrante_en = CASE WHEN p_direction = 'entrante' THEN v_now ELSE public.conversaciones.ultimo_entrante_en END,
           ultimo_saliente_en = CASE WHEN p_direction = 'saliente' THEN v_now ELSE public.conversaciones.ultimo_saliente_en END,
           last_response_id = COALESCE(p_response_id, public.conversaciones.last_response_id)
     WHERE id = v_conversacion_id
     RETURNING public.conversaciones.conversacion_openai_id INTO v_conv_openai;

    RETURN QUERY SELECT v_conversacion_id, v_mensaje_id, v_contact_id, v_conv_openai;

    IF v_webhook_id IS NOT NULL THEN
        UPDATE public.webhooks_entrantes
           SET processed_ok = TRUE,
               error = NULL
         WHERE id = v_webhook_id;
    END IF;

    RETURN;
EXCEPTION
    WHEN OTHERS THEN
        IF v_webhook_id IS NOT NULL THEN
            UPDATE public.webhooks_entrantes
               SET processed_ok = FALSE,
                   error = left(SQLERRM, 500)
             WHERE id = v_webhook_id;
        END IF;
        RAISE;
END;
$$;


--
-- Name: FUNCTION registrar_mensaje_whatsapp(p_direction text, p_whatsapp_id text, p_phone_e164 text, p_body text, p_metadata jsonb, p_message_sid text, p_profile_name text, p_conversation_id uuid, p_contact_id uuid, p_response_id text, p_inactivity_hours integer, p_inactivity_minutes integer, p_attachments jsonb, p_webhook_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_mensaje_whatsapp(p_direction text, p_whatsapp_id text, p_phone_e164 text, p_body text, p_metadata jsonb, p_message_sid text, p_profile_name text, p_conversation_id uuid, p_contact_id uuid, p_response_id text, p_inactivity_hours integer, p_inactivity_minutes integer, p_attachments jsonb, p_webhook_payload jsonb) IS 'Registra mensajes entrantes o salientes del canal WhatsApp, liga la carga cruda en webhooks_entrantes, controla inactividad en minutos y gestiona la conversación asociada.';


--
-- Name: registrar_mensaje_whatsapp(text, text, text, text, jsonb, text, text, uuid, uuid, text, integer, integer, jsonb, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_mensaje_whatsapp(p_direction text, p_whatsapp_id text DEFAULT NULL::text, p_phone_e164 text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_message_sid text DEFAULT NULL::text, p_profile_name text DEFAULT NULL::text, p_conversation_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid, p_response_id text DEFAULT NULL::text, p_inactivity_hours integer DEFAULT 24, p_inactivity_minutes integer DEFAULT NULL::integer, p_attachments jsonb DEFAULT '[]'::jsonb, p_webhook_payload jsonb DEFAULT NULL::jsonb, p_organizacion_id uuid DEFAULT NULL::uuid) RETURNS TABLE(conversacion_id uuid, mensaje_id uuid, contacto_id uuid, conversacion_openai_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_contact_id uuid;
    v_conversacion_id uuid;
    v_mensaje_id uuid;
    v_now timestamptz := now();
    v_last_activity timestamptz;
    v_conv_openai text;
    v_hours integer := GREATEST(1, COALESCE(p_inactivity_hours, 24));
    v_minutes integer := GREATEST(1, COALESCE(p_inactivity_minutes, v_hours * 60));
    v_tipo_contenido text := 'texto';
    v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
    v_existing record;
    v_webhook_id uuid;
    v_org uuid := p_organizacion_id;
    v_tmp_contact uuid;
    v_tmp_org uuid;
BEGIN
    IF v_org IS NULL AND v_metadata ? 'resolved_organizacion_id' THEN
        BEGIN
            v_org := NULLIF(v_metadata->>'resolved_organizacion_id', '')::uuid;
        EXCEPTION
            WHEN invalid_text_representation THEN
                v_org := NULL;
        END;
    END IF;

    IF v_org IS NOT NULL THEN
        PERFORM set_config('app.current_organizacion_id', v_org::text, true);
    ELSE
        PERFORM set_config('app.current_organizacion_id', '', true);
    END IF;

    IF p_webhook_payload IS NOT NULL THEN
        INSERT INTO public.webhooks_entrantes (canal, id_solicitud, carga, processed_ok, organizacion_id)
        VALUES (
            'whatsapp',
            COALESCE(NULLIF(p_message_sid, ''), NULLIF(p_whatsapp_id, ''), NULLIF(p_phone_e164, '')),
            p_webhook_payload,
            NULL,
            v_org
        )
        RETURNING id INTO v_webhook_id;
    END IF;

    IF p_direction NOT IN ('entrante', 'saliente') THEN
        RAISE EXCEPTION 'Dirección inválida %', p_direction;
    END IF;

    IF p_direction = 'saliente' AND p_conversation_id IS NULL THEN
        RAISE EXCEPTION 'conversation_id requerido para mensajes salientes';
    END IF;

    IF p_message_sid IS NOT NULL THEN
        SELECT m.conversacion_id, m.id, c.contacto_id, c.conversacion_openai_id
          INTO v_existing
          FROM public.mensajes m
          JOIN public.conversaciones c ON c.id = m.conversacion_id
         WHERE m.twilio_message_sid = p_message_sid
         LIMIT 1;
        IF FOUND THEN
            RETURN QUERY SELECT v_existing.conversacion_id, v_existing.id, v_existing.contacto_id, v_existing.conversacion_openai_id;
            IF v_webhook_id IS NOT NULL THEN
                UPDATE public.webhooks_entrantes
                   SET processed_ok = TRUE,
                       error = NULL
                 WHERE id = v_webhook_id;
            END IF;
            RETURN;
        END IF;
    END IF;

    IF p_contact_id IS NOT NULL THEN
        SELECT id, organizacion_id INTO v_tmp_contact, v_tmp_org FROM public.contactos WHERE id = p_contact_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Contacto % no existe', p_contact_id;
        END IF;
        v_contact_id := v_tmp_contact;
        IF v_tmp_org IS NOT NULL THEN
            v_org := v_tmp_org;
            PERFORM set_config('app.current_organizacion_id', v_org::text, true);
        END IF;
    END IF;

    IF p_conversation_id IS NOT NULL THEN
        SELECT c.id, c.contacto_id, c.conversacion_openai_id, c.ultimo_mensaje_en, c.organizacion_id
          INTO v_conversacion_id, v_contact_id, v_conv_openai, v_last_activity, v_tmp_org
          FROM public.conversaciones c
         WHERE c.id = p_conversation_id
           AND c.canal = 'whatsapp'
         LIMIT 1;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La conversación % no pertenece al canal WhatsApp', p_conversation_id;
        END IF;
        IF p_contact_id IS NOT NULL AND v_contact_id <> p_contact_id THEN
            RAISE EXCEPTION 'El contacto % no coincide con la conversación %', p_contact_id, p_conversation_id;
        END IF;
        IF v_tmp_org IS NOT NULL THEN
            v_org := v_tmp_org;
            PERFORM set_config('app.current_organizacion_id', v_org::text, true);
        ELSIF v_contact_id IS NOT NULL THEN
            SELECT organizacion_id INTO v_tmp_org FROM public.contactos WHERE id = v_contact_id;
            IF v_tmp_org IS NOT NULL THEN
                v_org := v_tmp_org;
                PERFORM set_config('app.current_organizacion_id', v_org::text, true);
            END IF;
        END IF;
    END IF;

    IF v_contact_id IS NULL AND COALESCE(p_whatsapp_id, '') <> '' THEN
        SELECT ic.contacto_id, ct.organizacion_id
          INTO v_tmp_contact, v_tmp_org
          FROM public.identidades_canal AS ic
          JOIN public.contactos ct ON ct.id = ic.contacto_id
         WHERE ic.canal = 'whatsapp'
           AND ic.id_externo = p_whatsapp_id
         LIMIT 1;
        IF FOUND THEN
            v_contact_id := v_tmp_contact;
            IF v_tmp_org IS NOT NULL THEN
                v_org := v_tmp_org;
                PERFORM set_config('app.current_organizacion_id', v_org::text, true);
            END IF;
        END IF;
    END IF;

    IF v_contact_id IS NULL AND COALESCE(p_phone_e164, '') <> '' THEN
        SELECT id, organizacion_id
          INTO v_tmp_contact, v_tmp_org
          FROM public.contactos
         WHERE telefono_e164 = p_phone_e164
         LIMIT 1;
        IF FOUND THEN
            v_contact_id := v_tmp_contact;
            IF v_tmp_org IS NOT NULL THEN
                v_org := v_tmp_org;
                PERFORM set_config('app.current_organizacion_id', v_org::text, true);
            END IF;
        END IF;
    END IF;

    IF v_contact_id IS NULL THEN
        IF v_org IS NULL THEN
            RAISE EXCEPTION 'organizacion_id requerido (no se pudo inferir el tenant)'
                USING ERRCODE = '23514';
        END IF;
        INSERT INTO public.contactos (nombre_completo, telefono_e164, origen, contacto_datos, organizacion_id)
        VALUES (
            COALESCE(NULLIF(p_profile_name, ''), 'Visitante WhatsApp'),
            NULLIF(p_phone_e164, ''),
            'whatsapp',
            jsonb_build_object('wa_id', p_whatsapp_id, 'profile_name', p_profile_name),
            v_org
        )
        RETURNING id INTO v_contact_id;
    ELSE
        IF v_org IS NULL THEN
            SELECT organizacion_id INTO v_tmp_org FROM public.contactos WHERE id = v_contact_id;
            IF v_tmp_org IS NOT NULL THEN
                v_org := v_tmp_org;
                PERFORM set_config('app.current_organizacion_id', v_org::text, true);
            END IF;
        END IF;
    END IF;

    IF COALESCE(p_whatsapp_id, '') <> '' THEN
        INSERT INTO public.identidades_canal (contacto_id, canal, id_externo, metadatos, organizacion_id)
        VALUES (
            v_contact_id,
            'whatsapp',
            p_whatsapp_id,
            jsonb_build_object('telefono', p_phone_e164, 'profile_name', p_profile_name),
            v_org
        )
        ON CONFLICT (canal, id_externo) DO UPDATE
        SET contacto_id = EXCLUDED.contacto_id,
            metadatos = EXCLUDED.metadatos,
            organizacion_id = EXCLUDED.organizacion_id;
    END IF;

    IF v_conversacion_id IS NULL THEN
        SELECT c.id, c.ultimo_mensaje_en, c.conversacion_openai_id
          INTO v_conversacion_id, v_last_activity, v_conv_openai
          FROM public.conversaciones AS c
         WHERE c.contacto_id = v_contact_id
           AND c.canal = 'whatsapp'
           AND c.estado <> 'cerrada'
         ORDER BY c.iniciada_en DESC
         LIMIT 1;
    END IF;

    IF p_direction = 'entrante' THEN
        IF v_conversacion_id IS NULL OR (
            v_last_activity IS NOT NULL AND v_last_activity < (v_now - make_interval(mins => v_minutes))
        ) THEN
            v_conversacion_id := NULL;
        END IF;
    END IF;

    IF v_conversacion_id IS NULL THEN
        INSERT INTO public.conversaciones (
            contacto_id,
            canal,
            estado,
            iniciada_en,
            ultimo_mensaje_en,
            ultimo_entrante_en,
            organizacion_id
        )
        VALUES (
            v_contact_id,
            'whatsapp',
            'abierta',
            v_now,
            v_now,
            CASE WHEN p_direction = 'entrante' THEN v_now ELSE NULL END,
            v_org
        )
        RETURNING id INTO v_conversacion_id;
        v_conv_openai := NULL;
    END IF;

    IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 THEN
        IF COALESCE(trim(COALESCE(p_body, '')), '') = '' THEN
            v_tipo_contenido := 'medio';
        END IF;
        v_metadata := v_metadata || jsonb_build_object('attachments', p_attachments);
    END IF;

    INSERT INTO public.mensajes (
        conversacion_id,
        direccion,
        tipo_contenido,
        texto,
        datos,
        proveedor_mensaje_id,
        estado,
        creado_en,
        twilio_message_sid,
        cantidad_medios,
        organizacion_id
    ) VALUES (
        v_conversacion_id,
        p_direction,
        v_tipo_contenido,
        NULLIF(p_body, ''),
        v_metadata,
        p_message_sid,
        CASE WHEN p_direction = 'entrante' THEN 'entregada' ELSE 'enviada' END,
        v_now,
        p_message_sid,
        CASE WHEN jsonb_typeof(p_attachments) = 'array' THEN jsonb_array_length(p_attachments) ELSE 0 END,
        v_org
    )
    RETURNING id INTO v_mensaje_id;

    IF p_direction = 'saliente' THEN
        IF v_metadata ? 'openai_conversation_id' THEN
            v_conv_openai := NULLIF(v_metadata->>'openai_conversation_id', '');
        END IF;
        UPDATE public.conversaciones
           SET conversacion_openai_id = COALESCE(v_conv_openai, public.conversaciones.conversacion_openai_id)
         WHERE id = v_conversacion_id;
    END IF;

    UPDATE public.conversaciones
       SET ultimo_mensaje_en = v_now,
           ultimo_mensaje_id = v_mensaje_id,
           ultimo_entrante_en = CASE WHEN p_direction = 'entrante' THEN v_now ELSE public.conversaciones.ultimo_entrante_en END,
           ultimo_saliente_en = CASE WHEN p_direction = 'saliente' THEN v_now ELSE public.conversaciones.ultimo_saliente_en END,
           last_response_id = COALESCE(p_response_id, public.conversaciones.last_response_id)
     WHERE id = v_conversacion_id
     RETURNING public.conversaciones.conversacion_openai_id INTO v_conv_openai;

    RETURN QUERY SELECT v_conversacion_id, v_mensaje_id, v_contact_id, v_conv_openai;

    IF v_webhook_id IS NOT NULL THEN
        UPDATE public.webhooks_entrantes
           SET processed_ok = TRUE,
               error = NULL
         WHERE id = v_webhook_id;
    END IF;

    RETURN;
EXCEPTION
    WHEN OTHERS THEN
        IF v_webhook_id IS NOT NULL THEN
            UPDATE public.webhooks_entrantes
               SET processed_ok = FALSE,
                   error = left(SQLERRM, 500)
             WHERE id = v_webhook_id;
        END IF;
        RAISE;
END;
$$;


--
-- Name: FUNCTION registrar_mensaje_whatsapp(p_direction text, p_whatsapp_id text, p_phone_e164 text, p_body text, p_metadata jsonb, p_message_sid text, p_profile_name text, p_conversation_id uuid, p_contact_id uuid, p_response_id text, p_inactivity_hours integer, p_inactivity_minutes integer, p_attachments jsonb, p_webhook_payload jsonb, p_organizacion_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_mensaje_whatsapp(p_direction text, p_whatsapp_id text, p_phone_e164 text, p_body text, p_metadata jsonb, p_message_sid text, p_profile_name text, p_conversation_id uuid, p_contact_id uuid, p_response_id text, p_inactivity_hours integer, p_inactivity_minutes integer, p_attachments jsonb, p_webhook_payload jsonb, p_organizacion_id uuid) IS 'Registra mensajes del canal WhatsApp permitiendo especificar el tenant destino.';


--
-- Name: roles_autofill_codigo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.roles_autofill_codigo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_codigo text;
begin
  if new.codigo is null or btrim(new.codigo) = '' then
    v_codigo := public.next_role_codigo(new.organizacion_id);
  else
    v_codigo := lpad(regexp_replace(new.codigo, '\D', '', 'g'), 4, '0');
  end if;
  new.codigo := v_codigo;
  return new;
end;
$$;


--
-- Name: roles_before_insert_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.roles_before_insert_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if exists (
    select 1
    from public.roles
    where organizacion_id = new.organizacion_id
      and codigo = new.codigo
  ) then
    raise exception '[roles] El código % ya existe en la organización %', new.codigo, new.organizacion_id
      using errcode = '23505';
  end if;
  return new;
end;
$$;


--
-- Name: t_set_actualizado_en(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.t_set_actualizado_en() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.actualizado_en = now();
  return new;
end;$$;


--
-- Name: tg_calendar_bookings_sync_stage(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_calendar_bookings_sync_stage() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_tarjeta_id uuid;
    legacy_cards boolean := (to_regclass('public.lead_tarjetas') IS NOT NULL);
BEGIN
    IF NOT legacy_cards THEN
        RETURN NEW;
    END IF;

    v_tarjeta_id := NEW.tarjeta_id;

    IF v_tarjeta_id IS NULL AND NEW.conversacion_id IS NOT NULL THEN
        SELECT lt.id INTO v_tarjeta_id
        FROM public.lead_tarjetas lt
        WHERE lt.conversacion_id = NEW.conversacion_id
        ORDER BY lt.creado_en DESC
        LIMIT 1;
    END IF;

    IF v_tarjeta_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'confirmed' THEN
            PERFORM public.fn_calendar_sync_tarjeta_stage(v_tarjeta_id, 'confirmed', NEW.id);
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            PERFORM public.fn_calendar_sync_tarjeta_stage(v_tarjeta_id, NEW.status, NEW.id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: tg_contactos_auto_asignacion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_contactos_auto_asignacion() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_tenian_datos boolean := FALSE;
    v_tienen_datos boolean := FALSE;
    v_vendedor uuid;
    v_owner uuid;
    v_lead_existe boolean;
    legacy_cards boolean := (to_regclass('public.lead_tarjetas') IS NOT NULL);
BEGIN
    -- Si el contacto proviene de WhatsApp, la tarjeta se crea desde el backend;
    -- no debemos duplicarla desde este trigger pensado para webchat/landing.
    IF COALESCE(NEW.origen, '') = 'whatsapp' THEN
        RETURN NEW;
    END IF;

    v_tienen_datos :=
        (NEW.correo IS NOT NULL AND btrim(NEW.correo) <> '') OR
        (NEW.telefono_e164 IS NOT NULL AND btrim(NEW.telefono_e164) <> '');

    IF NOT v_tienen_datos THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_tenian_datos :=
            (OLD.correo IS NOT NULL AND btrim(OLD.correo) <> '') OR
            (OLD.telefono_e164 IS NOT NULL AND btrim(OLD.telefono_e164) <> '');
        IF v_tenian_datos THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT public.next_vendedor_round_robin() INTO v_vendedor;
    IF v_vendedor IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.propietario_usuario_id IS NULL THEN
        NEW.propietario_usuario_id := v_vendedor;
    END IF;
    v_owner := NEW.propietario_usuario_id;

    IF NOT legacy_cards THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.lead_tarjetas
         WHERE contacto_id = NEW.id
    ) INTO v_lead_existe;

    IF NOT v_lead_existe THEN
        INSERT INTO public.lead_tarjetas (
            contacto_id,
            propietario_usuario_id,
            asignado_a_usuario_id,
            fuente,
            metadata
        )
        VALUES (
            NEW.id,
            COALESCE(v_owner, v_vendedor),
            v_vendedor,
            'contacto_auto',
            jsonb_build_object('auto', true, 'motivo', 'contacto_datos_capturados')
        )
        ON CONFLICT DO NOTHING;
    ELSE
        UPDATE public.lead_tarjetas
           SET asignado_a_usuario_id = COALESCE(asignado_a_usuario_id, v_vendedor),
               propietario_usuario_id = COALESCE(propietario_usuario_id, v_owner, v_vendedor)
         WHERE contacto_id = NEW.id
           AND (asignado_a_usuario_id IS NULL OR propietario_usuario_id IS NULL);
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: tg_contactos_auto_precalificado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_contactos_auto_precalificado() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_tarjeta_id uuid;
BEGIN
    -- Evita trabajo innecesario si los campos relevantes no cambiaron.
    IF TG_OP = 'UPDATE' THEN
        IF COALESCE(NEW.nombre_completo, '') = COALESCE(OLD.nombre_completo, '')
           AND COALESCE(NEW.correo, '') = COALESCE(OLD.correo, '')
           AND COALESCE(NEW.telefono_e164, '') = COALESCE(OLD.telefono_e164, '')
           AND COALESCE(NEW.company_name, '') = COALESCE(OLD.company_name, '') THEN
            RETURN NEW;
        END IF;
    END IF;

    FOR v_tarjeta_id IN
        SELECT lt.id
          FROM public.lead_tarjetas lt
         WHERE lt.contacto_id = NEW.id
    LOOP
        PERFORM public._lead_tarjeta_auto_precalificar(v_tarjeta_id);
    END LOOP;

    RETURN NEW;
END;
$$;


--
-- Name: tg_contactos_captura_estado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_contactos_captura_estado() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.captura_estado := public._contacto_captura_estado(
        NEW.nombre_completo,
        NEW.correo,
        NEW.telefono_e164,
        NEW.notes,
        NEW.necesidad_proposito
    );
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION tg_contactos_captura_estado(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_contactos_captura_estado() IS 'Actualiza captura_estado en contactos al detectar cambios relevantes.';


--
-- Name: tg_conversaciones_auto_tarjeta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_conversaciones_auto_tarjeta() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_tablero uuid;
    v_etapa uuid;
    legacy_cards boolean := (to_regclass('public.lead_tarjetas') IS NOT NULL);
    legacy_boards boolean := (to_regclass('public.lead_tableros') IS NOT NULL);
    legacy_stages boolean := (to_regclass('public.lead_etapas') IS NOT NULL);
BEGIN
    IF NEW.estado = 'cerrada' THEN
        RETURN NEW;
    END IF;

    IF NEW.ultimo_entrante_en IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT (legacy_cards AND legacy_boards AND legacy_stages) THEN
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
       AND COALESCE(metadatos->>'is_counter_only', 'false') <> 'true'
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

COMMENT ON FUNCTION public.tg_conversaciones_auto_tarjeta() IS 'Crea una tarjeta de lead cuando inicia una conversación con interacción entrante.';


--
-- Name: tg_prospeccion_prospectos_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_prospeccion_prospectos_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_actor uuid;
    v_payload jsonb;
    v_prospecto_id uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_payload := to_jsonb(NEW);
        v_prospecto_id := NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_payload := jsonb_build_object(
            'before', to_jsonb(OLD),
            'after', to_jsonb(NEW)
        );
        v_prospecto_id := NEW.id;
    ELSE
        v_payload := to_jsonb(OLD);
        v_prospecto_id := OLD.id;
    END IF;

    v_actor := auth.uid();
    IF v_actor IS NULL THEN
        IF TG_OP = 'INSERT' THEN
            v_actor := NEW.creado_por;
        ELSIF TG_OP = 'UPDATE' THEN
            v_actor := COALESCE(NEW.actualizado_por, OLD.actualizado_por, OLD.creado_por);
        ELSE
            v_actor := COALESCE(OLD.actualizado_por, OLD.creado_por);
        END IF;
    END IF;

    INSERT INTO public.prospeccion_prospectos_audit (prospecto_id, accion, cambios, realizado_por)
    VALUES (v_prospecto_id, lower(TG_OP), v_payload, v_actor);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: tg_prospecto_set_actor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_prospecto_set_actor() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_actor uuid;
BEGIN
    v_actor := auth.uid();

    IF TG_OP = 'INSERT' THEN
        IF v_actor IS NOT NULL THEN
            NEW.creado_por := COALESCE(NEW.creado_por, v_actor);
            NEW.actualizado_por := COALESCE(NEW.actualizado_por, v_actor);
        ELSE
            NEW.actualizado_por := COALESCE(NEW.actualizado_por, NEW.creado_por);
        END IF;
        RETURN NEW;
    END IF;

    IF v_actor IS NOT NULL THEN
        NEW.actualizado_por := v_actor;
    ELSE
        NEW.actualizado_por := COALESCE(NEW.actualizado_por, OLD.actualizado_por, OLD.creado_por);
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: tg_set_eventos_auditoria_organizacion_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_eventos_auditoria_organizacion_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_org uuid;
BEGIN
    IF NEW.organizacion_id IS NOT NULL AND NEW.organizacion_id <> '00000000-0000-0000-0000-000000000001'::uuid THEN
        RETURN NEW;
    END IF;

    IF NEW.actor_usuario_id IS NOT NULL THEN
        SELECT u.organizacion_id INTO v_org
        FROM public.usuarios u
        WHERE u.id = NEW.actor_usuario_id;
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


--
-- Name: tg_set_org_from_contacto_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_org_from_contacto_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: tg_set_org_from_conversacion_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_org_from_conversacion_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: tg_set_org_from_cotizacion_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_org_from_cotizacion_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: tg_set_org_from_lead_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_org_from_lead_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: tg_set_org_from_mensaje_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_org_from_mensaje_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: tg_set_org_from_usuario_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_org_from_usuario_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: tg_set_organizacion_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_organizacion_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_org uuid;
    v_row jsonb;
    v_metadata jsonb;
    v_metadata_org text;
BEGIN
    IF NEW.organizacion_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_row := row_to_json(NEW)::jsonb;
    v_metadata := COALESCE(
        v_row -> 'metadata',
        v_row -> 'metadatos',
        v_row -> 'meta',
        '{}'::jsonb
    );

    v_metadata_org := (v_metadata ->> 'organizacion_id')::text;
    IF v_metadata_org IS NOT NULL AND v_metadata_org <> '' THEN
        BEGIN
            v_org := v_metadata_org::uuid;
        EXCEPTION
            WHEN invalid_text_representation THEN
                v_org := NULL;
        END;
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

    IF v_org IS NULL THEN
        RAISE EXCEPTION 'organizacion_id requerido (no se pudo inferir el tenant)'
            USING ERRCODE = '23514';
    END IF;

    NEW.organizacion_id := v_org;
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION tg_set_organizacion_id(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_set_organizacion_id() IS 'Asigna organizacion_id primero desde metadata cuando existe, luego desde auth.uid().';


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_row jsonb := to_jsonb(NEW);
BEGIN
    IF v_row ? 'actualizado_en' THEN
        NEW.actualizado_en := now();
    ELSIF v_row ? 'updated_at' THEN
        NEW.updated_at := now();
    ELSE
        RAISE EXCEPTION
            'tg_touch_updated_at: la tabla %.% no tiene columnas actualizado_en ni updated_at',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION tg_touch_updated_at(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_touch_updated_at() IS 'Actualiza la columna actualizado_en o updated_at al momento actual, según exista.';


--
-- Name: touch_conversaciones_controles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_conversaciones_controles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
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
    SET search_path TO 'public', 'pg_temp'
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
    SET search_path TO 'public', 'pg_temp'
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
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.tsv :=
    setweight(to_tsvector('spanish', coalesce(unaccent(new.name),'')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(unaccent(new.actividad),'')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(unaccent(new.address),'')), 'C');
  return new;
end$$;


--
-- Name: upsert_resultados_lote(uuid, public.fuente_resultado, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_resultados_lote(p_busqueda_id uuid, p_fuente public.fuente_resultado, p_items jsonb, p_organizacion_id uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public, pg_temp'
    AS $$
declare
    v_count int := 0;
    v_it jsonb;
    v_organizacion uuid := p_organizacion_id;
    v_header text;
begin
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RETURN 0;
    END IF;

    IF v_organizacion IS NULL THEN
        BEGIN
            v_header := NULLIF(current_setting('request.headers.x-organizacion-id', true), '');
            IF v_header IS NOT NULL THEN
                v_organizacion := v_header::uuid;
            END IF;
        EXCEPTION WHEN others THEN
            v_organizacion := NULL;
        END;
    END IF;

    FOR v_it IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.resultados (
            busqueda_id,
            fuente,
            external_id,
            clee,
            name,
            razon_social,
            actividad,
            estrato,
            phone,
            email,
            website,
            address,
            lat,
            lng,
            rating,
            reviews,
            maps_url,
            organizacion_id,
            raw
        )
        VALUES (
            p_busqueda_id,
            p_fuente,
            COALESCE(v_it ->> 'external_id', v_it ->> 'id'),
            v_it ->> 'clee',
            v_it ->> 'name',
            v_it ->> 'razon_social',
            v_it ->> 'actividad',
            v_it ->> 'estrato',
            v_it ->> 'phone',
            v_it ->> 'email',
            v_it ->> 'website',
            v_it ->> 'address',
            NULLIF(v_it ->> 'lat', '')::double precision,
            NULLIF(v_it ->> 'lng', '')::double precision,
            NULLIF(v_it ->> 'rating', '')::numeric,
            NULLIF(v_it ->> 'reviews', '')::int,
            COALESCE(v_it ->> 'maps_url', v_it ->> 'maps'),
            v_organizacion,
            v_it
        )
        ON CONFLICT (busqueda_id, fuente, external_id) DO UPDATE
        SET name = EXCLUDED.name,
            razon_social = EXCLUDED.razon_social,
            actividad = EXCLUDED.actividad,
            estrato = EXCLUDED.estrato,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            website = EXCLUDED.website,
            address = EXCLUDED.address,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            rating = EXCLUDED.rating,
            reviews = EXCLUDED.reviews,
            maps_url = EXCLUDED.maps_url,
            raw = EXCLUDED.raw;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
end;
$$;


--
-- Name: usuario_organizacion_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.usuario_organizacion_id(p_uid uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT organizacion_id
    FROM public.usuarios
    WHERE id = p_uid
    LIMIT 1;
$$;


--
-- Name: FUNCTION usuario_organizacion_id(p_uid uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.usuario_organizacion_id(p_uid uuid) IS 'Obtiene la organización del usuario autenticado para políticas RLS.';


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
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
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
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


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
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


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
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
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
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


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
-- Name: actividades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.actividades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    tipo text NOT NULL,
    canal text,
    asunto text,
    descripcion text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    prioridad text DEFAULT 'media'::text NOT NULL,
    fecha_vencimiento timestamp with time zone,
    inicio_en timestamp with time zone,
    fin_en timestamp with time zone,
    sla_horas integer,
    recordatorio_en timestamp with time zone,
    cuenta_id uuid,
    contacto_id uuid,
    oportunidad_id uuid,
    creado_por_usuario_id uuid,
    asignado_a_usuario_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.actividades FORCE ROW LEVEL SECURITY;


--
-- Name: adjuntos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adjuntos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mensaje_id uuid NOT NULL,
    url text,
    mime text,
    tamano_bytes bigint,
    proveedor_id text,
    nombre text,
    size_bytes bigint,
    path text,
    creado_en timestamp with time zone DEFAULT now(),
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.adjuntos FORCE ROW LEVEL SECURITY;


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
    organizacion_id uuid NOT NULL,
    CONSTRAINT agentes_canal_check CHECK ((canal = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'webchat'::text, 'voz'::text, 'api'::text])))
);

ALTER TABLE ONLY public.agentes FORCE ROW LEVEL SECURITY;


--
-- Name: archivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archivos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    relacion_tipo text NOT NULL,
    relacion_id uuid NOT NULL,
    nombre_original text NOT NULL,
    content_type text,
    tamano_bytes bigint,
    storage_path text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    subido_por_usuario_id uuid,
    subido_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.archivos FORCE ROW LEVEL SECURITY;


--
-- Name: asignaciones_vendedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asignaciones_vendedores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversacion_id uuid NOT NULL,
    oportunidad_id uuid,
    contacto_id uuid,
    organizacion_id uuid NOT NULL,
    vendedor_usuario_id uuid NOT NULL,
    trigger_event text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    notificacion_message_sid text,
    aceptado_en timestamp with time zone,
    aceptado_por_usuario_id uuid,
    aceptado_via text,
    canal text NOT NULL
);


--
-- Name: TABLE asignaciones_vendedores; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.asignaciones_vendedores IS 'Auditoría de notificaciones enviadas a vendedores desde cualquier canal.';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    usuario_id uuid,
    accion text NOT NULL,
    tabla text NOT NULL,
    registro_id uuid,
    cambios jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip text,
    user_agent text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.audit_logs FORCE ROW LEVEL SECURITY;


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
    creado_por uuid DEFAULT auth.uid(),
    organizacion_id uuid NOT NULL,
    metadata jsonb GENERATED ALWAYS AS (COALESCE(meta, '{}'::jsonb)) STORED
);

ALTER TABLE ONLY public.busquedas FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN busquedas.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.busquedas.metadata IS 'Alias para compatibilidad con triggers y funciones que esperan metadata.';


--
-- Name: calendar_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_id uuid NOT NULL,
    hold_id uuid,
    contact_id uuid,
    conversacion_id uuid,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    timezone text NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    notes text,
    meeting_url text,
    external_join_url text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    tarjeta_id uuid,
    organizacion_id uuid NOT NULL,
    CONSTRAINT calendar_bookings_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'cancelled'::text]))),
    CONSTRAINT calendar_bookings_time_check CHECK ((end_at > start_at))
);

ALTER TABLE ONLY public.calendar_bookings FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE calendar_bookings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.calendar_bookings IS 'Citas confirmadas que Tal-IA agenda desde el webchat.';


--
-- Name: calendar_slot_holds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_slot_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_id uuid NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    contact_id uuid,
    conversacion_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    tarjeta_id uuid,
    organizacion_id uuid NOT NULL,
    CONSTRAINT calendar_slot_holds_status_check CHECK ((status = ANY (ARRAY['active'::text, 'confirmed'::text, 'released'::text, 'expired'::text]))),
    CONSTRAINT calendar_slot_holds_time_check CHECK ((end_at > start_at))
);

ALTER TABLE ONLY public.calendar_slot_holds FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE calendar_slot_holds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.calendar_slot_holds IS 'Reservas temporales mientras el visitante confirma la cita.';


--
-- Name: campanas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campanas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    nombre text NOT NULL,
    tipo text,
    canal text,
    presupuesto numeric(14,2),
    fecha_inicio date,
    fecha_fin date,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.campanas FORCE ROW LEVEL SECURITY;


--
-- Name: catalog_document_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_document_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    contenido text NOT NULL,
    embedding public.vector(1536) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT catalog_document_embeddings_entity_type_check CHECK ((entity_type = ANY (ARRAY['producto'::text, 'familia'::text, 'linea'::text, 'modelo'::text, 'recurso'::text])))
);


--
-- Name: catalog_embeddings_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_embeddings_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    tipo text NOT NULL,
    canal text,
    usuario_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT catalog_embeddings_audit_tipo_check CHECK ((tipo = ANY (ARRAY['reindex'::text, 'query'::text])))
);


--
-- Name: catalog_item_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_item_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    etiqueta text,
    moneda character(3) DEFAULT 'MXN'::bpchar NOT NULL,
    unidad text DEFAULT 'unidad'::text NOT NULL,
    precio numeric(14,2) NOT NULL,
    descuento_porcentaje numeric(5,2),
    canal text,
    segmento text,
    vigente_desde date,
    vigente_hasta date,
    es_principal boolean DEFAULT false NOT NULL,
    metadatos jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL,
    CONSTRAINT catalog_item_prices_descuento_check CHECK (((descuento_porcentaje IS NULL) OR ((descuento_porcentaje >= (0)::numeric) AND (descuento_porcentaje <= (100)::numeric)))),
    CONSTRAINT catalog_item_prices_moneda_check CHECK ((char_length(moneda) = 3)),
    CONSTRAINT catalog_item_prices_precio_check CHECK ((precio >= (0)::numeric))
);

ALTER TABLE ONLY public.catalog_item_prices FORCE ROW LEVEL SECURITY;


--
-- Name: catalog_item_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_item_tags (
    item_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    agregado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.catalog_item_tags FORCE ROW LEVEL SECURITY;


--
-- Name: catalog_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text,
    nombre text NOT NULL,
    tipo public.catalog_item_tipo DEFAULT 'servicio'::public.catalog_item_tipo NOT NULL,
    descripcion_corta text,
    descripcion_larga text,
    unidad text DEFAULT 'unidad'::text NOT NULL,
    precio_base numeric(14,2),
    moneda character(3) DEFAULT 'MXN'::bpchar NOT NULL,
    impuestos jsonb DEFAULT '[]'::jsonb NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    requiere_factura boolean DEFAULT false NOT NULL,
    clave_sat text,
    unidad_sat text,
    metadatos jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    updated_by uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL,
    linea_id uuid,
    familia_id uuid,
    modelo_id uuid,
    metadata jsonb GENERATED ALWAYS AS (COALESCE(metadatos, '{}'::jsonb)) STORED,
    metadatos_extra jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT catalog_items_moneda_check CHECK ((char_length(moneda) = 3)),
    CONSTRAINT catalog_items_precio_check CHECK (((precio_base IS NULL) OR (precio_base >= (0)::numeric)))
);

ALTER TABLE ONLY public.catalog_items FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE catalog_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.catalog_items IS 'Listado administrable de productos, servicios o paquetes disponibles para cotizar.';


--
-- Name: COLUMN catalog_items.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.catalog_items.slug IS 'Identificador legible para URLs o integraciones.';


--
-- Name: COLUMN catalog_items.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.catalog_items.tipo IS 'Clasificación general (producto, servicio o paquete).';


--
-- Name: COLUMN catalog_items.unidad; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.catalog_items.unidad IS 'Unidad de medida mostrada en cotizaciones.';


--
-- Name: COLUMN catalog_items.precio_base; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.catalog_items.precio_base IS 'Precio sugerido por unidad antes de descuentos.';


--
-- Name: COLUMN catalog_items.impuestos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.catalog_items.impuestos IS 'Lista JSON de impuestos aplicables (ej. IVA, ISR).';


--
-- Name: COLUMN catalog_items.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.catalog_items.metadata IS 'Alias legible para compatibilidad con triggers que esperan la columna metadata.';


--
-- Name: COLUMN catalog_items.metadatos_extra; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.catalog_items.metadatos_extra IS 'Metadatos volumétricos y específicos de unidad que no deben mezclarse con el catálogo principal.';


--
-- Name: catalog_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    nombre text NOT NULL,
    color text,
    descripcion text,
    metadatos jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.catalog_tags FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE catalog_tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.catalog_tags IS 'Etiquetas reutilizables para segmentar productos/servicios.';


--
-- Name: cliente_documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_documentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    tipo public.cliente_documento_tipo NOT NULL,
    estado public.cliente_documento_estado DEFAULT 'pendiente'::public.cliente_documento_estado NOT NULL,
    descripcion text,
    storage_path text,
    storage_url text,
    cargado_por uuid,
    cargado_en timestamp with time zone DEFAULT now() NOT NULL,
    validado_por uuid,
    validado_en timestamp with time zone,
    metadatos jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL,
    cuenta_id uuid,
    oportunidad_id uuid
);

ALTER TABLE ONLY public.cliente_documentos REPLICA IDENTITY FULL;

ALTER TABLE ONLY public.cliente_documentos FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE cliente_documentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cliente_documentos IS 'Documentos fiscales/legales requeridos durante el onboarding del cliente.';


--
-- Name: COLUMN cliente_documentos.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cliente_documentos.tipo IS 'Tipo de documento solicitado (constancia fiscal, comprobante, NDA, etc.).';


--
-- Name: COLUMN cliente_documentos.estado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cliente_documentos.estado IS 'Estatus de recepción/validación del documento.';


--
-- Name: COLUMN cliente_documentos.storage_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cliente_documentos.storage_path IS 'Ruta interna en el bucket de storage para el documento.';


--
-- Name: COLUMN cliente_documentos.storage_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cliente_documentos.storage_url IS 'URL accesible (firmada o pública) del documento almacenado.';


--
-- Name: cliente_portal_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_portal_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    token text NOT NULL,
    expira_en timestamp with time zone,
    ultimo_acceso_en timestamp with time zone,
    ultimo_acceso_ip inet,
    usos integer DEFAULT 0 NOT NULL,
    revocado boolean DEFAULT false NOT NULL,
    nota text,
    creado_por uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL,
    cuenta_id uuid,
    oportunidad_id uuid
);

ALTER TABLE ONLY public.cliente_portal_tokens REPLICA IDENTITY FULL;

ALTER TABLE ONLY public.cliente_portal_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE cliente_portal_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cliente_portal_tokens IS 'Tokens firmados para que los clientes completen su onboarding en un portal dedicado.';


--
-- Name: COLUMN cliente_portal_tokens.token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cliente_portal_tokens.token IS 'Se comparte una sola vez; funciona como llave del portal.';


--
-- Name: COLUMN cliente_portal_tokens.expira_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cliente_portal_tokens.expira_en IS 'Fecha límite para reutilizar el enlace.';


--
-- Name: COLUMN cliente_portal_tokens.ultimo_acceso_ip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cliente_portal_tokens.ultimo_acceso_ip IS 'IP más reciente registrada al abrir el portal.';


--
-- Name: cliente_responsables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_responsables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    nombre text NOT NULL,
    correo text,
    telefono_e164 text,
    rol text,
    es_responsable_principal boolean DEFAULT false NOT NULL,
    metadatos jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL,
    cuenta_id uuid,
    oportunidad_id uuid
);

ALTER TABLE ONLY public.cliente_responsables REPLICA IDENTITY FULL;

ALTER TABLE ONLY public.cliente_responsables FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE cliente_responsables; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cliente_responsables IS 'Personas de contacto responsables del proyecto y la implementación.';


--
-- Name: COLUMN cliente_responsables.es_responsable_principal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cliente_responsables.es_responsable_principal IS 'Marca si es el contacto principal del proyecto.';


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
    company_name text,
    notes text,
    necesidad_proposito text,
    captura_estado text DEFAULT 'incompleto'::text NOT NULL,
    organizacion_id uuid NOT NULL,
    cuenta_id uuid,
    CONSTRAINT contactos_captura_estado_check CHECK ((captura_estado = ANY (ARRAY['incompleto'::text, 'completo'::text]))),
    CONSTRAINT contactos_estado_check CHECK ((estado = ANY (ARRAY['lead'::text, 'activo'::text, 'bloqueado'::text])))
);

ALTER TABLE ONLY public.contactos FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE contactos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contactos IS 'Los triggers legacy que sincronizaban lead_tarjetas fueron deshabilitados; la captura se maneja desde el backend CRM.';


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
    organizacion_id uuid NOT NULL,
    restart_sequence integer DEFAULT 1 NOT NULL,
    CONSTRAINT conversaciones_canal_check CHECK ((canal = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'webchat'::text, 'voz'::text, 'manual'::text, 'messenger'::text]))),
    CONSTRAINT conversaciones_estado_check CHECK ((estado = ANY (ARRAY['abierta'::text, 'pendiente'::text, 'cerrada'::text])))
);

ALTER TABLE ONLY public.conversaciones FORCE ROW LEVEL SECURITY;


--
-- Name: conversaciones_controles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversaciones_controles (
    conversacion_id uuid NOT NULL,
    manual_override boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.conversaciones_controles FORCE ROW LEVEL SECURITY;


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
    organizacion_id uuid NOT NULL,
    CONSTRAINT usuarios_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'inactivo'::text]))),
    CONSTRAINT usuarios_telefono_e164_check CHECK ((telefono_e164 ~ '^\+[0-9]{7,15}$'::text))
);

ALTER TABLE ONLY public.usuarios FORCE ROW LEVEL SECURITY;


--
-- Name: conversaciones_en_curso; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.conversaciones_en_curso WITH (security_invoker='true') AS
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
    organizacion_id uuid NOT NULL,
    CONSTRAINT conversaciones_insights_sentimiento_check CHECK (((sentimiento = ANY (ARRAY['positivo'::text, 'neutral'::text, 'negativo'::text])) OR (sentimiento IS NULL)))
);

ALTER TABLE ONLY public.conversaciones_insights FORCE ROW LEVEL SECURITY;


--
-- Name: conversation_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversacion_id uuid NOT NULL,
    contacto_id uuid,
    organizacion_id uuid NOT NULL,
    tipo text DEFAULT 'conversation'::text NOT NULL,
    resumen text NOT NULL,
    metadatos jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_por_usuario_id uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.conversation_summaries FORCE ROW LEVEL SECURITY;


--
-- Name: cotizacion_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizacion_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cotizacion_id uuid NOT NULL,
    producto_id uuid,
    descripcion text NOT NULL,
    cantidad numeric(12,2) DEFAULT 1 NOT NULL,
    precio_unitario numeric(14,2),
    descuento_porcentaje numeric(5,2),
    subtotal numeric(14,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.cotizacion_items FORCE ROW LEVEL SECURITY;


--
-- Name: cotizaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    oportunidad_id uuid,
    cuenta_id uuid,
    contacto_id uuid,
    estatus text DEFAULT 'borrador'::text NOT NULL,
    total numeric(14,2),
    moneda character(3) DEFAULT 'MXN'::bpchar NOT NULL,
    valida_hasta date,
    creada_por_usuario_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.cotizaciones FORCE ROW LEVEL SECURITY;


--
-- Name: cuentas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    nombre text NOT NULL,
    alias text,
    tipo text,
    industria text,
    tamano text,
    sitio_web text,
    telefono text,
    correo text,
    direccion jsonb DEFAULT '{}'::jsonb NOT NULL,
    propietario_usuario_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.cuentas FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE cuentas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cuentas IS 'Empresas (prospectos/clientes) dentro del CRM multi-tenant.';


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
    organizacion_id uuid NOT NULL,
    CONSTRAINT custom_fields_data_type_check CHECK ((data_type = ANY (ARRAY['string'::text, 'number'::text, 'boolean'::text, 'enum'::text, 'date'::text, 'json'::text]))),
    CONSTRAINT custom_fields_entidad_check CHECK ((entidad = 'contacto'::text))
);

ALTER TABLE ONLY public.custom_fields FORCE ROW LEVEL SECURITY;


--
-- Name: departamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    departamento_padre_id uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.departamentos FORCE ROW LEVEL SECURITY;


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
    error text,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.ejecuciones_asistente FORCE ROW LEVEL SECURITY;


--
-- Name: empleados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empleados (
    usuario_id uuid NOT NULL,
    departamento_id uuid,
    es_gestor boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    puesto_id uuid,
    es_vendedor boolean DEFAULT false NOT NULL,
    ultimo_lead_asignado_en timestamp with time zone,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.empleados FORCE ROW LEVEL SECURITY;


--
-- Name: etapas_pipeline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etapas_pipeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    orden smallint NOT NULL,
    probabilidad numeric(5,2),
    categoria text DEFAULT 'abierta'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.etapas_pipeline FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE etapas_pipeline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.etapas_pipeline IS 'Incluye seeds automáticos (metadata.seed = default_stage) cuando falta el catálogo básico.';


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
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.eventos_auditoria FORCE ROW LEVEL SECURITY;


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
    organizacion_id uuid NOT NULL,
    CONSTRAINT eventos_entrega_evento_check CHECK ((evento = ANY (ARRAY['en_cola'::text, 'enviado'::text, 'entregado'::text, 'leido'::text, 'fallido'::text])))
);

ALTER TABLE ONLY public.eventos_entrega FORCE ROW LEVEL SECURITY;


--
-- Name: familias_productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.familias_productos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    linea_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
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
    organizacion_id uuid NOT NULL,
    CONSTRAINT identidades_canal_canal_check CHECK ((canal = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'webchat'::text, 'voz'::text, 'messenger'::text])))
);

ALTER TABLE ONLY public.identidades_canal FORCE ROW LEVEL SECURITY;


--
-- Name: lead_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    tipo text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    registrado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.lead_eventos FORCE ROW LEVEL SECURITY;


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    campana_id uuid,
    contacto_id uuid,
    cuenta_id uuid,
    origen text,
    estado text DEFAULT 'nuevo'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    convertido_a_contacto_id uuid,
    convertido_a_cuenta_id uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.leads FORCE ROW LEVEL SECURITY;


--
-- Name: lineas_de_negocio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lineas_de_negocio (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
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
    organizacion_id uuid NOT NULL,
    CONSTRAINT llamadas_direccion_check CHECK ((direccion = ANY (ARRAY['entrante'::text, 'saliente'::text])))
);

ALTER TABLE ONLY public.llamadas FORCE ROW LEVEL SECURITY;


--
-- Name: logos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    file_path text NOT NULL,
    file_url text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.logos FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE logos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.logos IS 'Repositorio central de logos que puede utilizar cualquier documento o vista.';


--
-- Name: COLUMN logos.file_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.logos.file_path IS 'Ruta interna en el bucket logos.';


--
-- Name: COLUMN logos.file_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.logos.file_url IS 'URL pública o firmada del logo.';


--
-- Name: COLUMN logos.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.logos.metadata IS 'Información adicional (colores sugeridos, contraste, etc.).';


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
    organizacion_id uuid NOT NULL,
    CONSTRAINT mensajes_direccion_check CHECK ((direccion = ANY (ARRAY['entrante'::text, 'saliente'::text]))),
    CONSTRAINT mensajes_estado_check CHECK ((estado = ANY (ARRAY['enviada'::text, 'entregada'::text, 'leida'::text, 'fallida'::text]))),
    CONSTRAINT mensajes_tipo_contenido_check CHECK ((tipo_contenido = ANY (ARRAY['texto'::text, 'medio'::text, 'sistema'::text])))
);

ALTER TABLE ONLY public.mensajes FORCE ROW LEVEL SECURITY;


--
-- Name: modelos_productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modelos_productos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    familia_id uuid
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
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.resultados FORCE ROW LEVEL SECURITY;


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
-- Name: notas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    relacion_tipo text NOT NULL,
    relacion_id uuid NOT NULL,
    texto text NOT NULL,
    visible_para_cliente boolean DEFAULT false NOT NULL,
    tipo text DEFAULT 'interna'::text NOT NULL,
    creado_por_usuario_id uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.notas FORCE ROW LEVEL SECURITY;


--
-- Name: oportunidad_etapas_historial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oportunidad_etapas_historial (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    oportunidad_id uuid NOT NULL,
    etapa_origen_id uuid,
    etapa_destino_id uuid NOT NULL,
    cambiado_por_usuario_id uuid,
    cambiado_en timestamp with time zone DEFAULT now() NOT NULL,
    motivo text,
    fuente text DEFAULT 'humano'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY public.oportunidad_etapas_historial FORCE ROW LEVEL SECURITY;


--
-- Name: oportunidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oportunidades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    cuenta_id uuid,
    contacto_principal_id uuid,
    etapa_id uuid NOT NULL,
    titulo text NOT NULL,
    descripcion text,
    monto_estimado numeric(14,2),
    moneda character(3) DEFAULT 'MXN'::bpchar NOT NULL,
    probabilidad numeric(5,2),
    fecha_cierre_probable date,
    estado text DEFAULT 'abierta'::text NOT NULL,
    motivo_perdida text,
    propietario_usuario_id uuid,
    asignado_a_usuario_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    cerrado_en timestamp with time zone
);

ALTER TABLE ONLY public.oportunidades FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE oportunidades; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.oportunidades IS 'Negocios en pipeline; reemplaza a lead_tarjetas.';


--
-- Name: organizaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    razon_social text,
    rfc text,
    pais text,
    estado text,
    ciudad text,
    dominio_principal text,
    telefono text,
    sitio_web text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    estado_onboarding text DEFAULT 'pendiente'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_alta timestamp with time zone DEFAULT now() NOT NULL,
    fecha_pausa timestamp with time zone,
    fecha_cancelacion timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.organizaciones FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE organizaciones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organizaciones IS 'Tenants del SaaS; agrupan datos y config multi-tenant.';


--
-- Name: COLUMN organizaciones.config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizaciones.config IS 'JSONB con banderas/ajustes (pipelines, features, etc.).';


--
-- Name: COLUMN organizaciones.estado_onboarding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizaciones.estado_onboarding IS 'pendiente|en_progreso|completado|pausado|cancelado';


--
-- Name: organizaciones_missing_etapas_pipeline; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.organizaciones_missing_etapas_pipeline AS
 WITH stage_defs AS (
         SELECT t.codigo
           FROM ( VALUES ('captado'::text), ('precalificado'::text), ('demo'::text), ('propuesta'::text), ('negociacion'::text), ('cerrado_ganado'::text), ('cerrado_perdido'::text)) t(codigo)
        )
 SELECT o.id AS organizacion_id,
    sd.codigo
   FROM (public.organizaciones o
     CROSS JOIN stage_defs sd)
  WHERE (NOT (EXISTS ( SELECT 1
           FROM public.etapas_pipeline ep
          WHERE ((ep.organizacion_id = o.id) AND (lower(ep.codigo) = sd.codigo)))));


--
-- Name: VIEW organizaciones_missing_etapas_pipeline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.organizaciones_missing_etapas_pipeline IS 'Lista cada organización/código de etapa faltante para monitorear seeds y alertar si aparece un tenant sin captado/precalificado/etc.';


--
-- Name: panel_calendar_bookings; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.panel_calendar_bookings WITH (security_invoker='true') AS
 SELECT cb.id,
    cb.resource_id,
    cb.hold_id,
    cb.tarjeta_id,
    cb.contact_id,
    cb.conversacion_id,
    cb.start_at,
    cb.end_at,
    cb.timezone,
    cb.status,
    cb.notes,
    cb.meeting_url,
    cb.external_join_url,
    cb.metadata,
    cb.created_at,
    cb.updated_at,
        CASE
            WHEN ((o.metadata ->> 'tablero_id'::text) ~ '^[0-9a-fA-F-]{36}$'::text) THEN ((o.metadata ->> 'tablero_id'::text))::uuid
            ELSE NULL::uuid
        END AS tablero_id,
    o.etapa_id,
    ep.codigo AS etapa_codigo,
    ep.nombre AS etapa_nombre,
    COALESCE(NULLIF((o.metadata ->> 'canal'::text), ''::text), conv.canal, 'desconocido'::text) AS tarjeta_canal,
        CASE
            WHEN ((o.metadata ->> 'lead_score'::text) ~ '^-?\d+$'::text) THEN ((o.metadata ->> 'lead_score'::text))::integer
            ELSE NULL::integer
        END AS tarjeta_lead_score,
        CASE
            WHEN (jsonb_typeof((o.metadata -> 'tags'::text)) = 'array'::text) THEN (o.metadata -> 'tags'::text)
            ELSE '[]'::jsonb
        END AS tarjeta_tags,
    o.metadata AS tarjeta_metadata,
    o.asignado_a_usuario_id,
    ua.nombre_completo AS asignado_nombre,
    o.propietario_usuario_id,
    up.nombre_completo AS propietario_nombre,
    c.nombre_completo AS contacto_nombre,
    c.correo AS contacto_correo,
    c.telefono_e164 AS contacto_telefono,
    c.company_name AS contacto_empresa,
    c.origen AS contacto_origen,
    conv.estado AS conversacion_estado,
    conv.ultimo_mensaje_en AS conversacion_ultimo_mensaje_en,
    conv.canal AS conversacion_canal,
    o.id AS oportunidad_id
   FROM ((((((public.calendar_bookings cb
     LEFT JOIN public.oportunidades o ON ((o.id = cb.tarjeta_id)))
     LEFT JOIN public.etapas_pipeline ep ON ((ep.id = o.etapa_id)))
     LEFT JOIN public.usuarios ua ON ((ua.id = o.asignado_a_usuario_id)))
     LEFT JOIN public.usuarios up ON ((up.id = o.propietario_usuario_id)))
     LEFT JOIN public.contactos c ON ((c.id = COALESCE(cb.contact_id, o.contacto_principal_id))))
     LEFT JOIN public.conversaciones conv ON ((conv.id = cb.conversacion_id)));


--
-- Name: VIEW panel_calendar_bookings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.panel_calendar_bookings IS 'Citas confirmadas del calendario con contexto CRM (oportunidades, contactos y conversaciones).';


--
-- Name: panel_calendar_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.panel_calendar_settings (
    slug text NOT NULL,
    reminder_enabled boolean DEFAULT true NOT NULL,
    reminder_offset_minutes integer DEFAULT 120 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL,
    CONSTRAINT panel_calendar_settings_reminder_offset_minutes_check CHECK (((reminder_offset_minutes >= 15) AND (reminder_offset_minutes <= 720)))
);

ALTER TABLE ONLY public.panel_calendar_settings FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE panel_calendar_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.panel_calendar_settings IS 'Preferencias del calendario para el panel (recordatorios, offsets, flags).';


--
-- Name: panel_email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.panel_email_templates (
    slug text NOT NULL,
    intro text NOT NULL,
    closing text NOT NULL,
    highlights jsonb DEFAULT '[]'::jsonb NOT NULL,
    resources jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    use_summary boolean DEFAULT true NOT NULL,
    use_highlights boolean DEFAULT true NOT NULL,
    use_resources boolean DEFAULT true NOT NULL,
    signature_salutation text DEFAULT 'Saludos,'::text NOT NULL,
    signature text DEFAULT 'Equipo Geoactiv · Tal-IA'::text NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.panel_email_templates FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE panel_email_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.panel_email_templates IS 'Plantillas personalizables para los correos que Tal-IA envía desde el panel cuando el prospecto solicita información.';


--
-- Name: COLUMN panel_email_templates.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.panel_email_templates.slug IS 'Identificador único de la plantilla (ej. "default").';


--
-- Name: COLUMN panel_email_templates.intro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.panel_email_templates.intro IS 'Texto de introducción del correo.';


--
-- Name: COLUMN panel_email_templates.closing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.panel_email_templates.closing IS 'Texto de cierre/CTA del correo.';


--
-- Name: COLUMN panel_email_templates.highlights; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.panel_email_templates.highlights IS 'Arreglo JSON con los beneficios o puntos clave que se envían como bullets.';


--
-- Name: COLUMN panel_email_templates.resources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.panel_email_templates.resources IS 'Arreglo JSON con objetos {label, url} para enlaces adicionales.';


--
-- Name: COLUMN panel_email_templates.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.panel_email_templates.updated_at IS 'Marca de tiempo de la última actualización.';


--
-- Name: permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permisos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    descripcion text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.permisos FORCE ROW LEVEL SECURITY;


--
-- Name: producto_metadata_schemes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.producto_metadata_schemes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    precio_base numeric(14,2),
    moneda character(3) DEFAULT 'MXN'::bpchar NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    familia_id uuid,
    modelo_id uuid
);

ALTER TABLE ONLY public.productos FORCE ROW LEVEL SECURITY;


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
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.prompt_bindings FORCE ROW LEVEL SECURITY;


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
    organizacion_id uuid NOT NULL,
    CONSTRAINT pv_fs_is_array CHECK ((jsonb_typeof(few_shots) = 'array'::text)),
    CONSTRAINT pv_gr_is_array CHECK ((jsonb_typeof(guardrails) = 'array'::text)),
    CONSTRAINT pv_tools_is_array CHECK ((jsonb_typeof(tools) = 'array'::text)),
    CONSTRAINT pv_vars_is_array CHECK ((jsonb_typeof(variables) = 'array'::text))
);

ALTER TABLE ONLY public.prompt_versions FORCE ROW LEVEL SECURITY;


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
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.prompts FORCE ROW LEVEL SECURITY;


--
-- Name: propiedad_capas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propiedad_capas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nivel integer NOT NULL,
    nombre text,
    descripcion text,
    altura numeric(9,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    desarrollo_id uuid
);


--
-- Name: propiedad_departamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propiedad_departamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nivel_id uuid NOT NULL,
    unidad text NOT NULL,
    status public.propiedad_status DEFAULT 'disponible'::public.propiedad_status NOT NULL,
    precio numeric(14,2),
    area_m2 numeric(10,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    geom public.geometry(PolygonZ,4326) NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: propiedad_desarrollos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propiedad_desarrollos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    tipo public.property_desarrollo_tipo DEFAULT 'horizontal'::public.property_desarrollo_tipo NOT NULL,
    status public.propiedad_status DEFAULT 'disponible'::public.propiedad_status NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    pais_codigo text,
    estado_cve text,
    municipio_cve text,
    codigo_postal text,
    colonia text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: propiedad_desarrollos_mix; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propiedad_desarrollos_mix (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    tipo public.property_desarrollo_tipo DEFAULT 'mixto'::public.property_desarrollo_tipo NOT NULL,
    status public.propiedad_status DEFAULT 'disponible'::public.propiedad_status NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    pais_codigo text,
    estado_cve text,
    municipio_cve text,
    codigo_postal text,
    colonia text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: propiedad_desarrollos_mix_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propiedad_desarrollos_mix_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mix_id uuid NOT NULL,
    nombre text NOT NULL,
    modo public.propiedad_desarrollo_modo NOT NULL,
    descripcion text,
    nivel integer,
    altura numeric,
    status public.propiedad_status DEFAULT 'disponible'::public.propiedad_status NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    desarrollo_id uuid NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: propiedad_niveles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propiedad_niveles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    propiedad_id uuid NOT NULL,
    nivel integer NOT NULL,
    nombre text,
    descripcion text,
    altura numeric(9,2),
    geom public.geometry(PolygonZ,4326) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: propiedad_poligonos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propiedad_poligonos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    geom public.geometry(MultiPolygonZ,4326) NOT NULL,
    status public.propiedad_status DEFAULT 'disponible'::public.propiedad_status NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT propiedad_poligonos_target_type_check CHECK ((target_type = ANY (ARRAY['desarrollo'::text, 'capa'::text, 'unidad'::text, 'mix'::text])))
);


--
-- Name: propiedad_tipos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propiedad_tipos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    color text DEFAULT '#FFFFFF'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: propiedad_unidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propiedad_unidades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nivel_id uuid NOT NULL,
    unidad text NOT NULL,
    status public.propiedad_status DEFAULT 'disponible'::public.propiedad_status NOT NULL,
    precio numeric(14,2),
    area_m2 numeric(10,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    desarrollo_id uuid,
    tipo_id uuid,
    nombre text DEFAULT 'Unidad'::text NOT NULL,
    descripcion text,
    linea_id uuid,
    familia_id uuid,
    modelo_id uuid
);


--
-- Name: COLUMN propiedad_unidades.tipo_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.propiedad_unidades.tipo_id IS 'Tipo comercial que describe la unidad, antes en propiedades';


--
-- Name: COLUMN propiedad_unidades.linea_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.propiedad_unidades.linea_id IS 'Linea de negocio asociada';


--
-- Name: COLUMN propiedad_unidades.familia_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.propiedad_unidades.familia_id IS 'Familia comercial';


--
-- Name: COLUMN propiedad_unidades.modelo_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.propiedad_unidades.modelo_id IS 'Modelo/prototipo';


--
-- Name: prospeccion_buscador_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospeccion_buscador_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    creado_por uuid DEFAULT auth.uid(),
    status text DEFAULT 'pending'::text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    stats jsonb,
    total integer,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    duration_ms integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY public.prospeccion_buscador_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: prospeccion_buscador_resultados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospeccion_buscador_resultados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    organizacion_id uuid NOT NULL,
    url text,
    dominio text,
    correo text,
    telefono text,
    contacto jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.prospeccion_buscador_resultados FORCE ROW LEVEL SECURITY;


--
-- Name: prospeccion_contacto_batch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospeccion_contacto_batch (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    iniciado_por uuid DEFAULT auth.uid(),
    filtros jsonb DEFAULT '{}'::jsonb NOT NULL,
    canales jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_prospectos integer DEFAULT 0 NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    programado_en timestamp with time zone DEFAULT now() NOT NULL,
    finalizado_en timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL,
    campana_id uuid,
    lista_id uuid,
    titulo text,
    programacion jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY public.prospeccion_contacto_batch FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN prospeccion_contacto_batch.titulo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.prospeccion_contacto_batch.titulo IS 'Nombre amigable del lote/wizard mostrado en la UI.';


--
-- Name: COLUMN prospeccion_contacto_batch.programacion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.prospeccion_contacto_batch.programacion IS 'JSON con programaciones por canal (wizard multicanal).';


--
-- Name: prospeccion_contacto_envio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospeccion_contacto_envio (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    prospecto_id uuid NOT NULL,
    canal text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    intento_actual integer DEFAULT 0 NOT NULL,
    max_reintentos integer DEFAULT 3 NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    detalle jsonb DEFAULT '{}'::jsonb NOT NULL,
    mensaje_id text,
    programado_en timestamp with time zone DEFAULT now() NOT NULL,
    procesado_en timestamp with time zone,
    error text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.prospeccion_contacto_envio FORCE ROW LEVEL SECURITY;


--
-- Name: prospeccion_contacto_listas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospeccion_contacto_listas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    filtros jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_estimado integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_por uuid DEFAULT auth.uid(),
    actualizado_por uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.prospeccion_contacto_listas FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE prospeccion_contacto_listas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.prospeccion_contacto_listas IS 'Listas inteligentes de prospectos (filtros guardados por organización).';


--
-- Name: prospeccion_contacto_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospeccion_contacto_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canal text NOT NULL,
    slug text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    asunto text,
    cuerpo_texto text,
    cuerpo_html text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_por uuid DEFAULT auth.uid(),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.prospeccion_contacto_templates FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE prospeccion_contacto_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.prospeccion_contacto_templates IS 'Plantillas reutilizables para envíos de correo/WhatsApp/llamadas en prospección.';


--
-- Name: prospeccion_contactos_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospeccion_contactos_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prospecto_id uuid NOT NULL,
    canal text NOT NULL,
    accion text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    detalle jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    creado_por uuid DEFAULT auth.uid(),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    envio_id uuid,
    batch_id uuid,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.prospeccion_contactos_log FORCE ROW LEVEL SECURITY;


--
-- Name: prospeccion_prospecto_contacto_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.prospeccion_prospecto_contacto_stats WITH (security_barrier='true') AS
 WITH envios AS (
         SELECT e.prospecto_id,
            e.organizacion_id,
            e.canal,
            lower(COALESCE(e.estado, 'pendiente'::text)) AS estado,
            COALESCE(e.procesado_en, e.programado_en, e.creado_en) AS actividad_en
           FROM public.prospeccion_contacto_envio e
        ), canal_stats AS (
         SELECT envios.prospecto_id,
            envios.organizacion_id,
            envios.canal,
            count(*) AS total,
            count(*) FILTER (WHERE (envios.estado = ANY (ARRAY['pendiente'::text, 'procesando'::text, 'en_proceso'::text]))) AS pendientes,
            count(*) FILTER (WHERE (envios.estado = ANY (ARRAY['enviado'::text, 'entregado'::text, 'leido'::text, 'completado'::text, 'procesando'::text, 'en_proceso'::text, 'answered'::text, 'completed'::text, 'completed-with-recording'::text]))) AS exitosos,
            count(*) FILTER (WHERE (envios.estado = ANY (ARRAY['error'::text, 'fallido'::text, 'failed'::text, 'undelivered'::text, 'no-answer'::text, 'canceled'::text, 'cancelado'::text]))) AS fallidos,
            count(*) FILTER (WHERE (envios.estado = 'omitido'::text)) AS omitidos,
            count(*) FILTER (WHERE (envios.estado = 'cancelado'::text)) AS cancelados,
            max(envios.actividad_en) AS ultima_actividad_en,
            (array_agg(envios.estado ORDER BY envios.actividad_en DESC NULLS LAST))[1] AS ultimo_estado
           FROM envios
          GROUP BY envios.prospecto_id, envios.organizacion_id, envios.canal
        ), grouped AS (
         SELECT canal_stats.prospecto_id,
            canal_stats.organizacion_id,
            jsonb_object_agg(canal_stats.canal, jsonb_build_object('total', canal_stats.total, 'pendientes', canal_stats.pendientes, 'exitosos', canal_stats.exitosos, 'fallidos', canal_stats.fallidos, 'omitidos', canal_stats.omitidos, 'cancelados', canal_stats.cancelados, 'ultimo_estado', canal_stats.ultimo_estado, 'ultima_actividad_en', canal_stats.ultima_actividad_en) ORDER BY canal_stats.canal) AS canales,
            (sum(canal_stats.total))::bigint AS total_envios,
            max(canal_stats.ultima_actividad_en) AS ultimo_contacto_en
           FROM canal_stats
          GROUP BY canal_stats.prospecto_id, canal_stats.organizacion_id
        ), respuestas AS (
         SELECT prospeccion_contactos_log.prospecto_id,
            count(*) AS total_respuestas,
            max(prospeccion_contactos_log.creado_en) AS ultima_respuesta_en
           FROM public.prospeccion_contactos_log
          WHERE ((prospeccion_contactos_log.prospecto_id IS NOT NULL) AND ((lower(COALESCE(prospeccion_contactos_log.accion, (prospeccion_contactos_log.detalle ->> 'action'::text), prospeccion_contactos_log.estado, ''::text)) = ANY (ARRAY['respuesta'::text, 'respondio'::text, 'respondido'::text, 'reply'::text, 'reply_inbound'::text])) OR (lower(COALESCE((prospeccion_contactos_log.detalle ->> 'direction'::text), ''::text)) = ANY (ARRAY['inbound'::text, 'incoming'::text])) OR (COALESCE((prospeccion_contactos_log.detalle ->> 'respondio'::text), ''::text) = 'true'::text) OR (COALESCE((prospeccion_contactos_log.detalle ->> 'respuesta'::text), ''::text) <> ''::text)))
          GROUP BY prospeccion_contactos_log.prospecto_id
        )
 SELECT g.prospecto_id,
    g.organizacion_id,
    g.canales,
    g.total_envios,
    g.ultimo_contacto_en,
    COALESCE(r.total_respuestas, (0)::bigint) AS total_respuestas,
    (COALESCE(r.total_respuestas, (0)::bigint) > 0) AS respondio,
    r.ultima_respuesta_en
   FROM (grouped g
     LEFT JOIN respuestas r ON ((r.prospecto_id = g.prospecto_id)));


--
-- Name: VIEW prospeccion_prospecto_contacto_stats; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.prospeccion_prospecto_contacto_stats IS 'Conteo agregado de envíos y respuestas por prospecto/canal para la vista de prospección.';


--
-- Name: prospeccion_prospectos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospeccion_prospectos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    busqueda_id uuid,
    resultado_id uuid,
    fuente public.fuente_resultado NOT NULL,
    fuente_busqueda text,
    display_name text NOT NULL,
    name text,
    razon_social text,
    actividad text,
    estrato text,
    phone text,
    phone_e164 text,
    phone_national text,
    carrier_name text,
    carrier_type text,
    email text,
    website text,
    address text,
    lat double precision,
    lng double precision,
    rating numeric,
    distancia_m double precision,
    whatsapp_permitido boolean,
    llamada_permitida boolean,
    lookup_status text DEFAULT 'pendiente'::text,
    lookup_error text,
    segmento text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    creado_por uuid DEFAULT auth.uid(),
    actualizado_por uuid DEFAULT auth.uid(),
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.prospeccion_prospectos FORCE ROW LEVEL SECURITY;


--
-- Name: prospeccion_prospectos_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospeccion_prospectos_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prospecto_id uuid NOT NULL,
    accion text NOT NULL,
    cambios jsonb NOT NULL,
    realizado_por uuid,
    realizado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.prospeccion_prospectos_audit FORCE ROW LEVEL SECURITY;


--
-- Name: puestos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.puestos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    departamento_id uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.puestos FORCE ROW LEVEL SECURITY;


--
-- Name: quote_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quote_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    html text NOT NULL,
    css text DEFAULT ''::text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.quote_templates FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE quote_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quote_templates IS 'Plantillas HTML utilizadas para renderizar las cotizaciones del panel.';


--
-- Name: COLUMN quote_templates.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.slug IS 'Identificador lógico (ej. "default") para seleccionar la plantilla.';


--
-- Name: COLUMN quote_templates.nombre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.nombre IS 'Nombre visible del formato.';


--
-- Name: COLUMN quote_templates.descripcion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.descripcion IS 'Notas o contexto sobre el formato.';


--
-- Name: COLUMN quote_templates.html; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.html IS 'Markup principal con placeholders moustache {{token}}.';


--
-- Name: COLUMN quote_templates.css; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.css IS 'Bloque CSS que se inyecta en el template.';


--
-- Name: COLUMN quote_templates.variables; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.variables IS 'Listado JSON con los tokens soportados por el template.';


--
-- Name: COLUMN quote_templates.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.version IS 'Número de versión para mantener historial de cambios.';


--
-- Name: COLUMN quote_templates.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.is_active IS 'Indica si la plantilla puede seleccionarse para renderizar PDFs.';


--
-- Name: COLUMN quote_templates.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.updated_by IS 'Usuario que realizó la última edición desde el panel.';


--
-- Name: COLUMN quote_templates.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.created_at IS 'Fecha de creación.';


--
-- Name: COLUMN quote_templates.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.updated_at IS 'Fecha de última modificación.';


--
-- Name: COLUMN quote_templates.config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quote_templates.config IS 'Configuración declarativa (logo, colores, textos) usada para construir el HTML.';


--
-- Name: recursos_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recursos_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    objeto_type text NOT NULL,
    objeto_id uuid NOT NULL,
    url text NOT NULL,
    descripcion text,
    tipo text NOT NULL,
    orden integer DEFAULT 100 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recursos_media_objeto_type_check CHECK ((objeto_type = ANY (ARRAY['producto'::text, 'familia'::text, 'modelo'::text, 'cotizacion'::text]))),
    CONSTRAINT recursos_media_tipo_check CHECK ((tipo = ANY (ARRAY['portada'::text, 'galeria'::text, 'especifico'::text, 'manual'::text])))
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.roles FORCE ROW LEVEL SECURITY;


--
-- Name: roles_codigo_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles_codigo_counters (
    organizacion_id uuid NOT NULL,
    consecutivo bigint DEFAULT 0 NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE roles_codigo_counters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.roles_codigo_counters IS 'Lleva el consecutivo por organización para generar códigos de roles.';


--
-- Name: roles_permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles_permisos (
    rol_id uuid NOT NULL,
    permiso_id uuid NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.roles_permisos FORCE ROW LEVEL SECURITY;


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
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.secretos FORCE ROW LEVEL SECURITY;


--
-- Name: taggings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taggings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    relacion_tipo text NOT NULL,
    relacion_id uuid NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.taggings FORCE ROW LEVEL SECURITY;


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    nombre text NOT NULL,
    color text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.tags FORCE ROW LEVEL SECURITY;


--
-- Name: ticket_comentarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_comentarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    autor_usuario_id uuid,
    autor_cliente_id uuid,
    mensaje text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.ticket_comentarios FORCE ROW LEVEL SECURITY;


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    cuenta_id uuid,
    contacto_id uuid,
    asunto text NOT NULL,
    descripcion text,
    estado text DEFAULT 'abierto'::text NOT NULL,
    prioridad text DEFAULT 'media'::text NOT NULL,
    canal_origen text,
    asignado_a_usuario_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    cerrado_en timestamp with time zone
);

ALTER TABLE ONLY public.tickets FORCE ROW LEVEL SECURITY;


--
-- Name: usuarios_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_roles (
    usuario_id uuid NOT NULL,
    rol_id uuid NOT NULL,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.usuarios_roles FORCE ROW LEVEL SECURITY;


--
-- Name: v_asignaciones_vendedores; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_asignaciones_vendedores AS
 SELECT a.id,
    a.creado_en,
    a.organizacion_id,
    org.nombre AS organizacion_nombre,
    a.conversacion_id,
    conv.canal AS conversacion_canal,
    a.oportunidad_id,
    opp.titulo AS oportunidad_titulo,
    a.contacto_id,
    ct.nombre_completo AS contacto_nombre,
    ct.company_name AS contacto_empresa,
    ct.telefono_e164 AS contacto_telefono,
    ct.correo AS contacto_correo,
    a.vendedor_usuario_id,
    usr.nombre_completo AS vendedor_nombre,
    usr.correo AS vendedor_correo,
    usr.telefono_e164 AS vendedor_telefono,
    a.trigger_event,
    a.canal AS asignacion_canal,
    a.notificacion_message_sid,
    a.aceptado_en,
    a.aceptado_por_usuario_id,
    ack_usr.nombre_completo AS aceptado_por_nombre,
    ack_usr.correo AS aceptado_por_correo,
    ack_usr.telefono_e164 AS aceptado_por_telefono,
    a.aceptado_via,
    a.metadata
   FROM ((((((public.asignaciones_vendedores a
     LEFT JOIN public.organizaciones org ON ((org.id = a.organizacion_id)))
     LEFT JOIN public.conversaciones conv ON ((conv.id = a.conversacion_id)))
     LEFT JOIN public.oportunidades opp ON ((opp.id = a.oportunidad_id)))
     LEFT JOIN public.contactos ct ON ((ct.id = COALESCE(a.contacto_id, opp.contacto_principal_id))))
     LEFT JOIN public.usuarios usr ON ((usr.id = a.vendedor_usuario_id)))
     LEFT JOIN public.usuarios ack_usr ON ((ack_usr.id = a.aceptado_por_usuario_id)));


--
-- Name: VIEW v_asignaciones_vendedores; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_asignaciones_vendedores IS 'Vista de auditoría de asignaciones de vendedores para cualquier canal.';


--
-- Name: v_configuracion_personal; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_configuracion_personal WITH (security_invoker='true') AS
 SELECT u.id AS usuario_id,
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
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('rol_id', ur.rol_id, 'codigo', r.codigo, 'nombre', r.nombre) ORDER BY r.codigo) AS jsonb_agg
           FROM (public.usuarios_roles ur
             JOIN public.roles r ON ((r.id = ur.rol_id)))
          WHERE (ur.usuario_id = u.id)), '[]'::jsonb) AS roles,
    e.es_vendedor,
    e.ultimo_lead_asignado_en
   FROM (((public.usuarios u
     LEFT JOIN public.empleados e ON ((e.usuario_id = u.id)))
     LEFT JOIN public.departamentos d ON ((d.id = e.departamento_id)))
     LEFT JOIN public.puestos p ON ((p.id = e.puesto_id)));


--
-- Name: v_denue_contactables; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_denue_contactables WITH (security_invoker='true') AS
 SELECT r.id AS resultado_id,
    r.busqueda_id,
    r.fuente AS fuente_resultado,
    b.fuente AS fuente_busqueda,
    r.external_id,
    COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
    r.name,
    r.razon_social,
    r.actividad,
    r.estrato,
    COALESCE(NULLIF(r.phone, ''::text), NULLIF((r.raw #>> '{Telefono}'::text[]), ''::text)) AS phone,
    COALESCE(NULLIF(r.email, ''::text), NULLIF((r.raw #>> '{Correo_e}'::text[]), ''::text)) AS email,
    COALESCE(NULLIF(r.website, ''::text), NULLIF((r.raw #>> '{Sitio_internet}'::text[]), ''::text)) AS website,
    NULLIF(r.address, ''::text) AS address,
    r.lat,
    r.lng,
    r.geom,
    r.maps_url,
    r.creado_en AS resultado_creado_en,
    b.query AS busqueda_query,
    b.radio_m AS busqueda_radio_m,
    b.lat AS busqueda_lat,
    b.lng AS busqueda_lng,
    b.centro AS busqueda_centro,
    b.total_encontrados AS busqueda_total_encontrados,
    b.meta AS busqueda_meta,
    b.creado_en AS busqueda_creado_en,
    b.creado_por AS busqueda_creado_por,
        CASE
            WHEN ((b.centro IS NOT NULL) AND (r.geom IS NOT NULL)) THEN public.st_distance(b.centro, r.geom)
            ELSE NULL::double precision
        END AS distancia_m
   FROM (public.resultados r
     JOIN public.busquedas b ON ((b.id = r.busqueda_id)))
  WHERE (r.fuente = 'denue'::public.fuente_resultado);


--
-- Name: VIEW v_denue_contactables; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_denue_contactables IS 'Resultados de búsquedas DENUE listos para contactabilidad y mapa.';


--
-- Name: v_google_places_contactables; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_google_places_contactables WITH (security_invoker='true') AS
 SELECT r.id AS resultado_id,
    r.busqueda_id,
    r.fuente AS fuente_resultado,
    b.fuente AS fuente_busqueda,
    r.external_id,
    COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
    r.name,
    r.razon_social,
    r.actividad,
    r.estrato,
    (r.raw ->> 'primaryType'::text) AS google_primary_type,
    (r.raw ->> 'primaryTypeDisplayName'::text) AS google_primary_type_display_name,
    COALESCE(types.google_types, ARRAY[]::text[]) AS google_types,
    COALESCE(NULLIF(r.phone, ''::text), NULLIF((r.raw #>> '{internationalPhoneNumber}'::text[]), ''::text), NULLIF((r.raw #>> '{nationalPhoneNumber}'::text[]), ''::text)) AS phone,
    COALESCE(NULLIF(r.email, ''::text), NULLIF((r.raw #>> '{email}'::text[]), ''::text)) AS email,
    COALESCE(NULLIF(r.website, ''::text), NULLIF((r.raw #>> '{websiteUri}'::text[]), ''::text), NULLIF((r.raw #>> '{googleMapsUri}'::text[]), ''::text)) AS website,
    NULLIF(r.address, ''::text) AS address,
    r.lat,
    r.lng,
    r.geom,
    r.rating,
    r.reviews,
    r.maps_url,
    r.creado_en AS resultado_creado_en,
    b.query AS busqueda_query,
    b.radio_m AS busqueda_radio_m,
    b.lat AS busqueda_lat,
    b.lng AS busqueda_lng,
    b.centro AS busqueda_centro,
    b.total_encontrados AS busqueda_total_encontrados,
    b.meta AS busqueda_meta,
    b.creado_en AS busqueda_creado_en,
    b.creado_por AS busqueda_creado_por,
        CASE
            WHEN ((b.centro IS NOT NULL) AND (r.geom IS NOT NULL)) THEN public.st_distance(b.centro, r.geom)
            ELSE NULL::double precision
        END AS distancia_m
   FROM ((public.resultados r
     JOIN public.busquedas b ON ((b.id = r.busqueda_id)))
     LEFT JOIN LATERAL ( SELECT COALESCE(array_agg(value.value), ARRAY[]::text[]) AS google_types
           FROM jsonb_array_elements_text(COALESCE((r.raw -> 'types'::text), '[]'::jsonb)) value(value)) types ON (true))
  WHERE (r.fuente = 'google_places'::public.fuente_resultado);


--
-- Name: VIEW v_google_places_contactables; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_google_places_contactables IS 'Resultados de búsquedas Google Places listos para contactabilidad (teléfono, web, tipo, radio y distancia al centro).';


--
-- Name: v_resultados_mapa; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_resultados_mapa WITH (security_invoker='true') AS
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

CREATE VIEW public.v_resultados_unificados WITH (security_invoker='true') AS
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
-- Name: webchat_session_closures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webchat_session_closures (
    session_id text NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    contacto_id uuid,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.webchat_session_closures FORCE ROW LEVEL SECURITY;


--
-- Name: webchat_visitantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webchat_visitantes (
    session_id text NOT NULL,
    registrado_en timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_evento_en timestamp with time zone DEFAULT now() NOT NULL,
    ip text,
    device_type text,
    geo jsonb,
    cve_ent text,
    nom_ent text,
    cve_mun text,
    nom_mun text,
    cvegeo text,
    visit_count integer DEFAULT 1 NOT NULL,
    referrer text,
    landing_url text,
    contacto_id uuid,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.webchat_visitantes FORCE ROW LEVEL SECURITY;


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
    error text,
    organizacion_id uuid NOT NULL
);

ALTER TABLE ONLY public.webhooks_entrantes FORCE ROW LEVEL SECURITY;


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
-- Name: messages_2025_10_31; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_10_31 (
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
-- Name: messages_2025_11_01; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_11_01 (
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
-- Name: messages_2025_11_02; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_11_02 (
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
-- Name: messages_2025_11_03; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_11_03 (
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
-- Name: messages_2025_11_04; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_11_04 (
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
-- Name: messages_2025_11_05; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_11_05 (
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
-- Name: messages_2025_11_06; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2025_11_06 (
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
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
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
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text,
    created_by text,
    idempotency_key text,
    rollback text[]
);


--
-- Name: seed_files; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.seed_files (
    path text NOT NULL,
    hash text NOT NULL
);


--
-- Name: messages_2025_10_31; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_10_31 FOR VALUES FROM ('2025-10-31 00:00:00') TO ('2025-11-01 00:00:00');


--
-- Name: messages_2025_11_01; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_11_01 FOR VALUES FROM ('2025-11-01 00:00:00') TO ('2025-11-02 00:00:00');


--
-- Name: messages_2025_11_02; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_11_02 FOR VALUES FROM ('2025-11-02 00:00:00') TO ('2025-11-03 00:00:00');


--
-- Name: messages_2025_11_03; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_11_03 FOR VALUES FROM ('2025-11-03 00:00:00') TO ('2025-11-04 00:00:00');


--
-- Name: messages_2025_11_04; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_11_04 FOR VALUES FROM ('2025-11-04 00:00:00') TO ('2025-11-05 00:00:00');


--
-- Name: messages_2025_11_05; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_11_05 FOR VALUES FROM ('2025-11-05 00:00:00') TO ('2025-11-06 00:00:00');


--
-- Name: messages_2025_11_06; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2025_11_06 FOR VALUES FROM ('2025-11-06 00:00:00') TO ('2025-11-07 00:00:00');


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
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


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
-- Name: actividades actividades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividades
    ADD CONSTRAINT actividades_pkey PRIMARY KEY (id);


--
-- Name: agentes agentes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes
    ADD CONSTRAINT agentes_pkey PRIMARY KEY (id);


--
-- Name: archivos archivos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archivos
    ADD CONSTRAINT archivos_pkey PRIMARY KEY (id);


--
-- Name: asignaciones_vendedores asignaciones_vendedores_whatsapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_vendedores
    ADD CONSTRAINT asignaciones_vendedores_whatsapp_pkey PRIMARY KEY (id);


--
-- Name: adjuntos attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: busquedas busquedas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.busquedas
    ADD CONSTRAINT busquedas_pkey PRIMARY KEY (id);


--
-- Name: calendar_availability_patterns calendar_availability_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_availability_patterns
    ADD CONSTRAINT calendar_availability_patterns_pkey PRIMARY KEY (id);


--
-- Name: calendar_bookings calendar_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_bookings
    ADD CONSTRAINT calendar_bookings_pkey PRIMARY KEY (id);


--
-- Name: calendar_exceptions calendar_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_exceptions
    ADD CONSTRAINT calendar_exceptions_pkey PRIMARY KEY (id);


--
-- Name: calendar_resources calendar_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_resources
    ADD CONSTRAINT calendar_resources_pkey PRIMARY KEY (id);


--
-- Name: calendar_slot_holds calendar_slot_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_slot_holds
    ADD CONSTRAINT calendar_slot_holds_pkey PRIMARY KEY (id);


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
-- Name: campanas campanas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campanas
    ADD CONSTRAINT campanas_pkey PRIMARY KEY (id);


--
-- Name: catalog_document_embeddings catalog_document_embeddings_organizacion_id_entity_type_ent_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_document_embeddings
    ADD CONSTRAINT catalog_document_embeddings_organizacion_id_entity_type_ent_key UNIQUE (organizacion_id, entity_type, entity_id);


--
-- Name: catalog_document_embeddings catalog_document_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_document_embeddings
    ADD CONSTRAINT catalog_document_embeddings_pkey PRIMARY KEY (id);


--
-- Name: catalog_embeddings_audit catalog_embeddings_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_embeddings_audit
    ADD CONSTRAINT catalog_embeddings_audit_pkey PRIMARY KEY (id);


--
-- Name: catalog_item_prices catalog_item_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_prices
    ADD CONSTRAINT catalog_item_prices_pkey PRIMARY KEY (id);


--
-- Name: catalog_item_tags catalog_item_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_tags
    ADD CONSTRAINT catalog_item_tags_pkey PRIMARY KEY (item_id, tag_id);


--
-- Name: catalog_items catalog_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (id);


--
-- Name: catalog_tags catalog_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_tags
    ADD CONSTRAINT catalog_tags_pkey PRIMARY KEY (id);


--
-- Name: identidades_canal channel_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidades_canal
    ADD CONSTRAINT channel_identities_pkey PRIMARY KEY (id);


--
-- Name: cliente_documentos cliente_documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_documentos
    ADD CONSTRAINT cliente_documentos_pkey PRIMARY KEY (id);


--
-- Name: cliente_portal_tokens cliente_portal_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_portal_tokens
    ADD CONSTRAINT cliente_portal_tokens_pkey PRIMARY KEY (id);


--
-- Name: cliente_portal_tokens cliente_portal_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_portal_tokens
    ADD CONSTRAINT cliente_portal_tokens_token_key UNIQUE (token);


--
-- Name: cliente_responsables cliente_responsables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_responsables
    ADD CONSTRAINT cliente_responsables_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_contacto_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_contacto_unique UNIQUE (contacto_id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


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
-- Name: conversation_summaries conversation_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT conversation_summaries_pkey PRIMARY KEY (id);


--
-- Name: conversaciones conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: cotizacion_items cotizacion_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion_items
    ADD CONSTRAINT cotizacion_items_pkey PRIMARY KEY (id);


--
-- Name: cotizaciones cotizaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_pkey PRIMARY KEY (id);


--
-- Name: cuentas cuentas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas
    ADD CONSTRAINT cuentas_pkey PRIMARY KEY (id);


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
-- Name: etapas_pipeline etapas_pipeline_organizacion_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_pipeline
    ADD CONSTRAINT etapas_pipeline_organizacion_id_codigo_key UNIQUE (organizacion_id, codigo);


--
-- Name: etapas_pipeline etapas_pipeline_organizacion_id_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_pipeline
    ADD CONSTRAINT etapas_pipeline_organizacion_id_orden_key UNIQUE (organizacion_id, orden);


--
-- Name: etapas_pipeline etapas_pipeline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_pipeline
    ADD CONSTRAINT etapas_pipeline_pkey PRIMARY KEY (id);


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
-- Name: familias_productos familias_productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.familias_productos
    ADD CONSTRAINT familias_productos_pkey PRIMARY KEY (id);


--
-- Name: identidades_canal identidades_canal_canal_id_externo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidades_canal
    ADD CONSTRAINT identidades_canal_canal_id_externo_key UNIQUE (canal, id_externo);


--
-- Name: lead_eventos lead_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_eventos
    ADD CONSTRAINT lead_eventos_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: lineas_de_negocio lineas_de_negocio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lineas_de_negocio
    ADD CONSTRAINT lineas_de_negocio_pkey PRIMARY KEY (id);


--
-- Name: logos logos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logos
    ADD CONSTRAINT logos_pkey PRIMARY KEY (id);


--
-- Name: mensajes mensajes_twilio_message_sid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT mensajes_twilio_message_sid_key UNIQUE (twilio_message_sid);


--
-- Name: mensajes messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: modelos_productos modelos_productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelos_productos
    ADD CONSTRAINT modelos_productos_pkey PRIMARY KEY (id);


--
-- Name: notas notas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas
    ADD CONSTRAINT notas_pkey PRIMARY KEY (id);


--
-- Name: oportunidad_etapas_historial oportunidad_etapas_historial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidad_etapas_historial
    ADD CONSTRAINT oportunidad_etapas_historial_pkey PRIMARY KEY (id);


--
-- Name: oportunidades oportunidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidades
    ADD CONSTRAINT oportunidades_pkey PRIMARY KEY (id);


--
-- Name: organizaciones organizaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizaciones
    ADD CONSTRAINT organizaciones_pkey PRIMARY KEY (id);


--
-- Name: panel_calendar_settings panel_calendar_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.panel_calendar_settings
    ADD CONSTRAINT panel_calendar_settings_pkey PRIMARY KEY (organizacion_id, slug);


--
-- Name: panel_email_templates panel_email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.panel_email_templates
    ADD CONSTRAINT panel_email_templates_pkey PRIMARY KEY (organizacion_id, slug);


--
-- Name: permisos permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: producto_metadata_schemes producto_metadata_schemes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_metadata_schemes
    ADD CONSTRAINT producto_metadata_schemes_pkey PRIMARY KEY (id);


--
-- Name: productos productos_organizacion_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_organizacion_id_codigo_key UNIQUE (organizacion_id, codigo);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);


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
-- Name: propiedad_unidades propiedad_departamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_unidades
    ADD CONSTRAINT propiedad_departamentos_pkey PRIMARY KEY (id);


--
-- Name: propiedad_departamentos propiedad_departamentos_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_departamentos
    ADD CONSTRAINT propiedad_departamentos_pkey1 PRIMARY KEY (id);


--
-- Name: propiedad_desarrollos_mix_items propiedad_desarrollos_mix_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_desarrollos_mix_items
    ADD CONSTRAINT propiedad_desarrollos_mix_items_pkey PRIMARY KEY (id);


--
-- Name: propiedad_desarrollos_mix propiedad_desarrollos_mix_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_desarrollos_mix
    ADD CONSTRAINT propiedad_desarrollos_mix_pkey PRIMARY KEY (id);


--
-- Name: propiedad_desarrollos propiedad_desarrollos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_desarrollos
    ADD CONSTRAINT propiedad_desarrollos_pkey PRIMARY KEY (id);


--
-- Name: propiedad_capas propiedad_niveles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_capas
    ADD CONSTRAINT propiedad_niveles_pkey PRIMARY KEY (id);


--
-- Name: propiedad_niveles propiedad_niveles_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_niveles
    ADD CONSTRAINT propiedad_niveles_pkey1 PRIMARY KEY (id);


--
-- Name: propiedad_poligonos propiedad_poligonos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_poligonos
    ADD CONSTRAINT propiedad_poligonos_pkey PRIMARY KEY (id);


--
-- Name: propiedad_poligonos propiedad_poligonos_target_type_target_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_poligonos
    ADD CONSTRAINT propiedad_poligonos_target_type_target_id_key UNIQUE (target_type, target_id);


--
-- Name: propiedad_tipos propiedad_tipos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_tipos
    ADD CONSTRAINT propiedad_tipos_pkey PRIMARY KEY (id);


--
-- Name: prospeccion_buscador_jobs prospeccion_buscador_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_buscador_jobs
    ADD CONSTRAINT prospeccion_buscador_jobs_pkey PRIMARY KEY (id);


--
-- Name: prospeccion_buscador_resultados prospeccion_buscador_resultados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_buscador_resultados
    ADD CONSTRAINT prospeccion_buscador_resultados_pkey PRIMARY KEY (id);


--
-- Name: prospeccion_contacto_batch prospeccion_contacto_batch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_batch
    ADD CONSTRAINT prospeccion_contacto_batch_pkey PRIMARY KEY (id);


--
-- Name: prospeccion_contacto_envio prospeccion_contacto_envio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_envio
    ADD CONSTRAINT prospeccion_contacto_envio_pkey PRIMARY KEY (id);


--
-- Name: prospeccion_contacto_envio prospeccion_contacto_envio_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_envio
    ADD CONSTRAINT prospeccion_contacto_envio_unique UNIQUE (batch_id, prospecto_id, canal);


--
-- Name: prospeccion_contacto_listas prospeccion_contacto_listas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_listas
    ADD CONSTRAINT prospeccion_contacto_listas_pkey PRIMARY KEY (id);


--
-- Name: prospeccion_contacto_templates prospeccion_contacto_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_pkey PRIMARY KEY (id);


--
-- Name: prospeccion_contactos_log prospeccion_contactos_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contactos_log
    ADD CONSTRAINT prospeccion_contactos_log_pkey PRIMARY KEY (id);


--
-- Name: prospeccion_prospectos_audit prospeccion_prospectos_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_prospectos_audit
    ADD CONSTRAINT prospeccion_prospectos_audit_pkey PRIMARY KEY (id);


--
-- Name: prospeccion_prospectos prospeccion_prospectos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_prospectos
    ADD CONSTRAINT prospeccion_prospectos_pkey PRIMARY KEY (id);


--
-- Name: prospeccion_prospectos prospeccion_prospectos_resultado_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_prospectos
    ADD CONSTRAINT prospeccion_prospectos_resultado_id_key UNIQUE (resultado_id);


--
-- Name: puestos puestos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puestos
    ADD CONSTRAINT puestos_pkey PRIMARY KEY (id);


--
-- Name: quote_templates quote_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_templates
    ADD CONSTRAINT quote_templates_pkey PRIMARY KEY (id);


--
-- Name: recursos_media recursos_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recursos_media
    ADD CONSTRAINT recursos_media_pkey PRIMARY KEY (id);


--
-- Name: resultados resultados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados
    ADD CONSTRAINT resultados_pkey PRIMARY KEY (id);


--
-- Name: roles_codigo_counters roles_codigo_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_codigo_counters
    ADD CONSTRAINT roles_codigo_counters_pkey PRIMARY KEY (organizacion_id);


--
-- Name: roles roles_organizacion_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_organizacion_id_codigo_key UNIQUE (organizacion_id, codigo);


--
-- Name: roles_permisos roles_permisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT roles_permisos_pkey PRIMARY KEY (organizacion_id, rol_id, permiso_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: secretos secretos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretos
    ADD CONSTRAINT secretos_pkey PRIMARY KEY (id);


--
-- Name: taggings taggings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taggings
    ADD CONSTRAINT taggings_pkey PRIMARY KEY (id);


--
-- Name: taggings taggings_tag_id_relacion_tipo_relacion_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taggings
    ADD CONSTRAINT taggings_tag_id_relacion_tipo_relacion_id_key UNIQUE (tag_id, relacion_tipo, relacion_id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: ticket_comentarios ticket_comentarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comentarios
    ADD CONSTRAINT ticket_comentarios_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


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
-- Name: webchat_session_closures webchat_session_closures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_session_closures
    ADD CONSTRAINT webchat_session_closures_pkey PRIMARY KEY (organizacion_id, session_id);


--
-- Name: webchat_visitantes webchat_visitantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_visitantes
    ADD CONSTRAINT webchat_visitantes_pkey PRIMARY KEY (organizacion_id, session_id);


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
-- Name: messages_2025_10_31 messages_2025_10_31_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_10_31
    ADD CONSTRAINT messages_2025_10_31_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_11_01 messages_2025_11_01_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_11_01
    ADD CONSTRAINT messages_2025_11_01_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_11_02 messages_2025_11_02_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_11_02
    ADD CONSTRAINT messages_2025_11_02_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_11_03 messages_2025_11_03_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_11_03
    ADD CONSTRAINT messages_2025_11_03_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_11_04 messages_2025_11_04_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_11_04
    ADD CONSTRAINT messages_2025_11_04_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_11_05 messages_2025_11_05_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_11_05
    ADD CONSTRAINT messages_2025_11_05_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2025_11_06 messages_2025_11_06_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2025_11_06
    ADD CONSTRAINT messages_2025_11_06_pkey PRIMARY KEY (id, inserted_at);


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
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


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
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_idempotency_key_key; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_idempotency_key_key UNIQUE (idempotency_key);


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
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


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
-- Name: actividades_oportunidad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX actividades_oportunidad_idx ON public.actividades USING btree (organizacion_id, oportunidad_id);


--
-- Name: actividades_org_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX actividades_org_estado_idx ON public.actividades USING btree (organizacion_id, estado, prioridad);


--
-- Name: adjuntos_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX adjuntos_org_id_id_key ON public.adjuntos USING btree (organizacion_id, id);


--
-- Name: agentes_canal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agentes_canal_idx ON public.agentes USING btree (canal);


--
-- Name: agentes_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agentes_org_id_id_key ON public.agentes USING btree (organizacion_id, id);


--
-- Name: agentes_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agentes_org_idx ON public.agentes USING btree (organizacion_id, creado_en DESC);


--
-- Name: asignaciones_vendedores_ack_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asignaciones_vendedores_ack_idx ON public.asignaciones_vendedores USING btree (aceptado_en);


--
-- Name: asignaciones_vendedores_ack_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asignaciones_vendedores_ack_user_idx ON public.asignaciones_vendedores USING btree (aceptado_por_usuario_id);


--
-- Name: asignaciones_vendedores_notif_sid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asignaciones_vendedores_notif_sid_idx ON public.asignaciones_vendedores USING btree (notificacion_message_sid);


--
-- Name: asignaciones_vendedores_whatsapp_conversacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asignaciones_vendedores_whatsapp_conversacion_idx ON public.asignaciones_vendedores USING btree (conversacion_id);


--
-- Name: asignaciones_vendedores_whatsapp_oportunidad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asignaciones_vendedores_whatsapp_oportunidad_idx ON public.asignaciones_vendedores USING btree (oportunidad_id);


--
-- Name: asignaciones_vendedores_whatsapp_vendedor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asignaciones_vendedores_whatsapp_vendedor_idx ON public.asignaciones_vendedores USING btree (vendedor_usuario_id);


--
-- Name: busquedas_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX busquedas_org_id_id_key ON public.busquedas USING btree (organizacion_id, id);


--
-- Name: busquedas_organizacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX busquedas_organizacion_idx ON public.busquedas USING btree (organizacion_id, creado_en DESC);


--
-- Name: calendar_availability_patterns_org_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_availability_patterns_org_resource_idx ON public.calendar_availability_patterns USING btree (organizacion_id, resource_id);


--
-- Name: calendar_availability_patterns_resource_weekday_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_availability_patterns_resource_weekday_idx ON public.calendar_availability_patterns USING btree (resource_id, weekday) WHERE is_active;


--
-- Name: calendar_bookings_conversation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_bookings_conversation_idx ON public.calendar_bookings USING btree (conversacion_id);


--
-- Name: calendar_bookings_hold_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_bookings_hold_id_idx ON public.calendar_bookings USING btree (hold_id);


--
-- Name: calendar_bookings_org_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_bookings_org_resource_idx ON public.calendar_bookings USING btree (organizacion_id, resource_id, start_at);


--
-- Name: calendar_bookings_tarjeta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_bookings_tarjeta_idx ON public.calendar_bookings USING btree (tarjeta_id);


--
-- Name: calendar_bookings_unique_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX calendar_bookings_unique_slot ON public.calendar_bookings USING btree (resource_id, start_at) WHERE (status = 'confirmed'::text);


--
-- Name: calendar_exceptions_org_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_exceptions_org_resource_idx ON public.calendar_exceptions USING btree (organizacion_id, resource_id, start_at);


--
-- Name: calendar_exceptions_resource_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_exceptions_resource_kind_idx ON public.calendar_exceptions USING btree (resource_id, kind, start_at, end_at);


--
-- Name: calendar_resources_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX calendar_resources_org_id_id_key ON public.calendar_resources USING btree (organizacion_id, id);


--
-- Name: calendar_resources_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_resources_org_idx ON public.calendar_resources USING btree (organizacion_id, created_at DESC);


--
-- Name: calendar_resources_organizacion_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX calendar_resources_organizacion_slug_key ON public.calendar_resources USING btree (organizacion_id, slug);


--
-- Name: calendar_slot_holds_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_slot_holds_active_idx ON public.calendar_slot_holds USING btree (resource_id, start_at, expires_at) WHERE (status = 'active'::text);


--
-- Name: calendar_slot_holds_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX calendar_slot_holds_org_id_id_key ON public.calendar_slot_holds USING btree (organizacion_id, id);


--
-- Name: calendar_slot_holds_org_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_slot_holds_org_resource_idx ON public.calendar_slot_holds USING btree (organizacion_id, resource_id, start_at);


--
-- Name: calendar_slot_holds_resource_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_slot_holds_resource_start_idx ON public.calendar_slot_holds USING btree (resource_id, start_at);


--
-- Name: calendar_slot_holds_tarjeta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_slot_holds_tarjeta_idx ON public.calendar_slot_holds USING btree (tarjeta_id);


--
-- Name: campanas_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX campanas_org_id_id_key ON public.campanas USING btree (organizacion_id, id);


--
-- Name: catalog_document_embeddings_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_document_embeddings_embedding_idx ON public.catalog_document_embeddings USING ivfflat (embedding) WITH (lists='100');


--
-- Name: catalog_document_embeddings_org_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_document_embeddings_org_type_idx ON public.catalog_document_embeddings USING btree (organizacion_id, entity_type);


--
-- Name: catalog_embeddings_audit_organizacion_tipo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_embeddings_audit_organizacion_tipo_idx ON public.catalog_embeddings_audit USING btree (organizacion_id, tipo, creado_en DESC);


--
-- Name: catalog_item_prices_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_item_prices_item_idx ON public.catalog_item_prices USING btree (item_id, vigente_desde);


--
-- Name: catalog_item_prices_org_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_item_prices_org_item_idx ON public.catalog_item_prices USING btree (organizacion_id, item_id, creado_en DESC);


--
-- Name: catalog_item_prices_principal_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalog_item_prices_principal_org_idx ON public.catalog_item_prices USING btree (organizacion_id, item_id, moneda) WHERE es_principal;


--
-- Name: catalog_items_activo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_items_activo_idx ON public.catalog_items USING btree (activo, tipo);


--
-- Name: catalog_items_familia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_items_familia_idx ON public.catalog_items USING btree (familia_id);


--
-- Name: catalog_items_linea_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_items_linea_idx ON public.catalog_items USING btree (linea_id);


--
-- Name: catalog_items_modelo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_items_modelo_idx ON public.catalog_items USING btree (modelo_id);


--
-- Name: catalog_items_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalog_items_org_id_id_key ON public.catalog_items USING btree (organizacion_id, id);


--
-- Name: catalog_items_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_items_org_idx ON public.catalog_items USING btree (organizacion_id, actualizado_en DESC);


--
-- Name: catalog_items_organizacion_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalog_items_organizacion_slug_key ON public.catalog_items USING btree (organizacion_id, slug) WHERE (slug IS NOT NULL);


--
-- Name: catalog_tags_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalog_tags_org_id_id_key ON public.catalog_tags USING btree (organizacion_id, id);


--
-- Name: catalog_tags_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_tags_org_idx ON public.catalog_tags USING btree (organizacion_id, creado_en DESC);


--
-- Name: catalog_tags_organizacion_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalog_tags_organizacion_slug_key ON public.catalog_tags USING btree (organizacion_id, slug);


--
-- Name: cliente_documentos_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_documentos_cliente_idx ON public.cliente_documentos USING btree (cliente_id);


--
-- Name: cliente_documentos_cuenta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_documentos_cuenta_idx ON public.cliente_documentos USING btree (cuenta_id);


--
-- Name: cliente_documentos_oportunidad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_documentos_oportunidad_idx ON public.cliente_documentos USING btree (oportunidad_id);


--
-- Name: cliente_documentos_organizacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_documentos_organizacion_idx ON public.cliente_documentos USING btree (organizacion_id, cliente_id);


--
-- Name: cliente_documentos_tipo_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_documentos_tipo_estado_idx ON public.cliente_documentos USING btree (tipo, estado);


--
-- Name: cliente_portal_tokens_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_portal_tokens_cliente_idx ON public.cliente_portal_tokens USING btree (cliente_id);


--
-- Name: cliente_portal_tokens_cuenta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_portal_tokens_cuenta_idx ON public.cliente_portal_tokens USING btree (cuenta_id);


--
-- Name: cliente_portal_tokens_expira_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_portal_tokens_expira_idx ON public.cliente_portal_tokens USING btree (expira_en) WHERE (revocado = false);


--
-- Name: cliente_portal_tokens_oportunidad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_portal_tokens_oportunidad_idx ON public.cliente_portal_tokens USING btree (oportunidad_id);


--
-- Name: cliente_portal_tokens_organizacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_portal_tokens_organizacion_idx ON public.cliente_portal_tokens USING btree (organizacion_id, cliente_id);


--
-- Name: cliente_portal_tokens_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_portal_tokens_token_idx ON public.cliente_portal_tokens USING btree (token);


--
-- Name: cliente_responsables_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_responsables_cliente_idx ON public.cliente_responsables USING btree (cliente_id);


--
-- Name: cliente_responsables_cuenta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_responsables_cuenta_idx ON public.cliente_responsables USING btree (cuenta_id);


--
-- Name: cliente_responsables_oportunidad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_responsables_oportunidad_idx ON public.cliente_responsables USING btree (oportunidad_id);


--
-- Name: cliente_responsables_organizacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_responsables_organizacion_idx ON public.cliente_responsables USING btree (organizacion_id, cliente_id);


--
-- Name: clientes_contacto_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clientes_contacto_idx ON public.clientes USING btree (contacto_id);


--
-- Name: clientes_cuenta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clientes_cuenta_idx ON public.clientes USING btree (cuenta_id);


--
-- Name: clientes_oportunidad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clientes_oportunidad_idx ON public.clientes USING btree (oportunidad_id);


--
-- Name: clientes_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clientes_org_id_id_key ON public.clientes USING btree (organizacion_id, id);


--
-- Name: clientes_organizacion_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clientes_organizacion_id_idx ON public.clientes USING btree (organizacion_id);


--
-- Name: contactos_cuenta_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contactos_cuenta_id_idx ON public.contactos USING btree (cuenta_id);


--
-- Name: contactos_datos_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contactos_datos_gin ON public.contactos USING gin (contacto_datos);


--
-- Name: contactos_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contactos_org_id_id_key ON public.contactos USING btree (organizacion_id, id);


--
-- Name: contactos_organizacion_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contactos_organizacion_id_idx ON public.contactos USING btree (organizacion_id);


--
-- Name: conversaciones_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conversaciones_org_id_id_key ON public.conversaciones USING btree (organizacion_id, id);


--
-- Name: conversation_summaries_contacto_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_summaries_contacto_id_idx ON public.conversation_summaries USING btree (contacto_id);


--
-- Name: conversation_summaries_conversacion_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_summaries_conversacion_id_idx ON public.conversation_summaries USING btree (conversacion_id);


--
-- Name: cotizacion_items_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cotizacion_items_org_idx ON public.cotizacion_items USING btree (organizacion_id, cotizacion_id);


--
-- Name: cotizaciones_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cotizaciones_org_id_id_key ON public.cotizaciones USING btree (organizacion_id, id);


--
-- Name: cuentas_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cuentas_org_id_id_key ON public.cuentas USING btree (organizacion_id, id);


--
-- Name: cuentas_organizacion_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cuentas_organizacion_id_idx ON public.cuentas USING btree (organizacion_id);


--
-- Name: cuentas_propietario_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cuentas_propietario_idx ON public.cuentas USING btree (organizacion_id, propietario_usuario_id);


--
-- Name: custom_fields_org_agente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_fields_org_agente_idx ON public.custom_fields USING btree (organizacion_id, agente_id);


--
-- Name: departamentos_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX departamentos_org_id_id_key ON public.departamentos USING btree (organizacion_id, id);


--
-- Name: etapas_pipeline_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX etapas_pipeline_org_id_id_key ON public.etapas_pipeline USING btree (organizacion_id, id);


--
-- Name: etapas_pipeline_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX etapas_pipeline_org_idx ON public.etapas_pipeline USING btree (organizacion_id, orden);


--
-- Name: familias_productos_unq_org_linea_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX familias_productos_unq_org_linea_nombre ON public.familias_productos USING btree (organizacion_id, linea_id, lower(nombre));


--
-- Name: identidades_canal_org_canal_externo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX identidades_canal_org_canal_externo_key ON public.identidades_canal USING btree (organizacion_id, canal, id_externo);


--
-- Name: identidades_canal_org_contacto_canal_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX identidades_canal_org_contacto_canal_key ON public.identidades_canal USING btree (organizacion_id, contacto_id, canal);


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
-- Name: idx_empleados_es_vendedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empleados_es_vendedor ON public.empleados USING btree (es_vendedor, ultimo_lead_asignado_en);


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
-- Name: idx_puestos_departamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_puestos_departamento ON public.puestos USING btree (departamento_id);


--
-- Name: idx_puestos_departamento_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_puestos_departamento_nombre ON public.puestos USING btree (departamento_id, lower(nombre));


--
-- Name: idx_secretos_clave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secretos_clave ON public.secretos USING btree (clave);


--
-- Name: idx_user_roles_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user ON public.usuarios_roles USING btree (usuario_id);


--
-- Name: idx_webchat_session_closures_closed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_session_closures_closed_at ON public.webchat_session_closures USING btree (closed_at);


--
-- Name: idx_webchat_session_closures_contacto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_session_closures_contacto ON public.webchat_session_closures USING btree (contacto_id);


--
-- Name: idx_webchat_visitantes_contacto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_visitantes_contacto ON public.webchat_visitantes USING btree (contacto_id);


--
-- Name: idx_webchat_visitantes_cvegeo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_visitantes_cvegeo ON public.webchat_visitantes USING btree (cvegeo);


--
-- Name: idx_webchat_visitantes_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_visitantes_estado ON public.webchat_visitantes USING btree (cve_ent);


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
-- Name: ix_propiedad_capas_desarrollo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_capas_desarrollo ON public.propiedad_capas USING btree (desarrollo_id);


--
-- Name: ix_propiedad_departamentos_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_departamentos_geom ON public.propiedad_departamentos USING gist (geom);


--
-- Name: ix_propiedad_departamentos_nivel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_departamentos_nivel ON public.propiedad_departamentos USING btree (nivel_id, status);


--
-- Name: ix_propiedad_desarrollos_organizacion_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_desarrollos_organizacion_status ON public.propiedad_desarrollos USING btree (organizacion_id, status);


--
-- Name: ix_propiedad_niveles_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_niveles_geom ON public.propiedad_niveles USING gist (geom);


--
-- Name: ix_propiedad_niveles_propiedad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_niveles_propiedad ON public.propiedad_niveles USING btree (propiedad_id, nivel);


--
-- Name: ix_propiedad_poligonos_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_poligonos_geom ON public.propiedad_poligonos USING gist (geom);


--
-- Name: ix_propiedad_poligonos_organizacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_poligonos_organizacion ON public.propiedad_poligonos USING btree (organizacion_id);


--
-- Name: ix_propiedad_poligonos_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_poligonos_target ON public.propiedad_poligonos USING btree (target_type, target_id);


--
-- Name: ix_propiedad_unidades_desarrollo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_unidades_desarrollo ON public.propiedad_unidades USING btree (desarrollo_id);


--
-- Name: ix_propiedad_unidades_familia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_unidades_familia ON public.propiedad_unidades USING btree (familia_id);


--
-- Name: ix_propiedad_unidades_linea; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_unidades_linea ON public.propiedad_unidades USING btree (linea_id);


--
-- Name: ix_propiedad_unidades_modelo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_unidades_modelo ON public.propiedad_unidades USING btree (modelo_id);


--
-- Name: ix_propiedad_unidades_nivel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_unidades_nivel ON public.propiedad_unidades USING btree (nivel_id, status);


--
-- Name: ix_propiedad_unidades_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_propiedad_unidades_tipo ON public.propiedad_unidades USING btree (tipo_id);


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
-- Name: leads_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leads_org_id_id_key ON public.leads USING btree (organizacion_id, id);


--
-- Name: lineas_de_negocio_unq_org_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lineas_de_negocio_unq_org_nombre ON public.lineas_de_negocio USING btree (organizacion_id, lower(nombre));


--
-- Name: logos_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX logos_created_idx ON public.logos USING btree (created_at DESC);


--
-- Name: mensajes_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mensajes_org_id_id_key ON public.mensajes USING btree (organizacion_id, id);


--
-- Name: modelos_productos_unq_org_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX modelos_productos_unq_org_nombre ON public.modelos_productos USING btree (organizacion_id, lower(nombre));


--
-- Name: oportunidad_historial_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oportunidad_historial_org_idx ON public.oportunidad_etapas_historial USING btree (organizacion_id, oportunidad_id, cambiado_en DESC);


--
-- Name: oportunidades_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX oportunidades_org_id_id_key ON public.oportunidades USING btree (organizacion_id, id);


--
-- Name: oportunidades_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oportunidades_org_idx ON public.oportunidades USING btree (organizacion_id, etapa_id);


--
-- Name: oportunidades_propietario_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oportunidades_propietario_idx ON public.oportunidades USING btree (organizacion_id, propietario_usuario_id);


--
-- Name: panel_calendar_settings_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX panel_calendar_settings_org_idx ON public.panel_calendar_settings USING btree (organizacion_id, updated_at DESC);


--
-- Name: panel_email_templates_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX panel_email_templates_org_idx ON public.panel_email_templates USING btree (organizacion_id, updated_at DESC);


--
-- Name: permisos_org_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permisos_org_codigo_key ON public.permisos USING btree (organizacion_id, codigo);


--
-- Name: permisos_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permisos_org_id_id_key ON public.permisos USING btree (organizacion_id, id);


--
-- Name: producto_metadata_schemes_org_name_unq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX producto_metadata_schemes_org_name_unq ON public.producto_metadata_schemes USING btree (organizacion_id, lower(name));


--
-- Name: productos_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX productos_org_id_id_key ON public.productos USING btree (organizacion_id, id);


--
-- Name: prompt_bindings_agente_activo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prompt_bindings_agente_activo_idx ON public.prompt_bindings USING btree (agente_id) WHERE (activo = true);


--
-- Name: prompt_bindings_org_agente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prompt_bindings_org_agente_idx ON public.prompt_bindings USING btree (organizacion_id, agente_id);


--
-- Name: prompt_versions_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prompt_versions_org_id_id_key ON public.prompt_versions USING btree (organizacion_id, id);


--
-- Name: prompt_versions_org_prompt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prompt_versions_org_prompt_idx ON public.prompt_versions USING btree (organizacion_id, prompt_id, creado_en DESC);


--
-- Name: prompts_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prompts_org_id_id_key ON public.prompts USING btree (organizacion_id, id);


--
-- Name: prompts_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prompts_org_idx ON public.prompts USING btree (organizacion_id, actualizado_en DESC);


--
-- Name: propiedad_desarrollos_mix_items_mix_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX propiedad_desarrollos_mix_items_mix_idx ON public.propiedad_desarrollos_mix_items USING btree (mix_id);


--
-- Name: propiedad_desarrollos_mix_organizacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX propiedad_desarrollos_mix_organizacion_idx ON public.propiedad_desarrollos_mix USING btree (organizacion_id);


--
-- Name: prospeccion_buscador_jobs_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prospeccion_buscador_jobs_org_id_id_key ON public.prospeccion_buscador_jobs USING btree (organizacion_id, id);


--
-- Name: prospeccion_buscador_jobs_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_buscador_jobs_org_idx ON public.prospeccion_buscador_jobs USING btree (organizacion_id, created_at DESC);


--
-- Name: prospeccion_buscador_jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_buscador_jobs_status_idx ON public.prospeccion_buscador_jobs USING btree (organizacion_id, status, created_at DESC);


--
-- Name: prospeccion_buscador_resultados_job_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_buscador_resultados_job_idx ON public.prospeccion_buscador_resultados USING btree (job_id);


--
-- Name: prospeccion_buscador_resultados_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_buscador_resultados_org_idx ON public.prospeccion_buscador_resultados USING btree (organizacion_id, creado_en DESC);


--
-- Name: prospeccion_contacto_batch_campana_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contacto_batch_campana_idx ON public.prospeccion_contacto_batch USING btree (organizacion_id, campana_id, creado_en DESC);


--
-- Name: prospeccion_contacto_batch_lista_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contacto_batch_lista_idx ON public.prospeccion_contacto_batch USING btree (organizacion_id, lista_id, creado_en DESC);


--
-- Name: prospeccion_contacto_batch_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prospeccion_contacto_batch_org_id_id_key ON public.prospeccion_contacto_batch USING btree (organizacion_id, id);


--
-- Name: prospeccion_contacto_batch_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contacto_batch_org_idx ON public.prospeccion_contacto_batch USING btree (organizacion_id, creado_en DESC);


--
-- Name: prospeccion_contacto_envio_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contacto_envio_batch_idx ON public.prospeccion_contacto_envio USING btree (batch_id, canal, estado);


--
-- Name: prospeccion_contacto_envio_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prospeccion_contacto_envio_org_id_id_key ON public.prospeccion_contacto_envio USING btree (organizacion_id, id);


--
-- Name: prospeccion_contacto_envio_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contacto_envio_org_idx ON public.prospeccion_contacto_envio USING btree (organizacion_id, programado_en);


--
-- Name: prospeccion_contacto_envio_prospecto_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contacto_envio_prospecto_idx ON public.prospeccion_contacto_envio USING btree (prospecto_id, canal);


--
-- Name: prospeccion_contacto_listas_nombre_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contacto_listas_nombre_idx ON public.prospeccion_contacto_listas USING btree (organizacion_id, lower(nombre));


--
-- Name: prospeccion_contacto_listas_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prospeccion_contacto_listas_org_id_id_key ON public.prospeccion_contacto_listas USING btree (organizacion_id, id);


--
-- Name: prospeccion_contacto_listas_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contacto_listas_org_idx ON public.prospeccion_contacto_listas USING btree (organizacion_id, creado_en DESC);


--
-- Name: prospeccion_contacto_templates_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contacto_templates_org_idx ON public.prospeccion_contacto_templates USING btree (organizacion_id, creado_en DESC);


--
-- Name: prospeccion_contacto_templates_org_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prospeccion_contacto_templates_org_slug_key ON public.prospeccion_contacto_templates USING btree (organizacion_id, slug);


--
-- Name: prospeccion_contactos_log_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contactos_log_batch_idx ON public.prospeccion_contactos_log USING btree (batch_id);


--
-- Name: prospeccion_contactos_log_envio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contactos_log_envio_idx ON public.prospeccion_contactos_log USING btree (envio_id);


--
-- Name: prospeccion_contactos_log_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contactos_log_org_idx ON public.prospeccion_contactos_log USING btree (organizacion_id, creado_en DESC);


--
-- Name: prospeccion_contactos_log_prospecto_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_contactos_log_prospecto_idx ON public.prospeccion_contactos_log USING btree (prospecto_id, canal);


--
-- Name: prospeccion_prospectos_audit_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_prospectos_audit_org_idx ON public.prospeccion_prospectos_audit USING btree (organizacion_id, realizado_en DESC);


--
-- Name: prospeccion_prospectos_audit_prospecto_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_prospectos_audit_prospecto_idx ON public.prospeccion_prospectos_audit USING btree (prospecto_id, realizado_en DESC);


--
-- Name: prospeccion_prospectos_busqueda_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_prospectos_busqueda_idx ON public.prospeccion_prospectos USING btree (busqueda_id, fuente);


--
-- Name: prospeccion_prospectos_fuente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_prospectos_fuente_idx ON public.prospeccion_prospectos USING btree (fuente, resultado_id);


--
-- Name: prospeccion_prospectos_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prospeccion_prospectos_org_id_id_key ON public.prospeccion_prospectos USING btree (organizacion_id, id);


--
-- Name: prospeccion_prospectos_organizacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospeccion_prospectos_organizacion_idx ON public.prospeccion_prospectos USING btree (organizacion_id, creado_en DESC);


--
-- Name: puestos_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX puestos_org_id_id_key ON public.puestos USING btree (organizacion_id, id);


--
-- Name: quote_templates_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quote_templates_active_idx ON public.quote_templates USING btree (is_active, updated_at DESC);


--
-- Name: quote_templates_org_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX quote_templates_org_slug_key ON public.quote_templates USING btree (organizacion_id, slug);


--
-- Name: recursos_media_objeto_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recursos_media_objeto_idx ON public.recursos_media USING btree (organizacion_id, objeto_type, objeto_id);


--
-- Name: recursos_media_portada_unq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX recursos_media_portada_unq ON public.recursos_media USING btree (organizacion_id, objeto_type, objeto_id) WHERE ((tipo = 'portada'::text) AND activo);


--
-- Name: resultados_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX resultados_org_id_id_key ON public.resultados USING btree (organizacion_id, id);


--
-- Name: resultados_organizacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resultados_organizacion_idx ON public.resultados USING btree (organizacion_id, creado_en DESC);


--
-- Name: roles_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_org_id_id_key ON public.roles USING btree (organizacion_id, id);


--
-- Name: roles_organizacion_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roles_organizacion_id_idx ON public.roles USING btree (organizacion_id);


--
-- Name: secretos_org_clave_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX secretos_org_clave_key ON public.secretos USING btree (organizacion_id, clave);


--
-- Name: tags_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tags_org_id_id_key ON public.tags USING btree (organizacion_id, id);


--
-- Name: ticket_comentarios_organizacion_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_comentarios_organizacion_id_idx ON public.ticket_comentarios USING btree (organizacion_id, ticket_id, creado_en);


--
-- Name: tickets_org_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_org_estado_idx ON public.tickets USING btree (organizacion_id, estado, prioridad);


--
-- Name: tickets_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tickets_org_id_id_key ON public.tickets USING btree (organizacion_id, id);


--
-- Name: uniq_ejecuciones_response_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_ejecuciones_response_id ON public.ejecuciones_asistente USING btree (response_id) WHERE (response_id IS NOT NULL);


--
-- Name: uniq_eventos_entrega_msg_evt_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_eventos_entrega_msg_evt_ts ON public.eventos_entrega USING btree (mensaje_id, evento, proveedor_ts);


--
-- Name: uniq_mensajes_twilio_sid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_mensajes_twilio_sid ON public.mensajes USING btree (twilio_message_sid) WHERE (twilio_message_sid IS NOT NULL);


--
-- Name: usuarios_org_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_org_id_id_key ON public.usuarios USING btree (organizacion_id, id);


--
-- Name: usuarios_organizacion_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usuarios_organizacion_id_idx ON public.usuarios USING btree (organizacion_id);


--
-- Name: usuarios_roles_organizacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usuarios_roles_organizacion_idx ON public.usuarios_roles USING btree (organizacion_id, usuario_id);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_10_31_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_10_31_inserted_at_topic_idx ON realtime.messages_2025_10_31 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_11_01_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_11_01_inserted_at_topic_idx ON realtime.messages_2025_11_01 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_11_02_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_11_02_inserted_at_topic_idx ON realtime.messages_2025_11_02 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_11_03_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_11_03_inserted_at_topic_idx ON realtime.messages_2025_11_03 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_11_04_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_11_04_inserted_at_topic_idx ON realtime.messages_2025_11_04 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_11_05_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_11_05_inserted_at_topic_idx ON realtime.messages_2025_11_05 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2025_11_06_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2025_11_06_inserted_at_topic_idx ON realtime.messages_2025_11_06 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


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
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


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
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: messages_2025_10_31_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_10_31_inserted_at_topic_idx;


--
-- Name: messages_2025_10_31_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_10_31_pkey;


--
-- Name: messages_2025_11_01_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_11_01_inserted_at_topic_idx;


--
-- Name: messages_2025_11_01_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_11_01_pkey;


--
-- Name: messages_2025_11_02_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_11_02_inserted_at_topic_idx;


--
-- Name: messages_2025_11_02_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_11_02_pkey;


--
-- Name: messages_2025_11_03_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_11_03_inserted_at_topic_idx;


--
-- Name: messages_2025_11_03_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_11_03_pkey;


--
-- Name: messages_2025_11_04_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_11_04_inserted_at_topic_idx;


--
-- Name: messages_2025_11_04_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_11_04_pkey;


--
-- Name: messages_2025_11_05_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_11_05_inserted_at_topic_idx;


--
-- Name: messages_2025_11_05_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_11_05_pkey;


--
-- Name: messages_2025_11_06_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2025_11_06_inserted_at_topic_idx;


--
-- Name: messages_2025_11_06_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2025_11_06_pkey;


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.manejar_usuario_auth_nuevo();


--
-- Name: calendar_availability_patterns calendar_availability_patterns_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_availability_patterns_touch_updated_at BEFORE UPDATE ON public.calendar_availability_patterns FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: calendar_bookings calendar_bookings_sync_stage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_bookings_sync_stage AFTER INSERT OR UPDATE OF status ON public.calendar_bookings FOR EACH ROW EXECUTE FUNCTION public.tg_calendar_bookings_sync_stage();


--
-- Name: calendar_bookings calendar_bookings_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_bookings_touch_updated_at BEFORE UPDATE ON public.calendar_bookings FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: calendar_exceptions calendar_exceptions_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_exceptions_touch_updated_at BEFORE UPDATE ON public.calendar_exceptions FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: calendar_resources calendar_resources_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_resources_touch_updated_at BEFORE UPDATE ON public.calendar_resources FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: calendar_slot_holds calendar_slot_holds_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_slot_holds_touch_updated_at BEFORE UPDATE ON public.calendar_slot_holds FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: catalog_item_prices catalog_item_prices_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER catalog_item_prices_touch_updated_at BEFORE UPDATE ON public.catalog_item_prices FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: catalog_items catalog_items_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER catalog_items_touch_updated_at BEFORE UPDATE ON public.catalog_items FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: cliente_documentos cliente_documentos_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cliente_documentos_touch_updated_at BEFORE UPDATE ON public.cliente_documentos FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: cliente_portal_tokens cliente_portal_tokens_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cliente_portal_tokens_touch_updated_at BEFORE UPDATE ON public.cliente_portal_tokens FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: cliente_responsables cliente_responsables_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cliente_responsables_touch_updated_at BEFORE UPDATE ON public.cliente_responsables FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: clientes clientes_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clientes_touch_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: contactos contactos_auto_asignacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contactos_auto_asignacion BEFORE INSERT OR UPDATE ON public.contactos FOR EACH ROW EXECUTE FUNCTION public.tg_contactos_auto_asignacion();


--
-- Name: contactos contactos_auto_precalificado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contactos_auto_precalificado AFTER INSERT OR UPDATE OF nombre_completo, correo, telefono_e164, company_name ON public.contactos FOR EACH ROW EXECUTE FUNCTION public.tg_contactos_auto_precalificado();

ALTER TABLE public.contactos DISABLE TRIGGER contactos_auto_precalificado;


--
-- Name: contactos contactos_captura_estado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contactos_captura_estado BEFORE INSERT OR UPDATE OF nombre_completo, correo, telefono_e164, notes, necesidad_proposito ON public.contactos FOR EACH ROW EXECUTE FUNCTION public.tg_contactos_captura_estado();


--
-- Name: conversaciones conversaciones_auto_tarjeta; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversaciones_auto_tarjeta AFTER INSERT ON public.conversaciones FOR EACH ROW EXECUTE FUNCTION public.tg_conversaciones_auto_tarjeta();


--
-- Name: logos logos_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER logos_touch_updated_at BEFORE UPDATE ON public.logos FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: producto_metadata_schemes producto_metadata_schemes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER producto_metadata_schemes_updated_at BEFORE UPDATE ON public.producto_metadata_schemes FOR EACH ROW EXECUTE FUNCTION public.producto_metadata_schemes_updated_at_trg();


--
-- Name: propiedad_capas propiedad_capas_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER propiedad_capas_touch_updated_at BEFORE UPDATE ON public.propiedad_capas FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: propiedad_departamentos propiedad_departamentos_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER propiedad_departamentos_touch_updated_at BEFORE UPDATE ON public.propiedad_departamentos FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: propiedad_niveles propiedad_niveles_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER propiedad_niveles_touch_updated_at BEFORE UPDATE ON public.propiedad_niveles FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: propiedad_poligonos propiedad_poligonos_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER propiedad_poligonos_touch_updated_at BEFORE UPDATE ON public.propiedad_poligonos FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: propiedad_unidades propiedad_unidades_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER propiedad_unidades_touch_updated_at BEFORE UPDATE ON public.propiedad_unidades FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: quote_templates quote_templates_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER quote_templates_touch_updated_at BEFORE UPDATE ON public.quote_templates FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: actividades t_actividades_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_actividades_set_org BEFORE INSERT ON public.actividades FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: adjuntos t_adjuntos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_adjuntos_set_org BEFORE INSERT ON public.adjuntos FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_mensaje_id();


--
-- Name: agentes t_agentes_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_agentes_set_org BEFORE INSERT ON public.agentes FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: archivos t_archivos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_archivos_set_org BEFORE INSERT ON public.archivos FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: audit_logs t_audit_logs_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_audit_logs_set_org BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: busquedas t_busquedas_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_busquedas_set_org BEFORE INSERT ON public.busquedas FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: calendar_availability_patterns t_calendar_availability_patterns_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_calendar_availability_patterns_set_org BEFORE INSERT ON public.calendar_availability_patterns FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: calendar_bookings t_calendar_bookings_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_calendar_bookings_set_org BEFORE INSERT ON public.calendar_bookings FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: calendar_exceptions t_calendar_exceptions_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_calendar_exceptions_set_org BEFORE INSERT ON public.calendar_exceptions FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: calendar_resources t_calendar_resources_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_calendar_resources_set_org BEFORE INSERT ON public.calendar_resources FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: calendar_slot_holds t_calendar_slot_holds_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_calendar_slot_holds_set_org BEFORE INSERT ON public.calendar_slot_holds FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: campanas t_campanas_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_campanas_set_org BEFORE INSERT ON public.campanas FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: catalog_item_prices t_catalog_item_prices_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_catalog_item_prices_set_org BEFORE INSERT ON public.catalog_item_prices FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: catalog_item_tags t_catalog_item_tags_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_catalog_item_tags_set_org BEFORE INSERT ON public.catalog_item_tags FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: catalog_items t_catalog_items_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_catalog_items_set_org BEFORE INSERT ON public.catalog_items FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: catalog_tags t_catalog_tags_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_catalog_tags_set_org BEFORE INSERT ON public.catalog_tags FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: cliente_documentos t_cliente_documentos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_cliente_documentos_set_org BEFORE INSERT ON public.cliente_documentos FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: cliente_portal_tokens t_cliente_portal_tokens_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_cliente_portal_tokens_set_org BEFORE INSERT ON public.cliente_portal_tokens FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: cliente_responsables t_cliente_responsables_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_cliente_responsables_set_org BEFORE INSERT ON public.cliente_responsables FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: clientes t_clientes_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_clientes_set_org BEFORE INSERT ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: conversaciones_controles t_conversaciones_controles_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_conversaciones_controles_set_org BEFORE INSERT ON public.conversaciones_controles FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_conversacion_id();


--
-- Name: conversaciones_insights t_conversaciones_insights_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_conversaciones_insights_set_org BEFORE INSERT ON public.conversaciones_insights FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_conversacion_id();


--
-- Name: conversaciones t_conversaciones_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_conversaciones_set_org BEFORE INSERT ON public.conversaciones FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_contacto_id();


--
-- Name: conversation_summaries t_conversation_summaries_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_conversation_summaries_set_org BEFORE INSERT ON public.conversation_summaries FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: cotizacion_items t_cotizacion_items_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_cotizacion_items_set_org BEFORE INSERT ON public.cotizacion_items FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_cotizacion_id();


--
-- Name: cotizaciones t_cotizaciones_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_cotizaciones_set_org BEFORE INSERT ON public.cotizaciones FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: cuentas t_cuentas_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_cuentas_set_org BEFORE INSERT ON public.cuentas FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: custom_fields t_custom_fields_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_custom_fields_set_org BEFORE INSERT ON public.custom_fields FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: departamentos t_departamentos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_departamentos_set_org BEFORE INSERT ON public.departamentos FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: ejecuciones_asistente t_ejecuciones_asistente_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_ejecuciones_asistente_set_org BEFORE INSERT ON public.ejecuciones_asistente FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_conversacion_id();


--
-- Name: empleados t_empleados_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_empleados_set_org BEFORE INSERT ON public.empleados FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_usuario_id();


--
-- Name: etapas_pipeline t_etapas_pipeline_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_etapas_pipeline_set_org BEFORE INSERT ON public.etapas_pipeline FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: eventos_auditoria t_eventos_auditoria_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_eventos_auditoria_set_org BEFORE INSERT ON public.eventos_auditoria FOR EACH ROW EXECUTE FUNCTION public.tg_set_eventos_auditoria_organizacion_id();


--
-- Name: eventos_entrega t_eventos_entrega_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_eventos_entrega_set_org BEFORE INSERT ON public.eventos_entrega FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_mensaje_id();


--
-- Name: identidades_canal t_identidades_canal_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_identidades_canal_set_org BEFORE INSERT ON public.identidades_canal FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_contacto_id();


--
-- Name: lead_eventos t_lead_eventos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_lead_eventos_set_org BEFORE INSERT ON public.lead_eventos FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_lead_id();


--
-- Name: leads t_leads_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_leads_set_org BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: llamadas t_llamadas_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_llamadas_set_org BEFORE INSERT ON public.llamadas FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_contacto_id();


--
-- Name: logos t_logos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_logos_set_org BEFORE INSERT ON public.logos FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: mensajes t_mensajes_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_mensajes_set_org BEFORE INSERT ON public.mensajes FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_conversacion_id();


--
-- Name: notas t_notas_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_notas_set_org BEFORE INSERT ON public.notas FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: oportunidad_etapas_historial t_oportunidad_etapas_historial_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_oportunidad_etapas_historial_set_org BEFORE INSERT ON public.oportunidad_etapas_historial FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: oportunidades t_oportunidades_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_oportunidades_set_org BEFORE INSERT ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: panel_calendar_settings t_panel_calendar_settings_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_panel_calendar_settings_set_org BEFORE INSERT ON public.panel_calendar_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: panel_email_templates t_panel_email_templates_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_panel_email_templates_set_org BEFORE INSERT ON public.panel_email_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: permisos t_permisos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_permisos_set_org BEFORE INSERT ON public.permisos FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: productos t_productos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_productos_set_org BEFORE INSERT ON public.productos FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prompt_bindings t_prompt_bindings_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prompt_bindings_set_org BEFORE INSERT ON public.prompt_bindings FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prompt_versions t_prompt_versions_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prompt_versions_set_org BEFORE INSERT ON public.prompt_versions FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prompts t_prompts_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prompts_set_org BEFORE INSERT ON public.prompts FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prospeccion_buscador_jobs t_prospeccion_buscador_jobs_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_buscador_jobs_set_org BEFORE INSERT ON public.prospeccion_buscador_jobs FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prospeccion_buscador_resultados t_prospeccion_buscador_resultados_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_buscador_resultados_set_org BEFORE INSERT ON public.prospeccion_buscador_resultados FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prospeccion_contacto_batch t_prospeccion_contacto_batch_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_contacto_batch_set_org BEFORE INSERT ON public.prospeccion_contacto_batch FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prospeccion_contacto_envio t_prospeccion_contacto_envio_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_contacto_envio_set_org BEFORE INSERT ON public.prospeccion_contacto_envio FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prospeccion_contacto_listas t_prospeccion_contacto_listas_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_contacto_listas_set_org BEFORE INSERT ON public.prospeccion_contacto_listas FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prospeccion_contacto_listas t_prospeccion_contacto_listas_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_contacto_listas_touch BEFORE UPDATE ON public.prospeccion_contacto_listas FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: prospeccion_contacto_templates t_prospeccion_contacto_templates_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_contacto_templates_set_org BEFORE INSERT ON public.prospeccion_contacto_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prospeccion_contacto_templates t_prospeccion_contacto_templates_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_contacto_templates_touch BEFORE UPDATE ON public.prospeccion_contacto_templates FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: prospeccion_contactos_log t_prospeccion_contactos_log_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_contactos_log_set_org BEFORE INSERT ON public.prospeccion_contactos_log FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prospeccion_prospectos t_prospeccion_prospectos_actor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_prospectos_actor BEFORE INSERT OR UPDATE ON public.prospeccion_prospectos FOR EACH ROW EXECUTE FUNCTION public.tg_prospecto_set_actor();


--
-- Name: prospeccion_prospectos t_prospeccion_prospectos_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_prospectos_audit AFTER INSERT OR DELETE OR UPDATE ON public.prospeccion_prospectos FOR EACH ROW EXECUTE FUNCTION public.tg_prospeccion_prospectos_audit();


--
-- Name: prospeccion_prospectos_audit t_prospeccion_prospectos_audit_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_prospectos_audit_set_org BEFORE INSERT ON public.prospeccion_prospectos_audit FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prospeccion_prospectos t_prospeccion_prospectos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_prospectos_set_org BEFORE INSERT ON public.prospeccion_prospectos FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: prospeccion_prospectos t_prospeccion_prospectos_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_prospeccion_prospectos_touch BEFORE UPDATE ON public.prospeccion_prospectos FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();


--
-- Name: puestos t_puestos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_puestos_set_org BEFORE INSERT ON public.puestos FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: quote_templates t_quote_templates_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_quote_templates_set_org BEFORE INSERT ON public.quote_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: resultados t_resultados_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_resultados_set_org BEFORE INSERT ON public.resultados FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: roles t_roles_auto_codigo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_roles_auto_codigo BEFORE INSERT ON public.roles FOR EACH ROW EXECUTE FUNCTION public.roles_autofill_codigo();


--
-- Name: roles t_roles_guard_codigo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_roles_guard_codigo BEFORE INSERT ON public.roles FOR EACH ROW EXECUTE FUNCTION public.roles_before_insert_guard();


--
-- Name: roles_permisos t_roles_permisos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_roles_permisos_set_org BEFORE INSERT ON public.roles_permisos FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: roles t_roles_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_roles_set_org BEFORE INSERT ON public.roles FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: secretos t_secretos_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_secretos_set_org BEFORE INSERT ON public.secretos FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: secretos t_secretos_set_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_secretos_set_updated BEFORE UPDATE ON public.secretos FOR EACH ROW EXECUTE FUNCTION public.t_set_actualizado_en();


--
-- Name: taggings t_taggings_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_taggings_set_org BEFORE INSERT ON public.taggings FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: tags t_tags_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_tags_set_org BEFORE INSERT ON public.tags FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: ticket_comentarios t_ticket_comentarios_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_ticket_comentarios_set_org BEFORE INSERT ON public.ticket_comentarios FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: tickets t_tickets_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_tickets_set_org BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: usuarios_roles t_usuarios_roles_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_usuarios_roles_set_org BEFORE INSERT ON public.usuarios_roles FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: usuarios t_usuarios_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_usuarios_set_org BEFORE INSERT ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


--
-- Name: webchat_session_closures t_webchat_session_closures_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_webchat_session_closures_set_org BEFORE INSERT ON public.webchat_session_closures FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_contacto_id();


--
-- Name: webchat_visitantes t_webchat_visitantes_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_webchat_visitantes_set_org BEFORE INSERT ON public.webchat_visitantes FOR EACH ROW EXECUTE FUNCTION public.tg_set_org_from_contacto_id();


--
-- Name: webhooks_entrantes t_webhooks_entrantes_set_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER t_webhooks_entrantes_set_org BEFORE INSERT ON public.webhooks_entrantes FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();


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
-- Name: actividades actividades_asignado_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividades
    ADD CONSTRAINT actividades_asignado_usuario_org_fkey FOREIGN KEY (organizacion_id, asignado_a_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: actividades actividades_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividades
    ADD CONSTRAINT actividades_contacto_org_fkey FOREIGN KEY (organizacion_id, contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: actividades actividades_creado_por_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividades
    ADD CONSTRAINT actividades_creado_por_usuario_org_fkey FOREIGN KEY (organizacion_id, creado_por_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: actividades actividades_cuenta_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividades
    ADD CONSTRAINT actividades_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id) REFERENCES public.cuentas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: actividades actividades_oportunidad_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividades
    ADD CONSTRAINT actividades_oportunidad_org_fkey FOREIGN KEY (organizacion_id, oportunidad_id) REFERENCES public.oportunidades(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: actividades actividades_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividades
    ADD CONSTRAINT actividades_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: adjuntos adjuntos_mensaje_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos
    ADD CONSTRAINT adjuntos_mensaje_org_fkey FOREIGN KEY (organizacion_id, mensaje_id) REFERENCES public.mensajes(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: adjuntos adjuntos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos
    ADD CONSTRAINT adjuntos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: agentes agentes_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentes
    ADD CONSTRAINT agentes_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: archivos archivos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archivos
    ADD CONSTRAINT archivos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: archivos archivos_subido_por_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archivos
    ADD CONSTRAINT archivos_subido_por_usuario_org_fkey FOREIGN KEY (organizacion_id, subido_por_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: asignaciones_vendedores asignaciones_vendedores_whatsapp_aceptado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_vendedores
    ADD CONSTRAINT asignaciones_vendedores_whatsapp_aceptado_por_usuario_id_fkey FOREIGN KEY (aceptado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: asignaciones_vendedores asignaciones_vendedores_whatsapp_contacto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_vendedores
    ADD CONSTRAINT asignaciones_vendedores_whatsapp_contacto_id_fkey FOREIGN KEY (contacto_id) REFERENCES public.contactos(id) ON DELETE SET NULL;


--
-- Name: asignaciones_vendedores asignaciones_vendedores_whatsapp_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_vendedores
    ADD CONSTRAINT asignaciones_vendedores_whatsapp_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES public.conversaciones(id) ON DELETE CASCADE;


--
-- Name: asignaciones_vendedores asignaciones_vendedores_whatsapp_oportunidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_vendedores
    ADD CONSTRAINT asignaciones_vendedores_whatsapp_oportunidad_id_fkey FOREIGN KEY (oportunidad_id) REFERENCES public.oportunidades(id) ON DELETE CASCADE;


--
-- Name: asignaciones_vendedores asignaciones_vendedores_whatsapp_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_vendedores
    ADD CONSTRAINT asignaciones_vendedores_whatsapp_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: asignaciones_vendedores asignaciones_vendedores_whatsapp_vendedor_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_vendedores
    ADD CONSTRAINT asignaciones_vendedores_whatsapp_vendedor_usuario_id_fkey FOREIGN KEY (vendedor_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_usuario_org_fkey FOREIGN KEY (organizacion_id, usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: busquedas busquedas_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.busquedas
    ADD CONSTRAINT busquedas_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: calendar_availability_patterns calendar_availability_patterns_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_availability_patterns
    ADD CONSTRAINT calendar_availability_patterns_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: calendar_availability_patterns calendar_availability_patterns_resource_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_availability_patterns
    ADD CONSTRAINT calendar_availability_patterns_resource_org_fkey FOREIGN KEY (organizacion_id, resource_id) REFERENCES public.calendar_resources(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: calendar_bookings calendar_bookings_hold_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_bookings
    ADD CONSTRAINT calendar_bookings_hold_org_fkey FOREIGN KEY (organizacion_id, hold_id) REFERENCES public.calendar_slot_holds(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: calendar_bookings calendar_bookings_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_bookings
    ADD CONSTRAINT calendar_bookings_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: calendar_bookings calendar_bookings_resource_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_bookings
    ADD CONSTRAINT calendar_bookings_resource_org_fkey FOREIGN KEY (organizacion_id, resource_id) REFERENCES public.calendar_resources(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: calendar_exceptions calendar_exceptions_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_exceptions
    ADD CONSTRAINT calendar_exceptions_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: calendar_exceptions calendar_exceptions_resource_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_exceptions
    ADD CONSTRAINT calendar_exceptions_resource_org_fkey FOREIGN KEY (organizacion_id, resource_id) REFERENCES public.calendar_resources(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: calendar_resources calendar_resources_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_resources
    ADD CONSTRAINT calendar_resources_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: calendar_slot_holds calendar_slot_holds_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_slot_holds
    ADD CONSTRAINT calendar_slot_holds_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: calendar_slot_holds calendar_slot_holds_resource_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_slot_holds
    ADD CONSTRAINT calendar_slot_holds_resource_org_fkey FOREIGN KEY (organizacion_id, resource_id) REFERENCES public.calendar_resources(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: campanas campanas_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campanas
    ADD CONSTRAINT campanas_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: catalog_document_embeddings catalog_document_embeddings_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_document_embeddings
    ADD CONSTRAINT catalog_document_embeddings_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON UPDATE CASCADE;


--
-- Name: catalog_embeddings_audit catalog_embeddings_audit_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_embeddings_audit
    ADD CONSTRAINT catalog_embeddings_audit_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON UPDATE CASCADE;


--
-- Name: catalog_item_prices catalog_item_prices_item_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_prices
    ADD CONSTRAINT catalog_item_prices_item_org_fkey FOREIGN KEY (organizacion_id, item_id) REFERENCES public.catalog_items(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: catalog_item_prices catalog_item_prices_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_prices
    ADD CONSTRAINT catalog_item_prices_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: catalog_item_tags catalog_item_tags_item_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_tags
    ADD CONSTRAINT catalog_item_tags_item_org_fkey FOREIGN KEY (organizacion_id, item_id) REFERENCES public.catalog_items(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: catalog_item_tags catalog_item_tags_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_tags
    ADD CONSTRAINT catalog_item_tags_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: catalog_item_tags catalog_item_tags_tag_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_item_tags
    ADD CONSTRAINT catalog_item_tags_tag_org_fkey FOREIGN KEY (organizacion_id, tag_id) REFERENCES public.catalog_tags(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: catalog_items catalog_items_familia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_familia_id_fkey FOREIGN KEY (familia_id) REFERENCES public.familias_productos(id);


--
-- Name: catalog_items catalog_items_linea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_linea_id_fkey FOREIGN KEY (linea_id) REFERENCES public.lineas_de_negocio(id);


--
-- Name: catalog_items catalog_items_modelo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES public.modelos_productos(id);


--
-- Name: catalog_items catalog_items_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: catalog_tags catalog_tags_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_tags
    ADD CONSTRAINT catalog_tags_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: cliente_documentos cliente_documentos_cargado_por_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_documentos
    ADD CONSTRAINT cliente_documentos_cargado_por_org_fkey FOREIGN KEY (organizacion_id, cargado_por) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cliente_documentos cliente_documentos_cliente_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_documentos
    ADD CONSTRAINT cliente_documentos_cliente_org_fkey FOREIGN KEY (organizacion_id, cliente_id) REFERENCES public.clientes(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: cliente_documentos cliente_documentos_cuenta_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_documentos
    ADD CONSTRAINT cliente_documentos_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id) REFERENCES public.cuentas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cliente_documentos cliente_documentos_oportunidad_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_documentos
    ADD CONSTRAINT cliente_documentos_oportunidad_org_fkey FOREIGN KEY (organizacion_id, oportunidad_id) REFERENCES public.oportunidades(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cliente_documentos cliente_documentos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_documentos
    ADD CONSTRAINT cliente_documentos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: cliente_documentos cliente_documentos_validado_por_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_documentos
    ADD CONSTRAINT cliente_documentos_validado_por_org_fkey FOREIGN KEY (organizacion_id, validado_por) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cliente_portal_tokens cliente_portal_tokens_cliente_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_portal_tokens
    ADD CONSTRAINT cliente_portal_tokens_cliente_org_fkey FOREIGN KEY (organizacion_id, cliente_id) REFERENCES public.clientes(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: cliente_portal_tokens cliente_portal_tokens_creado_por_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_portal_tokens
    ADD CONSTRAINT cliente_portal_tokens_creado_por_org_fkey FOREIGN KEY (organizacion_id, creado_por) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cliente_portal_tokens cliente_portal_tokens_cuenta_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_portal_tokens
    ADD CONSTRAINT cliente_portal_tokens_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id) REFERENCES public.cuentas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cliente_portal_tokens cliente_portal_tokens_oportunidad_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_portal_tokens
    ADD CONSTRAINT cliente_portal_tokens_oportunidad_org_fkey FOREIGN KEY (organizacion_id, oportunidad_id) REFERENCES public.oportunidades(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cliente_portal_tokens cliente_portal_tokens_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_portal_tokens
    ADD CONSTRAINT cliente_portal_tokens_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: cliente_responsables cliente_responsables_cliente_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_responsables
    ADD CONSTRAINT cliente_responsables_cliente_org_fkey FOREIGN KEY (organizacion_id, cliente_id) REFERENCES public.clientes(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: cliente_responsables cliente_responsables_cuenta_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_responsables
    ADD CONSTRAINT cliente_responsables_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id) REFERENCES public.cuentas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cliente_responsables cliente_responsables_oportunidad_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_responsables
    ADD CONSTRAINT cliente_responsables_oportunidad_org_fkey FOREIGN KEY (organizacion_id, oportunidad_id) REFERENCES public.oportunidades(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cliente_responsables cliente_responsables_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_responsables
    ADD CONSTRAINT cliente_responsables_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: clientes clientes_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_contacto_org_fkey FOREIGN KEY (organizacion_id, contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: clientes clientes_cuenta_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id) REFERENCES public.cuentas(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: clientes clientes_oportunidad_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_oportunidad_org_fkey FOREIGN KEY (organizacion_id, oportunidad_id) REFERENCES public.oportunidades(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: clientes clientes_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: contactos contactos_cuenta_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contactos
    ADD CONSTRAINT contactos_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id) REFERENCES public.cuentas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: contactos contactos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contactos
    ADD CONSTRAINT contactos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: contactos contactos_propietario_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contactos
    ADD CONSTRAINT contactos_propietario_usuario_org_fkey FOREIGN KEY (organizacion_id, propietario_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: conversaciones conversaciones_asignado_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones
    ADD CONSTRAINT conversaciones_asignado_usuario_org_fkey FOREIGN KEY (organizacion_id, asignado_a_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: conversaciones conversaciones_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones
    ADD CONSTRAINT conversaciones_contacto_org_fkey FOREIGN KEY (organizacion_id, contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: conversaciones_controles conversaciones_controles_conversacion_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones_controles
    ADD CONSTRAINT conversaciones_controles_conversacion_org_fkey FOREIGN KEY (organizacion_id, conversacion_id) REFERENCES public.conversaciones(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: conversaciones_insights conversaciones_insights_conversacion_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones_insights
    ADD CONSTRAINT conversaciones_insights_conversacion_org_fkey FOREIGN KEY (organizacion_id, conversacion_id) REFERENCES public.conversaciones(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: conversaciones conversaciones_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones
    ADD CONSTRAINT conversaciones_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: conversaciones conversaciones_ultimo_mensaje_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversaciones
    ADD CONSTRAINT conversaciones_ultimo_mensaje_org_fkey FOREIGN KEY (organizacion_id, ultimo_mensaje_id) REFERENCES public.mensajes(organizacion_id, id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


--
-- Name: conversation_summaries conversation_summaries_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT conversation_summaries_contacto_org_fkey FOREIGN KEY (organizacion_id, contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: conversation_summaries conversation_summaries_conversacion_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT conversation_summaries_conversacion_org_fkey FOREIGN KEY (organizacion_id, conversacion_id) REFERENCES public.conversaciones(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: conversation_summaries conversation_summaries_creado_por_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT conversation_summaries_creado_por_usuario_org_fkey FOREIGN KEY (organizacion_id, creado_por_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: conversation_summaries conversation_summaries_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT conversation_summaries_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id);


--
-- Name: cotizacion_items cotizacion_items_cotizacion_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion_items
    ADD CONSTRAINT cotizacion_items_cotizacion_org_fkey FOREIGN KEY (organizacion_id, cotizacion_id) REFERENCES public.cotizaciones(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: cotizacion_items cotizacion_items_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion_items
    ADD CONSTRAINT cotizacion_items_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: cotizacion_items cotizacion_items_producto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion_items
    ADD CONSTRAINT cotizacion_items_producto_org_fkey FOREIGN KEY (organizacion_id, producto_id) REFERENCES public.productos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cotizaciones cotizaciones_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_contacto_org_fkey FOREIGN KEY (organizacion_id, contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cotizaciones cotizaciones_creada_por_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_creada_por_usuario_org_fkey FOREIGN KEY (organizacion_id, creada_por_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cotizaciones cotizaciones_cuenta_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id) REFERENCES public.cuentas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cotizaciones cotizaciones_oportunidad_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_oportunidad_org_fkey FOREIGN KEY (organizacion_id, oportunidad_id) REFERENCES public.oportunidades(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: cotizaciones cotizaciones_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: cuentas cuentas_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas
    ADD CONSTRAINT cuentas_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: cuentas cuentas_propietario_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas
    ADD CONSTRAINT cuentas_propietario_usuario_org_fkey FOREIGN KEY (organizacion_id, propietario_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: custom_fields custom_fields_agente_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_agente_org_fkey FOREIGN KEY (organizacion_id, agente_id) REFERENCES public.agentes(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: custom_fields custom_fields_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_fields
    ADD CONSTRAINT custom_fields_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: departamentos departamentos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departamentos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: departamentos departamentos_padre_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departamentos_padre_org_fkey FOREIGN KEY (organizacion_id, departamento_padre_id) REFERENCES public.departamentos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: ejecuciones_asistente ejecuciones_asistente_conversacion_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ejecuciones_asistente
    ADD CONSTRAINT ejecuciones_asistente_conversacion_org_fkey FOREIGN KEY (organizacion_id, conversacion_id) REFERENCES public.conversaciones(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: empleados empleados_departamento_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_departamento_org_fkey FOREIGN KEY (organizacion_id, departamento_id) REFERENCES public.departamentos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: empleados empleados_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: empleados empleados_puesto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_puesto_org_fkey FOREIGN KEY (organizacion_id, puesto_id) REFERENCES public.puestos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: empleados empleados_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_usuario_org_fkey FOREIGN KEY (organizacion_id, usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: etapas_pipeline etapas_pipeline_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_pipeline
    ADD CONSTRAINT etapas_pipeline_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: eventos_auditoria eventos_auditoria_actor_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_auditoria
    ADD CONSTRAINT eventos_auditoria_actor_usuario_org_fkey FOREIGN KEY (organizacion_id, actor_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: eventos_auditoria eventos_auditoria_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_auditoria
    ADD CONSTRAINT eventos_auditoria_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: eventos_entrega eventos_entrega_mensaje_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_entrega
    ADD CONSTRAINT eventos_entrega_mensaje_org_fkey FOREIGN KEY (organizacion_id, mensaje_id) REFERENCES public.mensajes(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: familias_productos familias_productos_linea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.familias_productos
    ADD CONSTRAINT familias_productos_linea_id_fkey FOREIGN KEY (linea_id) REFERENCES public.lineas_de_negocio(id);


--
-- Name: familias_productos familias_productos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.familias_productos
    ADD CONSTRAINT familias_productos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id);


--
-- Name: identidades_canal identidades_canal_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidades_canal
    ADD CONSTRAINT identidades_canal_contacto_org_fkey FOREIGN KEY (organizacion_id, contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: identidades_canal identidades_canal_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identidades_canal
    ADD CONSTRAINT identidades_canal_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: lead_eventos lead_eventos_lead_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_eventos
    ADD CONSTRAINT lead_eventos_lead_org_fkey FOREIGN KEY (organizacion_id, lead_id) REFERENCES public.leads(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: lead_eventos lead_eventos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_eventos
    ADD CONSTRAINT lead_eventos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: leads leads_campana_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_campana_org_fkey FOREIGN KEY (organizacion_id, campana_id) REFERENCES public.campanas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: leads leads_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_contacto_org_fkey FOREIGN KEY (organizacion_id, contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: leads leads_convertido_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_convertido_contacto_org_fkey FOREIGN KEY (organizacion_id, convertido_a_contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: leads leads_convertido_cuenta_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_convertido_cuenta_org_fkey FOREIGN KEY (organizacion_id, convertido_a_cuenta_id) REFERENCES public.cuentas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: leads leads_cuenta_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id) REFERENCES public.cuentas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: leads leads_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: lineas_de_negocio lineas_de_negocio_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lineas_de_negocio
    ADD CONSTRAINT lineas_de_negocio_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id);


--
-- Name: llamadas llamadas_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llamadas
    ADD CONSTRAINT llamadas_contacto_org_fkey FOREIGN KEY (organizacion_id, contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: llamadas llamadas_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llamadas
    ADD CONSTRAINT llamadas_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: logos logos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logos
    ADD CONSTRAINT logos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: logos logos_uploaded_by_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logos
    ADD CONSTRAINT logos_uploaded_by_org_fkey FOREIGN KEY (organizacion_id, uploaded_by) REFERENCES public.usuarios(organizacion_id, id);


--
-- Name: mensajes mensajes_conversacion_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT mensajes_conversacion_org_fkey FOREIGN KEY (organizacion_id, conversacion_id) REFERENCES public.conversaciones(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: mensajes mensajes_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT mensajes_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: modelos_productos modelos_productos_familia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelos_productos
    ADD CONSTRAINT modelos_productos_familia_id_fkey FOREIGN KEY (familia_id) REFERENCES public.familias_productos(id);


--
-- Name: modelos_productos modelos_productos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modelos_productos
    ADD CONSTRAINT modelos_productos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id);


--
-- Name: notas notas_creado_por_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas
    ADD CONSTRAINT notas_creado_por_usuario_org_fkey FOREIGN KEY (organizacion_id, creado_por_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: notas notas_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas
    ADD CONSTRAINT notas_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: oportunidad_etapas_historial oportunidad_etapas_historial_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidad_etapas_historial
    ADD CONSTRAINT oportunidad_etapas_historial_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: oportunidad_etapas_historial oportunidad_historial_cambiado_por_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidad_etapas_historial
    ADD CONSTRAINT oportunidad_historial_cambiado_por_usuario_org_fkey FOREIGN KEY (organizacion_id, cambiado_por_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: oportunidad_etapas_historial oportunidad_historial_etapa_destino_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidad_etapas_historial
    ADD CONSTRAINT oportunidad_historial_etapa_destino_org_fkey FOREIGN KEY (organizacion_id, etapa_destino_id) REFERENCES public.etapas_pipeline(organizacion_id, id) ON DELETE RESTRICT;


--
-- Name: oportunidad_etapas_historial oportunidad_historial_etapa_origen_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidad_etapas_historial
    ADD CONSTRAINT oportunidad_historial_etapa_origen_org_fkey FOREIGN KEY (organizacion_id, etapa_origen_id) REFERENCES public.etapas_pipeline(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: oportunidad_etapas_historial oportunidad_historial_oportunidad_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidad_etapas_historial
    ADD CONSTRAINT oportunidad_historial_oportunidad_org_fkey FOREIGN KEY (organizacion_id, oportunidad_id) REFERENCES public.oportunidades(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: oportunidades oportunidades_asignado_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidades
    ADD CONSTRAINT oportunidades_asignado_usuario_org_fkey FOREIGN KEY (organizacion_id, asignado_a_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: oportunidades oportunidades_contacto_principal_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidades
    ADD CONSTRAINT oportunidades_contacto_principal_org_fkey FOREIGN KEY (organizacion_id, contacto_principal_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: oportunidades oportunidades_cuenta_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidades
    ADD CONSTRAINT oportunidades_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id) REFERENCES public.cuentas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: oportunidades oportunidades_etapa_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidades
    ADD CONSTRAINT oportunidades_etapa_org_fkey FOREIGN KEY (organizacion_id, etapa_id) REFERENCES public.etapas_pipeline(organizacion_id, id) ON DELETE RESTRICT;


--
-- Name: oportunidades oportunidades_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidades
    ADD CONSTRAINT oportunidades_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: oportunidades oportunidades_propietario_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oportunidades
    ADD CONSTRAINT oportunidades_propietario_usuario_org_fkey FOREIGN KEY (organizacion_id, propietario_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: panel_calendar_settings panel_calendar_settings_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.panel_calendar_settings
    ADD CONSTRAINT panel_calendar_settings_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: panel_email_templates panel_email_templates_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.panel_email_templates
    ADD CONSTRAINT panel_email_templates_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: permisos permisos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos
    ADD CONSTRAINT permisos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: producto_metadata_schemes producto_metadata_schemes_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_metadata_schemes
    ADD CONSTRAINT producto_metadata_schemes_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id);


--
-- Name: productos productos_familia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_familia_id_fkey FOREIGN KEY (familia_id) REFERENCES public.familias_productos(id);


--
-- Name: productos productos_modelo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES public.modelos_productos(id);


--
-- Name: productos productos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prompt_bindings prompt_bindings_agente_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_bindings
    ADD CONSTRAINT prompt_bindings_agente_org_fkey FOREIGN KEY (organizacion_id, agente_id) REFERENCES public.agentes(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: prompt_bindings prompt_bindings_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_bindings
    ADD CONSTRAINT prompt_bindings_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prompt_bindings prompt_bindings_prompt_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_bindings
    ADD CONSTRAINT prompt_bindings_prompt_org_fkey FOREIGN KEY (organizacion_id, prompt_id) REFERENCES public.prompts(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: prompt_bindings prompt_bindings_version_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_bindings
    ADD CONSTRAINT prompt_bindings_version_org_fkey FOREIGN KEY (organizacion_id, version_id) REFERENCES public.prompt_versions(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: prompt_versions prompt_versions_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_versions
    ADD CONSTRAINT prompt_versions_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prompt_versions prompt_versions_prompt_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_versions
    ADD CONSTRAINT prompt_versions_prompt_org_fkey FOREIGN KEY (organizacion_id, prompt_id) REFERENCES public.prompts(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: prompts prompts_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompts
    ADD CONSTRAINT prompts_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: propiedad_capas propiedad_capas_desarrollo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_capas
    ADD CONSTRAINT propiedad_capas_desarrollo_id_fkey FOREIGN KEY (desarrollo_id) REFERENCES public.propiedad_desarrollos(id) ON DELETE CASCADE;


--
-- Name: propiedad_unidades propiedad_departamentos_nivel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_unidades
    ADD CONSTRAINT propiedad_departamentos_nivel_id_fkey FOREIGN KEY (nivel_id) REFERENCES public.propiedad_capas(id) ON DELETE CASCADE;


--
-- Name: propiedad_departamentos propiedad_departamentos_nivel_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_departamentos
    ADD CONSTRAINT propiedad_departamentos_nivel_id_fkey1 FOREIGN KEY (nivel_id) REFERENCES public.propiedad_niveles(id) ON DELETE CASCADE;


--
-- Name: propiedad_desarrollos_mix_items propiedad_desarrollos_mix_items_desarrollo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_desarrollos_mix_items
    ADD CONSTRAINT propiedad_desarrollos_mix_items_desarrollo_id_fkey FOREIGN KEY (desarrollo_id) REFERENCES public.propiedad_desarrollos(id) ON DELETE CASCADE;


--
-- Name: propiedad_desarrollos_mix_items propiedad_desarrollos_mix_items_mix_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_desarrollos_mix_items
    ADD CONSTRAINT propiedad_desarrollos_mix_items_mix_id_fkey FOREIGN KEY (mix_id) REFERENCES public.propiedad_desarrollos_mix(id) ON DELETE CASCADE;


--
-- Name: propiedad_desarrollos_mix propiedad_desarrollos_mix_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_desarrollos_mix
    ADD CONSTRAINT propiedad_desarrollos_mix_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: propiedad_desarrollos propiedad_desarrollos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_desarrollos
    ADD CONSTRAINT propiedad_desarrollos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: propiedad_poligonos propiedad_poligonos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_poligonos
    ADD CONSTRAINT propiedad_poligonos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: propiedad_tipos propiedad_tipos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_tipos
    ADD CONSTRAINT propiedad_tipos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: propiedad_unidades propiedad_unidades_desarrollo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_unidades
    ADD CONSTRAINT propiedad_unidades_desarrollo_id_fkey FOREIGN KEY (desarrollo_id) REFERENCES public.propiedad_desarrollos(id);


--
-- Name: propiedad_unidades propiedad_unidades_familia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_unidades
    ADD CONSTRAINT propiedad_unidades_familia_id_fkey FOREIGN KEY (familia_id) REFERENCES public.familias_productos(id);


--
-- Name: propiedad_unidades propiedad_unidades_linea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_unidades
    ADD CONSTRAINT propiedad_unidades_linea_id_fkey FOREIGN KEY (linea_id) REFERENCES public.lineas_de_negocio(id);


--
-- Name: propiedad_unidades propiedad_unidades_modelo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_unidades
    ADD CONSTRAINT propiedad_unidades_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES public.modelos_productos(id);


--
-- Name: propiedad_unidades propiedad_unidades_tipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedad_unidades
    ADD CONSTRAINT propiedad_unidades_tipo_id_fkey FOREIGN KEY (tipo_id) REFERENCES public.propiedad_tipos(id);


--
-- Name: prospeccion_buscador_jobs prospeccion_buscador_jobs_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_buscador_jobs
    ADD CONSTRAINT prospeccion_buscador_jobs_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prospeccion_buscador_resultados prospeccion_buscador_resultados_job_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_buscador_resultados
    ADD CONSTRAINT prospeccion_buscador_resultados_job_org_fkey FOREIGN KEY (organizacion_id, job_id) REFERENCES public.prospeccion_buscador_jobs(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: prospeccion_buscador_resultados prospeccion_buscador_resultados_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_buscador_resultados
    ADD CONSTRAINT prospeccion_buscador_resultados_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prospeccion_contacto_batch prospeccion_contacto_batch_campana_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_batch
    ADD CONSTRAINT prospeccion_contacto_batch_campana_org_fkey FOREIGN KEY (organizacion_id, campana_id) REFERENCES public.campanas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: prospeccion_contacto_batch prospeccion_contacto_batch_lista_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_batch
    ADD CONSTRAINT prospeccion_contacto_batch_lista_org_fkey FOREIGN KEY (organizacion_id, lista_id) REFERENCES public.prospeccion_contacto_listas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: prospeccion_contacto_batch prospeccion_contacto_batch_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_batch
    ADD CONSTRAINT prospeccion_contacto_batch_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prospeccion_contacto_envio prospeccion_contacto_envio_batch_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_envio
    ADD CONSTRAINT prospeccion_contacto_envio_batch_org_fkey FOREIGN KEY (organizacion_id, batch_id) REFERENCES public.prospeccion_contacto_batch(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: prospeccion_contacto_envio prospeccion_contacto_envio_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_envio
    ADD CONSTRAINT prospeccion_contacto_envio_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prospeccion_contacto_envio prospeccion_contacto_envio_prospecto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_envio
    ADD CONSTRAINT prospeccion_contacto_envio_prospecto_org_fkey FOREIGN KEY (organizacion_id, prospecto_id) REFERENCES public.prospeccion_prospectos(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: prospeccion_contacto_listas prospeccion_contacto_listas_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_listas
    ADD CONSTRAINT prospeccion_contacto_listas_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prospeccion_contacto_templates prospeccion_contacto_templates_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prospeccion_contactos_log prospeccion_contactos_log_batch_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contactos_log
    ADD CONSTRAINT prospeccion_contactos_log_batch_org_fkey FOREIGN KEY (organizacion_id, batch_id) REFERENCES public.prospeccion_contacto_batch(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: prospeccion_contactos_log prospeccion_contactos_log_envio_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contactos_log
    ADD CONSTRAINT prospeccion_contactos_log_envio_org_fkey FOREIGN KEY (organizacion_id, envio_id) REFERENCES public.prospeccion_contacto_envio(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: prospeccion_contactos_log prospeccion_contactos_log_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contactos_log
    ADD CONSTRAINT prospeccion_contactos_log_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prospeccion_contactos_log prospeccion_contactos_log_prospecto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_contactos_log
    ADD CONSTRAINT prospeccion_contactos_log_prospecto_org_fkey FOREIGN KEY (organizacion_id, prospecto_id) REFERENCES public.prospeccion_prospectos(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: prospeccion_prospectos_audit prospeccion_prospectos_audit_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_prospectos_audit
    ADD CONSTRAINT prospeccion_prospectos_audit_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prospeccion_prospectos_audit prospeccion_prospectos_audit_prospecto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_prospectos_audit
    ADD CONSTRAINT prospeccion_prospectos_audit_prospecto_org_fkey FOREIGN KEY (organizacion_id, prospecto_id) REFERENCES public.prospeccion_prospectos(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: prospeccion_prospectos prospeccion_prospectos_busqueda_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_prospectos
    ADD CONSTRAINT prospeccion_prospectos_busqueda_org_fkey FOREIGN KEY (organizacion_id, busqueda_id) REFERENCES public.busquedas(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: prospeccion_prospectos prospeccion_prospectos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_prospectos
    ADD CONSTRAINT prospeccion_prospectos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: prospeccion_prospectos prospeccion_prospectos_resultado_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccion_prospectos
    ADD CONSTRAINT prospeccion_prospectos_resultado_org_fkey FOREIGN KEY (organizacion_id, resultado_id) REFERENCES public.resultados(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: puestos puestos_departamento_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puestos
    ADD CONSTRAINT puestos_departamento_org_fkey FOREIGN KEY (organizacion_id, departamento_id) REFERENCES public.departamentos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: puestos puestos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.puestos
    ADD CONSTRAINT puestos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: quote_templates quote_templates_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_templates
    ADD CONSTRAINT quote_templates_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: quote_templates quote_templates_updated_by_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_templates
    ADD CONSTRAINT quote_templates_updated_by_org_fkey FOREIGN KEY (organizacion_id, updated_by) REFERENCES public.usuarios(organizacion_id, id);


--
-- Name: recursos_media recursos_media_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recursos_media
    ADD CONSTRAINT recursos_media_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id);


--
-- Name: resultados resultados_busqueda_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados
    ADD CONSTRAINT resultados_busqueda_org_fkey FOREIGN KEY (organizacion_id, busqueda_id) REFERENCES public.busquedas(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: resultados resultados_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados
    ADD CONSTRAINT resultados_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: roles roles_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: roles_permisos roles_permisos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT roles_permisos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: roles_permisos roles_permisos_permiso_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT roles_permisos_permiso_org_fkey FOREIGN KEY (organizacion_id, permiso_id) REFERENCES public.permisos(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: roles_permisos roles_permisos_rol_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT roles_permisos_rol_org_fkey FOREIGN KEY (organizacion_id, rol_id) REFERENCES public.roles(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: secretos secretos_actualizado_por_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretos
    ADD CONSTRAINT secretos_actualizado_por_org_fkey FOREIGN KEY (organizacion_id, actualizado_por) REFERENCES public.usuarios(organizacion_id, id);


--
-- Name: secretos secretos_creado_por_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretos
    ADD CONSTRAINT secretos_creado_por_org_fkey FOREIGN KEY (organizacion_id, creado_por) REFERENCES public.usuarios(organizacion_id, id);


--
-- Name: secretos secretos_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretos
    ADD CONSTRAINT secretos_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: taggings taggings_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taggings
    ADD CONSTRAINT taggings_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: taggings taggings_tag_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taggings
    ADD CONSTRAINT taggings_tag_org_fkey FOREIGN KEY (organizacion_id, tag_id) REFERENCES public.tags(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: tags tags_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: ticket_comentarios ticket_comentarios_autor_cliente_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comentarios
    ADD CONSTRAINT ticket_comentarios_autor_cliente_org_fkey FOREIGN KEY (organizacion_id, autor_cliente_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: ticket_comentarios ticket_comentarios_autor_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comentarios
    ADD CONSTRAINT ticket_comentarios_autor_usuario_org_fkey FOREIGN KEY (organizacion_id, autor_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: ticket_comentarios ticket_comentarios_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comentarios
    ADD CONSTRAINT ticket_comentarios_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: ticket_comentarios ticket_comentarios_ticket_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comentarios
    ADD CONSTRAINT ticket_comentarios_ticket_org_fkey FOREIGN KEY (organizacion_id, ticket_id) REFERENCES public.tickets(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: tickets tickets_asignado_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_asignado_usuario_org_fkey FOREIGN KEY (organizacion_id, asignado_a_usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: tickets tickets_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_contacto_org_fkey FOREIGN KEY (organizacion_id, contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: tickets tickets_cuenta_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id) REFERENCES public.cuentas(organizacion_id, id) ON DELETE SET NULL;


--
-- Name: tickets tickets_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: usuarios users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: usuarios usuarios_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: usuarios_roles usuarios_roles_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: usuarios_roles usuarios_roles_rol_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_rol_org_fkey FOREIGN KEY (organizacion_id, rol_id) REFERENCES public.roles(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: usuarios_roles usuarios_roles_usuario_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_usuario_org_fkey FOREIGN KEY (organizacion_id, usuario_id) REFERENCES public.usuarios(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: webchat_session_closures webchat_session_closures_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_session_closures
    ADD CONSTRAINT webchat_session_closures_contacto_org_fkey FOREIGN KEY (organizacion_id, contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: webchat_session_closures webchat_session_closures_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_session_closures
    ADD CONSTRAINT webchat_session_closures_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: webchat_visitantes webchat_visitantes_contacto_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_visitantes
    ADD CONSTRAINT webchat_visitantes_contacto_org_fkey FOREIGN KEY (organizacion_id, contacto_id) REFERENCES public.contactos(organizacion_id, id) ON DELETE CASCADE;


--
-- Name: webchat_visitantes webchat_visitantes_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webchat_visitantes
    ADD CONSTRAINT webchat_visitantes_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


--
-- Name: webhooks_entrantes webhooks_entrantes_organizacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks_entrantes
    ADD CONSTRAINT webhooks_entrantes_organizacion_id_fkey FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;


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
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


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
-- Name: actividades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.actividades ENABLE ROW LEVEL SECURITY;

--
-- Name: actividades actividades_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actividades_admin_all ON public.actividades TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: actividades actividades_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY actividades_member_org ON public.actividades TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: adjuntos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.adjuntos ENABLE ROW LEVEL SECURITY;

--
-- Name: adjuntos adjuntos_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY adjuntos_delete_admin ON public.adjuntos FOR DELETE TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: adjuntos adjuntos_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY adjuntos_insert_authenticated ON public.adjuntos FOR INSERT TO authenticated WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_mensaje(mensaje_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: adjuntos adjuntos_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY adjuntos_select_authenticated ON public.adjuntos FOR SELECT TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_mensaje(mensaje_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: adjuntos adjuntos_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY adjuntos_update_admin ON public.adjuntos FOR UPDATE TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: agentes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agentes ENABLE ROW LEVEL SECURITY;

--
-- Name: agentes agentes_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agentes_admin_all ON public.agentes TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: agentes agentes_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agentes_member_org ON public.agentes TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: archivos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.archivos ENABLE ROW LEVEL SECURITY;

--
-- Name: archivos archivos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY archivos_admin_all ON public.archivos TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: archivos archivos_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY archivos_member_org ON public.archivos TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_admin_all ON public.audit_logs TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: audit_logs audit_logs_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_member_org ON public.audit_logs FOR SELECT TO authenticated USING (((public.es_admin(auth.uid()) OR (organizacion_id = public.usuario_organizacion_id(auth.uid()))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: busquedas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.busquedas ENABLE ROW LEVEL SECURITY;

--
-- Name: busquedas busquedas_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY busquedas_admin_all ON public.busquedas TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: busquedas busquedas_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY busquedas_member_org ON public.busquedas TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: calendar_availability_patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_availability_patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_availability_patterns calendar_availability_patterns_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_availability_patterns_admin_all ON public.calendar_availability_patterns TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: calendar_availability_patterns calendar_availability_patterns_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_availability_patterns_member_org ON public.calendar_availability_patterns TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: calendar_bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_bookings calendar_bookings_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_bookings_admin_all ON public.calendar_bookings TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: calendar_bookings calendar_bookings_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_bookings_member_org ON public.calendar_bookings TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: calendar_exceptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_exceptions ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_exceptions calendar_exceptions_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_exceptions_admin_all ON public.calendar_exceptions TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: calendar_exceptions calendar_exceptions_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_exceptions_member_org ON public.calendar_exceptions TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: calendar_resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_resources ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_resources calendar_resources_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_resources_admin_all ON public.calendar_resources TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: calendar_resources calendar_resources_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_resources_member_org ON public.calendar_resources TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: calendar_slot_holds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_slot_holds ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_slot_holds calendar_slot_holds_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_slot_holds_admin_all ON public.calendar_slot_holds TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: calendar_slot_holds calendar_slot_holds_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calendar_slot_holds_member_org ON public.calendar_slot_holds TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: campanas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campanas ENABLE ROW LEVEL SECURITY;

--
-- Name: campanas campanas_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campanas_admin_all ON public.campanas TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: campanas campanas_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campanas_member_org ON public.campanas TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: catalog_document_embeddings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_document_embeddings ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_document_embeddings catalog_document_embeddings_tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_document_embeddings_tenant_delete ON public.catalog_document_embeddings FOR DELETE TO authenticated USING ((organizacion_id = public.usuario_organizacion_id(auth.uid())));


--
-- Name: catalog_document_embeddings catalog_document_embeddings_tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_document_embeddings_tenant_insert ON public.catalog_document_embeddings FOR INSERT TO authenticated WITH CHECK ((organizacion_id = public.usuario_organizacion_id(auth.uid())));


--
-- Name: catalog_document_embeddings catalog_document_embeddings_tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_document_embeddings_tenant_select ON public.catalog_document_embeddings FOR SELECT TO authenticated USING ((organizacion_id = public.usuario_organizacion_id(auth.uid())));


--
-- Name: catalog_document_embeddings catalog_document_embeddings_tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_document_embeddings_tenant_update ON public.catalog_document_embeddings FOR UPDATE TO authenticated USING ((organizacion_id = public.usuario_organizacion_id(auth.uid()))) WITH CHECK ((organizacion_id = public.usuario_organizacion_id(auth.uid())));


--
-- Name: catalog_embeddings_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_embeddings_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_embeddings_audit catalog_embeddings_audit_tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_embeddings_audit_tenant_delete ON public.catalog_embeddings_audit FOR DELETE TO authenticated USING ((organizacion_id = public.usuario_organizacion_id(auth.uid())));


--
-- Name: catalog_embeddings_audit catalog_embeddings_audit_tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_embeddings_audit_tenant_insert ON public.catalog_embeddings_audit FOR INSERT TO authenticated WITH CHECK ((organizacion_id = public.usuario_organizacion_id(auth.uid())));


--
-- Name: catalog_embeddings_audit catalog_embeddings_audit_tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_embeddings_audit_tenant_select ON public.catalog_embeddings_audit FOR SELECT TO authenticated USING ((organizacion_id = public.usuario_organizacion_id(auth.uid())));


--
-- Name: catalog_embeddings_audit catalog_embeddings_audit_tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_embeddings_audit_tenant_update ON public.catalog_embeddings_audit FOR UPDATE TO authenticated USING ((organizacion_id = public.usuario_organizacion_id(auth.uid()))) WITH CHECK ((organizacion_id = public.usuario_organizacion_id(auth.uid())));


--
-- Name: catalog_item_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_item_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_item_prices catalog_item_prices_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_item_prices_admin_all ON public.catalog_item_prices TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: catalog_item_prices catalog_item_prices_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_item_prices_member_org ON public.catalog_item_prices TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: catalog_item_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_item_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_item_tags catalog_item_tags_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_item_tags_admin_all ON public.catalog_item_tags TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: catalog_item_tags catalog_item_tags_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_item_tags_member_org ON public.catalog_item_tags TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: catalog_item_tags catalog_item_tags_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_item_tags_write_admin ON public.catalog_item_tags TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: catalog_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_items catalog_items_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_items_admin_all ON public.catalog_items TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: catalog_items catalog_items_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_items_member_org ON public.catalog_items TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: catalog_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_tags catalog_tags_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_tags_admin_all ON public.catalog_tags TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: catalog_tags catalog_tags_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_tags_member_org ON public.catalog_tags TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: catalog_tags catalog_tags_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_tags_write_admin ON public.catalog_tags TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cliente_documentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cliente_documentos ENABLE ROW LEVEL SECURITY;

--
-- Name: cliente_documentos cliente_documentos_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cliente_documentos_access ON public.cliente_documentos TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR (organizacion_id = public.usuario_organizacion_id(auth.uid()))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR (organizacion_id = public.usuario_organizacion_id(auth.uid()))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cliente_documentos cliente_documentos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cliente_documentos_admin_all ON public.cliente_documentos TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cliente_documentos cliente_documentos_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cliente_documentos_member_org ON public.cliente_documentos TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cliente_portal_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cliente_portal_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: cliente_portal_tokens cliente_portal_tokens_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cliente_portal_tokens_member_org ON public.cliente_portal_tokens TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR (organizacion_id = public.usuario_organizacion_id(auth.uid()))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR (organizacion_id = public.usuario_organizacion_id(auth.uid()))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cliente_responsables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cliente_responsables ENABLE ROW LEVEL SECURITY;

--
-- Name: cliente_responsables cliente_responsables_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cliente_responsables_access ON public.cliente_responsables TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR (organizacion_id = public.usuario_organizacion_id(auth.uid()))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR (organizacion_id = public.usuario_organizacion_id(auth.uid()))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cliente_responsables cliente_responsables_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cliente_responsables_admin_all ON public.cliente_responsables TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cliente_responsables cliente_responsables_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cliente_responsables_member_org ON public.cliente_responsables TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes clientes_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clientes_access ON public.clientes TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR (organizacion_id = public.usuario_organizacion_id(auth.uid()))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR (organizacion_id = public.usuario_organizacion_id(auth.uid()))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: clientes clientes_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clientes_admin_all ON public.clientes TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: clientes clientes_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clientes_member_org ON public.clientes TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: contactos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY;

--
-- Name: contactos contactos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contactos_admin_all ON public.contactos TO authenticated USING ((( SELECT public.es_admin(auth.uid()) AS es_admin) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((( SELECT public.es_admin(auth.uid()) AS es_admin) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: contactos contactos_propietario_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contactos_propietario_all ON public.contactos TO authenticated USING (((propietario_usuario_id = ( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((propietario_usuario_id = ( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: contactos contactos_rpc_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contactos_rpc_access ON public.contactos TO postgres USING ((organizacion_id = (NULLIF(current_setting('app.current_organizacion_id'::text, true), ''::text))::uuid)) WITH CHECK ((organizacion_id = (NULLIF(current_setting('app.current_organizacion_id'::text, true), ''::text))::uuid));


--
-- Name: conversaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: conversaciones conversaciones_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_admin_all ON public.conversaciones TO authenticated USING ((( SELECT public.es_admin(auth.uid()) AS es_admin) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((( SELECT public.es_admin(auth.uid()) AS es_admin) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


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
-- Name: conversaciones_insights conversaciones_insights_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_insights_admin ON public.conversaciones_insights TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: conversaciones conversaciones_miembro_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_miembro_delete ON public.conversaciones FOR DELETE TO authenticated USING ((public.puede_ver_conversacion(id) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: conversaciones conversaciones_miembro_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_miembro_insert ON public.conversaciones FOR INSERT TO authenticated WITH CHECK ((((EXISTS ( SELECT 1
   FROM public.contactos ct
  WHERE ((ct.id = conversaciones.contacto_id) AND (ct.propietario_usuario_id = ( SELECT auth.uid() AS uid))))) OR (asignado_a_usuario_id = ( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: conversaciones conversaciones_miembro_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_miembro_select ON public.conversaciones FOR SELECT TO authenticated USING ((public.puede_ver_conversacion(id) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: conversaciones conversaciones_miembro_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_miembro_update ON public.conversaciones FOR UPDATE TO authenticated USING ((public.puede_ver_conversacion(id) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((((EXISTS ( SELECT 1
   FROM public.contactos ct
  WHERE ((ct.id = conversaciones.contacto_id) AND (ct.propietario_usuario_id = ( SELECT auth.uid() AS uid))))) OR (asignado_a_usuario_id = ( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: conversaciones conversaciones_rpc_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversaciones_rpc_access ON public.conversaciones TO postgres USING ((organizacion_id = (NULLIF(current_setting('app.current_organizacion_id'::text, true), ''::text))::uuid)) WITH CHECK ((organizacion_id = (NULLIF(current_setting('app.current_organizacion_id'::text, true), ''::text))::uuid));


--
-- Name: conversation_summaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_summaries ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_summaries conversation_summaries_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_summaries_delete ON public.conversation_summaries FOR DELETE TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_conversacion(conversacion_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: conversation_summaries conversation_summaries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_summaries_insert ON public.conversation_summaries FOR INSERT TO authenticated WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_conversacion(conversacion_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: conversation_summaries conversation_summaries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_summaries_select ON public.conversation_summaries FOR SELECT TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_conversacion(conversacion_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: conversation_summaries conversation_summaries_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_summaries_update ON public.conversation_summaries FOR UPDATE TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_conversacion(conversacion_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_conversacion(conversacion_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cotizacion_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cotizacion_items ENABLE ROW LEVEL SECURITY;

--
-- Name: cotizacion_items cotizacion_items_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cotizacion_items_admin_all ON public.cotizacion_items TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cotizacion_items cotizacion_items_member_quote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cotizacion_items_member_quote ON public.cotizacion_items TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.cotizaciones c
  WHERE ((c.id = cotizacion_items.cotizacion_id) AND (c.organizacion_id = public.usuario_organizacion_id(auth.uid()))))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.cotizaciones c
  WHERE ((c.id = cotizacion_items.cotizacion_id) AND (c.organizacion_id = public.usuario_organizacion_id(auth.uid()))))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cotizaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: cotizaciones cotizaciones_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cotizaciones_admin_all ON public.cotizaciones TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cotizaciones cotizaciones_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cotizaciones_member_org ON public.cotizaciones TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cuentas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cuentas ENABLE ROW LEVEL SECURITY;

--
-- Name: cuentas cuentas_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cuentas_admin_all ON public.cuentas TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: cuentas cuentas_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cuentas_member_org ON public.cuentas TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: custom_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_fields custom_fields_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY custom_fields_admin_all ON public.custom_fields TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: custom_fields custom_fields_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY custom_fields_member_org ON public.custom_fields TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: departamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: departamentos departamentos_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departamentos_admin ON public.departamentos TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: ejecuciones_asistente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ejecuciones_asistente ENABLE ROW LEVEL SECURITY;

--
-- Name: ejecuciones_asistente ejecuciones_asistente_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ejecuciones_asistente_admin ON public.ejecuciones_asistente TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: empleados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;

--
-- Name: empleados empleados_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empleados_delete_admin ON public.empleados FOR DELETE TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: empleados empleados_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empleados_insert_admin ON public.empleados FOR INSERT TO authenticated WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: empleados empleados_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empleados_select_authenticated ON public.empleados FOR SELECT TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR (usuario_id = ( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: empleados empleados_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empleados_update_admin ON public.empleados FOR UPDATE TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: etapas_pipeline; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.etapas_pipeline ENABLE ROW LEVEL SECURITY;

--
-- Name: etapas_pipeline etapas_pipeline_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY etapas_pipeline_admin_all ON public.etapas_pipeline TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: etapas_pipeline etapas_pipeline_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY etapas_pipeline_member_org ON public.etapas_pipeline TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: eventos_auditoria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventos_auditoria ENABLE ROW LEVEL SECURITY;

--
-- Name: eventos_auditoria eventos_auditoria_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_auditoria_delete ON public.eventos_auditoria FOR DELETE TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR (actor_usuario_id = ( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: eventos_auditoria eventos_auditoria_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_auditoria_insert ON public.eventos_auditoria FOR INSERT TO authenticated WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR (actor_usuario_id = ( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: eventos_auditoria eventos_auditoria_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_auditoria_select ON public.eventos_auditoria FOR SELECT TO authenticated USING ((((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid)))) OR ((actor_usuario_id = ( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: eventos_auditoria eventos_auditoria_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_auditoria_update ON public.eventos_auditoria FOR UPDATE TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR (actor_usuario_id = ( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR (actor_usuario_id = ( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: eventos_entrega; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventos_entrega ENABLE ROW LEVEL SECURITY;

--
-- Name: eventos_entrega eventos_entrega_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_entrega_delete ON public.eventos_entrega FOR DELETE TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_mensaje(mensaje_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: eventos_entrega eventos_entrega_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_entrega_insert ON public.eventos_entrega FOR INSERT TO authenticated WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_mensaje(mensaje_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: eventos_entrega eventos_entrega_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_entrega_select ON public.eventos_entrega FOR SELECT TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_mensaje(mensaje_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: eventos_entrega eventos_entrega_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_entrega_update ON public.eventos_entrega FOR UPDATE TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_mensaje(mensaje_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_mensaje(mensaje_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: identidades_canal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.identidades_canal ENABLE ROW LEVEL SECURITY;

--
-- Name: identidades_canal identidades_canal_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY identidades_canal_admin ON public.identidades_canal TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: identidades_canal identidades_rpc_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY identidades_rpc_access ON public.identidades_canal TO postgres USING ((organizacion_id = (NULLIF(current_setting('app.current_organizacion_id'::text, true), ''::text))::uuid)) WITH CHECK ((organizacion_id = (NULLIF(current_setting('app.current_organizacion_id'::text, true), ''::text))::uuid));


--
-- Name: lead_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_eventos lead_eventos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_eventos_admin_all ON public.lead_eventos TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: lead_eventos lead_eventos_member_lead; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_eventos_member_lead ON public.lead_eventos TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_eventos.lead_id) AND (l.organizacion_id = public.usuario_organizacion_id(auth.uid()))))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_eventos.lead_id) AND (l.organizacion_id = public.usuario_organizacion_id(auth.uid()))))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: leads leads_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_admin_all ON public.leads TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: leads leads_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_member_org ON public.leads TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: llamadas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.llamadas ENABLE ROW LEVEL SECURITY;

--
-- Name: llamadas llamadas_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY llamadas_admin ON public.llamadas TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: logos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logos ENABLE ROW LEVEL SECURITY;

--
-- Name: logos logos_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logos_delete_admin ON public.logos FOR DELETE TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: logos logos_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logos_insert_admin ON public.logos FOR INSERT TO authenticated WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: logos logos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logos_select ON public.logos FOR SELECT TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: logos logos_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logos_update_admin ON public.logos FOR UPDATE TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: mensajes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;

--
-- Name: mensajes mensajes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mensajes_delete ON public.mensajes FOR DELETE TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_mensaje(id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: mensajes mensajes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mensajes_insert ON public.mensajes FOR INSERT TO authenticated WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_conversacion(conversacion_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: mensajes mensajes_rpc_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mensajes_rpc_access ON public.mensajes TO postgres USING ((organizacion_id = (NULLIF(current_setting('app.current_organizacion_id'::text, true), ''::text))::uuid)) WITH CHECK ((organizacion_id = (NULLIF(current_setting('app.current_organizacion_id'::text, true), ''::text))::uuid));


--
-- Name: mensajes mensajes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mensajes_select ON public.mensajes FOR SELECT TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_mensaje(id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: mensajes mensajes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mensajes_update ON public.mensajes FOR UPDATE TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_mensaje(id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR public.puede_ver_conversacion(conversacion_id)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: notas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notas ENABLE ROW LEVEL SECURITY;

--
-- Name: notas notas_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notas_admin_all ON public.notas TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: notas notas_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notas_member_org ON public.notas TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: oportunidad_etapas_historial; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oportunidad_etapas_historial ENABLE ROW LEVEL SECURITY;

--
-- Name: oportunidad_etapas_historial oportunidad_historial_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY oportunidad_historial_admin_all ON public.oportunidad_etapas_historial TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: oportunidad_etapas_historial oportunidad_historial_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY oportunidad_historial_member_org ON public.oportunidad_etapas_historial TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: oportunidades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;

--
-- Name: oportunidades oportunidades_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY oportunidades_admin_all ON public.oportunidades TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: oportunidades oportunidades_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY oportunidades_member_org ON public.oportunidades TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: organizaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: organizaciones organizaciones_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizaciones_select_member ON public.organizaciones FOR SELECT TO authenticated USING ((id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))));


--
-- Name: organizaciones organizaciones_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizaciones_update_admin ON public.organizaciones FOR UPDATE TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid)))));


--
-- Name: prospeccion_contactos_log p_insert_prospeccion_contactos_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_insert_prospeccion_contactos_log ON public.prospeccion_contactos_log FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: prospeccion_prospectos p_insert_prospeccion_prospectos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_insert_prospeccion_prospectos ON public.prospeccion_prospectos FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: prospeccion_contactos_log p_select_prospeccion_contactos_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_select_prospeccion_contactos_log ON public.prospeccion_contactos_log FOR SELECT TO authenticated USING (true);


--
-- Name: prospeccion_prospectos p_select_prospeccion_prospectos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_select_prospeccion_prospectos ON public.prospeccion_prospectos FOR SELECT TO authenticated USING (true);


--
-- Name: prospeccion_prospectos p_update_prospeccion_prospectos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_update_prospeccion_prospectos ON public.prospeccion_prospectos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: panel_calendar_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.panel_calendar_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: panel_calendar_settings panel_calendar_settings_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY panel_calendar_settings_select_authenticated ON public.panel_calendar_settings FOR SELECT TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: panel_email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.panel_email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: panel_email_templates panel_email_templates_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY panel_email_templates_select_authenticated ON public.panel_email_templates FOR SELECT TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: permisos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;

--
-- Name: permisos permisos_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permisos_admin ON public.permisos TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: productos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

--
-- Name: productos productos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY productos_admin_all ON public.productos TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: productos productos_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY productos_member_org ON public.productos TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prompt_bindings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prompt_bindings ENABLE ROW LEVEL SECURITY;

--
-- Name: prompt_bindings prompt_bindings_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompt_bindings_admin_all ON public.prompt_bindings TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prompt_bindings prompt_bindings_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompt_bindings_member_org ON public.prompt_bindings TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prompt_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: prompt_versions prompt_versions_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompt_versions_admin_all ON public.prompt_versions TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prompt_versions prompt_versions_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompt_versions_member_org ON public.prompt_versions TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prompts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;

--
-- Name: prompts prompts_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompts_admin_all ON public.prompts TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prompts prompts_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompts_member_org ON public.prompts TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: propiedad_capas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.propiedad_capas ENABLE ROW LEVEL SECURITY;

--
-- Name: propiedad_capas propiedad_capas_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_capas_admin_all ON public.propiedad_capas TO authenticated USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: propiedad_capas propiedad_capas_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_capas_member_org ON public.propiedad_capas TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.propiedad_desarrollos d
  WHERE ((d.id = propiedad_capas.desarrollo_id) AND (d.organizacion_id = public.usuario_organizacion_id(auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.propiedad_desarrollos d
  WHERE ((d.id = propiedad_capas.desarrollo_id) AND (d.organizacion_id = public.usuario_organizacion_id(auth.uid()))))));


--
-- Name: propiedad_departamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.propiedad_departamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: propiedad_departamentos propiedad_departamentos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_departamentos_admin_all ON public.propiedad_departamentos TO authenticated USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: propiedad_departamentos propiedad_departamentos_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_departamentos_member_org ON public.propiedad_departamentos TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.propiedad_capas c
     JOIN public.propiedad_desarrollos d ON ((d.id = c.desarrollo_id)))
  WHERE ((c.id = propiedad_departamentos.nivel_id) AND (d.organizacion_id = public.usuario_organizacion_id(auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.propiedad_capas c
     JOIN public.propiedad_desarrollos d ON ((d.id = c.desarrollo_id)))
  WHERE ((c.id = propiedad_departamentos.nivel_id) AND (d.organizacion_id = public.usuario_organizacion_id(auth.uid()))))));


--
-- Name: propiedad_desarrollos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.propiedad_desarrollos ENABLE ROW LEVEL SECURITY;

--
-- Name: propiedad_desarrollos propiedad_desarrollos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_desarrollos_admin_all ON public.propiedad_desarrollos TO authenticated USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: propiedad_desarrollos propiedad_desarrollos_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_desarrollos_member_org ON public.propiedad_desarrollos TO authenticated USING ((organizacion_id = public.usuario_organizacion_id(auth.uid()))) WITH CHECK ((organizacion_id = public.usuario_organizacion_id(auth.uid())));


--
-- Name: propiedad_niveles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.propiedad_niveles ENABLE ROW LEVEL SECURITY;

--
-- Name: propiedad_poligonos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.propiedad_poligonos ENABLE ROW LEVEL SECURITY;

--
-- Name: propiedad_poligonos propiedad_poligonos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_poligonos_admin_all ON public.propiedad_poligonos TO authenticated USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: propiedad_poligonos propiedad_poligonos_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_poligonos_member_org ON public.propiedad_poligonos TO authenticated USING ((organizacion_id = public.usuario_organizacion_id(auth.uid()))) WITH CHECK ((organizacion_id = public.usuario_organizacion_id(auth.uid())));


--
-- Name: propiedad_tipos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.propiedad_tipos ENABLE ROW LEVEL SECURITY;

--
-- Name: propiedad_tipos propiedad_tipos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_tipos_admin_all ON public.propiedad_tipos TO authenticated USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: propiedad_tipos propiedad_tipos_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_tipos_member_org ON public.propiedad_tipos TO authenticated USING ((organizacion_id = public.usuario_organizacion_id(auth.uid()))) WITH CHECK ((organizacion_id = public.usuario_organizacion_id(auth.uid())));


--
-- Name: propiedad_unidades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.propiedad_unidades ENABLE ROW LEVEL SECURITY;

--
-- Name: propiedad_unidades propiedad_unidades_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_unidades_admin_all ON public.propiedad_unidades TO authenticated USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


--
-- Name: propiedad_unidades propiedad_unidades_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY propiedad_unidades_member_org ON public.propiedad_unidades TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.propiedad_capas c
     JOIN public.propiedad_desarrollos d ON ((d.id = c.desarrollo_id)))
  WHERE ((c.id = propiedad_unidades.nivel_id) AND (d.organizacion_id = public.usuario_organizacion_id(auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.propiedad_capas c
     JOIN public.propiedad_desarrollos d ON ((d.id = c.desarrollo_id)))
  WHERE ((c.id = propiedad_unidades.nivel_id) AND (d.organizacion_id = public.usuario_organizacion_id(auth.uid()))))));


--
-- Name: prospeccion_buscador_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospeccion_buscador_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: prospeccion_buscador_jobs prospeccion_buscador_jobs_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_buscador_jobs_admin_all ON public.prospeccion_buscador_jobs TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_buscador_jobs prospeccion_buscador_jobs_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_buscador_jobs_member_org ON public.prospeccion_buscador_jobs TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_buscador_resultados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospeccion_buscador_resultados ENABLE ROW LEVEL SECURITY;

--
-- Name: prospeccion_buscador_resultados prospeccion_buscador_resultados_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_buscador_resultados_admin_all ON public.prospeccion_buscador_resultados TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_buscador_resultados prospeccion_buscador_resultados_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_buscador_resultados_member_org ON public.prospeccion_buscador_resultados TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_contacto_batch; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospeccion_contacto_batch ENABLE ROW LEVEL SECURITY;

--
-- Name: prospeccion_contacto_batch prospeccion_contacto_batch_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_contacto_batch_admin_all ON public.prospeccion_contacto_batch TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_contacto_batch prospeccion_contacto_batch_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_contacto_batch_member_org ON public.prospeccion_contacto_batch TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_contacto_envio; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospeccion_contacto_envio ENABLE ROW LEVEL SECURITY;

--
-- Name: prospeccion_contacto_envio prospeccion_contacto_envio_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_contacto_envio_admin_all ON public.prospeccion_contacto_envio TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_contacto_envio prospeccion_contacto_envio_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_contacto_envio_member_org ON public.prospeccion_contacto_envio TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_contacto_listas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospeccion_contacto_listas ENABLE ROW LEVEL SECURITY;

--
-- Name: prospeccion_contacto_listas prospeccion_contacto_listas_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_contacto_listas_admin_all ON public.prospeccion_contacto_listas TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_contacto_listas prospeccion_contacto_listas_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_contacto_listas_member_org ON public.prospeccion_contacto_listas TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_contacto_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospeccion_contacto_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: prospeccion_contacto_templates prospeccion_contacto_templates_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_contacto_templates_admin_all ON public.prospeccion_contacto_templates TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_contacto_templates prospeccion_contacto_templates_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_contacto_templates_member_org ON public.prospeccion_contacto_templates TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_contactos_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospeccion_contactos_log ENABLE ROW LEVEL SECURITY;

--
-- Name: prospeccion_contactos_log prospeccion_contactos_log_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_contactos_log_admin_all ON public.prospeccion_contactos_log TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_contactos_log prospeccion_contactos_log_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_contactos_log_member_org ON public.prospeccion_contactos_log TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_prospectos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospeccion_prospectos ENABLE ROW LEVEL SECURITY;

--
-- Name: prospeccion_prospectos prospeccion_prospectos_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_prospectos_admin_all ON public.prospeccion_prospectos TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_prospectos_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospeccion_prospectos_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: prospeccion_prospectos_audit prospeccion_prospectos_audit_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_prospectos_audit_admin_all ON public.prospeccion_prospectos_audit TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_prospectos_audit prospeccion_prospectos_audit_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_prospectos_audit_member_org ON public.prospeccion_prospectos_audit TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: prospeccion_prospectos prospeccion_prospectos_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospeccion_prospectos_member_org ON public.prospeccion_prospectos TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: puestos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.puestos ENABLE ROW LEVEL SECURITY;

--
-- Name: puestos puestos_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY puestos_admin ON public.puestos TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: quote_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quote_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: quote_templates quote_templates_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quote_templates_insert_admin ON public.quote_templates FOR INSERT TO authenticated WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: quote_templates quote_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quote_templates_select ON public.quote_templates FOR SELECT TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: quote_templates quote_templates_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quote_templates_update_admin ON public.quote_templates FOR UPDATE TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: resultados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resultados ENABLE ROW LEVEL SECURITY;

--
-- Name: resultados resultados_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resultados_admin_all ON public.resultados TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: resultados resultados_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resultados_member_org ON public.resultados TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: roles roles_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_admin ON public.roles TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: roles_permisos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles_permisos ENABLE ROW LEVEL SECURITY;

--
-- Name: roles_permisos roles_permisos_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_permisos_admin ON public.roles_permisos TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: secretos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.secretos ENABLE ROW LEVEL SECURITY;

--
-- Name: secretos secretos_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY secretos_admin ON public.secretos TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: taggings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.taggings ENABLE ROW LEVEL SECURITY;

--
-- Name: taggings taggings_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY taggings_admin_all ON public.taggings TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: taggings taggings_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY taggings_member_org ON public.taggings TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_admin_all ON public.tags TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: tags tags_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_member_org ON public.tags TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: ticket_comentarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_comentarios ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_comentarios ticket_comentarios_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_comentarios_admin_all ON public.ticket_comentarios TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: ticket_comentarios ticket_comentarios_member_ticket; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ticket_comentarios_member_ticket ON public.ticket_comentarios TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets tickets_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_admin_all ON public.tickets TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: tickets tickets_member_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_member_org ON public.tickets TO authenticated USING (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios usuarios_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_delete_admin ON public.usuarios FOR DELETE TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: usuarios usuarios_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_insert_admin ON public.usuarios FOR INSERT TO authenticated WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: usuarios_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios_roles usuarios_roles_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_roles_admin ON public.usuarios_roles TO authenticated USING ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(auth.uid()) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: usuarios usuarios_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_select ON public.usuarios FOR SELECT TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR (id = ( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: usuarios usuarios_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_update ON public.usuarios FOR UPDATE TO authenticated USING (((public.es_admin(( SELECT auth.uid() AS uid)) OR (id = ( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK (((public.es_admin(( SELECT auth.uid() AS uid)) OR (id = ( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: webchat_session_closures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webchat_session_closures ENABLE ROW LEVEL SECURITY;

--
-- Name: webchat_session_closures webchat_session_closures_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webchat_session_closures_service_role ON public.webchat_session_closures TO service_role USING (true) WITH CHECK (true);


--
-- Name: webchat_visitantes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webchat_visitantes ENABLE ROW LEVEL SECURITY;

--
-- Name: webchat_visitantes webchat_visitantes_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webchat_visitantes_service_role ON public.webchat_visitantes TO service_role USING (true) WITH CHECK (true);


--
-- Name: webhooks_entrantes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhooks_entrantes ENABLE ROW LEVEL SECURITY;

--
-- Name: webhooks_entrantes webhooks_entrantes_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhooks_entrantes_admin ON public.webhooks_entrantes TO authenticated USING ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())))) WITH CHECK ((public.es_admin(( SELECT auth.uid() AS uid)) AND (organizacion_id = public.usuario_organizacion_id(( SELECT auth.uid() AS uid))) AND (organizacion_id = public.usuario_organizacion_id(auth.uid())) AND (organizacion_id = public.usuario_organizacion_id(auth.uid()))));


--
-- Name: webhooks_entrantes webhooks_rpc_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhooks_rpc_access ON public.webhooks_entrantes TO postgres USING ((organizacion_id = (NULLIF(current_setting('app.current_organizacion_id'::text, true), ''::text))::uuid)) WITH CHECK ((organizacion_id = (NULLIF(current_setting('app.current_organizacion_id'::text, true), ''::text))::uuid));


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
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

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
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

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

\unrestrict SPiWQ8bxip5PieHbjMdq87DSXvYnb1sQcN3jMz8bIxIuEXZ9EqfiQazD0SSLdb2

