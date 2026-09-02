# Edición directa de unidades desde el mapa

Fecha: 2026-09-02 (UTC)

Estado: Idea documentada / pendiente de implementación

## Objetivo

Permitir que, al visualizar las unidades de una manzana en `/settings/propiedades`, el usuario pueda hacer clic directamente sobre una unidad para abrir su modal de edición CRUD y modificar sus características internas.

La unidad seleccionada debe permanecer ubicada dentro del contexto de la manzana: las demás unidades deben continuar visibles y la unidad seleccionada debe resaltarse visualmente.

## Problema actual

Actualmente, el usuario debe seleccionar la unidad desde el árbol del panel izquierdo para iniciar su edición. El mapa funciona principalmente como editor de geometría y no abre el modal de características internas cuando se hace clic sobre una unidad.

Además, existe un flujo de aislamiento de unidades en la vista de visualización 3D/Mapbox que puede ocultar las demás unidades. Ese comportamiento no debe aplicarse al CRUD de `/settings/propiedades`, porque impide entender la ubicación relativa de la unidad que se está editando.

## Flujo deseado

1. El usuario selecciona una manzana.
2. El mapa muestra todas las unidades de esa manzana.
3. El usuario hace clic directamente sobre una unidad.
4. Todas las unidades permanecen visibles.
5. La unidad seleccionada cambia de color y muestra un borde destacado.
6. Se abre el modal `Editar unidad`.
7. El usuario modifica las características internas de la unidad.
8. El usuario guarda los cambios.
9. El frontend ejecuta el PATCH existente y recarga la jerarquía.
10. La unidad actualizada continúa identificada visualmente hasta que el usuario seleccione otra.

## Características internas que se editan

El modal debe editar únicamente los atributos CRUD de `propiedad_unidades`, entre ellos:

- clave de unidad;
- nombre comercial;
- tipo comercial;
- status;
- destino del inventario;
- forma de precio;
- precio o precio por m²;
- área;
- línea, familia y modelo;
- descripción;
- metadata opcional.

## Separación respecto a la geometría

La edición de atributos y la edición del polígono son flujos diferentes.

Este cambio no debe:

- abrir el editor de `leaflet-draw`;
- cambiar `geometryTarget`;
- reemplazar `formValues.geom`;
- ocultar las unidades hermanas;
- modificar la geometría de la unidad;
- cambiar el botón o flujo existente para editar polígonos.

El botón de edición de polígono debe continuar utilizando el flujo independiente de `handleSelectUnidadGeometry`.

## Diseño técnico previsto

### Frontend

El componente `PropiedadGeomEditor` debe exponer un callback de selección de feature, separado de `onGeometryChange`.

El callback debe informar la unidad seleccionada al `PropiedadForm`. El formulario debe:

1. localizar la unidad y sus padres dentro de la jerarquía cargada;
2. guardar un estado visual independiente, por ejemplo `selectedUnidadId`;
3. aplicar `highlightId` únicamente para resaltar la unidad;
4. ejecutar `openEditUnidadModal(desarrollo, capa, unidad)`;
5. conservar todas las features de la manzana en el mapa.

El estado `geometryTarget` debe seguir reservado para el editor de polígonos.

### Backend

El backend ya cuenta con el contrato necesario para actualizar la unidad:

```text
PATCH /crm/propiedad-unidades/{unidad_id}
```

El adaptador Next.js correspondiente es:

```text
frontend/panel/src/app/api/crm/propiedad-unidades/[unidadId]/route.ts
```

No se prevé una nueva ruta ni una migración de base de datos para esta mejora.

### Base de datos

La unidad ya tiene sus atributos CRUD en `public.propiedad_unidades` y su geometría independiente en `public.propiedad_poligonos` mediante `target_type = 'unidad'` y `target_id`.

La relación de contexto se conserva mediante:

```text
propiedad_unidades.manzana_id
propiedad_unidades.nivel_id
propiedad_unidades.desarrollo_id
```

## Criterios de aceptación

- Al hacer clic sobre una unidad del mapa se abre el modal de edición CRUD.
- El modal contiene los datos de la unidad que recibió el clic.
- Las demás unidades de la manzana no desaparecen.
- La unidad seleccionada tiene un color y borde diferenciados.
- Cancelar el modal no modifica datos.
- Guardar actualiza únicamente los atributos de la unidad.
- El polígono no cambia al editar atributos.
- El botón de edición de polígono conserva su comportamiento actual.
- La unidad permanece asociada a la misma manzana, capa y desarrollo.
- Se valida el flujo con una manzana que tenga múltiples unidades y polígonos.

## Fuera de alcance

- Rediseño de la vista Mapbox 3D.
- Cambio de estados comerciales o del flujo de ventas.
- Nuevas tablas o columnas.
- Edición geométrica desde el clic de atributos.
- Cambios al importador CSV.

## Archivos inicialmente involucrados

- `frontend/panel/src/components/settings/propiedades/propiedad-geom-editor.tsx`
- `frontend/panel/src/components/settings/propiedades/propiedad-form.tsx`
- `frontend/panel/src/app/api/crm/propiedad-unidades/[unidadId]/route.ts`
- `backend/app/api/routes/crm.py` únicamente para validar ownership y contrato existente, si aplica.

## Próximo paso

Implementar primero el callback de clic de unidad en `PropiedadGeomEditor` y conectarlo con el modal existente de `PropiedadForm`. Después validar el flujo completo con persistencia real y comprobar que el editor de polígonos no se vea afectado.
