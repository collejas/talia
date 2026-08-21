# Changelog — Listas de precios

Registro de avances, cambios aplicados, verificaciones y pendientes de la funcionalidad de listas de precios.

## 2026-08-21

### Base de datos — completado

- Se revisó el esquema real de Supabase para productos, precios, cotizaciones, usuarios, roles, empleados, permisos y auditoría.
- Se confirmó que el panel actual utiliza `catalog_items.precio_base`.
- Se confirmó que `catalog_item_prices` existía, pero no tenía uso como historial automático y tenía cero registros.
- Se creó y aplicó mediante MCP Supabase la migración:
  - `supabase/migrations/20280821_120000_listas_precios_foundation.sql`
- Se crearon las tablas:
  - `listas_precios`.
  - `listas_precios_roles`.
  - `listas_precios_usuarios`.
  - `listas_precios_empleados`.
  - `catalog_item_lista_precios`.
  - `catalog_price_history`.
- Se agregaron foreign keys, constraints, índices y RLS multi-tenant.
- Se agregaron triggers para registrar automáticamente cambios del `Precio base` y precios de listas.
- Se generaron 1,702 registros iniciales del `Precio base` como referencia de migración.
- Verificación remota posterior a la migración:
  - `listas_precios`: 0 registros iniciales, listo para configuración del tenant.
  - `catalog_item_lista_precios`: 0 registros iniciales, listo para capturar precios por lista.
  - `catalog_price_history`: 1,702 registros.
  - Historial de tipo `base`: 1,702 registros.
  - Historial de tipo `lista`: 0 registros iniciales.
  - RLS activo en las seis tablas nuevas.
- Se verificó en transacciones reversibles:
  - creación de un precio de lista;
  - actualización de un `Precio base`;
  - registro del precio anterior, nuevo valor, acción y origen.
- Las pruebas reversibles terminaron con `ROLLBACK` y no dejaron datos de prueba.

### Alcance todavía no implementado

- CRUD visual de listas en `settings/account`.
- Administración visual de permisos por lista.
- Campos dinámicos de precios en `settings/productos/items`.
- APIs para listas, permisos y precios por producto.
- Selector de lista por línea en el modal de cotización.
- Validación completa del precio seleccionado al guardar y enviar una cotización.
- Snapshot de lista y precio en `cotizacion_items`.
- Integración final con PDF, correo, WhatsApp y reenvíos.

### Nota histórica

El historial de cambios comienza desde la aplicación de la migración. Los cambios realizados antes de esa fecha no pueden recuperarse porque no existía un registro histórico específico.

## Convención de estados

- `Pendiente`: aún no implementado.
- `En progreso`: trabajo iniciado y no terminado.
- `Completado`: implementado y verificado.
- `Bloqueado`: requiere una decisión o dependencia externa.
