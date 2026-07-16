# Widget WordPress para `consulting-child`

Ubicación correcta en el tenant:

`/home/tczzrgdf/sinergialidera.com/wp-content/themes/consulting-child/`

Archivos a copiar ahí:

- `webchat-widget.js`
- `visit-tracking.js`
- `webchat.css`
- `functions.php` o, si prefieres no tocar el actual, pegar el snippet de este directorio

## Qué hace cada archivo

- `webchat-widget.js`: interfaz del chat, envío de mensajes, adjuntos y cierre de sesión.
- `visit-tracking.js`: captura visitas, UTM, referrer, device, geolocalización y navegación.
- `webchat.css`: estilos del widget flotante.

## Dónde pegarlo

Lo más limpio es usar el child theme:

- `consulting-child/functions.php`
- `consulting-child/webchat-widget.js`
- `consulting-child/visit-tracking.js`
- `consulting-child/webchat.css`

## Validación

Después de subirlo:

1. Abre el sitio.
2. Revisa que cargue `webchat.css`.
3. Revisa en Network que se llamen `webchat-widget.js` y `visit-tracking.js`.
4. Confirma que el widget registra `POST /api/webchat/visit` y `POST /api/webchat/messages`.

