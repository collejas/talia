# Operacion Scoring por Tenant (Bienes Raices)

## 1. Donde se configura
Configuracion en:
- `public.organizaciones.config.scoring_bienes_raices`

Estructura soportada:
```json
{
  "scoring_bienes_raices": {
    "enabled": true,
    "weights": {
      "capacidad_financiera": 30,
      "urgencia": 20,
      "nivel_decision": 20,
      "autoridad": 15,
      "interaccion_compromiso": 15
    },
    "thresholds": {
      "explorando_max": 50,
      "interesado_max": 75,
      "listo_min": 76
    },
    "confidence_thresholds": {
      "high_min": 0.8,
      "medium_min": 0.5
    }
  }
}
```

## 2. Reglas de validacion
- `weights`: deben sumar exactamente `100`.
- `thresholds`:
  - `0 <= explorando_max <= interesado_max <= 100`
  - `listo_min >= interesado_max`
  - `listo_min <= 100`
- `confidence_thresholds`:
  - acepta `0..1` o porcentaje (`80` -> `0.8`)
  - `0 <= medium_min <= high_min <= 1`

Si la configuracion es invalida:
- el backend hace `fallback` a defaults seguros.
- no rompe el flujo de scoring.

## 3. Defaults de plataforma
- `enabled = true`
- `weights`: `30/20/20/15/15`
- `thresholds`: `50/75/76`
- `confidence_thresholds`: `0.8/0.5`

## 4. Rollback rapido
Opciones:
1. Desactivar scoring avanzado del tenant:
   - `"enabled": false`
2. Eliminar bloque `scoring_bienes_raices` completo para volver a defaults globales.

## 5. Verificacion operativa
Checklist rapido:
1. Crear o editar oportunidad de prueba (whatsapp o webchat).
2. Confirmar en `oportunidades.metadata.lead_scoring`:
   - `score_total`, `grade`, `confidence`.
3. Confirmar insercion en `oportunidad_scoring_eventos`.
4. Verificar `/crm/pipeline/scoring/kpis`:
   - `event_based`
   - `opportunity_latest_based`

## 6. Notas de interpretacion KPI
- `event_based`: actividad total de recalculos (telemetria).
- `opportunity_latest_based`: estado actual por oportunidad (operacion comercial).

## 7. Politica comercial de notificaciones (por canal)
La politica operativa recomendada queda separada por canal (`whatsapp` y `webchat`):
- Caso A: notificar vendedor cuando hay cita confirmada + perfilamiento minimo.
- Caso B: notificar vendedor al agotar reenganches con datos base completos.

Guardas:
- evitar duplicado de notificacion primaria (`information_email`/`close_lead`) en la misma conversacion.
- permitir `booking_confirmed` como notificacion final de cita.

Estado actual:
- [Check] Politica A/B activa en backend para ambos canales.
- [Check] Notificacion temprana removida de `information_email` y `close_lead`.
- [Check] Anti-duplicado primario por canal persistido en metadata de oportunidad (`sales_primary_notifications`).

## 8. Proxima evolucion: configuracion desde BD (frontend)
Objetivo:
- administrar preguntas, repreguntas, pesos y umbrales sin despliegue backend.

Catalogo propuesto:
- `scoring_questions` (tenant, canal, campo, texto, orden, activa, `repregunta_max`)
- `scoring_question_reprompts` (pregunta, intento, texto)
- `scoring_rules` (pregunta/campo, condicion, puntos)
- `scoring_profiles` (pesos/umbrales por tenant y canal)

Impacto:
- prompt OpenAI y funciones deben respetar el contrato dinamico.
- tools backend validan y persisten resultados con guardas de cita real.

Estado actual:
- [Check] Estructura BD creada con migracion `20280416_120000_scoring_config_catalog.sql`.
- [Check] CRUD backend disponible via `/crm/pipeline/scoring/config*`.
- [Check] Motor de scoring dinamico conectado a catalogo BD con fallback seguro a logica legacy.
- [Check] Pantalla frontend de administracion del catalogo por tenant/canal en `/settings/scoring`.
- [Check] Edicion inline en frontend para preguntas, repreguntas y reglas (sin necesidad de SQL manual).
- [Check] Persistencia de `estado_respuesta` y `repregunta_count` por pregunta/canal en `lead_scoring.profiling_by_channel`.
