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

- `prospeccion/metricas`
- `mapa-de-conversion`
- el refactor de `persona/contacto`
- y las metricas reales de campañas WhatsApp y correo

sin romper compatibilidad ni duplicar semantica.

## 3) Epic A · Base de datos

### A.1 Separar la fuente de verdad de WhatsApp

Objetivo:

- dejar de depender de `prospeccion_contacto_envio` como unico ledger de prospeccion.

Tareas:

- [x] Definir el agregado canónico para campañas WhatsApp.
- [ ] Revisar si hace falta una vista o tabla de resumen por batch/campaña.
- [ ] Asegurar que la atribucion WhatsApp siga usando `persona_id` como llave principal.
- [ ] Conservar `contacto_id` solo como compatibilidad temporal.
- [x] Decidir si el agregado vive como tabla materializada, vista o RPC.
- [x] Registrar la decision en el changelog maestro.
- [ ] Alinear el agregado con el flujo real de prospeccion WhatsApp documentado en `informe_metricas_whatsapp_prospeccion.md`.
- [ ] Incluir el cruce por `eventos_entrega.mensaje_id = mensajes.id`.
- [ ] Atribuir plantillas desde `mensajes.datos->>'twilio_content_sid'` con fallbacks.

Decisión tomada:

- Se implementó una RPC explícita: `public.prospeccion_campana_whatsapp_metricas_rango`.
- La salida queda separada por campaña y expone mensajes, conversaciones, oportunidades y lotes.
- La fuente de verdad operacional sigue siendo `mensajes` + `prospeccion_contacto_batch` + `campanas`, no `prospeccion_contacto_envio`.
- Las respuestas entrantes se atribuyen por conversación, para no perder replies que no traen `batch_id` o `campana_id`.

### A.2 Normalizar contrato de conversion

Objetivo:

- asegurar que conversion y oportunidad no queden mezcladas con envio.

Tareas:

- [ ] Revisar relaciones entre conversaciones, oportunidades y atribucion.
- [ ] Validar campos que ya existen para trazabilidad.
- [ ] Evitar depender de JSON para campos estructurales nuevos.
- [ ] Verificar indices y llaves para joins frecuentes.
- [ ] Confirmar compatibilidad de `persona_id` en los eventos de atribucion.

### A.3 Alinear catalogos de campaña

Objetivo:

- distinguir campañas de correo, WhatsApp y conversion.

Tareas:

- [ ] Revisar catalogo `campanas`.
- [ ] Revisar lotes `prospeccion_contacto_batch`.
- [ ] Revisar eventos `prospeccion_whatsapp_atribucion_eventos`.
- [ ] Definir si hace falta un campo explicito de tipo de bloque en un agregado nuevo.
- [ ] Validar que el catalogo soporte separar correo, WhatsApp y conversion.

### A.4 Archivos objetivo

- [ ] `supabase/migrations/*` para el nuevo agregado o vista.
- [ ] `supabase/migrations/*` para indices y constraints si faltan.
- [ ] `docs/Plan_mapa_conversion/changelog_maestro_mapa_conversion.md` para registrar la decision.

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

### B.4 Alinear mapa de conversion

Objetivo:

- mantener el mapa como lectura multicanal, no como reporte de envios.

Tareas:

- [ ] Conservar `traffic_web`.
- [ ] Conservar `conversation_channels`.
- [ ] Conservar `whatsapp_atribucion`.
- [ ] Revisar si hace falta exponer una pequeña capa de resumen adicional para campañas ejecutadas.
- [ ] Mantener filtros y cache keys estables.
- [ ] Separar trafico web, conversaciones WhatsApp de prospeccion y oportunidades en bloques distintos.
- [ ] Evitar que el mapa infiera WhatsApp desde el ledger de correo.

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
- [ ] Reforzar etiquetas y explicaciones de lectura.
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

## 8) Definition of done

Se considera terminado cuando:

- el backend expone correo y WhatsApp por separado,
- el mapa sigue estable,
- las oportunidades y respuestas aparecen en sus bloques correctos,
- `persona_id` es la llave principal donde corresponde,
- y `contacto_id` queda solo como compatibilidad temporal.
