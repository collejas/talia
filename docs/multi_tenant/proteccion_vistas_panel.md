# Protección de vistas del panel

Las vistas internas del panel requieren una sesión de Supabase Auth verificada antes de renderizarse. `frontend/panel/src/proxy.ts` aplica esta comprobación y redirige al inicio de sesión cuando no existe una sesión válida; si Auth no está disponible, responde 503. Cuando es necesario renovar la sesión, actualiza las cookies de acceso y renovación en la solicitud y en la respuesta.

La página inicial, autenticación, portal por enlace, webchat, política de privacidad, recursos públicos y API conservan sus propios mecanismos de acceso. El proxy no sustituye los permisos ni la validación de organización de los endpoints backend.

Las vistas en `MASTER_ONLY_PATHS` consultan al backend para validar la organización efectiva; un cambio de organización requiere la autorización existente de administrador de plataforma. No se concede acceso a partir de metadata editable o de la cookie por sí sola.

La verificación de salud que solicita `/dashboard` acepta la redirección de una petición sin sesión. Después del despliegue se deben probar el acceso autenticado, la renovación, el cambio de organización, los enlaces públicos y la ausencia de nuevos warnings de Auth asociados al monitor.
