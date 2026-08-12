# Vector Store · Atención Tal-IA

Nombre sugerido: `talia_atencion_vs`

Este vector store contiene únicamente conocimiento factual para personas que llegan por WhatsApp o Webchat. El comportamiento del agente, el tono, la longitud, el uso de herramientas y las reglas de cierre viven en los prompts de cada canal y en la política dinámica del tenant inyectada por el backend.

## Archivos que se deben subir

- `01_capacidades_talia.md`
- `02_faq_producto.md`
- `03_precios_y_planes.md`
- `04_crm_agenda_y_vendedores.md`
- `05_canales_y_campanas.md`
- `06_limites_y_compliance.md`
- `07_modulo_inmobiliario.md`

No subir este README ni los archivos de funciones como conocimiento del agente.

## Reglas de mantenimiento

- Mantener solo información comprobable y vigente.
- Los precios deben coincidir con `landing/src/precios/index.html`.
- Si cambia la landing, actualizar `03_precios_y_planes.md` antes de publicar una nueva versión.
- No incluir secretos, datos de tenants, conversaciones reales ni enlaces internos.
- No incluir instrucciones de comportamiento dentro del conocimiento factual.
- No incluir reglas de campos obligatorios de `close_lead`; esas reglas se configuran por tenant/canal en `close_lead_policies`.
- No incluir esquemas ni descripciones de funciones; las funciones se publican por separado en OpenAI.

## Publicación

1. Crear o conservar el vector store `talia_atencion_vs`.
2. Subir los siete archivos numerados.
3. Asociarlo exclusivamente al prompt de atención.
4. Probar dudas de capacidades, precios, CRM, campañas, agenda, módulo inmobiliario, rechazo y despedida.
