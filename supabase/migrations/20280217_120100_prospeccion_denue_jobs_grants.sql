-- Allow authenticated sessions to insert and modify DENUE jobs so the UI can create/cancel jobs.
GRANT INSERT ON public.prospeccion_denue_jobs TO authenticated;
GRANT UPDATE ON public.prospeccion_denue_jobs TO authenticated;
GRANT DELETE ON public.prospeccion_denue_jobs TO authenticated;

