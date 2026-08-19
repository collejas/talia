# Paquete OpenAI · RentaAuto

Este paquete documenta la configuración propuesta para los flujos de **Prospección** y **WhatsApp / atención** de RS Rentauto.

## Estructura

- `Prospeccion/Prompt.md`: comportamiento para contactos provenientes de campañas o prospección.
- `Prospeccion/Funciones.md`: funciones permitidas para calificar y derivar leads.
- `WhatsApp/Prompt.md`: comportamiento para conversaciones de atención iniciadas por el usuario.
- `WhatsApp/Funciones.md`: funciones permitidas para atención, información y agenda.
- `Prospeccion/vector_store/`: conocimiento factual exclusivo del flujo de prospección.
- `WhatsApp/vector_store/`: conocimiento factual exclusivo del flujo de atención.

## Vector store

Nombres sugeridos:

- `Vector_store_Pros_RentaAuto`
- `Vector_store_Atencion_RentaAuto`

Los archivos locales describen el contenido que debe cargarse en OpenAI; por sí solos no crean vector stores remotas ni las vinculan a prompts. La asociación, publicación y prueba deben realizarse en la configuración del tenant. No mezclar ambos paquetes.

## Fuente de verdad

La fuente comercial inicial es `Descripcion_rentauto.md`. Si el sitio o el equipo de RentaAuto confirma precios, modelos adicionales, disponibilidad, requisitos, cobertura, horarios o políticas, deben actualizarse primero estos documentos antes de publicar un prompt nuevo.
