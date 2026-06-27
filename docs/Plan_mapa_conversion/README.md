# Mapa de Conversión

Carpeta con la documentación de la vista `mapa-de-conversion`.

## Orden recomendado de lectura

1. `plan_mapa_conversion_integral.md`
2. `plan_latencia_mapa_conversion.md`
3. `plan_mapa_conversion_multicanal.md`
4. `changelog.md`
5. `avance_mapa_conversion_20260303.md`

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

- `changelog.md`
  - cambios recientes aplicados
  - fixes, backfill, documentación y alineación de planes

- `avance_mapa_conversion_20260303.md`
  - avance técnico histórico
  - implementación base y migraciones relacionadas

## Nota

El mapa de conversión combina varias fuentes de datos, pero esta documentación separa:

- arquitectura,
- performance,
- lectura de negocio,
- historial de cambios.
