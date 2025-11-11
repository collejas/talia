# Scripts de apoyo para limpieza y corte de citas

> Todos los comandos están pensados para ejecutarse mediante el cliente `psql` apuntando a la instancia de Supabase. Sustituye los valores de conexión por los de producción (`SUPABASE_DATABASE_URL`).  
> Antes de ejecutar cambios, asegúrate de tener un respaldo reciente (`backups/postgres_YYYYMMDD_full.dump`).

## 1. Resumen de citas activas por estado

```sql
SELECT
    estado,
    COUNT(*) AS total,
    MIN(start_at) AS primera_cita,
    MAX(start_at) AS ultima_cita
FROM public.citas
WHERE estado IN ('pendiente','confirmada','reprogramada')
GROUP BY estado
ORDER BY estado;
```

## 2. Detección de empalmes por calendario

```sql
WITH activos AS (
    SELECT
        id,
        provider,
        COALESCE(provider_calendar_id, provider) AS calendario,
        tstzrange(start_at, COALESCE(end_at, start_at + INTERVAL '45 minutes')) AS rango
    FROM public.citas
    WHERE estado IN ('pendiente','confirmada','reprogramada')
),
empalmes AS (
    SELECT
        a1.id AS cita_id,
        a2.id AS cita_conflictiva,
        a1.provider,
        a1.calendario,
        a1.rango,
        a2.rango AS rango_conflictivo
    FROM activos a1
    JOIN activos a2
      ON a1.calendario = a2.calendario
     AND a1.id <> a2.id
     AND a1.rango && a2.rango
)
SELECT DISTINCT
    provider,
    calendario,
    cita_id,
    cita_conflictiva
FROM empalmes
ORDER BY provider, calendario, cita_id;
```

## 3. Exportar citas activas para respaldo manual

```sql
\copy (
    SELECT
        id,
        tarjeta_id,
        contacto_id,
        start_at,
        end_at,
        timezone,
        estado,
        provider,
        provider_event_id,
        metadata
    FROM public.citas
    WHERE estado IN ('pendiente','confirmada','reprogramada')
    ORDER BY start_at
) TO 'citas_activas_pre_migracion.csv' WITH CSV HEADER;
```

## 4. Cancelar citas duplicadas (ejemplo)

> Ajusta el filtro de `WHERE` con los identificadores concretos que quieras cancelar.  
> En lugar de `UPDATE` puedes utilizar `SELECT fn_cita_cancel(...)` si deseas disparar la lógica de trigger y metadata.

```sql
UPDATE public.citas
SET
    estado = 'cancelada',
    cancel_reason = 'Migración calendario — duplicado detectado',
    updated_by = auth.uid(),
    actualizado_en = NOW()
WHERE id IN (
    -- IDs a cancelar
    '00000000-0000-0000-0000-000000000000'
)
RETURNING id, start_at, provider;
```

## 5. Normalizar fin de citas sin `end_at`

> Útil para garantizar duraciones explícitas antes de ejecutar validaciones de traslapes.

```sql
UPDATE public.citas
SET
    end_at = start_at + INTERVAL '45 minutes'
WHERE end_at IS NULL
  AND estado IN ('pendiente','confirmada','reprogramada');
```

## 6. Registrar auditoría previa al corte

```sql
INSERT INTO public.eventos_auditoria (
    tipo,
    entidad,
    referencia_id,
    payload
)
SELECT
    'migracion_calendario' AS tipo,
    'citas' AS entidad,
    id AS referencia_id,
    jsonb_build_object(
        'estado', estado,
        'start_at', start_at,
        'provider', provider,
        'metadata', metadata
    )
FROM public.citas
WHERE estado IN ('pendiente','confirmada','reprogramada');
```

## 7. Cancelación masiva durante el corte

> Ejecuta únicamente si se acuerda vaciar la agenda durante el mantenimiento.  
> Considera exportar previamente todos los registros (ver paso 3).

```sql
UPDATE public.citas
SET
    estado = 'cancelada',
    cancel_reason = 'Cancelada durante mantenimiento para migración de calendario',
    updated_by = auth.uid(),
    actualizado_en = NOW()
WHERE estado IN ('pendiente','confirmada','reprogramada');
```

## 8. Verificación posterior

```sql
SELECT
    provider,
    COUNT(*) FILTER (WHERE estado IN ('pendiente','confirmada','reprogramada')) AS activas,
    COUNT(*) FILTER (WHERE estado = 'cancelada') AS canceladas_durante_mantenimiento
FROM public.citas
GROUP BY provider
ORDER BY provider;
```

---

**Notas**
- Sustituye `auth.uid()` por un UUID válido si ejecutas las sentencias fuera de Supabase Edge Functions.
- Después del mantenimiento, reactiva los endpoints (`schedule_demo`, panel `/agenda/demos`) y actualiza los prompts.
- Conserva los CSV y registros de auditoría como respaldo para eventuales revisiones.
