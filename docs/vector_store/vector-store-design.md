# Diseño del Vector Store del Catálogo

Este documento sintetiza los pasos siguientes del plan en términos concretos, usando el esquema actual (`catalog_items`, `familias_productos`, `lineas_de_negocio`, `modelos_productos`, `recursos_media`) para definir qué y cómo indexar.

## 1. Esquema de documentos por entidad

### Productos (`catalog_items`)
- `nombre`, `slug` y `tipo` como identificadores legibles.
- `descripcion_corta`, `descripcion_larga`, `unidad`, `precio_base`, `moneda` y `impuestos` para capturar atributos y valor diferencial.
- `metadata` (JSON) con atributos heterogéneos.
- Relaciones: `linea_id`, `familia_id` y `modelo_id` permiten reconstruir la jerarquía. Incluir también campos de estado (`activo`, `requiere_factura`) y timestamps (`creado_en`, `actualizado_en`) para determinar frescura.
- Recomendación: concatenar texto con etiquetas (ej. `Línea: <nombre>`), resumo de descripciones y los valores clave (`precio`, `impuestos`, `estado`), añadiendo el nombre del modelo y la familia cuando existan.

### Familias y líneas (`familias_productos`, `lineas_de_negocio`)
- Campos clave: `nombre`, `descripcion`, `activo` y `metadata`.
- Asociar `linea_id` en familias para conservar la ruta completa.
- Incluir `organizacion_id` siempre en el documento final para garantizar multi-tenant.
- Aprovechar estos textos para contextualizar productos (ej. “Familia XYZ: ...”).

### Modelos (`modelos_productos`)
- Campos `nombre`, `descripcion`, `metadata` y `activo`.
- Se pueden agregar atributos específicos del modelo (capturados en `metadata`) como parte del documento.
- Utilizar este texto como un sub-bloque dentro del documento del producto cuando el producto referencia un `modelo_id`.

### Recursos (`recursos_media`)
- Documentar con `objeto_type`, `objeto_id`, `url`, `descripcion`, `tipo`, `orden` y `activo`.
- Cuando `tipo` es `portada` o `galeria`, añadir al documento padre (producto/familia/modelo) una sección tipo “Imagen destacada” con la URL y la descripción, para que el asistente pueda referenciar fotos/videos.
- Se puede crear también un documento independiente para recursos críticos (manuales, fichas técnicas) si se desea buscar por texto del recurso.

## 2. Esquema de la tabla vectorial en Supabase

```sql
CREATE TABLE public.catalog_document_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES organizacions(id),
  entity_type text NOT NULL CHECK (entity_type IN ('producto','familia','linea','modelo','recurso')),
  entity_id uuid NOT NULL,
  contenido text NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, entity_type, entity_id)
);
```

- Índices recomendados:
  - `CREATE INDEX ON catalog_document_embeddings USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);`
  - `CREATE INDEX ON catalog_document_embeddings (organizacion_id, entity_type);`

- RLS:
  - `ALTER TABLE public.catalog_document_embeddings ENABLE ROW LEVEL SECURITY;`
  - Política típica: `CREATE POLICY "tenant_select" ON catalog_document_embeddings FOR SELECT USING (organizacion_id = auth.uid());`
  - Las políticas de inserción/actualización deben verificar también `organizacion_id = auth.uid()` y asegurar que solo procesan datos del tenant activo.
  - La tabla debe exponer funciones seguras (edge functions, RPC) que ejecuten el `SELECT` con `SET LOCAL role` si el proceso automatizado tiene privilegios distintos.

## 3. Flujo de generación y actualización de embeddings

1. **Transformación de entidades**  
   - El backend/edge function consulta `catalog_items`, suma la información jerárquica (`familia`, `linea`, `modelo`) y posibles `recursos_media` relevantes.  
   - Para familias/líneas/modelos sueltos, se crea un texto similar pero apuntando únicamente a esos campos.  
   - Si hay recursos asociados, se anexa un párrafo por cada recurso destacado con su `tipo`, `url` y `descripcion`.

2. **Generación de embeddings**  
   - Se llama al modelo de embeddings (p.ej. `text-embedding-ada-002` o cualquier vector de 1536 dimensiones).  
   - Al actualizar o insertar, se genera el texto y se hace un `upsert` en `catalog_document_embeddings`, respetando `organizacion_id`.

3. **Jobs de reindexación**  
   - Scripts tipo `backend/scripts/index_catalog.py --organizacion-id=<org>` recorren todos los productos/entidades y recalculan embeddings.  
   - Registrar en una tabla de auditoría (por ejemplo `catalog_embeddings_jobs`) quién ejecutó la reindexación y cuándo para rastrear (`docs/plan-vector-store.md:28`).  
   - Estos scripts pueden ejecutarse periódicamente o tras triggers (webhooks/cron) que detecten cambios masivos.

4. **Consulta desde el asistente**  
   - El helper (`backend/app/services/catalog_embeddings.py::query_documents`) recibe el prompt del asistente, genera el embedding y llama al RPC `catalog_document_embeddings_search` (ver `supabase/migrations/20280107_120000_catalog_vector_search.sql`) para obtener los fragmentos con orden por similitud.  
   - En los canales webchat/messenger/whatsapp, ese resultado se transforma en un mensaje `developer` previo a la entrada del usuario (`backend/app/channels/*/service.py` usando `app.services.catalog_context.build_catalog_context`), de modo que cada conversación recibe contexto enriquecido sin alterar el prompt base.  
   - Se inyectan fragmentos (p. ej. “Modelo X - Familia Y - descripción resumida”) y se anotan referencias (nombre de entidad y tipo) para mantener trazabilidad sin mencionar UUIDs o identificadores internos.  
- Registrar la consulta en auditoría opcional si se desea seguimiento.

6. **Disparo automático de reindexación**  
- Los endpoints CRUD que exponen líneas, familias, modelos y productos ahora llaman a un helper (`_trigger_catalog_reindex`) después de cada creación o edición para garantizar que la vector store se refresca inmediatamente.  
- El helper ejecuta `CatalogEmbeddingService.reindex_catalog` dentro de `BackgroundTasks`, lo que evita bloquear la respuesta y permite que el proceso de embeddings sea rastreado con logs (`vector_store.reindex.*`).  

5. **Multi-tenant y seguridad**  
   - El helper siempre proporciona `organizacion_id` del usuario logueado; los RPC o funciones supabase aseguran que solo acceden a los vectores de ese tenant.  
   - Las inserciones/upserts desde procesos backend deben validar que el token/clave esté asociado a la misma organización antes de escribir.

## 4. Punto de contacto con el UX
- Actualizar prompts/templates para mencionar que se usa la información enriquecida del catálogo.  
- El prompt del asistente recuerda mencionar que siempre toma la información más reciente desde la vector store autorizada y evita revelar UUIDs; ofrece enlaces guiados sin mencionar IDs internos.
- La interfaz `settings/productos/items` ya no muestra una card dedicada a la vector store; en lugar de ello, la información de reindexación se documenta en los registros/auditoría y en el prompt.  
- El bloque de referencias del asistente ahora describe las líneas/familias/modelos/productos encontrados en lenguaje natural (p.ej. “Líneas disponibles: Turismo, Inmobiliario”) y sugiere buscarlos en el panel cuando sea necesario, sin exponer URLs directas.
- Las referencias del asistente también deben narrar la jerarquía (líneas primero) y ofrecer ejemplos concretos (tipo, precio, familia) antes de indicar cómo buscar en el panel, manteniendo un flujo natural de líneas → familias/modelos → productos.
- En las respuestas del asistente, alimentar un bloque “Referencias” con `entity_type`, `entity_id`, `nombre` para que la trazabilidad sea clara.
