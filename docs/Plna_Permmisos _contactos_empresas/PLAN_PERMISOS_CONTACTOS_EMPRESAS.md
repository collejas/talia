# Plan de permisos para contactos y empresas

Fecha: 2026-06-02

## Objetivo

Implementar control de visibilidad y edición por rol para contactos y empresas, con foco en proteger datos sensibles:

- teléfonos
- email
- dirección

Además, controlar por rol la exportación CSV de contactos.

## Regla de negocio

- Los roles `owner` y `admin` quedan exentos de la restricción.
- Para el resto de roles:
  - si el usuario es propietario del registro, puede ver y editar la información sensible del contacto o empresa;
  - si no es propietario, puede ver el registro mínimo:
    - `id`
    - `nombre`
    - `propietario`
  - si no es propietario, no puede ver:
    - teléfono
    - email
    - dirección
  - si no es propietario, no puede editar los datos sensibles.
- La exportación CSV de contactos debe poder activarse o desactivarse por rol.

## Alcance

### Incluido

- Lectura de contactos y empresas.
- Detalle de contacto y empresa.
- Edición de contacto y empresa.
- Exportación CSV de contactos.
- Matriz de permisos por rol en `settings/rh`.

### Excluido

- `admin_operativo` no entra en este plan.
- No se cambia la lógica general de ownership del CRM.
- No se altera el acceso a módulos ajenos a contactos/empresas, salvo dependencias directas necesarias.

## Diagnóstico actual

### Base de datos

- El modelo vigente usa `public.personas` como entidad principal de contacto y `public.cuentas` como empresa.
- La privacidad actual es binaria:
  - o el usuario puede ver el registro,
  - o no lo ve.
- Existe una función central de visibilidad:
  - `public.puede_ver_persona(p_persona_id uuid)`
- Esa función no distingue entre:
  - ver el registro
  - ver datos sensibles

### Backend

- El backend expone:
  - `GET /crm/personas/{id}`
  - `GET /crm/cuentas/{id}`
  - `GET /crm/personas/list`
  - `GET /crm/cuentas/...`
  - `GET /crm/contacts/export`
- La edición ya tiene validaciones por scope/owner en varios endpoints.
- La lectura sigue devolviendo campos sensibles completos.
- La exportación CSV hoy depende de permisos generales, no de un permiso específico de exportación.

### Incidente observado en `settings/rh`

Durante la revisión de permisos y roles se detectó un problema real al guardar cambios de roles de usuario:

- al intentar quitar o cambiar roles a un usuario del tenant, el cambio se enviaba desde la UI, pero no se persistía en `usuarios_roles`;
- el caso visible era el usuario `Oscar Martinez` del tenant `3dbb2a99-9d81-4233-8444-0990d53b93b3`, con rol `admin (0010)` que no se podía quitar desde la pantalla;
- la causa raíz estaba en el trigger `public.prevent_remove_last_admin()`, que buscaba `roles.codigo = 'admin'`;
- en este esquema el rol admin real usa `codigo = '0010'` y `nombre = 'admin'`, así que el trigger no identificaba el rol y cancelaba el `DELETE/UPDATE` sobre `usuarios_roles`.

Corrección aplicada:

- se ajustó `public.es_admin(uid)` para reconocer admin por `nombre` o por `codigo = '0010'`;
- se ajustó `public.prevent_remove_last_admin()` para reconocer admin por `nombre` o por `codigo = '0010'`;
- se aplicó la migración `supabase/migrations/20280603_130000_fix_admin_role_detection.sql`.

Verificación:

- el `DELETE` del rol `0010` sobre Oscar ya responde correctamente en una prueba transaccional;
- después de guardar en la UI, los roles sí se actualizan y el cambio persiste en BD.

### Frontend

- La tabla de contactos muestra:
  - teléfono
  - email
  - propietario
- La tabla y el detalle de empresas muestran:
  - correo
  - teléfono
  - direcciones
- El botón de exportar CSV de contactos hoy se renderiza sin una autorización fina propia.

## Propuesta técnica

La solución debe dividirse en dos capas:

1. acceso al registro
2. acceso a campos sensibles

Eso evita romper el comportamiento actual de `inbox`, `calendario` y otros flujos que dependen de la visibilidad básica del registro.

### 1) Capa de permisos nuevos

Agregar permisos nuevos en la matriz RBAC:

- `contacts.view_sensitive_unowned`
- `accounts.view_sensitive_unowned`
- `contacts.export_csv`

Interpretación:

- `contacts.view_sensitive_unowned`
  - permite ver teléfono, email y dirección de contactos aunque no sean del propietario
- `accounts.view_sensitive_unowned`
  - permite ver teléfono, email y dirección de empresas aunque no sean del propietario
- `contacts.export_csv`
  - permite exportar CSV desde la vista de contactos

### 2) Capa DB

Crear helpers de privacidad de campo sin reemplazar la lógica de visibilidad actual.

Funciones sugeridas:

- `public.can_view_contact_sensitive_fields(p_persona_id uuid)`
- `public.can_view_account_sensitive_fields(p_cuenta_id uuid)`

Regla sugerida para ambas:

- `true` si el usuario es `owner` o `admin`
- `true` si el usuario es propietario del registro
- `true` si el usuario tiene el permiso fino correspondiente
- `false` en cualquier otro caso

### 3) Capa backend

#### Contactos

Actualizar la respuesta de:

- `GET /crm/personas/{id}`
- `GET /crm/contacts/{id}`
- `GET /crm/personas/list`
- `GET /crm/contacts/list`

para que:

- siempre devuelva `id`, `nombre` y `propietario`
- devuelva `correo`, `telefono` y dirección solo si el usuario puede ver campos sensibles
- incluya una bandera tipo:
  - `can_view_sensitive_fields`

#### Empresas

Actualizar la respuesta de:

- `GET /crm/cuentas/{id}`
- `GET /crm/cuentas/list`

para aplicar el mismo criterio:

- mostrar siempre lo mínimo
- esconder correo, teléfono y direcciones si no corresponde

#### Edición

En los endpoints `PATCH` de personas y cuentas:

- mantener la verificación de owner/scope actual
- bloquear cambios de campos sensibles cuando el usuario no tenga permisos o no sea propietario

#### Exportación CSV

Agregar validación explícita antes de generar el CSV:

- si no tiene `contacts.export_csv`, responder `403`
- si tiene permiso, permitir exportación

### 4) Capa frontend

#### Vista de contactos

Cambios necesarios en:

- `frontend/panel/src/components/contactos/contacts-data-table.tsx`
- `frontend/panel/src/components/contactos/ContactDetailPanel`

Comportamiento:

- si no puede ver campos sensibles, ocultar teléfono y email
- si no es propietario, mostrar solo:
  - id
  - nombre
  - propietario
- ocultar el botón `Exportar CSV` si no tiene `contacts.export_csv`

#### Vista de empresas

Cambios necesarios en:

- `frontend/panel/src/components/cuentas/accounts-data-table.tsx`
- `frontend/panel/src/components/cuentas/cuenta-detail-view.tsx`

Comportamiento:

- ocultar correo, teléfono y dirección cuando no corresponda
- mantener visible:
  - id
  - nombre
  - propietario

## Flujo recomendado de implementación

### Fase 1: DB

1. Agregar permisos nuevos a la matriz.
2. Crear funciones helper de privacidad.
3. Ajustar RPC o vistas que alimentan listados y detalles para incluir una bandera de visibilidad sensible.

### Fase 2: Backend

1. Adaptar serialización de contactos.
2. Adaptar serialización de empresas.
3. Agregar validación para exportación CSV.
4. Mantener intacta la lógica de ownership existente para edición.

### Fase 3: Frontend

1. Ocultar columnas sensibles según la bandera recibida.
2. Ocultar exportación CSV cuando no exista permiso.
3. Ajustar detalle de contacto y empresa para no renderizar datos sensibles cuando no deban verse.

### Fase 4: Pruebas

1. Verificar usuario propietario.
2. Verificar usuario no propietario.
3. Verificar rol `owner`.
4. Verificar rol `admin`.
5. Verificar exportación CSV permitida y denegada.

## Casos de prueba mínimos

- Un contacto propio debe mostrar teléfono, email y dirección.
- Un contacto ajeno no debe mostrar teléfono, email ni dirección.
- Una empresa propia debe mostrar teléfono, email y dirección.
- Una empresa ajena no debe mostrar teléfono, email ni dirección.
- Un usuario sin `contacts.export_csv` no debe ver el botón de exportación.
- El backend debe responder `403` si se intenta exportar sin permiso.

## Riesgos

- Si se modifica la lógica central de `puede_ver_persona`, se pueden romper vistas compartidas de inbox, calendario y otras relaciones.
- Si la restricción se hace solo en frontend, el usuario puede seguir viendo la data real en la respuesta API.
- Si no se separa lectura básica de lectura sensible, la regla de negocio no queda correctamente modelada.

## Decisión recomendada

No tocar `admin_operativo` en este plan.

La implementación debe apoyarse en:

- permiso fino para datos sensibles
- permiso fino para exportación CSV
- privacidad aplicada en backend
- ocultamiento en frontend como segunda capa

## Próximo paso

## Estado de avance

Implementación completada para el flujo de contactos y empresas.

### Ya quedó aplicado

- Se agregaron los permisos nuevos:
  - `contacts.view_sensitive_unowned`
  - `accounts.view_sensitive_unowned`
  - `contacts.export_csv`
- La base de datos ya expone helpers de privacidad de campos sensibles.
- El backend ya evalúa visibilidad sensible por registro y aplica máscara cuando corresponde.
- La exportación CSV de contactos ya exige `contacts.export_csv`.
- El frontend de empresas ya consume la bandera `can_view_sensitive_fields`.
- El frontend de contactos ya consume la misma bandera tanto en el detalle como en la carga inicial.
- La tabla de contactos ya no pierde la bandera al refrescar filas desde el detalle.

### Ajuste final que resolvió el bug visible

- La página principal de contactos usa una carga server-side distinta a la ruta `/api/contactos/list`.
- Esa carga no estaba propagando `can_view_sensitive_fields`, por eso la tabla seguía mostrando `—` aunque el backend sí autorizaba al dueño.
- Se corrigió en `frontend/panel/src/lib/contactos/data.ts`.

### Validación realizada

- `python3 -m py_compile backend/app/repositories/crm.py backend/app/api/routes/crm.py`
- `corepack pnpm -C frontend/panel exec tsc --noEmit --pretty false`
- Verificación manual con token real:
  - contactos propios muestran teléfono y email
  - contactos ajenos quedan ocultos
  - empresas siguen respetando la regla de negocio

### Pendiente

- Solo queda mantenimiento normal o extender la misma lógica a otras vistas del CRM si aparecen casos nuevos.

Convertir este plan en cambios concretos de migración, backend y frontend.
