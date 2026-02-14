CREATE TABLE IF NOT EXISTS public.scoring_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    canal text NOT NULL CHECK (canal IN ('whatsapp', 'webchat')),
    nombre text NOT NULL DEFAULT 'default',
    activo boolean NOT NULL DEFAULT true,
    weights jsonb NOT NULL DEFAULT '{}'::jsonb,
    thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
    confidence_thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT scoring_profiles_unique_org_channel_name UNIQUE (organizacion_id, canal, nombre)
);

CREATE INDEX IF NOT EXISTS scoring_profiles_org_channel_idx
    ON public.scoring_profiles (organizacion_id, canal, activo);

CREATE TABLE IF NOT EXISTS public.scoring_questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    canal text NOT NULL CHECK (canal IN ('whatsapp', 'webchat')),
    field_key text NOT NULL,
    question_text text NOT NULL,
    question_type text NOT NULL DEFAULT 'single_choice',
    orden integer NOT NULL DEFAULT 100,
    activa boolean NOT NULL DEFAULT true,
    required_for_case_a boolean NOT NULL DEFAULT false,
    repregunta_max smallint NOT NULL DEFAULT 1 CHECK (repregunta_max >= 0 AND repregunta_max <= 5),
    allow_unknown boolean NOT NULL DEFAULT true,
    allow_refused boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT scoring_questions_unique_org_channel_field UNIQUE (organizacion_id, canal, field_key)
);

CREATE INDEX IF NOT EXISTS scoring_questions_org_channel_order_idx
    ON public.scoring_questions (organizacion_id, canal, activa, orden, field_key);

CREATE TABLE IF NOT EXISTS public.scoring_question_reprompts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES public.scoring_questions(id) ON DELETE CASCADE,
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    canal text NOT NULL CHECK (canal IN ('whatsapp', 'webchat')),
    intento smallint NOT NULL CHECK (intento >= 1 AND intento <= 5),
    prompt_text text NOT NULL,
    activa boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT scoring_question_reprompts_unique_question_try UNIQUE (question_id, intento)
);

CREATE INDEX IF NOT EXISTS scoring_question_reprompts_org_channel_idx
    ON public.scoring_question_reprompts (organizacion_id, canal, question_id, intento);

CREATE TABLE IF NOT EXISTS public.scoring_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES public.scoring_questions(id) ON DELETE CASCADE,
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    canal text NOT NULL CHECK (canal IN ('whatsapp', 'webchat')),
    rule_type text NOT NULL DEFAULT 'equals',
    match_value text NULL,
    min_value numeric NULL,
    max_value numeric NULL,
    score integer NOT NULL CHECK (score >= 0 AND score <= 100),
    normalized_value text NULL,
    priority smallint NOT NULL DEFAULT 100,
    activa boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scoring_rules_org_channel_question_priority_idx
    ON public.scoring_rules (organizacion_id, canal, question_id, activa, priority);

ALTER TABLE public.scoring_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_question_reprompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scoring_profiles_service_role_all ON public.scoring_profiles;
CREATE POLICY scoring_profiles_service_role_all
    ON public.scoring_profiles
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS scoring_questions_service_role_all ON public.scoring_questions;
CREATE POLICY scoring_questions_service_role_all
    ON public.scoring_questions
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS scoring_question_reprompts_service_role_all ON public.scoring_question_reprompts;
CREATE POLICY scoring_question_reprompts_service_role_all
    ON public.scoring_question_reprompts
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS scoring_rules_service_role_all ON public.scoring_rules;
CREATE POLICY scoring_rules_service_role_all
    ON public.scoring_rules
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON TABLE public.scoring_profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.scoring_questions FROM anon, authenticated;
REVOKE ALL ON TABLE public.scoring_question_reprompts FROM anon, authenticated;
REVOKE ALL ON TABLE public.scoring_rules FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scoring_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scoring_questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scoring_question_reprompts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scoring_rules TO service_role;

COMMENT ON TABLE public.scoring_profiles IS
    'Perfiles de scoring por tenant/canal con pesos y umbrales configurables desde frontend.';

COMMENT ON TABLE public.scoring_questions IS
    'Banco de preguntas de perfilamiento por tenant/canal.';

COMMENT ON TABLE public.scoring_question_reprompts IS
    'Variantes de repregunta por intento para cada pregunta de scoring.';

COMMENT ON TABLE public.scoring_rules IS
    'Reglas de puntuacion por pregunta (match/rango -> score).';
