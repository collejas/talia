# RECONFIGURACION SCORING (PLAN NUEVO DE REFACTORIZACION)

## 0. Alcance
- Este plan aplica a **todos los canales**: `webchat`, `whatsapp`, `messenger`, `instagram`, `voz` y futuros canales.
- Objetivo principal: separar claramente
  - razonamiento conversacional (asistente),
  - validacion/persistencia (backend),
  - scoring/promocion/notificacion (motor unificado).

## 1. Problema a corregir
- Logica duplicada por canal.
- Reglas de perfilamiento dispersas (preguntas, campos requeridos, excepciones).
- Diferencias entre lo que se pregunta, lo que se guarda y lo que se notifica.
- Fragilidad por lenguaje natural libre y confirmaciones de cita no respaldadas por booking real.

## 2. Principios de la nueva arquitectura
- **Un contrato unico de datos de perfilamiento** para todos los canales.
- **Backend deterministico**: valida esquema y estado, no interpreta frases libres complejas.
- **Asistente guiado por tools**: pregunta, confirma y llama funciones con payload pequeno y canonico.
- **Motor unico de scoring**: misma formula, mismas dependencias y mismas reglas por canal.
- **Notificacion unica de vendedor**: misma estructura base + variaciones por canal solo en formato.

### 2.1 Regla explicita de responsabilidad (Prompt vs Backend)
- La **logica conversacional de perfilamiento** vive en el **prompt/asistente**:
  - como formular la pregunta,
  - como repreguntar,
  - como interpretar respuesta del usuario en contexto del turno.
- El **backend no redacta preguntas** ni decide estilo de lenguaje.
- El backend solo:
  - valida contrato de datos,
  - persiste estados/campos,
  - calcula scoring,
  - controla reglas de negocio duras (agenda, etapa, notificacion).

### 2.2 Politica de aceptacion de respuestas (decision final)
- El **prompt/asistente decide** el valor que se enviara al backend para cada campo de perfilamiento.
- El backend aplica **validacion minima** y no semantica profunda de lenguaje natural.
- Validacion minima permitida en backend:
  - tipo de dato,
  - longitud maxima,
  - campos obligatorios por tool,
  - sanitizacion de seguridad.
- El backend **no debe rechazar** respuestas por “plausibilidad linguistica” (ejemplo: nombres no comunes).
- Si el valor es dudoso pero util, se guarda y se marca con estado (`answered|unknown|refused|skipped_max_retries`) segun corresponda.
- Para campos de scoring con catalogo, el asistente debe enviar valor canonico; si llega alias, backend lo normaliza antes de persistir.

## 3. Diseño objetivo (capas)
1. Capa conversacional (canal + prompt):
- El asistente formula preguntas.
- Solo una pregunta por turno para campos requeridos de agenda.
- El asistente transforma respuesta libre a valor operativo (canonico o texto util) antes del tool call.

2. Capa de funciones de captura:
- `capture_profile_field(conversacion_id, field_key, value, status, source_channel)`
- `close_lead(...)` para resumen comercial y accion siguiente.
- `schedule_demo(...)` solo confirma cuando precondiciones estan completas.

3. Capa de orquestacion backend:
- Determina campos faltantes.
- Aplica reglas condicionales (ejemplo: `contado` => no requiere `credit_preapproved`).
- Persiste avance parcial por campo.

4. Capa de scoring unificada:
- Recalculo al cambiar respuestas/eventos.
- `missing_fields`, `critical_fields`, `confidence`, `grade`, `score_total`.

5. Capa de notificacion comercial:
- Construye mensaje con:
  - resumen de oportunidad,
  - respuestas de perfilamiento,
  - score/grade/confidence,
  - datos de cita (si existe booking real).

## 4. Contrato canónico de perfilamiento
- Estados permitidos por campo:
  - `answered`
  - `unknown`
  - `refused`
  - `skipped_max_retries`
- Fuente de verdad:
  - `contactos.contacto_datos.lead_scoring`
  - `oportunidades.metadata.lead_scoring`
- Regla: cada turno actualiza **solo campos cambiados**.

## 5. Reglas de negocio unificadas
- No confirmar cita en texto sin `booking.status in (confirmed, reprogrammed)`.
- Si falta perfilamiento requerido para cita: responder `prefilter_missing`.
- Reglas condicionales de dependencia:
  - `financing_type = contado` excluye `credit_preapproved`.
- Regla de rechazo:
  - no rechazar payload por semantica de texto si cumple validacion minima de contrato.
- Notificacion a vendedor en `booking_confirmed` requiere:
  - medio de contacto valido,
  - oportunidad existente,
  - perfil minimo completo segun reglas vigentes.

## 6. Plan de implementacion por fases
### Fase 1: Normalizacion de contrato (backend)
- Consolidar helpers comunes de required/missing/dependencias.
- Eliminar divergencias `webchat` vs `whatsapp`.
- Agregar pruebas unitarias de dependencia de campos.

### Fase 2: Refactor tools por canal
- Migrar canales al mismo contrato de funciones.
- Reducir payloads largos y evitar JSON truncado.
- Reforzar reparacion/control de argumentos invalidos.

### Fase 3: Scoring y etapas
- Unificar recalculo y promocion de etapa en servicio central.
- Asegurar consistencia entre `captado` / `precalificado` / `demo`.

### Fase 4: Notificaciones
- Unificar builder de mensaje para vendedor.
- Incluir siempre bloque de perfilamiento y score.
- Registrar auditoria de envio por canal y trigger.

### Fase 5: Observabilidad y QA
- Logs estandar por evento critico (prefilter, booking, scoring, notify).
- Matriz de pruebas E2E multi-canal con casos:
  - credito,
  - contado,
  - evasivas,
  - reenganche agotado,
  - cita confirmada.

## 7. Criterios de aceptacion
- Mismas respuestas de perfilamiento producen mismo score sin importar canal.
- Cero confirmaciones de cita sin booking real.
- Notificacion de vendedor enviada con bloque completo de perfilamiento al confirmar cita.
- Sin regresiones en captura base (nombre/correo/telefono).

## 8. Orden de ejecucion sugerido
1. Backend unificado de reglas y scoring.
2. Webchat (migracion y validacion).
3. WhatsApp (migracion y validacion).
4. Canales restantes (`messenger`, `instagram`, `voz`).
5. QA transversal + rollout gradual por tenant.

## 9. Nota operativa
- Este documento es el plan vigente de implementacion.
- El documento `PLAN_SCORING_PROGRESIVO_BIENES_RAICES.md` queda como historico y no debe usarse como base de nuevos cambios.

## 10. Backend a modificar (archivos y funciones)
### 10.1 Motor central de scoring y persistencia
- `backend/app/services/storage.py`
  - `_is_financing_cash`
  - `_normalize_required_fields_for_answers`
  - `_compute_lead_scoring`
  - `_compute_lead_scoring_from_catalog`
  - `apply_lead_scoring`
  - `maybe_promote_prequalified_from_scoring`
  - `upsert_conversation_insights`
  - `maybe_auto_name_opportunity`
  - `ensure_conversation_opportunity`

Objetivo:
- Mantener un solo contrato de campos requeridos/faltantes.
- Resolver dependencias condicionales (ej. `contado`).
- Persistir scoring/insights/titulo-descripcion en un flujo deterministico.

### 10.2 Orquestacion de tools en Webchat
- `backend/app/channels/webchat/service.py`
  - `_execute_function_call`
  - `_has_prefilter_for_schedule`
  - `_extract_required_case_a_fields_from_metadata`
  - `_load_required_case_a_questions`
  - `_build_insights_from_scoring_answers`
  - `_looks_like_booking_confirmation`
  - `_guard_booking_confirmation_claim`

Objetivo:
- Unificar precondiciones de agenda con contrato central.
- Evitar confirmaciones de cita sin booking real.
- Completar insights y auto-naming cuando el flujo no pase por `close_lead`.

### 10.3 Notificaciones comerciales en Webchat
- `backend/app/channels/webchat/notifications.py`
  - `notify_sales_rep`
  - `_has_minimum_profile_for_case_a`
  - `_extract_required_case_a_fields_from_metadata`
  - `_load_required_case_a_questions`
  - `_normalize_required_fields_for_answers`
  - `_build_profile_summary_text`
  - `_build_booking_template_variables`

Objetivo:
- Usar el mismo criterio de perfil minimo que el motor de scoring.
- Incluir siempre bloque de perfilamiento + score en notificacion de cita.
- Evitar skips por validaciones base desalineadas.

### 10.4 Orquestacion y notificaciones en WhatsApp
- `backend/app/channels/whatsapp/tools.py`
  - `_has_prefilter_for_schedule`
  - `_has_minimum_profile_for_case_a`
  - `_extract_required_case_a_fields_from_metadata`
  - `_load_required_case_a_questions`
  - `_notify_sales_rep`
  - `_build_profile_summary_text`
  - `_build_booking_template_variables`

Objetivo:
- Paridad funcional con Webchat.
- Mismo contrato de required/missing y mismo payload comercial hacia vendedor.

### 10.5 Runtime de tools y resiliencia API
- `backend/app/assistants/tool_runtime.py`
  - `_create_response_with_retry`
  - `run_tool_loop`

Objetivo:
- Controlar fallas transitorias (`429/500`) sin romper flujo.
- Estandarizar salida de errores para evitar estados inconsistentes en canales.

### 10.6 Capa de configuracion/catalogo (soporte)
- `backend/app/services/tenant_runtime.py` (lectura de reglas/preguntas/pesos por tenant/canal)
- `backend/app/repositories/crm.py` (queries de preguntas/reglas/scoring_eventos/auditoria)

Objetivo:
- Garantizar que el contrato dinamico por canal se sirva de forma consistente al motor central.

## 11. Orden recomendado de cambios backend
1. `storage.py` (contrato canonico + scoring + promotion).
2. `webchat/service.py` y `whatsapp/tools.py` (orquestacion de tools).
3. `webchat/notifications.py` y `whatsapp/tools.py` (bloque comercial unificado).
4. `tool_runtime.py` (resiliencia).
5. `tenant_runtime.py` + `crm.py` (alineacion de configuracion y lecturas).

## 12. Archivos OpenAI COMEBI a actualizar
Ruta base:
- `docs/openai/demos/bienes_raices/comebi`

### 12.1 Prompts (logica conversacional)
- `docs/openai/demos/bienes_raices/comebi/Prompt/prompt_webchat_comebi.md`
- `docs/openai/demos/bienes_raices/comebi/Prompt/prompr_whatsapp_comebi.md`

Cambios requeridos:
- Definir explicitamente que el asistente:
  - hace preguntas de perfilamiento,
  - interpreta respuestas del usuario,
  - envia valores canonicos en tools.
- Reforzar regla: no confirmar cita sin `schedule_demo` exitoso.
- Reforzar regla: una pregunta de perfilamiento por turno.
- Reforzar regla: en caso de evasiva, una repregunta maxima y luego estado canonico.
- Reforzar regla de payload:
  - JSON corto,
  - sin objetos inflados,
  - solo campos cambiados en turno.

### 12.2 Definicion de funciones (contrato de tools)
- `docs/openai/demos/bienes_raices/comebi/funciones/funciones_webchat_comebi.md`
- `docs/openai/demos/bienes_raices/comebi/funciones/funciones_whatsapp_comebi.md`

Cambios requeridos:
- Homologar esquema entre canales para campos de scoring/perfilamiento.
- Alinear `close_lead` con estados permitidos:
  - `answered`, `unknown`, `refused`, `skipped_max_retries`.
- Mantener longitudes maximas para `notes`, `necesidad_proposito`, `siguiente_accion`.
- Documentar valores canonicos esperados por campo:
  - `financing_type`, `credit_preapproved`, `purchase_timeline`, `decision_authority`, `visited_properties`, etc.
- Documentar dependencias de negocio:
  - si `financing_type = contado`, no enviar/forzar `credit_preapproved`.

### 12.3 Regla de coherencia Prompt + Functions
- Ningun campo usado por prompt puede quedar fuera del schema de funciones.
- Ningun enum de funciones debe quedar fuera del prompt.
- El prompt no debe pedir al backend validacion semantica de lenguaje libre; solo envio de valor operativo.

### 12.4 Criterio de publicacion
- Cada cambio en backend de scoring/perfilamiento debe reflejarse en estos 4 archivos antes de publicar.
- Checklist minimo previo a despliegue:
  - Prompt webchat actualizado.
  - Prompt whatsapp actualizado.
  - Funciones webchat actualizadas.
  - Funciones whatsapp actualizadas.

## 13. Depuracion post-refactor (archivos a limpiar)
### 13.1 Duplicidad Webchat vs WhatsApp
- Revisar y consolidar helpers duplicados entre:
  - `backend/app/channels/webchat/service.py`
  - `backend/app/channels/webchat/notifications.py`
  - `backend/app/channels/whatsapp/tools.py`
- Objetivo:
  - mover logica comun a modulo compartido (por ejemplo `app/services/scoring_contract.py` o similar),
  - dejar en canal solo orquestacion especifica.

Helpers candidatos a consolidar/eliminar duplicados:
- `_extract_required_case_a_fields_from_metadata`
- `_load_required_case_a_questions`
- `_has_minimum_profile_for_case_a`
- `_build_profile_summary_text`
- `_build_booking_template_variables`
- normalizadores de required/missing y dependencias (`contado`).

### 13.2 Legacy de validaciones y fallback
- `backend/app/channels/webchat/service.py`
  - retirar ramas legacy de confirmacion textual cuando no haya booking.
  - retirar validaciones semanticas duras de lenguaje libre si no son contractuales.
- `backend/app/channels/whatsapp/tools.py`
  - retirar rutas legacy de validacion que contradigan contrato canonico.
- `backend/app/assistants/tool_runtime.py`
  - depurar retries/fallbacks no usados tras estandarizacion.

### 13.3 Prompt y funciones antiguas/desalineadas
- En `docs/openai/demos/bienes_raices/comebi/*`:
  - eliminar reglas repetidas o contradictorias.
  - eliminar ejemplos de payload inflado.
  - eliminar instrucciones que induzcan confirmacion de cita sin booking real.

### 13.4 Criterio para borrar codigo
- Solo eliminar cuando:
  - exista reemplazo centralizado activo,
  - haya pruebas unitarias/E2E pasando,
  - no haya referencias en `rg` dentro de backend/frontend/docs.
- Antes de borrar:
  - marcar como deprecated en 1 release corta (si aplica),
  - registrar en changelog tecnico interno.

## 14. Avance ejecutado (2026-02-20)
### 14.1 Completado
- Contrato compartido creado:
  - `backend/app/services/scoring_contract.py`
  - `normalize_required_fields_for_answers(...)`
  - `build_profile_summary_text(...)`
- Webchat migrado a contrato compartido:
  - `backend/app/channels/webchat/notifications.py`
  - `backend/app/channels/webchat/service.py`
- WhatsApp migrado a contrato compartido:
  - `backend/app/channels/whatsapp/tools.py`
- Storage alineado al contrato compartido:
  - `backend/app/services/storage.py`
- Runtime resiliente estandarizado:
  - `backend/app/assistants/tool_runtime.py`
  - clasificacion uniforme de error: `error_type`, `status_code`, `retryable`
  - retry para fallas transitorias de Responses API (incluye codigos HTTP 408/409/429/500/502/503/504)
- Builder comercial unificado (mensaje + variables template):
  - `backend/app/services/sales_notifications.py`
  - `backend/app/channels/webchat/notifications.py`
  - `backend/app/channels/whatsapp/tools.py`
  - asegura bloque consistente de perfilamiento/score en notificaciones al vendedor.
- OpenAI COMEBI alineado a contrato canonico:
  - `docs/openai/demos/bienes_raices/comebi/Prompt/prompt_webchat_comebi.md`
  - `docs/openai/demos/bienes_raices/comebi/Prompt/prompr_whatsapp_comebi.md`
  - `docs/openai/demos/bienes_raices/comebi/funciones/funciones_webchat_comebi.md`
  - `docs/openai/demos/bienes_raices/comebi/funciones/funciones_whatsapp_comebi.md`
  - incluye enums canonicos, dependencia `contado -> omitir credit_preapproved` y reglas de payload por turno.

### 14.2 Pruebas ejecutadas
- `tests/channels/test_whatsapp_tools.py`
- `tests/channels/test_webchat_service_assignment.py`
- `tests/channels/test_webchat_calendar.py`
- `tests/channels/test_whatsapp_service.py`
- `tests/services/test_storage_channels.py`
- `tests/services/test_webchat_followups.py`
- `tests/services/test_whatsapp_followups.py`
- `tests/assistants/test_tool_runtime_controls.py`

Resultado: pruebas en verde durante la fase actual y compilacion de modulos modificados sin errores.

### 14.3 Pendiente inmediato
- Unificar builder final de notificacion comercial para que el bloque de perfilamiento/score salga consistente en todos los triggers y canales.
- Ejecutar corrida E2E manual por canal (webchat/whatsapp) validando:
  - perfilamiento completo,
  - agenda real confirmada,
  - notificacion al vendedor con perfilamiento completo,
  - sin confirmacion textual de cita cuando no exista booking real.
