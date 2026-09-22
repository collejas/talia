# Plan de arquitectura y refactor de experiencia de usuario

**Proyecto:** Tal-IA  
**Estado:** Arquitectura funcional y UX aprobadas; lista para implementación  
**Fecha:** 2026-09-21  
**Alcance:** Búsqueda, Prospección y Marketing

## 1. Objetivo

Reorganizar la experiencia de Tal-IA para que represente el flujo comercial real:

```text
Búsqueda → Prospectos → Completar datos → Listas para contactar
→ Campaña → Mensaje → Revisar → Envío → Resultados → CRM
```

Principio rector de la experiencia:

```text
BUSCA → ELIGE → COMPLETA → AGRUPA → CONTACTA
→ REVISA → ENVÍA → MIDE → VENDE
```

La arquitectura interna conserva sus nombres técnicos, pero la interfaz debe hablar como una persona y representar acciones reconocibles para el usuario.

Cómo lo ve el usuario:

```text
BUSCA EMPRESAS
      ↓
ELIGE TUS PROSPECTOS
      ↓
COMPLETA SUS DATOS
      ↓
DECIDE A QUIÉN CONTACTAR
      ↓
ELIGE UNA CAMPAÑA
      ↓
ELIGE EL MENSAJE
      ↓
REVISA
      ↓
ENVÍA
      ↓
MIRA LOS RESULTADOS
      ↓
ATIENDE LAS OPORTUNIDADES
```

El refactor debe separar configuración, exploración y ejecución, sin perder las capacidades actuales de filtros, verificación, envíos, historial y métricas.

La prioridad es proteger el caso operativo más crítico: crear envíos correctos y no repetitivos a partir de audiencias dinámicas.

## 2. Decisiones cerradas

### 2.1 Módulos principales

```text
Búsqueda
  Buscar
  Mis búsquedas

Prospección
  Prospectos
  Listas para contactar
  Completar datos

Marketing
  Correo
  WhatsApp
  Voz

CRM
  Contactos
  Oportunidades
  Embudo
  Actividades

Agente IA
```

Subtítulos visibles:

- Búsqueda — `Encuentra empresas`.
- Prospección — `Prepara posibles clientes`.
- Marketing — `Contacta a tus prospectos`.
- CRM — `Da seguimiento y vende`.
- Agente IA — `Atiende automáticamente`.

### 2.2 Definición de objetos

| Objeto | Responsabilidad |
|---|---|
| Resultado de búsqueda | Empresa encontrada por una fuente antes de incorporarse a Prospección. |
| Prospecto | Registro operativo que forma parte de la base de prospección. |
| Segmento | Clasificación del prospecto, por ejemplo Inmobiliarias o Constructoras. |
| Audiencia | Definición dinámica de quién puede ser contactado bajo ciertas condiciones. |
| Actividad | Evento transversal relacionado con un prospecto. |
| Canal | Medio de comunicación: Correo, WhatsApp o Voz. |
| Campaña | Iniciativa comercial dentro de un canal. |
| Plantilla | Contenido o guion compatible con un canal. |
| Envío/Lote | Ejecución concreta de campaña + audiencia + plantilla + programación. |
| Destinatario de lote | Resultado individual de un prospecto dentro de un lote. |

### 2.3 Regla de ejecución

Una audiencia, una campaña o una plantilla nunca envía por sí sola.

Solo un lote/envío puede producir comunicaciones reales.

```text
Audiencia ───────┐
                 ├──→ Lote → Destinatarios → Resultados
Plantilla ───────┤
Campaña ─────────┤
Programación ────┘
```

La audiencia y la plantilla son insumos independientes del lote.

### 2.4 Regla de lenguaje de producto

El backend puede hablar de audiencias, lotes, batches, plantillas, carrier, preview, suppression, elegibilidad, idempotencia y versiones. La interfaz no debe exigir esos conceptos al usuario.

| Término técnico interno | Texto visible en la interfaz |
|---|---|
| Audiencia | Lista para contactar |
| Crear audiencia | Crear lista |
| Audiencia actual | Personas que cumplen estas reglas |
| Enriquecer | Completar datos |
| Carrier | Tipo de teléfono |
| Plantilla | Correo, mensaje o guion según el canal |
| Preview | Revisar antes de enviar o llamar |
| Elegibles | Pueden ser contactados |
| Omitidos | No serán contactados |
| Opt-out | Pidió no recibir mensajes |
| Suppression | Bloqueado para envíos |
| Lote / batch | Envío |
| Métricas | Resultados |
| Actividad | Historial |
| Historial de búsquedas | Mis búsquedas |
| Programación | Cuándo enviarlo |
| Canal compatible | Disponible para WhatsApp, Correo o Voz |
| Revalidación | Volver a revisar antes de enviar |
| Prospecto IDs | Nunca visible |
| Tenant / `organizacion_id` | Nunca visible |

Esta tabla es normativa para la UI. Los términos técnicos solo pueden aparecer en soporte, permisos, exportaciones técnicas o una sección explícita de detalles técnicos.

### 2.5 Estados visibles

Los estados internos no deben aparecer directamente en la interfaz:

| Estado interno | Texto visible |
|---|---|
| `draft` | Borrador |
| `scheduled` | Programado |
| `preparing` | Preparando |
| `running` | Enviando en Correo/WhatsApp; Llamando en Voz |
| `completed` | Terminado |
| `partially_completed` | Terminado con algunos errores |
| `failed` | No se pudo completar |
| `canceled` | Cancelado |
| `pending` | Pendiente |
| `sent` | Enviado en Correo/WhatsApp; Llamada realizada en Voz |
| `delivered` | Entregado |
| `read` | Leído |
| `replied` | Respondió |
| `suppressed` | Bloqueado para enviar o llamar |

Los nombres de los resultados también deben adaptarse al canal: `Correos enviados`, `Mensajes enviados` o `Llamadas realizadas`.

### 2.6 Reglas de experiencia

1. Cada pantalla responde una sola pregunta principal.
2. Cada pantalla tiene una acción principal visible.
3. Las funciones importantes muestran icono y palabra; nunca solo un icono.
4. Primero se muestran números y explicaciones; después las tablas detalladas.
5. Los filtros se leen como una oración, no como nombres de columnas.
6. La complejidad avanzada queda detrás de `Más opciones` o `Detalles técnicos`.
7. Mostrar como máximo tres o cuatro opciones principales por pantalla.
8. Una vista secundaria se abre desde el objeto al que pertenece; no necesita aparecer siempre en la navegación.
9. Usar verbos para las acciones: `Buscar`, `Completar`, `Contactar`, `Enviar` y `Revisar`.
10. Adaptar las palabras al canal: enviar un correo, enviar un WhatsApp o hacer una llamada.
11. Nunca pedir al usuario que comprenda la arquitectura para continuar; Tal-IA debe llevarlo naturalmente al siguiente paso.
12. Tal-IA nunca vuelve a preguntar algo que ya sabe; lo muestra como completado y continúa con lo que falta.

Las vistas `Resultados` de una búsqueda y `Historial` de un prospecto existen como vistas contextuales. No necesitan convertirse en botones permanentes de navegación.

### 2.7 Regla de nombres y compatibilidad

Los nombres humanos de la interfaz no implican renombrar tablas, columnas, relaciones ni contratos internos existentes.

```text
Base de datos / backend existente
        ↓
Regla de negocio o schema de respuesta
        ↓
Texto visible para el usuario
```

La implementación debe conservar los nombres actuales cuando ya cumplen su función. El cambio de UX será únicamente de presentación:

| Nombre interno | Texto visible |
|---|---|
| `lista_id` / `audiencia_id` | Lista para contactar |
| `carrier_type` | Tipo de teléfono |
| `envios_whatsapp_max = 0` | Nunca recibió WhatsApp |
| `opt_out` | Pidió no ser contactado |
| `plantilla_id` | Correo, mensaje o guion según canal |
| `marketing_envios_lotes` | Envíos |

No se deben crear migraciones de renombrado, tablas paralelas ni cambios masivos de columnas solo para hacer coincidir el backend con el lenguaje del frontend.

Si un nombre interno es ambiguo, primero se debe documentar su semántica o crear una regla/campo adicional explícito. No se debe reutilizar una columna para representar dos conceptos diferentes.

## 3. Estado actual que condiciona el refactor

La auditoría existente identificó estas condiciones:

- `prospectos/page.client.tsx` concentra filtros, tabla, grupos, vistas guardadas, verificación, scraping, edición, borrado, historial, auditoría, planner, campañas, plantillas, cuotas y conversiones.
- Google y GobMX repiten búsqueda, historial, resultados, selección, mapa y guardado de prospectos.
- GobMX reutiliza el mapa de resultados de Google mediante tipos adaptados; el mapa debe evolucionar a un componente neutral a la fuente.
- Los historiales cargan páginas sucesivas en el navegador; deben migrar a paginación, búsqueda y ordenamiento server-side.
- Ya existe una base de filtros de prospectos con estados de teléfono/email, tipo de teléfono, permisos, segmento y cantidad de envíos.
- Ya existen listas inteligentes con filtros guardados. Internamente pueden mantenerse como `listas` durante la migración, pero la UI debe llamarlas `Listas para contactar`.
- El backend ya puede resolver una lista dinámica al crear un envío mediante `lista_id` o filtros.
- Algunos flujos actuales todavía envían `prospecto_ids` desde el frontend; ese camino no debe ser la ruta principal para audiencias dinámicas.
- Los filtros actuales cubren `envios_whatsapp_max=0` y `envios_correo_max=0`, pero faltan filtros temporales explícitos para último WhatsApp, último correo y último contacto.
- La documentación de búsqueda y columnaización contiene estados contradictorios; antes de implementar migraciones se debe actualizar el estado real contra código, esquema y despliegue.

## 4. Contratos de vista

### 4.1 Búsqueda

### Buscar

**Pregunta que responde:** ¿Qué empresas quiero encontrar?

Responsabilidades:

- Recibir término, ubicación y filtros propios de la búsqueda.
- Permitir seleccionar fuente: Google, GobMX y futuras fuentes.
- Usar un workspace común y adaptadores por fuente.
- Crear una búsqueda identificable y consultar su estado.

No debe contener filtros operativos de envío ni lógica de campañas.

Acción principal:

```text
Buscar empresas
```

### Mis búsquedas

**Pregunta que responde:** ¿Qué búsquedas se han ejecutado?

Debe mostrar fuente, consulta, ubicación, fecha, estado, total y acciones `Ver resultados` y `Repetir`.

Requisitos:

- Paginación server-side.
- Búsqueda y ordenamiento server-side.
- No cargar todo el historial en el navegador.

### Resultados

**Pregunta que responde:** ¿Qué resultados quiero incorporar a Prospección?

Resultados es una vista contextual de una búsqueda. No aparece como botón permanente del menú principal; se abre después de ejecutar o volver a abrir una búsqueda desde `Mis búsquedas`.

Debe ofrecer:

- Tabla y mapa con modelo neutral a la fuente.
- Selección de resultados.
- Filtros propios de resultado.
- Acción `Agregar a mis prospectos`.
- Confirmación del total agregado y navegación a Prospectos.

No debe ejecutar campañas ni envíos.

### 4.2 Prospección → Prospectos

**Pregunta que responde:** ¿Qué prospectos tengo y cómo los preparo?

Responsabilidades:

- Explorar toda la base.
- Aplicar filtros libres.
- Revisar calidad y disponibilidad de datos.
- Seleccionar prospectos para acciones concretas, principalmente completar datos.
- Crear una lista para contactar a partir de las reglas aplicadas, nunca a partir de una fotografía de IDs seleccionados.
- Consultar información operativa sin convertir la vista en un centro de campañas.

La tabla debe conservar filtros útiles para:

- Empresa: tipo de empresa, ubicación, fuente, actividad económica y calificación de Google.
- Contacto: teléfono, email y sitio web.
- Validación: teléfono válido, tipo de teléfono, email válido, Tiene WhatsApp y Se le puede enviar WhatsApp.
- Historial: creación, datos completados y último contacto.
- Envíos: último WhatsApp, último correo, número de envíos y respuesta.
- CRM: estado comercial, cliente, oportunidad y perdido.

Acciones principales:

```text
Completar datos
Crear lista con estas reglas
```

Los checkboxes sirven para acciones concretas sobre prospectos seleccionados, como completar datos. No deben convertir silenciosamente una selección de IDs en una lista dinámica.

`Ver historial` aparece al abrir el detalle de un prospecto, dentro de su pestaña contextual `Historial`.

Si el producto necesita listas estáticas en el futuro, deben ser otro objeto visible y explícito, separado de las Listas para contactar.

### 4.3 Prospección → Listas para contactar

**Pregunta que responde:** ¿A quién quiero poder contactar bajo determinadas condiciones?

La interfaz debe explicar que aquí se guardan grupos de prospectos que cumplen ciertas reglas. El término técnico `audiencia` no debe ser necesario para operar esta pantalla.

#### Regla principal: lista = vista guardada de Prospectos

Una `Lista para contactar` no es un segmento reducido ni una lista de IDs congelados. Es una vista guardada de la base de `Prospectos` que conserva las reglas de filtrado para reutilizarlas en futuros contactos.

Debe existir paridad funcional entre los filtros de `Prospectos` y los filtros que pueden guardarse en una lista. El usuario debe poder:

```text
Filtrar Prospectos
        ↓
Revisar el resultado
        ↓
Guardar esas reglas como Lista para contactar
        ↓
Reutilizar la lista sin volver a filtrar manualmente
```

El modal de creación y edición de listas debe incluir todos los filtros que tengan sentido para decidir a quién contactar. No debe limitarse a tipo de empresa, teléfono válido y “nunca contactado”. Si un filtro existe en `Prospectos` y sirve para construir una selección comercial, debe poder guardarse en la lista y resolverse nuevamente server-side.

El canal se pregunta primero porque determina compatibilidad, lenguaje y reglas específicas, pero no debe ocultar los filtros generales. Elegir WhatsApp no debe impedir filtrar también por actividad económica, ubicación, calificación, campaña o tamaño de empresa.

#### Filtros que debe poder conservar una lista

Los filtros deben presentarse agrupados y con lenguaje humano:

- **Empresa y clasificación:** Segmento guardado, Actividad económica, Tipo de negocio, fuente, tamaño de empresa y calificación de Google.
- **Ubicación:** estado, municipio y demás campos geográficos disponibles en Prospectos.
- **Datos de contacto:** tiene teléfono, tiene correo, tiene sitio web, teléfono válido, correo válido, sitio web válido y relación entre correo y sitio web.
- **Tipo de teléfono:** móvil, fijo, teléfono por internet o desconocido, cuando el canal utilice teléfono.
- **Permisos y disponibilidad:** Tiene WhatsApp, Se le puede enviar WhatsApp, Se le puede llamar y estados de no contacto.
- **Historial de contacto:** número mínimo y máximo de correos, WhatsApps y llamadas; campaña; mensaje, correo o guion utilizado; respuestas y última actividad disponible.
- **Fechas:** fecha de creación, último contacto por canal y ventanas como “no contactado en los últimos N días”, cuando la fuente de datos lo permita.
- **CRM y operación:** etapa, estado comercial, cliente, oportunidad, perdido, datos completados y scraper, cuando esos filtros estén disponibles para Prospectos.

La lista debe distinguir tres conceptos que no pueden mezclarse:

```text
Segmento guardado
→ etiqueta comercial asignada al prospecto

Actividad económica
→ clasificación proveniente de DENUE u otra fuente empresarial

Tipo de negocio
→ clasificación proveniente de Google u otra fuente de búsqueda
```

Por ejemplo, una lista puede decir:

```text
Actividad económica = Consultorios de medicina general
Tipo de negocio = Doctor / médico
Estado = San Luis Potosí
WhatsApps anteriores = 2 o más
Calificación de Google = 4 o más
```

El campo visible no debe pedir al usuario que escriba libremente “doctores” si lo que se necesita es filtrar una clasificación real. Los valores deben provenir del catálogo o de los campos correspondientes de `Prospectos`, mostrando `Segmento guardado`, `Actividad económica` y `Tipo de negocio` como filtros separados.

La relación normativa entre los tres campos es:

| Campo visible | Dato interno actual | Fuente/semántica | Uso del filtro |
|---|---|---|---|
| Segmento guardado | `segmento` | Etiqueta comercial asignada manualmente al prospecto. | Coincidencia exacta contra uno o varios segmentos guardados. |
| Actividad económica (DENUE/SCIAN) | `actividad` | Actividad económica registrada por DENUE/SCIAN u otra fuente empresarial equivalente. | Coincidencia exacta contra una o varias actividades existentes. |
| Tipo de negocio (Google) | `google_primary_type_display_name` y `google_primary_type` | Clasificación principal proporcionada por Google. | Coincidencia contra el nombre visible o el identificador principal de Google. |

`Búsqueda de origen` es un filtro independiente: utiliza la consulta que originó el prospecto (`query_sort`/`busqueda_ref`) y no debe mezclarse con ninguno de los tres campos anteriores. La interfaz debe ofrecer valores reales del tenant mediante autocompletado; el backend debe aplicar la misma relación que se mostró al usuario.

Al crear una lista, la protección de permisos se determina automáticamente por el canal elegido. Para Correo y WhatsApp, la regla inicial es incluir únicamente personas que no tengan una baja activa para ese canal. Esta regla no requiere que el usuario configure manualmente un campo de opt-out y se vuelve a validar al preparar el contacto.

Los clasificadores también dependen de la fuente seleccionada:

- Google: tipo de negocio, nombre o texto de empresa y calificación de Google.
- GobMX/DENUE: actividad económica, clasificación SCIAN y tamaño/estrato de empresa.
- Sin fuente específica: se muestran inicialmente los grupos de Google y GobMX/DENUE para que el usuario conozca sus opciones; al elegir una fuente, se oculta el grupo incompatible y los catálogos comunes de origen se filtran por esa fuente.

La interfaz no debe mostrar un clasificador de Google como si fuera una actividad económica DENUE, ni mostrar tamaño/estrato GobMX para resultados de Google.

Listado:

```text
+ Crear lista

Inmobiliarias nuevas
842 prospectos
Revisada hace 2 min

✓ Tienen celular válido
✓ Tienen WhatsApp
✓ Se les puede enviar WhatsApp
✓ Nunca les hemos enviado WhatsApp
```

Acciones:

- Crear lista.
- Editar reglas.
- Duplicar.
- Activar o desactivar.
- Ver prospectos.
- Contactar esta lista.
- Archivar si la política del producto lo permite.

Detalle:

```text
[ Resumen ] [ Reglas ] [ Prospectos ]
```

La lista no contacta directamente desde Prospección sin elegir canal. Su CTA es:

```text
Contactar esta lista →
```

Después de pulsarlo, Tal-IA debe preguntar:

```text
¿CÓMO QUIERES CONTACTARLOS?
```

Debe mostrar únicamente los canales compatibles con esta lista.

Si solo existe un canal compatible, Tal-IA no debe hacer la pregunta: debe continuar directamente con ese canal. Por ejemplo, una lista con `Tiene WhatsApp` y `Nunca recibió WhatsApp` puede llevar directamente al flujo de WhatsApp.

El usuario no necesita entrar manualmente al módulo Marketing para continuar.

La creación debe comenzar preguntando el canal de contacto. El canal elegido determina el lenguaje, la compatibilidad y las reglas específicas del canal, pero los filtros generales permanecen disponibles:

```text
¿CÓMO QUIERES CONTACTAR A ESTOS PROSPECTOS?

[ Correo ] [ WhatsApp ] [ Voz ]
```

Después se muestran primero las reglas generales y después las reglas aplicables al canal seleccionado:

- **Correo:** correo válido, número de correos anteriores, último correo y permiso para contactar.
- **WhatsApp:** teléfono válido, móvil, Tiene WhatsApp, Se le puede enviar WhatsApp, número de WhatsApps anteriores y último WhatsApp.
- **Voz:** teléfono válido, tipo de teléfono, permiso para llamadas, número de llamadas anteriores y última llamada.

Los filtros de historial deben permitir como mínimo:

```text
Nunca contactado
Ya contactado
Dos o menos contactos
Dos o más contactos
Exactamente dos contactos
No contactado en los últimos [ N ] días
Último contacto antes de [ fecha ]
```

La lista debe guardar las reglas, no los IDs que coincidieron en ese momento. La cantidad mostrada es informativa y debe recalcularse cuando se abre la lista, cuando se revisa un envío y cuando se confirma el contacto.

La creación debe usar un constructor de reglas legible y siempre guardar las reglas, no los IDs que coincidieron en ese momento:

```text
REGLAS DE ESTA LISTA

Quiero encontrar prospectos que...

sean          [ Inmobiliarias                 ]
y estén en    [ San Luis Potosí               ]
y tengan      [ Celular válido                ]
y tengan      [ Tipo móvil                    ]
y             [ Se les pueda enviar WhatsApp ]
y             [ Nunca recibieron WhatsApp    ]

[ + Agregar otra regla ]

842 prospectos cumplen estas reglas

[ Ver prospectos ]       [ Guardar lista ]
```

La tarjeta debe distinguir entre:

```text
842 prospectos cumplen estas reglas
```

y la cantidad que puede contactarse en un momento concreto. Cumplir las reglas no garantiza que todos recibirán un mensaje; la elegibilidad se vuelve a revisar al contactar.

El usuario no debe ver nombres como `lookup_status`, `carrier_type`, `envios_whatsapp_max` u `opt_out`.

Las reglas deben expresarse como:

```text
Debe cumplir todas estas reglas
```

Cuando se necesite una alternativa:

```text
Puede cumplir cualquiera de estas
```

Los operadores técnicos `AND`, `OR` e `IN` quedan ocultos.

### Compatibilidad con canales

Las listas nuevas se crean orientadas a un canal. Las listas históricas que no tengan reglas específicas de canal deben conservarse y tratarse como genéricas durante la transición:

- **Genérica:** sus reglas no dependen de un canal específico y puede utilizarse en Correo, WhatsApp o Voz.
- **Orientada a un canal:** sus reglas contienen condiciones específicas de un canal y solo puede utilizarse donde esas condiciones tengan sentido.

Ejemplo de lista orientada a WhatsApp:

```text
Tiene WhatsApp = Sí
Se le puede enviar WhatsApp = Sí
Nunca recibió WhatsApp = Sí
```

Al contactar esta lista, Tal-IA solo debe ofrecer WhatsApp. El backend debe calcular esta compatibilidad y el frontend solo representarla; no debe depender de que el usuario la seleccione correctamente.

Ejemplo de definición:

```text
Segmento = Inmobiliarias
Teléfono verificado = Sí
Tipo de teléfono = Móvil
Tiene WhatsApp = Sí
Se le puede enviar WhatsApp = Sí
Pidió no recibir mensajes = No
Último WhatsApp = Nunca
```

Una lista puede usar múltiples segmentos, actividades económicas, tipos de negocio, ubicaciones y filtros temporales. Los operadores técnicos no se muestran.

La interfaz debe distinguir siempre:

- `Tiene WhatsApp`: el número parece estar técnicamente asociado con WhatsApp.
- `Se le puede enviar WhatsApp`: el prospecto tiene permiso comercial/legal y no está bloqueado para ese canal.

El contrato backend debe documentar cuál columna o regla representa cada concepto. `whatsapp_permitido` no puede quedar ambiguo.

### 4.4 Prospección → Completar datos

**Pregunta que responde:** ¿Qué datos faltan o deben validarse?

Título visible:

```text
COMPLETAR DATOS
```

Opciones principales:

```text
COMPLETAR DATOS

¿Qué quieres completar?

📱 Teléfonos
Revisar teléfonos y saber si son móviles o fijos
[ Revisar ]

✉ Correos
Buscar y revisar correos
[ Completar ]

🌐 Sitios web
Buscar y revisar sitios web
[ Completar ]

✨ Todo
Completar todos los datos disponibles
[ Completar ]
```

Debe separar:

- Verificación de teléfono.
- Tipo de teléfono: móvil, fijo, teléfono por Internet o desconocido.
- Búsqueda y verificación de email.
- Búsqueda de sitio web.
- Extracción de información web.

La ejecución debe mostrar progreso, resultados, errores y posibilidad de volver a Prospectos. La palabra `enriquecimiento` queda reservada para documentación interna.

No debe crear campañas ni cambiar silenciosamente las condiciones de las listas para contactar.

### 4.5 Historial del prospecto (vista contextual)

**Pregunta que responde:** ¿Qué ha ocurrido con este prospecto?

Debe ser una línea de tiempo transversal, no otra pantalla de envíos. En la interfaz se llama `Historial` y se abre desde el detalle de un prospecto; no aparece como botón principal de Prospección.

Ejemplo:

```text
Inmobiliaria ABC

[ Datos ] [ Historial ]

Hoy
✓ WhatsApp enviado

Ayer
✓ Teléfono revisado

18 Sep
✓ Agregado a Prospectos
```

Eventos posibles:

- Prospecto creado.
- Teléfono verificado.
- Email encontrado o validado.
- Agregado a una lista para contactar.
- WhatsApp enviado.
- Email enviado.
- Llamada realizada.
- Respondió.
- Convertido en contacto.
- Convertido en oportunidad.

Marketing conserva el detalle de campañas, envíos y resultados. Historial muestra el efecto sobre el prospecto.

### 4.6 Marketing → Canal

La entrada de Marketing debe mostrar los canales como primer nivel:

```text
Correo
WhatsApp
Voz
```

No se deben mezclar campañas de distintos canales en una misma pantalla operativa.

Dentro de cada canal:

```text
[ Campañas ] [ Resultados ]
```

El canal debe filtrar plantillas, configuraciones, métricas y estados válidos.

El lenguaje debe adaptarse al canal:

| Concepto | Correo | WhatsApp | Voz |
|---|---|---|---|
| Contenido | Correo | Mensaje | Guion |
| Acción | Enviar | Enviar | Llamar |
| Resultado | Correos enviados | Mensajes enviados | Llamadas realizadas |
| Acción final | Enviar a 817 | Enviar a 817 | Llamar a 817 |

La arquitectura técnica puede ser común, pero la interfaz debe usar la palabra natural de cada canal.

### 4.7 Marketing → Campañas

**Pregunta que responde:** ¿Qué iniciativa comercial estoy gestionando?

Listado por canal:

```text
Tal-IA Inmobiliarias
4 mensajes · 8 envíos
Último envío: 21 Sep
```

La tarjeta usa el lenguaje del canal actual. En Correo mostraría `4 correos`; en WhatsApp, `4 mensajes`; y en Voz, `4 guiones · 8 llamadas`.

Una campaña no representa una ejecución individual.

Detalle:

```text
Correo:   [ Resumen ] [ Correos ] [ Envíos ] [ Resultados ]
WhatsApp: [ Resumen ] [ Mensajes ] [ Envíos ] [ Resultados ]
Voz:      [ Resumen ] [ Guiones ] [ Llamadas ] [ Resultados ]
```

Las pestañas deben mostrar solo el lenguaje del canal actual. En Voz, `Llamadas` reemplaza completamente a `Envíos` como etiqueta visible.

Resumen mínimo:

- Canal.
- Contenido activo del canal.
- Correo: correos enviados.
- WhatsApp: mensajes enviados.
- Voz: llamadas realizadas.
- Prospectos contactados.
- Respuestas.
- Oportunidades.
- Ventas, si existe la atribución correspondiente.

Acción principal según el canal:

```text
Correo: + Crear envío
WhatsApp: + Crear envío
Voz: + Crear llamadas
```

### 4.8 Campaña → Contenido del canal

El nombre visible depende del canal. Internamente todos siguen siendo plantillas.

| Canal | Nombre visible |
|---|---|
| Correo | Correos |
| WhatsApp | Mensajes |
| Voz | Guiones |

Texto de ayuda:

```text
Correo: Estos son los correos que puedes usar en esta campaña.
WhatsApp: Estos son los mensajes que puedes usar en esta campaña.
Voz: Estos son los guiones que puedes usar en esta campaña.
```

Acciones:

- Crear.
- Editar.
- Duplicar.
- Activar/desactivar.
- Ver historial de cambios.
- Validar compatibilidad del canal.

Correo, WhatsApp y Voz tendrán editores y validaciones diferentes. Los botones y títulos deben usar el nombre del canal, por ejemplo `+ Nuevo correo`, `+ Nuevo mensaje` o `+ Nuevo guion`.

Una plantilla puede ser reutilizable. La asociación con una campaña no debe impedir que se use en otra campaña compatible.

### 4.9 Campaña → Envíos

Debe mostrar cada ejecución con:

- Fecha de creación y programación.
- Correo, mensaje o guion, según el canal.
- Lista para contactar y versión interna de la lista.
- Cantidades calculadas.
- Estado del envío.
- Resultados parciales o finales.

Acciones condicionadas por estado:

- Ver detalle.
- Cancelar si aún es cancelable.
- Reintentar solo los fallidos si el canal lo permite.
- Duplicar configuración para crear un nuevo envío, nunca reactivar silenciosamente el lote anterior.

### 4.10 Campaña → Resultados

La analítica debe permitir bajar por niveles:

```text
Canal → Campaña → Mensaje → Lista para contactar → Envío
```

En la interfaz se muestra como `Canal → Campaña → Mensaje/Correo/Guion → Lista para contactar → Envío`, según el canal.

No se deben mezclar los cálculos de revisión con envíos aceptados por el proveedor.

Separar al menos:

Correo:

```text
Correos enviados → Entregados → Abiertos → Respondieron
```

WhatsApp:

```text
Mensajes enviados → Entregados → Leídos → Respondieron
```

Voz:

```text
Llamadas realizadas → Contestadas → No contestadas → Interesados
```

Las métricas de Voz quedan condicionadas a lo que finalmente soporte el proveedor. No se deben mostrar etapas que no existan realmente.

En todos los canales también deben poder consultarse las personas que no recibieron el contacto, las oportunidades y las ventas atribuidas cuando exista esa información.

### 4.11 Crear envío

Existen dos entradas al mismo asistente:

#### Desde una campaña

La campaña y el canal ya están definidos:

```text
Canal + Campaña → ¿A quién? → ¿Qué contenido? → ¿Cuándo? → Revisar
```

#### Desde una lista para contactar

La lista ya está definida:

```text
Lista → ¿Cómo quieres contactar? → ¿Qué campaña? → ¿Qué contenido?
→ ¿Cuándo? → Revisar
```

Después de seleccionar Correo, WhatsApp o Voz, el usuario puede elegir una campaña existente o crear una nueva sin perder la lista seleccionada.

El paso contextual completa lo que falta:

- Desde una campaña ya existen Canal + Campaña.
- Desde una lista se elige primero el Canal y después la Campaña.

Después, ambas entradas usan el mismo asistente central de cuatro pasos:

```text
1. ¿A quién?
2. ¿Qué contenido?
3. ¿Cuándo?
4. Revisar
```

El asistente conserva los cuatro pasos, pero no obliga a repetir información. Si el flujo comenzó desde una lista, `¿A quién?` aparece como completado con esa lista y Tal-IA lleva al usuario directamente a elegir el contenido. Si comenzó desde una campaña, Canal y Campaña aparecen como contexto ya conocido y el primer dato que falta es la lista.

### Paso 1: ¿A quién?

Mostrar listas para contactar activas compatibles con el canal y su cantidad actual.

Este paso se muestra solo cuando la lista todavía no está definida. Si el flujo comenzó desde una lista, se muestra como completado:

```text
✓ Lista: Inmobiliarias nuevas
842 prospectos
```

Texto visible:

```text
¿A QUIÉN QUIERES CONTACTAR?
Elige una de tus listas.
```

Cada opción debe mostrar nombre y cantidad de prospectos.

Debe permitir crear una nueva lista sin abandonar el flujo.

### Paso 2: ¿Qué contenido?

Mostrar el nombre visible según el canal y únicamente contenido compatible y disponible para uso:

- Correo: `¿Qué correo quieres enviar?`
- WhatsApp: `¿Qué mensaje quieres enviar?`
- Voz: `¿Qué guion quieres usar?`

La opción debe mostrar una vista previa real del contenido, no solo su nombre.

El título visible se adapta al canal:

```text
Correo: ¿QUÉ CORREO QUIERES ENVIAR?
WhatsApp: ¿QUÉ MENSAJE QUIERES ENVIAR?
Voz: ¿QUÉ GUION QUIERES USAR?
```

### Paso 3: ¿Cuándo?

Opciones mínimas:

- Ahora.
- Más tarde, con fecha y hora.
- `Más opciones`, para configuraciones avanzadas del canal.

Dentro de `Más opciones`:

```text
Máximo de personas
[ 500 ]

Correo/WhatsApp: Tiempo entre mensajes
[ 8 segundos ]

Voz: Tiempo entre llamadas
[ 8 segundos ]
```

Los límites, ritmo y configuraciones avanzadas no deben ocupar la pantalla principal del asistente.

### Paso 4: Revisar antes de enviar o llamar

Mostrar:

```text
REVISAR ENVÍO

WhatsApp
Tal-IA Inmobiliarias

Lista: Inmobiliarias nuevas
Mensaje: Primer contacto
Envío: Ahora

842 prospectos están en esta lista
817 pueden recibir este mensaje ahora
25 no recibirán el mensaje
```

El título, la información temporal y los textos se adaptan al canal:

```text
Correo:
REVISAR ENVÍO
817 pueden recibir este correo ahora
25 no recibirán el correo

WhatsApp:
REVISAR ENVÍO
817 pueden recibir este mensaje ahora
25 no recibirán el mensaje

Voz:
REVISAR LLAMADAS
Llamadas: Ahora
817 pueden ser llamados ahora
25 no serán llamados
```

Texto visible para el desglose, adaptado al canal:

```text
Correo: 25 NO RECIBIRÁN EL CORREO
WhatsApp: 25 NO RECIBIRÁN EL MENSAJE
Voz: 25 NO SERÁN LLAMADOS
```

Motivos visibles:

- Ya fueron contactados recientemente.
- No tienen un medio de contacto válido.
- Pidieron no ser contactados.
- No pueden ser contactados por este canal.
- Están bloqueados para este canal.
- Aparecen más de una vez.
- Se alcanzó el límite permitido.

El botón debe expresar el resultado final y adaptarse al canal:

```text
Correo/WhatsApp: Enviar a 817 personas
Voz: Llamar a 817 personas
```

La interfaz no debe mostrar `preview`, `opt_out`, `suppression`, `medio_invalido` ni otros códigos internos. Esos códigos pueden conservarse en la respuesta API y mostrarse únicamente en detalles técnicos autorizados.

El backend debe repetir la resolución y la elegibilidad al confirmar. Nunca se deben reutilizar ciegamente los IDs del preview.

## 5. Contrato técnico de ejecución

### 5.1 Flujo obligatorio

```text
POST preview
  → resolver audiencia actual
  → aplicar elegibilidad del canal
  → devolver conteos y razones

POST create/send
  → resolver audiencia otra vez
  → aplicar elegibilidad otra vez
  → conservar la versión histórica de las reglas utilizadas, si esa capacidad no existe actualmente
  → crear lote
  → crear destinatarios reales
  → iniciar o programar ejecución
```

### 5.2 Reglas de elegibilidad

La elegibilidad final debe validar en backend:

- Tenant/organización del usuario.
- Audiencia activa y accesible.
- Canal compatible.
- Plantilla activa y compatible.
- Medio válido.
- Permiso de contacto.
- Opt-out y suppression.
- Historial del mismo canal.
- Reglas de recontacto.
- Duplicados dentro del lote.
- Cuotas y límites del tenant.
- Estado CRM que excluya clientes, perdidos u otros estados configurados.

### 5.3 Reintentos e idempotencia

Crear envío debe aceptar una clave de idempotencia para evitar lotes duplicados cuando el usuario reintente una solicitud o el navegador pierda conexión.

El worker/proveedor debe poder reintentar eventos sin duplicar destinatarios ni mensajes.

### 5.4 Concurrencia y no duplicación

La idempotencia de la solicitud no es suficiente para proteger dos workers que procesen simultáneamente el mismo envío o destinatario.

La implementación debe incluir:

- Restricción única sobre el envío, prospecto y canal, o equivalente lógico que impida duplicados.
- Transición atómica de `pending` a `processing`/equivalente mediante claim seguro.
- Lease, timeout o recuperación de registros abandonados por un worker detenido.
- Revisión de estado antes de llamar al proveedor.
- Persistencia idempotente de la respuesta del proveedor y de sus webhooks.
- Pruebas concurrentes con dos workers intentando procesar el mismo destinatario.

No debe existir un camino en el que dos procesos puedan enviar el mismo contacto solo porque ambos leyeron `pending` antes de actualizarlo.

### 5.5 Observabilidad y trazabilidad

Cada comunicación debe poder seguirse de extremo a extremo sin exponer secretos ni payloads sensibles innecesarios:

```text
envío → destinatario → proveedor → provider_message_id
→ webhook → estado final
```

El sistema debe permitir responder qué ocurrió con un destinatario concreto y conservar, como mínimo:

- Identificador interno del envío.
- Prospecto y canal.
- Proveedor utilizado.
- Identificador externo del proveedor, cuando exista.
- Fechas de preparación, intento, aceptación, entrega, lectura, respuesta o fallo.
- Código y motivo normalizado del fallo.
- Referencia al evento/webhook procesado.

La observabilidad debe respetar tenant isolation y no registrar tokens, credenciales, headers de autorización, cuerpos completos sensibles ni datos personales innecesarios.

### 5.6 Activación progresiva

El nuevo flujo debe poder activarse gradualmente mediante feature flags por organización o módulo.

Flag inicial sugerido:

```text
marketing_send_wizard_v2
```

Estrategia:

1. Activarlo en el tenant interno Tal-IA.
2. Validarlo con un cliente controlado.
3. Ampliarlo progresivamente.
4. Mantener rollback al flujo actual mientras existan riesgos abiertos.

La activación debe estar protegida en backend; ocultar un botón en frontend no constituye control suficiente.

## 6. Contratos API y compatibilidad

Los contratos deben reutilizar inicialmente los endpoints actuales de listas, campañas, plantillas y envíos. El usuario no ve las URLs, por lo que no existe valor en crear rutas nuevas únicamente para reflejar el nombre `Lista para contactar`.

### Listas para contactar

Usar las rutas actuales de listas para:

```text
listar
crear
consultar
editar reglas
duplicar
activar o desactivar
calcular prospectos actuales
```

La ruta concreta y sus nombres de campos deben confirmarse en F0 contra el backend actual. No se debe crear inicialmente una familia `/api/crm/prospeccion/audiencias` si las rutas existentes de listas cubren estas operaciones.

Si en el futuro una integración externa necesita un contrato con nombre `audiencias`, podrá agregarse como alias o fachada compatible, pero no será requisito del refactor de UX.

### Canales y campañas

```text
GET    /api/marketing/canales
GET    /api/marketing/{canal}/campanas
POST   /api/marketing/{canal}/campanas
GET    /api/marketing/{canal}/campanas/{campana_id}
PATCH  /api/marketing/{canal}/campanas/{campana_id}
```

### Plantillas

```text
GET    /api/marketing/{canal}/plantillas
POST   /api/marketing/{canal}/plantillas
GET    /api/marketing/{canal}/plantillas/{plantilla_id}
PATCH  /api/marketing/{canal}/plantillas/{plantilla_id}
POST   /api/marketing/{canal}/plantillas/{plantilla_id}/duplicar
```

### Envíos/lotes

```text
POST   /api/marketing/{canal}/campanas/{campana_id}/envios/preview
POST   /api/marketing/{canal}/campanas/{campana_id}/envios
GET    /api/marketing/{canal}/campanas/{campana_id}/envios
GET    /api/marketing/{canal}/envios/{envio_id}
POST   /api/marketing/{canal}/envios/{envio_id}/cancelar
POST   /api/marketing/{canal}/envios/{envio_id}/reintentar-fallidos
```

### Forma conceptual del preview

```json
{
  "lista_id": "uuid",
  "plantilla_id": "uuid",
  "cantidad_audiencia": 842,
  "cantidad_elegibles": 817,
  "cantidad_omitidos": 25,
  "omisiones": [
    {"codigo": "ya_contactado", "cantidad": 11},
    {"codigo": "medio_invalido", "cantidad": 6},
    {"codigo": "opt_out", "cantidad": 4}
  ],
  "preview_token": "opcional_temporal"
}
```

El preview no autoriza por sí mismo el envío.

## 7. Modelo conceptual y datos requeridos

Las siguientes entidades representan responsabilidades conceptuales. Primero deben mapearse contra las tablas, columnas y relaciones existentes. No implican crear tablas nuevas ni renombrar las actuales.

Solo se crearán estructuras adicionales cuando una capacidad requerida no exista actualmente y no pueda resolverse reutilizando el modelo disponible.

### Mapeo conceptual a persistencia

| Concepto | Persistencia inicial esperada |
|---|---|
| Audiencia | Lista existente o equivalente |
| Versión de audiencia | Estructura existente o nueva si hace falta conservar reglas históricas |
| Campaña | Campaña existente |
| Plantilla | Plantilla existente |
| Relación campaña-plantilla | Relación existente o nueva si la reutilización lo requiere |
| Envío/Lote | Batch o envío existente |
| Destinatario | Detalle de envío existente |
| Actividad | Historial o eventos existentes |
| Canal | Catálogo, enum o campo existente |

### Relaciones conceptuales

```text
Lista existente 1 ─── N versiones, si se requiere versionado
Campaña          1 ─── N envíos/lotes
Plantilla        N ─── N campañas, si se permite reutilización
Envío/lote       N ─── 1 versión de lista
Envío/lote       N ─── 1 plantilla
Envío/lote       1 ─── N destinatarios
Destinatario     N ─── 1 prospecto
```

Estas relaciones describen lo que el sistema debe poder representar, no nombres obligatorios de tablas.

### Datos que el envío/lote debe poder representar

Como mínimo:

```text
id
organizacion_id
campana_id
plantilla_id
lista_id o equivalente existente
version de las reglas, si existe
canal
estado
programado_para
iniciado_en
finalizado_en
cantidad_audiencia
cantidad_elegibles
cantidad_omitidos
cantidad_aceptados
cantidad_entregados
cantidad_respondidos
creado_por
creado_en
actualizado_en
```

Durante F0 se determinará qué columnas actuales representan cada dato, cuáles tienen otro nombre y cuáles verdaderamente faltan.

Regla de implementación:

```text
Si la capacidad ya existe:       REUTILIZARLA.
Si existe con otro nombre:       MAPEARLA.
Si realmente no existe:          CREARLA.
```

Esta regla aplica a tablas, columnas, relaciones, endpoints y servicios.

### Snapshot y versionado

Los datos usados para reportes, filtros y estados deben ser columnas explícitas.

La definición histórica de una lista debe conservarse con una versión inmutable si el modelo actual no puede responder qué reglas se utilizaron en un envío anterior. Un snapshot estructurado puede almacenarse únicamente como apoyo de auditoría y reconstrucción visual, con estas condiciones:

- No ser la fuente principal de filtros operativos.
- No sustituir columnas consultadas frecuentemente.
- Tener relación con el lote y la versión concreta.
- Mantenerse inmutable después de crear el lote.

Crear una versión histórica sí puede justificar una migración o estructura adicional cuando esa capacidad no exista. El motivo sería conservar la historia de las reglas, no cambiar el nombre de `lista` a `audiencia`.

### Estados del lote

```text
draft
scheduled
preparing
running
completed
partially_completed
failed
canceled
```

### Estados del destinatario

```text
pending
sent
delivered
read
replied
failed
suppressed
```

Los estados disponibles pueden variar por canal, pero no se deben mezclar estados del lote con estados individuales.

## 8. Filtros temporales requeridos

Los siguientes datos deben ser consultables sin depender de JSON:

- `ultimo_whatsapp_enviado_en`.
- `ultimo_correo_enviado_en`.
- `ultima_llamada_en`.
- `ultima_actividad_en`.
- Contadores por canal, si no existe una fuente agregada confiable.

Filtros mínimos:

```text
Nunca enviado
Enviado alguna vez
No enviado en los últimos N días
Último envío antes de una fecha
Último envío después de una fecha
Respondió / no respondió
```

La consulta debe tener índices adecuados y respetar siempre `organizacion_id`.

## 9. Refactor frontend

### 9.1 Principio

No dividir `prospectos/page.client.tsx` únicamente por tamaño. Cada extracción debe corresponder a una responsabilidad de producto.

### 9.2 Componentes objetivo

```text
prospeccion/
  prospectos/
    prospectos-workspace.tsx
    prospectos-table.tsx
    prospectos-filters.tsx
    prospectos-selection-actions.tsx
    prospectos-columns.tsx
  audiencias/
    audiencias-list.tsx
    audiencia-editor.tsx
    audiencia-detail.tsx
    audiencia-preview.tsx
  enriquecer/
    enrichment-workspace.tsx
  actividad/
    prospecto-activity-timeline.tsx

marketing/
  channel-workspace.tsx
  campaign-list.tsx
  campaign-detail.tsx
  campaign-templates.tsx
  campaign-sends.tsx
  campaign-metrics.tsx
  send-wizard/
    send-wizard.tsx
    send-audience-step.tsx
    send-template-step.tsx
    send-schedule-step.tsx
    send-review-step.tsx
```

Los nombres deben adaptarse a las convenciones ya existentes del panel.

### 9.3 Estado de UI obligatorio

Cada vista debe contemplar:

- Carga inicial.
- Carga parcial o actualización de conteo.
- Vacío sin registros.
- Error recuperable.
- Error de permisos.
- Guardado exitoso.
- Operación en progreso.
- Confirmación de acción irreversible o costosa.

## 10. Refactor backend

Separar progresivamente:

```text
routes
  → schemas
  → services
  → repositories
  → proveedores/colas
```

Servicios objetivo:

- `audience_service`: CRUD, versiones y resolución dinámica.
- `eligibility_service`: reglas finales por canal.
- `campaign_service`: campañas y relación con plantillas.
- `template_service`: plantillas por canal.
- `send_preview_service`: conteos y razones de omisión.
- `send_batch_service`: revalidación, creación de lote y destinatarios.
- `activity_service`: eventos de prospectos.
- `metrics_service`: agregaciones por canal, campaña, plantilla, audiencia y lote.

Los endpoints deben quedarse delgados: autenticar, validar permisos, llamar al servicio y responder con un contrato consistente.

## 11. Migración de compatibilidad

No se debe romper el flujo actual en una sola entrega.

### Fase de compatibilidad

- Mantener rutas y nombres internos existentes.
- Mostrar `listas` como `Listas para contactar` en la nueva UI.
- Mantener `lista_id` y otros nombres actuales; usar `audiencia_id` solo como alias de contrato si aporta claridad y sin migración obligatoria.
- Mantener campañas y envíos existentes; agregar relaciones explícitas con lista, plantilla o versión únicamente si no existen y son necesarias para la capacidad requerida.
- Convertir flujos basados en `prospecto_ids` a flujo dinámico de audiencia cuando el usuario cree un envío desde Marketing.

### Regla de no regresión

Los envíos antiguos deben conservar sus resultados, atribución y trazabilidad. No se debe recalcular retroactivamente una audiencia histórica con sus filtros actuales.

## 12. Fases de implementación

### F0 — Baseline y contratos

- Confirmar tablas y columnas existentes.
- Elaborar una matriz concepto → tabla/columna/relación/endpoint actual.
- Identificar capacidades faltantes, especialmente versionado histórico de reglas.
- Confirmar nombres reales de campañas, plantillas, listas, lotes y envíos.
- Resolver contradicciones de documentación.
- Definir estados y códigos de omisión.
- Medir consultas actuales de prospectos, listas y envíos.

**Salida:** inventario actual, matriz de compatibilidad y lista justificada de capacidades que realmente requieren cambios de datos.

### Regla de migraciones

Una migración solo se justifica por una capacidad de negocio o auditoría que no exista actualmente.

```text
PRIMERO    revisar lo existente
↓
REUTILIZAR tablas, campos y endpoints actuales
↓
AGREGAR solo lo que realmente falta
↓
FRONTEND   mostrar nombres sencillos al usuario
```

No crear ni renombrar una tabla, campo o endpoint únicamente porque el plan utilice un nombre conceptual diferente.

### F1 — Listas para contactar

- Renombrado únicamente visual de listas a Listas para contactar.
- CRUD y detalle.
- Versionado de definición.
- Revisión server-side de personas que cumplen las condiciones.
- Filtros temporales.
- Paginación server-side de prospectos de la lista.

**Salida:** una lista puede calcular su cantidad actual y mostrar sus prospectos.

### F2 — Campañas por canal

- Separar vistas de Correo, WhatsApp y Voz.
- Listar campañas dentro del canal.
- Detalle de campaña.
- Relación de plantillas compatibles.

**Salida:** el usuario puede administrar objetivos comerciales sin mezclar canales.

### F3 — Contenido: correos, mensajes y guiones

- CRUD por canal.
- Asociación campaña-plantilla.
- Validaciones específicas por canal.
- Duplicación y activación/desactivación.

**Salida:** las plantillas pueden reutilizarse sin vincularlas artificialmente a una audiencia.

### F4 — Envíos

- Asistente de cuatro pasos.
- Revisión previa con razones de exclusión.
- Revalidación en confirmación.
- Creación de versión histórica de las reglas de la lista, únicamente si la capacidad no existe.
- Creación idempotente del lote.
- Destinatarios reales del lote.

**Salida:** ningún envío depende de IDs congelados en el navegador.

### F5 — Resultados e historial

- Detalle de lote.
- Estados por destinatario.
- Actividad transversal del prospecto.
- Métricas por canal, campaña, plantilla, audiencia y lote.
- Atribución hacia CRM.

**Salida:** el usuario puede explicar qué se envió, a quién, con qué mensaje y qué ocurrió.

### F6 — Prospectos y Búsqueda

- Extraer responsabilidades del componente monolítico.
- Crear workspace común de búsqueda.
- Unificar mapa y tipos de resultado.
- Paginación server-side de historial.
- Retirar duplicación de Google/GobMX.

**Salida:** la UI representa etapas del trabajo y no implementaciones técnicas.

## 13. Seguridad y aislamiento

Todo endpoint de audiencias, campañas, plantillas, lotes y métricas debe validar:

- Autenticación.
- Organización/tenant.
- Ownership del recurso.
- Permiso para crear, editar, ejecutar, cancelar o consultar.
- Compatibilidad del canal.
- Acceso a la audiencia y sus prospectos.

Controles específicos:

- No confiar en `organizacion_id` enviado por el frontend.
- No permitir que un `audiencia_id`, `plantilla_id` o `campana_id` cruce tenant.
- No exponer tokens, credenciales ni payloads completos de proveedores.
- No permitir que un preview se use como autorización permanente.
- Registrar quién creó, programó, ejecutó o canceló cada lote.
- Proteger webhooks y eventos de proveedores contra replay y duplicados.
- Aplicar límites, cuotas e idempotencia antes de producir comunicaciones.

## 14. Rendimiento

- Todas las listas grandes deben usar paginación server-side.
- La resolución de audiencias debe evitar cargar prospectos completos en memoria.
- Los filtros frecuentes deben corresponder a columnas e índices reales.
- Las consultas deben filtrar por tenant desde el inicio.
- Preview y creación de lote deben usar una consulta de elegibilidad compartida para evitar divergencias.
- Los envíos grandes deben procesarse fuera del request HTTP cuando el canal o tamaño lo requiera.
- Las métricas deben usar agregaciones controladas y no recalcular todo el histórico en cada render.

## 15. Criterios de aceptación

### Listas para contactar

- Se puede crear y editar una lista con múltiples segmentos.
- La lista guarda reglas dinámicas, no una fotografía de IDs seleccionados.
- `Crear lista con estas reglas` conserva las condiciones aplicadas.
- Se puede filtrar por canal, validez, permisos e historial temporal.
- La cantidad actual se recalcula server-side.
- Editar una lista no altera envíos históricos.
- La tarjeta distingue personas que cumplen las reglas de personas que pueden contactarse ahora.

### Campañas y mensajes

- Una campaña pertenece a un canal.
- Solo muestra mensajes compatibles.
- Una plantilla puede reutilizarse en campañas compatibles.
- Correo muestra Correos, WhatsApp muestra Mensajes y Voz muestra Guiones.
- Campaña, plantilla y audiencia no ejecutan comunicaciones directamente.

### Envíos

- El preview devuelve elegibles y razones de omisión.
- La confirmación vuelve a resolver la audiencia.
- El envío conserva la versión histórica de las reglas utilizadas para seleccionar a los prospectos.
- No se duplican envíos por doble clic o reintento HTTP.
- El lote y sus destinatarios tienen estados independientes.

### Historial y resultados

- Historial muestra eventos del prospecto sin duplicar la pantalla de envíos.
- Es posible bajar de canal a campaña, mensaje, lista y envío.
- Las métricas diferencian aceptación del proveedor, entrega, lectura, respuesta y conversión.

### UI

- Cada pantalla tiene una acción principal clara.
- La navegación principal no muestra Resultados ni el Historial del prospecto como botones permanentes.
- No se mezclan filtros operativos con configuración de campañas.
- Existen estados de carga, vacío, error y éxito.
- No se depende de IDs técnicos como texto principal para el usuario.

## 16. Riesgos y decisiones pendientes

1. **Nomenclatura interna:** se mantienen los nombres de persistencia existentes. Cualquier alias de API será opcional, compatible y no implicará renombrar tablas o columnas.
2. **Plantillas reutilizables:** definir si una plantilla nace global al canal o dentro de una campaña con posibilidad de reutilización posterior.
3. **Historial de envíos existente:** mapear tablas actuales de campañas, batches y envíos antes de agregar nuevas relaciones.
4. **Voz:** confirmar proveedor, estados, métricas y configuración específica antes de compartir completamente el contrato con WhatsApp y Correo.
5. **Métricas de oportunidad y venta:** confirmar la fuente canónica de atribución CRM antes de presentar tasas comerciales.
6. **Documentación contradictoria:** cerrar el estado real de migraciones y publicación de Google/GobMX antes de ejecutar cambios estructurales.

## 17. Primer entregable de implementación recomendado

La primera entrega debe ser únicamente:

```text
Listas para contactar → Campaña → Crear envío → Revisar → Volver a revisar → Envío
```

Debe incluir:

- Contratos API.
- Conservación histórica de las reglas de la lista, si hace falta implementarla.
- Reglas finales para decidir quién puede recibir el mensaje.
- Revisión previa con motivos de exclusión.
- Revalidación al confirmar.
- Estados de lote y destinatario.
- UI mínima funcional.

No debe incluir todavía una reescritura completa de Prospectos, CRM ni todo Marketing. Esa separación reduce riesgo y valida primero el flujo de mayor valor operativo.

## 18. Definición de terminado global

El refactor se considerará terminado cuando:

- La UI use la arquitectura de módulos definida.
- Listas para contactar, campañas, mensajes y envíos tengan responsabilidades separadas.
- Los envíos se resuelvan dinámicamente y se revaliden en backend.
- Los envíos históricos sean auditables aunque posteriormente cambien las reglas de la lista.
- Los filtros operativos tengan soporte explícito e indexable.
- La tabla de Prospectos ya no concentre campañas, plantillas, planificación y actividad.
- Google y GobMX compartan workspace sin duplicar responsabilidades.
- Se prueben permisos, tenant isolation, idempotencia, estados y resultados visibles en el panel.
- Se verifiquen backend, API desplegada, bundle del panel y flujo autenticado real.
