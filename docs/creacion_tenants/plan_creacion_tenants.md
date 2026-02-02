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

## Punto 1 – Diseñar el endpoint `/admin/tenants/con_usuario`
- Validar que solo `platform_admin` (tú) pueda invocar la ruta. El payload ya debe incluir `tenant` + `admin` + `seed`.
- Payload mínimos: `tenant.nombre`, `tenant.webchat_alias?` (detecta conflictos), `tenant.config`, `admin.correo`, `admin.telefono`, `seed:{departamento, puesto, rol_nombre, permisos}`. Se debe guardar `estado_onboarding` y `activo` si vienen.
- Validaciones: correo normalizado (con `email_validator` en `test_environment=True` para los dominios `.test` de las pruebas), teléfono E.164 opcional, alias único (campos `canal=webchat`, `clave=lower()`), `seed.permisos` con `min_length=1`, `seed.rol_nombre` único por organización, `seed.departamento` y `seed.puesto` se insertan y se asocian.
- Orden lógico:
  1. Crear `organizaciones` + `organizacion_rutas_canal` (webchat alias).
  2. Sembrar seeds: `permisos`, `roles`, `roles_permisos`, `departamentos`, `puestos`.
  3. Crear usuario Supabase + metadata `organizacion_id` + disparar `/auth/v1/recover` para enviar correo con `RESET_REDIRECT_URL`.
  4. Insertar/actualizar `public.usuarios`, `usuarios_roles`, `empleados` (usuario admin = empleado with highest privileges within tenant).
  5. Registrar auditoría (optional, en `eventos_auditoria` o logs).
- Respuesta propuesta: `{ok, tenant_id, usuario_id, seed:{rol_id, permisos_ids, departamento_id, puesto_id, empleado_id}, recovery_email_sent:true}` y `activo` del tenant si se necesita.

## Punto 2 – Revisión de la base de datos y triggers (backup + Supabase)
- Abre la copia de respaldo en `/var/www/talia/backups/postgres_20260126_203110` para inspección de esquemas:
  - Tablas clave: `organizaciones`, `organizacion_rutas_canal`, `permisos`, `roles`, `roles_permisos`, `departamentos`, `puestos`, `usuarios`, `usuarios_roles`, `empleados`, `secretos`, `eventos_auditoria`.
  - Revisa funciones/triggers que ya manejen semillas al crear un tenant. Si existen `RCP` (procedimientos almacenados), documenta cómo se disparan (por ejemplo, trigger `-after insert` en `organizaciones`).
  - Verifica procedimientos que cifran secretos (`secrets_crypto`) y cómo se almacenan en `secretos` con `master_key`.
  - Confirma que no hay triggers que puedan dar acceso global a los nuevos admins (el permiso de crear tenants debe quedarse restringido).
- Mapear `roles_permisos` base: el rol inicial debe tener el conjunto mínimo de permisos (admin del tenant) y la cuenta del tenant no puede crear nuevos tenants.
- Ver qué datos se deben escribir en `organizaciones.config` y `secretos` para habilitar webchat, Twilio, messenger, etc.
- Anotar cualquier vista/procedimiento (RCP) en ese backup que se pueda reutilizar para sembrar roles/permisos/empleados desde el backend.

## Punto 3 – Frontend y experiencia en `/settings/tenants`
- El formulario actual debe tener dos secciones claramente diferenciadas: **tenant** y **usuario administrador**. Todo lo relacionado con las “seed” (permisos, rol, departamento, puesto y empleado) se crea automáticamente en el backend, no se pide nada adicional al usuario.
- Recolectar los campos listados en el endpoint (`tenant.nombre`, `tenant.config`, `tenant.webchat_alias`, `tenant.activo`, `tenant.estado_onboarding`, `admin.correo`, `admin.nombre_completo`, `admin.telefono`, `admin.estado`). El formulario debe insistir en que el alias se normaliza en minúsculas y que el correo debe ser válido.
- Validaciones en frontend: feedback inmediato para campos obligatorios, formato de teléfono en E.164, alias único (puede validarse en vivo contra el backend `409 alias_conflict`). Mostrar también errores del backend (`403 platform_admin_required`, `400 invalid data`, `502 repo_error`).
- Al guardar, el panel confirma que se disparó el correo de recuperación y muestra los pasos que le faltan al tenant admin (crear más roles, empleados o departamentos, configurar canales) sin exponer que las semillas ya vienen preparadas.
- El nuevo tenant admin solo ve sus datos organizacionales y módulos autorizados (sin opciones de multi-tenant). El panel puede mostrar un mensaje de advertencia “este usuario no puede crear nuevos tenants; contacta al platform-admin para más organizaciones”.
- Interacciones clave: botón “Crear tenant + admin” deshabilitado hasta que pase validaciones; spinner/estado “Creando tenant…” y después pantalla de resumen con IDs devueltos por el endpoint (`tenant_id`, `usuario_id`) más el aviso de correo enviado.

### Campos y layout recomendados
| Sección | Campo | Requerido | Validación/explicación |
| --- | --- | --- | --- |
| Tenant | Nombre | sí | mínimo 2 caracteres. |
|  | Alias webchat | opcional pero sugerido | se guarda en `organizacion_rutas_canal`, se muestra error si backend responde `409 alias_conflict`. |
|  | Razón social | no | texto libre. |
|  | Dominio principal | no | host para branding. |
|  | RFC | no | texto alfanumérico. |
|  | País / Estado / Ciudad | no | campos separados. |
|  | Teléfono | no | formato E.164. |
|  | Sitio web | no | URL pública. |
|  | Activo (checkbox) | no | default true. |
|  | Estado onboarding (select) | no | valores: `pendiente`, `en_progreso`, `completado`, `pausado`, `cancelado`. |
| Usuario admin | Correo | sí | correo válido, normaliza, se usa para Supabase. |
|  | Nombre completo | no | opción: si falta, usar el correo como etiqueta. |
|  | Teléfono | no | captura en formato E.164; se puede usar máscara `+521234567890`. |
|  | Estado | no | select `activo`/`bloqueado`. |

### Flujo UX esperado
1. El usuario `platform-admin` abre `/settings/tenants` y ve la tarjeta “Nuevo tenant” con ambos bloques y el botón de acción.
2. Llena los datos. Las validaciones de alias/correo se muestran en tiempo real apoyadas por respuestas del backend.
3. Al enviar, la interfaz muestra un loader e invoca `POST /admin/tenants/con_usuario`.
4. Si el request falla (alias ocupado, validación, falta de privilegios), se presenta un toast/error en el bloque correspondiente. Si pasa, se muestra un panel de confirmación con: ID del tenant, ID del usuario, lista de seeds aplicados (mismo resumen que devuelve el backend) y la advertencia de que el correo de recuperación ya fue mandado.
5. Opcional: un segundo botón “Ir a configuración del tenant” redirige al dashboard interno del tenant para continuar con tareas de HR/roles/empleados una vez que el nuevo admin haya iniciado sesión.

### Navegación del tenant admin
- Reemplazar el botón “Tenants” del sidebar por “Variables” para los tenant admins (el botón sigue oculto para platform-admins o se mantiene solo en esa vista). “Variables” apunta a la nueva ruta/frontend interno que consume el endpoint tenant-scoped (`/tenant/me/settings`) y permite editar alias, contacto y estado.
- En el drawer inferior (logo con “Account”, “Billing”, “Notifications”, “Cerrar sesión”), activar el botón “Account” para que lleve a los mismos formularios organizacionales de “Variables”. El resto de opciones del drawer siguen relacionadas con el usuario, pero “Account” duplica la edición del tenant para evitar tener que navegar por otros menús.
- La vista “Variables/Account” reutiliza el mismo diseño (campos organizacionales y validaciones) y solo se muestra cuando el token pertenece a un tenant admin; en caso contrario puede ocultarse o redirigir al panel global. Esto permite a los tenant admins configurar su organización sin tocar `/settings/tenants` que queda reservado al platform-admin.

## Validaciones y pruebas
- Mantener pruebas automatizadas como `tests/api/test_admin_tenant_flow.py` con mocks (como ya se creó).
- Anotar en la documentación qué errores devuelve el endpoint para facilitar el flujo (`409 alias_conflict`, `502 repo_error`, etc.).
- Durante la ejecución real, habilitar logs en `/var/www/talia/logs/*.log` asegurando permisos (o usar `TALIA_LOG_FILE_PATH=/tmp/api.log` durante pruebas automáticas).

## Checklist operativo (post-creación)
- Confirmar rutas (`webchat`, `whatsapp`, `messenger`) y secretos (OpenAI, Twilio, mail, calendar).
- Usar `/admin/tenants/{id}/validate?scope=...` para detectar `missing_routes/secrets`.
- Ir a `/settings/hr` para crear roles/empleados/departamentos extra que la organización necesite.
- Completar `organizaciones.config` con branding y conectores (calendario, Twilio, etc.).
