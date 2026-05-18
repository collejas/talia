# Plan multitenant de envios PDF para webchat, WhatsApp y email

## 1. Objetivo

Permitir que cada tenant de Tal-IA administre una biblioteca propia de PDFs y que sus asistentes de IA puedan:

- enviar correo con PDFs adjuntos;
- enviar PDFs por WhatsApp como documento;
- usar los PDFs como fuente documental controlada;
- mantener el texto del correo separado de la biblioteca documental;
- respetar el aislamiento por `organizacion_id` en todo el flujo.

El objetivo no es solo "mandar archivos". El objetivo es que cada tenant pueda definir su propio material comercial y operativo, y que el asistente lo use sin mezclar información entre organizaciones.

## 2. Alcance funcional

Este plan cubre:

- configuración de PDFs desde el panel;
- almacenamiento físico del archivo en Supabase Storage;
- metadata documental por tenant;
- selección de PDFs por canal;
- envío por email y WhatsApp;
- integración futura con webchat como fuente de contexto;
- reglas de aislamiento multitenant;
- permisos y validaciones;
- observabilidad y pruebas.

Este plan no cubre:

- OCR avanzado de PDFs escaneados;
- firma electrónica;
- flujos de venta documental tipo portal de clientes;
- versionado complejo de documentos con workflow editorial;
- traducción automática de contenido documental.

## 3. Estado actual

Hoy el sistema ya tiene piezas útiles:

- `settings/email` administra la plantilla de texto del correo y una lista de `resources` tipo URL.
- `send_email()` ya soporta adjuntos binarios por SMTP y Brevo.
- WhatsApp puede enviar `document` con una URL.
- WhatsApp ya procesa PDFs entrantes como contexto para el asistente.
- Existe `public.panel_email_templates` para la plantilla de correo.
- Existe `public.archivos` como tabla genérica de archivos.
- Existe `public.recursos_media` para recursos ligados a catálogo u otros objetos.

Lo que falta es una capa documental explícita, multitenant, que no dependa de URLs manuales ni mezcle documentos de distintos tenants.

## 4. Principio multitenant

Todo documento, todo recurso, toda selección y todo envío deben estar siempre asociados a una sola `organizacion_id`.

Reglas base:

- un tenant solo ve sus propios PDFs;
- un tenant solo puede usar sus propios PDFs para email o WhatsApp;
- el asistente solo debe resolver documentos del tenant activo;
- los documentos globales, si existen, deben ser explícitos y limitados;
- nunca debe haber fallback silencioso a un documento de otro tenant.

### 4.1. Tenant activo

El tenant activo se determina por el contexto de la sesión:

- panel: `X-Organizacion-Id` o sesión autenticada;
- WhatsApp: organización resuelta por número, alias o configuración;
- webchat: alias público o resolución explícita del tenant;
- backend runtime: `organizacion_id` del contacto/conversación.

### 4.2. Fallback multitenant

Si existe un tenant "master" o una biblioteca base, debe tratarse como:

- catálogo semilla;
- plantilla inicial;
- fallback explícito;
- nunca como fuente que reemplace documentos configurados por tenant sin aviso.

## 5. Diagnóstico técnico del sistema actual

### 5.1. Lo que ya funciona

- `send_email()` acepta `attachments`.
- `_handle_information_email()` en WhatsApp ya manda correo desde el flujo de asistente.
- WhatsApp ya soporta `media_url` y `document.link`.
- En WhatsApp, PDFs entrantes ya se convierten a `input_file` para el modelo.

### 5.2. Lo que hoy limita el caso

- `settings/email` solo maneja texto y URLs.
- La función de WhatsApp para enviar información por correo no adjunta PDFs.
- No existe una biblioteca documental por tenant.
- Los prompts de PUI solo conocen recursos como URLs.
- La subida de recursos existente está orientada a imágenes.

### 5.3. Lo que ya existe en la base de datos

Hay estructuras reutilizables:

- `public.panel_email_templates`
- `public.archivos`
- `public.recursos_media`
- `public.adjuntos`

La mejor decisión no es forzar una sola de estas tablas para todo, sino separar claramente:

- plantilla de correo;
- biblioteca documental;
- archivos de conversación;
- recursos del catálogo.

## 6. Arquitectura objetivo

## 6.1. Separación de responsabilidades

### A. Plantilla de correo

Se mantiene en `public.panel_email_templates`.

Guarda:

- `intro`
- `highlights`
- `resources` tipo URL
- `closing`
- `use_summary`
- `use_highlights`
- `use_resources`
- `signature_salutation`
- `signature`
- `organizacion_id`

### B. Biblioteca documental

Se agrega una nueva tabla para PDFs/documentos del asistente por tenant.

Nombre sugerido:

- `public.assistant_documents`

### C. Archivo físico

Los binarios viven en Supabase Storage.

### D. Uso operativo

El asistente consume la biblioteca documental para:

- armar correos;
- mandar PDFs por WhatsApp;
- eventualmente responder con contexto enriquecido en webchat.

## 6.2. Modelo de datos sugerido

### Tabla `assistant_documents`

Campos mínimos:

- `id uuid`
- `organizacion_id uuid not null`
- `title text not null`
- `description text null`
- `channel_scope text not null`
- `storage_bucket text not null`
- `storage_path text not null`
- `storage_url text not null`
- `mime text not null`
- `size_bytes bigint null`
- `tags jsonb not null default '[]'::jsonb`
- `category text null`
- `active boolean not null default true`
- `sort_order integer not null default 100`
- `version integer not null default 1`
- `uploaded_by uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### Reglas sugeridas

- `channel_scope`:
  - `email`
  - `whatsapp`
  - `both`
- `category`:
  - `producto`
  - `servicio`
  - `faq`
  - `casos`
  - `ficha_tecnica`
  - `legal`
  - `operativo`
  - `otro`

### Índices sugeridos

- `(organizacion_id, active, sort_order)`
- `(organizacion_id, channel_scope, active)`
- `(organizacion_id, category, active)`
- `(organizacion_id, updated_at desc)`

### Restricciones sugeridas

- `organizacion_id` obligatorio;
- `storage_path` único por tenant y bucket;
- `mime` debe ser `application/pdf` para esta primera fase;
- `sort_order >= 0`;
- `channel_scope` validado por check constraint.

## 6.3. Storage

Recomendación:

- bucket dedicado para PDFs del asistente, por ejemplo `assistant-documents`;
- key estructurada por tenant:
  - `{organizacion_id}/{category}/{uuid}.pdf`

Ventajas:

- aislamiento físico por tenant;
- limpieza más sencilla;
- mejor auditoría;
- evita colisiones;
- permite controlar permisos y URLs.

### Opciones de acceso

1. **URL pública**
   - más simple para MVP;
   - útil si el documento no tiene sensibilidad alta.

2. **URL firmada**
   - más segura;
   - ideal si el documento es sensible o el tenant quiere control temporal.

Recomendación:

- usar URL firmada para WhatsApp si el archivo es sensible;
- usar bytes descargados para adjuntar email;
- dejar pública solo la versión que realmente deba ser accesible sin autenticación.

## 7. Flujo operativo multitenant

## 7.1. Alta de documento

1. El usuario del panel entra a `settings/email`.
2. Selecciona el tenant activo.
3. Sube un PDF.
4. El backend valida:
   - autenticación;
   - permiso;
   - tenant;
   - tamaño;
   - MIME;
   - extensión;
   - contenido no vacío.
5. El archivo se guarda en Storage.
6. Se crea el registro en `assistant_documents`.
7. Se devuelve la lista actualizada del tenant.

## 7.2. Selección de documento para envío

El asistente no debe elegir documentos al azar. Debe resolverlos por:

- tenant;
- canal;
- intención del usuario;
- categoría/tags;
- prioridad/orden;
- vigencia (`active`).

Ejemplo:

- si el prospecto pide precio, el asistente puede elegir un PDF comercial;
- si pide requisitos, puede elegir un PDF operativo o legal;
- si pide info general, puede mandar un brochure breve;
- si pide un caso específico, puede mandar un PDF del servicio correspondiente.

## 7.3. Envío por email

Cuando el usuario prefiera correo:

1. el asistente confirma email;
2. identifica tenant;
3. resuelve el documento o documentos;
4. descarga el binario;
5. adjunta PDF(s) al correo;
6. registra el envío con metadata;
7. actualiza la conversación/contacto.

## 7.4. Envío por WhatsApp

Cuando el usuario prefiera WhatsApp:

1. el asistente selecciona el PDF;
2. valida que `channel_scope` permita `whatsapp` o `both`;
3. resuelve URL pública o firmada;
4. envía `document`;
5. opcionalmente acompaña con texto breve;
6. registra la acción y el documento enviado.

## 7.5. Webchat

Webchat puede usar los PDFs en dos niveles:

- nivel 1: el asistente responde con texto y propone enviar PDF por email o WhatsApp;
- nivel 2: el asistente consulta el contenido del PDF como contexto semántico si se indexa.

No es obligatorio activar el nivel 2 en la primera fase. Para MVP basta con biblioteca + envío.

## 8. Cambios en `settings/email`

La pantalla de `settings/email` debe convertirse en una vista de dos bloques:

## 8.1. Bloque 1: plantilla de correo

Se mantiene la configuración actual:

- introducción;
- puntos clave;
- recursos URL;
- cierre;
- firma;
- flags de inclusión.

Esto sigue siendo el texto base del correo.

## 8.2. Bloque 2: biblioteca de PDFs del asistente

Nueva card/sección para administrar archivos.

Debe permitir:

- subir PDF;
- listar PDFs del tenant activo;
- editar título;
- editar descripción;
- editar categoría;
- editar tags;
- elegir `channel_scope`;
- activar/desactivar;
- reordenar prioridad;
- eliminar.

### UX sugerida

- tabla o lista con:
  - nombre;
  - categoría;
  - canal;
  - tamaño;
  - estado;
  - fecha de actualización.
- drawer/modal para editar metadata.
- botón primario "Subir PDF".
- filtro por categoría y canal.

### Validaciones de UI

- solo aceptar PDF en esta primera fase;
- advertir si el archivo supera el límite;
- impedir guardar documentos sin título;
- evitar canal vacío;
- mostrar claramente el tenant activo para no confundir al operador.

## 9. Backend: cambios requeridos

## 9.1. API

Agregar endpoints para:

- subir PDF;
- listar documentos del tenant;
- obtener documento por ID;
- editar metadata;
- activar/desactivar;
- cambiar orden;
- eliminar;
- obtener documentos recomendados por canal o categoría.

### Contrato recomendado para lista

Filtros:

- `organizacion_id`
- `channel_scope`
- `category`
- `active`
- `search`
- `limit`

### Contrato recomendado para documento

Debe devolver:

- metadata;
- storage_path;
- storage_url;
- mime;
- tamaño;
- canal;
- estado;
- tags;
- tenant.

## 9.2. Servicio de storage

Extender la capa de storage para:

- aceptar PDF;
- guardar metadatos;
- usar naming por tenant;
- generar URL pública o firmada;
- resolver el archivo al momento del envío.

### Reglas de validación

- MIME permitido: `application/pdf`;
- extensión permitida: `.pdf`;
- tamaño máximo configurable;
- nombre original saneado;
- archivo no vacío;
- tenant obligatorio.

## 9.3. Servicio de email

Extender el envío de información para que:

- acepte `document_ids` o una estructura equivalente;
- resuelva cada documento contra el tenant activo;
- descargue el archivo real;
- construya `attachments` para SMTP/Brevo;
- mantenga compatibilidad con el flujo actual de texto.

### Reglas del correo

- máximo razonable de adjuntos por correo;
- no adjuntar PDFs de otros tenants;
- no adjuntar PDFs desactivados;
- si el documento no está disponible, enviar solo texto y registrar advertencia.

## 9.4. Servicio de WhatsApp

Extender el envío para:

- resolver PDF por tenant;
- enviar un único documento o una lista muy corta;
- usar URL firmada cuando convenga;
- respetar `channel_scope`.

### Reglas de WhatsApp

- preferir un solo PDF relevante por respuesta;
- no enviar múltiples documentos pesados de forma automática;
- acompañar con texto breve y claro;
- si el archivo falla, caer a texto y registrar el incidente.

## 9.5. Persistencia de trazabilidad

Registrar para cada envío:

- `organizacion_id`
- `conversation_id`
- `contact_id`
- `canal`
- `document_ids`
- `document_titles`
- `provider`
- `status`
- `message_id`
- `created_at`

Esto es necesario para:

- auditoría;
- soporte;
- métricas de uso;
- control comercial por tenant.

## 10. Cambios en prompts y funciones de PUI

Los prompts actuales de WhatsApp y webchat para PUI hoy dependen de `resources` como URLs. Eso es insuficiente para una biblioteca documental real.

Hay que actualizar:

- `docs/openai/Pui/WhatsApp/Prompt.md`
- `docs/openai/Pui/Webchat/Prompt.md`
- `docs/openai/Pui/WhatsApp/funciones.md`
- `docs/openai/Pui/Webchat/funciones.md`

### Objetivos de prompt

El asistente debe:

- usar documentos reales del tenant;
- no inventar links;
- no inventar PDFs;
- distinguir entre:
  - enviar información por correo;
  - enviar documento por WhatsApp;
  - responder con texto solamente;
- pedir revisión humana si no existe el documento correcto.

### Funciones nuevas sugeridas

- `list_assistant_documents`
- `get_assistant_document`
- `send_information_with_documents`

Opcionales:

- `send_information_email_with_documents`
- `send_whatsapp_document`
- `search_assistant_documents`

### Reglas de uso

- el asistente solo puede listar documentos del tenant activo;
- el asistente no puede reutilizar documentos globales salvo que el sistema lo permita explícitamente;
- si hay más de un PDF candidato, el asistente debe elegir el de mayor prioridad o pedir aclaración;
- si el documento es legal o sensible, el asistente debe preferir correo o revisión humana según política del tenant.

## 11. Modelo multitenant de permisos

## 11.1. Permisos de panel

Se recomienda separar permisos como:

- `settings.view`
- `settings.manage`
- `files.view`
- `files.manage`
- `assistant-documents.view`
- `assistant-documents.manage`

## 11.2. Visibilidad por tenant

Todo listado debe respetar:

- `organizacion_id` de la sesión;
- permisos del usuario;
- rol del usuario;
- contexto del módulo.

## 11.3. Protección contra fuga de datos

No permitir:

- ver documentos de otro tenant por URL directa sin autorización;
- subir documentos a un tenant distinto al activo;
- adjuntar documentos sin validar tenant;
- que el asistente cruce información documental entre organizaciones.

## 12. Integración con la base documental

Si más adelante quieres que el asistente "lea" PDFs y conteste a partir de ellos, entonces esta biblioteca documental debe integrarse con indexación semántica.

## 12.1. Primera fase

Solo biblioteca + envío.

## 12.2. Segunda fase

Indexación por tenant de PDFs seleccionados.

## 12.3. Tercera fase

Recuperación por:

- intención;
- categoría;
- tags;
- similitud semántica;
- contexto de conversación.

## 13. Reglas de negocio recomendadas

- Un tenant puede tener cero o muchos PDFs.
- Un PDF puede servir para uno o varios canales.
- Un PDF inactivo no debe ser elegible por el asistente.
- Un PDF eliminado debe conservar trazabilidad si ya fue enviado.
- Si el envío por email falla, no se debe marcar como exitoso.
- Si WhatsApp no puede enviar documento, se debe volver a texto o solicitar reintento.
- El asistente debe evitar saturar al usuario con demasiados archivos.

## 14. Observabilidad y auditoría

Registrar eventos como:

- documento subido;
- documento editado;
- documento activado/desactivado;
- documento enviado por email;
- documento enviado por WhatsApp;
- documento rechazado por tenant;
- documento no disponible;
- documento inválido;
- fallback a texto sin PDF.

Métricas útiles:

- documentos por tenant;
- documentos activos por canal;
- envíos por canal;
- errores de envío;
- PDFs más usados;
- PDFs sin uso;
- tiempo promedio de resolución del archivo.

## 15. Seguridad

### 15.1. Validación de archivos

- aceptar solo PDF en el MVP;
- validar MIME, extensión y tamaño;
- rechazar archivos vacíos;
- sanear nombre original;
- evitar path traversal.

### 15.2. Acceso

- preferir signed URLs cuando el documento sea sensible;
- no exponer storage path interno al frontend como fuente de verdad;
- registrar quién subió y quién modificó cada documento.

### 15.3. RLS / aislamiento

Todo debe quedar protegido por:

- filtros por `organizacion_id`;
- políticas RLS apropiadas;
- permisos en backend;
- validación de tenant en cada mutación.

## 16. Fases de implementación

## Fase 1: base de datos y storage

Entregables:

- tabla `assistant_documents`;
- migración;
- bucket o convención de storage;
- validación PDF;
- listing por tenant.

## Fase 2: panel de administración

Entregables:

- sección nueva en `settings/email`;
- subida de PDFs;
- listado y edición de metadata;
- activación/desactivación;
- orden y categoría.

## Fase 3: envío por correo

Entregables:

- resolución de documentos por tenant;
- adjuntos PDF reales;
- trazabilidad de envíos;
- pruebas de unidad para attachments.

## Fase 4: envío por WhatsApp

Entregables:

- envío de PDF como documento;
- selección por tenant/canal;
- uso de URL firmada o pública;
- pruebas del flujo en Twilio y Meta.

## Fase 5: prompts y herramientas

Entregables:

- actualización de prompts PUI;
- nuevas funciones para listar/seleccionar documentos;
- reglas de uso por canal;
- fallback prudente si no hay documento adecuado.

## Fase 6: indexación semántica opcional

Entregables:

- extracción de texto de PDF;
- embeddings por tenant;
- búsqueda semántica por categoría/intención;
- elección inteligente del documento correcto.

## 17. Criterios de aceptación

El cambio se considera listo cuando:

- un tenant puede subir PDFs desde su propio panel;
- los PDFs quedan aislados por `organizacion_id`;
- el asistente puede enviar un PDF real por email;
- el asistente puede enviar un PDF real por WhatsApp;
- el sistema no cruza documentos entre tenants;
- el flujo actual de correo textual sigue funcionando;
- los prompts dejan de depender solo de URLs para material documental;
- hay trazabilidad de cada envío;
- hay controles de seguridad y permisos.

## 18. Riesgos

- saturar al usuario con demasiados documentos;
- confundir recursos URL con PDFs adjuntos;
- mandar un documento equivocado por mala clasificación;
- exponer documentos sensibles con URLs públicas permanentes;
- mezclar documentos entre tenants por un filtrado incompleto;
- romper el envío actual de información si se cambia la firma del servicio sin compatibilidad.

## 19. Orden recomendado de ejecución

1. Definir y migrar la tabla multitenant de documentos.
2. Implementar subida y listado por tenant.
3. Extender `settings/email` para administrar PDFs.
4. Integrar adjuntos PDF en correo.
5. Integrar envío de documento por WhatsApp.
6. Actualizar prompts y funciones PUI.
7. Añadir indexación semántica si realmente hace falta.

## 20. Resultado esperado

Con este diseño, cada tenant podrá cargar sus propios PDFs de producto, servicio, operación o soporte, y los asistentes de IA podrán usarlos de forma controlada, trazable y aislada para:

- correo;
- WhatsApp;
- webchat;
- y futura búsqueda semántica documental.
