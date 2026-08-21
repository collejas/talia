# Plan de consolidación de métricas

Fecha: 2026-08-21 (UTC)
Estado: propuesta de arquitectura y simplificación

## 1. Objetivo

Definir una sola responsabilidad para cada métrica y reducir la información
repetida entre:

- `prospeccion/contactos`
- `prospeccion/campanas`
- `prospeccion/metricas`
- `mapa-de-conversion`

La regla de producto es simplificar: una métrica operativa debe tener una
vista principal, y las demás vistas deben enlazar al detalle o mostrar solo el
contexto necesario para su flujo.

Este documento es la referencia transversal. Los planes específicos deben
enlazarlo, pero no redefinir sus KPI ni crear una segunda fuente de verdad.

## Estado de implementación

### 2026-08-21 · Primer corte seguro

- `prospeccion/contactos` ya no solicita ni renderiza salud global, conversión
  por fuente ni eventos globales de correo.
- Se conservaron lotes, estados, envíos, errores, reintentos, cancelaciones y
  bitácora del lote seleccionado.
- Se agregó un enlace contextual a `prospeccion/metricas`.
- El endpoint legacy de métricas permanece temporalmente para compatibilidad
  con integraciones y documentación histórica; ya no participa en la carga de
  esta vista.

### 2026-08-21 · Segundo corte seguro

- `prospeccion/campanas` dejó de solicitar automáticamente la atribución
  jerárquica al cargar.
- El tablero duplicado quedó fuera de la experiencia visible y se agregó un
  enlace a `prospeccion/metricas`.
- La administración de campañas, plantillas y reglas permanece sin cambios.
- Se retiraron los estados, tipos, carga de detalle y helpers que solo existían
  para el árbol jerárquico duplicado.

### 2026-08-21 · Contrato explícito de correo

- `prospeccion/metricas` ahora dispone del bloque `campanas_correo` para
  resumen, detalle y series del canal correo.
- `campanas_whatsapp` y `frases_whatsapp` permanecen como bloques separados.
- `campanas` se conserva temporalmente como compatibilidad y no debe usarse
  para crear nuevas pantallas.

### 2026-08-21 · Payload de campañas del mapa

- `mapa-de-conversion` recibe de la atribución solo sesiones web y contexto de
  campaña/plantilla para correo.
- Para WhatsApp recibe conversaciones y oportunidades, sin el detalle de
  entregabilidad.
- El mapa no debe duplicar aperturas, clics, rebotes o bloqueos de correo.

Validación funcional: las tres secciones de `mapa-de-conversion` fueron
revisadas y continúan operativas después del ajuste del payload.

### Endpoint legacy

El cliente del panel ya no contiene consumidor ni tipo de respuesta para
`/prospeccion/contacto/metrics`. El BFF y el endpoint backend permanecen de
forma temporal para no romper integraciones externas no visibles; su retiro
requiere una verificación de consumidores fuera del repositorio.

## 2. Diagnóstico validado

### 2.1 Correo

El flujo activo de correo usa principalmente:

- `prospeccion_contacto_envio`: ledger operativo de envíos, estados y lotes.
- `prospeccion_contactos_log`: eventos crudos del proveedor, útiles para
  auditoría y diagnóstico.
- La RPC canónica de atribución campaña/plantilla para agregados de reporte.

Las tablas `tenant_email_events` y `tenant_email_messages` existen, pero no
deben mezclarse con el flujo actual hasta que exista una migración explícita.

Los eventos crudos no son KPI por sí mismos: un mismo envío puede tener varios
eventos `open`, `click`, rebote o reintentos. Los indicadores visibles deben
deduplicarse por envío y conservar el log crudo únicamente como auditoría.

### 2.2 Duplicidad funcional actual

- `prospeccion/contactos` mezcla operación de lotes y envíos individuales con
  salud global, conversión por fuente y eventos globales de correo.
- `prospeccion/campanas` administra campañas y plantillas, pero también expone
  métricas jerárquicas de campaña, plantilla, lote y envío.
- `prospeccion/metricas` ya es el lugar natural para el tablero global de
  rendimiento de correo, WhatsApp y campañas.
- `mapa-de-conversion` debe explicar adquisición, visitas web, conversaciones,
  atribución y conversión. Su vista de campañas puede mostrar el resultado
  atribuido al sitio, pero no debe convertirse en un tablero de entregabilidad.

### 2.3 Criterio semántico

Envíos, entregas, aperturas, clics, rebotes y bloqueos describen ejecución y
rendimiento de una campaña. Visitas, sesiones, conversaciones, oportunidades y
clientes describen adquisición y conversión. Pueden relacionarse, pero no son
la misma métrica ni deben competir por el mismo espacio principal.

## 3. Fuentes canónicas

| Dominio | Fuente principal | Uso |
| --- | --- | --- |
| Envíos de correo | `prospeccion_contacto_envio` | enviados, pendientes, fallidos y estados operativos |
| Eventos de correo | `prospeccion_contactos_log` | auditoría del proveedor y cálculo deduplicado por envío |
| Agregado de campañas | RPC canónica de atribución | métricas por campaña, plantilla, periodo y tenant |
| Visitas web | `web_sessions` | sesiones, UTM, referrer y fuente de adquisición |
| Conversaciones y oportunidades | tablas/RPC de atribución CRM | respuesta, oportunidad, cliente y conversión |
| WhatsApp | ledger de mensajes, conversaciones y atribución | envíos, respuestas, costo y conversión WhatsApp |

No se debe crear una tabla paralela de métricas para resolver duplicidad de UI.
Primero debe consolidarse el contrato de agregación y su definición de
deduplicación.

## 4. Responsabilidad objetivo por vista

| Vista | Debe mostrar | Debe dejar de mostrar como bloque global |
| --- | --- | --- |
| `prospeccion/contactos` | lotes, contactos, estados de envío, errores, reintentos y logs del lote seleccionado | salud global, conversión por fuente y eventos globales de correo |
| `prospeccion/campanas` | configuración de campañas, plantillas, canal, audiencia y acciones | tabla completa de KPI repetida por campaña/plantilla/lote/envío |
| `prospeccion/metricas` | tablero global de rendimiento: correo, WhatsApp, conversiones y exportaciones | —; es la vista principal de rendimiento |
| `mapa-de-conversion` | tráfico web, conversaciones, atribución y conversiones | entregabilidad global, aperturas, rebotes y bloqueos como KPI propios |

### Enlaces de navegación

- Desde `contactos`: “Ver métricas globales” con filtros de campaña/lote cuando
  aplique.
- Desde `campanas`: “Ver rendimiento” hacia `prospeccion/metricas`.
- Desde `mapa-de-conversion`: mostrar el resultado atribuido y ofrecer enlace a
  métricas de ejecución si el usuario necesita entregabilidad.

## 5. Contrato mínimo de métricas

El tablero global debe separar visual y semánticamente:

1. `campanas_correo`: enviados, entregados, aperturas únicas, clics únicos,
   rebotes y bloqueos.
2. `campanas_whatsapp`: enviados, entregados, respuestas, oportunidades y
   costo cuando exista.
3. `conversion`: sesiones atribuidas, conversaciones, oportunidades, clientes,
   tasas y valor.

Los estados no necesariamente son excluyentes. La UI debe documentar el
denominador de cada tasa y evitar sumar aperturas o clics como si fueran
personas únicas. Los nombres de bloques deben indicar canal y nivel de
deduplicación.

## 6. Plan de implementación

### Fase 1 · Contrato y definiciones

- Formalizar nombres de campos y denominadores.
- Confirmar que el agregado de correo deduplica por `envio_id`.
- Mantener el evento crudo para auditoría, sin presentarlo como conteo final.
- Verificar tenant, periodo, campaña, plantilla y canal en cada consulta.

### Fase 2 · Simplificación de `prospeccion/contactos`

- Conservar operación de lotes y detalle de envíos.
- Retirar los bloques globales duplicados.
- Mantener logs y errores del lote seleccionado.
- Sustituir métricas removidas por enlaces contextuales a `prospeccion/metricas`.

### Fase 3 · Simplificación de `prospeccion/campanas`

- Conservar configuración y administración.
- Reducir el resumen a estado operativo mínimo.
- Enviar el usuario al tablero global para análisis histórico y comparativo.

### Fase 4 · Consolidación de `prospeccion/metricas`

- Convertir esta vista en el único tablero global de rendimiento.
- Separar bloques de correo, WhatsApp y conversión.
- Mantener filtros, exportaciones y permisos tenant-aware.
- Renombrar contratos ambiguos como `campanas_correo` cuando el bloque sea de
  correo, sin romper temporalmente consumidores existentes.

### Fase 5 · Ajuste de `mapa-de-conversion`

- Mantener `web_sessions` como fuente de visitas web.
- Reducir el payload de atribución de campañas a sesiones, conversaciones,
  oportunidades y resultado atribuido.
- No cargar en el mapa el detalle completo de entregabilidad salvo una acción
  explícita de navegación al tablero de métricas.

## 7. No objetivos y protecciones

- No eliminar tablas ni datos en esta fase.
- No migrar `tenant_email_events` o `tenant_email_messages` sin plan propio.
- No alterar `web_sessions`, la atribución existente ni el contrato nuevo de
  `mapa-de-conversion` sin pruebas de compatibilidad.
- No mezclar lógica de métricas con listas de precios, cotizaciones o snapshots.
- No cambiar funciones nuevas de precios ni sus permisos, migraciones o UI.
- No quitar el detalle operativo que los usuarios necesitan para diagnosticar
  un lote o un envío.

## 8. Criterios de aceptación

- Cada KPI global de correo tiene una sola vista principal.
- `contactos` permite diagnosticar un envío sin duplicar el tablero global.
- `campanas` permite administrar y enlaza al rendimiento sin replicarlo.
- `mapa-de-conversion` responde claramente cuántas visitas y conversiones
  produjo una campaña, sin confundirse con entregabilidad.
- Los conteos son consistentes entre filtros, exportaciones y periodos.
- La deduplicación por envío está probada con múltiples eventos del proveedor.
- Se validan tenant, permisos, estados vacíos, errores y carga en producción.

## 9. Backlog propuesto

1. Especificar el contrato de métricas y sus denominadores.
2. Auditar las consultas actuales de las cuatro vistas.
3. Separar el endpoint operativo de contactos del endpoint global de métricas.
4. Retirar duplicados visuales de contactos y campañas.
5. Reducir el payload de campañas del mapa a adquisición/conversión.
6. Validar UI, exportaciones, RLS, latencia y datos reales.
7. Actualizar changelogs y cerrar compatibilidad con los refactors vigentes.
