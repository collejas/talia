# Mapa de Conversión

Carpeta con la documentación de la vista `mapa-de-conversion`.

## Orden recomendado de lectura

1. `../Plan_metricas/PLAN_CONSOLIDACION_METRICAS.md` (documento transversal)
2. `plan_mapa_conversion_integral.md`
3. `alineacion_tracking_web_tenants_20260815.md`
4. `plan_latencia_mapa_conversion.md`
5. `plan_mapa_conversion_multicanal.md`
6. `plan_metrica_campanas_whatsapp_y_mapa_conversion.md`
7. `plan_atribucion_campanas_y_cobro.md`
8. `informe_metricas_whatsapp_prospeccion.md`
9. `plan_integracion_maestra_mapa_conversion.md`
10. `backlog_maestro_mapa_conversion.md`
11. `changelog_maestro_mapa_conversion.md`
12. `avance_mapa_conversion_20260303.md`

## Qué cubre cada archivo

- `plan_mapa_conversion_integral.md`
  - visión general del mapa
  - arquitectura de datos
  - relación entre sesiones, conversaciones y campañas

- `alineacion_tracking_web_tenants_20260815.md`
  - diez correcciones documentales aplicadas el 2026-08-15
  - relación con el tracking multi-tenant de `docs/Crear_webchat_tenants`
  - regla de columnas explícitas para nuevas tablas

- `plan_latencia_mapa_conversion.md`
  - optimización de carga
  - performance de `resumen-v2`, `mapa-v2` y tablas
  - estados de carga y reducción de latencia percibida

- `plan_mapa_conversion_multicanal.md`
  - lectura de UX y producto
  - mapa como vista multicanal
  - separación semántica entre tráfico, WhatsApp y campañas

- `plan_metrica_campanas_whatsapp_y_mapa_conversion.md`
  - diagnóstico de la separación entre correo, WhatsApp y conversión
  - propuesta de contrato y fuentes por bloque
  - estrategia para no romper el mapa ni el refactor de personas/contactos

- `plan_atribucion_campanas_y_cobro.md`
  - nueva capa para unir campañas, mensajes, cobros, conversaciones y oportunidades
  - KPI de entrega, respuesta, CPO, cierre y CAC
  - frontera entre `mapa-de-conversion` y `Plan_cobro_mensajes`

- `informe_metricas_whatsapp_prospeccion.md`
  - hallazgo real en BD sobre campañas WhatsApp de prospección
  - embudo correcto por lotes, mensajes, conversaciones, entregas y oportunidades
  - causas del desalineamiento actual y plan de corrección

- `plan_integracion_maestra_mapa_conversion.md`
  - ruta maestra de ejecución del refactor
  - orden recomendado de implementación
  - relación entre arquitectura, performance, producto y compatibilidad

- `backlog_maestro_mapa_conversion.md`
  - único backlog operativo de la carpeta
  - orden de ejecución BD -> backend -> frontend
  - checklist de implementación y compatibilidad

- `changelog_maestro_mapa_conversion.md`
  - único changelog operativo de la carpeta
  - historial consolidado de cambios y decisiones

- `avance_mapa_conversion_20260303.md`
  - avance técnico histórico
  - implementación base y migraciones relacionadas

## Nota

El mapa de conversión combina varias fuentes de datos, pero esta documentación separa:

- arquitectura,
- performance,
- lectura de negocio,
- backlog operativo,
- historial de cambios.

## Nota operativa vigente (2026-09-04)

La atribución y las métricas de ejecución deben conservar separados el momento
programado del envío, el despacho inicial, la aceptación del proveedor, la
entrega y la respuesta. Para auditar intervalos de prospección se debe usar
`docs/Prospeccion/envios_y_separacion.md`; `procesado_en` puede cambiar por
callbacks posteriores y no representa siempre el despacho inicial.
