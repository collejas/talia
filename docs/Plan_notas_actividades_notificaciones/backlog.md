# Backlog notas, actividades y notificaciones

## P0

1. Permitir que un supervisor cree una actividad para un vendedor desde la oportunidad.
2. Permitir que un supervisor deje una nota visible en el contexto de la oportunidad.
3. Generar una notificacion al vendedor cuando la actividad o nota venga de un supervisor.
4. Mostrar autor y destinatario de cada accion en el detalle de oportunidad.
5. Mantener `notas`, `actividades` y `ui_notificaciones` como fuentes separadas y claras.

## P1

1. Agregar checkbox `Notificar al vendedor` en notas de supervision.
2. Agregar timeline unificado de notas y actividades en la oportunidad.
3. Agregar filtros por creador, destinatario, estado y vencimiento.
4. Permitir marcar actividad como completada desde detalle o notificacion.
5. Mostrar indicadores de acciones pendientes creadas por supervisores.

## P2

1. Plantillas rapidas para notas de supervision.
2. Plantillas rapidas para actividades recurrentes.
3. Resumen de carga de supervision por vendedor.
4. Agrupacion de notificaciones similares por oportunidad.
5. Vista de auditoria de intervenciones de supervisores en oportunidades.

## Fuera de alcance

- Convertir `/oportunidades` en la consola operativa del pipeline.
- Mover etapas por drag and drop desde este flujo.
- Crear cotizaciones desde este plan.
- Agendar citas desde este plan.
- Usar `metadata` para relaciones de negocio principales.

## Dependencias

- El backend debe preservar autoria y destinatario.
- La base debe soportar relaciones y filtros reales.
- El centro de notificaciones debe leer de `ui_notificaciones`.
- La UI debe dejar claro que la accion fue creada por un superior cuando aplique.
