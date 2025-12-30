-- Allow authenticated sessions to insert and modify buscador jobs so the UI can create/delete jobs.
GRANT INSERT ON public.prospeccion_buscador_jobs TO authenticated;
GRANT UPDATE ON public.prospeccion_buscador_jobs TO authenticated;
GRANT DELETE ON public.prospeccion_buscador_jobs TO authenticated;
