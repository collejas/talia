# Plan de depuración y mejora del catálogo vectorial

## 1. Objetivo

Garantizar que el asistente de webchat pueda ofrecer:

- **Resumen inicial** del catálogo cuando el usuario pregunta por fraccionamientos/terrenos.
- **Detalles completos** (metadatos) de un prototipo/lote concreto cuando el prospecto lo solicita.
- **Seguimiento automático** de cada reindexación y búsqueda vectorial para diagnosticar bloqueos.

## 2. Diagnóstico actual

1. El vector store ya contiene filas para cada familia/línea/modelo/producto (71 productos, 3 modelos, etc.), y el texto indexado ahora reúne `metadata`, `metadatos` y `metadatos_extra`.
2. Aun así, el asistente a veces responde con listados genéricos porque `fetch_catalog_item_details` devuelve `items: []` (matches 0) o bien no expone cada campo del metadata en la respuesta final.
3. No hay un log específico donde se registre la consulta realizada, la URL (query) usada ni el número de matches, así que no se puede distinguir si el backend no encontró coincidencias o si el prompt falló al procesarlas.

## 3. Cambios propuestos

1. **Logger dedicado (`logs/catalogo-debug.log`)**  
   - Cada vez que `fetch_catalog_item_details` se ejecute, registrar: fecha, `conversacion_id`, consulta recibida, matches retornados (0 o >0), y metadata devuelta.  
   - Si la vector store no devuelve resultados, se debe loggear además el fallback (slug buscado y si se recuperó directamente desde `catalog_items`).  

2. **Backend: fetch con fallback y logging ampliado**  
   - Antes de devolver `items` vacíos, si la búsqueda vectorial no retorna filas, buscar en `catalog_items` por slug/nombre exacto y devolver esos metadatos.  
   - Dejar un `logger.debug` (al menos durante la fase de tuning) dentro del helper para que quede constancia de qué texto se envía al embedding y qué metadata se entrega al asistente.  

3. **Prompt/Funciones del asistente**  
   - Reforzar las instrucciones en `docs/openai/demos/bienes_raices/Gran_Penon/webchat/prompt.md` para que el asistente siempre pida a la herramienta `fetch_catalog_item_details` cuando el usuario menciona un modelo/terreno y que repita cada línea del metadata como `Clave: valor`.  
   - Incluir un ejemplo hipotético (ej. “Características completas de Colorado Hills · 2L”) que muestre el flujo resumen→detalle y use incluso campos como metros, habitaciones, amenidades, etc.

## 4. Siguiente paso inmediato

1. Implementar el logger y el fallback en el backend (ver los pasos anteriores) y verificar manualmente que `logs/catalogo-debug.log` recoge la llamada y el metadata devuelto.  
2. Reindexar el catálogo (`poetry run python ...`) para asegurarse de que los cambios se reflejan en `catalog_document_embeddings`.  
3. Ajustar el prompt para que el asistente use esa info y validar en el widget que se responde con campos completos.

Una vez documentado y aplicado el cambio, podremos pasar a los ajustes de UX del asistente (orden de respuesta, forma de presentar las claves, etc.).
