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

## Objetivo funcional

La vista `/oportunidades` debe ser el listado maestro del CRM para consulta, control y acceso rapido.

No debe reemplazar al embudo como consola operativa.

## Frontera funcional

### `/embudo`

Debe seguir concentrando:

- Crear oportunidad.
- Mover etapa.
- Drag and drop.
- Crear notas.
- Crear actividades.
- Crear cotizaciones.
- Agendar citas.
- Cerrar ganada o perdida.
- Revertir etapa.

### `/oportunidades`

Debe concentrar:

- Listado claro y consistente.
- Filtros funcionales.
- KPIs o resumen informativo.
- Detalle de oportunidad.
- Reasignacion rapida si existe permiso.
- Acceso al embudo para operar el flujo.
- Consulta rapida y auditoria visual.

## Campos y secciones que `/oportunidades` debe poder consultar

### Identidad

- Codigo legible de negocio.
- UUID solo como llave tecnica interna.
- Nombre de la oportunidad.
- Estado.
- Etapa actual.
- Vendedor asignado.
- Contacto relacionado.
- Cuenta relacionada.
- Canal.

### Resumen comercial

- Monto estimado.
- Probabilidad.
- Fecha probable de cierre.
- Resumen ejecutivo.

### Insights Tal-IA

- Resumen generado por Tal-IA.
- Insight o necesidad detectada por Tal-IA.

### Proyecto

- Nombre del proyecto.
- Necesidades / objetivos.
- Contexto comercial del proyecto.

### Cotizaciones

- Cotizaciones asociadas.
- Estado de cotizacion.
- Monto.
- Historial de cotizaciones.

### Notas

- Notas internas.
- Autor de la nota.
- Fecha de creacion.

### Actividades

- Actividades abiertas.
- Actividades completadas.
- Actividades vencidas.
- Proxima actividad.

### Historial

- Movimientos de etapa.
- Reasignaciones.
- Cambios relevantes.

## Lo que no debe duplicar

- Crear oportunidad.
- Mover etapa.
- Drag and drop.
- Crear cotizaciones como flujo principal.
- Crear notas como flujo principal.
- Crear actividades como flujo principal.
- Agendar citas.
- Cerrar como ganada o perdida.

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
- Confirmar si faltan columnas materiales para necesidades, objetivos, estimacion, codigos visibles y relaciones clave que hoy solo se ven en embudo.

### Resultado esperado

- La base soporta paginacion y filtros sin degradacion innecesaria.
- La base permite consultar toda la informacion relevante sin depender de `metadata` para datos estructurales.

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
- Asegurar que el detalle devuelva campos comerciales y de seguimiento que hoy existen en embudo: insights Tal-IA, proyecto, estimacion, cotizaciones, notas, actividades e historial.

### Resultado esperado

- El frontend puede paginar y mostrar el universo real de oportunidades.
- El frontend puede mostrar el mismo universo informativo que hoy existe en embudo, pero sin heredar la operacion pesada.

## Fase 3. Seguridad

### Objetivo

Confirmar que lectura y escritura siguen protegidas por backend y por la capa de datos.

### Tareas

- Revisar permisos para listado, detalle, edicion y eliminacion.
- Revisar la accion de reasignacion y sus permisos asociados.
- Confirmar que reasignar vendedor desde `/oportunidades` no cambie la logica principal de propiedad ni convierta la vista en consola operativa.
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
- Mostrar los bloques informativos que hoy estan en embudo pero no en oportunidades.

### Resultado esperado

- El usuario entiende que `/oportunidades` es consulta y control, no operacion pesada.
- El usuario ve toda la informacion relevante de la oportunidad sin tener que abrir el embudo para leerla.

## Regla de trabajo

- No iniciar frontend antes de cerrar BD, backend y seguridad.
- No mover logica operativa del embudo a la vista de oportunidades.
- No usar `metadata` para resolver problemas que ya deben quedar modelados.
- Mantener este archivo como guia de implementacion principal y actualizarlo antes de bajar decisiones a backlog suelto.

## Criterio de cierre

La implementacion queda lista cuando:

- La tabla pagina con total real.
- Los filtros funcionan contra el universo real.
- Las acciones operativas viven en el embudo.
- Los permisos estan validados por backend.
- La base soporta el uso real de la vista.
