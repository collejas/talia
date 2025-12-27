# Frases listas para App Review de Meta

Usa estas frases como base para las descripciones de cada permiso y para narrarlas en el video que subirás. Puedes pegarlas directamente en el formulario o adaptarlas a tu estilo.

## Uso permitido general
> “La app solo existe para que Geoactiv responda mensajes entrantes de su página oficial mediante el asistente TalIA, usando los permisos solicitados. No la distribuimos ni la exponemos al público; solo gestiona la atención al cliente.”

## pages_show_list
> “Necesitamos `pages_show_list` para identificar las páginas que administra el usuario y confirmar que Geoactiv está autorizada antes de activar el resto de los permisos. En el video muestro la misma lista que uso internamente para validar el `page_id`.”

## pages_manage_metadata
> “Con `pages_manage_metadata` configuramos los webhooks (`messages`, `message_reads`, `message_deliveries`) y verificamos el token. En la captura se ve el panel de Webhooks pegando la URL del backend y el verify token, y la llamada de prueba `GET /{page-id}/subscribed_apps`.”

## pages_utility_messaging
> “Este permiso permite que el backend administre las notificaciones automáticas (ej. reenganches o alertas al vendedor) usando plantillas que salen de TalIA. Aunque el contenido se genera aquí, estas notificaciones se envían por WhatsApp al vendedor; Messenger/Instagram sólo contestan a los clientes. En el video muestro cómo se construye el resumen antes de enviarlo como notificación.”

## pages_messaging
> “`pages_messaging` se usa para responder a los mensajes del widget y del chat oficial. En la demostración envío un mensaje de prueba y se ve la respuesta del asistente, además de mostrar la llamada `GET /{page-id}/conversations` con el token de prueba.”

## business_management
> “Solicitamos `business_management` para asociar la página de Geoactiv con la app y obtener los tokens necesarios. La grabación muestra la selección de la página dentro de Meta Business y la confirmación de que la app está instalada.”

## pages_read_engagement
> “Leemos métricas básicas (`page_messages`, engagement) únicamente para tableros internos y no compartimos esos datos. En el clip se ve la llamada `GET /{page-id}/insights` y cómo se actualizan los indicadores en el panel.”

## instagram_manage_messages
> “Cuando también integramos Instagram, usamos `instagram_manage_messages` para responder automáticamente a los mensajes de esa plataforma. En la demo aparece un mensaje de Instagram y la respuesta del bot; el permiso requiere `instagram_basic` y la cuenta vinculada.”

## public_profile
> “Usamos `public_profile` para identificar al administrador que conecta la página y aplicamos ese nombre solo internamente; nunca redistribuimos datos de perfil.”

> **Consejo final**: adjunta estas frases a cada permiso y referencia el video/captura correspondiente. Si necesitas ayuda para traducirlas al inglés, dime y lo hago.
