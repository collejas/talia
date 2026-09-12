# Configuración global de Google Places

La integración de Google Places utiliza una configuración global del backend.
Todos los tenants comparten los endpoints, idioma y región definidos en el
archivo de entorno correspondiente:

- `GOOGLE_PLACES_NEARBY_URL`
- `GOOGLE_PLACES_TEXT_URL`
- `GOOGLE_PLACES_DETAILS_URL`
- `GOOGLE_PLACES_LANGUAGE_CODE`
- `GOOGLE_PLACES_REGION_CODE`

Las máscaras de respuesta y los límites operativos también permanecen bajo
control global del backend y no se capturan desde la interfaz tenant-facing.

La única configuración editable por tenant es:

- `google.places_api_key`, guardada como secreto tenant-scoped.

El formulario de Google Places en `/onboarding/busqueda` y
`/settings/variables?tab=busqueda` muestra únicamente esa clave y su estado de
registro. El valor nunca se vuelve a mostrar después de guardarlo.
