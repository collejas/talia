# Plan de remediación Supabase (CPU alto y alertas de seguridad)

## Objetivos
- Reducir el consumo de CPU optimizando consultas y procesos críticos.
- Corregir vulnerabilidades reportadas (SECURITY DEFINER, RLS, extensiones en `public`).
- Alinear la base de datos con las mejores prácticas de Supabase/Postgres.

---

## 1. Optimización de consultas del panel

| Paso | Descripción | Responsable | ETA |
| --- | --- | --- | --- |
| 1.1 | `GET /panel/agenda` – mover filtros de estado/proveedor/asignado al querystring y eliminar `prefer=count=exact`. | Backend | Día 1 |
| 1.2 | Agregar índices compuestos sobre `calendar_bookings(status, start_at)` y `panel_calendar_bookings(asignado_a_usuario_id)` para soportar los nuevos filtros. | DBA | Día 2 |
| 1.3 | Revisar `_map_agenda_row` y evitar filtrado adicional en Python; usar paginación por rango (`?select=...&limit=100&order=start_at.desc`). | Backend | Día 2 |
| 1.4 | Instrumentar tiempos de respuesta en FastAPI (log middleware) para medir la mejora. | Backend | Día 3 |

## 2. Prospección (Google Places + DENUE)

| Paso | Descripción | Responsable | ETA |
| --- | --- | --- | --- |
| 2.1 | Limitar `limit` máx. a 500 y eliminar `count=exact` en `/prospeccion/google|denue/resultados`. | Backend | Día 1 |
| 2.2 | Materializar campos calculados en `resultados` (ej. `display_name`, `contact_phone`) y crear índices trigram sobre ellos para usar `ILIKE`. | DBA | Día 3 |
| 2.3 | Precalcular `distancia_m` al insertar en `resultados` usando la geografía del centro de búsqueda; persistir columna numeric e indexarla. | Backend/DBA | Día 4 |
| 2.4 | Revisar uso de `ST_Distance` en vistas `v_google_places_contactables`/`v_denue_contactables`. Si sigue siendo requerido, crear vistas materializadas y refrescarlas cada 15 min. | DBA | Día 5 |

## 3. Triggers de contactos y leads

| Paso | Descripción | Responsable | ETA |
| --- | --- | --- | --- |
| 3.1 | Analizar `tg_contactos_auto_asignacion` y `tg_contactos_auto_precalificado`. Medir filas/segundo y locking sobre `empleados`. | Backend/DBA | Día 1 |
| 3.2 | Convertir la asignación round-robin en job asíncrono (tabla `contactos_pendientes_rr` + worker). Mantener trigger solo para encolar trabajos. | Backend | Día 4 |
| 3.3 | Para precalificación, usar cola/`LISTEN/NOTIFY` o `pg_cron` cada minuto que revise contactos con `captura_estado IS NULL`. | Backend/DBA | Día 5 |
| 3.4 | Agregar métricas (Prometheus o logs) de duración para cada trigger/job. | DevOps | Día 6 |

## 4. Alertas de seguridad

| Paso | Descripción | Responsable | ETA |
| --- | --- | --- | --- |
| 4.1 | Re-crear todas las vistas marcadas con `SECURITY DEFINER` como `SECURITY INVOKER` (`panel_calendar_bookings`, `v_configuracion_personal`, `embudo`, `conversaciones_en_curso`, `v_resultados_*`). | DBA | Día 2 |
| 4.2 | Revisar funciones con search_path mutable (`tg_*`, `fn_*`). Añadir `SET search_path TO public, pg_temp` y `SECURITY INVOKER` cuando sea posible. | DBA | Día 3 |
| 4.3 | Habilitar RLS en tablas públicas señaladas (`agentes`, `calendar_*`, `custom_fields`, `prompt_*`, etc.) y definir políticas mínimas para `authenticated`. | DBA | Día 4 |
| 4.4 | Revocar SELECT sobre la vista materializada `mv_resultados_por_actividad` para `anon`/`authenticated` o moverla a otro esquema. | DBA | Día 4 |
| 4.5 | Mover extensiones instaladas en `public` (`postgis`, `pg_trgm`, `btree_gist`, `unaccent`) al esquema `extensions`. | DBA | Día 5 |
| 4.6 | Activar “Leaked password protection” en Supabase Auth. | DevOps | Día 1 |

## 5. Validación y monitoreo

| Paso | Descripción | Responsable | ETA |
| --- | --- | --- | --- |
| 5.1 | Ejecutar `supabase db lint` después de cada bloque y documentar resultados. | DBA | Cada entrega |
| 5.2 | Revisar `pg_stat_statements` (Top 20) antes y después del plan para confirmar reducción de CPU. | DBA | Semanal |
| 5.3 | Configurar alertas (Supabase Usage + Grafana) para CPU > 70 % sostenido y latencia API > 1 s. | DevOps | Día 6 |

---

## Dependencias y riesgos
- Las vistas utilizadas por el panel pueden necesitar ventanas de mantenimiento para recrearse (coordinar con equipo frontend).
- Cambios de RLS requieren pruebas exhaustivas con tokens `anon` y `authenticated` para evitar bloqueos a usuarios finales.
- Materializar resultados aumenta el almacenamiento; se debe definir retención y política de refresco.

## Checklist de entrega
- [ ] Consultas del panel/prospección sin conteo exacto y con métricas registradas.
- [ ] Triggers migrados a jobs y sin bloqueos reportados.
- [ ] Supabase linter sin errores críticos.
- [ ] CPU promedio < 50 % en horario pico durante 48 h posteriores.
- [ ] Documentación actualizada (README + runbooks).

