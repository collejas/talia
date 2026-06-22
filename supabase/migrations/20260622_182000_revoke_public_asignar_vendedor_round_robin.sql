BEGIN;

-- Cierre final de exposición RPC: la función queda solo para service_role.

revoke execute on function public.asignar_vendedor_round_robin(uuid) from public;
revoke execute on function public.asignar_vendedor_round_robin(uuid) from authenticated;
grant execute on function public.asignar_vendedor_round_robin(uuid) to service_role;

COMMIT;
