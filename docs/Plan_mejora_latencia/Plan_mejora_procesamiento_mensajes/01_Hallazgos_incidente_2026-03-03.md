# Hallazgos del incidente de rendimiento y calidad de respuesta

Fecha de análisis: 2026-03-04 (UTC)  
Ventana principal analizada: 2026-03-03 22:00:00 UTC a 2026-03-04 02:00:00 UTC

## 1) Resumen ejecutivo

La degradación percibida en la app se explica principalmente por concurrencia alta en tres frentes al mismo tiempo:

1. Envios masivos de prospección por WhatsApp.
2. Alto volumen de webhooks/eventos de estado de Twilio (`/api/whatsapp/status`).
3. Polling intenso de Inbox (`/api/crm/inbox/threads`) con consultas costosas.

No se observó una caída general del flujo del asistente OpenAI en esa ventana; sí hubo un caso puntual de respuesta degradada/incompleta en una conversación.

## 2) Evidencia de volumen (prospección)

Tabla: `public.prospeccion_contacto_envio`  
Canal: `whatsapp`  
Ventana: 2026-03-03 22:00 UTC a 2026-03-04 02:00 UTC

- Total de envíos/eventos: `462`
- Estados:
  - `fallido`: `180`
  - `error`: `50`
  - `enviado`: `62`
  - `entregado`: `53`
  - `leido`: `116`
  - `respondido`: `1`

Errores más frecuentes en `error`:

- `63049`: `119`
- `63024`: `52`
- `63032`: `9`
- `whatsapp_template_variables_incompletas`: `50`

Interpretación:

- La tasa de no éxito en prospección fue alta y generó gran volumen de callbacks/eventos.
- Parte de la carga vino de fallos de entrega y de validación de plantillas (variables faltantes).

## 3) Evidencia de carga API en simultáneo

Fuente: `logs/api.log*` (hora 23:00–00:00 UTC del 2026-03-03)

Conteo de requests por endpoint (top relevantes en esa hora):

- `/api/whatsapp/status`: `363`
- `/api/crm/inbox/messages/c169b30d-...`: `335`
- `/api/crm/inbox/threads`: `163`

Métricas de latencia (23:25–23:43 UTC):

- `/api/crm/inbox/threads`
  - promedio: `~4350.8 ms`
  - p50: `~3949.6 ms`
  - p90: `~5466.0 ms`
  - picos observados: `> 9s` y hasta `~11.4s`
- `/api/whatsapp/status`
  - promedio: `~1018.3 ms`
  - p50: `~802.5 ms`
  - p90: `~1821.8 ms`

Interpretación:

- La vista Inbox sí estaba bajo estrés real en backend (latencias de varios segundos).
- El gran volumen de status callbacks coexistió con polling fuerte de Inbox.

## 4) Evidencia de comportamiento del asistente

Mensajes entrantes WhatsApp (22:00–02:00 UTC):

- Entrantes: `31`
- Conversaciones con entrantes: `16`
- Entrantes con alguna respuesta saliente posterior: `31/31`

Latencia de respuesta del asistente (primer saliente posterior a cada entrante):

- promedio: `35.41 s`
- p50: `31.50 s`
- p90: `38.47 s`
- máximo: `173.35 s`

Calidad de respuesta (muestra en ventana):

- Mensajes salientes AI con `response_id`: `27`
- Casos cortos (`<30` caracteres): `1`
- Fallback explícito de error momentáneo: `1`

Caso puntual observado:

- Conversación `c169b30d-1bf8-4015-ab9e-ac8de17997b0` tuvo un mensaje truncado (`"Perfecto, Javier: Marat"`) y luego fallback de problema momentáneo.

## 5) Hallazgos adicionales

1. Había actividad de followups/escalaciones en paralelo:
   - Triggers salientes en ventana:
     - `whatsapp_followup`: `30`
     - `followup_escalate`: `28`
     - `null`: `29`
   - Esto suma carga de fondo, pero no fue la causa principal.

2. Se detectó un bug independiente en logs:
   - `whatsapp.ensure_opportunity_failed`
   - Error: `null value in column "canal" of relation "asignaciones_vendedores" violates not-null constraint`
   - Impacta asignación/registro de vendedor en ciertos flujos.

3. En la conversación con mayor actividad hubo intervención manual humana (`panel_manual`), por lo que parte del comportamiento observado no fue generado por el asistente automático.

## 6) Causa raíz consolidada

Causa principal: saturación por concurrencia de procesos y consultas costosas de Inbox durante una ventana de blast de prospección.

Factores contribuyentes:

- Alto volumen de envíos y callbacks de estado.
- Polling intenso de Inbox sobre endpoints pesados.
- Carga en segundo plano (followups/escalaciones).
- Errores de plantilla y entrega que incrementan ruido operativo.

No se encontró evidencia de caída sistémica de OpenAI como causa primaria del incidente en la ventana analizada.
