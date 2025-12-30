-- Give authenticated users ability to insert/update/delete cuando utilizan los RPCs del buscador.
GRANT INSERT ON public.busquedas TO authenticated;
GRANT UPDATE ON public.busquedas TO authenticated;
GRANT DELETE ON public.busquedas TO authenticated;
