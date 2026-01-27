# Plan de mejora del catálogo vectorial y el asistente

## Contexto inicial
- Tras revisar el catalogo en Supabase, las tablas principales están vacías para la sesión actual (`catalog_items` y `productos` retornan cero filas desde la consola), pero los embeddings (`catalog_document_embeddings` con 71 registros de tipo `producto`, 3 `modelo`, 2 `familia`, 2 `linea`) evidencian que la información sí existe y fue indexada.
- El servicio de embeddings (`CatalogEmbeddingService`) puede recuperar objetos completos (`poetry run python ...` devolviendo un `Colorado Hills · 1A` con metadata) y el backend pudo reindexar los productos, pero la respuesta del asistente no siempre refleja todos los fraccionamientos ni las superficies porque la consulta vectorial o la lógica posterior no están procesando todos los matches.
- La vista `settings/productos/modelos` presenta errores 500 al intentar eliminar modelos, lo que sugiere problemas de integridad o de la capa de UI/SSR que hay que reproducir antes de corregir.

## Acciones prioritarias
1. **Registrar el flujo de `fetch_catalog_item_details`** en un log dedicado (`logs/catalogo-debug.log`) que incluya: fecha, `conversacion_id`, consulta recibida, vector store match count, metadata devuelta y cualquier fallback a `catalog_items`. Ese log permitirá saber si la vector store devuelve resultados y qué información envía al prompt.
2. **Reforzar el backend para que haya fallback y reindexación automática**:
   - Si la vector store no entrega matches, buscar en `catalog_items` (slug/nombre) y devolver ese metadata.
   - Consolidar los triggers o el servicio `CatalogEmbeddingService` para que se ejecute al crear/actualizar productos y se regenere el vector store sin intervención manual.
   - Documentar que el comando de reindexación es:
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
3. **Pulir el prompt y las funciones de OpenAI** (`docs/openai/demos/bienes_raices/Gran_Penon/webchat`) para que:
   - Siempre invoque `fetch_catalog_item_details` antes de dar la ficha completa de un prototipo o lote.
   - Repita cada campo del `metadata` en formato `Clave: valor` (incluso los 12+ campos generados por `metadata`/`metadatos` del producto).
   - Pregunte el siguiente paso tras compartir datos técnicos y aplique el flujo R.E.A.
4. **Resolver el error 500 en `settings/productos/modelos`** validando los logs del servidor, reproducir la eliminación y revisar si hay dependencias en `productos`/`familias` que bloqueen la operación (tal vez triggers o vistas que fallan sin productos asociados).

## Siguientes pasos inmediatos
- Revisar en `/var/www/talia/docs/openai/demos/bienes_raices/Gran_Penon/webchat` los prompts y la definición de `fetch_catalog_item_details`/`list_catalog_fraccionamientos`, documentar qué datos necesitan y qué campos del `metadata` son clave.
- Preparar el logger en el backend para que los datos de la vector store se persistan en `logs/catalogo-debug.log` y usar ese archivo para analizar casos donde se devuelven listas vacías.
- Verificar si la vista `models` tiene middleware que lanza el 500 al remover sin productos y capturar el digest con el error real.
- Una vez que el logger esté activo, reproducir las preguntas que antes devolvían 
