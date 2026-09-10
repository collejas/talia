# Changelog — Bajas de WhatsApp en prospección

## 2026-09-09

### Diagnóstico

- Se confirmó que el asistente ya detectaba `BAJA`, `STOP`, `UNSUBSCRIBE` y frases equivalentes.
- Se confirmó que la detección detenía la conversación y marcaba la oportunidad como perdida.
- Se confirmó que no existía una llamada automática para crear `prospeccion_contacto_suppressions`.
- Se confirmó en Supabase que la tabla de exclusiones no tenía registros.
- Se confirmó que el worker sí tenía una comprobación de exclusiones antes de enviar.
- Se confirmó que el listado de prospectos no tenía filtro de exclusiones de WhatsApp.
- Se revisaron las plantillas activas de WhatsApp: algunas solicitan “BAJA”, pero esa instrucción no era persistida automáticamente.

### Implementado

- Registro automático de una exclusión activa de WhatsApp cuando la conversación de prospección recibe una negativa definitiva.
- Resolución del prospecto por contacto o teléfono antes de registrar la exclusión.
- Normalización y validación del teléfono antes de almacenarlo.
- Prevención de duplicados mediante consulta de una exclusión activa existente.
- Filtro backend `opt_out_whatsapp`, aplicado antes de paginar.
- Filtro de UI `Estado WhatsApp` con opciones disponibles, solicitó no recibir y todos los estados.
- La opción predeterminada del listado muestra únicamente prospectos disponibles para WhatsApp.
- Persistencia del nuevo filtro en vistas guardadas.
- Documentación funcional en `Plan_Opt.md`.

### Backfill histórico ejecutado

- Se revisaron 13 mensajes candidatos de conversaciones de prospección.
- Se identificaron 12 contactos distintos.
- Se crearon 12 exclusiones activas de WhatsApp.
- 10 quedaron relacionadas a `prospecto_id` y 2 quedaron protegidas por teléfono; un candidato con prospecto se consolidó con otra exclusión del mismo contacto.
- Las filas se marcaron con `origen = whatsapp_backfill` y `motivo = baja`.
- El backfill no modificó ni eliminó mensajes históricos.
- Se validó en Supabase que existen 12 exclusiones activas de WhatsApp y que todas provienen del backfill.

### Verificación técnica

- `git diff --check`: correcto.
- `python3 -m compileall -q backend/app backend/tests`: correcto.

### Pendiente

- Ejecutar una prueba funcional controlada en producción con un prospecto autorizado.
- Confirmar visualmente el filtro en navegador después del deploy.
- Confirmar el bloqueo de una campaña programada que reciba la baja después de su creación.
