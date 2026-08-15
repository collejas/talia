# Backlog maestro · Mapa de conversion

Fecha original: 2026-07-01
Última actualización: 2026-08-15
Ruta: `docs/Plan_mapa_conversion/backlog_maestro_mapa_conversion.md`

## 1) Regla de uso

Este es el unico backlog operativo de la carpeta `docs/Plan_mapa_conversion`.

Todo lo demas en la carpeta es contexto, arquitectura, UX, performance o historial.

Orden de ejecucion obligatorio:

1. Base de datos
2. Backend
3. Frontend

No se debe empezar frontend antes de cerrar el contrato de datos.

## 2) Objetivo final

Dejar alineados:

- `mapa-de-conversion`
- el refactor de `persona/contacto`
- `prospeccion/metricas` como vista de soporte de campañas
- y las metricas reales de campañas WhatsApp y correo

sin romper compatibilidad ni duplicar semantica.

## 2.1 Regla de semantica

Antes de tocar datos o frontend, la carpeta debe respetar esta frontera:

- `prospeccion/metricas` mide ejecucion de campañas.
- `mapa-de-conversion` mide adquisicion, atribucion y conversion.
- `prospeccion/campanas` define plantillas y reglas.
- `prospeccion/prospectos` ejecuta envios y seguimiento operativo.

No se debe usar una vista para sustituir la semantica de la otra.

## 2.2 Integración con tracking web por tenant · 2026-08-15

Documentos relacionados:

- `docs/Crear_webchat_tenants/plan_tracking_web_tenants.md`
- `docs/Plan_mapa_conversion/alineacion_tracking_web_tenants_20260815.md`

Reglas:

- `web_sessions` es la fuente canónica de sesiones web, UTM y referrers.
- El alias de Webchat no es la identidad del tracking externo.
- Las instalaciones nuevas usarán `public_site_id` y dominios verificados.
- Ninguna tabla nueva de esta integración podrá usar `metadata`, `json`, `jsonb`, `payload`, `config` o equivalentes.
- No se creará otra tabla de sesiones ni otro agregado paralelo de UTM.

Tareas:

- [x] Documentar las diez correcciones de alineación.
- [x] Relacionar el mapa con el plan de tracking de `Crear_webchat_tenants`.
- [x] Diseñar la migración de instalaciones y dominios.
- [ ] Aplicar y validar la migración de instalaciones y dominios en Supabase.
- [ ] Cerrar contrato explícito del endpoint de eventos.
- [ ] Implementar el snippet universal y validar tres tenants.

## 3) Epic A · Base de datos

### A.1 Separar la fuente de verdad de WhatsApp

Objetivo:

- dejar de depender de una sola tabla para reconstruir el envio historico de WhatsApp.

Tareas:

- [x] Definir el agregado canónico para campañas WhatsApp.
- [ ] Revisar si hace falta una vista o tabla de resumen por batch/campaña.
- [ ] Asegurar que la atribucion WhatsApp siga usando `persona_id` como llave principal.
- [ ] Conservar `contacto_id` solo como compatibilidad temporal.
- [x] Decidir si el agregado vive como tabla materializada, vista o RPC.
- [x] Registrar la decision en el changelog maestro.
- [x] Definir que `prospectos_total` no es lo mismo que `mensajes_salientes`.
- [x] Definir que `batches_total` no es lo mismo que `envios_totales`.
- [x] Alinear el agregado con el flujo real de prospeccion WhatsApp documentado en `informe_metricas_whatsapp_prospeccion.md`.
- [x] Incluir el cruce por `eventos_entrega.mensaje_id = mensajes.id`.
- [x] Atribuir plantillas desde `mensajes.datos->>'twilio_content_sid'` con fallbacks.
- [x] Restaurar el delta operativo de WhatsApp para no perder el envío nuevo todavía no reflejado en `mensajes`.

Decisión tomada:

- Se implementó una RPC explícita: `public.prospeccion_campana_whatsapp_metricas_rango`.
- La salida queda separada por campaña y expone mensajes, conversaciones, oportunidades y lotes.
- La fuente de verdad operacional para salientes quedó como modelo híbrido: `mensajes` + delta persistido en `prospeccion_contacto_envio`, con `prospeccion_contacto_batch` y `campanas` como anclas de campaña.
- Las respuestas entrantes se atribuyen por conversación, para no perder replies que no traen `batch_id` o `campana_id`.
- La documentación se alineó para que `mensajes_salientes` en WhatsApp no signifique únicamente el ledger histórico cerrado, sino el histórico más el delta operativo pendiente de reflejo.
- El backfill de snapshots de plantilla ya existe en `prospeccion_contacto_envio.payload.metadata`, pero el contrato final todavía debe decidir si ese fallback se expone en el agregado de WhatsApp o solo se conserva para compatibilidad.
- La compatibilidad temporal con contratos que todavía leen `mensajes.datos` se conserva en la capa de lectura, usando `template_id`, `template_slug`, `template_nombre` y `twilio_content_sid` como fallbacks operativos.

### A.2 Normalizar contrato de conversion

Objetivo:

- asegurar que conversion y oportunidad no queden mezcladas con envio.

Tareas:

- [x] Revisar relaciones entre conversaciones, oportunidades y atribucion.
- [x] Validar campos que ya existen para trazabilidad.
- [ ] Evitar depender de JSON para campos estructurales nuevos.
- [x] Verificar indices y llaves para joins frecuentes.
- [x] Confirmar compatibilidad de `persona_id` en los eventos de atribucion.
- [x] Validar si los deltas de `prospeccion_contacto_envio` deben materializarse en una vista resumen para futuros reportes.

Hallazgo:

- `conversaciones` ya resuelve su relación operativa con `personas` por `persona_id` y conserva `contacto_id` para compatibilidad.
- `oportunidades` ya resuelve la relación principal por `persona_id`, con `contacto_principal_id` y `metadata` solo como soporte de compatibilidad donde todavía existe historial.
- `prospeccion_whatsapp_atribucion_eventos` ya tiene `persona_id`, `conversacion_id` y `contacto_id`, y cuenta con índices útiles para lectura por organización, conversación y persona.
- El delta operativo de `prospeccion_contacto_envio` no necesita una vista materializada adicional por ahora; el agregado canónico ya lo integra en la RPC y en las exportaciones para no duplicar la verdad.

### A.3 Alinear catalogos de campaña

Objetivo:

- distinguir campañas de correo, WhatsApp y conversion.

Tareas:

- [x] Revisar catalogo `campanas`.
- [x] Revisar lotes `prospeccion_contacto_batch`.
- [x] Revisar eventos `prospeccion_whatsapp_atribucion_eventos`.
- [x] Definir si hace falta un campo explicito de tipo de bloque en un agregado nuevo.
- [x] Validar que el catalogo soporte separar correo, WhatsApp y conversion.

Hallazgo:

- `campanas` ya separa por `canal` y `tipo`; en el tenant validado existen campañas `correo/prospeccion` y `whatsapp/prospeccion`.
- `prospeccion_contacto_batch` no necesita un campo nuevo de canal por lote para este plan; el detalle multicanal vive en `canales` como arreglo y el resumen operativo ya se resuelve desde la RPC.
- `prospeccion_contacto_templates` conserva `twilio_content_sid` como ancla principal de compatibilidad; no expone hoy `template_id`/`template_slug` como columnas explícitas.

### A.4 Archivos objetivo

- [x] `supabase/migrations/20260702_090000_prospeccion_campana_whatsapp_metricas_rango_inbox_context_v2.sql` como base vigente del agregado v2.
- [x] `supabase/migrations/20260702_120000_prospeccion_campana_whatsapp_metricas_rango_delivery_breakdown.sql` como ajuste vigente de desglose de entrega.
- [x] `backend/app/api/routes/crm.py` como capa que expone el agregado y exportaciones alineadas.
- [x] `frontend/panel/src/app/prospeccion/metricas/page.client.tsx` y `frontend/panel/src/lib/prospeccion/prospectos-client.ts` como consumidores del contrato.
- [x] `docs/Plan_mapa_conversion/changelog_maestro_mapa_conversion.md` para registrar la decision.

Conclusión:

- No se requiere crear una migracion nueva para esta subfase.
- Los archivos objetivo ya existen y quedaron alineados con el contrato operativo y documental del plan.

### A.5 Decision sobre migraciones anteriores

Objetivo:

- evitar rollback innecesario del refactor de personas/contactos,
- y sustituir solo la capa de metricas WhatsApp que quedo desalineada.

Tareas:

- [x] Confirmar que las migraciones de personas/contactos se conservan.
- [x] Confirmar que las migraciones de metricas WhatsApp de julio 2026 se reemplazan por una v2.
- [x] Crear la nueva migracion o RPC v2 con seed en `conversaciones.inbox_context`.
- [x] Mantener compatibilidad temporal con los contratos que todavia leen `mensajes.datos`.
- [x] Registrar cualquier backfill necesario para no perder historia.

Decision:

- No se hace rollback del refactor de personas/contactos.
- La capa de metricas WhatsApp se sustituye por la v2 y sus ajustes posteriores.
- No hace falta un backfill nuevo para esta fase; la historia queda cubierta por la compatibilidad temporal, el snapshot ya existente y la lectura actual de la RPC.

## 4) Epic B · Backend

### B.1 Separar metadatos de metricas

Objetivo:

- dejar de mezclar correo y WhatsApp en una sola respuesta ambigua.

Tareas:

- [x] Refactorizar `prospeccion/metricas` para entregar bloques separados.
- [x] Mantener bloque de correo.
- [x] Agregar bloque de WhatsApp.
- [x] Mantener bloque de frases WhatsApp.
- [x] Agregar bloque de conversiones/opportunities si aplica.
- [x] Definir nombres de response keys definitivos.
- [x] Hacer que `prospeccion/metricas` use `campanas_whatsapp` solo para WhatsApp de prospeccion y no para chats iniciados por clientes.
- [x] Documentar que `mapa-de-conversion` no debe contar envios de campañas como conversaciones.

Hallazgo:

- La respuesta ya quedó separada en `campanas`, `campanas_whatsapp` y `frases_whatsapp`.
- Las oportunidades no necesitan un bloque independiente en esta fase porque son la parte final del agregado de frases/atribucion, no otro ledger de ejecucion.
- Los nombres canónicos del contrato ya están consumidos por el panel y por la exportación.

### B.1 Archivos objetivo

- [x] `backend/app/api/routes/crm.py`
- [ ] `backend/app/repositories/crm.py`
- [ ] `backend/app/services/*` si se extrae logica
- [ ] `backend/tests/api/test_crm_routes.py`

Nota:

- No se necesitó cambiar `backend/app/repositories/crm.py` en esta subfase porque el repositorio ya exponía las lecturas requeridas para el agregado.
- Si más adelante se extrae lógica repetida, el siguiente lugar natural será `backend/app/services/*`.

### B.2 Ajustar agregacion de WhatsApp

Objetivo:

- construir metricas de WhatsApp desde sus fuentes reales.

Tareas:

- [x] Agregar agregacion por batch.
- [x] Agregar respuesta y oportunidad por conversacion.
- [x] Usar `prospeccion_whatsapp_atribucion_eventos`.
- [x] Respetar `persona_id` como llave operativa.
- [x] Confirmar si la serie diaria sale de mensajes, batches o ambos.
- [x] Validar con datos reales del tenant activo.

Hallazgo:

- `campanas_whatsapp` ya sale de la RPC operativa por campaña con `batches_total`, `prospectos_total`, `mensajes_salientes`, respuestas, oportunidades y desglose de entrega.
- La parte de atribución y frases sigue separada y sí usa `prospeccion_whatsapp_atribucion_eventos`, con `persona_id` como llave principal y `contacto_id` como compatibilidad temporal.
- La serie diaria no sale de una sola fuente:
  - campañas usa envíos por lote/logs para la serie de ejecución;
  - frases WhatsApp usa eventos de atribución para la serie de conversaciones y oportunidades.
- Validación real del tenant `00000000-0000-0000-0000-000000000001`:
  - existen `2` campañas `whatsapp/prospeccion`;
  - existen `227` lotes con canal WhatsApp;
  - el cruce operativo por conversaciones devuelve `62` conversaciones, `205` mensajes salientes históricos, `20` entrantes y `61` oportunidades para la campaña principal.

### B.3 Mantener compatibilidad

Objetivo:

- no romper lo que ya consume el panel.

Tareas:

- [x] Conservar la forma actual del bloque de correo mientras se migra.
- [x] Conservar `contacto_id` donde el contrato viejo lo siga requiriendo.
- [x] No cambiar contratos de front hasta que el backend nuevo exista.
- [x] Mantener compatibilidad en exportaciones.
- [x] Validar que `prospeccion/prospectos` sigue funcionando como vista operativa de lotes, envíos y estados por lote.

Hallazgo:

- El bloque `campanas` de correo se conserva sin mezclar la semántica de WhatsApp.
- La compatibilidad temporal con contratos viejos se mantiene en backend y frontend usando fallbacks de `contacto_id`, `template_id`, `template_slug`, `template_nombre` y `twilio_content_sid`.
- La exportación XLSX de `prospeccion/metricas` ya incluye los bloques separados y el detalle ampliado de `CampanasWhatsApp`.

### B.4 Alinear mapa de conversion

Objetivo:

- terminar el contrato y la UI principal de `mapa-de-conversion` como objetivo central del plan.

Tareas:

- [x] Conservar `traffic_web`.
- [x] Conservar `conversation_channels`.
- [x] Conservar `whatsapp_atribucion`.
- [x] Revisar si hace falta exponer una pequeña capa de resumen adicional para campañas ejecutadas.
- [x] Mantener filtros y cache keys estables.
- [x] Separar trafico web, conversaciones WhatsApp de prospeccion y oportunidades en bloques distintos.
- [x] Evitar que el mapa infiera WhatsApp desde el ledger de correo.
- [x] Confirmar que el mapa de conversion sigue siendo lectura de trafico/atribucion/conversion y no de ejecucion de campañas.
- [x] Normalizar el contrato frontend para usar `whatsapp_atribucion_total` como nombre canónico y exponer `whatsapp_atribucion.top`.
- [x] Definir el contrato final de `mapa-de-conversion v2` como entrega principal del plan.
- [x] Implementar el agregado v2 de mapa con sus bloques y exportación.
- [x] Implementar la UI final del mapa con los nuevos filtros y dimensiones.

Hallazgo:

- `build_map_v2_dataset` ya anexa explícitamente `traffic_web`, `conversation_channels`, `whatsapp_atribucion` y `whatsapp_atribucion_top`.
- `demografia/mapa-v2` mantiene cache key estable por filtros y reutiliza el mismo agregado para respuesta y exportaciones.
- No fue necesario agregar un bloque extra de campañas ejecutadas dentro del mapa; la separación se mantiene entre ejecución (`prospeccion/metricas`) y atribución/conversión (`mapa-de-conversion`).

### B.4 Archivos objetivo

- [x] `backend/app/api/routes/crm.py`
- [x] `backend/app/services/demografia_service.py`
- [ ] `backend/app/repositories/crm.py`
- [x] `frontend/panel/src/lib/mapa-conversion/api.ts` solo cuando exista contrato nuevo

## 5) Epic C · Frontend

### C.1 Reordenar `prospeccion/metricas`

Objetivo:

- que el usuario vea claramente correo, WhatsApp y conversion separados.

Tareas:

- [x] Dividir cards y tablas por bloque.
- [x] Evitar que `campanas` signifique dos cosas distintas.
- [x] Mostrar estados vacios y de carga por bloque.
- [x] Ajustar copy para que correo y WhatsApp no se confundan.

Avance aplicado:

- [x] Se ajustó el bloque superior de KPIs para que los 5 indicadores queden en una sola fila en desktop.
- [x] Se restauró el gráfico global de `Resumen por canal de campañas` para incluir WhatsApp en la vista `todos`.
- [x] Se alineó el bloque global para que WhatsApp se derive de `campanas_whatsapp` cuando no exista en el ledger principal de campañas.
- [x] Se agregó el desglose de entrega WhatsApp en `Campañas WhatsApp` con entregados, leídos, fallidos y sin traza.
- [x] Se amplió el detalle/tablas y export CSV de `Campañas WhatsApp` con el mismo desglose.
- [x] Se corrigió el bloque lazy de marketing del dashboard para volver a pedir resumen WhatsApp y series reales en lugar de un payload `lite` sin esos datos.

### C.1 Archivos objetivo

- [x] `frontend/panel/src/app/prospeccion/metricas/page.client.tsx`
- [x] `frontend/panel/src/lib/prospeccion/prospectos-client.ts`
- [x] `frontend/panel/src/components/dashboard/*` si comparte componentes

### C.2 Mantener `mapa-de-conversion`

Objetivo:

- no convertir el mapa en un dashboard de campañas.

Tareas:

- [x] Seguir mostrando trafico web.
- [x] Seguir mostrando conversaciones.
- [x] Seguir mostrando atribucion WhatsApp.
- [x] Reforzar etiquetas y explicaciones de lectura.
- [x] Mantener la semantica de `traffic_web`, `conversation_channels` y `whatsapp_atribucion`.

### C.2 Archivos objetivo

- [x] `frontend/panel/src/app/mapa-de-conversion/page.tsx`
- [x] `frontend/panel/src/components/mapa-conversion/acquisition-summary.tsx`
- [x] `frontend/panel/src/components/mapa-conversion/row-detail.tsx`
- [x] `frontend/panel/src/lib/mapa-conversion/api.ts`

### C.3 Validar exportaciones

Objetivo:

- no romper CSV/XLSX ni filtros.

Tareas:

- [x] Revisar export de metricas.
- [x] Revisar export del mapa.
- [x] Asegurar consistencia con los nuevos bloques.
- [x] Verificar que los nombres de hojas y columnas sigan siendo entendibles.

### C.3 Archivos objetivo

- [x] `backend/app/api/routes/crm.py`
- [x] `frontend/panel/src/lib/prospeccion/prospectos-client.ts`
- [x] `frontend/panel/src/lib/mapa-conversion/api.ts`

## 6) Prioridad de entrega

Orden de trabajo sugerido:

1. BD
2. Backend
3. Frontend
4. Validacion

## 7) Checklist maestro de ejecucion

- [ ] Cerrado el contrato de BD.
- [ ] Cerrado el agregado WhatsApp.
- [ ] Cerrado el contrato backend.
- [ ] Verificados datos reales de campañas WhatsApp.
- [ ] Ajustada la vista de `prospeccion/metricas`.
- [ ] Ajustada la vista de `mapa-de-conversion`.
- [ ] Ejecutada validacion final de compatibilidad.

Avance de frontend aplicado:

- [x] KPIs superiores en una sola fila.
- [x] Gráfico global de campañas con WhatsApp visible.

## 8) Definition of done

Se considera terminado cuando:

- el backend expone correo y WhatsApp por separado,
- el mapa sigue estable,
- las oportunidades y respuestas aparecen en sus bloques correctos,
- `persona_id` es la llave principal donde corresponde,
- y `contacto_id` queda solo como compatibilidad temporal.
