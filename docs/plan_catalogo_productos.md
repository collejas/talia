# Plan de desarrollo · Catálogo de productos/servicios

## Objetivo

- [ ] Implementar un catálogo administrable de productos/servicios que alimente cotizaciones, leads ganados y futuras facturas.

## 1. Descubrimiento y lineamientos

- [ ] Validar stakeholders, permisos y flujos actuales de cotizaciones.
- [ ] Enumerar atributos requeridos por facturación (SAT, unidades, impuestos).
- [ ] Definir si existe segmentación multi-tenant o por cuenta (implica RLS).
- [ ] Redactar criterios de éxito (p.ej. medir ventas por ítem, reutilizar precios).

## 2. Diseño de datos (Supabase / PostgreSQL)

- [ ] Diseñar tablas `catalog_items`, `catalog_item_prices`, `catalog_item_tags`.
- [ ] Definir `lead_cotizacion_items` y `lead_tarjeta_items` (snapshots aceptados).
- [ ] Crear vistas/materialized views para KPIs (`ventas_por_producto_mes`, etc.).
- [ ] Escribir migraciones + comentarios y ejecutar `supabase db push`.
- [ ] Configurar RLS/policies alineadas con `lead_tarjetas` y `lead_cotizaciones`.

## 3. Servicios backend (FastAPI + Supabase RPC)

- [ ] Nuevo router `/api/catalog` con CRUD protegido (list, create, update, delete/archive).
- [ ] Extender payloads de cotización para aceptar items tipados (`catalog_item_id`, `cantidad`, `precio_unitario`, descuentos/impuestos).
- [ ] Actualizar RPC `panel_lead_quote_create` para poblar `lead_cotizacion_items` y recalcular totales server-side.
- [ ] Implementar lógica que copie items a `lead_tarjeta_items` cuando la cotización se marca como aceptada.
- [ ] Ajustar `app/services/quotes.py` para mostrar información del catálogo en PDFs/mensajes.
- [ ] Añadir pruebas unitarias/integración (FastAPI + Supabase mocks) para los nuevos endpoints.

## 4. Panel (Next.js)

- [ ] Crear sección “Productos y servicios” en Settings (lista, filtros, CRUD, tags).
- [ ] Añadir selector/autocomplete de catálogo en el drawer de cotizaciones (con cantidades, precios, descuentos y conceptos libres).
- [ ] Mostrar KPIs de mix de ventas en dashboard usando las nuevas vistas.
- [ ] Sincronizar validaciones de moneda, unidades e impuestos con backend.

## 5. Automatizaciones y métricas

- [ ] Job/trigger para actualizar métricas agregadas cuando se gana un lead (ventas por ítem, ticket promedio, contribución mensual).
- [ ] Endpoint/reportes descargables (CSV/Excel) con ventas por producto y forecast.
- [ ] Monitoreo/alertas para inconsistencias (ítems sin precio, RLS fallidas, render de PDFs).

## 6. Facturación futura (preparativos)

- [ ] Reservar campos en `catalog_items` para claves SAT/unidades y banderas fiscales.
- [ ] Diseñar tablas `facturas` + `factura_items` referenciando `lead_tarjeta_items`.
- [ ] Evaluar integración con PAC/ERP y dependencias externas.

## 7. Implementación y rollout

- [ ] Plan de migración de datos (semillas iniciales, importaciones desde CSV/Excel).
- [ ] Guía de actualización para usuarios (release notes, video corto, checklist de pruebas UAT).
- [ ] Feature flag / rollout gradual para equipos piloto.
- [ ] Retroalimentación y mejoras post-lanzamiento (encuestas, métricas de adopción).
- [ ] Habilitar monitoreo (dashboard de adopción, alertas) y documentar owners por módulo.
