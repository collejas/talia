# Plan: creación de tenants y usuario administrador asociado

## Contexto
- Solo el usuario platform-admin (lista `public.platform_admins`) puede crear tenants. El nuevo flujo debe mantener ese privilegio exclusivo y automatizar el resto del onboarding.
- La base de datos ya contiene las tablas `organizaciones`, `organizacion_rutas_canal`, `secretos`, `usuarios`, `roles`, `usuarios_roles`, `departamentos`, `empleados` y existe la función `es_admin()` que restringe las acciones a nivel de tenant.
- El backend dispone de los endpoints `/admin/tenants` y `/admin/tenants/{id}/...` que requieren `require_platform_admin`, y de helpers para cifrado (`secrets_crypto`) y validación (`validate_tenant`). La UI actual en `/settings/tenants` usa `callCrmApi` con `X-User-Token` y `X-Organizacion-Id`.

## Objetivo
Darle al usuario platform-admin (tu cuenta actual) la capacidad de:
1. Crear el registro en `public.organizaciones` (tenant).
2. Registrar rutas/canales importantes (alias webchat etc.).
3. Guardar configuración JSON y secretos por tenant.
4. Crear simultáneamente el usuario administrador dentro de ese tenant (`public.usuarios`, Supabase Auth y `usuarios_roles` con el rol `admin`).
5. Al mismo tiempo sembrar las filas fundamentales en el tenant: permisos mínimos, rol “Admin”, departamentos, puestos y un empleado asociado al usuario (de modo que el nuevo admin ya tenga el mayor rango de permisos dentro de su `organizacion_id`).
6. Disparar el correo de alta en Supabase (`/auth/v1/recover` con `RESET_REDIRECT_URL`) para que el usuario reciba el enlace y configure su contraseña sin necesidad de manejar el secreto temporal.
7. Todo ello en una única operación validada y auditada, dejando al tenant admin con permisos menores que solo le permiten terminar su onboarding interno (roles, departamentos, empleados, configuraciones propias).

## Datos mínimos por colecta
1. **Tenant**
   - `nombre` (obligatorio, al menos 2 caracteres).
   - `razon_social`, `dominio_principal`, `rfc`, `pais`, `estado`, `ciudad`, `telefono`, `sitio_web` (opcionales pero validados si se proveen).
   - `activo` (checkbox) y `estado_onboarding` ({pendiente,en_progreso,completado,pausado,cancelado}).
   - `webchat_alias` (usa clave `lower()` para `organizacion_rutas_canal`; detecta conflicto).
   - `config` inicial (JSON), tipicamente `features.webchat.enabled`, `webchat.assistant_id`, calendarios, Twilio, etc.
2. **Usuario administrador**
   - `correo` (obligatorio si no se reusa `id` existente).
   - `nombre_completo`.
   - `telefono` validado en formato E.164 (USA/Latam, usa regex `^\+[0-9]{7,15}$`).
   - `estado` (`activo` o `bloqueado`).
   - Rol `admin` (en `roles` con `codigo='admin'` dentro del tenant).
   - Contraseña: generar temporal (UUID sin guiones) y enviar correo para recuperación/establecer password usando Supabase Auth (`/auth/v1/admin/users` + `/auth/v1/recover`).

## Validaciones necesarias a nivel backend
1. Validar que quien llama es `platform-admin`.
2. Confirmar que `nombre` del tenant esté presente y no vacío.
3. Normalizar `webchat_alias`; si existe la ruta lanzar `409`.
4. Al crear usuario:
   - Validar `correo` en formato email.
   - Validar `telefono` E.164.
   - Crear usuario en Supabase Auth con master key y `user_metadata.organizacion_id`.
   - Inyectar `organizacion_id` recién creado al `public.usuarios` y al metadata del usuario Auth.
   - Asignar rol `admin` en `public.usuarios_roles`.
5. Cifrado de secretos con `TALIA_SECRETS_MASTER_KEY[_HIGH]`, no exponer valores en la respuesta.
6. Registrar auditoría/log indicando qué tenant+usuario se creó y quién lo hizo (opcionalmente en `eventos_auditoria`).

## Flujo sugerido
1. Frontend: formulario con dos secciones (tenant + admin). El submit llama a nuevo endpoint `/admin/tenants/con_usuario`.
2. Backend:
   - Requiere `require_platform_admin`.
   - Usa transacción lógica para:
     a. Insertar en `public.organizaciones`.
     b. Crear ruta webchat (si `alias`).
     c. Insertar `organizaciones.config` y secretos (si vienen).
     d. Llamar a helper `createSupabaseAuthUser` para crear identity y enviar email de recuperación.
     e. Insertar/patch en `public.usuarios` con `organizacion_id`, estado, teléfono y nombre.
     f. Asociar rol admin en `public.usuarios_roles`.
   - Devuelve metadata del tenant creado y el `id` del usuario (pero sin secrets).
3. Frontend muestra resumen y pasos restantes para el admin (roles, empleados, variables).
4. El nuevo admin, con `rol=admin` pero sin `platform_admin`, puede entrar a su propia org y completar HR, departments, configuraciones (views existentes `/settings/usuarios`, `/settings/empleados`, `/settings/tenants/{id}` pero restringidas a su tenant vía RLS).

## Checklist de post-creation (para el tenant admin)
- Confirmar rutas (webchat, WhatsApp, messenger) y secretos (OpenAI, Twilio, mail, calendar).
- Ejecutar `/admin/tenants/{id}/validate?scope=webchat` (y demás scopes) desde tu panel para identificar `missing_*`.
- Revisar `settings/hr` del tenant para crear roles/empleados/departamentos según se necesite.
- Completar `organizaciones.config` con branding, flags y conectores.

## Siguientes pasos
1. Diseñar el endpoint combinado y el formulario (decidir payload JSON).
2. Documentar en este archivo los campos exactos del formulario y las validaciones.
3. Implementar pruebas manuales: crear tenant + admin, revisar que el admin no tenga acceso cross-tenant.
4. Añadir sección de “validación” en la UI para marcar qué steps faltan después de crear el tenant.
