CREATE TABLE IF NOT EXISTS public.oportunidad_scoring_eventos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    oportunidad_id uuid NOT NULL,
    conversacion_id uuid NULL,
    score_total numeric(5,2) NOT NULL CHECK (score_total >= 0 AND score_total <= 100),
    grade text NOT NULL CHECK (grade IN ('explorando', 'interesado', 'listo')),
    confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
    factors jsonb NOT NULL DEFAULT '{}'::jsonb,
    missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
    refused_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
    events jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT oportunidad_scoring_eventos_organizacion_id_fkey
        FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones(id)
        ON DELETE CASCADE,
    CONSTRAINT oportunidad_scoring_eventos_oportunidad_org_fkey
        FOREIGN KEY (oportunidad_id, organizacion_id)
        REFERENCES public.oportunidades(id, organizacion_id)
        ON DELETE CASCADE,
    CONSTRAINT oportunidad_scoring_eventos_conversacion_org_fkey
        FOREIGN KEY (conversacion_id, organizacion_id)
        REFERENCES public.conversaciones(id, organizacion_id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS oportunidad_scoring_eventos_org_created_idx
    ON public.oportunidad_scoring_eventos (organizacion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS oportunidad_scoring_eventos_oportunidad_created_idx
    ON public.oportunidad_scoring_eventos (oportunidad_id, created_at DESC);

CREATE INDEX IF NOT EXISTS oportunidad_scoring_eventos_org_grade_score_idx
    ON public.oportunidad_scoring_eventos (organizacion_id, grade, score_total);

ALTER TABLE public.oportunidad_scoring_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oportunidad_scoring_eventos_service_role_all ON public.oportunidad_scoring_eventos;
CREATE POLICY oportunidad_scoring_eventos_service_role_all
    ON public.oportunidad_scoring_eventos
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON TABLE public.oportunidad_scoring_eventos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.oportunidad_scoring_eventos TO service_role;

COMMENT ON TABLE public.oportunidad_scoring_eventos IS
    'Historial auditable de calculos de scoring por oportunidad para embudo de bienes raices.';
