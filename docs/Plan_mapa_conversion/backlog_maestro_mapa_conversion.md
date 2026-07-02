# Backlog maestro · Mapa de conversion

Fecha: 2026-07-01
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
- [ ] Mantener compatibilidad temporal con los contratos que todavia leen `mensajes.datos`.
- [x] Mantener compatibilidad temporal con los contratos que todavia leen `mensajes.datos`.
- [ ] Registrar cualquier backfill necesario para no perder historia.

## 4) Epic B · Backend

### B.1 Separar metadatos de metricas

Objetivo:

- dejar de mezclar correo y WhatsApp en una sola respuesta ambigua.

Tareas:

- [ ] Refactorizar `prospeccion/metricas` para entregar bloques separados.
- [ ] Mantener bloque de correo.
- [ ] Agregar bloque de WhatsApp.
- [ ] Mantener bloque de frases WhatsApp.
- [ ] Agregar bloque de conversiones/opportunities si aplica.
- [ ] Definir nombres de response keys definitivos.
- [ ] Hacer que `prospeccion/metricas` use `campanas_whatsapp` solo para WhatsApp de prospeccion y no para chats iniciados por clientes.
- [x] Documentar que `mapa-de-conversion` no debe contar envios de campañas como conversaciones.

### B.1 Archivos objetivo

- [ ] `backend/app/api/routes/crm.py`
- [ ] `backend/app/repositories/crm.py`
- [ ] `backend/app/services/*` si se extrae logica
- [ ] `backend/tests/api/test_crm_routes.py`

### B.2 Ajustar agregacion de WhatsApp

Objetivo:

- construir metricas de WhatsApp desde sus fuentes reales.

Tareas:

- [ ] Agregar agregacion por batch.
- [ ] Agregar respuesta y oportunidad por conversacion.
- [ ] Usar `prospeccion_whatsapp_atribucion_eventos`.
- [ ] Respetar `persona_id` como llave operativa.
- [ ] Confirmar si la serie diaria sale de mensajes, batches o ambos.
- [ ] Validar con datos reales del tenant activo.

### B.3 Mantener compatibilidad

Objetivo:

- no romper lo que ya consume el panel.

Tareas:

- [ ] Conservar la forma actual del bloque de correo mientras se migra.
- [ ] Conservar `contacto_id` donde el contrato viejo lo siga requiriendo.
- [ ] No cambiar contratos de front hasta que el backend nuevo exista.
- [ ] Mantener compatibilidad en exportaciones.
- [x] Validar que `prospeccion/prospectos` sigue funcionando como vista operativa de lotes, envíos y estados por lote.

### B.4 Alinear mapa de conversion

Objetivo:

- terminar el contrato y la UI principal de `mapa-de-conversion` como objetivo central del plan.

Tareas:

- [ ] Conservar `traffic_web`.
- [ ] Conservar `conversation_channels`.
- [ ] Conservar `whatsapp_atribucion`.
- [ ] Revisar si hace falta exponer una pequeña capa de resumen adicional para campañas ejecutadas.
- [ ] Mantener filtros y cache keys estables.
- [ ] Separar trafico web, conversaciones WhatsApp de prospeccion y oportunidades en bloques distintos.
- [ ] Evitar que el mapa infiera WhatsApp desde el ledger de correo.
- [x] Confirmar que el mapa de conversion sigue siendo lectura de trafico/atribucion/conversion y no de ejecucion de campañas.
- [x] Normalizar el contrato frontend para usar `whatsapp_atribucion_total` como nombre canónico y exponer `whatsapp_atribucion.top`.
- [x] Definir el contrato final de `mapa-de-conversion v2` como entrega principal del plan.
- [x] Implementar el agregado v2 de mapa con sus bloques y exportación.
- [x] Implementar la UI final del mapa con los nuevos filtros y dimensiones.

### B.4 Archivos objetivo

- [ ] `backend/app/api/routes/crm.py`
- [ ] `backend/app/services/demografia_service.py`
- [ ] `backend/app/repositories/crm.py`
- [ ] `frontend/panel/src/lib/mapa-conversion/api.ts` solo cuando exista contrato nuevo

## 5) Epic C · Frontend

### C.1 Reordenar `prospeccion/metricas`

Objetivo:

- que el usuario vea claramente correo, WhatsApp y conversion separados.

Tareas:

- [ ] Dividir cards y tablas por bloque.
- [ ] Evitar que `campanas` signifique dos cosas distintas.
- [ ] Mostrar estados vacios y de carga por bloque.
- [ ] Ajustar copy para que correo y WhatsApp no se confundan.

Avance aplicado:

- [x] Se ajustó el bloque superior de KPIs para que los 5 indicadores queden en una sola fila en desktop.
- [x] Se restauró el gráfico global de `Resumen por canal de campañas` para incluir WhatsApp en la vista `todos`.
- [x] Se alineó el bloque global para que WhatsApp se derive de `campanas_whatsapp` cuando no exista en el ledger principal de campañas.
- [x] Se agregó el desglose de entrega WhatsApp en `Campañas WhatsApp` con entregados, leídos, fallidos y sin traza.
- [x] Se amplió el detalle/tablas y export CSV de `Campañas WhatsApp` con el mismo desglose.

### C.1 Archivos objetivo

- [ ] `frontend/panel/src/app/prospeccion/metricas/page.client.tsx`
- [ ] `frontend/panel/src/lib/prospeccion/prospectos-client.ts`
- [ ] `frontend/panel/src/components/dashboard/*` si comparte componentes

### C.2 Mantener `mapa-de-conversion`

Objetivo:

- no convertir el mapa en un dashboard de campañas.

Tareas:

- [ ] Seguir mostrando trafico web.
- [ ] Seguir mostrando conversaciones.
- [ ] Seguir mostrando atribucion WhatsApp.
- [x] Reforzar etiquetas y explicaciones de lectura.
- [ ] Mantener la semantica de `traffic_web`, `conversation_channels` y `whatsapp_atribucion`.

### C.2 Archivos objetivo

- [ ] `frontend/panel/src/app/mapa-de-conversion/page.tsx`
- [ ] `frontend/panel/src/components/mapa-conversion/acquisition-summary.tsx`
- [ ] `frontend/panel/src/components/mapa-conversion/row-detail.tsx`
- [ ] `frontend/panel/src/lib/mapa-conversion/api.ts`

### C.3 Validar exportaciones

Objetivo:

- no romper CSV/XLSX ni filtros.

Tareas:

- [ ] Revisar export de metricas.
- [ ] Revisar export del mapa.
- [ ] Asegurar consistencia con los nuevos bloques.
- [ ] Verificar que los nombres de hojas y columnas sigan siendo entendibles.

### C.3 Archivos objetivo

- [ ] `backend/app/api/routes/crm.py`
- [ ] `frontend/panel/src/lib/prospeccion/prospectos-client.ts`
- [ ] `frontend/panel/src/lib/mapa-conversion/api.ts`

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
