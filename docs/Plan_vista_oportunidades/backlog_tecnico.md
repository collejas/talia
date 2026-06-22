# Backlog Tecnico Vista Oportunidades

## Objetivo

Transformar `/oportunidades` en un listado maestro real, con paginacion, total real, detalle util y acciones ligeras, dejando la operacion pesada en `/embudo`.

## P0 - Bloqueante para la definicion correcta de la vista

### Backend

1. Hacer que `GET /crm/oportunidades` devuelva total real del universo consultado.
2. Definir contrato de paginacion estable para el listado.
3. Mantener filtros estructurados en backend, no solo en cliente.
4. Revisar si el endpoint necesita `page/page_size` o `limit/offset` como contrato unico.
5. Verificar que el listado respete permisos por organizacion y scope del usuario.

### Frontend

1. Dejar de asumir que el primer lote representa todo el universo.
2. Agregar paginacion visible en la vista de oportunidades.
3. Mostrar contador de resultados reales.
4. Sincronizar filtros con paginacion.
5. Evitar que el filtrado del cliente sea la unica fuente de verdad.

### Base de datos

1. Revisar indices para filtros mas frecuentes de oportunidades.
2. Confirmar que `organizacion_id`, `etapa_id`, `asignado_a_usuario_id`, `cuenta_id`, `contacto_principal_id`, `canal` y fechas esten cubiertos para las consultas del listado.
3. Validar si hace falta indice compuesto adicional para `organizacion_id + creado_en` con filtros de asignado o canal.

### Seguridad

1. Revisar la proteccion de funciones `SECURITY DEFINER` relacionadas con reasignacion y flujos CRM.
2. Revisar el aviso de RLS en `public.spatial_ref_sys`.
3. Confirmar que el backend sigue siendo la capa de autorizacion real para lectura y escritura.

## P1 - Necesario para que la vista sea util como listado maestro

### Frontend

1. Crear un detalle formal de oportunidad.
2. Separar acciones de fila en:
   - Ver detalle.
   - Reasignar.
   - Ir al embudo.
3. Mejorar el resumen superior para que sea informativo y no duplicado del embudo.
4. Revisar columnas visibles por defecto para que el listado sea operativo.
5. Hacer que la tabla soporte mejor volumen de datos con estados vacio, cargando y error.
6. Incorporar en el detalle los bloques que hoy solo existen en el embudo:
   - Insights generados por Tal-IA.
   - Proyecto.
   - Estimacion.
   - Cotizaciones.
   - Notas.
   - Actividades.
   - Historial.
7. Sustituir UUID visibles por un codigo legible de negocio donde aplique.

### Backend

1. Exponer un endpoint de detalle si la UI lo necesita para drawer o vista individual.
2. Revisar si `GET /crm/oportunidades/{id}` debe devolver mas o menos campos para uso de listado.
3. Confirmar que la reasignacion quede como accion secundaria y no como flujo principal.
4. Alinear el contrato de respuesta para que el frontend no dependa de `metadata` para campos clave.
5. Verificar que el detalle exponga todos los campos comerciales que el embudo ya conserva como datos materiales.

### Base de datos

1. Verificar que `canal`, `contacto_nombre` y `restart_sequence` sigan siendo columnas materiales confiables.
2. Revisar si el listado necesita un indice para `organizacion_id, canal, creado_en desc`.
3. Revisar si el filtro por reinicios necesita soporte adicional.
4. Confirmar que campos como necesidades, estimacion, codigos visibles y relaciones clave existan como columnas reales y no queden escondidos en `metadata`.

## P2 - Mejoras de producto

### Frontend

1. Agregar presets de filtros frecuentes.
2. Agregar exportacion desde listado si aporta valor operativo.
3. Agregar columnas configurables por usuario.
4. Agregar acceso a historial resumido desde el detalle.
5. Agregar acciones masivas limitadas.

### Backend

1. Agregar soporte formal para exportacion si se aprueba en producto.
2. Evaluar respuestas resumidas para tarjetas o tabla ligera.
3. Revisar si las acciones secundarias necesitan endpoints dedicados.

### Base de datos

1. Evaluar indices adicionales solo si los filtros de uso real los justifican.
2. No mover logica estructural a `metadata`.

## Fuera de alcance

- Drag and drop en `/oportunidades`.
- Crear notas, actividades o cotizaciones desde el listado.
- Agendar citas desde el listado.
- Cerrar como ganada o perdida desde la tabla.
- Convertir `/oportunidades` en un duplicado funcional de `/embudo`.

## Dependencias de ejecucion

1. Primero base de datos: indices, cobertura de filtros y validacion de materializaciones.
2. Luego backend: contrato de listado, total real, paginacion y detalle.
3. Luego seguridad: permisos, scope y revision de funciones expuestas.
4. Al final frontend: tabla, paginacion, detalle, acciones ligeras y resumen.

## Criterio de terminado

La vista se considera bien implementada cuando:

- El usuario puede ver el universo completo con paginacion real.
- El listado no depende de un lote parcial.
- El detalle y las acciones ligeras no invaden la logica del embudo.
- El backend valida permisos y scope.
- La BD soporta las consultas frecuentes sin soluciones improvisadas.
