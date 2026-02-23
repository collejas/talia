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

### `denue-busqueda`
- Ejecutar búsquedas DENUE (normal y avanzada).
- Filtros por geografía, actividad, tamaño (`estrato`) y contactos.
- Mapa + tabla de resultados.
- Guardar seleccionados como prospectos.

### `prospectos`
- Tabla principal de prospectos guardados.
- Filtros, selección masiva, edición/manual, eliminación.
- Verificación de teléfonos.
- Preparación y lanzamiento de contacto/campaña.

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

