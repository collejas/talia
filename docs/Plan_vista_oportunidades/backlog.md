# Backlog Vista Oportunidades

## P0

1. Implementar paginacion real en el listado de oportunidades.
2. Exponer total real de oportunidades en backend.
3. Evitar que el filtrado dependa solo del lote cargado en cliente.
4. Mantener la reasignacion, pero con permisos claros y desde accion secundaria.
5. Separar visualmente acciones de consulta y acciones operativas.

## P1

1. Agregar drawer o pagina de detalle de oportunidad.
2. Permitir edicion de campos comerciales basicos desde la vista.
3. Agregar acceso directo a embudo desde cada fila.
4. Definir vistas guardadas o presets de filtros frecuentes.
5. Mejorar KPIs con totales utiles para operacion diaria.

## P2

1. Agregar exportacion controlada desde el listado.
2. Agregar columnas configurables por usuario.
3. Agregar indicadores de actividad reciente por oportunidad.
4. Agregar acceso a historial resumido desde la fila.
5. Agregar acciones masivas limitadas y seguras.

## Fuera de alcance

- Drag and drop en listado.
- Notas y actividades desde el listado.
- Cotizaciones desde el listado.
- Agendamiento desde el listado.
- Cierre de oportunidad desde la tabla.
- Reglas de automatizacion del pipeline dentro de `/oportunidades`.

## Dependencias

- Backend debe devolver paginacion y total reales.
- El detalle de oportunidad debe reutilizar contratos ya existentes.
- Permisos deben revisarse en backend, no solo en frontend.
- La vista debe mantener coherencia con el embudo ya existente.

