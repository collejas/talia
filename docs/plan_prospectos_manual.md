# Plan: Alta/edición/borrado manual de prospectos

## Contexto actual (backup `postgres_20251126_154328`)
- La tabla `public.prospeccion_prospectos` (ver backup `backups/postgres_20251126_154328/postgres_20251126_154328_schema.sql:10434`) no tiene columnas `creado_por/actualizado_por`, sólo `creado_en` y `actualizado_en`.
- El tipo `public.fuente_resultado` admite únicamente `google_places` y `denue` (línea 388 del mismo backup), por lo que no podemos marcar un prospecto manual como “Usuario” sin migrar ese enum.
- La vista de interfaz `/prospeccion/prospectos` está implementada en `frontend/panel/src/app/prospeccion/prospectos/page.client.tsx` y sólo ofrece listar, verificar teléfonos y contactar; no hay UI para CRUD manual.
- El backend expone `GET/POST /crm/prospeccion/prospectos` en `backend/app/api/routes/crm.py` que depende de métodos en `backend/app/repositories/crm.py`; no existen endpoints de creación manual, edición o eliminación.

## Objetivos funcionales
- Permitir que cualquier usuario autenticado agregue prospectos manuales desde la vista `/prospeccion/prospectos`.
- Marcar automáticamente los prospectos creados manualmente con `fuente = 'usuario'` y mostrar “Usuario” en la interfaz.
- Habilitar edición y eliminación para todos los prospectos (manuales o importados desde Google/DENUE).
- Registrar un historial/auditoría detallado de cada alta, edición y borrado.

## Plan técnico

### 1. Base de datos (Supabase/Postgres)
1. **Actualizar enum `public.fuente_resultado`**
   - Crear migración que agregue el valor `'usuario'`. Asegurarse de actualizar también cualquier validación o `CHECK` que dependa del enum (buscar en `supabase/migrations`).
2. **Columnas de autoría**
   - Añadir `creado_por uuid DEFAULT auth.uid()` y `actualizado_por uuid DEFAULT auth.uid()` en `prospeccion_prospectos`.
   - Ajustar trigger `t_prospeccion_prospectos_touch` (o crear uno nuevo) para actualizar `actualizado_por` con `auth.uid()` si está disponible.
3. **Tabla de auditoría**
   - Crear `public.prospeccion_prospectos_audit` con columnas mínimas: `id uuid`, `prospecto_id uuid`, `accion text` (`insert`/`update`/`delete`), `cambios jsonb`, `realizado_por uuid`, `realizado_en timestamptz default now()`.
   - Crear `AFTER INSERT OR UPDATE OR DELETE` trigger en `prospeccion_prospectos` que inserte un registro con:
     - `accion` según operación.
     - `cambios`: para INSERT guardar `row_to_json(NEW)`, para UPDATE almacenar `jsonb_strip_nulls(to_jsonb(NEW) - to_jsonb(OLD))` o similar, y para DELETE `row_to_json(OLD)`.
     - `realizado_por`: `auth.uid()` si existe, de lo contrario `NEW.creado_por`/`OLD.actualizado_por`.
4. **Índices y políticas**
   - Crear índice por `prospecto_id` en la tabla de auditoría para consultas.
   - Habilitar RLS y políticas `SELECT` para `authenticated` (sólo lectura) y `INSERT` restringida al trigger (usando `WITH CHECK (false)` y `SECURITY DEFINER` en la función) para evitar escrituras manuales desde el cliente.

### 2. Backend (FastAPI `backend/app/api/routes/crm.py`)
1. **Modelos/Payloads**
   - Crear `ProspectoManualPayload` (campos requeridos: `display_name`, `segmento?`, `phone`, `email`, `website`, `address`, `metadata`).
   - Reutilizar un `ProspectoUpdatePayload` para `PATCH` y validar que al menos un campo editable venga en el cuerpo. Forzar `fuente='usuario'` en creaciones.
2. **Endpoints**
   - `POST /crm/prospeccion/prospectos/manual`: valida payload, llama a nuevo método repo `create_prospecto_manual` que inserte en `/rest/v1/prospeccion_prospectos` con `fuente='usuario'`, `fuente_busqueda='manual'`, `creado_por=auth.uid()` y `lookup_status='pendiente'`. Devuelve registro creado.
   - `PATCH /crm/prospeccion/prospectos/{id}`: acepta campos editables (nombre, actividad, contacto, metadata, segmento). Si cambia `phone` o `email`, resetear `lookup_status` a `pendiente` y limpiar `lookup_error`, `whatsapp_permitido`, `llamada_permitida`.
   - `DELETE /crm/prospeccion/prospectos/{id}`: elimina el registro vía repo y devuelve `{ok: true}`.
   - Todos los endpoints deben usar `require_user_token`, capturar errores del repo y confiar en la tabla de auditoría para el historial.
3. **Repositorio (`backend/app/repositories/crm.py`)**
   - Agregar `create_prospecto_manual`, `delete_prospecto` y, si es necesario, `get_prospecto_by_id` para precargar datos antes de editar.
   - `create_prospecto_manual`: `POST` a `/rest/v1/prospeccion_prospectos` sin `on_conflict`. Incluir `usuario_token`.
   - `delete_prospecto`: `DELETE /rest/v1/prospeccion_prospectos?id=eq.{uuid}` con `prefer=return=representation` para confirmar.
   - Ajustar `list_prospectos` para aceptar `fuente=usuario` y exponer `fuente` en respuesta (ya ocurre) además de `creado_por/actualizado_por`.
4. **Validaciones/comportamiento adicional**
   - Confirmar que cualquier prospecto (sin importar `fuente`) pueda pasar por `PATCH/DELETE` según requisitos.
   - Opcional: exponer `audit` vía `GET /crm/prospeccion/prospectos/{id}/historial` leyendo de la nueva tabla para futuras vistas (no requerido ahora, pero dejar helper repo preparado para cuando se pida).

### 3. Frontend (Next.js en `frontend/panel`)
1. **Cliente HTTP (`src/lib/prospeccion/prospectos-client.ts`)**
   - Extender `ProspectoItem["fuente"]` para incluir `"usuario"`.
   - Añadir funciones `crearProspectoManual`, `actualizarProspecto`, `eliminarProspecto`.
   - Hacer que `listProspectos` acepte `fuente="usuario"` en filtros.
2. **API Routes**
   - `src/app/api/prospeccion/prospectos/route.ts`: soportar `PATCH`/`DELETE`? Mejor crear archivo `src/app/api/prospeccion/prospectos/[prospectoId]/route.ts` que proxee `PATCH/DELETE` al backend (`/crm/prospeccion/prospectos/{id}`).
   - Añadir `POST /api/prospeccion/prospectos/manual` si preferimos separar la creación manual del endpoint existente (que hoy espera `resultado_ids`). Este route proxeará al backend nuevo.
3. **Vista `ProspectosView`**
   - Agregar botón “Agregar prospecto” que abre un modal/form. Reutilizar componentes `Dialog`, `Input`, `Textarea` y `Select` ya usados.
   - Para cada fila, agregar menú contextual (tres puntos o botones inline) con “Editar” y “Eliminar”.
   - Crear componente `ProspectoFormModal` con estado local y validaciones (mostrar errores cuando falte `display_name` o ambos `phone/email` vacíos si se define esa regla).
   - Al guardar/editar/eliminar, mostrar banners (reaprovechar `BannerState`) y refrescar `listProspectos`.
   - Actualizar `FUENTE_LABELS` para incluir `"Usuario"`. Mostrar distintivo `Badge` extra si el registro fue editado (opcional).
   - Deshabilitar botones mientras se ejecutan las mutaciones para no duplicar solicitudes.
4. **UX específica**
   - Cuando se edite un prospecto importado, advertir que se sobrescriben datos originales (tooltip o mensaje en modal).
   - Para borrado, mostrar `Dialog` de confirmación con nombre del prospecto y detallar que también se eliminará su historial/contactos (respetando cascada actual por FK).
   - Mantener accesibilidad: labels asociados y mensajes de error debajo de inputs.

### 4. Historial/Auditoría visible (fase mínima)
- Aunque el backend registrará el historial automáticamente, en esta iteración sólo verificaremos que existan registros (consultando directamente con `psql` o Supabase). Si el usuario requiere una UI, se planeará después.
- Probar que cada acción (crear/editar/borrar desde panel, guardar desde búsquedas) produce filas en `prospeccion_prospectos_audit`.

### 5. QA y validaciones
1. **Backend**
   - Agregar tests en `backend/tests` que cubran `POST /prospeccion/prospectos/manual`, `PATCH`, `DELETE`. Mockear `CRMRepository` cuando aplique.
   - Tests unitarios para `create_prospecto_manual`/`delete_prospecto` en el repo usando `httpx` mock.
2. **Frontend**
   - Añadir pruebas ligeras de componentes (React Testing Library) para el modal si el esfuerzo es razonable.
   - Como mínimo, QA manual: crear prospecto, editarlo (confirmar badge “Usuario”), eliminarlo, editar registro importado.
3. **Migraciones**
   - Ejecutar `supabase db lint` o planificador equivalente antes de aplicar migraciones.
   - Documentar en `README` o `docs/plan_prospectos_manual.md` cómo correr las migraciones y cómo revertir.

## Salidas esperadas
- Migración aplicada que introduce el nuevo origen `usuario`, campos de autoría y la tabla de auditoría.
- Backend con endpoints CRUD manuales y repos actualizados.
- Vista `/prospeccion/prospectos` con UI para crear, editar y eliminar prospectos (incluyendo los importados) y reflejando el origen “Usuario”.
- Auditoría persistiendo automáticamente cada cambio y lista para explotarse más adelante.

Con este plan cubrimos los requisitos descritos por el usuario y dejamos claro qué archivos deberán modificarse para implementarlo. Cuando des luz verde empezamos con las migraciones y el desarrollo.
