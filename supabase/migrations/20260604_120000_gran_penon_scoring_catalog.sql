-- Gran Peñón: catálogo de scoring por tenant/canal para WhatsApp.
-- Mantiene el flujo extendido sin bloquear la agenda con todas las preguntas.

insert into public.scoring_profiles (
    organizacion_id,
    canal,
    nombre,
    activo,
    weights,
    thresholds,
    confidence_thresholds,
    metadata,
    created_at,
    updated_at
)
values (
    '39e32c05-bfc2-4794-8aab-225873f2bf19',
    'whatsapp',
    'default',
    true,
    '{"capacidad_financiera":30,"urgencia":20,"nivel_decision":20,"autoridad":15,"interaccion_compromiso":15}'::jsonb,
    '{"explorando_max":50,"interesado_max":75,"listo_min":76}'::jsonb,
    '{"high_min":0.8,"medium_min":0.5}'::jsonb,
    '{"source":"gran_penon_scoring_seed_v1"}'::jsonb,
    now(),
    now()
)
on conflict (organizacion_id, canal, nombre)
do update set
    activo = excluded.activo,
    weights = excluded.weights,
    thresholds = excluded.thresholds,
    confidence_thresholds = excluded.confidence_thresholds,
    metadata = excluded.metadata,
    updated_at = now();

delete from public.scoring_rules
where organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'
  and canal = 'whatsapp';

with upserted_questions as (
    insert into public.scoring_questions (
        organizacion_id,
        canal,
        field_key,
        question_text,
        question_type,
        orden,
        activa,
        required_for_case_a,
        repregunta_max,
        allow_unknown,
        allow_refused,
        metadata,
        created_at,
        updated_at
    )
    values
        (
            '39e32c05-bfc2-4794-8aab-225873f2bf19',
            'whatsapp',
            'financing_type',
            '¿Comprarías de contado, crédito o mixto?',
            'single_choice',
            10,
            true,
            true,
            1,
            true,
            true,
            '{"factor":"capacidad_financiera"}'::jsonb,
            now(),
            now()
        ),
        (
            '39e32c05-bfc2-4794-8aab-225873f2bf19',
            'whatsapp',
            'budget_range',
            '¿Cuál es tu rango de presupuesto aproximado?',
            'single_choice',
            20,
            true,
            true,
            1,
            true,
            true,
            '{"factor":"capacidad_financiera","missing_score":40,"unknown_score":40,"refused_score":20}'::jsonb,
            now(),
            now()
        ),
        (
            '39e32c05-bfc2-4794-8aab-225873f2bf19',
            'whatsapp',
            'purchase_timeline',
            '¿En qué plazo planeas comprar?',
            'single_choice',
            30,
            true,
            true,
            1,
            true,
            true,
            '{"factor":"urgencia"}'::jsonb,
            now(),
            now()
        ),
        (
            '39e32c05-bfc2-4794-8aab-225873f2bf19',
            'whatsapp',
            'decision_authority',
            '¿Quién toma la decisión final de compra?',
            'single_choice',
            40,
            true,
            false,
            1,
            true,
            true,
            '{"factor":"autoridad"}'::jsonb,
            now(),
            now()
        ),
        (
            '39e32c05-bfc2-4794-8aab-225873f2bf19',
            'whatsapp',
            'credit_preapproved',
            '¿Ya tienes preaprobación de crédito?',
            'single_choice',
            50,
            true,
            true,
            1,
            true,
            true,
            '{"factor":"capacidad_financiera"}'::jsonb,
            now(),
            now()
        ),
        (
            '39e32c05-bfc2-4794-8aab-225873f2bf19',
            'whatsapp',
            'visited_properties',
            '¿Ya visitaste propiedades similares?',
            'single_choice',
            60,
            true,
            false,
            1,
            true,
            true,
            '{"factor":"nivel_decision"}'::jsonb,
            now(),
            now()
        ),
        (
            '39e32c05-bfc2-4794-8aab-225873f2bf19',
            'whatsapp',
            'down_payment_ready',
            '¿Ya tienes listo el enganche?',
            'single_choice',
            70,
            true,
            false,
            1,
            true,
            true,
            '{"factor":"capacidad_financiera"}'::jsonb,
            now(),
            now()
        ),
        (
            '39e32c05-bfc2-4794-8aab-225873f2bf19',
            'whatsapp',
            'hard_deadline',
            '¿Tienes una fecha límite para comprar?',
            'single_choice',
            80,
            true,
            false,
            1,
            true,
            true,
            '{"factor":"urgencia"}'::jsonb,
            now(),
            now()
        ),
        (
            '39e32c05-bfc2-4794-8aab-225873f2bf19',
            'whatsapp',
            'requirements_defined',
            '¿Ya tienes claras las características que buscas?',
            'single_choice',
            90,
            true,
            false,
            1,
            true,
            true,
            '{"factor":"nivel_decision"}'::jsonb,
            now(),
            now()
        ),
        (
            '39e32c05-bfc2-4794-8aab-225873f2bf19',
            'whatsapp',
            'comparison_mode',
            '¿Estás comparando opciones o apenas explorando?',
            'single_choice',
            100,
            true,
            false,
            1,
            true,
            true,
            '{"factor":"nivel_decision"}'::jsonb,
            now(),
            now()
        ),
        (
            '39e32c05-bfc2-4794-8aab-225873f2bf19',
            'whatsapp',
            'buyer_type',
            '¿La compra es para uso personal, familia, empresa o inversión?',
            'single_choice',
            110,
            true,
            false,
            1,
            true,
            true,
            '{"factor":"autoridad"}'::jsonb,
            now(),
            now()
        )
    on conflict (organizacion_id, canal, field_key)
    do update set
        question_text = excluded.question_text,
        question_type = excluded.question_type,
        orden = excluded.orden,
        activa = excluded.activa,
        required_for_case_a = excluded.required_for_case_a,
        repregunta_max = excluded.repregunta_max,
        allow_unknown = excluded.allow_unknown,
        allow_refused = excluded.allow_refused,
        metadata = excluded.metadata,
        updated_at = now()
    returning id, field_key
)
insert into public.scoring_question_reprompts (
    question_id,
    organizacion_id,
    canal,
    intento,
    prompt_text,
    activa,
    metadata,
    created_at,
    updated_at
)
select
    q.id,
    '39e32c05-bfc2-4794-8aab-225873f2bf19',
    'whatsapp',
    r.intento,
    r.prompt_text,
    true,
    r.metadata,
    now(),
    now()
from upserted_questions q
join (
    values
        ('financing_type', 1, '¿Lo ves más de contado, crédito o mixto?', '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('budget_range', 1, '¿Qué rango te gustaría considerar para no mostrarte opciones fuera de presupuesto?', '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('purchase_timeline', 1, '¿En qué plazo te gustaría comprar?', '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('decision_authority', 1, '¿La decisión la tomas tú solo o la revisan con alguien más?', '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('credit_preapproved', 1, '¿Ya cuentas con preaprobación o estás en trámite?', '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('visited_properties', 1, '¿Ya has visitado algún desarrollo similar?', '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('down_payment_ready', 1, '¿Ya tienes listo el enganche o aún lo estás preparando?', '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('hard_deadline', 1, '¿Tienes una fecha límite real para comprar?', '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('requirements_defined', 1, '¿Ya tienes claras las características que buscas?', '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('comparison_mode', 1, '¿Estás comparando opciones o apenas explorando?', '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('buyer_type', 1, '¿La compra es para ti, tu familia o para inversión?', '{"source":"gran_penon_scoring_seed_v1"}'::jsonb)
) as r(field_key, intento, prompt_text, metadata)
  on q.field_key = r.field_key
on conflict (question_id, intento)
do update set
    prompt_text = excluded.prompt_text,
    activa = excluded.activa,
    metadata = excluded.metadata,
    updated_at = now();

insert into public.scoring_rules (
    question_id,
    organizacion_id,
    canal,
    rule_type,
    match_value,
    min_value,
    max_value,
    score,
    normalized_value,
    priority,
    activa,
    metadata,
    created_at,
    updated_at
)
select
    q.id,
    '39e32c05-bfc2-4794-8aab-225873f2bf19',
    'whatsapp',
    r.rule_type,
    r.match_value,
    r.min_value,
    r.max_value,
    r.score,
    r.normalized_value,
    r.priority,
    true,
    r.metadata,
    now(),
    now()
from public.scoring_questions q
join (
    values
        ('financing_type', 'equals', 'contado', null::numeric, null::numeric, 100, null::text, 10, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('financing_type', 'equals', 'mixto', null::numeric, null::numeric, 90, null::text, 20, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('financing_type', 'equals', 'credito', null::numeric, null::numeric, 80, null::text, 30, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('financing_type', 'equals', 'unknown', null::numeric, null::numeric, 40, null::text, 40, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('financing_type', 'equals', 'refused', null::numeric, null::numeric, 20, null::text, 50, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('budget_range', 'equals', 'unknown', null::numeric, null::numeric, 40, null::text, 10, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('budget_range', 'equals', 'refused', null::numeric, null::numeric, 20, null::text, 20, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('budget_range', 'any', null, null::numeric, null::numeric, 100, null::text, 200, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('purchase_timeline', 'equals', '<3m', null::numeric, null::numeric, 100, null::text, 10, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('purchase_timeline', 'equals', '3-6m', null::numeric, null::numeric, 80, null::text, 20, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('purchase_timeline', 'equals', '6-12m', null::numeric, null::numeric, 60, null::text, 30, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('purchase_timeline', 'equals', '>12m', null::numeric, null::numeric, 30, null::text, 40, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('purchase_timeline', 'equals', 'unknown', null::numeric, null::numeric, 40, null::text, 50, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('purchase_timeline', 'equals', 'refused', null::numeric, null::numeric, 20, null::text, 60, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('decision_authority', 'equals', 'full', null::numeric, null::numeric, 100, null::text, 10, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('decision_authority', 'equals', 'shared', null::numeric, null::numeric, 75, null::text, 20, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('decision_authority', 'equals', 'advisor', null::numeric, null::numeric, 40, null::text, 30, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('decision_authority', 'equals', 'unknown', null::numeric, null::numeric, 40, null::text, 40, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('decision_authority', 'equals', 'refused', null::numeric, null::numeric, 20, null::text, 50, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('credit_preapproved', 'equals', 'yes', null::numeric, null::numeric, 100, null::text, 10, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('credit_preapproved', 'equals', 'in_process', null::numeric, null::numeric, 70, null::text, 20, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('credit_preapproved', 'equals', 'no', null::numeric, null::numeric, 30, null::text, 30, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('credit_preapproved', 'equals', 'unknown', null::numeric, null::numeric, 40, null::text, 40, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('credit_preapproved', 'equals', 'refused', null::numeric, null::numeric, 20, null::text, 50, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('visited_properties', 'equals', 'yes', null::numeric, null::numeric, 100, null::text, 10, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('visited_properties', 'equals', 'no', null::numeric, null::numeric, 50, null::text, 20, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('visited_properties', 'equals', 'unknown', null::numeric, null::numeric, 40, null::text, 30, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('visited_properties', 'equals', 'refused', null::numeric, null::numeric, 20, null::text, 40, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('down_payment_ready', 'equals', 'yes', null::numeric, null::numeric, 100, null::text, 10, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('down_payment_ready', 'equals', 'partial', null::numeric, null::numeric, 70, null::text, 20, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('down_payment_ready', 'equals', 'no', null::numeric, null::numeric, 30, null::text, 30, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('down_payment_ready', 'equals', 'unknown', null::numeric, null::numeric, 40, null::text, 40, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('down_payment_ready', 'equals', 'refused', null::numeric, null::numeric, 20, null::text, 50, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('hard_deadline', 'equals', 'yes', null::numeric, null::numeric, 100, null::text, 10, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('hard_deadline', 'equals', 'no', null::numeric, null::numeric, 50, null::text, 20, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('hard_deadline', 'equals', 'unknown', null::numeric, null::numeric, 40, null::text, 30, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('hard_deadline', 'equals', 'refused', null::numeric, null::numeric, 20, null::text, 40, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('requirements_defined', 'equals', 'high', null::numeric, null::numeric, 100, null::text, 10, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('requirements_defined', 'equals', 'medium', null::numeric, null::numeric, 70, null::text, 20, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('requirements_defined', 'equals', 'low', null::numeric, null::numeric, 40, null::text, 30, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('requirements_defined', 'equals', 'unknown', null::numeric, null::numeric, 40, null::text, 40, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('requirements_defined', 'equals', 'refused', null::numeric, null::numeric, 20, null::text, 50, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('comparison_mode', 'equals', 'shortlist', null::numeric, null::numeric, 100, null::text, 10, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('comparison_mode', 'equals', 'comparing', null::numeric, null::numeric, 75, null::text, 20, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('comparison_mode', 'equals', 'exploring', null::numeric, null::numeric, 45, null::text, 30, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('comparison_mode', 'equals', 'unknown', null::numeric, null::numeric, 40, null::text, 40, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('comparison_mode', 'equals', 'refused', null::numeric, null::numeric, 20, null::text, 50, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('buyer_type', 'equals', 'individual', null::numeric, null::numeric, 80, null::text, 10, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('buyer_type', 'equals', 'couple', null::numeric, null::numeric, 80, null::text, 20, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('buyer_type', 'equals', 'family', null::numeric, null::numeric, 80, null::text, 30, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('buyer_type', 'equals', 'company', null::numeric, null::numeric, 90, null::text, 40, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('buyer_type', 'equals', 'investor', null::numeric, null::numeric, 90, null::text, 50, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('buyer_type', 'equals', 'unknown', null::numeric, null::numeric, 40, null::text, 60, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb),
        ('buyer_type', 'equals', 'refused', null::numeric, null::numeric, 20, null::text, 70, '{"source":"gran_penon_scoring_seed_v1"}'::jsonb)
) as r(field_key, rule_type, match_value, min_value, max_value, score, normalized_value, priority, metadata)
  on q.field_key = r.field_key
where q.organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'
  and q.canal = 'whatsapp';
