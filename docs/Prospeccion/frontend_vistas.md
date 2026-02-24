# Prospección · Frontend (vistas)

Ruta base: `frontend/panel/src/app/prospeccion`

## Vistas

- `buscador`
- `google-busqueda`
- `denue-busqueda`
- `prospectos`
- `contactos`
- `campanas`
- `mensajes` (simple)

## Responsabilidad por vista

### `google-busqueda`
- Ejecutar búsquedas Google.
- Filtrar resultados almacenados.
- Mapa + tabla de resultados.
- Guardar seleccionados como prospectos.
- Eliminar búsquedas recientes (individual y en bloque).
- Paginación alta en mapa y tabla de resultados almacenados (5000 por página).

### `denue-busqueda`
- Ejecutar búsquedas DENUE (normal y avanzada).
- Filtros por geografía, actividad, tamaño (`estrato`) y contactos.
- Mapa + tabla de resultados.
- Guardar seleccionados como prospectos.
- Eliminación de búsquedas recientes (individual y en bloque).
- Opción de match de contacto (`TODOS`/`CUALQUIERA`) en filtros combinados.

### `prospectos`
- Tabla principal de prospectos guardados.
- Filtros, selección masiva, edición/manual, eliminación.
- Verificación de teléfonos.
- Preparación y lanzamiento de contacto/campaña.
- Tabla configurable: orden por columnas, reordenamiento drag&drop y visibilidad de columnas.
- Ajustes visuales: densidad compacta, encabezados en mayúsculas/negrita y campos de fuente simplificados.
- Contacto WhatsApp desde modal usando proxy con cabeceras multi-tenant.

### `contactos`
- Estado de lotes y envíos.
- Reintentos, cancelación, seguimiento por estado.

### `campanas`
- Agrupación por campaña.
- Duplicación de configuración.
- KPIs por canal.

## Clientes frontend usados

Ruta: `frontend/panel/src/lib/prospeccion`

- `google-client.ts`
- `denue-client.ts`
- `prospectos-client.ts`
- `buscador-client.ts`
- `contact-utils.ts`

## Proxies API frontend

Ruta: `frontend/panel/src/app/api/prospeccion`

- Cubre Google, DENUE, Prospectos, Contacto, Campañas, Buscador y Stage resumen.
- Función: pasar token/cookies y proxear a backend `/crm/prospeccion/*`.
