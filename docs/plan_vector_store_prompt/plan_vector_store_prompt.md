# Vector Store Prompt Plan

## Objetivo
Permitir que el prompt que ejecuta Tal-IA consulte directamente la vector store en Supabase, de modo que él mismo recupere todos los matches y ordene la respuesta según el contexto deseado. La idea es replicar la experiencia de `docs/openai/demos/bienes_raices/las aguilas` pero manteniendo los datos dentro del stack propio (Supabase + backend).

## Fases

1. **Diseñar una herramienta (tool/function) expuesta al prompt** [x]
   - [x] Crear una nueva tool function que consulte la API interna (`/api/catalog/...`) y devuelva el texto completo del match deseado, con metadata.
   - [x] Documentar el payload y la respuesta (probablemente `slug` o `prototipo` como parámetro).
   - [x] Asegurar que la función puede cruzar con el vector store para tomar los embeddings y devolver los fragmentos actualizados.

2. **Actualizar el prompt para usar la tool** [x]
   - [x] Instruir a Tal-IA para que solo llame a la tool cuando el prospecto mencione un fraccionamiento/prototipo específico y quiera “detalles completos”.
   - [x] Pedirle que lea el `metadata` devuelto, lo formatee como `Clave: valor` y lo presente sin resumir ni inventar campos.
   - [x] En roles donde se busca un overview, pedirle que siga usando el contexto general (el `developer note` que ya se pasa) hasta que se detecte necesidad de más detalle.

3. **Ajustar backend si es necesario** [x]
   - [x] Implementar la nueva ruta/tool que envía la query al vector store (puede ser un nuevo endpoint en `api/catalog` o reinvocar `build_catalog_context` con parámetros ajustados).
   - [x] Asegurar que la herramienta no repite los pasos de inyección de contexto para que el prompt tenga control total sobre qué usar.

4. **Probar end-to-end** [ ]
   - [ ] Validar en webchat que al pedir “detalles completos de Terrace” el prompt usa la tool, reproduce cada campo de metadata y conserva la narrativa R.E.A.
   - [ ] Verificar que las respuestas generales siguen usando el builder de context actual y no la herramienta directa.

5. **Documentar cambios** [x]
   - [x] Actualizar `docs/openai/talia/webchat/webchat_prompt.md` con referencias al uso de la tool.
   - [x] Guardar este plan y cualquier hallazgo adicional.
