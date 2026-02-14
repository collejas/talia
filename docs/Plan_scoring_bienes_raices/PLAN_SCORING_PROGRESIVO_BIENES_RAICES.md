# Plan Scoring Progresivo para Bienes Raices

## 1. Objetivo
- Implementar calificacion de prospectos con IA sin friccion inicial.
- Mejorar priorizacion comercial y conversion a cierre.
- Unificar criterio de etapa y scoring entre `webchat` y `whatsapp`.

## 2. Estrategia general
- Modelo hibrido:
  - Estado actual de scoring en `oportunidades.metadata.lead_scoring` (lectura rapida en embudo).
  - Historial auditable en tabla dedicada `oportunidad_scoring_eventos`.

## 3. Flujo conversacional
### Fase 1: Captura minima (obligatoria)
- Nombre
- Correo
- Telefono
- Empresa / perfil de compra (`particular` o `empresa`)
- Necesidad / proposito de compra (`necesidad_proposito`)

Resultado:
- Crear/actualizar contacto.
- Crear oportunidad.
- Promover a `captado` cuando exista telefono o correo.
- Cerrar captura base cuando esten registrados `nombre`, `correo`, `telefono`, `empresa` y `necesidad_proposito`.

### Fase 2: Intencion de cita
Mensajes recomendados:
- "Perfecto, te ayudo a agendar. Para atenderte mejor te hare 3 preguntas rapidas."
- "Para tener lista la mejor opcion para ti cuando vengas, solo necesito X datos rapidos."

Regla:
- Antes de Fase 3, anticipar preguntas breves y explicar beneficio.

### Fase 3: Calificacion avanzada (solo si acepta cita)
- Una pregunta por turno.
- Una repregunta maxima por campo (configurable por canal).
- Si evade dos veces: guardar `unknown/refused` y continuar.
- No bloquear cita por datos faltantes.
- Registrar por pregunta:
  - `repregunta_count`
  - `estado_respuesta` (`answered|unknown|refused|skipped_max_retries`)

Factores:
- Capacidad financiera (`30%`)
- Urgencia (`20%`)
- Nivel de decision (`20%`)
- Autoridad (`15%`)
- Interaccion/compromiso (`15%`)

## 4. Fase 3 operativa
### 4.1 Capacidad financiera (30%)
Preguntas:
- ¿Contado o credito?
- ¿Preaprobacion?
- ¿Rango de presupuesto?
- ¿Enganche disponible?

Campos:
- `financing_type`, `credit_preapproved`, `budget_range`, `down_payment_ready`

### 4.2 Urgencia (20%)
Preguntas:
- ¿En que plazo quiere comprar?
- ¿Menos de 3 meses?
- ¿Fecha clave de cierre/mudanza?

Campos:
- `purchase_timeline`, `hard_deadline`, `deadline_reason`

### 4.3 Nivel de decision (20%)
Preguntas:
- ¿Tipo y zona definidos?
- ¿Comparando o shortlist?
- ¿Ya visito propiedades?

Campos:
- `requirements_defined`, `comparison_mode`, `visited_properties`

### 4.4 Autoridad (15%)
Preguntas:
- ¿Quien toma decision final?
- ¿Decision compartida?
- ¿Compra personal o empresa?

Campos:
- `decision_authority`, `buyer_type`, `additional_decision_makers`

### 4.5 Interaccion / compromiso (15%)
Pregunta minima:
- ¿Apartamos fecha y hora hoy?

Eventos:
- `accepted_answering_questions`
- `answered_fields_ratio`
- `evasive_answers_count`
- `appointment_requested`
- `appointment_scheduled`
- `appointment_confirmed`
- `appointment_attended`
- `response_time_bucket` (`fast|medium|slow`)

## 5. Clasificacion
- `0-50`: explorando
- `51-75`: interesado
- `76-100`: listo

Confidence por completitud:
- `high`: >= 80% campos criticos respondidos
- `medium`: 50%-79%
- `low`: < 50%

## 6. Regla unificada de etapa (webchat + whatsapp)
### Pasa a `captado`
- Cuando existe telefono o correo valido.

### Pasa a `precalificado`
- `appointment_scheduled = true`
- y al menos:
  - `financing_type` o `budget_range`
  - `purchase_timeline`
  - `decision_authority`

Si no cumple:
- Mantener en `captado`
- Marcar `precalificacion_incompleta`.

## 7. Diccionario de datos final
### `contactos.contacto_datos.lead_scoring`
- Respuestas crudas y normalizadas por campo.
- `missing_fields`, `refused_fields`.

### `oportunidades.metadata.lead_scoring`
- Snapshot operativo:
  - `score_total`, `grade`, `confidence`
  - `factors`
  - `missing_fields`, `refused_fields`
  - `events`
  - `version`, `last_scored_at`

### `conversaciones_insights`
- `resumen`, `intencion`, `siguiente_accion`
- `lead_score` (espejo numerico para consultas ligeras)

### `oportunidad_scoring_eventos` (tabla dedicada)
- Historial de cada calculo/cambio de score.

## 8. Formula detallada de score
- Cada factor retorna `0..100`.
- Score total:
  - `score_total = finanzas*0.30 + urgencia*0.20 + decision*0.20 + autoridad*0.15 + interaccion*0.15`
- Si un factor esta incompleto:
  - calcular con respuestas disponibles
  - penalizar suavemente y bajar `confidence`.

## 9. Contrato tools/prompts
- Cada pregunta debe mapear a un campo tecnico.
- Si respuesta evasiva:
  - 1 repregunta breve
  - luego `unknown` o `refused`.
- Respetar `repregunta_max_por_pregunta` y no forzar despues del maximo.
- Al agendar cita:
  - disparar recalculo de score
  - evaluar transicion a `precalificado`.
- No confirmar cita en texto si `schedule_demo` no creo booking real.

## 10. Telemetria y KPIs
KPIs minimos:
- `% acepta responder preguntas`
- `% agenda cita`
- `% confirma cita`
- `% asiste cita`
- `% precalificado`
- `tiempo promedio de respuesta`
- `tasa de evasivas`
- `tiempo de captado a precalificado`
- `% notificados por cita confirmada`
- `% notificados por reenganche agotado`
- `promedio de repreguntas por campo`

## 11. Rollout y control de riesgo
### Semana 1 (piloto)
- 1 tenant, 2 canales.
- Objetivo: validar captura, score y etapa.
- Validar politica de notificacion separada por canal (`whatsapp` y `webchat`).

### Semana 2 (expansion)
- ampliar a mas tenants.
- comparar conversion vs baseline.

Umbrales de exito:
- +10% en citas efectivas o
- +10% en conversion a precalificado.

Rollback:
- feature flag para desactivar scoring avanzado
- conservar solo Fase 1 + agenda.

## 12. Estado de implementacion
Completado:
1. [Check] Migracion BD `oportunidad_scoring_eventos` creada y aplicada.
2. [Check] Calculo de score + `grade` + `confidence` implementado en backend.
3. [Check] Integracion en `whatsapp` y `webchat` para guardar score al cierre/agenda.
4. [Check] Upsert sincronizado en:
   - `contactos.contacto_datos.lead_scoring`
   - `oportunidades.metadata.lead_scoring`
   - `conversaciones_insights.lead_score`
5. [Check] Regla unificada para promover a `precalificado` con validacion minima.
6. [Check] Embudo UI: tarjeta muestra `Score`, `Grade`, `Confidence` y `Faltan`.
7. [Check] Telemetria base: endpoint `/crm/pipeline/scoring/kpis` + bloque KPI en vista de embudo.
8. [Check] Correccion de permisos para lectura de `oportunidad_scoring_eventos` en embudo.

Pendiente (siguiente fase):
1. [Check] Ajuste fino de pesos/umbrales por tenant (feature flag) implementado en backend.
2. [Check] Cobertura multi-canal en backend con casos evasivos (`unknown/refused`) implementada.
3. [Check] KPI adicional por oportunidad unica (ultimo evento), en paralelo al KPI por eventos.
4. Politica comercial A/B de notificacion a vendedor separada por canal.
5. Contador de repreguntas y estado por pregunta persistido en scoring.
6. Configuracion de preguntas/pesos desde BD administrable en frontend.

## 13. Ejecucion inmediata (Sprint siguiente)
### 13.1 Ajuste por tenant (feature flag)
Objetivo:
- Permitir pesos y umbrales por organizacion sin romper defaults globales.

Entregables:
- `organizaciones.config.scoring_bienes_raices`:
  - `enabled`
  - `weights` (`capacidad_financiera`, `urgencia`, `nivel_decision`, `autoridad`, `interaccion_compromiso`)
  - `thresholds` (`explorando_max`, `interesado_max`, `listo_min`)
  - `confidence_thresholds` (`high_min`, `medium_min`)
- Fallback seguro a valores por defecto si faltan claves.
- Validacion backend: suma de pesos = 100.

Criterio de aceptacion:
- Mismo prospecto con configuracion distinta por tenant produce score/grade distinto de forma consistente.

### 13.2 Tests E2E multi-canal (whatsapp + webchat)
Objetivo:
- Blindar comportamiento en casos reales y evasivos.

Casos minimos:
- Flujo completo con respuestas completas.
- Flujo con evasivas (`no se`, `prefiero no decir`) y repregunta unica.
- Flujo con datos faltantes pero cita agendada.
- Confirmar que no se bloquea la cita por campos faltantes.
- Confirmar transicion correcta a `captado`/`precalificado`.

Criterio de aceptacion:
- Suite E2E verde y estable en CI.

### 13.3 KPI por oportunidad unica (ultimo evento)
Objetivo:
- Complementar metricas por eventos con una vista operacional por oportunidad.

Definicion:
- Para cada `oportunidad_id`, tomar el evento mas reciente de `oportunidad_scoring_eventos`.
- Calcular:
  - distribucion de `grade`
  - promedio de `score_total`
  - distribucion de `confidence`
  - promedio de `missing_fields` por oportunidad

Criterio de aceptacion:
- Endpoint KPI expone ambas vistas:
  - `event_based`
  - `opportunity_latest_based`

## 14. Orden de implementacion recomendado
1. Politica de notificacion A/B separada por canal (seccion 16).
2. Contador de repreguntas por pregunta/canal (seccion 16).
3. Configuracion de banco de preguntas y reglas en BD (seccion 17).
4. Tests E2E (13.2) sobre comportamiento final.

## 15. Checklist de cierre de fase
- [Check] Config por tenant disponible y validada en backend.
- [Check] KPI dual (eventos vs oportunidad unica) visible en embudo.
- [Check] E2E multi-canal en CI (workflow GitHub Actions `backend_scoring_ci.yml`).
- [Check] Documentacion de pesos/umbrales por tenant para operacion.

## 16. Nueva politica comercial de notificacion (whatsapp y webchat)
Objetivo:
- Evitar bombardeo a vendedor y mantener calidad de leads asignados.

Regla por canal (separada):
- Caso A: enviar a vendedor cuando exista:
  - datos base completos (`nombre`, `correo`, `telefono`, `empresa`, `necesidad_proposito`)
  - perfilamiento minimo completo
  - cita confirmada (`booking_confirmed`)
- Caso B: enviar a vendedor cuando:
  - se agotaron reenganches configurados
  - datos base completos
  - aunque no exista cita

Regla anti-duplicados:
- maximo 1 notificacion primaria por conversacion (`information_email` o `close_lead`).
- mantener notificacion de `booking_confirmed` como evento final de cita.
- persistir `ventas_notificado_en` y `ventas_notificacion_motivo` en metadata por canal.

## 17. Preguntas y scoring configurables desde BD (frontend-admin)
Objetivo:
- sacar reglas de perfilamiento/puntaje del codigo backend para operar sin deploy.

Alcance:
- tablas configurables por tenant y canal:
  - `scoring_questions` (texto, campo, tipo, orden, activa, repregunta_max)
  - `scoring_question_reprompts` (variantes por intento)
  - `scoring_rules` (respuesta/rango -> puntos)
  - `scoring_profiles` (pesos y umbrales por tenant/canal)
- backend ejecuta motor generico con esa configuracion.
- frontend administra catalogo de preguntas, pesos y umbrales.

Compatibilidad OpenAI:
- actualizar prompt, funciones y tools para usar el mismo contrato dinamico.
- mantener guardas de backend para no confirmar cita sin booking real.
