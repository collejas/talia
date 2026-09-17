# Vector Store · Atención UNIDEL WhatsApp

Nombre sugerido: `unidel_atencion_whatsapp_vs`

Este paquete contiene conocimiento factual de UNIDEL para atención general por WhatsApp. El tono, el flujo, las reglas de herramientas y el cierre del lead viven en `../whatsapp/whatsapp_prompt.md` y `../whatsapp/whatsapp_funciones.md`.

## Archivos

- `01_empresa_y_propuesta_valor.md`
- `02_prendas_y_catalogo.md`
- `03_personalizacion_y_proceso.md`
- `04_sectores_y_casos_de_uso.md`
- `05_faq_y_cotizacion.md`
- `06_limites_y_compliance.md`

El catálogo con precios, existencia, tallas y colores debe consultarse en la fuente operativa habilitada; no se congela en estos documentos.

## Carga

1. Crear o conservar `unidel_atencion_whatsapp_vs`.
2. Cargar los seis archivos de esta carpeta.
3. Asociarlo únicamente al prompt de Atención de UNIDEL.
4. Registrar el ID remoto y la versión publicada en la configuración del tenant.
5. Verificar que cada archivo quede en estado `completed` y probar preguntas de empresa, personalización, cotización y catálogo.

Los archivos locales por sí solos no crean ni vinculan una vector store remota.
