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

## 2026-08-17 — Corrección de credencial OpenAI en generación

### Corregido

- Se diagnosticó el `502 Bad Gateway` de `POST /api/prospeccion/plantillas/ai`.
- El backend sí validaba el tenant, la campaña y persistía la generación, pero intentaba crear el cliente OpenAI únicamente con `OPENAI_API_KEY` del entorno.
- La generación ahora resuelve la API key y el proyecto desde los secretos seguros del tenant maestro, donde se administra la configuración central de prompts.
- La llamada al ledger registra también la huella de la credencial y el proyecto utilizados, sin persistir la API key.

### Validación

- `talia-api.service` reiniciado y activo.
- Rutas activas confirmadas en OpenAPI: variables y generación.
- Credencial maestra y proyecto disponibles confirmados sin exponer sus valores.

## 2026-08-17 — Corrección de esquema Structured Outputs

- Se diagnosticó un `400` de OpenAI que estaba siendo presentado al frontend como `502`.
- OpenAI rechazaba `uniqueItems` en el esquema de `variables_usadas`.
- Se eliminó esa palabra clave del JSON Schema y se conserva la validación de variables permitidas en backend.

## 2026-08-17 — Diagnóstico de variables del prompt publicado

- La API key, el proyecto y el esquema estructurado ya son aceptados por OpenAI.
- OpenAI devolvió `prompt_variable_unknown` para las ocho variables enviadas por el backend.
- Se confirmó que la versión configurada del prompt de correo es la `v1`.
- El backend ahora devuelve `400 template_ai_prompt_variables_not_configured` para distinguir una configuración incompleta del prompt de una indisponibilidad del proveedor.
- Pendiente: declarar las ocho variables en cada prompt de OpenAI y publicar una nueva versión; después actualizar `prompt_version` en `/settings/variables`.

## 2026-08-17 — Actualización de prompts para publicación

- Se agregaron bloques copiables con los ocho nombres exactos de variables de entrada en los prompts de correo y WhatsApp.
- Se eliminaron referencias a `uniqueItems` de los JSON Schema documentales para mantener compatibilidad con Structured Outputs.
- Se indicó publicar una nueva versión después de declarar las variables en el dashboard de OpenAI.

## 2026-08-18 — Editor de plantillas como página completa

### Agregado

- Se creó `/prospeccion/campanas/plantillas/nueva?campana_id=...` para crear plantillas en una página completa.
- Se creó `/prospeccion/campanas/plantillas/[templateId]/editar` para editar plantillas existentes.
- El botón `Plantillas` de la vista de campañas ahora navega al editor de página completa.
- Se incorporó listado lateral de plantillas de la campaña, asistente IA, vista previa y acciones de guardar/cancelar.
- Correo permite elegir un solo formato: HTML con diseño o texto plano.
- WhatsApp conserva su registro local con nombre, idioma, categoría y texto de referencia.
- La vista previa HTML se aisló mediante `iframe sandbox`.

### Validación

- ESLint: correcto en los archivos nuevos.
- TypeScript (`tsc --noEmit`): correcto.
- React Doctor: 100/100.

### Pendientes

- Retirar definitivamente el código legacy del modal después de validar el flujo en producción.
- Agregar pruebas E2E para crear, editar y cambiar formato de correo.

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

## 2026-08-18 — Reestructuración de la página de plantillas

### Cambios realizados

- Se eliminó el selector de campañas de la página de creación de plantillas.
- La campaña ahora se recibe desde la navegación de prospección/campanas y permanece fija durante la creación o edición.
- Se reorganizó la pantalla en encabezado, contexto de campaña, identidad, contenido, asistente IA, vista previa y otras plantillas.
- La edición conserva el identificador de campaña en la URL para evitar perder el contexto.
- En correo se mantiene la selección exclusiva entre HTML y texto plano; solo se persiste el formato elegido.

### Validación

- ESLint de las páginas y el editor: correcto.
- TypeScript (npx tsc --noEmit): correcto.
- React Doctor: 100/100, sin hallazgos.
- git diff --check: correcto.

### Pendiente

- Validar visualmente en navegador los tamaños finales en escritorio y móvil.

## 2026-08-18 — Ampliación de la vista previa

### Cambios realizados

- La vista previa dejó de mostrarse dentro de la columna lateral de 360 px.
- Se movió a una sección independiente debajo del editor, utilizando todo el ancho disponible.
- La previsualización HTML ahora tiene hasta 900 px de ancho y 720 px de altura mínima.
- El panel lateral quedó reservado para el asistente IA y las plantillas relacionadas.

## 2026-08-18 — Recuperación de recursos y enlaces

### Cambios realizados

- El selector de plantillas de la campaña se movió al encabezado, junto al nombre y canal de la campaña.
- Se restauró la carga de imágenes mediante la galería aislada por tenant.
- Se agregó una galería visual con selección y asignación para logo, imagen principal, productos y garantía.
- Los selectores de asignación muestran la miniatura de la imagen seleccionada y miniaturas dentro de cada opción.
- Las relaciones de imágenes se guardan mediante el arreglo de asignaciones de la plantilla.
- Se restauró la inserción de variables de personalización.
- Se restauraron los enlaces al sitio web, agenda de demo, WhatsApp y páginas personalizadas.
- La vista previa HTML resuelve las imágenes seleccionadas y los enlaces de sitio y agenda.
- El dominio y teléfono se toman de la configuración del tenant.

### Validación

- ESLint: correcto.
- TypeScript: correcto.
- React Doctor: 100/100, sin hallazgos.
- git diff --check: correcto.

## 2026-08-18 — Variables IA para llamadas a la acción

### Cambios realizados

- Se confirmó que website_url, booking_url, tracking_url y booking_link_text ya existían en el catálogo IA.
- Se agregaron las variables columnares whatsapp_url y custom_url para correo y WhatsApp.
- El asistente deshabilita estas variables hasta que el enlace correspondiente esté configurado en la página.
- Al aplicar un borrador, whatsapp_url y custom_url se sustituyen por URLs validadas.
- Se actualizaron los documentos de los prompts de correo y WhatsApp con reglas específicas para llamadas a la acción.

### Base de datos

- Migración: 20280818_130000_prospeccion_plantillas_ai_cta_variables.sql.
- Aplicada mediante Supabase MCP.
- Catálogo verificado para website_url, booking_url, whatsapp_url y custom_url en ambos canales.

## 2026-08-18 — Rediseño del prompt visual de correo

### Cambios realizados

- Se ampliaron las instrucciones del prompt de correo con dirección de arte B2B moderna y variación de composiciones.
- Se definió una estructura visual con encabezado, hero, bloques de contenido, tarjetas, espaciado, jerarquía y CTA.
- Los CTA deben generarse como enlaces HTML estilizados como botones de email; nunca como elementos button.
- Se agregaron reglas para tablas compatibles con correo, diseño responsive y escalamiento de imágenes con width, max-width y height auto.
- Se indicó el uso de CSS inline seguro y la prohibición de flexbox, grid, JavaScript, fuentes externas y URLs inventadas.
- Se actualizó el backend para conservar estilos inline y atributos seguros de email.
- Se agregó sanitización de propiedades CSS, dimensiones y atributos estructurales.
- Se agregaron pruebas para CSS seguro, dimensiones responsivas, URLs por placeholder y eliminación de contenido peligroso.

### Validación

- Pruebas HTML del sanitizador: 2/2 correctas.
- git diff --check: correcto.
- El prompt mantiene las ocho variables técnicas requeridas por OpenAI; el diseño se expresa dentro de las instrucciones del mensaje y del catálogo de variables.

## 2026-08-18 — Vista previa con datos y validación de CTA

### Cambios realizados

- La vista previa ahora carga el primer prospecto disponible del tenant y sustituye variables de nombre, apellidos, empresa, segmento, correo, teléfono y canal de origen.
- Se agregaron a la vista previa URLs de sitio, tracking, agenda/demo, WhatsApp y enlace personalizado.
- También se resuelven textos de enlace e imágenes asignadas.
- Si no hay prospectos disponibles, se informa al usuario y se muestran valores de ejemplo.
- La variable booking_link_text ahora selecciona automáticamente booking_url como dependencia.
- El backend valida que las variables URL de CTA seleccionadas aparezcan en el resultado generado.
- El backend valida que booking_link_text no se use sin booking_url.
- Se actualizaron ambos prompts para exigir el uso de cada URL de CTA seleccionada.

### Validación

- Pruebas IA/HTML: 3/3 correctas.
- ESLint: correcto.
- TypeScript: correcto.
- React Doctor: 100/100.
- git diff --check: correcto.

## 2026-08-18 — Timeout explícito del proveedor IA

### Cambios realizados

- Se identificó que la generación podía permanecer aproximadamente 45 segundos esperando a OpenAI y terminar como `502 template_ai_provider_unavailable`.
- El tiempo límite ahora es configurable mediante `PROSPECCION_TEMPLATE_AI_TIMEOUT_SECONDS` o `TALIA_PROSPECCION_TEMPLATE_AI_TIMEOUT_SECONDS`, con valor predeterminado de 45 segundos y límites de seguridad de 10 a 120 segundos.
- Los timeouts se registran en la auditoría como `template_ai_provider_timeout`.
- La API responde `504 template_ai_provider_timeout` para distinguir una demora del proveedor de una caída general o una respuesta inválida.
- No se agregó reintento automático, para evitar solicitudes duplicadas y costos duplicados ante una respuesta tardía de OpenAI.

### Validación

- Servicio `talia-api.service` reiniciado y activo.
- `/api/health`: `200 {"status":"ok"}`.
- Pruebas IA/HTML: 3/3 correctas.
- `git diff --check`: correcto.
