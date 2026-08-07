# Changelog del flujo de contactos

Fecha: 2026-04-29 (UTC)

## Resumen

Se implemento y documente la nueva experiencia de CRUD de contactos en el panel, con foco en lenguaje de negocio y flujo guiado.

## Entregado

- Acciones de primer nivel en la vista de contactos:
  - `Nuevo contacto`
  - `Nueva empresa`
  - `Persona física con actividad empresarial`
  - `Vincular contacto a empresa`
- Flujo de alta guiada para contactos.
- Flujo de edicion alineado al mismo lenguaje de usuario final.
- Flujo independiente para vincular contacto con empresa.
- Resumen lateral en desktop para dar contexto del paso actual.
- Ajustes de layout para que el arranque del dashboard no bloquee el primer paint.
- Documentacion actualizada en planes, maqueta y cierre.

## Impacto

- La UI dejo de hablar en terminos de backend para el flujo principal.
- La experiencia permite distinguir mejor entre persona, empresa y relacion.
- La vinculacion ya no depende de crear un contacto nuevo.

## Pendiente

- Detalle post-alta mas rico.
- Mejor UX para sugerencias de duplicado.
- Refinamiento de mobile y accesibilidad.
- Evaluar si se requieren endpoints nativos adicionales para relaciones.

## 2026-08-07 - Atribución WhatsApp con persona canónica

- `prospeccion_whatsapp_atribucion_eventos` guarda el evento con `persona_id`, que es la identidad operativa del refactor.
- `contacto_id` queda como referencia legacy opcional y no recibe automáticamente el `persona_id`.
- Esto evita que una condición de carrera durante la creación de la sombra `contactos` descarte la atribución por una FK legacy.

## 2026-06-17 - Barrido de compatibilidad `persona_id`

Se avanzo el corte operativo de compatibilidad entre `contacto_id` y `persona_id` en backend y panel.

### Entregado hoy

- `prospeccion_whatsapp_atribucion_eventos` ya usa `persona_id` como identidad canónica en escritura y lectura.
- El worker de atribución WhatsApp normaliza `persona_id` en la salida y conserva `contacto_id` solo como sombra temporal.
- `conversaciones` y `v_asignaciones_vendedores` ya priorizan `persona_id` al resolver lecturas operativas.
- El inbox webchat ya resuelve sesión, reply y adjuntos con `persona_id` primero.
- `webchat_followups` y `storage.resolve_webchat_conversation_from_session` ya rehidratan `persona_id` como llave principal.
- `reply_inbox_conversation` y `upload_inbox_attachment` ya usan `persona_id` primero en la ruta interna.
- `messenger` ya normaliza `persona_id` como identidad interna para oportunidad, contexto, resumen y metadatos de salida, manteniendo `contact_id` solo como alias de compatibilidad.
- `GET /crm/oportunidades` y el wrapper de agenda quedaron con `persona_id` como único query param operativo; `contacto_id` ya no se reenvía en ese contrato.
- `CRMRepository.list_opportunities` y sus llamadas internas ya usan `persona_id` como nombre de parámetro, dejando `contacto_id` fuera del contrato Python de oportunidades.
- Las respuestas de oportunidad ya exponen `persona_id` como llave explícita y el panel de oportunidades la consume primero, sin depender del nodo `contacto`.
- La reasignación de oportunidad ya usa `persona_id` en el payload y devuelve `persona_id` / `persona_actualizada`.

### Registro

- Se actualizo `progreso.md` y el inventario final de compatibilidad para reflejar el corte.
- Se dejo el resto de `contacto_id` restante como compatibilidad real o legado cosmetico segun el contrato.
