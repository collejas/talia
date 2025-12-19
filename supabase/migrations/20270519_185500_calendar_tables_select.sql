-- Calendar tables must remain queryable via user-token endpoints (agenda, availability).
-- RLS already enforces tenant scoping, so we restore SELECT for authenticated clients.
grant select on public.calendar_bookings to authenticated;
grant select on public.calendar_resources to authenticated;
grant select on public.calendar_slot_holds to authenticated;
grant select on public.calendar_availability_patterns to authenticated;
grant select on public.calendar_exceptions to authenticated;
