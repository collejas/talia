# Vector Store · Prospección WhatsApp

Nombre sugerido: `talia_prospeccion_vs`

Este vector store contiene conocimiento factual para conversaciones de prospección. El comportamiento del agente, el tono, los límites y las reglas de herramientas viven en `whatsapp_prompt_prospeccion.md`, no en estos archivos.

## Contenido

- `01_propuesta_valor_por_industria.md`: ejemplos prudentes de aplicación, sin resultados garantizados.
- `02_objeciones_y_respuestas.md`: respuestas breves a preguntas comerciales.
- `03_cierre_demo.md`: reglas para ofrecer una demo sin presionar.
- `04_faq_comercial.md`: capacidades confirmadas del sistema.
- `05_compliance_prospeccion.md`: límites, bajas y uso responsable.
- `06_normalizacion_inteligente_de_canales.md`: interpretación de abreviaturas comunes.

## Reglas de mantenimiento

- Mantener solo información comprobable y vigente.
- No incluir precios, porcentajes, testimonios o integraciones no verificadas.
- No incluir instrucciones de comportamiento que contradigan el prompt.
- No incluir secretos, datos de tenants, conversaciones reales ni enlaces internos.
- Si un dato no está aquí ni en el contexto de la conversación, el agente debe reconocer que no lo tiene.

## Publicación

1. Crear o conservar el vector store `talia_prospeccion_vs`.
2. Subir los seis archivos de este directorio.
3. Asociarlo exclusivamente al prompt configurado en `whatsapp.prospeccion.prompt_id`.
4. Probar respuestas de capacidades, precio, rechazo, baja, solicitud de información y demo.
