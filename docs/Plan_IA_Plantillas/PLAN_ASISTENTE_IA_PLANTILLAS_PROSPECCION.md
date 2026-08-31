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

Esta regla aplica a los tres flujos de creación de correo: **Editor visual**,
**Código HTML** y **Asistente IA**. Ninguno debe mantener una lista propia ni
mostrar solamente un subconjunto de las variables disponibles.

El catálogo backend definirá para cada variable:

- Clave técnica.
- Etiqueta visible.
- Descripción.
- Canales compatibles.
- Si es texto, URL o recurso gráfico.
- Si puede aparecer en asunto, texto o HTML.
- Reglas de valor vacío.

El frontend cargará el catálogo completo recibido del backend. No debe mantener
una lista independiente que pueda quedar desactualizada.

Para correo, el catálogo actualmente disponible incluye:

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

La lista anterior debe resolverse dinámicamente desde el catálogo backend. Si se
agrega o habilita una variable nueva en backend, los tres flujos de correo deben
recibirla sin requerir una lista paralela escrita en el frontend.

#### Presentación para el usuario

La interfaz no mostrará claves técnicas, nombres de columnas, tipos de dato,
descripciones internas, etiquetas como “URL”, ni información adicional junto a
las variables. Cada opción deberá presentarse como un control simple, siguiendo
el estilo del HTML de referencia, por ejemplo:

```text
{{nombre}}  {{empresa}}  {{telefono}}  {{correo}}
```

Para las variables cuyo nombre técnico no sea entendible para el usuario, la UI
deberá utilizar un nombre visible en español y conservar la clave técnica
únicamente en backend. Por ejemplo, el usuario verá **Logo**, **Imagen principal**,
**Sitio web**, **Seguimiento**, **Agenda** o **Texto de agenda**; nunca verá
`logo_url`, `hero_image_url`, `tracking_url` o `booking_link_text` como etiquetas
de interfaz.

El valor técnico que se guarda en la plantilla seguirá siendo el placeholder
compatible con el motor actual, salvo que se implemente una tabla explícita de
alias. La traducción entre nombre visible y placeholder técnico será responsabilidad
del catálogo/backend, no del usuario.

No se mostrarán debajo de cada variable textos como “tipo_dato”, “texto”, “imagen”,
“URL pública” o descripciones técnicas. La ayuda contextual, si posteriormente se
necesita, deberá estar separada de la etiqueta y no formar parte del control
principal.

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

### 5.1 Modos de creación para plantillas de correo

Para simplificar la experiencia, el usuario no debe enfrentarse desde el inicio a
campos técnicos de HTML ni a un asistente que siempre esté visible. Al crear una
plantilla de **correo**, primero se mostrarán tres opciones de creación:

1. **Editor visual**.
2. **Código HTML**.
3. **Asistente IA**.

El término recomendado para la primera opción es **Editor visual** y no “texto
plano”. Aunque el usuario no escriba código, el resultado podrá contener imágenes,
botones, columnas, separadores y estilos; por lo tanto, se guardará como HTML.

#### Campos comunes

Antes de elegir el modo, el usuario podrá completar los datos comunes de la
plantilla:

- Nombre de la plantilla.
- Asunto.
- Tipo de correo: `Broadcast` o `Transactional`.
- Descripción opcional.

El asunto y el tipo de correo deben conservarse como datos explícitos y ser
independientes del modo elegido. El asunto será obligatorio para guardar una
plantilla de correo.

#### Opción 1: Editor visual

El editor visual permitirá construir el correo mediante bloques, sin mostrar HTML
al usuario. Como mínimo deberá permitir:

- Texto y títulos.
- Imágenes y logotipo.
- Botones y enlaces.
- Separadores.
- Espaciado.
- Columnas o bloques de beneficios.
- Variables insertables mediante controles visibles.
- Selector completo de todas las variables disponibles para correo, con nombres
  visibles en español y sin claves técnicas ni etiquetas adicionales.
- Selección de imágenes desde la galería del tenant.
- Vista previa de escritorio y móvil.
- Selección, edición, duplicado y eliminación de bloques.

##### Referencia visual obligatoria

El HTML completo proporcionado por el usuario quedó copiado en el archivo:

[`REFERENCIA_EDITOR_VISUAL.html`](./REFERENCIA_EDITOR_VISUAL.html)

Este archivo es la referencia visual y funcional aprobada del Editor visual. No se
considera una maqueta genérica: la pantalla debe conservar su lógica de composición
y jerarquía, adaptándola a los componentes React/Tailwind existentes sin cambiar el
flujo principal.

La implementación deberá respetar como mínimo:

- Barra superior con marca, nombre editable de la plantilla, estado de guardado,
  vista previa y guardar plantilla.
- Biblioteca lateral de bloques bajo **Agregar contenido**.
- Bloques de Texto, Imagen, Botón, Separador, Espacio y Columnas.
- Sección **Personalización** con variables simples en forma de chips.
- Lienzo central con el correo dentro de una tarjeta visual.
- Selección visible del bloque activo.
- Acciones del bloque para duplicar, reordenar y eliminar.
- Botones **Agregar bloque** entre secciones del correo.
- Selector de vista **Escritorio/Móvil**.
- Panel lateral de propiedades del bloque seleccionado.
- Edición de contenido, tamaño, alineación, color y espaciado.
- Barra inferior con **Enviar prueba** y **Ver en móvil**.

Los textos, colores de ejemplo, nombre de empresa, contenido inicial y bloques de
la muestra podrán reemplazarse por información del tenant o por un lienzo vacío.
La estructura de la pantalla, la distribución de columnas, la interacción de
selección y la jerarquía de acciones sí forman parte de la referencia aprobada.

El archivo se conserva como material de diseño asociado al plan y todavía no es
código productivo. Antes de implementar, cualquier diferencia respecto de esta
referencia deberá documentarse y aprobarse en el plan.

El editor será la fuente de edición visual y generará `cuerpo_html` compatible con
correo. Las variables deberán conservarse como placeholders, por ejemplo
`{{nombre}}` o `{{empresa}}`, hasta el momento del envío.

#### Opción 2: Código HTML

Esta opción estará dirigida a usuarios que necesiten control directo sobre el
marcado. Permitirá:

- Editar el HTML del correo.
- Insertar variables desde el catálogo oficial.
- Mostrar el mismo selector completo y legible de variables utilizado por el
  Editor visual; la clave técnica se insertará en el código sin exponerse como
  etiqueta de ayuda.
- Seleccionar e insertar imágenes de la galería.
- Ver una vista previa aislada.
- Validar y sanitizar el contenido antes de guardar.

No se permitirán scripts, eventos JavaScript, formularios, iframes, objetos,
esquemas de URL peligrosos ni etiquetas fuera de la lista autorizada por el
backend.

#### Opción 3: Asistente IA

El asistente será un flujo de creación, no un panel permanente junto a los otros
editores. Solicitará:

- Imágenes que se desean utilizar.
- Uso de cada imagen: logo, encabezado, producto, beneficio, garantía u otro uso
  permitido por el catálogo.
- Datos del prospecto que la plantilla puede utilizar.
- Estilo de diseño permitido para el tenant.
- Instrucción o prompt del usuario, después de seleccionar el estilo de diseño.

El orden visible del flujo será:

1. Seleccionar las imágenes.
2. Definir el uso de cada imagen.
3. Seleccionar los datos del prospecto.
4. Elegir el estilo de diseño.
5. Escribir el prompt o instrucción para el asistente.
6. Generar la plantilla.

La selección de datos del prospecto utilizará el catálogo completo de variables
disponibles para correo. Se mostrarán únicamente nombres legibles para el usuario,
sin claves técnicas, tipos, etiquetas internas ni textos adicionales.

El estilo de diseño debe estar seleccionado antes de escribir el prompt para que
el usuario conozca la composición que solicitará y el asistente pueda interpretar
la instrucción dentro de ese marco visual.

El asistente generará el nombre sugerido, asunto, texto, HTML, variables usadas,
estilo aplicado y advertencias. El resultado se cargará en un editor revisable y
el usuario deberá poder modificarlo antes de guardarlo.

Las imágenes seleccionadas por el usuario no se enviarán al modelo como datos
arbitrarios. El backend resolverá los recursos pertenecientes al tenant y el
modelo solo podrá utilizar variables de imagen autorizadas, como
`{{logo_url}}` o `{{product_image_1_url}}`.

#### Edición posterior

La plantilla debe recordar el modo con el que fue creada para abrir una interfaz
coherente al editarla. Se utilizará una columna explícita:

```text
email_creation_mode
```

con valores controlados:

```text
visual
html
ai
```

El modo describe la experiencia de edición y no cambia el contrato de envío:
una plantilla de correo podrá conservar `asunto`, `cuerpo_texto` cuando aplique y
`cuerpo_html` cuando aplique.

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
POST /crm/prospeccion/plantillas/ai/generate
```

El endpoint debe requerir autenticación y el permiso que actualmente protege la administración de plantillas de prospección. El panel lo consume mediante su BFF de Next.js; el navegador no llama directamente a OpenAI.

Catálogo utilizado por el selector:

```text
GET /crm/prospeccion/plantillas/ai/variables?canal=correo|whatsapp
```

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
  "borrador_actual": null
}
```

`contexto_empresa` y `sistema_diseno_empresa` son variables internas que el backend construye con la configuración del tenant autenticado; no deben aceptarse como fuente de verdad desde el navegador.

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

### 8.1 Contexto empresarial y sistema visual del tenant

Se agregará una configuración explícita por tenant para que la IA conozca la identidad comercial y visual de la empresa. Esta información no será escrita manualmente por el navegador dentro del prompt: el backend la resolverá desde la organización autenticada y la enviará a los dos prompts centrales.

#### Contexto empresarial

El tenant podrá capturar una explicación autorizada de su empresa, por ejemplo:

- Descripción general de la empresa.
- Productos o servicios principales.
- Público objetivo.
- Propuesta de valor.
- Diferenciadores.
- Sectores o segmentos atendidos.
- Palabras, afirmaciones o temas que deben evitarse.

Estos datos se persistirán como columnas explícitas:

- `descripcion_empresa` `text`.
- `productos_servicios` `text`.
- `publico_objetivo` `text`.
- `propuesta_valor` `text`.
- `diferenciadores` `text`.
- `restricciones_comerciales` `text`.

Este contenido se enviará al prompt mediante la variable técnica:

```text
{{contexto_empresa}}
```

Los datos básicos actuales de la organización —nombre, nombre comercial, sitio web, ciudad y estado— se conservarán como información complementaria. El nuevo contexto permitirá que el tenant explique su negocio con mayor precisión.

#### Sistema visual de marca

El tenant también podrá configurar su identidad visual para que el asistente genere diseños consistentes, especialmente en plantillas HTML de correo. La información importante se persistirá mediante columnas explícitas, no dentro de `metadata`, `jsonb`, `config` ni estructuras equivalentes.

Columnas propuestas:

- `color_primario` `text`.
- `color_secundario` `text`.
- `color_acento` `text`.
- `color_fondo` `text`.
- `estilo_visual` `text`.
- `radio_bordes` `text`.
- `logo_url` `text`.
- `actualizado_en` `timestamptz`.

El backend validará los colores como valores hexadecimales válidos y limitará la longitud de los textos. Se reutilizará el `logo_url` existente de la organización; su administración seguirá el flujo de identidad visual ya disponible en la plataforma.

La configuración visual se enviará al prompt mediante una variable técnica independiente:

```text
{{sistema_diseno_empresa}}
```

Aunque el valor se serialice como objeto para transportarlo a OpenAI, sus datos de negocio permanecerán almacenados en columnas consultables y auditables.

#### Fallback visual oficial de Tal-IA

Cuando el tenant no configure uno o más colores, el backend enviará al prompt la paleta neutral oficial de Tal-IA:

```text
Fondo exterior: #f4f6f8
Fondo principal: #ffffff
Texto principal: #111827
Texto secundario: #475569
Acento: #2563eb
Bordes: #e5e7eb
```

El prompt deberá indicar expresamente que estos colores son valores de diseño del sistema y no colores oficiales de la empresa. No se deben presentar como identidad de marca del tenant ni inventar colores adicionales cuando no exista configuración.

#### Reglas para los dos prompts

- `prospeccion_plantilla_correo` usará el contexto empresarial para el contenido y el sistema visual para estructura, colores, CTA, contraste y composición HTML.
- `prospeccion_plantilla_whatsapp` usará el contexto empresarial para tono, propuesta de valor y relevancia del mensaje; el sistema visual solo aplicará a los elementos compatibles con el canal.
- Las nuevas variables deberán declararse y publicarse en ambos prompts del dashboard de OpenAI.
- El backend deberá enviar siempre valores completos, aplicando fallback cuando falten colores.
- El usuario conservará la capacidad de editar el borrador antes de guardar.
- El asistente no podrá guardar, publicar, enviar mensajes ni modificar directamente la configuración del tenant.

### 8.2 Estilo de diseño y biblioteca de layouts

El sistema visual de marca y el estilo de diseño serán configuraciones diferentes:

- `{{sistema_diseno_empresa}}` define la identidad visual: colores, logotipo, radio de bordes y fallback de Tal-IA.
- `{{estilo_diseno}}` define la composición o layout que tendrá la plantilla.

En `settings/variables`, ambas configuraciones estarán agrupadas en la pestaña **Imagen empresarial**:

- **Contexto empresarial y sistema visual**.
- **Estilo de diseño**.

Dentro de **Estilo de diseño**, el usuario podrá elegir un estilo concreto o seleccionar **Automático**, para que el backend y el modelo determinen la composición más adecuada según la campaña, la instrucción, el tono y la cantidad de contenido.

#### Biblioteca inicial de layouts para correo

Tal-IA proporcionará una biblioteca inicial de estilos para plantillas HTML de correo. Estos estilos se clonarán como registros propios dentro de cada tenant:

- `editorial`: encabezado minimalista, título destacado, separador y bloques narrativos.
- `hero_card`: hero contrastante, beneficio principal en tarjeta y CTA inmediato.
- `minimal`: mucho espacio en blanco, pocos bloques y un CTA prominente.
- `dark_header`: encabezado oscuro, contenido claro y tarjeta central de beneficio.
- `feature_cards`: introducción breve y dos o tres tarjetas de beneficios apiladas.
- `problem_solution`: problema principal, solución diferenciada, beneficios y CTA.
- `product_showcase`: presentación visual de un producto o servicio con beneficios y CTA.
- `case_study`: situación, solución, resultado o evidencia autorizada y CTA.
- `personal_letter`: apariencia de correo personal premium, conversacional y con CTA discreto.
- `announcement`: anuncio destacado, mensaje principal, información complementaria y CTA.

Cada estilo debe tener una definición controlada de su estructura, jerarquía, cantidad de bloques, tratamiento de imágenes, CTA y compatibilidad con clientes de correo. El tenant podrá editar esas instrucciones, crear nuevos estilos y eliminar los que no necesite. El modelo no podrá inventar nombres ni estructuras fuera de los estilos habilitados del tenant.

#### Persistencia y configuración por tenant

Los estilos no se almacenarán como una lista dentro de `metadata`, `jsonb`, `config` o una columna genérica. Se implementó:

- La tabla `prospeccion_plantilla_ai_layouts` con `organizacion_id` y columnas explícitas para código, nombre, descripción, instrucciones, canal, orden, estado, habilitado y predeterminado.
- La biblioteca inicial se clonó para los siete tenants existentes y se agregó un trigger para crearla automáticamente en nuevos tenants.
- Un único estilo predeterminado de correo por tenant, cuando el tenant no utilice el modo automático.

El tenant podrá crear, editar, eliminar, habilitar, deshabilitar y definir el estilo predeterminado. El backend siempre filtrará los estilos por canal y por la organización autenticada.

#### Selección desde el creador

El creador de plantillas muestra un selector **Estilo de diseño** con estas opciones:

- `Automático`.
- Los estilos habilitados y personalizados del tenant.

La selección se enviará como `estilo_diseno`. Si el usuario elige `Automático`, el backend enviará al prompt los layouts habilitados y el modelo podrá seleccionar uno de ellos. Si el usuario elige un layout específico, el backend lo validará y solicitará ese layout al modelo.

El valor seleccionado o resuelto deberá conservarse en la respuesta estructurada y en la auditoría de generación:

```json
{
  "estilo_diseno": "hero_card"
}
```

La respuesta no debe contener un estilo no permitido. Si el modelo devuelve uno inválido, el backend debe rechazarlo; nunca debe guardarse silenciosamente como un estilo válido.

#### Instrucciones para el prompt de correo

El prompt debe incluir una sección específica de composición visual:

```text
SISTEMA DE COMPOSICIÓN VISUAL

Construye el correo usando exactamente un estilo de diseño permitido.

Layouts permitidos:
{{layouts_permitidos}}

Estilo de diseño solicitado:
{{estilo_diseno}}

Si el estilo solicitado es automático, selecciona únicamente uno de los layouts
permitidos según la intención de la campaña, el tono, la cantidad de contenido
y el sistema visual de marca.

Nunca inventes un layout fuera del catálogo.
```

La estructura visual debe combinarse con `{{sistema_diseno_empresa}}`: el layout define la composición y el sistema visual define la apariencia. El resultado debe seguir siendo HTML compatible con correo, responsive, accesible y editable antes de guardarse.

#### Alcance para WhatsApp

Los layouts HTML no se aplicarán directamente a WhatsApp. El prompt de WhatsApp podrá recibir `{{estilo_diseno}}` únicamente si se define un catálogo específico de estructuras conversacionales, como `directo`, `consultivo`, `seguimiento`, `presentacion`, `agenda` o `recuperacion`. No se deben enviar layouts visuales de correo al canal WhatsApp.

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
- `permite_header_media` `boolean` not null default `false`.
- `activo` `boolean` not null default `true`.

Restricciones e índices:

- Unique `(variable_id, canal)`.
- Foreign key index sobre `variable_id`.
- `canal` limitado a `correo` y `whatsapp`.
- Las variables de imagen de WhatsApp utilizan `permite_header_media` y no se fuerzan como texto.
- Índice compuesto `(canal, activo, variable_id)` para cargar el catálogo visible.

### 9.4 Historial de generaciones IA

```text
prospeccion_plantilla_ai_generaciones
```

La plantilla final de correo podrá conservar el modo de creación mediante la
columna explícita `email_creation_mode` en
`prospeccion_contacto_templates`. No se guardará dentro de `metadata` porque se
utilizará para seleccionar la interfaz de edición, validar el contenido y
auditar el flujo.

Cuando una generación IA utilice imágenes, la trazabilidad de esas selecciones
deberá modelarse mediante una relación explícita con la generación, por ejemplo
`prospeccion_plantilla_ai_generacion_imagenes`, con al menos:

- `generacion_id`.
- `logo_id`.
- `uso_imagen`.
- `variable_clave`.
- `orden`.

La relación de imágenes de la plantilla seguirá representando la asignación final
utilizada durante el envío. La relación de generación solo conservará qué pidió o
seleccionó el usuario durante la creación.

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
- Crear la configuración explícita de contexto empresarial y sistema visual por tenant.
- Agregar la pantalla de configuración de descripción empresarial, colores, estilo y logotipo.
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
- Validar colores, URL del logotipo, límites de texto y fallback visual oficial.
- Sanitizar HTML.
- Registrar uso y costo mínimo necesario.

### Fase 3: integración en los modales

- Agregar la selección inicial de los tres modos de creación de correo.
- Crear el editor visual por bloques, con imágenes, variables y vista previa.
- Tomar el HTML de referencia proporcionado por el usuario como contrato visual y
  funcional del Editor visual.
- Mantener la distribución barra superior, biblioteca lateral, lienzo central,
  inspector lateral y barra inferior definida en la referencia.
- Mantener un editor separado para código HTML.
- Reutilizar el catálogo completo de variables del backend en el Editor visual, el
  Código HTML y el Asistente IA.
- Presentar las variables con nombres legibles y controles simples, sin claves
  técnicas, tipos ni etiquetas adicionales.
- Convertir el resultado IA en un borrador editable desde el editor compatible.
- Guardar y recuperar `email_creation_mode`.
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
- El usuario pueda elegir entre Editor visual, Código HTML y Asistente IA para correo.
- El Editor visual permita agregar y editar texto, imágenes, variables, botones y bloques.
- El modo Código HTML valide y sanitice el contenido antes de guardarlo.
- El Asistente IA solicite imágenes, uso de imágenes, datos del prospecto, prompt y estilo.
- Los tres modos utilicen todas las variables de correo disponibles en el catálogo backend.
- Las variables se muestren con nombres entendibles, sin claves técnicas, tipos ni etiquetas adicionales.
- Una plantilla editada vuelva a abrirse en el modo de creación guardado.
- WhatsApp genere una propuesta sin afirmar aprobación de Meta.
- El usuario pueda editar antes de guardar.
- No se expongan secretos en frontend, respuestas o logs.
- Existan límites de uso y manejo de timeout.
- Se registre la versión del prompt utilizada.
- El contexto empresarial y el sistema visual se resolverán exclusivamente desde el tenant autenticado.
- Los colores faltantes utilizarán el fallback oficial de Tal-IA sin presentarlo como marca del tenant.
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
8. Definir el modelo de bloques del Editor visual y su conversión segura a `cuerpo_html`.
9. Confirmar si la generación IA devolverá solo HTML o también una estructura de bloques editable.
10. Preparar casos de prueba para español, inglés, mensajes cortos y diferentes segmentos.
11. Probar la aprobación real de una plantilla de WhatsApp en Meta después de la generación.

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
Selector de modo de creación
        ↓
Editor visual / Código HTML / Asistente IA
        ↓
Confirmación manual y guardado
```

OpenAI centraliza la inteligencia editorial de cada canal. GEOACTIV conserva el control del contrato, los datos, los permisos, el tenant, la seguridad, la validación y la operación.
