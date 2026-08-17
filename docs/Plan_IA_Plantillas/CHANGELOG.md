# Changelog — Asistente IA para plantillas de prospección

Este archivo registra los avances, decisiones y cambios relevantes del plan documentado en:

[`PLAN_ASISTENTE_IA_PLANTILLAS_PROSPECCION.md`](./PLAN_ASISTENTE_IA_PLANTILLAS_PROSPECCION.md)

## Estado actual

**Fase:** Diseño y documentación

**Estado:** Propuesta aprobada para iniciar implementación

**Última actualización:** 2026-08-17

## 2026-08-17 — Plan inicial documentado

### Agregado

- Propuesta de un Asistente de IA dentro de `/prospeccion/campanas`.
- Generación asistida para plantillas de WhatsApp y correo.
- Selección explícita de variables permitidas por parte del usuario.
- Generación de borradores editables antes de guardar.
- Validación backend de placeholders, canal, tenant y estructura de respuesta.
- Contrato preliminar para `POST /api/prospeccion/templates/ai/generate`.
- Reglas de seguridad para llamadas a OpenAI desde backend.
- Reglas de sanitización para HTML de correo.
- Manejo de estados de carga, error, timeout y respuesta inválida.
- Fases de implementación y criterios de aceptación.

### Decisiones

- Se utilizarán dos prompts separados en el proyecto de OpenAI del dueño de la plataforma:
  - `prospeccion_plantilla_whatsapp`.
  - `prospeccion_plantilla_correo`.
- Cada prompt tendrá instrucciones y restricciones específicas de su canal.
- La IA generará borradores; no enviará mensajes ni publicará plantillas directamente en Meta.
- WhatsApp requerirá revisión y aprobación externa en WhatsApp Manager.
- El backend será la fuente de verdad para el catálogo de variables.
- El frontend no ejecutará llamadas directas a OpenAI.
- La generación será independiente y auditable; no se utilizará memoria conversacional permanente.

## 2026-08-17 — Persistencia y diseño de base de datos

### Agregado

Se documentó la necesidad de persistir la configuración, el catálogo y la auditoría mediante tablas con columnas explícitas:

- `prospeccion_plantilla_ai_prompt_config`.
- `prospeccion_plantilla_ai_variables`.
- `prospeccion_plantilla_ai_variable_canales`.
- `prospeccion_plantilla_ai_generaciones`.
- `prospeccion_plantilla_ai_generacion_variables`.

### Decisiones

- Las tablas no duplicarán la plantilla final existente.
- Las plantillas finales continuarán utilizando sus campos actuales: `asunto`, `cuerpo_texto` y `cuerpo_html`.
- No se almacenarán datos estructurales en `metadata`, `json`, `jsonb`, `payload`, `config` o `settings`.
- Variables seleccionadas y variables utilizadas se persistirán mediante relaciones normalizadas.
- Las tablas tendrán primary keys, foreign keys, constraints e índices orientados a tenant, canal, estado y fecha.
- El ledger centralizado de OpenAI seguirá siendo la fuente oficial de costos cuando sea compatible.
- No se creará una segunda contabilidad mezclando generación IA con envíos, cobros de WhatsApp, costos Meta o atribución comercial.

## 2026-08-17 — Configuración desde `settings/variables`

### Agregado

Se definió que el tenant propietario administrará desde:

```text
/settings/variables
```

Los siguientes valores:

- Prompt de plantillas WhatsApp.
- Versión del prompt de plantillas WhatsApp.
- Prompt de plantillas de correo.
- Versión del prompt de plantillas de correo.

### Decisiones

- Solo el tenant propietario podrá consultar y editar esta configuración.
- Los demás tenants consumirán la configuración central activa sin poder sobrescribirla.
- La configuración se persistirá en `prospeccion_plantilla_ai_prompt_config`.
- La tabla tendrá una configuración por canal para el tenant propietario.
- El backend validará el tenant propietario antes de leer o modificar la configuración.
- El `prompt_id` y `prompt_version` activos se registrarán en cada generación IA.
- Las variables de entorno solo serán fallback de bootstrap o contingencia, no la configuración operativa normal.

## Próximos avances

### Pendiente — Fase 0: prompts en OpenAI

- Crear el prompt productivo de WhatsApp.
- Crear el prompt productivo de correo.
- Definir sus variables de entrada.
- Definir el JSON de salida.
- Preparar casos de prueba y ejemplos esperados.
- Registrar los `prompt_id` y versiones iniciales.

### Pendiente — Fase 1: configuración y catálogo

- Crear migración para `prospeccion_plantilla_ai_prompt_config`.
- Crear migración para el catálogo de variables y reglas por canal.
- Definir y aplicar RLS.
- Integrar la sección de configuración en `/settings/variables`.
- Validar que solo el tenant propietario pueda editar prompts.

### Pendiente — Fase 2: backend

- Crear schemas Pydantic.
- Crear servicio de generación IA.
- Crear endpoint autenticado.
- Implementar validadores de variables y respuesta.
- Implementar sanitización de HTML.
- Implementar rate limit, timeout y manejo de errores.
- Crear auditoría de generaciones y variables utilizadas.

### Pendiente — Fase 3: frontend

- Agregar el asistente al modal de correo.
- Agregar el asistente al modal de WhatsApp.
- Cargar variables desde el backend.
- Mostrar preview, advertencias y resultado generado.
- Permitir regenerar, aceptar, editar o descartar.

### Pendiente — Fase 4: validación productiva

- Ejecutar pruebas backend y frontend.
- Validar aislamiento entre tenants.
- Validar configuración desde el tenant propietario.
- Confirmar costos y límites de uso.
- Probar una plantilla de WhatsApp en el flujo real de aprobación de Meta.
- Validar el flujo autenticado completo antes de declarar la funcionalidad terminada.

## 2026-08-17 — Inicio de implementación de base de datos

### Agregado

- Migración `supabase/migrations/20280818_120000_prospeccion_plantillas_ai.sql`.
- Tabla de configuración central de prompts por canal:
  - `prospeccion_plantilla_ai_prompt_config`.
- Catálogo columnar de variables:
  - `prospeccion_plantilla_ai_variables`.
  - `prospeccion_plantilla_ai_variable_canales`.
- Historial de generaciones:
  - `prospeccion_plantilla_ai_generaciones`.
  - `prospeccion_plantilla_ai_generacion_variables`.
- Catálogo inicial de variables de correo y WhatsApp.
- Registro de `prompt_id`, `prompt_version`, modelo, tokens, costo estimado, duración y estado.
- Relación opcional con `openai_request_usage` para conservar el ledger central de consumo.
- Foreign keys compuestas con tenant para campañas, usuarios y plantillas.
- Índices para tenant, canal, estado, usuario, campaña, plantilla, versión y fecha.
- Políticas RLS para limitar la configuración de prompts al tenant propietario y el historial al tenant autenticado.

### Validación

- `git diff --check`: correcto.
- La migración se aplicó correctamente mediante MCP de Supabase.
- Las cinco tablas existen en Supabase con RLS habilitado.
- El catálogo quedó sembrado con 21 variables y 42 reglas de canal: 21 para correo y 21 para WhatsApp.
- Las políticas RLS e índices principales fueron verificados directamente en Supabase.
- `supabase db lint --local`: no ejecutable en este entorno porque no existe una instancia PostgreSQL local disponible en `127.0.0.1:54322`.

### Pendientes

- Crear la configuración inicial de los dos prompts desde `/settings/variables` después de implementar la pantalla.
- Validar el acceso autenticado real de owner y tenants cuando se implemente el backend.

## Reglas para futuras entradas

Cada avance debe registrar:

- Fecha.
- Fase afectada.
- Archivos o migraciones modificados.
- Cambios realizados.
- Decisiones tomadas.
- Pruebas ejecutadas.
- Riesgos o pendientes.
- Evidencia de validación productiva cuando aplique.
