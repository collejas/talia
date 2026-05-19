BEGIN;

ALTER TABLE public.conversation_summaries
    DROP CONSTRAINT IF EXISTS conversation_summaries_contacto_org_fkey;

COMMIT;
