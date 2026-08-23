# Plan de atribución de campañas, conversiones y cobro WhatsApp

**Fecha:** 2026-08-16  
**Estado:** plan aprobado para diseño e implementación.  
**Vista principal:** `mapa-de-conversion?vista=campaigns`  
**Relación:** `docs/Plan_cobro_mensajes/Plan_base_cobro_mensajes_por_tenant.md`

## 1. Objetivo

Crear una capa de atribución que mida el rendimiento comercial de cada campaña
de WhatsApp sin mezclar la lógica comercial con el ledger de cobro.

La unidad comercial y de conversión será la **conversación**. Los mensajes se
usarán como evidencia operativa y para sumar el costo; los hilos internos no
serán una unidad de medición.

```text
Enviados → Entregados → Respondieron → Oportunidades → Clientes
```

La vista deberá responder cuántos mensajes se enviaron y entregaron, cuántos
contactos respondieron, cuántas respuestas generaron oportunidades, cuántas
se ganaron y cuánto costó conseguir una oportunidad o un cliente.

## 2. Decisión de arquitectura

No se ampliará `cobro_mensajes` con columnas comerciales ni se alterará su
responsabilidad.

`cobro_mensajes` seguirá siendo la fuente de verdad para cargo GEOACTIV, costo
informativo de Meta, categoría Meta, periodo, conciliación, tenant y mensaje
facturable.

El mapa utilizará una capa de atribución que relacionará campañas con mensajes,
conversaciones y oportunidades. El costo se consultará mediante
`cobro_mensaje_id`; no se copiarán importes en las tablas de campañas.

Una conversación contará una sola vez, aunque contenga muchos mensajes o
varios hilos técnicos internos.

## 3. Modelo de datos propuesto

### 3.1 `campana_mensaje_atribucion`

Una fila por mensaje que participa en el embudo de una campaña.

Columnas principales:

- `id uuid primary key`;
- `organizacion_id uuid not null`;
- `campana_id uuid not null`;
- `lote_id uuid null`;
- `envio_id uuid null`;
- `mensaje_id uuid null`;
- `cobro_mensaje_id uuid null`;
- `conversacion_id uuid null`;
- `contacto_id uuid null`;
- `direccion text not null` (`entrante` o `saliente`);
- `tipo_atribucion text not null` (`envio_campana`, `respuesta`, `seguimiento`);
- `es_mensaje_inicial boolean not null default false`;
- `respondio boolean not null default false`;
- `entregado_en timestamptz null`;
- `respondio_en timestamptz null`;
- `regla_atribucion text not null`;
- `creado_en timestamptz not null`;
- `actualizado_en timestamptz not null`.

La relación con `cobro_mensajes` será opcional mientras un envío esté pendiente
de persistencia o conciliación. No se generará un cobro artificial si falta el
mensaje local.

### 3.2 `campana_conversion`

Una fila de atribución comercial por campaña y conversación. El contacto se
conserva como relación de apoyo, pero no sustituye a la conversación como
unidad de medición.

Columnas principales:

- `id uuid primary key`;
- `organizacion_id uuid not null`;
- `campana_id uuid not null`;
- `contacto_id uuid not null`;
- `conversacion_id uuid null`;
- `mensaje_respuesta_id uuid null`;
- `oportunidad_id uuid null`;
- `respondio_en timestamptz null`;
- `oportunidad_creada_en timestamptz null`;
- `cliente_ganado_en timestamptz null`;
- `estado_atribucion text not null`;
- `regla_atribucion text not null`;
- `creado_en timestamptz not null`;
- `actualizado_en timestamptz not null`.

Restricciones: una sola conversión inicial por `organizacion_id + campana_id +
conversacion_id`; respuestas repetidas o hilos internos no crean otra
conversión; una persona sí puede tener conversaciones y oportunidades distintas
en campañas distintas; todas las relaciones deben estar protegidas por tenant.

## 4. Unidad de medición

La medición comercial no contará hilos.

- Una conversación atribuida cuenta como `1`, independientemente de cuántos
  hilos técnicos o mensajes contenga.
- Los mensajes enviados y entregados pueden medirse como métricas operativas,
  pero no representan conversaciones adicionales.
- Una respuesta posterior dentro de la misma conversación no crea otra
  respuesta atribuida ni otra oportunidad.
- Los KPI de respuesta, oportunidad, cierre y CAC deben agrupar por
  `conversacion_id`.
- El costo total de una conversación es la suma de los cargos de todos sus
  mensajes cobrables:

```text
costo_total_conversacion = suma(cargo_app_mxn + costo_meta_mxn)
```

- Los hilos internos solo sirven para ordenar o reconstruir el historial y no
  deben aparecer como unidades en los KPI comerciales.

## 5. Regla de atribución

- **Envío:** mensaje saliente relacionado con el lote o envío de campaña.
- **Entrega:** evento oficial del proveedor; no es un mensaje ni cargo adicional.
- **Respuesta:** primera respuesta entrante del contacto posterior al envío
  inicial, dentro de la ventana definida.
- **Oportunidad:** oportunidad creada por esa respuesta.
- **Cliente:** oportunidad que alcanza la etapa comercial `ganado`.

La respuesta debe quedar ligada a contacto, conversación, tenant y campaña.
La atribución no se inferirá por el texto del mensaje.

## 6. KPI oficiales

| KPI | Fórmula |
|---|---|
| Enviados | Mensajes salientes aceptados por el proveedor |
| Entregados | Mensajes con estado `delivered` |
| Tasa de entrega | Entregados / Enviados × 100 |
| Conversaciones respondidas | Conversaciones únicas con primera respuesta atribuida |
| Tasa de respuesta | Conversaciones respondidas / conversaciones entregadas × 100 |
| Oportunidades | Oportunidades atribuidas a conversaciones |
| Tasa de oportunidad | Oportunidades / conversaciones respondidas × 100 |
| Costo por conversación | Costo total de campaña / conversaciones atribuidas |
| Costo por oportunidad (CPO) | Costo total de campaña / oportunidades |
| Clientes | Oportunidades en etapa `ganado` |
| Tasa de cierre | Clientes / oportunidades × 100 |
| CAC WhatsApp | Costo total de campaña / clientes |

Como cada respuesta crea una oportunidad en la regla actual del producto,
tasa de respuesta y tasa de oportunidad describen el mismo embudo. La
interfaz mostrará conversaciones únicas, oportunidades y costos agregados por
conversación; nunca mostrará hilos como conversiones.

## 7. Costo de campaña y conversación

El costo de campaña se calculará desde el ledger, sin copiar importes:

```text
costo_neto_campana = suma(cargo_app_mxn + costo_meta_mxn)
```

El IVA se mostrará separado conforme a la decisión comercial documentada en
`Plan_cobro_mensajes`: `$0.09 MXN + IVA` por mensaje.

Los mensajes atribuidos sin `cobro_mensaje_id` se mostrarán como pendientes de
conciliación y no se incluirán silenciosamente en el costo. Los cargos de todos
los mensajes vinculados a una misma conversación se agruparán para obtener su
costo total, sin contar los hilos de esa conversación.

## 8. Vistas del producto

### `mapa-de-conversion?vista=campaigns`

Será la vista principal: KPI del periodo, embudo, tasas, CPO, tasa de cierre,
CAC WhatsApp, tabla por campaña y desglose opcional por plantilla.

### `mapa-de-conversion?vista=conversations`

Conservará conversaciones por canal, quién respondió, CTAs y reglas de
atribución. No duplicará CPO ni CAC.

### Dashboard general

Podrá mostrar un resumen agregado consumiendo el mismo endpoint, sin duplicar
fórmulas.

### `prospeccion/metricas`

La subvista WhatsApp consumirá el mismo agregado de atribución y cobro para
mostrar el rendimiento comercial de campañas: conversaciones, oportunidades,
clientes, costo total, CPO y CAC cuando corresponda. Esta vista no sustituye al
mapa; presenta la misma verdad desde la perspectiva de eficiencia de campaña.

No se copiarán importes ni se crearán cálculos alternos en el frontend. Los
costos incompletos se marcarán como pendientes de conciliación.

## 9. Backend y consultas

Crear un resumen específico de atribución que acepte tenant, campaña, plantilla,
periodo predefinido/rango manual y canal WhatsApp, respetando RLS.

El resumen debe ser reutilizable por `mapa-de-conversion` y
`prospeccion/metricas`, incluyendo resultado comercial y costos derivados del
ledger mediante `cobro_mensaje_id`.

La consulta unirá:

```text
campana_mensaje_atribucion
        → mensajes
        → cobro_mensajes
        → conversaciones
        → campana_conversion
        → oportunidades
```

La agregación será reutilizable por mapa, dashboard y exportaciones.

## 10. Frontend y exportación

En `campaigns` se agregarán tarjetas KPI compactas, embudo, tabla por campaña,
desglose por plantilla, filtros consistentes, exportación y estados de carga,
vacío, error y pendientes de conciliación. Se mostrarán nombres legibles, no
UUID como información principal.

## 11. Fases

### Fase 1 — Contrato y auditoría

- Inventariar llaves entre campañas, lotes, envíos, WAMID, mensajes,
  conversaciones y oportunidades.
- Medir huérfanos y registros sin atribución.
- Aprobar ventana y regla de atribución.

### Fase 2 — Base de datos

- Crear `campana_mensaje_atribucion` y `campana_conversion`.
- Agregar foreign keys, índices, constraints y RLS.
- Crear funciones idempotentes de atribución. **Completado:** `sync_campana_atribucion` sincroniza envíos explícitos, primera respuesta y conversión por conversación.
- Ejecutar y validar una sincronización inicial sin modificar el ledger. **Completado:** 157 envíos, 5 respuestas y 5 conversiones; 5 respuestas quedaron pendientes por ausencia de `cobro_mensaje_id`.

### Fase 3 — Backend

- Registrar atribución al crear el envío. **Parcialmente completado:** el registro de WhatsApp programa sincronización idempotente después de persistir el mensaje.
- Actualizar entregas desde callbacks.
- Registrar una sola primera respuesta. **Parcialmente completado:** las respuestas entrantes activan la sincronización por conversación.
- Enlazar oportunidad y etapa ganada.
- Crear resumen, exportación y pendientes de conciliación. **Resumen completado:** `GET /crm/demografia/campanas-conversion` devuelve KPI por campaña y totales usando costos reales del ledger.
- Conectar tarjetas, tabla y filtros de `vista=campaigns`. **Completado:** la UI consume el BFF de conversión y mantiene separado el análisis web histórico.

### Fase 4 — Frontend

- Incorporar el embudo en `vista=campaigns`.
- Agregar CPO, CAC, tabla por campaña y plantilla.
- Respetar filtros de tenant, periodo y campaña.

### Fase 5 — Validación

- Probar campañas sin respuesta, respuestas repetidas, varias campañas por
  contacto, oportunidades ganadas/perdidas, duplicados, callbacks tardíos,
  RLS y mensajes sin ledger.
- Comparar resultados contra `Plan_cobro_mensajes`.

## 12. Relación con `Plan_cobro_mensajes`

| Responsabilidad | Fuente de verdad |
|---|---|
| Mensaje facturable | `cobro_mensajes` |
| Cargo GEOACTIV y costo Meta | `cobro_mensajes` |
| Categoría Meta | callback y ledger de cobro |
| Campaña de origen | `campana_mensaje_atribucion` |
| Primera respuesta | `campana_conversion` |
| Oportunidad | `oportunidades` relacionada |
| Cliente ganado | etapa/historial de oportunidad |
| CPO y CAC | atribución + ledger de cobro |

Regla final: el mapa consume costos existentes; no crea ni recalcula cargos.

### Atribución inbound por frases/CTA

La atribución de frases de WhatsApp es un flujo distinto al cobro de mensajes
outbound. Su gasto se registra en
`prospeccion_whatsapp_atribucion_gastos`, por campaña publicitaria, canal,
periodo, moneda y estado de conciliación. `prospeccion/metricas` usa ese ledger
para CPO y CAC de `WhatsApp > Atribución`; nunca lo mezcla con `cobro_mensajes`.

La implementación y el contrato detallado están documentados en
`docs/Plan_metricas/PLAN_REFACTOR_VISTA_METRICAS.md`.
