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
- Una repregunta maxima por campo.
- Si evade dos veces: guardar `unknown/refused` y continuar.
- No bloquear cita por datos faltantes.

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
- Al agendar cita:
  - disparar recalculo de score
  - evaluar transicion a `precalificado`.

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

## 11. Rollout y control de riesgo
### Semana 1 (piloto)
- 1 tenant, 2 canales.
- Objetivo: validar captura, score y etapa.

### Semana 2 (expansion)
- ampliar a mas tenants.
- comparar conversion vs baseline.

Umbrales de exito:
- +10% en citas efectivas o
- +10% en conversion a precalificado.

Rollback:
- feature flag para desactivar scoring avanzado
- conservar solo Fase 1 + agenda.

## 12. Implementacion tecnica pendiente
1. Migracion BD `oportunidad_scoring_eventos`.
2. Servicio backend `lead_scoring.py` (calculo y confidence).
3. Integracion en tools de ambos canales.
4. Upsert sincronizado en:
   - `contacto_datos`
   - `oportunidades.metadata`
   - `conversaciones_insights.lead_score`
5. Reglas de etapa unificadas en helper comun.
6. UI embudo con score/grade/confidence/faltantes.
