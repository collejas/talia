# Prospección · Plan de Inbox Reutilizando `/inbox`

Fecha: 2026-02-24
Estado: en ejecución (fase 1 y 2 completadas; fase 3 iniciada)

## Objetivo

Reutilizar la vista existente `/inbox` para operar conversaciones de prospección (especialmente WhatsApp), sin crear una bandeja paralela.

Resultado esperado:
- Filtrar conversaciones de prospección por origen/canal/lote.
- Visualizar badge de contexto comercial (prospección).
- Permitir intervención humana en el mismo hilo desde `/inbox`.

## Estado actual auditado

## Frontend `/inbox`

- Entrada: `frontend/panel/src/app/inbox/page.tsx`.
- Carga de datos: `frontend/panel/src/lib/inbox/data.ts`.
- UI principal: `frontend/panel/src/components/inbox/workspace.tsx` + `frontend/panel/src/components/inbox/split-view.tsx`.
- Filtros actuales en toolbar:
  - `Canal`, `Fecha`, `Reinicio`, búsqueda local por texto.
- Gap actual:
  - No existe filtro de `Origen` (ej. prospección).
  - No existe filtro de `batch_id`/`campana_id`.
  - El selector visual de `Estados` en toolbar no está conectado a consulta backend.

## Backend `/crm/inbox/*`

- Endpoints:
  - `GET /crm/inbox/summary`
  - `GET /crm/inbox/threads`
  - `GET /crm/inbox/messages/{conversacion_id}`
  - `POST /crm/inbox/conversations/{conversacion_id}/manual`
  - `POST /crm/inbox/conversations/{conversacion_id}/reply`
- Contrato actual de threads:
  - Solo recibe `estado`, `asignado_id`, `limit`, `offset`, `message_limit`.
- Repositorio:
  - `backend/app/repositories/crm.py` usa RPC `panel_inbox_threads`.
- Gap actual:
  - No hay filtros por metadata de prospección.

## Base de datos (backup + MCP Supabase)

- Función clave: `public.panel_inbox_threads(...)`.
- Origen de datos:
  - `conversaciones`, `contactos`, `conversaciones_insights`, `conversaciones_controles`, `mensajes`.
- Hecho importante:
  - El payload de mensajes expone `mensajes.datos` (jsonb), donde ya podemos guardar `source`, `channel`, `batch_id`, `envio_id`, etc.
- Gap actual:
  - La RPC no calcula ni expone un campo de `source`.
  - Tampoco permite filtrar por `source/batch/campana`.

## Avance completado

- [x] Estandarización inicial de metadata de prospección en mensajes WhatsApp de campañas (`source`, `channel`, `batch_id`, `envio_id`).
- [x] Extensión SQL de inbox:
  - `panel_inbox_threads(...)` ahora soporta `source/channel/batch/campana`.
  - `panel_inbox_threads_debug(...)` actualizado con la nueva firma.
  - Índices en `mensajes.datos` para `source`, `batch_id`, `campana_id`.
- [x] Backend API:
  - `GET /crm/inbox/threads` acepta `source`, `channel`, `batch_id`, `campana_id`.
  - Nuevo `GET /crm/inbox/filter-options` para catálogo de `batch` y `campaña`.
- [x] Frontend `/inbox`:
  - Filtro `Origen` (`Todos`, `Prospección`, `Operativo`).
  - Badge visual `Prospección` en lista y encabezado del hilo.
  - Selectores `Batch` y `Campaña`.
  - Filtro `Estados` conectado a filtro real de hilos.
  - Deep link por URL (`source`, `channel`, `batchId`, `campanaId`, etc.).
  - Botón `Copiar enlace` del contexto filtrado.
- [x] Backfill técnico:
  - Migración `20260224_140000_inbox_prospeccion_backfill.sql` para rellenar `mensajes.datos` históricos desde `prospeccion_contacto_envio`.
  - Aplicada vía MCP Supabase (sin filas históricas en el entorno actual de prueba).
- [x] Envío WhatsApp de prospección en frío (backend):
  - El worker de envíos usa credenciales Twilio por `organizacion_id` del envío.
  - Si una campaña incluye canal WhatsApp sin plantilla explícita, se intenta usar `whatsapp.templates.sales` del tenant.
  - Si no existe SID de plantilla, el backend rechaza con `whatsapp_template_required`.
- [x] Diagnóstico operativo WhatsApp:
  - Nuevo endpoint `GET /crm/prospeccion/whatsapp/readiness`.
  - Verifica llaves de Twilio + plantilla de tenant en runtime.
- [x] Fix de integración frontend (modal de prospectos):
  - `POST /api/prospeccion/prospectos/contactar` ahora usa proxy estándar y propaga `X-Organizacion-Id`.
  - Resuelto error `422 missing header X-Organizacion-Id` al guardar acciones.
- [x] Configuración de plantillas WhatsApp de prospección por tenant:
  - Nueva pestaña `Whats-Prosp` en `settings/tenants` y `settings/variables`.
  - Guarda múltiples SIDs en `organizaciones.config.whatsapp.templates.prospeccion`.
- [x] Consumo runtime de plantillas Whats-Prosp en modal de prospección:
  - `GET /crm/prospeccion/contacto/templates` incorpora SIDs runtime del tenant.
  - Enriquecimiento con Twilio Content API para mostrar nombre y cuerpo real de plantilla.
  - El modal muestra preview y utiliza `twilio_content_sid` al enviar.
- [x] Política de envío en frío:
  - Ajuste para evitar omisión por `whatsapp_no_permitido` cuando el envío proviene de lote de prospección en frío.
- [x] Assistant IA especializado en prospección (routing inicial):
  - `settings/variables` y `settings/tenants` permiten guardar `whatsapp.prospeccion.prompt_id` y `whatsapp.prospeccion.prompt_version` en pestaña `Whats-Prosp`.
  - Runtime WhatsApp carga `whatsapp.prospeccion.prompt_id`.
  - En mensajes entrantes WhatsApp con contexto `source=prospeccion`, el backend usa el prompt de prospección.
  - Si no hay contexto de prospección, se mantiene el assistant/prompt operativo actual.

## Propuesta técnica

## 1) Estandarizar metadata de prospección en mensajes

En mensajes salientes/entrantes vinculados a campañas, usar estas llaves en `mensajes.datos`:
- `source = "prospeccion"`
- `channel = "whatsapp" | "correo" | "llamada"`
- `batch_id`
- `envio_id`
- `campana_id` (si aplica)

Nota: parte de esto ya se está guardando en envíos WhatsApp de prospección; se debe completar consistencia en todos los caminos.

## 2) Extender RPC de inbox

Extender `panel_inbox_threads` con filtros opcionales:
- `p_source text default null`
- `p_channel text default null`
- `p_batch_id uuid default null`
- `p_campana_id uuid default null`

Y exponer columnas derivadas:
- `source` (ej. `prospeccion` cuando existan mensajes del hilo con `datos->>'source'='prospeccion'`).
- `batch_id` (último o más relevante del hilo).
- `campana_id` (último o más relevante del hilo).

## 3) Backend API `/crm/inbox/threads`

Agregar query params equivalentes y propagarlos a repositorio/RPC:
- `source`
- `channel` (separado de `estado`)
- `batch_id`
- `campana_id`

## 4) Frontend `/inbox`

Agregar en toolbar:
- Filtro `Origen` (`todos`, `prospeccion`, `operativo`).
- Mantener `Canal` actual.
- (Opcional) filtro avanzado por `batch_id`.

En lista de threads:
- Badge `Prospección` cuando `source = prospeccion`.
- Mantener badge de canal ya existente.

## 5) Deep link desde prospección

Permitir abrir `/inbox` con query params:
- `/inbox?source=prospeccion`
- `/inbox?source=prospeccion&batchId=<uuid>`

## Criterios de aceptación

1. Desde `/inbox`, al filtrar `Origen: Prospección`, solo aparecen conversaciones con metadata de prospección.
2. La intervención humana en esos hilos sigue funcionando igual (manual override + reply).
3. El filtro por `Canal: WhatsApp` combinado con `Origen: Prospección` funciona (intersección).
4. El refresh periódico no rompe el estado de filtros seleccionados.

## Riesgos y mitigación

- Riesgo: metadata incompleta en mensajes históricos.
  - Mitigación: fallback por canal + opción de backfill progresivo.
- Riesgo: degradación de performance al filtrar JSONB en alto volumen.
  - Mitigación: índices por expresión sobre `mensajes.datos->>'source'`, `batch_id`, `campana_id`.

## Pendiente

1. Validar en producción el comportamiento con alto volumen (performance y cardinalidad de filtros).
2. Mejorar etiquetas de `Batch/Campaña` con nombre comercial real en lugar de UUID corto.
3. Ejecutar pruebas E2E con plantillas WhatsApp reales de prospección y respuestas entrantes para cierre de fase 3.
4. (Opcional) validar en producción si existen filas históricas a corregir con la migración de backfill.
5. Integración de assistant IA especializado en prospección:
   - Confirmar pruebas E2E de respuestas reales usando `whatsapp.prospeccion.prompt_id`.
   - Prompt + tools de prospección (documentados en `docs/openai/talia/prospeccion`).
   - Vector store dedicado de prospección (`talia_prospeccion_vs`).
   - Ajustar métricas/observabilidad para distinguir conversaciones de prospección vs. operativo.

## Checklist de performance (operación)

- Endpoint `GET /crm/inbox/threads`:
  - Objetivo p50: < 250 ms.
  - Objetivo p95: < 700 ms.
  - Alertar si > 1200 ms de forma sostenida.
- Endpoint `GET /crm/inbox/filter-options`:
  - Objetivo p50: < 300 ms.
  - Objetivo p95: < 800 ms.
- Validaciones recomendadas:
  - Sin filtros.
  - Con `source=prospeccion`.
  - Con `source+channel`.
  - Con `source+batch_id`.
  - Con `source+campana_id`.

Nota: el backend ya registra `duration_ms` y marca warning cuando la consulta tarda 700 ms o más.
