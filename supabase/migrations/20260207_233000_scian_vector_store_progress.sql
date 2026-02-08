BEGIN;

CREATE TABLE IF NOT EXISTS public.scian_vector_store_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running',
  processed_count int NOT NULL DEFAULT 0,
  target_count int NOT NULL DEFAULT 0,
  last_offset int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scian_vector_store_progress_status_idx
  ON public.scian_vector_store_progress (status);

COMMIT;
