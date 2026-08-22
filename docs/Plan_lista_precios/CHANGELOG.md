# Changelog — Listas de precios

Registro de avances, cambios aplicados, verificaciones y pendientes de la funcionalidad de listas de precios.

## 2026-08-22

### Límites de descuento por tipo de precio — implementado localmente y migrado

- Se agregó la migración `supabase/migrations/20280822_120000_discount_limits.sql`.
- El tenant puede configurar límites porcentuales para `Precio base` y para cada lista,
  asignados a roles, usuarios o empleados.
- La precedencia efectiva es usuario específico, empleado y después rol.
- Se agregaron constraints, foreign keys, índices, RLS y una bitácora explícita de
  cambios de límites.
- Las líneas de cotización conservan precio de lista, descuento monetario, porcentaje
  autorizado y precio final.
- El backend recalcula el precio base o de lista y rechaza descuentos que superen el
  límite vigente antes de guardar, previsualizar o enviar.
- Se agregó la configuración visual en `settings/account`.
- La migración remota fue aplicada y se verificaron las tablas y columnas nuevas.
- Pendiente: despliegue del backend/panel y pruebas vivas con usuarios representativos.

### Precio de cotización solo lectura — implementado localmente

- Se eliminó la opción de agregar líneas manuales en el modal de cotización.
- El precio unitario quedó como solo lectura en el panel.
- El backend rechaza líneas sin producto del catálogo y precios unitarios alterados.
- El precio solo puede modificarse desde la ficha del producto; la cotización resuelve
  precio base o lista autorizada y aplica descuentos.

## 2026-08-21

### Corrección de regresión de compatibilidad — completado

- Durante la implementación local de listas de precios se detectó una inserción accidental en `backend/app/repositories/crm.py`, dentro de `list_contact_envios_by_ids`.
- Esa función es de solo lectura para recuperar envíos de contactos, pero contenía lógica de limpieza de `catalog_item_lista_precios` y referenciaba `item_id`, una variable inexistente.
- El error provocaba `NameError` y respuestas HTTP 500 en la carga de `GET /api/crm/visitas/web-sessions` y en las exportaciones XLSX/HTML del mapa de conversión.
- Se retiró únicamente ese bloque accidental. No se modificaron tablas, migraciones, endpoints, permisos, snapshots ni componentes de listas de precios.
- No se ejecutó ninguna operación destructiva sobre datos de catálogo; el bloque fallaba antes de llegar al `DELETE`.
- Verificaciones posteriores: prueba específica de catálogo `2 passed`, compilación Python, `git diff --check`, reinicio correcto del servicio API y health local HTTP 200.
- La suite amplia mantiene fallos previos del doble de pruebas `DummyCRMRepository`; no corresponden a precios ni a esta corrección.

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

### Panel `settings/account` — en progreso local

- Se agregó el CRUD visual de nombres de listas de precios en `settings/account`.
- Se permite crear, editar, activar y desactivar listas sin borrar su historial.
- Se agregó la administración visual de permisos por lista para roles, usuarios y empleados.
- La pantalla consume los endpoints protegidos del backend y conserva el tenant del contexto autenticado.
- Se actualizó el encabezado de la vista para identificarla como `Cuenta`.
- Validaciones locales realizadas:
  - `npx eslint` sobre los tres archivos nuevos/modificados: correcto.
  - `npx tsc --noEmit`: correcto.
  - `react-doctor --scope changed`: 100/100, sin hallazgos.
- Esta parte todavía no está desplegada ni probada con usuarios reales en producción.

### Captura de precios en `settings/productos/items` — en progreso local

- La página carga las listas activas del tenant de forma dinámica.
- El formulario de creación y edición muestra un campo por cada lista activa, además del `Precio base`.
- Los valores se guardan mediante `PUT /crm/catalog/items/{item_id}/price-lists`.
- Al editar se recuperan los precios existentes por item.
- Al limpiar un campo, el reemplazo omite esa relación; el backend registra el cambio mediante el trigger de historial.
- Validaciones locales: ESLint, TypeScript, `git diff --check` y React Doctor 100/100.

### Modal de cotización — en progreso local

- Se agregó el selector de lista de precios por línea en el modal usado desde Embudo/Inbox.
- Al elegir un producto se consultan únicamente sus precios de listas visibles para el usuario autenticado.
- El backend valida nuevamente que el usuario pueda usar la lista y reemplaza el precio enviado por el precio vigente autorizado.
- Las líneas guardan `lista_precio_id`, `lista_precio_nombre` y `moneda_aplicada` como columnas explícitas en `cotizacion_items`.
- Se aplicó y verificó remotamente la migración `supabase/migrations/20280821_130000_quote_price_snapshot.sql`.
- Las cotizaciones existentes recibieron `moneda_aplicada` desde la moneda de su encabezado; las listas históricas quedan nulas porque antes no existía esa selección.
- Validaciones locales: compilación Python, TypeScript, ESLint y `git diff --check` correctos. ESLint mantiene una advertencia preexistente sobre `handleQuoteChannelChange` sin uso.

### Alcance todavía no implementado

- Integración final con PDF, correo, WhatsApp y reenvíos.
- Validación viva con usuarios representativos y despliegue del backend/panel.

### Backend/API — en progreso local

- Se agregaron schemas Pydantic para listas, precios por item, permisos e historial.
- Se agregaron endpoints para:
  - listar, crear, editar y desactivar listas;
  - consultar y reemplazar asignaciones por rol, usuario y empleado;
  - consultar y guardar precios de un item por lista;
  - consultar el historial de precios con filtros.
- Se agregaron métodos de repositorio con filtros explícitos por `organizacion_id`.
- Las escrituras usan autorización FastAPI y el actor se toma del contexto autenticado, no del body del cliente.
- Se validó sintaxis, carga de FastAPI y registro de rutas.
- La suite completa existente de CRM presenta fallos no relacionados en `DummyCRMRepository`; aún falta una suite específica para estos endpoints.
- Esta fase todavía no está desplegada ni verificada en el servicio backend de producción.

### Nota histórica

El historial de cambios comienza desde la aplicación de la migración. Los cambios realizados antes de esa fecha no pueden recuperarse porque no existía un registro histórico específico.

## Convención de estados

- `Pendiente`: aún no implementado.
- `En progreso`: trabajo iniciado y no terminado.
- `Completado`: implementado y verificado.
- `Bloqueado`: requiere una decisión o dependencia externa.
