-- Restore read access to the agenda view for authenticated users.
-- The view keeps security_invoker = true, so RLS on the underlying tables
-- still enforces tenant scoping.
grant select on public.panel_calendar_bookings to authenticated;
