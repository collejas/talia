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
1. Frontend: formulario con dos secciones (tenant + admin). El submit llama al nuevo endpoint `POST /admin/tenants/con_usuario`.
2. Backend:
   - Requiere `require_platform_admin`.
   - Validar payload: tenant mínimo + admin email/teléfono + lista `seed` (permisos/roles/departamento/puesto).
   - En orden:
     a. Crear tenant con `repo.create_organizacion`; si llega `webchat_alias`, crear ruta (`repo.create_channel_route`) y cache invalidation.
     b. Aplicar configuración (`organizaciones.config`) y secretos.
     c. Sembrar seeds: insertar en `public.permisos`, `public.roles` (disparando `roles_autofill_codigo()`), `public.roles_permisos`, `public.departamentos`, `public.puestos`.
     d. Llamar a `createSupabaseAuthUser` para crear identidad Supabase con `user/app_metadata.organizacion_id`.
     e. Disparar `triggerSupabaseRecovery` (como hace `createSupabaseAuthUser`) para que el admin reciba el correo de set-password.
     f. Insertar/actualizar `public.usuarios`, `public.usuarios_roles` apuntando al rol “Admin”, y registrar fila en `public.empleados` apuntando al departamento/puesto semeado.
     g. Registrar auditoría en `eventos_auditoria` (opcional según trigger).
   - Devuelve metadata del tenant + `usuario_id` creado + resumen de seeds aplicados (permisos/roles/departamentos).
3. Frontend muestra resumen/pasos faltantes para el admin (roles posteriores, configuraciones) y confirma que el correo de recuperación fue disparado.
4. El nuevo admin, con `rol=admin` pero sin `platform_admin`, entra solo a su org y completa roles/empleados/varios via las vistas del tenant (respetando RLS).

## Diseño del endpoint `/admin/tenants/con_usuario`

### Payload propuesto
| Campo | Tipo | Obligatorio | Comentario |
| --- | --- | --- | --- |
| `tenant.nombre` | `string` | sí | mínimo 2 caracteres. |
| `tenant.razon_social` | `string` | no | se guarda en `public.organizaciones`. |
| `tenant.dominio_principal` | `string` | no | opcional, se usa para branding/routing. |
| `tenant.webchat_alias` | `string` | no | se normaliza `lower()` y se guarda en `organizacion_rutas_canal`. |
| `tenant.activo` | `boolean` | no | default `true`. |
| `tenant.estado_onboarding` | `enum` | no | `pendiente`/`en_progreso`/`completado`/... |
| `tenant.config` | `object` | no | JSON inicial, se valida que sea objeto. |
| `admin.correo` | `string` | sí | se valida como email y se usa para crear la cuenta Supabase. |
| `admin.nombre_completo` | `string` | no | fallback al email si falta. |
| `admin.telefono` | `string` | no | se normaliza/valida en E.164 (`^\+[0-9]{7,15}$`). |
| `admin.estado` | `string` | no | `activo` o `bloqueado` (default `activo`). |
| `seed.departamento` | `string` | sí | se crea fila en `public.departamentos`. |
| `seed.puesto` | `string` | sí | se crea fila en `public.puestos`. |
| `seed.rol_nombre` | `string` | sí | se insertará en `public.roles` y se usará para `usuarios_roles`. |
| `seed.rol_descripcion` | `string` | no | ayuda en la UI. |
| `seed.permisos` | `array<{ codigo, descripcion }>` | sí | se insertan en `public.permisos` y se asocian al rol ( `public.roles_permisos`). |

### Validaciones del endpoint
1. `tenant.nombre` no vacío; `webchat_alias` no debe colisionar con rutas existentes.
2. `tenant.config`, si viene, debe ser objeto plano.
3. `admin.correo` debe pasar validación `EmailStr`; `telefono` en E.164.
4. `seed.permisos` no puede repetir `codigo` por tenant; `seed.rol_nombre` no debe duplicarse.
5. `seed.departamento` y `seed.puesto` deben crearse en `public.departamentos`/`public.puestos`.

### Ejemplo de respuesta
```json
{
  "ok": true,
  "tenant_id": "uuid",
  "usuario_id": "uuid",
  "seed": {
     "rol_id": "uuid",
     "permisos_ids": ["uuid1","uuid2"],
     "departamento_id": "uuid",
     "puesto_id": "uuid",
     "empleado_id": "uuid"
  },
  "recovery_email_sent": true
}
```

El backend envía errores claros (`403 platform_admin_required`, `409 alias_conflict`, `400 validation`, `502 repo error`).

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
