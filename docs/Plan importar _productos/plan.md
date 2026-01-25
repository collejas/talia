---
title: Plan de importación guiada de productos inmobiliarios
created: true
author: sistema
---

# Plan de importación guiada de productos

## Objetivo
Diseñar una experiencia guiada dentro de `settings/productos` que permita a un vendedor no técnico:

- definir las columnas (campos) que necesita para su catálogo inmobilario y convertirlas en metadata estructurada.
- descargar una plantilla CSV/Excel con nombre, línea, familia, modelo (opcional) y los campos personalizados.
- subir la misma estructura para que el importador cree/actualice los ítems en `catalog_items` con la metadata correcta.
- contar con una guía de ayuda que explique qué nivel jerárquico se debe borrar primero y cómo mantener los datos consistentes.

## Checklist de alto nivel
- [x] Diseñar la tabla de `producto_metadata_schemes` (con `organizacion_id`, `name`, `fields jsonb`, fechas y `payload`).
- [x] Crear la página `/settings/productos/importador` con:
  - [x] listado y edición de campos (slugs, etiquetas, tipo, requerido, descripción).
  - [x] panel donde la tabla muestra columnas base y cualquier campo nuevo, de forma que el usuario vea el efecto de agregar un campo.
  - [x] generación/descarga de plantilla con los encabezados esperados.
- [x] Documentar y mostrar la nueva guía de ayuda en `/settings/productos/ayuda` para vendedores que no son programadores (usa `docs/Cliente_inmobiliario` como referencia).
- [ ] Agregar el flujo de carga que:
  - [ ] recibe el archivo CSV/Excel y lo valida contra el esquema seleccionado.
  - [ ] exige nombre, línea y familia, opcionalmente modelo, y convierte las columnas adicionales en `metadata`.
  - [ ] crea o actualiza filas en `catalog_items` respetando las relaciones jerárquicas de línea > familia > modelo > producto.
  - [ ] devuelve un reporte con filas creadas, actualizadas y errores de validación.
- [ ] Notificar al asistente vectorial y a la indexación para que consuman los metadatos recién generados.
- [ ] Registrar que el importador ya deriva los campos volumétricos (`height`, `min_height`, `levels`, `metadata_color`) y cualquier `metadata_unidad_*` hacia el nuevo JSON `catalog_items.metadatos_extra` para evitar el error de la columna generada `metadata`.

## Detalles de implementación

### Persistencia del esquema
- La tabla `producto_metadata_schemes` ya diseñada sigue siendo la fuente principal. Cada campo describe `{ id, label, type, required, description }` y se guarda por organización con marca de tiempo.
- Al guardar un esquema, se deben filtrar los campos vacíos (sin `id` ni `label`).

### Interfaz del importador
- El importador muestra primero los datos básicos (nombre del esquema y descripción).
- Las tarjetas que describen cada campo están agrupadas arriba, el botón “Agregar campo” y la explicación del funcionamiento están justo antes de la tabla, de modo que el usuario entiende que cada columna nueva se reflejará en la vista previa.
- La tabla de vista previa siempre muestra los encabezados `nombre`, `linea`, `familia`, `modelo` y los campos personalizados, con una fila de ejemplo resaltando el tipo.
- Los botones de acción permiten crear/actualizar, eliminar el esquema activo o descargar la plantilla CSV, y ya manejan los errores del backend con mensajes claros.

### Guía para vendedores
- La nueva página en `/settings/productos/ayuda` describe la jerarquía línea → familia → modelo → producto y ofrece pasos claros (definir esquema, descargar plantilla, llenar datos, subir/importar).
- Se referencia el repositorio `docs/Cliente_inmobiliario` para mostrar campos típicos (habitaciones, baños, metros cuadrados, servicios) y se incluyen consejos para usuarios sin conocimientos técnicos.

### Importador y validaciones pendientes
- El backend del CRM necesita un endpoint POST que reciba el archivo y el `scheme_id`, valide tipos y campos obligatorios, y arme el objeto `metadata` para cada fila.
- El backend del CRM necesita un endpoint POST que reciba el archivo y el `scheme_id`, valide tipos y campos obligatorios, y arme el objeto `metadata` para cada fila. Ahora el helper copia los campos `metadata_unidad_*`, `height`, `levels`, `min_height` y `metadata_color` hacia `catalog_items.metadatos_extra` para no escribir directamente en la columna generada `metadata` y poder mantener los atributos volumétricos/visuales en el catálogo.
- Debe garantizarse que los productos heredados respetan la organización y que la metadata generada se indexa en la tienda vectorial.
- El importador ya invoca `_ensure_catalog_item_for_unidad` (también se ejecuta desde `/crm/propiedades`) con los datos del desarrollo y la unidad, lo que crea/actualiza `catalog_items` y guarda `catalog_item_id`, `propiedad_id` y `unidad_id` en la metadata de la unidad. La ruta escribe además en `/var/www/talia/logs/mapbox-debug.log` cada sincronización para facilitar el monitoreo del panel Mapbox.
- Al final de cada importación debe haber un reporte de filas aceptadas/descartadas con mensajes en español y la opción de descargar los errores.

## Siguientes pasos
- Implementar el endpoint de upload (CSV/Excel) y conectarlo con la vista `importador`.
- Añadir traducciones y validaciones adicionales en el backend del CRM para `linea_has_children`, `familia_has_children` y `modelo_has_children`.
- Extender la documentación del vector store para que aprenda de los nuevos metadatos.
