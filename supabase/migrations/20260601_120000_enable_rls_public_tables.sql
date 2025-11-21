BEGIN;

-- Calendario: tablas usadas por vistas del panel.
ALTER TABLE IF EXISTS public.calendar_resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_resources_select_authenticated ON public.calendar_resources;
CREATE POLICY calendar_resources_select_authenticated
    ON public.calendar_resources
    FOR SELECT
    TO authenticated
    USING (true);

ALTER TABLE IF EXISTS public.calendar_availability_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_availability_patterns_select_authenticated ON public.calendar_availability_patterns;
CREATE POLICY calendar_availability_patterns_select_authenticated
    ON public.calendar_availability_patterns
    FOR SELECT
    TO authenticated
    USING (true);

ALTER TABLE IF EXISTS public.calendar_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_exceptions_select_authenticated ON public.calendar_exceptions;
CREATE POLICY calendar_exceptions_select_authenticated
    ON public.calendar_exceptions
    FOR SELECT
    TO authenticated
    USING (true);

ALTER TABLE IF EXISTS public.calendar_slot_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_slot_holds_select_authenticated ON public.calendar_slot_holds;
CREATE POLICY calendar_slot_holds_select_authenticated
    ON public.calendar_slot_holds
    FOR SELECT
    TO authenticated
    USING (true);

ALTER TABLE IF EXISTS public.calendar_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_bookings_select_authenticated ON public.calendar_bookings;
CREATE POLICY calendar_bookings_select_authenticated
    ON public.calendar_bookings
    FOR SELECT
    TO authenticated
    USING (true);

ALTER TABLE IF EXISTS public.panel_calendar_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS panel_calendar_settings_select_authenticated ON public.panel_calendar_settings;
CREATE POLICY panel_calendar_settings_select_authenticated
    ON public.panel_calendar_settings
    FOR SELECT
    TO authenticated
    USING (true);

ALTER TABLE IF EXISTS public.panel_email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS panel_email_templates_select_authenticated ON public.panel_email_templates;
CREATE POLICY panel_email_templates_select_authenticated
    ON public.panel_email_templates
    FOR SELECT
    TO authenticated
    USING (true);

-- Catálogos de prompts y agentes.
ALTER TABLE IF EXISTS public.agentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agentes_select_authenticated ON public.agentes;
CREATE POLICY agentes_select_authenticated
    ON public.agentes
    FOR SELECT
    TO authenticated
    USING (true);

ALTER TABLE IF EXISTS public.custom_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS custom_fields_select_authenticated ON public.custom_fields;
CREATE POLICY custom_fields_select_authenticated
    ON public.custom_fields
    FOR SELECT
    TO authenticated
    USING (true);

ALTER TABLE IF EXISTS public.prompt_bindings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prompt_bindings_select_authenticated ON public.prompt_bindings;
CREATE POLICY prompt_bindings_select_authenticated
    ON public.prompt_bindings
    FOR SELECT
    TO authenticated
    USING (true);

ALTER TABLE IF EXISTS public.prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prompts_select_authenticated ON public.prompts;
CREATE POLICY prompts_select_authenticated
    ON public.prompts
    FOR SELECT
    TO authenticated
    USING (true);

ALTER TABLE IF EXISTS public.prompt_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prompt_versions_select_authenticated ON public.prompt_versions;
CREATE POLICY prompt_versions_select_authenticated
    ON public.prompt_versions
    FOR SELECT
    TO authenticated
    USING (true);

COMMIT;
