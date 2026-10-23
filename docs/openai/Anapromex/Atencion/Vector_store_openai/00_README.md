# Vector Store · Atención ANAPROMEX WhatsApp

Nombre de la vector store: `vector_ana_atencion`.

Contiene el conocimiento factual de atención. El tono, el flujo, los límites y el uso de funciones viven en `../whatsapp/whatsapp_prompt.md` y `../whatsapp/whatsapp_funciones.md`.

## Archivos

- `01_empresa_y_servicios.md`
- `02_afiliacion_y_precios.md`
- `03_amparo_identificacion_y_seguro.md`
- `04_tramites_y_afiliados.md`
- `05_sucursales_y_atencion_juridica.md`
- `06_faq_atencion.md`
- `07_limites_y_compliance.md`

Los archivos locales deben cargarse en una vector store remota y asociarse únicamente al prompt de Atención. La existencia de estos archivos no demuestra que la vector store remota ya esté creada o vinculada.

## Publicación

1. Crear o conservar `vector_ana_atencion`.
2. Cargar los siete archivos de esta carpeta, excepto este README si la carga operativa no lo requiere.
3. Asociarla únicamente al prompt de Atención ANAPROMEX.
4. Registrar el ID remoto y la versión publicada en la configuración del tenant.
5. Verificar que cada archivo quede en estado `completed` y probar afiliación, precios, amparo, seguro, trámites y atención jurídica.

