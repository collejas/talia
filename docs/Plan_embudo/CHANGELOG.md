# Changelog — Plan de recuperación de oportunidades

Historial de avances del plan definido en [Plan_recuperacion_oportunidades.md](/var/www/talia/docs/Plan_embudo/Plan_recuperacion_oportunidades.md).

## 2026-09-06 — Registro manual de intentos de reactivación

### Completado

- Se creó y aplicó la migración [`20260906_150000_oportunidad_reactivacion_intentos.sql`](/var/www/talia/supabase/migrations/20260906_150000_oportunidad_reactivacion_intentos.sql).
- Se agregó `oportunidad_reactivacion_intentos` con tenant, oportunidad, usuario, canal, resultado, fecha y motivo como columnas explícitas.
- Se agregó el RPC transaccional `registrar_intento_reactivacion`, protegido para `service_role` y con validación de tenant y oportunidad abierta.
- Una reactivación confirmada actualiza el estado a Activo, incrementa el contador y registra `OPORTUNIDAD_REACTIVADA`.
- Se agregó el endpoint `POST /crm/pipeline/recovery/{oportunidad_id}/attempts` y su proxy del panel.
- La vista CRM → Informes ahora permite registrar el intento desde cada oportunidad.
- La acción es manual y auditable; no envía WhatsApp, correo ni otro mensaje.
- Se agregó selección múltiple en la vista y la acción “Registrar intento en bloque”.
- El lote admite hasta 100 oportunidades y devuelve el resultado individual de cada una, incluyendo fallos parciales.
- Se agregó el RPC `registrar_intentos_reactivacion_lote` y el endpoint `POST /crm/pipeline/recovery/attempts/bulk`.

### Validación

- Migración aplicada correctamente en Supabase/PostgreSQL.
- Prueba transaccional del RPC ejecutada y revertida, sin datos ficticios persistidos.
- `compileall`, pruebas de recuperación (`2 passed`), TypeScript y ESLint sin errores.
- React Doctor: `92/100`; conserva una advertencia de JSX duplicado en la tabla, sin error funcional.
- Release del panel: `20260906_003619`; `talia-api.service` y `talia-panel.service` activos.
- El endpoint publicado respondió `401` sin sesión, confirmando que la ruta existe detrás de autenticación.
- El endpoint de lote publicado respondió `401` sin sesión, confirmando que la nueva ruta está protegida.

## 2026-09-06 — Ejecución real de acciones de recuperación

### Completado

- Se reemplazó el flujo que solo registraba una intención por `Ejecutar acción`.
- WhatsApp utiliza el servicio de envío manual existente y requiere una conversación disponible.
- Correo utiliza el servicio de correo y la configuración del tenant existente.
- Llamada crea una actividad pendiente asignada al vendedor correspondiente.
- La operación individual y la operación en bloque ejecutan acciones reales.
- Cada oportunidad se procesa por separado y devuelve éxito o error individual.
- La ejecución queda auditada automáticamente como intento de reactivación.

### Validación

- TypeScript, ESLint y pruebas de recuperación sin errores.
- Panel desplegado en release `20260906_013100`.
- API y panel activos después del reinicio.
- El endpoint publicado respondió `401` sin sesión, confirmando que la acción está protegida.

## 2026-09-06 — Estados de seguimiento automáticos

### Completado

- Se creó y aplicó la migración [`20260906_130000_oportunidad_estados_seguimiento_automaticos.sql`](/var/www/talia/supabase/migrations/20260906_130000_oportunidad_estados_seguimiento_automaticos.sql).
- Se agregó el evaluador `evaluar_oportunidades_seguimiento(uuid)` para aplicar los umbrales configurados por organización.
- El evaluador solo procesa oportunidades abiertas con `ultima_interaccion_contacto_en` registrada.
- Se agregaron eventos específicos `OPORTUNIDAD_ESTANCADA` y `OPORTUNIDAD_DORMIDA`.
- Se agregó un worker periódico de backend para ejecutar la evaluación automática.
- El intervalo y la activación del worker pueden controlarse mediante configuración del backend.
- La ejecución es idempotente: una oportunidad no genera eventos repetidos si su estado no cambió.

### Validación

- Primera evaluación: `218` oportunidades actualizadas en `9` organizaciones.
- Estados resultantes en oportunidades abiertas: `174` Activo, `5` En riesgo, `73` Estancado y `140` Dormido.
- Segunda evaluación inmediata: `0` oportunidades actualizadas.
- Eventos generados: `218` cambios de estado, `73` eventos Estancado y `140` eventos Dormido.
- Las funciones internas quedaron restringidas a `service_role`.

## 2026-09-06 — Atribución explícita de conversaciones

### Completado

- Se revisaron las conversaciones que podían corresponder a más de una oportunidad por compartir persona/contacto.
- Se estableció la prioridad de atribución:
  1. `metadata.conversation_id` o `metadata.conversacion_id` explícito.
  2. Relación por persona/contacto únicamente cuando es única.
- Se agregó una función de resolución para impedir que una conversación ambigua actualice varias oportunidades.
- Se optimizó el backfill con una operación basada en CTEs para evitar consultas repetitivas y respetar el tiempo límite de PostgreSQL.
- Se recalcularon las fechas de interacción y actividad incorporando las relaciones explícitas existentes.

### Validación

- Backfill optimizado: `330` oportunidades procesadas.
- Interacciones atribuibles después del ajuste: `272` de `488` oportunidades.
- Tenant principal: `237` de `329` oportunidades con interacción atribuible.
- La evaluación automática posterior actualizó `11` estados de seguimiento.
- Estados actuales en oportunidades abiertas: `163` Activo, `5` En riesgo, `73` Estancado y `151` Dormido.
- Las conversaciones que siguen siendo ambiguas permanecen sin atribución automática.
- Pruebas backend de recuperación: `2 passed`.

## 2026-09-06 — Sincronización de interacción y backfill

### Completado

- Se confirmó que la última interacción del prospecto no debe confundirse con la actividad del vendedor.
- Se definió la separación operativa entre:
  - `ultima_interaccion_contacto_en`: última respuesta o interacción real del prospecto.
  - `ultimo_contacto_saliente_en`: último mensaje o intento del equipo.
  - `ultima_actividad_en`: última actividad comercial registrada.
  - `proxima_actividad_en`: siguiente acción pendiente o programada.
- Se creó y aplicó la migración [`20260906_120000_oportunidad_interaccion_sync.sql`](/var/www/talia/supabase/migrations/20260906_120000_oportunidad_interaccion_sync.sql).
- Se ejecutó un backfill histórico sobre las oportunidades existentes.
- El backfill utiliza mensajes entrantes como fuente de interacción real del prospecto.
- Las actividades completadas se utilizan como actividad del equipo, pero no reactivan por sí solas la interacción del contacto.
- Se agregaron triggers para mantener sincronizadas las fechas cuando se insertan o actualizan:
  - Mensajes.
  - Conversaciones.
  - Actividades.
- La atribución entre conversación y oportunidad se realiza por organización y persona/contacto.
- Las relaciones ambiguas no se asignan automáticamente para evitar mezclar conversaciones entre oportunidades.

### Validación de datos

- Oportunidades totales: `488`.
- Oportunidades con interacción real del prospecto: `255`.
- Oportunidades con contacto saliente: `298`.
- Oportunidades con actividad registrada: `316`.
- Oportunidades con próxima actividad: `19`.
- Tenant principal revisado: `144` oportunidades, `23` con interacción y `24` con actividad.
- Se identificaron `7` conversaciones con atribución ambigua; permanecen sin asignación automática.
- Los tres triggers quedaron activos en Supabase.

## 2026-09-05 — Configuración de seguimiento por tenant

### Completado

- Se creó la configuración de seguimiento por organización en `oportunidad_seguimiento_configuracion`.
- Se agregaron umbrales configurables para:
  - Activo.
  - En riesgo.
  - Estancado.
  - Dormido.
- Se agregaron ventanas configurables para reactivación y universo recuperable.
- Se agregó el límite configurable de intentos de reactivación.
- Se implementaron los endpoints autenticados para consultar y guardar la configuración.
- Se corrigió el acceso del backend a la configuración usando el contexto seguro de servicio después de validar los permisos del usuario.
- Se agregó validación para exigir el orden:

  ```text
  Activo < En riesgo < Estancado < Dormido
  ```

- La validación inválida se muestra ahora dentro de la sección de configuración y no como error de oportunidades.
- La clasificación del informe utiliza los umbrales configurados por cada tenant.

### Despliegue y validación

- Se desplegó el release `20260905_234826`.
- API y panel quedaron activos y saludables.
- La ruta BFF responde correctamente y exige sesión autenticada.
- Pruebas backend de recuperación: `2 passed`.
- Compilación Python y TypeScript sin errores bloqueantes.
- Lint sin errores; permanecen advertencias preexistentes del proyecto.

## 2026-09-05 — Módulo CRM → Informes

### Completado

- Se agregó **CRM → Informes** al panel lateral.
- Se creó la ruta `/crm/informes`.
- Se creó el BFF para recuperación y configuración:
  - `/api/crm/pipeline/recovery`
  - `/api/crm/pipeline/recovery/configuration`
- Se creó la vista inicial de recuperación de oportunidades.
- Se agregaron filtros por periodo, estado de seguimiento, temperatura y estrategia.
- Se agregaron indicadores iniciales:
  - Oportunidades dormidas.
  - Valor detenido.
  - Sin próxima actividad.
  - Cobertura de seguimiento.
  - Salud comercial.
- Se agregó una sección de configuración de seguimiento por tenant.
- Se mantuvo un solo Dashboard general y se llevó el detalle analítico al hub CRM → Informes.

## 2026-09-05 — Correcciones del embudo

### Completado

- Se corrigió el filtrado por etapas cerradas ganadas y cerradas perdidas.
- Se evitó enviar códigos de etapa como UUID hacia Supabase.
- Se corrigió la consulta para mostrar todas las oportunidades ganadas del tenant, no solamente una oportunidad.
- Se corrigió el filtro de periodo para generar correctamente los filtros PostgREST `and(...)`.
- Se agregaron filtros de periodo preconfigurados y periodo manual.
- Se conservaron los filtros por tenant y se validó el funcionamiento con datos reales.

## 2026-09-05 — Fundamento de recuperación y modelo de datos

### Completado

- Se agregaron a `oportunidades` los campos operativos de seguimiento:
  - `ultima_actividad_en`
  - `ultima_interaccion_contacto_en`
  - `ultimo_contacto_saliente_en`
  - `proxima_actividad_en`
  - `etapa_cambiada_en`
  - `estado_seguimiento`
  - `temperatura`
  - `estrategia_seguimiento`
  - `reactivada_en`
  - `numero_reactivaciones`
  - `ultimo_intento_reactivacion_en`
  - `intentos_reactivacion`
  - `prioridad_reactivacion`
- Se crearon las tablas base:
  - `oportunidad_eventos`
  - `pipeline_snapshots`
  - `oportunidad_seguimiento_configuracion`
  - `oportunidad_temperatura_niveles`
  - `oportunidad_temperatura_senales`
  - `oportunidad_seguimiento_estrategias`
- Se agregaron constraints e índices para tenant, seguimiento, temperatura y próxima actividad.
- Se estableció que **Dormido** no es una etapa comercial.
- Se estableció que **Perdido** no es un estado de seguimiento.
- Se estableció que **Reactivado** es un evento histórico y no un estado permanente.
- Se definieron las métricas de cobertura, valor detenido, reactivación, valor único reactivado, valor ganado por reactivación y salud comercial.

## Pendientes siguientes

- Resolver las relaciones ambiguas entre conversaciones y oportunidades mediante una regla comercial explícita.
- Revisar las oportunidades que todavía no tienen interacción atribuible.
- Persistir automáticamente los cambios de `estado_seguimiento` según la configuración del tenant.
- Generar eventos `OPORTUNIDAD_ESTANCADA`, `OPORTUNIDAD_DORMIDA` y `CAMBIO_ESTADO_SEGUIMIENTO`.
- Implementar eventos de intento y resultado de reactivación.
- Activar snapshots periódicos del pipeline.
- Completar temperatura configurable y cálculo de score por tenant.
- Construir recomendaciones explicables de estrategia con Tal-IA.
- Completar las vistas históricas de Analítica y el cálculo de cohortes.
- Agregar pruebas autenticadas de tenant y pruebas de regresión para mensajes, actividades y oportunidades.
