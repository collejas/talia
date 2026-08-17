# Changelog — Asistente IA para plantillas de prospección

Este archivo registra los avances, decisiones y cambios relevantes del plan documentado en:

[`PLAN_ASISTENTE_IA_PLANTILLAS_PROSPECCION.md`](./PLAN_ASISTENTE_IA_PLANTILLAS_PROSPECCION.md)

## Estado actual

**Fase:** Configuración central de prompts

**Estado:** Migración aplicada e integración inicial en curso

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

## 2026-08-17 — Integración inicial de prompts en `settings/variables`

### Agregado

- Se agregó la lectura y actualización de `prospeccion_plantilla_ai_prompt_config` mediante rutas tenant-scoped específicas.
- Se incorporó el BFF de Next.js y una sección visible únicamente para el tenant maestro, con configuración independiente para WhatsApp y correo.
- Cada canal permite capturar `prompt_id`, `prompt_version` y activar/desactivar su uso.
- El backend valida `settings.view`/`settings.manage` y restringe la operación al tenant maestro.
- No se reutiliza `organizaciones.config` para estos valores.
- Validación ejecutada: `compileall`, ESLint, TypeScript (`tsc --noEmit`) y React Doctor (100/100).

### Pendiente

- Capturar los valores reales publicados en OpenAI.
- Continuar con el catálogo/selector de variables y el endpoint de generación.

## 2026-08-17 — Prompts base para OpenAI

### Agregado

- Se creó `Promps_plantillas/README.md` con instrucciones de copia al dashboard de OpenAI.
- Se creó `Promps_plantillas/prospeccion_plantilla_whatsapp.md`.
- Se creó `Promps_plantillas/prospeccion_plantilla_correo.md`.
- Cada prompt define sus variables de entrada, instrucciones de canal, JSON Schema de salida, caso de prueba y validaciones que permanecen en backend.
- Se decidió no agregar funciones ejecutables en esta fase: los prompts solo generan borradores estructurados; no guardan, publican, envían ni consultan datos externos.

### Pendiente

- Crear ambos prompts en el dashboard de OpenAI.
- Publicar una primera versión de cada prompt.
- Ejecutar los casos de prueba y registrar los `prompt_id`/versiones en `/settings/variables`.

## 2026-08-17 — Catálogo y primera generación de borradores

### Agregado

- Se creó `GET /crm/prospeccion/plantillas/ai/variables?canal=...` para cargar el catálogo explícito desde Supabase.
- Se creó `POST /crm/prospeccion/plantillas/ai/generate` con validación de tenant, campaña, canal, prompt, variables y respuesta.
- Se agregó el registro de generaciones y variables seleccionadas/utilizadas en las tablas nuevas.
- Se integró el ledger existente de OpenAI para tokens y costos cuando la respuesta puede correlacionarse.
- Se agregó el asistente dentro del editor de plantillas de `/prospeccion/campanas`.
- El usuario selecciona variables, escribe una instrucción y aplica el resultado al editor como borrador editable.
- No se guarda ni publica automáticamente la plantilla generada.

### Seguridad y validación

- El frontend usa BFF; no llama OpenAI directamente.
- El backend resuelve la organización desde autenticación y valida que la campaña pertenezca al tenant.
- Se rechazan variables desconocidas, placeholders no seleccionados y HTML peligroso.
- Validación ejecutada: `compileall`, ESLint, TypeScript (`tsc --noEmit`), React Doctor (100/100) y consulta real del catálogo Supabase (21 variables por canal).

## 2026-08-17 — Corrección de tenant en el BFF

- Se corrigió el BFF de `/api/prospeccion/plantillas/ai` para conservar el `X-Organizacion-Id` resuelto desde la sesión autenticada.
- Se eliminó el envío explícito de `organizacionId: null`, que provocaba `422` antes de ejecutar el catálogo.
- Se agregaron descripciones accesibles a los diálogos de campañas y plantillas.
- ESLint y TypeScript vuelven a pasar sin errores; permanecen advertencias preexistentes del archivo grande de campañas.

### Pendiente

- Publicar/reiniciar backend y panel para activar las nuevas rutas en el entorno desplegado.
- Ejecutar una generación autenticada con cada prompt real.
- Agregar pruebas automatizadas de autorización, respuesta inválida, placeholders y sanitización HTML.

## Próximos avances

### Pendiente — Fase 0: prompts en OpenAI

- Crear el prompt productivo de WhatsApp. ✅
- Crear el prompt productivo de correo. ✅
- Definir sus variables de entrada. ✅
- Definir el JSON de salida. ✅
- Preparar casos de prueba y ejemplos esperados. ✅ documental; pendiente ejecución autenticada
- Registrar los `prompt_id` y versiones iniciales. ✅ en `/settings/variables`

### Pendiente — Fase 1: configuración y catálogo

- Crear migración para `prospeccion_plantilla_ai_prompt_config`. ✅
- Crear migración para el catálogo de variables y reglas por canal. ✅
- Definir y aplicar RLS. ✅
- Integrar la sección de configuración en `/settings/variables`. ✅
- Validar que solo el tenant propietario pueda editar prompts. ✅ backend; pendiente prueba autenticada

### Fase 2: backend

- Crear schemas Pydantic. ✅
- Crear servicio de generación IA. ✅
- Crear endpoint autenticado. ✅
- Implementar validadores de variables y respuesta. ✅
- Implementar sanitización de HTML. ✅ básica con lista permitida
- Implementar rate limit, timeout y manejo de errores. ⚠️ timeout implementado; rate limit comercial pendiente
- Crear auditoría de generaciones y variables utilizadas. ✅

### Fase 3: frontend

- Agregar el asistente al modal de correo. ✅
- Agregar el asistente al modal de WhatsApp. ✅
- Cargar variables desde el backend. ✅
- Mostrar resultado generado y aplicar como borrador editable. ✅
- Mostrar advertencias, regenerar, aceptar, editar o descartar. ⚠️ advertencias y regeneración disponibles; aceptación/descartar se realiza editando o cerrando el editor

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
