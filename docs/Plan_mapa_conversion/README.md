# Mapa de Conversión

Carpeta con la documentación de la vista `mapa-de-conversion`.

## Orden recomendado de lectura

1. `plan_mapa_conversion_integral.md`
2. `plan_latencia_mapa_conversion.md`
3. `plan_mapa_conversion_multicanal.md`
4. `plan_metrica_campanas_whatsapp_y_mapa_conversion.md`
5. `plan_integracion_maestra_mapa_conversion.md`
6. `backlog_maestro_mapa_conversion.md`
7. `changelog_maestro_mapa_conversion.md`
8. `avance_mapa_conversion_20260303.md`

## Qué cubre cada archivo

- `plan_mapa_conversion_integral.md`
  - visión general del mapa
  - arquitectura de datos
  - relación entre sesiones, conversaciones y campañas

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
