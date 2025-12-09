-- Create table for storing conversation summaries to keep historical context.
CREATE TABLE IF NOT EXISTS public.conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversacion_id UUID NOT NULL REFERENCES public.conversaciones(id) ON DELETE CASCADE,
    contacto_id UUID REFERENCES public.contactos(id),
    organizacion_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::UUID REFERENCES public.organizaciones(id),
    tipo TEXT NOT NULL DEFAULT 'conversation',
    resumen TEXT NOT NULL,
    metadatos JSONB NOT NULL DEFAULT '{}'::JSONB,
    creado_por_usuario_id UUID REFERENCES public.usuarios(id),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_summaries_conversacion_id_idx
    ON public.conversation_summaries (conversacion_id);

CREATE INDEX IF NOT EXISTS conversation_summaries_contacto_id_idx
    ON public.conversation_summaries (contacto_id);

