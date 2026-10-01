-- Optimiza los filtros de métricas por organización y fecha efectiva del envío.
CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_org_event_ts_idx
  ON public.prospeccion_contacto_envio
  USING btree (
    organizacion_id,
    (
      CASE
        WHEN canal = 'correo'::text THEN COALESCE(
          proveedor_aceptado_en,
          despacho_iniciado_en,
          procesado_en,
          creado_en,
          programado_en
        )
        ELSE COALESCE(procesado_en, creado_en, programado_en)
      END
    ),
    batch_id
  );

ANALYZE public.prospeccion_contacto_envio;
