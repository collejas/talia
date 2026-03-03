# Plan: manejar negaciones definitivas en WhatsApp

## Idea
- Cuando los prompts de los asistentes (normal y prospección) detectan frases de desinterés absoluto, el backend debe tratar la conversación como “cerrada (perdida)”, no solo emitir un mensaje de cierre.  
- Esa marca tiene que actualizar la oportunidad (etapa `cerrado_perdido` y estado asociado) para que los reenganches y alertas automáticas del runner de WhatsApp reconozcan que no debe volver a contactar a ese lead.  
- Sólo así se mantiene el flujo fiel al prompt: un “no me interesa” desbloquea la salida amable sin reintentos posteriores ni seguimiento automático (y la oportunidad queda en el embudo como “Cerrado - Perdido”, listo para análisis comercial).

## Plan de ejecución
1. **Backend/Storage**
   - Añadir una función o extender `_handle_close_lead` para exponer una forma segura de promover la oportunidad a etapa `cerrado_perdido` y, opcionalmente, fijar `estado`/`motivo_perdida`.  
   - La función debe respetar el permiso del service role y reutilizar `storage.promote_opportunity_stage` + `repo.update_opportunity` para evitar conflicto con otras rutas.  
   - Registrar auditoría/log que explique que fue un cierre por negación para poder seguir la trazabilidad en Supabase.
2. **Prompt/tooling**
   - Introducir una nueva llamada a herramienta (por ejemplo `mark_lost_negacion`) que invoque la función anterior; documentarla como parte de `docs/openai/talia/whatsapp/whatsapp_funciones.md` y `../prospeccion/whatsapp_funciones_prospeccion.md`.  
   - Incluir el uso obligatorio de esa herramienta inmediatamente después de las instrucciones de cierre amable en ambos prompts.  
   - Asegurar que el prompt no vuelva a pedir datos ni ejecute `close_lead` después de la negación (para evitar reescritura de metadata) y que la herramienta se limite a marcar la etapa como perdida + notes breves.
3. **DB/Infra**
   - Confirmar que la organización ya tiene la etapa `cerrado_perdido` en Supabase (ver `backups/postgres_20260302_152939/.../schema.sql` y la vista `organizaciones_missing_etapas_pipeline` en la copia).  
   - Si no está, documentar en Supabase (o en este plan) cómo resembrar la etapa antes de usar la herramienta.  
   - Añadir pruebas unitarias o integración que simulen la llamada al asynchronously runner y verifiquen que `_should_skip_reengage_for_business_rules` deja de reenganchar una vez se promueve la etapa.

## Verificación
- Manual: enviar un mensaje ficticio negativo y observar en la base (o un stub) que la etapa/estado cambia y el runner no vuelve a mandar reenganches.  
- Tests: crear un test de `whatsapp_followups` que finge la metadata ya marcada como perdida y asegura `should_reengage` se vuelve False.  
- Prompts: validar con un draft de herramienta en OpenAI (copia local) y confirmar que la instrucción aparece en el prompt final.

## Siguientes pasos recomendados
1. Identificar si el prompt ya consume respuestas de vector store que podrían reactivar el flujo —si sí, adaptar el trigger a la negación.  
2. Considerar notificar internamente (emails/logs) cuando se marca un cliente como perdido desde el asistente para análisis comercial.
