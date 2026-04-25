BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM cron.job
        WHERE jobname = 'purga_resultados_denue_diaria'
    ) THEN
        PERFORM cron.unschedule('purga_resultados_denue_diaria');
    END IF;
END
$$;

SELECT cron.schedule(
    'purga_resultados_denue_diaria',
    '0 5 * * *',
    $$select public.purge_expired_resultados(5000, interval '0 days');$$
);

COMMENT ON FUNCTION public.purge_expired_resultados IS
    'Archiva y purga solo resultados DENUE vencidos por lotes. Google Places queda excluido del mantenimiento automático.';

COMMIT;
