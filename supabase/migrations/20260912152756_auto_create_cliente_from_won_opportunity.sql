BEGIN;

-- A winning opportunity is a business event, not only a visual pipeline state.
-- Keep the existing public.clientes model and make the conversion idempotent.
CREATE OR REPLACE FUNCTION public.ensure_cliente_from_oportunidad(
    p_oportunidad_id uuid
)
RETURNS public.clientes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_op public.oportunidades%ROWTYPE;
    v_contact public.contactos%ROWTYPE;
    v_cliente public.clientes%ROWTYPE;
    v_categoria text;
    v_cuenta_id uuid;
    v_nombre_cuenta text;
    v_metadata jsonb;
BEGIN
    SELECT o.*
      INTO v_op
      FROM public.oportunidades o
     WHERE o.id = p_oportunidad_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'oportunidad_no_encontrada';
    END IF;

    SELECT lower(coalesce(ep.categoria, ''))
      INTO v_categoria
      FROM public.etapas_pipeline ep
     WHERE ep.id = v_op.etapa_id
       AND ep.organizacion_id = v_op.organizacion_id;

    IF coalesce(v_categoria, '') <> 'ganada'
       AND lower(coalesce(v_op.estado, '')) <> 'ganada' THEN
        RETURN NULL;
    END IF;

    IF v_op.contacto_principal_id IS NULL THEN
        RAISE EXCEPTION 'oportunidad_sin_contacto_principal';
    END IF;

    SELECT c.*
      INTO v_contact
      FROM public.contactos c
     WHERE c.id = v_op.contacto_principal_id
       AND c.organizacion_id = v_op.organizacion_id;

    IF NOT FOUND THEN
        -- Older CRM rows can retain the contact UUID after the contact row was
        -- removed. Recover the minimum identity from the opportunity snapshot
        -- before creating the client, preserving the original UUID.
        INSERT INTO public.contactos (
            id,
            organizacion_id,
            nombre_completo,
            company_name,
            estado,
            captura_estado,
            contacto_datos,
            persona_datos
        ) VALUES (
            v_op.contacto_principal_id,
            v_op.organizacion_id,
            coalesce(nullif(btrim(v_op.contacto_nombre), ''), nullif(btrim(v_op.titulo), ''), 'Contacto recuperado'),
            nullif(btrim(v_op.metadata ->> 'contacto_empresa'), ''),
            'lead',
            'incompleto',
            jsonb_build_object(
                'recovered_from_won_opportunity', v_op.id,
                'recovery_note', 'Identidad mínima reconstruida desde el snapshot de la oportunidad.'
            ),
            '{}'::jsonb
        )
        RETURNING * INTO v_contact;
    END IF;

    -- Repair legacy opportunities without an account before creating the client.
    v_cuenta_id := v_op.cuenta_id;
    IF v_cuenta_id IS NULL THEN
        v_nombre_cuenta := coalesce(
            nullif(btrim(v_contact.company_name), ''),
            nullif(btrim(v_op.titulo), ''),
            nullif(btrim(v_contact.nombre_completo), ''),
            'Cuenta generada desde oportunidad ganada'
        );

        INSERT INTO public.cuentas (
            organizacion_id,
            nombre,
            telefono,
            correo,
            metadata
        ) VALUES (
            v_op.organizacion_id,
            v_nombre_cuenta,
            v_contact.telefono_e164,
            v_contact.correo,
            jsonb_build_object(
                'auto_created_from_won_opportunity', v_op.id
            )
        )
        RETURNING id INTO v_cuenta_id;

        UPDATE public.oportunidades
           SET cuenta_id = v_cuenta_id,
               actualizado_en = now()
         WHERE id = v_op.id
           AND organizacion_id = v_op.organizacion_id;
    END IF;

    SELECT c.*
      INTO v_cliente
      FROM public.clientes c
     WHERE c.organizacion_id = v_op.organizacion_id
       AND c.oportunidad_id = v_op.id
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
        RETURN v_cliente;
    END IF;

    v_metadata := coalesce(v_op.metadata, '{}'::jsonb) || jsonb_build_object(
        'oportunidad_id', v_op.id,
        'oportunidad_estado', v_op.estado,
        'conversion_source', 'oportunidad_ganada_automatica'
    );

    INSERT INTO public.clientes (
        contacto_id,
        persona_id,
        oportunidad_id,
        cuenta_id,
        organizacion_id,
        etapa_id,
        monto_estimado,
        moneda,
        fuente,
        metadatos,
        ganado_en
    ) VALUES (
        v_op.contacto_principal_id,
        v_op.contacto_principal_id,
        v_op.id,
        v_cuenta_id,
        v_op.organizacion_id,
        v_op.etapa_id,
        v_op.monto_estimado,
        coalesce(v_op.moneda, 'MXN'),
        coalesce(v_op.metadata ->> 'fuente', v_op.metadata ->> 'origen', 'pipeline'),
        v_metadata,
        coalesce(v_op.cerrado_en, now())
    )
    ON CONFLICT (contacto_id) DO UPDATE
       SET oportunidad_id = excluded.oportunidad_id,
           cuenta_id = excluded.cuenta_id,
           organizacion_id = excluded.organizacion_id,
           etapa_id = excluded.etapa_id,
           monto_estimado = coalesce(excluded.monto_estimado, public.clientes.monto_estimado),
           moneda = coalesce(excluded.moneda, public.clientes.moneda),
           fuente = coalesce(excluded.fuente, public.clientes.fuente),
           metadatos = public.clientes.metadatos || excluded.metadatos,
           ganado_en = coalesce(public.clientes.ganado_en, excluded.ganado_en),
           actualizado_en = now()
    RETURNING * INTO v_cliente;

    RETURN v_cliente;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_cliente_from_oportunidad(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_cliente_from_oportunidad(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_convertir_oportunidad_ganada_en_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_categoria text;
BEGIN
    SELECT lower(coalesce(ep.categoria, ''))
      INTO v_categoria
      FROM public.etapas_pipeline ep
     WHERE ep.id = NEW.etapa_id
       AND ep.organizacion_id = NEW.organizacion_id;

    IF v_categoria = 'ganada' OR lower(coalesce(NEW.estado, '')) = 'ganada' THEN
        PERFORM public.ensure_cliente_from_oportunidad(NEW.id);
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_convertir_oportunidad_ganada_en_cliente() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_convertir_oportunidad_ganada_en_cliente() TO service_role;

DROP TRIGGER IF EXISTS oportunidades_auto_crear_cliente_ganada ON public.oportunidades;
CREATE TRIGGER oportunidades_auto_crear_cliente_ganada
AFTER INSERT OR UPDATE OF etapa_id, estado, cuenta_id, contacto_principal_id
ON public.oportunidades
FOR EACH ROW
EXECUTE FUNCTION public.tg_convertir_oportunidad_ganada_en_cliente();

-- Repair existing won opportunities. This is idempotent and runs in the same
-- transaction as the migration; rows lacking a contact fail explicitly.
DO $$
DECLARE
    v_id uuid;
BEGIN
    FOR v_id IN
        SELECT o.id
          FROM public.oportunidades o
          LEFT JOIN public.etapas_pipeline ep
            ON ep.id = o.etapa_id
           AND ep.organizacion_id = o.organizacion_id
         WHERE lower(coalesce(o.estado, '')) = 'ganada'
            OR lower(coalesce(ep.categoria, '')) = 'ganada'
    LOOP
        PERFORM public.ensure_cliente_from_oportunidad(v_id);
    END LOOP;
END;
$$;

COMMIT;
