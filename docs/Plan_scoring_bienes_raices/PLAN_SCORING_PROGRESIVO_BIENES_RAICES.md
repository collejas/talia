# Plan Scoring Progresivo para Bienes Raices

## 1. Objetivo
- Implementar calificacion de prospectos con IA sin friccion inicial.
- Mantener alta conversion en primer contacto y mejorar priorizacion comercial.
- Estandarizar reglas entre canales (`webchat`, `whatsapp`) para mover etapas en embudo.

## 2. Principio de diseno
- No aplicar cuestionario largo al inicio.
- Usar `calificacion progresiva`:
  - Fase 1: datos minimos + necesidad.
  - Fase 2: confirmar interes en cita.
  - Fase 3: preguntas de calificacion avanzada solo si acepta cita.

## 3. Flujo conversacional
### Fase 1: Captura minima (obligatoria)
- Nombre
- Correo
- Telefono
- Empresa (puede ser particualr o empresa)
- Que busca (tipo de propiedad / zona / objetivo)

Resultado:
- Crear/actualizar contacto.
- Crear oportunidad.
- Promover a `captado` cuando haya telefono o correo.

### Fase 2: Intencion de cita (filtro fuerte)
Mensajes recomendados:
- "Perfecto, te ayudo a agendar. Para atenderte mejor te hare (cantidad de preguntas implementadas) preguntas rapidas (menos de 1 minuto)."
- "Para tener lista la mejor opcion para ti cuando vengas, solo necesito X datos rapidos."

Resultado:
- Si acepta cita: activar Fase 3.
- Si no acepta: mantener seguimiento ligero (nurturing), sin forzar preguntas.

Regla de uso:
- Antes de iniciar Fase 3, siempre anticipar de forma amable que se haran preguntas breves y explicar el beneficio (preparar mejores opciones para la visita).

### Fase 3: Calificacion avanzada (solo con intencion de cita)
Preguntar en bloques cortos (1 pregunta por turno):
- Capacidad financiera
- Urgencia
- Autoridad de decision
- Nivel de decision/definicion
- Interaccion / compromiso

Resultado:
- Calcular score parcial o completo.
- Si cumple criterios minimos: mover a `precalificado`.

### Fase 3 Operativa (detalle implementable)
#### 3.1 Capacidad financiera (`30%`)
Preguntas base:
- "¿La compra seria de contado o con credito?"
- "¿Ya tienes preaprobacion de credito?"
- "¿Con que rango de presupuesto te sientes comodo?"
- "¿Cuentas con enganche disponible?"

Repregunta:
- "¿Me compartes al menos un rango aproximado?"

Campos sugeridos:
- `financing_type` (`contado|credito|mixto|unknown|refused`)
- `credit_preapproved` (`yes|no|in_process|unknown|refused`)
- `budget_range`
- `down_payment_ready` (`yes|no|partial|unknown|refused`)

#### 3.2 Urgencia (`20%`)
Preguntas base:
- "¿En que plazo te gustaria comprar?"
- "¿Buscas comprar en menos de 3 meses?"
- "¿Hay una fecha clave para mudarte o cerrar?"

Repregunta:
- "¿Seria pronto, este año o exploratorio?"

Campos sugeridos:
- `purchase_timeline` (`<3m|3-6m|6-12m|>12m|unknown|refused`)
- `hard_deadline` (`yes|no|unknown|refused`)
- `deadline_reason`

#### 3.3 Nivel de decision (`20%`)
Preguntas base:
- "¿Ya tienes definido tipo de propiedad y zona?"
- "¿Estas comparando opciones o ya tienes favoritas?"
- "¿Ya visitaste propiedades similares?"

Repregunta:
- "¿Que priorizas mas: ubicacion, precio o tamano?"

Campos sugeridos:
- `requirements_defined` (`high|medium|low|unknown|refused`)
- `comparison_mode` (`exploring|comparing|shortlist|unknown|refused`)
- `visited_properties` (`yes|no|unknown|refused`)

#### 3.4 Autoridad (`15%`)
Preguntas base:
- "¿La decision la toman en Uu/pareja/socios?"
- "¿Compras para ti o representas empresa?"

Repregunta:
- "¿Incluimos tambien a quien decide contigo en la cita?"

Campos sugeridos:
- `decision_authority` (`full|shared|advisor|unknown|refused`)
- `buyer_type` (`individual|couple|family|company|investor|unknown|refused`)
- `additional_decision_makers`

#### 3.5 Interaccion / compromiso (`15%`)
Pregunta minima:
- "¿Te parece si apartamos fecha y hora hoy mismo?"

Eventos (comportamiento):
- `accepted_answering_questions`
- `answered_fields_ratio`
- `evasive_answers_count`
- `appointment_requested`
- `appointment_scheduled`
- `appointment_confirmed`
- `appointment_attended`
- `response_time_bucket` (`fast|medium|slow`)

#### 3.6 Reglas de ejecucion
- Maximo `1` pregunta por turno.
- Maximo `1` repregunta por campo.
- Si vuelve a evadir: `unknown/refused` y continuar.
- No bloquear cita por falta de respuesta.

#### 3.7 Regla minima para mover a `precalificado`
- `appointment_scheduled = true`
- y datos minimos en:
  - Capacidad financiera (al menos `financing_type` o `budget_range`)
  - Urgencia (al menos `purchase_timeline`)
  - Autoridad (al menos `decision_authority`)

## 4. Modelo de scoring
Pesos recomendados:
- Capacidad financiera: `30%`
- Urgencia: `20%`
- Nivel de decision: `20%`
- Autoridad: `15%`
- Interaccion: `15%`

Clasificacion:
- `0-50`: Explorando
- `51-75`: Interesado real
- `76-100`: Listo para cierre

## 5. Manejo de evasivas y no respuesta
Regla por campo:
1. Pregunta principal.
2. Una repregunta breve (opcion o rango).
3. Si vuelve a evadir: guardar estado `unknown` o `refused` y avanzar.

Politica:
- No bloquear cita por evasivas.
- Si faltan datos criticos, marcar `precalificacion_incompleta`.
- Calcular score con lo disponible + `confidence` (alta/media/baja).

## 6. Reglas de etapa en embudo
Estado deseado (unificado por canal):
1. `captado`
- Al tener al menos correo o telefono valido.
2. `precalificado`
- Cuando ya tenemos: (- Nombre, Correo, Telefono) hay intencion clara (ej. cita aceptada) + informacion minima de Fase 3.

Regla importante:
- Mismo criterio para `webchat` y `whatsapp`.
- Evitar que un canal promueva y el otro no, para no distorsionar reportes.

## 7. Datos a persistir
En `oportunidades.metadata` y/o `contacto_datos`:
- `lead_scoring`:
  - `score_total`
  - `grade` (`explorando`, `interesado`, `listo`)
  - `confidence`
  - `factors` (subscores por factor)
  - `missing_fields`
  - `refused_fields`
  - `last_scored_at`
  - `source` (`ai_progressive_scoring`)

En `conversaciones_insights`:
- Resumen
- Intencion
- Siguiente accion

## 8. Cambios tecnicos propuestos
### Backend
- Crear servicio comun de scoring (ej. `app/services/lead_scoring.py`):
  - normaliza respuestas
  - calcula subscore + score total
  - calcula confidence
- Crear helper comun de avance de etapa (ej. `promote_after_qualification`) reutilizable por canales.
- Integrar en tools de cierre/agendamiento:
  - `backend/app/channels/whatsapp/tools.py`
  - `backend/app/assistants/tools/lead.py`
  - `backend/app/channels/webchat/service.py` (si aplica fallback)

### Prompts y tools
- Prompt:
  - solicitar datos minimos primero.
  - anunciar 3 preguntas rapidas solo al pedir cita.
  - no insistir mas de 1 repregunta por campo.
- Tooling:
  - registrar respuestas de calificacion por factor.
  - tool para recalcular score cuando haya nueva informacion.

### Frontend
- Embudo:
  - mostrar `score`, `grade`, `confidence`.
  - mostrar `faltantes` y `precalificacion_incompleta`.

## 9. Criterios de aceptacion
1. Ambos canales aplican misma regla de cambio a `precalificado`.
2. Lead sin cita no recibe cuestionario largo.
3. Lead con cita recibe bloque corto y ordenado.
4. Evasivas no bloquean flujo ni rompen scoring.
5. Embudo muestra score y estado de completitud.

## 10. Plan de implementacion por fases
### Fase A (rapida)
- Unificar promocion de etapa por canal.
- Guardar campos base de scoring en metadata.

### Fase B
- Implementar score por factores + confidence.
- Actualizar prompts para flujo progresivo.

### Fase C
- UI en embudo (score, faltantes, semaforo).
- Reportes de conversion por `grade`.

## 11. Riesgos y mitigacion
- Riesgo: friccion por demasiadas preguntas.
  - Mitigacion: max 3 preguntas por bloque, 1 repregunta por campo.
- Riesgo: inconsistencia entre canales.
  - Mitigacion: servicio comun de etapa + scoring.
- Riesgo: datos incompletos.
  - Mitigacion: score parcial + confidence + follow-up.

## 12. Mensajes recomendados
- Inicio de calificacion al pedir cita:
  - "Perfecto, te ayudo a agendar. Para atenderte mejor te hare 3 preguntas rapidas."
- Si evade:
  - "Sin problema. Si gustas, dame un rango aproximado y con eso te recomiendo opciones."
- Si vuelve a evadir:
  - "Perfecto, lo dejamos abierto y avanzamos con tu cita."
