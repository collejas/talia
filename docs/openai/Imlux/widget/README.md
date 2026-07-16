# Widget WordPress para `imlux`

Tema activo:

- `phlox`

Ruta de destino en el hosting del tenant:

- `/public_html/wp-content/themes/phlox/`

Archivos a copiar ahí:

- `functions.php`
- `js/webchat-widget.js`
- `js/visit-tracking.js`
- `css/webchat.css`

Alias del tenant:

- `imlux`

Backend:

- `https://talia.mx/api/webchat`

Tracking:

- `https://talia.mx/api/crm`

Nota:

- `visit-tracking.js` usa una caché de geolocalización separada por alias para evitar que una captura previa en otro contexto bloquee el prompt del navegador durante pruebas repetidas.
- El widget y el tracking se inyectan en `wp_footer` en todas las páginas, no solo en la portada.
