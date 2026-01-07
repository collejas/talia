---
title: Plan de importación guiada de productos inmobiliarios
created: true
author: sistema
---

# Plan de importación guiada de productos

## Objetivo
Crear una experiencia guiada dentro de `settings/productos` para que un vendedor no técnico pueda:

- definir qué columnas (campos) quiere capturar de sus proyectos inmobiliarios,
- descargar una plantilla con esos encabezados,
- subir un archivo Excel/CSV que enlace nombre, línea, familia y los campos definidos,
- y dejar que el importador genere entradas de `catalog_items` con `metadata` estructurado (modelo opcional).


## Checklist de alto nivel

- [ ] Diseñar la tabla/entidad donde guardamos las columnas personalizadas (nombre, tipo, descripción, slug, etc.).
- [ ] Crear una página en `/settings/productos/importador` que permita:
  - [ ] listar/especificar los campos que se usarán para metadata,
  - [ ] guardar esa configuración por organización (podría ser un registro JSON en Supabase),
  - [ ] descargar una plantilla Excel/CSV con nombre+línea+familia+[campos]
- [ ] Agregar un flujo de carga que:
  - [ ] reciba el archivo CSV/Excel,
  - [ ] valide que nombre, línea y familia estén presentes y que los campos coincidan con la plantilla,
  - [ ] genere `metadata` agrupando el resto de columnas en un objeto,
  - [ ] cree/actualice las filas en `catalog_items` (con las relaciones a `lineas_de_negocio`, `familias_productos` y opcionalmente `modelos_productos`),
  - [ ] exporte un reporte indicando qué filas se crearon, actualizaciones y errores de validación.
- [ ] Documentar el comportamiento en la nueva guía y en la ruta `docs/Plan importar  productos`.
- [ ] Notificar al asistente vectorial / sistema de indexación para que consuma esos metadatos (ya cubierto por la carga del JSON).


## Detalles de implementación

1. **Persistencia de plantilla**  
   - Usar tabla nueva (`producto_metadata_schemes` o similar) con columna `organizacion_id`, `name`, `fields jsonb`, `created_at`.
   - Cada `field` describe `{ id, label, tipo (texto/número/boleano), required }`.
2. **Generación de plantilla**  
   - Endpoint GET `/settings/productos/importador/template` que lee el esquema y devuelve CSV/Excel (o el frontend construye el CSV).
3. **Importador**  
   - Endpoint POST `/settings/productos/importador` que acepta archivo y esquema id.
   - Parsear CSV/Excel (puede usar `papaparse` o `xlsx`); validar obligatoriedad.
   - Si línea/familia/modelo ya existen, vincular por slug o nombre.
   - Guardar `metadata` con las columnas definidas.
4. **Feedback al usuario**  
   - Mensajes en el panel con conteos de creados/actualizados/errores y detalle de filas rechazadas.
5. **Seguridad**  
   - El importador debe correr con sesión autenticada y `organizacion_id`.
6. **Siguientes pasos**  
   - Ajustar la guía existente para mencionar el importador.
   - Crear pruebas unitarias para la resolución de esquemas y carga de productos.
