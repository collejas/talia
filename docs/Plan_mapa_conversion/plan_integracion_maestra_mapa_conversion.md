# Integracion maestra · Plan de mapa de conversion

Fecha: 2026-07-01
Ruta: `docs/Plan_mapa_conversion/plan_integracion_maestra_mapa_conversion.md`

## 1) Proposito

Este documento integra toda la carpeta `docs/Plan_mapa_conversion` en una ruta unica de ejecucion.

La ejecucion activa vive en:

- `backlog_maestro_mapa_conversion.md`
- `changelog_maestro_mapa_conversion.md`

La meta es que el refactor del ecosistema de mapa de conversion avance de forma ordenada, sin mezclar:

- arquitectura,
- performance,
- lectura de producto,
- metricas de prospeccion,
- compatibilidad con personas/contactos,
- ni cambios de frontend antes de cerrar el contrato de datos.

### Ruta corta recomendada

Si vamos a ejecutar el plan sin dispersarnos, el orden debe ser este:

1. Cerrar el contrato v2 de `mapa-de-conversion`.
2. Crear la base de datos del mapa v2.
3. Publicar el backend v2 del mapa.
4. Ajustar la UI del mapa.
5. Validar con datos reales y dejar compatibilidad temporal.

Regla práctica:

- `prospeccion/metricas` y `prospeccion/prospectos` solo apoyan la validación.
- `mapa-de-conversion` es la entrega principal.
- `persona/contacto` no se toca salvo que bloquee el contrato del mapa.

## 2) Principio rector

No hay una sola vista ni una sola fuente de verdad para todo.

El sistema debe mantenerse como tres capas coordinadas:

1. `Trafico web`
2. `Conversaciones y atribucion`
3. `Campanas y conversion`

Cada capa puede compartir relaciones, pero no debe compartir semantica.

## 3) Como se integran los documentos existentes

### 3.1 `plan_mapa_conversion_integral.md`

Es el documento rector de arquitectura.

Define:

- objetivo de negocio,
- modelo de datos,
- fuentes principales,
- contrato general del mapa,
- y direccion tecnica de largo plazo.

### 3.2 `plan_latencia_mapa_conversion.md`

Es el documento de performance y estabilidad.

Define:

- tiempos de carga,
- cachés,
- versiones `v2`,
- y reduccion de latencia percibida.

### 3.3 `plan_mapa_conversion_multicanal.md`

Es el documento de lectura de producto y UX.

Define:

- como debe leer la vista el usuario,
- como separar trafico, WhatsApp y campañas,
- y como evitar que todo parezca una sola categoria.

### 3.4 `changelog.md`

Es la bitacora de lo ya corregido.

Sirve para:

- no repetir fixes,
- no perder contexto historico,
- y saber que ya se resolvio en la practica.

Nota:

- el changelog operativo unico es `changelog_maestro_mapa_conversion.md`
- `changelog.md` quedo como referencia historica

### 3.5 `avance_mapa_conversion_20260303.md`

Es el registro tecnico historico.

Sirve para:

- entender el origen de la implementacion,
- revisar decisiones previas,
- y evitar contradicciones con el diseño actual.

### 3.6 `plan_metrica_campanas_whatsapp_y_mapa_conversion.md`

Es el nuevo documento de alineacion funcional.

Define:

- por que `prospeccion/metricas` no debe seguir mezclando correo y WhatsApp,
- como separar metricas de correo, WhatsApp y conversion,
- y como no romper `mapa-de-conversion` ni el refactor de personas/contactos.

### 3.7 `informe_metricas_whatsapp_prospeccion.md`

Es el informe tecnico del hallazgo en BD.

Define:

- el universo real de campañas WhatsApp de prospeccion,
- el embudo correcto por mensajes, conversaciones y oportunidades,
- y la causa del desalineamiento entre vistas y datos reales.

## 4) Ruta maestra de refactor

### Fase 1. Cerrar contrato semantico

Objetivo:

- dejar formalmente separados los bloques de datos, con el mapa como entrega principal.

Entregables:

- contrato de `prospeccion/metricas` con bloques separados,
- contrato de `mapa-de-conversion` con trafico, conversacion y atribucion,
- nomenclatura final de bloques.

### Fase 2. Separar fuentes de verdad

Objetivo:

- dejar de depender de un ledger unico para todo.

Entregables:

- correo sigue con su ledger historico,
- WhatsApp obtiene su agregado propio,
- conversion usa conversaciones y oportunidades,
- `persona_id` se vuelve llave principal cuando aplique.

Referencia operativa:

- el detalle del hallazgo y las cifras reales estan en `informe_metricas_whatsapp_prospeccion.md`.

### Fase 3. Ajustar backend

Objetivo:

- crear o adaptar agregados sin romper compatibilidad.

Entregables:

- nueva agregacion de WhatsApp por batch/conversacion/oportunidad,
- bloques de respuesta separados,
- compatibilidad temporal con `contacto_id`,
- uso correcto de `persona_id`.

### Fase 4. Ajustar frontend

Objetivo:

- mostrar la separacion de manera evidente, cerrando primero `mapa-de-conversion` y dejando `prospeccion/metricas` como soporte.

Entregables:

- `prospeccion/metricas` con bloques distintos para correo y WhatsApp,
- `mapa-de-conversion` manteniendo su lectura multicanal,
- estados vacios y de carga por bloque.

### Fase 5. Validacion y backfill

Objetivo:

- asegurar que las metricas no queden vacias ni duplicadas.

Entregables:

- comparacion entre datos reales y UI,
- validacion de respuestas y oportunidades,
- ajustes de compatibilidad y backfill si hace falta.

## 5) Orden recomendado de ejecucion

Este es el orden correcto para no romper lo existente:

1. Congelar contrato semantico.
2. Diseñar el agregado de WhatsApp.
3. Ajustar backend para producir bloques separados.
4. Ajustar frontend para leer los nuevos bloques.
5. Validar con datos reales.
6. Mantener compatibilidad legacy solo donde sea necesario.

## 6) Que no se debe hacer

- No mover primero la UI sin definir el contrato.
- No forzar WhatsApp dentro del ledger de correo.
- No eliminar `contacto_id` antes de validar `persona_id` en toda la ruta.
- No convertir `mapa-de-conversion` en dashboard de envios.
- No duplicar la semantica de conversacion como si fuera envio.

## 7) Como se relaciona con el plan maestro

El plan maestro del mapa de conversion sigue mandando la arquitectura base.

Este documento solo organiza la ejecucion incremental para integrar:

- el nuevo hallazgo de campañas WhatsApp,
- el refactor de personas/contactos,
- y la separacion de metricas por dominio.

La regla es:

- el plan maestro define el destino,
- este documento define el camino,
- los documentos hijos definen el detalle de cada tramo.

## 8) Resultado esperado

Cuando este refactor termine, deberiamos tener:

- `mapa-de-conversion` como vista principal cerrada,
- `prospeccion/metricas` con correo y WhatsApp separados como soporte de lectura,
- compatibilidad estable con `persona_id` y `contacto_id`,
- y una lectura de negocio que ya no mezcle cosas distintas bajo un solo KPI.
