# Guía de evidencia para App Review de Meta

Este documento explica qué mostrar en capturas/video para demostrar la implementación del asistente en Messenger, y qué escribir para justificar cada permiso que vas a solicitar. Usarás capturas (por ejemplo en Canva) y un video corto (pantalla + audio) para narrar el flujo.

## 1. Uso permitido general
- **Qué describir**: Explica que la app no se distribuye públicamente; solo sirve como puente entre Meta Messenger y el asistente TalIA para responder mensajes de clientes en la página oficial de Geoactiv.  
- **Qué capturar**: Pantalla del panel con el widget abierto y un mensaje de prueba. Añade un texto superpuesto que diga “El bot recibe mensajes entrantes y responde usando TalIA”.  
- **Video**: Graba la secuencia: accedes al panel (https://talia.mx/inbox), simulas un mensaje desde la página y se ve la respuesta del bot.  
- **Declaración final**: “Confirmamos que este uso cumple la política de Meta y solo procesa mensajes entrantes en nombre de Geoactiv. No usamos la app para otros fines.”

## 2. pages_show_list
- **Uso**: Solo recuperamos las páginas que administra el usuario para saber qué páginas están autorizadas a enviar mensajes.  
- **Captura**: Muestra el dashboard interno o script donde se listan los IDs/alias de páginas asociadas a la cuenta en Meta Developers (puede ser un modal o tabla simple).  
- **Video**: En el mismo video general, incluye la acción “lista las páginas autorizadas” en consola o en el panel interno.  
- **Confirmación**: “pages_show_list se usa únicamente para validar la página y cumplir con el requisito de metadata.”

## 3. pages_manage_metadata
- **Uso**: Se usa para suscribir la página a webhooks (`messages`, `message_reads`, `message_deliveries`) y verificar tokens.  
- **Captura**: Panel de Meta > Configuración de Messenger > sección Webhooks donde eliges los fields y pegas la URL del webhook.  
- **Video**: Muestra brevemente la pantalla de configuración y el token ingresado (puedes simular con placeholder).  
- **Prueba API**: Haz una llamada simple al endpoint `GET /{page-id}/subscribed_apps` usando `curl` o Graph Explorer y muéstrala en texto o consola.  
- **Confirmación**: “Solo suscribimos fields necesarios y siempre respetamos el uso permitido.”
 
- **Uso**: Gestiona plantillas y configuraciones de mensajes reutilizados (notificaciones de reenganche que se envían por WhatsApp, no por Messenger).  
- **Captura**: Muestra la plantilla de WhatsApp o configuración de notificaciones que el backend usa cuando reengancha.  
- **Video**: Durante el video principal muestra cómo el asistente prepara la notificación y qué datos incluye (resumen, contact info).  
- **Prueba API**: Ejecuta `GET /{page-id}/message_templates` (o equivalente) y muestra la respuesta en consola.  
- **Declaración**: “Utilizamos este permiso solo para enviar notificaciones que el backend genera tras detectar reenganches fallidos.”

## 5. pages_messaging
- **Uso**: Enviar y recibir mensajes de clientes; se usa para responder automáticamente al widget.  
- **Captura**: Pantalla del widget con un mensaje entrante al lado y la respuesta del bot.  
- **Video**: Graba el flujo completo (mensaje entrante, asistente del backend, respuesta enviada).  
- **Prueba API**: Muéstrala en el video o adjunta la llamada `GET /{page-id}/conversations` desde Graph Explorer con `pages_messaging` token.  
- **Confirmación**: “Cumplimos la política mostrando que usamos `pages_messaging` exclusivamente para responder con TalIA y no para spam.”

## 6. business_management
- **Uso**: Necesario para solicitar tokens de página y mover la app dentro del ecosistema de Meta Business.  
- **Captura**: Meta Business Suite > “Configuración del negocio” mostrando que la app está conectada.  
- **Video**: Muestra el paso de seleccionar una página y otorgar permisos a tu app (puede ser una grabación de pantalla corta).  
- **Prueba API**: Muestra una petición `GET /businesses/{business-id}/owned_pages` con el token.  
- **Declaración**: “Solicitamos business_management solo para enlazar la página de Geoactiv y no para admin externa.”

## 7. pages_read_engagement
- **Uso**: Leer métricas básicas (mensaje abierto, alcance) para alimentar reportes internos (no se publica en Meta).  
- **Captura**: Panel con el gráfico de engagement que usa esos datos.  
- **Video**: En el mismo clip, muestra el backend leyendo datos y actualizando indicadores.  
- **Prueba API**: `GET /{page-id}/insights?metric=page_messages`, muestra la respuesta.  
- **Confirmación**: “Solo monitoreamos engagement para métricas internas; no redistribuimos datos externos.”

## 8. instagram_manage_messages
- **Uso**: (Solo si lo tienes activo) responder mensajes de Instagram en paralelo al channel Messenger.  
- **Captura**: Panel que muestre integración con Instagram y la lista de mensajes recibidos.  
- **Video**: Incluye un momento donde se muestra claramente un mensaje de Instagram y la respuesta automática.  
- **Confirmación**: “Cumplimos con la política y la conexión se limita a las cuentas verificadas que administra Geoactiv.”
 
## 9. public_profile
- **Uso**: Acceder al perfil básico del usuario que instala la app para relacionarlo con la página.  
- **Confirmación**: “Usamos public_profile únicamente para obtener el nombre del administrador que conecta la página y nunca mostramos la info fuera del equipo.”

> **Consejo final**: en la descripción de cada permiso copia el resumen anterior, sube las capturas/video a la solicitud de App Review y marca claramente que la app solo atiende mensajes de la página oficial y respeta todos los usos permitidos. Si necesitas ayuda para redactar los textos exactos en inglés, puedo hacerlo. También guarda las capturas en un archivo y referencia sus nombres cuando completes el formulario de Meta.
