# Changelog Vista Oportunidades

## 2026-06-22

- Se definio la frontera funcional entre `/embudo` y `/oportunidades`.
- `/embudo` queda como consola operativa del pipeline.
- `/oportunidades` queda como listado maestro, consulta, control y acceso rapido.
- Se acordaron reglas de CRUD: create ligero, read completo, update basico, delete secundario, move stage fuera de la vista.
- Se identifico como riesgo que el listado actual no representa necesariamente el total real por paginacion fija.
- Se genero el [backlog tecnico](/var/www/talia/docs/Plan_vista_oportunidades/backlog_tecnico.md) a partir del diagnostico por capa.
- Se definio [guia_implementacion.md](/var/www/talia/docs/Plan_vista_oportunidades/guia_implementacion.md) como archivo guia principal de ejecucion.
- Se aplico una migracion de indices para `public.oportunidades` enfocada en filtros del listado maestro.
- Se actualizo `GET /crm/oportunidades` para devolver `total` real y se ajustaron los consumidores internos del repositorio.
- Se elimino el filtrado duplicado en cliente para que `/oportunidades` dependa del contrato del backend.
- Se actualizo la carga del panel para paginar por el API hasta cubrir el universo consultado.
- Se endurecio `public.asignar_vendedor_round_robin` para que solo `service_role` pueda ejecutarla.
- Se dejo fuera de alcance `public.spatial_ref_sys` porque pertenece a PostGIS y no a la capa de negocio de GEOACTIV.
- Se agrego detalle ligero por fila en `/oportunidades` con resumen, acceso al embudo y reasignacion secundaria.
- Se agrego acceso rapido al embudo desde las acciones de cada fila en `/oportunidades`.
- Se reemplazo el sidepanel demo por una ficha formal de oportunidad dentro del drawer de la tabla.
- Se agrego `codigo_oportunidad` como identificador legible de negocio para mostrar en frontend, dejando el UUID como llave tecnica interna.
