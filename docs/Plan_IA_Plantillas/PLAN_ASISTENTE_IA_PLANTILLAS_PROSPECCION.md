# Plan: Asistente de IA para plantillas de prospección

**Estado:** Propuesta funcional y técnica

**Fecha:** 2026-08-17

**Módulo:** `/prospeccion/campanas`

**Canales iniciales:** WhatsApp y correo electrónico

## 1. Resumen ejecutivo

Se propone agregar un Asistente de IA a los dos modales de creación y edición de plantillas de `/prospeccion/campanas`.

El usuario seleccionará las variables que desea permitir en la plantilla y escribirá instrucciones de negocio, tono, objetivo o estilo. El asistente generará un borrador reutilizable para el canal seleccionado.

La solución utilizará dos prompts centrales, administrados en el proyecto de OpenAI del dueño de la plataforma:

1. Prompt para generación de plantillas de WhatsApp.
2. Prompt para generación de plantillas de correo.

El backend será responsable de la seguridad, el aislamiento por tenant, el catálogo oficial de variables, las reglas del canal, la validación de la respuesta y el guardado. OpenAI será responsable de interpretar las instrucciones y proponer el contenido.

La IA no sustituirá la aprobación de Meta. En WhatsApp generará una propuesta o referencia que posteriormente deberá coincidir con una plantilla creada y aprobada en WhatsApp Manager.

## 2. Objetivo del producto

Reducir el tiempo y la dificultad para crear plantillas comerciales consistentes, sin obligar al usuario a conocer:

- Sintaxis de placeholders.
- Restricciones de cada canal.
- Estructura de HTML para correo.
- Formato técnico de Meta.
- Nombres internos o slugs.
- Reglas de tracking y enlaces.

El usuario debe poder describir lo que necesita en lenguaje natural, seleccionar las variables permitidas y revisar el resultado antes de guardarlo.

## 3. Decisiones principales

### 3.1 Dos prompts separados

Se crearán dos prompts en el dashboard de OpenAI del dueño de la plataforma:

```text
prospeccion_plantilla_whatsapp
prospeccion_plantilla_correo
```

Cada prompt tendrá instrucciones, formato de salida y restricciones propias del canal. No se usará un único prompt con demasiadas ramas si eso dificulta las pruebas o la evolución independiente.

El backend guardará sus identificadores y versiones mediante configuración segura. El frontend nunca recibirá API keys ni ejecutará llamadas directas a OpenAI.

### 3.2 Fuente de verdad de variables

El prompt conocerá las variables, pero el backend será la fuente de verdad operativa.

El catálogo backend definirá para cada variable:

- Clave técnica.
- Etiqueta visible.
- Descripción.
- Canales compatibles.
- Si es texto, URL o recurso gráfico.
- Si puede aparecer en asunto, texto o HTML.
- Reglas de valor vacío.

El frontend solo mostrará las variables recibidas del backend. No debe mantener una lista independiente que pueda quedar desactualizada.

### 3.3 La IA genera borradores, no envía mensajes

La generación será una operación de preparación. El asistente no enviará correos, no enviará WhatsApp y no publicará plantillas en Meta.

El usuario deberá revisar y confirmar el resultado mediante una acción explícita como `Usar resultado` o `Guardar plantilla`.

## 4. Situación actual que debe respetarse

La vista ya cuenta con editores de plantillas para correo y WhatsApp.

El panel actual permite trabajar con variables como:

```text
{{display_name}}
{{nombre}}
{{titulo}}
{{primer_apellido}}
{{segundo_apellido}}
{{empresa}}
{{email}}
{{telefono}}
{{segmento}}
{{canal_origen}}
{{logo_url}}
{{hero_image_url}}
{{product_image_1_url}}
{{product_image_2_url}}
{{product_image_3_url}}
{{product_image_4_url}}
{{warranty_image_url}}
{{tracking_url}}
{{website_url}}
{{booking_url}}
{{booking_link_text}}
```

El backend ya interpreta placeholders y construye el contexto de renderizado para los envíos. La implementación debe reutilizar ese mecanismo y no crear un segundo motor de sustitución.

Para correo, el envío necesita un asunto y un cuerpo. Un HTML existente no sustituye un asunto faltante.

Para WhatsApp, la pantalla registra una referencia local de una plantilla que debe existir y estar aprobada en Meta. La IA no debe marcar automáticamente una plantilla como aprobada.

## 5. Experiencia de usuario propuesta

Dentro de cada modal de creación o edición se agregará una sección compacta:

### Asistente de IA

Campos:

1. Objetivo de la plantilla.
2. Instrucciones libres del usuario.
3. Tono de comunicación.
4. Variables permitidas.
5. Opcionalmente, producto, servicio, oferta o llamada a la acción.

Acciones:

- `Generar propuesta`.
- `Regenerar`.
- `Usar resultado`.
- `Descartar`.

El usuario podrá modificar manualmente el resultado después de insertarlo en el editor.

### Variables

Las variables deberán mostrarse como checkboxes o chips seleccionables, agrupadas por intención:

- Contacto: nombre, apellidos, correo, teléfono.
- Empresa: empresa, segmento, canal de origen.
- Enlaces: website, tracking, booking.
- Marca y recursos: logo, hero, productos, garantía.

El asistente no podrá usar una variable que no esté seleccionada. Si la instrucción solicita una variable no seleccionada, deberá devolver una advertencia o pedir al usuario que la habilite.

### Estados de interfaz

El componente debe manejar explícitamente:

- Inicial.
- Generando.
- Resultado disponible.
- Error del proveedor.
- Timeout.
- Respuesta inválida.
- Límite de uso alcanzado.
- Sin variables seleccionadas.

Durante la generación se debe bloquear solamente la acción de generar, no todo el editor. El usuario no debe perder el borrador si OpenAI falla.

## 6. Diseño de los dos prompts

### 6.1 Prompt de WhatsApp

Nombre sugerido:

```text
prospeccion_plantilla_whatsapp
```

Responsabilidades:

- Generar texto breve y claro para prospección.
- Usar únicamente las variables permitidas.
- Respetar el idioma solicitado.
- Evitar promesas no proporcionadas por el usuario.
- Evitar inventar datos de la empresa.
- Proponer una llamada a la acción coherente.
- Señalar si el texto puede requerir revisión para políticas o aprobación de Meta.
- Devolver el nombre visible y el cuerpo de referencia.

Salida esperada:

```json
{
  "nombre_sugerido": "Primer contacto comercial",
  "descripcion": "Mensaje inicial para prospectos",
  "cuerpo_texto": "Hola {{nombre}}, ...",
  "variables_usadas": ["nombre", "empresa", "booking_url"],
  "meta_category_sugerida": "marketing",
  "language_code_sugerido": "es_MX",
  "advertencias": []
}
```

Reglas importantes:

- `meta_category_sugerida` es una sugerencia, no una confirmación de facturación.
- `template_status` debe permanecer en `draft` salvo que el usuario registre manualmente un estado aprobado y exista evidencia externa.
- La IA no debe generar variables numéricas de Meta si la aplicación utiliza placeholders nominales como `{{nombre}}`.
- Si el texto contiene una imagen o botón que Meta exige configurar por separado, debe indicarlo como advertencia.

### 6.2 Prompt de correo

Nombre sugerido:

```text
prospeccion_plantilla_correo
```

Responsabilidades:

- Generar asunto.
- Generar cuerpo de texto.
- Generar HTML sencillo y compatible con correo.
- Usar únicamente las variables permitidas.
- Mantener una jerarquía visual clara.
- Evitar CSS complejo o scripts.
- Evitar imágenes externas salvo que correspondan a variables de recursos permitidas.
- Crear una llamada a la acción con `{{booking_url}}` o `{{website_url}}` solo si fue seleccionada.
- No inventar URLs ni datos de contacto.

Salida esperada:

```json
{
  "nombre_sugerido": "Invitación a conocer nuestra solución",
  "descripcion": "Correo inicial para empresas del segmento seleccionado",
  "asunto": "{{empresa}}, una propuesta para tu operación",
  "cuerpo_texto": "Hola {{nombre}}, ...",
  "cuerpo_html": "<p>Hola {{nombre}}, ...</p>",
  "variables_usadas": ["nombre", "empresa", "booking_url"],
  "advertencias": []
}
```

Reglas importantes:

- El asunto es obligatorio para guardar o enviar.
- El HTML debe ser un fragmento de correo, no un documento con scripts.
- El backend debe sanitizar el HTML aunque el prompt indique que es seguro.
- No se debe permitir JavaScript, formularios, iframes ni URLs con esquemas peligrosos.
- La IA no debe colocar información personal de otros prospectos en la plantilla.

## 7. Contrato backend propuesto

Endpoint sugerido:

```text
POST /api/prospeccion/templates/ai/generate
```

El endpoint debe requerir autenticación y el permiso que actualmente protege la administración de plantillas de prospección.

### Request

```json
{
  "canal": "correo",
  "campana_id": "uuid",
  "variables_seleccionadas": [
    "nombre",
    "empresa",
    "segmento",
    "booking_url"
  ],
  "instruccion_usuario": "Crea un correo breve y consultivo para conseguir una reunión.",
  "tono": "profesional",
  "idioma": "es-MX",
  "contexto_empresa": {
    "nombre": "Nombre de la empresa",
    "sitio_web": "https://ejemplo.com"
  },
  "borrador_actual": null
}
```

### Response

```json
{
  "ok": true,
  "canal": "correo",
  "resultado": {
    "nombre_sugerido": "...",
    "asunto": "...",
    "cuerpo_texto": "...",
    "cuerpo_html": "...",
    "variables_usadas": ["nombre", "empresa", "booking_url"],
    "advertencias": []
  },
  "auditoria": {
    "prompt_version": "12",
    "request_id": "interno-no-sensible"
  }
}
```

El identificador de OpenAI no debe devolverse si no es necesario para el frontend. Si se requiere para soporte, se debe exponer únicamente un identificador seguro y no una API key ni el contenido completo de la solicitud.

### Validaciones del request

- `canal` solo acepta `correo` o `whatsapp`.
- `campana_id` debe pertenecer a la organización autenticada.
- Las variables deben existir en el catálogo backend.
- Las variables deben ser compatibles con el canal.
- La instrucción debe tener límites de longitud.
- El contexto de empresa debe resolverse preferentemente desde la organización autenticada, no confiar en valores enviados por el frontend.
- El endpoint debe aplicar rate limit y límites comerciales.

### Validaciones de la respuesta

- JSON válido.
- Campos requeridos presentes.
- Longitudes dentro de los límites de la base y del proveedor.
- Variables usadas contenidas en `variables_seleccionadas`.
- No existen placeholders desconocidos.
- No se generaron URLs prohibidas.
- No hay contenido HTML peligroso.
- El canal coincide con el resultado.

## 8. Separación multi-tenant

El prompt es global, pero cada ejecución debe ser contextualizada al tenant autenticado.

El backend debe:

- Resolver `organizacion_id` desde autenticación.
- Obtener la configuración de marca del tenant actual.
- No aceptar un `organizacion_id` arbitrario desde el frontend.
- No enviar a OpenAI información de otros tenants.
- No reutilizar conversaciones o respuestas entre tenants.
- No guardar el resultado en una plantilla de otra organización.
- Asociar cualquier auditoría a `organizacion_id`, usuario y plantilla.

No se necesita una memoria conversacional permanente para este caso. Cada generación debe ser independiente, reproducible y auditable.

## 9. Persistencia, tablas y auditoría

Las tablas no existirán para duplicar la plantilla final. Tendrán tres propósitos concretos:

1. Mantener el catálogo oficial de variables y sus reglas por canal.
2. Persistir el historial de generaciones realizadas por IA.
3. Registrar trazabilidad, consumo y costos sin mezclarlo con los envíos de correo o WhatsApp.

La plantilla final seguirá persistiendo en la tabla existente de plantillas y en sus columnas normales:

- `asunto`.
- `cuerpo_texto`.
- `cuerpo_html`.
- `cuerpo_texto` de WhatsApp.

### 9.1 Regla de modelado

Toda información que se consulte, filtre, ordene, relacione, audite, reporte o utilice en reglas de negocio debe almacenarse en columnas reales o relaciones normalizadas.

No se utilizarán `metadata`, `json`, `jsonb`, `payload`, `config`, `settings` ni campos equivalentes para guardar:

- Variables seleccionadas.
- Variables utilizadas.
- Canal.
- Tenant.
- Estado de generación.
- Versión del prompt.
- Tokens.
- Costos.
- Relaciones con usuario, campaña o plantilla.

Esto permite consultas rápidas por tenant, canal, campaña, usuario, estado, versión y fecha, además de índices y políticas RLS claras.

### 9.2 Tabla de catálogo de variables

```text
prospeccion_plantilla_ai_variables
```

Esta tabla será un catálogo global administrado por la plataforma. No representa una generación ni una plantilla concreta.

Columnas iniciales:

- `id` `uuid` primary key.
- `clave` `text` not null, unique.
- `etiqueta` `text` not null.
- `descripcion` `text` not null.
- `tipo_dato` `text` not null.
- `activo` `boolean` not null default `true`.
- `orden` `integer` not null.
- `creado_en` `timestamptz` not null.
- `actualizado_en` `timestamptz` not null.

Restricciones:

- `clave` única.
- `tipo_dato` limitado a valores definidos, por ejemplo `texto`, `url` o `imagen`.
- `orden >= 0`.
- No permitir claves vacías.

### 9.3 Reglas de variables por canal

```text
prospeccion_plantilla_ai_variable_canales
```

Se utilizará una relación normalizada para indicar si una variable es válida para correo, WhatsApp o ambos.

Columnas iniciales:

- `id` `uuid` primary key.
- `variable_id` `uuid` not null references `prospeccion_plantilla_ai_variables(id)`.
- `canal` `text` not null.
- `permite_asunto` `boolean` not null default `false`.
- `permite_cuerpo_texto` `boolean` not null default `true`.
- `permite_cuerpo_html` `boolean` not null default `false`.
- `activo` `boolean` not null default `true`.

Restricciones e índices:

- Unique `(variable_id, canal)`.
- Foreign key index sobre `variable_id`.
- `canal` limitado a `correo` y `whatsapp`.
- Índice compuesto `(canal, activo, variable_id)` para cargar el catálogo visible.

### 9.4 Historial de generaciones IA

```text
prospeccion_plantilla_ai_generaciones
```

Esta tabla persistirá qué ocurrió durante cada solicitud al asistente.

Columnas iniciales:

- `id` `uuid` primary key.
- `organizacion_id` `uuid` not null.
- `usuario_id` `uuid` not null.
- `campana_id` `uuid` null.
- `template_id` `uuid` null.
- `canal` `text` not null.
- `prompt_id` `text` not null.
- `prompt_version` `text` not null.
- `modelo` `text` not null.
- `instruccion_usuario` `text` not null.
- `tono` `text` null.
- `idioma` `text` null.
- `resultado_estado` `text` not null.
- `openai_request_id` `text` null.
- `input_tokens` `integer` null.
- `output_tokens` `integer` null.
- `costo_estimado` `numeric(14, 8)` null.
- `duracion_ms` `integer` null.
- `error_codigo` `text` null.
- `creado_en` `timestamptz` not null.
- `finalizado_en` `timestamptz` null.

Estados permitidos inicialmente:

```text
solicitada
generada
aceptada
descartada
error
timeout
respuesta_invalida
```

Restricciones e índices:

- Foreign key a `organizaciones`.
- Foreign key a usuarios si el modelo de usuarios actual lo permite.
- Foreign key a campaña cuando exista.
- Foreign key a plantilla cuando el resultado se utilice para una plantilla guardada.
- `canal` limitado a `correo` y `whatsapp`.
- `resultado_estado` limitado al catálogo anterior.
- `input_tokens`, `output_tokens`, `duracion_ms` no pueden ser negativos.
- Índice `(organizacion_id, creado_en desc)` para historial por tenant.
- Índice `(organizacion_id, canal, creado_en desc)` para métricas por canal.
- Índice `(organizacion_id, resultado_estado, creado_en desc)` para operación y errores.
- Índice por `prompt_id, prompt_version` para comparar versiones.

### 9.5 Variables seleccionadas por generación

```text
prospeccion_plantilla_ai_generacion_variables
```

Esta tabla evita guardar una lista de variables en JSON y permite consultar qué variables se habilitan o utilizan con mayor frecuencia.

Columnas iniciales:

- `id` `uuid` primary key.
- `generacion_id` `uuid` not null references `prospeccion_plantilla_ai_generaciones(id)`.
- `variable_id` `uuid` not null references `prospeccion_plantilla_ai_variables(id)`.
- `seleccionada_por_usuario` `boolean` not null default `true`.
- `utilizada_por_modelo` `boolean` not null default `false`.
- `creado_en` `timestamptz` not null.

Restricciones e índices:

- Unique `(generacion_id, variable_id)`.
- Foreign key indexes sobre `generacion_id` y `variable_id`.
- Índice `(variable_id, utilizada_por_modelo)` para métricas del catálogo.

### 9.6 Costos y ledger existente

La tabla de generaciones puede registrar tokens, duración y costo estimado para facilitar auditoría y reportes de la funcionalidad.

La contabilidad oficial de consumo debe reutilizar el ledger centralizado de OpenAI existente cuando sea compatible. No se debe crear una segunda fuente de verdad de costos.

La generación de una plantilla no debe mezclarse con:

- Cobros de mensajes WhatsApp.
- Envíos de correo.
- Costos de Meta.
- Atribución comercial de campañas.

### 9.7 Configuración de prompts desde `settings/variables`

Los dos prompts se administrarán en el proyecto de OpenAI del dueño de la plataforma. El `prompt_id` y la versión activa se capturarán desde:

```text
/settings/variables
```

La sección será visible y editable únicamente cuando el usuario pertenezca al tenant propietario de la plataforma. Los demás tenants no podrán modificar estos valores; únicamente utilizarán la configuración central activa.

La configuración no se guardará dentro de `organizaciones.config`, `metadata` o `jsonb`. Se persistirá en una tabla con columnas explícitas:

```text
prospeccion_plantilla_ai_prompt_config
```

Columnas iniciales:

- `id` `uuid` primary key.
- `organizacion_id` `uuid` not null references la organización propietaria.
- `canal` `text` not null.
- `prompt_id` `text` not null.
- `prompt_version` `text` not null.
- `activo` `boolean` not null default `true`.
- `actualizado_por` `uuid` not null.
- `creado_en` `timestamptz` not null.
- `actualizado_en` `timestamptz` not null.

Restricciones e índices:

- Unique `(organizacion_id, canal)`.
- `canal` limitado a `correo` y `whatsapp`.
- `prompt_id` no vacío y con formato válido para prompts de OpenAI.
- `prompt_version` no vacío.
- Foreign key index sobre `organizacion_id`.
- Índice `(organizacion_id, activo, canal)` para resolver rápidamente la configuración vigente.
- La aplicación debe garantizar que `organizacion_id` sea el tenant propietario.

La tabla tendrá como máximo dos registros activos para el tenant propietario:

| Canal | Configuración |
|---|---|
| `whatsapp` | Prompt y versión del asistente de plantillas WhatsApp |
| `correo` | Prompt y versión del asistente de plantillas de correo |

La pantalla debe mostrar dos bloques independientes:

- `Prompt IA para plantillas de WhatsApp`.
- `Prompt IA para plantillas de correo`.

Cada bloque tendrá:

- Campo `prompt_id`.
- Campo `prompt_version`.
- Estado activo.
- Usuario que realizó la última modificación.
- Fecha de última actualización.

El backend resolverá siempre esta tabla antes de llamar a OpenAI y registrará el `prompt_id` y `prompt_version` usados en `prospeccion_plantilla_ai_generaciones`.

La configuración de base de datos será la fuente principal. Variables de entorno solo podrán existir como fallback de bootstrap o contingencia operativa, nunca como mecanismo normal de edición para el usuario.

### 9.8 Retención del contenido

La tabla de generaciones debe persistir inicialmente los datos de auditoría y consumo, no necesariamente el HTML o la respuesta completa de OpenAI.

El contenido completo solo se conservará si el negocio requiere revisar exactamente qué generó la IA. En ese caso deberán definirse columnas explícitas, retención, permisos y protección de datos antes de implementar esa parte.

## 10. Configuración de OpenAI

La configuración operativa será administrada por el tenant propietario en `settings/variables` y persistirá en `prospeccion_plantilla_ai_prompt_config`.

Como fallback técnico de bootstrap o recuperación se podrán definir:

```text
OPENAI_PROSPECCION_TEMPLATE_WHATSAPP_PROMPT_ID
OPENAI_PROSPECCION_TEMPLATE_WHATSAPP_PROMPT_VERSION
OPENAI_PROSPECCION_TEMPLATE_EMAIL_PROMPT_ID
OPENAI_PROSPECCION_TEMPLATE_EMAIL_PROMPT_VERSION
```

Estos valores de entorno no deben sobrescribir silenciosamente una configuración válida guardada desde `settings/variables`. La precedencia será:

1. Configuración activa de `prospeccion_plantilla_ai_prompt_config`.
2. Fallback de entorno únicamente si no existe configuración de base de datos.
3. Error controlado si no existe ninguna configuración.

El backend debe usar la integración centralizada existente para construir el cliente OpenAI.

La clave y el proyecto deben permanecer en backend o en el gestor de secretos. Nunca deben estar en variables públicas del frontend ni en respuestas del endpoint.

Los cambios de prompt deben seguir este flujo:

1. Crear o modificar una versión en el proyecto de OpenAI del dueño.
2. Probar con casos representativos.
3. Registrar la versión candidata.
4. Ejecutar pruebas de regresión.
5. Cambiar la configuración backend a la versión aprobada.
6. Monitorear errores, costos y calidad.

No se debe cambiar silenciosamente el prompt productivo sin registrar la versión utilizada.

## 11. Seguridad y operación

### Riesgos principales

#### Alto: fuga entre tenants

**Riesgo:** enviar contexto de una organización a otra o guardar la respuesta en una plantilla ajena.

**Control:** resolver organización, campaña y plantilla desde autenticación y verificar ownership en backend.

#### Alto: exposición de secretos

**Riesgo:** ejecutar OpenAI desde el navegador o devolver API keys.

**Control:** todas las llamadas pasan por backend; los secretos solo viven en configuración segura.

#### Medio: HTML inseguro

**Riesgo:** la IA produce scripts, enlaces peligrosos o contenido que se interpreta incorrectamente.

**Control:** sanitización backend, allowlist de tags y atributos, revisión de URLs y preview aislado.

#### Medio: abuso y costos inesperados

**Riesgo:** regeneraciones ilimitadas o uso automatizado del endpoint.

**Control:** rate limit, cuota por tenant/usuario, límite de tokens, botón de regeneración controlado y métricas de costo.

#### Medio: respuesta no compatible con Meta o correo

**Riesgo:** generar una plantilla que después no pueda aprobarse o enviarse.

**Control:** validadores específicos por canal, advertencias visibles y confirmación manual.

### Logs

Registrar únicamente:

- Organización interna.
- Usuario interno.
- Canal.
- Prompt y versión.
- Duración.
- Estado.
- Tokens y costo si están disponibles.
- Identificador técnico de solicitud.

No registrar:

- API keys.
- Headers de autorización.
- JWT.
- Payloads completos con datos personales.
- Respuestas completas de OpenAI sin necesidad operativa.

## 12. Métricas sugeridas

El sistema debería medir:

- Generaciones solicitadas.
- Generaciones exitosas.
- Errores del proveedor.
- Timeouts.
- Respuestas inválidas.
- Regeneraciones por usuario.
- Resultados aceptados por el usuario.
- Plantillas guardadas después de usar IA.
- Uso por canal.
- Tokens y costo por tenant.
- Versiones de prompt con mejor tasa de aceptación.

La métrica de generación no debe confundirse con envíos de WhatsApp, envíos de correo ni cobros de mensajería.

## 13. Fases de implementación

### Fase 0: definición y pruebas de prompts

- Crear los dos prompts en OpenAI.
- Definir sus variables de entrada.
- Definir el JSON de salida.
- Preparar casos de prueba de correo.
- Preparar casos de prueba de WhatsApp.
- Documentar ejemplos buenos y malos.

### Fase 1: configuración, catálogo y servicio backend

- Crear la tabla `prospeccion_plantilla_ai_prompt_config`.
- Agregar la sección de prompts de plantillas en `settings/variables`.
- Restringir lectura y escritura al tenant propietario en backend.
- Crear catálogo backend de variables.
- Crear schemas Pydantic.
- Crear servicio de generación.
- Integrar `prompt_id` y versión.
- Validar tenant, campaña y permisos.
- Implementar timeout, errores y rate limit.

### Fase 2: migraciones, endpoint y validadores

- Crear las tablas del catálogo, configuración, generaciones y relaciones de variables.
- Agregar foreign keys, constraints, índices y políticas RLS correspondientes.
- Crear `POST /api/prospeccion/templates/ai/generate`.
- Agregar validador de placeholders.
- Agregar validador de correo.
- Agregar validador de WhatsApp.
- Sanitizar HTML.
- Registrar uso y costo mínimo necesario.

### Fase 3: integración en los modales

- Agregar el panel del asistente al modal de correo.
- Agregar el panel del asistente al modal de WhatsApp.
- Cargar variables desde backend.
- Implementar estados de carga, error y resultado.
- Insertar resultado sin perder el borrador manual.
- Mostrar advertencias antes de guardar.

### Fase 4: auditoría y optimización

- Persistir generaciones si el negocio requiere historial.
- Agregar métricas de aceptación.
- Comparar versiones de prompt.
- Ajustar instrucciones con base en casos reales.
- Revisar costo por tenant y límites comerciales.

## 14. Criterios de aceptación

La funcionalidad podrá considerarse lista cuando:

- Existan dos prompts productivos separados.
- El usuario pueda seleccionar variables antes de generar.
- El asistente genere contenido específico para el canal.
- El backend rechace variables no permitidas.
- El resultado respete el tenant autenticado.
- El correo genere asunto, texto y HTML válidos.
- WhatsApp genere una propuesta sin afirmar aprobación de Meta.
- El usuario pueda editar antes de guardar.
- No se expongan secretos en frontend, respuestas o logs.
- Existan límites de uso y manejo de timeout.
- Se registre la versión del prompt utilizada.
- Existan pruebas backend para autorización, aislamiento, variables y respuesta inválida.
- Existan pruebas de UI para generación, error, regeneración y aceptación.
- Se valide el flujo autenticado real antes de declararlo terminado.

## 15. Pendientes antes de implementación

1. Confirmar los identificadores definitivos de los dos prompts.
2. Definir el modelo y límite de tokens por canal.
3. Confirmar si el costo será absorbido por la plataforma o trasladado al tenant.
4. Definir roles autorizados para generar y guardar plantillas.
5. Confirmar el catálogo definitivo de variables y sus canales compatibles.
6. Definir si se requiere historial completo de generaciones o solo auditoría resumida.
7. Definir la política de retención del contenido generado.
8. Confirmar si el HTML se guardará como cuerpo generado o si habrá una plantilla visual adicional.
9. Preparar casos de prueba para español, inglés, mensajes cortos y diferentes segmentos.
10. Probar la aprobación real de una plantilla de WhatsApp en Meta después de la generación.

## 16. Decisión arquitectónica final

La propuesta aprobada para continuar es:

```text
Dos prompts administrados en OpenAI
        ↓
Backend GEOACTIV autenticado
        ↓
Catálogo de variables y contexto del tenant
        ↓
Validación estructurada por canal
        ↓
Editor de plantilla en /prospeccion/campanas
        ↓
Confirmación manual y guardado
```

OpenAI centraliza la inteligencia editorial de cada canal. GEOACTIV conserva el control del contrato, los datos, los permisos, el tenant, la seguridad, la validación y la operación.
