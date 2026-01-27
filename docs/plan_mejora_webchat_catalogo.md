# Plan de mejora del asistente webchat y el catálogo vectorial

## Contexto actual
- Las tablas clave del catálogo (`lineas_de_negocio`, `familias_productos`, `modelos_productos` y `catalog_items`) ya contienen datos reales: hay 2 líneas activas (Venta y Renta), 2 familias “Residencial” y al menos 3 modelos visibles (dos departamentos y un lote/terreno). Incluso `catalog_items` devuelve 71 registros y los embeddings de `catalog_document_embeddings` superan los 70 registros con información de línea, familia, modelo y producto. Sin embargo, el asistente webchat todavía responde generalizando por `linea`/`familia` y no muestra automáticamente la información de lotes o de otros tipos de bienes raíces cuando el prospecto lo pide.
- Hay trazas de depuración activas en `logs/catalogo-debug.log` gracias a `write_catalog_debug_entry`: cada invocación de `fetch_catalog_item_details` y `list_catalog_fraccionamientos` queda registrada (consulta, contexto, cantidad de matches, metadata devuelta, etc.). Ese archivo debe ser la referencia cuando el asistente responde mal.
- Se creó un logger similar para `list_catalog_fraccionamientos` y `fetch_catalog_item_details`, así que ya tenemos visibilidad de qué llega al prompt en cada turno.

## Objetivos
1. Que el asistente deje de agrupar respuestas por línea/familia y, en cambio, atienda la intención real del prospecto usando los tipos de propiedad (`propiedad_tipos`) y los productos concretos almacenados en `catalog_items`.
2. Que el flujo de detalle respete los metadatos completos (`metadata`, `metadatos`, `metadatos_extra`) y que siempre se informe el tipo de inmueble (terreno, departamento, local, oficina...).
3. Que las herramientas `list_catalog_modelos`, `list_catalog_fraccionamientos` y `fetch_catalog_item_details` se usen en el orden correcto según la intención y que el conversation log (`logs/catalogo-debug.log`) documente los pasos para poder revisar qué vectores se están retornando.

## Pasos propuestos
1. **Actualizar el prompt:** describir claramente cuándo usar cada herramienta del catálogo, insistir en el tipo de propiedad, pedir que se nombren los campos del `metadata` como `Clave: valor` y explicar que las “líneas”/“familias” sólo sirven de contexto adicional. También se debe explicar que si el prospecto menciona cualquier bien raíz (casas, locales, terrenos, duplex, consultorios, solares, oficinas) se debe invocar `list_catalog_modelos` y filtrar por los tipos adecuados antes de responder.
2. **Reforzar la documentación interna:** este documento comparte el análisis general y la estrategia; se sugiere revisarlo antes de aplicar cambios en el prompt o en el backend para mantener coherencia.
3. **Verificar logs:** usar `logs/catalogo-debug.log` para confirmar que `fetch_catalog_item_details` y `list_catalog_fraccionamientos` entregan metadata útil. Si se detectan preguntas sin matches, revisar el audit log (`catalog_embeddings_audit`) y volver a ejecutar la reindexación.
4. **Regenerar los embeddings de forma automatizada:** el comando de reindexación ya existe y se puede ejecutar con:
   ```bash
   poetry run python - <<'PY'
   import asyncio
   from uuid import UUID
   from app.repositories.crm import CRMRepository
   from app.services.catalog_embeddings import CatalogEmbeddingService

   async def main():
       repo = CRMRepository()
       service = CatalogEmbeddingService(repo)
       org = UUID("00000000-0000-0000-0000-000000000001")
       await service.reindex_catalog(org)

   asyncio.run(main())
   PY
   ```
   Ese script toma todos los recursos (`lineas`, `familias`, `modelos` y `catalog_items`) y los vuelve a indexar en la tabla `catalog_document_embeddings`. Debe ejecutarse cada vez que haya cambios en productos o cada vez que el backend vuelva a estar desactualizado.
5. **Monitorear anomalías:** si el asistente vuelve a preguntar por “lotes” y no responde con modelos de tipo “lote” o “terreno”, revisar el `catalogo-debug.log` y los resultados de `list_catalog_modelos` para detectar si el filtrado por tipo está fallando.

## Referencias rápidas
- Logs de depuración: `/var/www/talia/logs/catalogo-debug.log`
- Tablas claves: `catalog_items`, `catalog_document_embeddings`, `catalog_embeddings_audit`, `modelos_productos`, `familias_productos`
- Funciones de OpenAI: `fetch_catalog_item_details`, `list_catalog_fraccionamientos`, `list_catalog_modelos`

## Próximos pasos después de esta documentación
- Actualizar el prompt (este documento se refiere a los cambios en `docs/openai/demos/bienes_raices/Gran_Penon/webchat/prompt.md`).
- Revisar si hay validaciones adicionales en el backend que impiden borrar modelos desde la vista `settings/productos/modelos` (aunque el problema quedó resuelto, vale la pena registrar la lección).
- Confirmar que las respuestas del asistente ahora incluyen el tipo de propiedad y un resumen en puntos con datos técnicos, seguido del seguimiento R.E.A. (Reacción, Ejemplo y Avance).
