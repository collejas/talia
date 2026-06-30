# Changelog

## 2026-06-30 - Cierre del refactor de catálogo

- Se cerró la separación funcional entre catálogo inmobiliario y catálogo de productos y servicios.
- La vista `settings/tenants` ya expone dos checks de negocio:
  - `Activar inmobiliario`
  - `Activar productos y servicios`
- La vista `settings/variables` quedó alineada con los mismos flags.
- El backend ya filtra tools y búsquedas por dominio:
  - inmobiliario;
  - no inmobiliario.
- La búsqueda SQL-first y el fallback por embeddings ya respetan el dominio.
- Se validó el resultado con tests focalizados y la suite quedó en verde.
- El contrato viejo de `catalog_backend` quedó solo como compatibilidad histórica donde todavía exista configuración previa.

## 2026-06-30

- Se definió la separación funcional del catálogo en dos checks de negocio:
  - `Activar inmobiliario`
  - `Activar productos y servicios`
- Se dejó documentado que el alcance ya no depende de un único switch de catálogo/backend.
- Se creó el plan de implementación para ordenar el trabajo por etapas:
  - base de datos;
  - backend;
  - frontend.
- Se incorporó un checklist de ejecución para guiar la implementación completa.
- Se acordó que la configuración debe quedar reflejada tanto en `settings/tenants` como en `settings/variables`.
