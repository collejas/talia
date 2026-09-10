# Change log - Plan importador de contactos

Este archivo registra el avance, las decisiones y las validaciones del plan documentado en `PLAN_IMPORTADOR_CONTACTOS.md`.

## Estado actual

- Estado: `Configuración de correo corregida; pendiente prueba autenticada completa del importador`
- Última actualización: 2026-09-10 (UTC)
- Código implementado: sí
- Migración creada: sí; aplicada en Supabase: sí
- Despliegue realizado: API reiniciada con la corrección; frontend ya contenía la integración previa
- Prueba funcional autenticada: pendiente

## 2026-09-10 - Diagnóstico y documentación inicial

### Agregado

- Idea de negocio para importar contactos desde CSV/XLSX.
- Restricción de acceso para roles `vendedor`, `agente` y `supervisor`, además de usuarios `owner` y `admin`.
- Regla de ownership: el contacto queda asignado al usuario que sube el archivo.
- Inventario de componentes actuales de Contactos.
- Inventario del importador existente de prospectos.
- Propuesta de endpoint `POST /crm/personas/importar`.
- Plan por fases: confirmación funcional, seguridad/contrato, backend, frontend y validación real.
- Riesgos y controles de seguridad.
- Criterios de terminado.

### Encontrado

- La vista usa `contacts-data-table.tsx` como barra de acciones y ya consulta el contexto de permisos.
- El frontend ya reconoce los roles comerciales `vendedor` y `agente`; `supervisor`, `owner` y `admin` deberán incorporarse a la condición final.
- El modelo canónico de contactos usa `personas` y tiene `propietario_usuario_id`.
- El alta individual existente usa `POST /crm/personas/alta`.
- El importador existente corresponde a prospectos y no debe conectarse directamente al flujo de Contactos.
- Existe una migración con lógica de autoasignación de contactos creados por vendedores, pero el nuevo importador debe forzar explícitamente el propietario desde la sesión en backend.

### No realizado

- No se modificó código.
- No se modificó el esquema ni se ejecutaron migraciones.
- No se modificaron datos.
- No se hizo deploy.
- No se declaró ownership funcionalmente probado.

### Pendientes inmediatos

- Confirmar el identificador exacto del rol `supervisor` en cada tenant (`supervisor`, código interno u otro alias).

## 2026-09-10 - Ampliación de perfiles autorizados

### Decisión

- Se amplió el acceso propuesto para incluir `supervisor`, `owner` y `admin`, además de `vendedor` y `agente`.
- La regla de asignación no cambia: cada contacto queda asignado al usuario autenticado que realiza la importación.
- Estos perfiles no podrán indicar desde el archivo que el contacto pertenece a otro vendedor.

### Pendiente

- Verificar el nombre o código real del rol `supervisor` en la matriz de permisos de cada tenant.
- Confirmar columnas mínimas y formato oficial del archivo.
- Definir tratamiento de duplicados existentes.
- Definir límite inicial de filas y tamaño de archivo.

## 2026-09-10 - Primera implementación

### Cambiado

- Se agregó `ContactosImportador` en la barra de acciones de Contactos.
- Se agregó soporte de lectura CSV/XLSX en el navegador con vista previa y plantilla descargable.
- Se agregó el proxy `POST /api/personas/importar`.
- Se agregó el endpoint `POST /crm/personas/importar`.
- El endpoint acepta `vendedor`, `agente`, `supervisor`, `owner` y `admin`.
- El propietario se fuerza desde el usuario autenticado y no se acepta desde el archivo.
- Se agregó deduplicación dentro del archivo y contra correo/teléfono existentes en el tenant.
- La tabla se recarga después de una importación exitosa.
- La autorización de roles se evalúa con ciclos async explícitos.
- El propietario en producción se obtiene únicamente del `sub` validado del JWT; el encabezado de usuario solo se tolera en pruebas.

### Validado

- `python3 -m py_compile backend/app/api/routes/crm.py` pasó.
- `git diff --check` pasó.
- Lint focalizado de los archivos frontend modificados terminó sin errores reportados.
- React Doctor terminó con puntuación 100/100 y sin hallazgos.
- `tests/api/test_contact_import.py` pasó con `2 passed`.

### Pendiente

- Ejecutar pruebas automatizadas específicas del endpoint con repositorio simulado.
- Confirmar en un tenant real el código/nombre del rol `supervisor`.
- Ejecutar prueba autenticada real y comprobar en base de datos el `propietario_usuario_id` persistido.
- Completar prueba visual en viewport normal.
- Corregir o separar los fallos preexistentes observados en `tests/api/test_crm_routes.py`; no corresponden al importador.

## Formato para futuras entradas

Cada cambio debe registrar:

```text
## YYYY-MM-DD - Título

### Cambiado
- ...

### Validado
- ...

### Pendiente
- ...

### Riesgos
- ...
```

## 2026-09-10 - Integración con permisos configurables de Settings/RH

### Cambiado
- Se reemplazó la validación hardcodeada por roles en el importador por el permiso `contacts.import`.
- El frontend de Contactos ahora muestra el botón por permiso, manteniendo bypass para `owner` y `admin`.
- El backend valida el mismo permiso desde el contexto autenticado y conserva el ownership en el usuario de sesión.

## 2026-09-10 - Corrección de lectura de configuración en Contactos

### Encontrado
- La configuración del tenant sí se estaba guardando: la base contiene un tenant con `correo_contacto_obligatorio = false`.
- `/api/personas/catalogos/config` devolvía `403` porque el BFF envía `X-Organizacion-Id` también para usuarios normales.
- El backend trataba cualquier encabezado como un cambio de tenant reservado a administradores de plataforma.
- Al fallar la lectura, el frontend aplicaba correctamente su valor seguro predeterminado: correo obligatorio.

### Cambiado
- `require_tenant_context` ahora acepta el encabezado cuando coincide con el tenant propio del usuario.
- Se mantiene la restricción para cambiar a un tenant distinto: solo un administrador de plataforma puede hacerlo.
- Se agregaron pruebas para el contexto propio y se actualizaron las pruebas existentes para incluir el request HTTP.

### Validado
- Pruebas de contexto e importador: `7 passed`.
- Compilación Python de `tenant.py`: pasó.
- `git diff --check`: pasó.

### Validación posterior
- API reiniciada y quedó `active/running` con un nuevo proceso.

### Pendiente
- Repetir la prueba autenticada en Contactos: leer configuración `200`, crear contacto sin correo y confirmar persistencia.
- Se agregó el permiso a la provisión de nuevos tenants.
- Se creó la migración `20260910223548_add_contacts_import_permission.sql` para tenants existentes.
- La migración asigna inicialmente el permiso a roles existentes llamados `vendedor`, `agente` y `supervisor`; después puede quitarse o reasignarse desde la matriz de roles.

### Validado
- La matriz existente de `settings/usuarios/roles` ya permite asignar y quitar `contacts.import`.
- La edición existente de usuarios ya permite asignar y quitar los roles correspondientes.
- No se agregó una tabla de permisos por usuario; se reutiliza el modelo RBAC actual.

### Pendiente
- Aplicar la migración en Supabase siguiendo el procedimiento de despliegue.
- Ejecutar prueba autenticada con un usuario autorizado y otro sin `contacts.import`.
- Confirmar en base de datos que `propietario_usuario_id` coincide con el usuario que subió el archivo.
- Ejecutar prueba visual en viewport normal.

## 2026-09-10 - Corrección de validación TypeScript en despliegue

### Encontrado
- `scripts/deploy_panel_atomic.sh` detuvo el release antes de publicar porque TypeScript rechazó los encabezados `readonly` de la plantilla XLSX.
- El problema estaba en `contactos-importador.tsx`, al pasar `TEMPLATE_HEADERS` a `xlsx.utils.aoa_to_sheet`.

### Corregido
- Se tipó `TEMPLATE_HEADERS` como `string[]` mutable, compatible con `xlsx`.

### Pendiente
- Repetir el despliegue y confirmar que el release pase `tsc`, build, cambio atómico y reinicio de API.

## 2026-09-10 - Aplicación de permiso en Supabase

### Cambiado
- Se aplicó la migración `add_contacts_import_permission` en Supabase.
- Se creó `contacts.import` con descripción `Importar contactos` para las organizaciones existentes.
- Se asignó inicialmente a los roles existentes `agente` y `supervisor`.

### Validado
- La migración remota quedó registrada con versión `20260910223548`.
- Consulta remota confirmó el permiso en 9 organizaciones y su asignación a `agente` y `supervisor`.

### Pendiente
- Refrescar la vista `settings/usuarios/roles` con una sesión nueva o recarga completa para comprobar la matriz visual.
- Marcar el permiso para el rol `agente` del tenant operativo si se requiere una validación específica.
- Ejecutar una importación autenticada y comprobar `propietario_usuario_id`.

## 2026-09-10 - Configuración por tenant del correo obligatorio

### Cambiado
- Se agregó `organizaciones.correo_contacto_obligatorio boolean NOT NULL DEFAULT true`.
- Se expuso la configuración en `Settings > Variables`.
- Solo `settings.manage`, owner y admin pueden modificarla.
- La regla se devuelve junto con los catálogos de Contactos y se refleja en altas, ediciones e importaciones.
- Con `true`, el correo sigue siendo obligatorio; con `false`, se puede conservar vacío en contactos nuevos y existentes.
- Se mantuvo la base de datos compatible con históricos sin correo.

### Validado
- Migración `contact_email_requirement_per_tenant` aplicada en Supabase.
- Las 9 organizaciones existentes quedaron con `correo_contacto_obligatorio = true`.
- Pruebas de importación: permiso, admin y tenant con correo opcional.

### Pendiente
- Repetir deploy del backend y panel.
- Cambiar temporalmente la opción a `No` en un tenant y probar alta, edición e importación de un contacto sin correo.
