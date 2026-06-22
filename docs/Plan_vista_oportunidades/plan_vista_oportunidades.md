# Plan Vista Oportunidades

## Objetivo

Definir la vista `/oportunidades` como el listado maestro del CRM para consulta, control y acceso rapido, sin duplicar la logica operativa del embudo.

## Definicion de frontera

### `/embudo`

Consola operativa del pipeline.

Debe concentrar:

- Cambio de etapa.
- Drag and drop.
- Notas.
- Actividades.
- Cotizaciones.
- Agendamiento.
- Conversion y cierre operativo.
- Reversion de etapa.

### `/oportunidades`

Listado maestro de oportunidades.

Debe concentrar:

- Listado claro y consistente.
- Filtros funcionales.
- KPIs o resumen informativo.
- Detalle de oportunidad.
- Reasignacion rapida cuando aplique permiso.
- Acceso al embudo para operar el flujo.
- Auditoria visual y consulta rapida.

## Comparativo base con `/embudo`

### Lo que el embudo si muestra o genera y que `/oportunidades` debe poder consultar

- Identidad de la oportunidad con codigo legible de negocio y no solo UUID.
- Etapa actual, estado, vendedor, canal y datos de contexto.
- Contacto relacionado y cuenta relacionada.
- Insights generados por Tal-IA.
- Resumen o captura automatica de Tal-IA.
- Necesidades / objetivos del proyecto.
- Monto estimado.
- Probabilidad y fecha probable de cierre.
- Cotizaciones asociadas.
- Notas internas.
- Actividades.
- Historial de movimientos.
- Acciones operativas del pipeline.

### Lo que el embudo debe seguir haciendo y que `/oportunidades` no debe duplicar como flujo principal

- Crear oportunidad.
- Mover etapa.
- Drag and drop.
- Crear cotizaciones.
- Crear notas.
- Crear actividades.
- Agendar citas.
- Cerrar ganada o perdida.
- Revertir etapa.

### Lo que `/oportunidades` debe permitir de forma ligera

- Reasignar vendedor si el permiso existe.
- Ver detalle completo de lectura.
- Crear o asignar actividades si se mantiene como accion secundaria.
- Ir al embudo para operar cambios de flujo.
- Consultar toda la informacion relevante sin duplicar la logica pesada.

## Lo que si debe hacer

- Mostrar el universo de oportunidades con paginacion real.
- Permitir filtrado por etapa, estado, asignado, cuenta, persona, canal, monto, fechas y reinicios.
- Permitir busqueda por texto relevante.
- Mostrar resumen de KPIs, tendencias y totales.
- Abrir detalle desde la fila o desde una tarjeta.
- Permitir crear una oportunidad rapida solo si el flujo es ligero y no exige mover etapas.
- Permitir editar campos comerciales basicos.
- Permitir reasignar si el usuario tiene permiso.
- Llevar al usuario al embudo para mover etapa o ejecutar acciones operativas.

## Lo que no debe hacer

- No mover etapas por drag and drop.
- No crear notas, actividades o cotizaciones.
- No agendar citas desde el listado.
- No cerrar como ganada o perdida desde la tabla.
- No borrar como accion primaria.
- No convertirse en el lugar donde vive la logica del embudo.
- No depender de filtros solo del cliente para representar el total real.

## Reglas de CRUD

- Create: si, pero como alta rapida o drawer basico.
- Read: si, completo y paginado.
- Update: si, solo campos comerciales basicos.
- Delete: si, pero secundario y restringido a administradores.
- Move stage: no, eso pertenece al embudo.

## Criterios de calidad

- La vista debe responder preguntas operativas rapidas.
- La tabla debe ser util aunque haya muchas oportunidades.
- El resumen no debe competir con el tablero operativo.
- Los filtros deben corresponder a campos reales.
- El backend debe validar permisos aunque el frontend oculte acciones.

## Riesgos actuales detectados

- El listado hoy carga un lote fijo y no representa necesariamente el total.
- La vista mezcla consulta con accion operativa ligera.
- El embudo ya cubre la logica pesada y no conviene duplicarla.

## Resultado esperado

Cuando este plan se implemente:

- `/oportunidades` sera la vista maestra de consulta y control.
- `/embudo` sera la consola operativa.
- El usuario sabra donde listar, donde decidir y donde ejecutar.
