# Plan: Vector Store para asistente

Objetivo: Que el asistente tenga acceso a la información más reciente del catálogo (líneas/familias/modelos/productos/medios) a través de una vector store propia en Supabase, de modo que pueda responder preguntas con contexto sin cargar toda la base en cada prompt.

## 1. Modelado de documentos
- [x] { } Definir qué entidades se indexan (productos, familias, modelos, líneas, recursos) y qué campos clave incluir (nombre, descripción, atributos, relaciones, metadatos).
- [x] { } Establecer un esquema de documento para cada tipo (p. ej. incluir fotografía predeterminada, identificadores de jerarquía, precios, estado activo).
- [x] { } Crear funciones que transformen filas de `catalog_items`, `familias_productos`, etc., en texto/plano concatenado apto para embedding.

## 2. Vector store en Supabase
- [x] { } Crear tabla `catalog_document_embeddings` (u otro nombre) con columnas: id, organizacion_id, entity_type, entity_id, contenido(texto), embedding(vector), updated_at.
- [x] { } Asegurar que la extensión `pgvector` esté habilitada (ya lo está en Supabase) y que la tabla tenga índices `USING ivfflat` o `vector_column storage`.
- [x] { } Disparar la reindexación cada vez que se crea o edita una familia, línea, modelo o producto para que el embedding esté siempre sincronizado.

## 3. Generación y almacenado de embeddings
- [x] { } Integrar la generación de embeddings (OpenAI `text-embedding-ada-002` o similar) en el backend/edge function.
- [x] { } Al guardar o actualizar una entidad (línea, familia, modelo, producto, recurso_media importante), recalcular el embedding y hacer upsert en la tabla vectorial.
- [x] { } Implementar scripts o jobs que puedan reindexar todo el catálogo por tenant (p. ej. `backend/scripts/index_catalog.py --organizacion-id=<org>`).

## 4. Consulta desde el asistente
- [x] { } Crear un helper (server/edge) que reciba el prompt del asistente, genere embedding de la pregunta y consulte la tabla con `ORDER BY embedding <=> query_embedding LIMIT N` y filtro por organización.
- [x] { } Inyectar los fragmentos más relevantes como contexto en el prompt del asistente (p. ej. `contexto` con nombre y resumen de cada documento).
- [x] { } Asegurar que las respuestas lleven referencias (nombre del producto/servicio y su relación) para poder trazar la fuente.

## 5. Seguridad y datos multi-tenant
- [x] { } Garantizar que cada documento guarda `organizacion_id` y las consultas siempre se filtran por ese campo.
- [x] { } Revisar políticas RLS para que sólo usuarios del tenant puedan leer los embeddings.
- [ ] { } Registrar auditoría (fecha, usuario) cada vez que se reindexa o se consulta la vector store (opcional).

## 6. UX del asistente
- [ ] { } Actualizar los prompts/templates del asistente para mencionar que está consultando la base enriquecida (dar claridad y transparencia).
- [ ] { } Notificar en la interfaz/admin cuando la vector store se reindexa (p. ej. card en `settings/productos/items`).
- [ ] { } Añadir enlaces directos desde el asistente a los registros correspondientes (por ID).

Una vez completados estos pasos, el asistente puede responder con información precisa y actualizada usando la vector store alojada sobre Supabase, manteniendo el contexto multitenant y minimizando lo que se envía en cada prompt.
