-- Allow authenticated users write access to prospecting results so RPCs like upsert_resultados_lote succeed.
GRANT INSERT ON public.resultados TO authenticated;
GRANT UPDATE ON public.resultados TO authenticated;
GRANT DELETE ON public.resultados TO authenticated;
