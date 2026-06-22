# Guia de Implementacion Vista Oportunidades

## Archivo guia principal

Este archivo es la guia principal de implementacion:

- [guia_implementacion.md](/var/www/talia/docs/Plan_vista_oportunidades/guia_implementacion.md)

Documentos de soporte:

- [Plan maestro](/var/www/talia/docs/Plan_vista_oportunidades/plan_vista_oportunidades.md)
- [Diagnostico tecnico](/var/www/talia/docs/Plan_vista_oportunidades/diagnostico_tecnico.md)
- [Backlog tecnico](/var/www/talia/docs/Plan_vista_oportunidades/backlog_tecnico.md)
- [Backfill](/var/www/talia/docs/Plan_vista_oportunidades/backfill.md)
- [Changelog](/var/www/talia/docs/Plan_vista_oportunidades/changelog.md)

## Orden de implementacion

1. Base de datos.
2. Backend.
3. Seguridad.
4. Frontend.

## Fase 1. Base de datos

### Objetivo

Asegurar que el modelo soporte listado maestro, filtros, auditoria y crecimiento sin depender de trucos de cliente.

### Tareas

- Revisar indices de `public.oportunidades` para filtros frecuentes.
- Confirmar cobertura de `organizacion_id`, `etapa_id`, `asignado_a_usuario_id`, `cuenta_id`, `contacto_principal_id`, `canal` y fechas.
- Confirmar o crear un `codigo_oportunidad` legible para usuario, independiente del UUID maestro.
- Validar si falta indice compuesto para listados frecuentes.
- Revisar que las columnas materializadas sigan siendo confiables.
- Permitir busqueda por `codigo_oportunidad` ademas de titulo, contacto y cuenta.

### Resultado esperado

- La base soporta paginacion y filtros sin degradacion innecesaria.

## Fase 2. Backend

### Objetivo

Definir un contrato de listado real, estable y compatible con la vista maestra.

### Tareas

- Hacer que `GET /crm/oportunidades` devuelva total real.
- Formalizar el contrato de paginacion.
- Exponer `codigo_oportunidad` para que el frontend muestre un identificador humano, no el UUID maestro.
- Hacer que la busqueda por `q` también reconozca el código legible de oportunidad.
- Confirmar si el contrato sera `limit/offset` o `page/page_size`.
- Mantener filtros en backend como fuente principal.
- Exponer detalle si la UI lo necesita para drawer o pagina individual.

### Resultado esperado

- El frontend puede paginar y mostrar el universo real de oportunidades.

## Fase 3. Seguridad

### Objetivo

Confirmar que lectura y escritura siguen protegidas por backend y por la capa de datos.

### Tareas

- Revisar permisos para listado, detalle, edicion y eliminacion.
- Revisar la accion de reasignacion y sus permisos asociados.
- Revisar funciones `SECURITY DEFINER` expuestas por Supabase.
- Revisar el aviso de RLS en `public.spatial_ref_sys` solo si existe una necesidad real fuera de PostGIS; por ahora queda fuera de alcance porque es parte de la extension.

### Resultado esperado

- La vista queda protegida aunque el frontend oculte o muestre acciones.

## Fase 4. Frontend

### Objetivo

Convertir `/oportunidades` en un listado maestro claro, util y consistente.

### Tareas

- Implementar paginacion real en la tabla.
- Mostrar total real de registros.
- Agregar o formalizar detalle de oportunidad.
- Mantener reasignacion como accion secundaria.
- Agregar acceso rapido al embudo.
- Separar visualmente acciones de consulta y acciones operativas.

### Resultado esperado

- El usuario entiende que `/oportunidades` es consulta y control, no operacion pesada.

## Regla de trabajo

- No iniciar frontend antes de cerrar BD, backend y seguridad.
- No mover logica operativa del embudo a la vista de oportunidades.
- No usar `metadata` para resolver problemas que ya deben quedar modelados.

## Criterio de cierre

La implementacion queda lista cuando:

- La tabla pagina con total real.
- Los filtros funcionan contra el universo real.
- Las acciones operativas viven en el embudo.
- Los permisos estan validados por backend.
- La base soporta el uso real de la vista.
