# Changelog — Asistente IA para plantillas de prospección

Este archivo registra los avances, decisiones y cambios relevantes del plan documentado en:

[`PLAN_ASISTENTE_IA_PLANTILLAS_PROSPECCION.md`](./PLAN_ASISTENTE_IA_PLANTILLAS_PROSPECCION.md)

## Estado actual

**Fase:** Configuración central de prompts

**Estado:** Migración aplicada e integración inicial en curso

**Última actualización:** 2026-08-31

## 2026-08-31 — Tres modos de creación para correo

## 2026-09-01 — Destinos de botones del Editor visual

### Cambios realizados

- Los botones principales y los botones dentro de columnas comparten un
  selector de destino.
- Se agregaron Landing principal, Agenda, Página específica de la landing y
  WhatsApp.
- Las páginas específicas se construyen sobre el dominio público del tenant.
- Los CTAs de WhatsApp se cargan desde las reglas activas de atribución y se
  conserva la frase preconfigurada dentro del enlace `wa.me`.
- Se retiró el enlace genérico como opción para nuevos botones; los enlaces
  existentes se conservan para no romper plantillas ya creadas.

### Regla de medición

- Los destinos web se procesan con el tracking UTM del envío.
- WhatsApp conserva su mecanismo independiente de atribución por frase; no se
  interpreta como una visita web.

## 2026-09-01 — Inserción de variables en la posición del cursor

### Cambios realizados

- Las variables del catálogo ahora se insertan en la posición actual del cursor
  o reemplazan el texto seleccionado.
- El comportamiento aplica al contenido principal del Editor visual y a los
  textos editables dentro de columnas.
- El mismo comportamiento se aplica al código HTML y al cuerpo de WhatsApp
  cuando el catálogo de variables está visible.
- El foco y la nueva posición del cursor se conservan después de insertar la
  variable, incluso cuando el catálogo está en el panel lateral.
- La sección única de “Personalización” ahora detecta si el cursor está en el
  asunto y dirige allí la variable; no se agrega un catálogo duplicado debajo
  del campo.

## 2026-09-01 — Destinos de enlaces en Código HTML

### Cambios realizados

- El modo Código HTML utiliza un selector único de destino: Landing principal,
  Agenda/demo, CTA de WhatsApp o Página interna.
- Los CTA de WhatsApp se seleccionan desde las reglas activas de atribución y
  conservan su frase; los enlaces web reciben seguimiento UTM.
- Se eliminaron de la vista los controles duplicados de inserción para mantener
  un flujo simple y consistente con el Editor visual.

### Documentado

- Se definió una selección inicial con tres opciones: **Editor visual**, **Código HTML** y **Asistente IA**.
- Se aclaró que el Editor visual no es texto plano: genera HTML sin exponer código al usuario.
- Se establecieron como campos comunes el nombre, asunto, tipo de correo (`Broadcast` o `Transactional`) y descripción.
- Se documentó el flujo de selección de imágenes, uso de cada imagen, variables del prospecto, prompt y estilo de diseño para IA.
- Se definió que el resultado de IA debe quedar como borrador editable antes de guardarse.
- Se propuso persistir `email_creation_mode` como columna explícita con valores `visual`, `html` y `ai`.
- Se documentó la necesidad de conservar la trazabilidad de imágenes usadas durante una generación IA mediante una relación explícita.
- Se agregaron criterios de aceptación y pendientes relacionados con el editor visual por bloques y la edición posterior.

### Decisiones

- El asistente IA dejará de plantearse como un panel permanente junto a los editores de correo y pasará a ser uno de los modos de creación.
- Las imágenes se resolverán desde recursos autorizados del tenant; el modelo no podrá inventar URLs ni acceder a recursos de otros tenants.
- El modo de creación describe la experiencia de edición, mientras que `asunto`, `cuerpo_texto` y `cuerpo_html` conservan el contrato de envío.
- En el flujo IA, el usuario elegirá el estilo de diseño antes de escribir el prompt.
- Los tres flujos de correo utilizarán el catálogo completo de variables disponible en backend.
- La UI mostrará las variables con nombres legibles para el usuario, sin claves técnicas, tipos ni etiquetas adicionales; las claves técnicas permanecerán internas.

## 2026-08-31 — Inicio de implementación del selector y Editor visual

### Cambios realizados

- Se agregó la columna explícita `email_creation_mode` a las plantillas.
- Se agregó la columna explícita `campana_id` con relación a `campanas`, para que la plantilla pertenezca realmente a la campaña seleccionada y no dependa de `metadata`.
- Se migraron las asociaciones históricas encontradas en `metadata.campana_id`.
- Se aplicó la migración en Supabase y se inicializaron plantillas existentes con `html` cuando ya tenían HTML y `visual` en los demás casos.
- Se agregaron los valores `visual`, `html` y `ai` al contrato FastAPI y al cliente TypeScript.
- Se agregó el selector de modo en el editor de plantillas.
- Se montó un Editor visual inicial separado, basado en `REFERENCIA_EDITOR_VISUAL.html`.
- El Editor visual incluye biblioteca de bloques, lienzo, selección de bloque, inspector, variables, imágenes y vista escritorio/móvil.

## 2026-08-31 — Botones y columnas editables en el Editor visual

### Cambios realizados

- Los bloques de botón ahora permiten editar el texto visible.
- Se agregó selección de CTA/enlace disponible y captura de enlace personalizado.
- Las columnas ahora conservan dos anchos configurables y ajustan
  automáticamente la columna complementaria para mantener el 100%.
- Cada columna permite agregar y editar elementos internos de texto, botón o
  imagen, así como eliminarlos.
- La estructura de columnas y sus elementos se serializa al HTML guardado de la
  plantilla, sin exponer al usuario la estructura técnica.

### Validación

- TypeScript: correcto.
- ESLint: correcto.
- React Doctor: 100/100.
- `git diff --check`: correcto.

## 2026-08-31 — Inicio de reconstrucción del dominio de plantillas

### Cambios realizados

- Se documentó el rediseño completo alrededor del flujo campaña → canal →
  plantilla → versión.
- Se creó el dominio normalizado de versiones editables y publicables.
- Se crearon tablas explícitas para bloques, columnas y elementos internos.
- Se agregó `version_activa_id` a la plantilla para identificar la versión que
  utilizará el envío.
- Se migró cada plantilla existente a una primera versión conservando asunto,
  texto, HTML, método de creación y estado activo.
- Se agregaron claves foráneas, índices, restricciones de orden, tipos, anchos
  de columnas y políticas RLS por organización.

### Validación

- Migración aplicada correctamente en Supabase.
- Se verificaron 62 plantillas con versión activa.

### Siguiente fase

- Exponer el contrato API de versiones y publicación.
- Conectar el editor visual al modelo estructurado.
- Rehacer la pantalla de plantillas de cada campaña.

## 2026-08-31 — Primer contrato API de versiones

### Cambios realizados

- Se agregó el endpoint tenant-aware para listar versiones de una plantilla.
- Se agregó el endpoint para crear borradores sin alterar la versión publicada.
- Se agregó una función transaccional y endpoint de publicación que archiva la
  versión anterior y actualiza `version_activa_id`.
- Se validó que la plantilla pertenezca a la organización autenticada antes de
  consultar o crear versiones.
- Se documentó que la publicación será una operación posterior, separada y
  transaccional.

### Validación

- FastAPI/Python: compilación correcta.
- `git diff --check`: correcto.

## 2026-08-31 — Persistencia del árbol visual de bloques

### Cambios realizados

- El editor visual ahora emite, además del HTML, su estructura de bloques.
- El guardado de una versión transforma esa estructura al contrato explícito de
  bloques, columnas y elementos internos.
- Se validan tipos de bloque, orden, ancho de columnas, destinos e imágenes con
  Pydantic antes de persistir.
- El HTML continúa guardándose como resultado renderizado para mantener la
  compatibilidad del sender actual.
- Al abrir una plantilla con versión activa, el editor solicita y reconstruye
  el árbol de bloques, columnas y elementos guardado.

### Validación

- TypeScript: correcto.
- Prueba de validación Pydantic para bloque de columnas: correcta.
- Python: compilación correcta.
- `git diff --check`: correcto.

### Siguiente fase

- Leer el árbol estructurado al abrir una versión.
- Reemplazar el HTML plano heredado únicamente cuando exista estructura visual.
- Completar el workspace de campaña y la publicación desde la revisión final.

## 2026-08-31 — Centro de plantillas por campaña

### Cambios realizados

- La acción `Plantillas` de una campaña ahora abre un centro de trabajo propio.
- El centro muestra las plantillas asociadas al canal de la campaña, asunto,
  tipo, estado y cantidad de versiones.
- Se agregaron acciones de editar, consultar versiones y revisar/publicar.
- La creación de una plantilla continúa iniciando desde la campaña seleccionada.
- El centro permite expandir el historial de versiones y consultar una preview
  aislada de cada versión HTML.
- Los borradores pueden publicarse directamente desde el historial mediante la
  operación transaccional tenant-safe.

### Validación

- TypeScript: correcto.
- React Doctor: 100/100.
- ESLint: 0 errores; warnings preexistentes.
- `git diff --check`: correcto.

## 2026-08-31 — Corrección del BFF de versiones

### Cambios realizados

- Se agregaron las rutas dinámicas de Next.js que faltaban para el contrato de
  versiones:
  - Listar versiones.
  - Consultar una versión con su árbol visual.
  - Crear versiones.
  - Publicar una versión.
- Las rutas reenvían la sesión del usuario mediante el proxy existente y no
  exponen credenciales al navegador.

### Diagnóstico

- El `404` observado en `talia.mx` era una página HTML de Next.js, no un error
  del backend ni de Supabase: la ruta BFF no existía en el release desplegado.
- El código local ya compila y React Doctor marca 100/100.
- Falta desplegar frontend y backend para que la corrección sea visible en
  producción.

### Validación

- TypeScript: correcto.
- ESLint: 0 errores; 36 warnings preexistentes.
- React Doctor: 100/100.
- `git diff --check`: correcto.

### Pendiente

- Refinar el modelo de bloques y la conversión completa del HTML existente.
- Compartir el catálogo completo de variables entre Editor visual, Código HTML y Asistente IA.
- Completar pruebas de creación, edición, imágenes, variables y guardado en flujo autenticado.
- El HTML proporcionado por el usuario quedó definido como referencia visual y funcional obligatoria del Editor visual.
- Se copió el HTML de referencia completo en [`REFERENCIA_EDITOR_VISUAL.html`](./REFERENCIA_EDITOR_VISUAL.html) y se enlazó desde el plan.
- Se documentó que deben conservarse su barra superior, biblioteca de bloques, lienzo, inspector, chips de variables, vista escritorio/móvil y barra inferior de acciones.

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

## 2026-08-18 — Contexto empresarial y sistema visual por tenant

### Cambios realizados

- Se agregaron columnas explícitas en `organizaciones` para descripción empresarial, productos y servicios, público objetivo, propuesta de valor, diferenciadores y restricciones comerciales.
- Se agregaron columnas explícitas para color primario, color secundario, color de acento, color de fondo, estilo visual y radio de bordes.
- Se reutiliza el `logo_url` existente de la organización; no se duplica como metadata ni como una columna paralela.
- `settings/variables` incorpora una sección para editar el contexto empresarial y el sistema visual.
- El backend valida longitudes, colores hexadecimales y radios de borde, además de aplicar permisos de tenant existentes.
- La generación IA envía `contexto_empresa` y `sistema_diseno_empresa` resueltos desde el tenant autenticado.
- Se agregó el fallback neutral oficial de Tal-IA para colores faltantes.
- Se actualizaron los documentos de los prompts de correo y WhatsApp con la nueva variable `sistema_diseno_empresa`.

### Base de datos

- Migración: `20260818_150000_tenant_ai_business_context_brand.sql`.
- Aplicada mediante Supabase MCP.
- La información estructural se mantiene en columnas consultables; no se agregó a `metadata`, `jsonb` ni `config`.

## 2026-08-18 — Propuesta de estilo de diseño y biblioteca de layouts

### Documentación

- Se documentó la sección visible **Estilo de diseño** para que el usuario pueda elegir un layout o utilizar el modo automático.
- Se definió la variable técnica `{{estilo_diseno}}` para representar el layout solicitado o resuelto.
- Se definió `{{layouts_permitidos}}` para que el backend limite las opciones del modelo al catálogo habilitado para el tenant.
- Se documentó la separación entre composición (`estilo_diseno`) e identidad visual (`sistema_diseno_empresa`).
- Se propuso una biblioteca inicial para correo: `editorial`, `hero_card`, `minimal`, `dark_header`, `feature_cards`, `problem_solution`, `product_showcase`, `case_study`, `personal_letter` y `announcement`.
- Se estableció que los layouts HTML de correo no deben enviarse directamente al prompt de WhatsApp; WhatsApp requerirá un catálogo propio de estructuras conversacionales.

## 2026-08-18 — Implementación de estilo de diseño para correo

### Cambios realizados

- Se creó el catálogo global `prospeccion_plantilla_ai_layouts` con diez estilos iniciales para correo.
- Se creó la relación explícita `prospeccion_plantilla_ai_organizacion_layouts` para habilitar layouts y definir un predeterminado por tenant.
- Se agregó la sección **Estilo de diseño** en `settings/variables`.
- Se agregó el selector **Automático** o layout específico dentro del asistente de creación de plantillas.
- El backend valida que el estilo solicitado y el estilo devuelto por OpenAI pertenezcan al catálogo habilitado del tenant.
- Se agregaron `estilo_diseno_solicitado` y `estilo_diseno_aplicado` a la auditoría de generaciones IA.
- Se agregaron `estilo_diseno` y `layouts_permitidos` al contrato del prompt de correo.

### Base de datos

- Migración: `20260818_160000_prospeccion_plantilla_ai_layouts.sql`.
- Migración: `20260818_161000_prospeccion_plantilla_ai_layout_audit.sql`.
- Aplicadas mediante Supabase MCP.
- No se utilizaron columnas `metadata`, `jsonb` ni configuraciones genéricas para la relación tenant-layout.

## 2026-08-18 — Corrección: estilos personalizados por tenant

- La biblioteca base ahora se clona como registros propios de cada tenant.
- Se eliminó la dependencia operativa de un catálogo global más una relación de habilitación.
- Cada tenant puede crear, editar, habilitar, deshabilitar y eliminar sus estilos desde `settings/variables`.
- El prompt recibe únicamente los estilos activos y habilitados de la organización autenticada.
- Se agregó un trigger para provisionar los estilos base en tenants nuevos.

## 2026-08-18 — Pestaña Imagen empresarial

- Se agruparon las secciones **Contexto empresarial y sistema visual** y **Estilo de diseño** dentro de la pestaña **Imagen empresarial** en `settings/variables`.
- La pestaña quedó como sección principal de identidad comercial, visual y composiciones disponibles para el asistente.
# 2026-09-01 — Simplificación del creador de plantillas de correo

- Se separó visualmente el flujo de `correo` del editor legado de WhatsApp.
- Al crear una plantilla de correo solo se muestran: campaña asociada, datos básicos del correo y la opción de creación elegida.
- Se eliminaron del flujo de correo las tarjetas duplicadas de personalización, imágenes, enlaces y vista previa heredadas.
- El área nueva ocupa todo el ancho disponible; el ancho limitado queda únicamente dentro del lienzo para representar el correo como lo recibirá el destinatario.
- El asistente visual conserva bloques, variables, imágenes, CTA y columnas editables; el asistente IA queda visible solo cuando se selecciona ese modo.
- Las variables del asistente se muestran con etiquetas comprensibles y descripción, sin claves técnicas ni tipo de dato.
- Se retiraron botones visuales sin comportamiento real del editor visual; guardar y publicar quedan en la barra principal del flujo.
- La vista previa de imágenes dentro de columnas ahora muestra el asset seleccionado y lo ajusta al ancho de la columna sin deformarlo ni desbordarse.
- Se agregó el envío de prueba individual desde el constructor: el destinatario se captura manualmente, mientras las variables se renderizan con un prospecto aleatorio del tenant.
- La prueba usa exclusivamente la configuración SMTP de `settings/variables` y `provider_preference="smtp"`; no crea envíos masivos ni pasa por Postmark.
