# Plan: Alta/edición/borrado manual de prospectos

## Objetivos
- Permitir a cualquier usuario autenticado **crear prospectos manualmente** desde la vista `/prospeccion/prospectos`.
- Habilitar la **edición y eliminación** de prospectos, sin importar si provienen de Google/DENUE o fueron cargados por un usuario.
- Marcar los prospectos manuales en `fuente/contexto` como `usuario`.
- Registrar un **historial/auditoría** de los cambios aplicados sobre cada prospecto.

## Alcance técnico

### Backend
1. **Modelo de datos**
   - Tabla `prospeccion_prospectos` ya soporta los campos necesarios. Añadir columna `creado_por` / `actualizado_por` (UUID) para auditar usuarios y ayudar en el historial si no existe.
   - Crear tabla `prospeccion_prospectos_audit` (id, prospecto_id, usuario_id, accion, payload, creado_en) para registrar altas/ediciones/borrados.

2. **Endpoints nuevos**
   - `POST /prospeccion/prospectos/manual` – crea un prospecto con validaciones (nombre o display_name obligatorio, teléfono/email opcional). `fuente='usuario'`.
   - `PATCH /prospeccion/prospectos/{id}` – actualiza campos editables; registra la acción en auditoría.
   - `DELETE /prospeccion/prospectos/{id}` – elimina registro y guarda entrada de auditoría.

3. **Seguridad**
   - Requiere usuario autenticado (no sólo admin). Usar `require_user_token`.
   - Validación de ownership no aplica: cualquier usuario puede editar/borrar según requisitos.

4. **Auditoría**
   - En cada POST/PATCH/DELETE insertar registro en `prospeccion_prospectos_audit`.
   - Guardar payload previo/posterior (ej. JSON con cambios) para trazabilidad.

5. **Lookup/Contacto**
   - Sin cambios, pero al editar un prospecto manual actualizar campos `lookup_status` si se modifica el teléfono (opcional: resetear a `pendiente`).

### Frontend
1. **Formulario de creación**
   - Botón “Agregar prospecto” abre modal con campos: Nombre, Actividad, Teléfono, Email, Dirección, Segmento, notas (metadata).
   - Enviar a `POST /api/prospeccion/prospectos/manual`.

2. **Edición**
   - Acción por fila (ícono “Editar”) abre modal prellenado que llama `PATCH`.
   - Permitir cambiar datos básicos; mostrar validaciones.

3. **Eliminación**
   - Botón/menú contextual “Eliminar” con confirmación. Llama a `DELETE`.

4. **UI/UX**
   - Mostrar `fuente` en la tabla (ya existe) para ver `Usuario`.
   - Opcional: badge que indique “Manual”.
   - Tal vez mostrar historial en un drawer futuro (no obligatorio ahora).

5. **Estado**
   - Tras crear/editar/borrar, refrescar tabla con `listProspectos`.

### Pasos propuestos
1. **Migraciones**
   - Agregar `creado_por`, `actualizado_por` (UUID) con default `auth.uid()` si aplica.
   - Tabla `prospeccion_prospectos_audit`.
2. **Backend**
   - Endpoints y servicios (validaciones + repo methods insert/update/delete/audit).
3. **Frontend**
   - Componentes de formulario, modales y llamadas `manualCreate`, `update`, `delete`.
4. **QA**
   - Pruebas manuales: crear prospecto, editar, eliminar, verificar que lookup/contacto sigue operando.
   - Revisar que registros manuales se etiqueten como `Usuario`.

Con esto cubrimos el flujo completo solicitado. Cuando apruebes este plan procedemos a implementar.***
