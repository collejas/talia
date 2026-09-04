# Propuesta: separación estricta entre envíos de prospección

Fecha: 2026-09-04 (UTC)
Estado: propuesta técnica, pendiente de implementación

## 1. Objetivo

Garantizar que los despachos reales de correo y WhatsApp respeten como mínimo
la separación configurada entre llamadas a los proveedores. Con una separación
de 5 segundos, el siguiente despacho del mismo ámbito no debe iniciar antes de
que transcurran 5 segundos desde el anterior.

La garantía aplica al despacho desde Talia hacia el proveedor. No significa que
el proveedor entregue el mensaje exactamente cinco segundos después.

## 2. Ámbito recomendado

La unidad de control recomendada es:

```text
organizacion_id + canal
```

Así, una organización puede enviar correo y WhatsApp en paralelo, pero cada
canal conserva una secuencia única. Si el negocio exige separación global entre
canales, la clave puede cambiarse a `organizacion_id + "global"`.

Esta decisión debe confirmarse antes de implementar.

## 3. Coordinador durable

Mantener `prospeccion_contacto_envio.programado_en` como hora objetivo, pero no
usarlo como único mecanismo de throttling. Varios procesos pueden leer envíos
vencidos al mismo tiempo.

Crear una tabla explícita `prospeccion_envio_rate_limit` con:

- `organizacion_id`;
- `canal`;
- `separacion_segundos`;
- `siguiente_despacho_permitido_en`;
- `ultimo_envio_id`;
- `ultimo_despacho_iniciado_en`;
- `actualizado_en`.

Agregar `unique (organizacion_id, canal)` y protegerla con RLS por tenant. El
worker debe usar `service_role`, igual que el resto de su acceso operativo.

## 4. Reserva atómica

Crear una RPC transaccional que:

1. bloquee la fila de organización y canal;
2. lea `siguiente_despacho_permitido_en`;
3. devuelva `permitido=false` y el siguiente instante si aún no corresponde;
4. reserve el turno y avance el siguiente instante si corresponde;
5. devuelva un identificador de reserva.

La lectura, comparación y actualización deben ocurrir en una misma transacción.
No debe implementarse con un GET seguido de un PATCH desde Python.

## 5. Cambios del worker

El worker puede conservar concurrencia para distintos tenants o canales, pero
cada tarea debe reservar turno antes de llamar a Meta, Brevo o Postmark.

Si no hay turno disponible:

- el envío permanece `pendiente`;
- `programado_en` se mueve al instante devuelto;
- se registra `rate_limited`;
- no se incrementa el intento del proveedor;
- no se mantiene una tarea bloqueada durante todo el intervalo.

La reserva durable debe ser la garantía principal. El lock `asyncio` actual sólo
coordina tareas dentro de un proceso y puede mantenerse como optimización local.

## 6. Timestamps explícitos

Agregar o documentar claramente estos momentos:

- `programado_en`: hora objetivo;
- `despacho_iniciado_en`: justo antes de llamar al proveedor;
- `proveedor_aceptado_en`: recepción del SID o confirmación de encolamiento;
- `procesado_en`: última actualización operativa compatible;
- `entregado_en` y `leido_en`: callbacks posteriores cuando existan.

Los callbacks no deben sobrescribir el timestamp del despacho inicial. En
Postmark/Brevo, la aceptación o encolamiento no equivale a entrega final.

## 7. Reintentos y fallos

- Un reintento solicita una nueva reserva.
- El backoff del error se combina con la separación mínima tomando el mayor.
- Un error previo a la llamada no debe consumir un turno de proveedor.
- Un envío omitido por opt-out o datos inválidos no debe consumir un turno.
- Si Meta o el proveedor aceptó el mensaje, nunca se debe reenviar por un fallo
  posterior de persistencia local; se repara usando el ID externo.
- Los envíos `procesando` deben tener lease/timeout para recuperarse después de
  un reinicio.

## 8. Cambios por capa

### Base de datos

- Migración de `prospeccion_envio_rate_limit`.
- RPC transaccional de reserva.
- Índices por organización, canal, estado y `programado_en`.
- Timestamps de despacho y aceptación en `prospeccion_contacto_envio`.
- RLS tenant-scoped y acceso service-role para el worker.

### Backend

- Servicio dedicado `prospeccion_send_rate_limiter.py`.
- Reserva previa a `_run_envio_correo` y `_run_envio_whatsapp`.
- Reprogramación sin incrementar intento cuando sólo espera turno.
- Métricas de reservas concedidas, diferidas y violaciones.

### Frontend

- Mostrar que la separación es mínima de despacho.
- Mostrar configuración efectiva y retrasos por rate limit.
- No presentar `programado_en` como confirmación de envío.

## 9. Criterios de aceptación

### Correo y WhatsApp

- Lanzar 10 envíos con separación de 5 segundos por canal.
- Obtener el primer despacho de cada `envio_id`.
- Ningún intervalo entre `despacho_iniciado_en` consecutivos debe ser menor a
  5 segundos, salvo una tolerancia técnica documentada de milisegundos.
- Verificar por separado aceptación, entrega, lectura, rebote y respuesta.

### Concurrencia y reinicio

- Ejecutar dos lotes simultáneos del mismo tenant y canal.
- Confirmar que no haya reservas duplicadas ni intervalos menores.
- Ejecutar correo y WhatsApp simultáneamente y comprobar su secuencia propia.
- Reiniciar el servicio durante un lote y verificar recuperación sin duplicados.

## 10. Decisión pendiente

1. **Recomendada:** separación de 5 segundos por organización y canal.
2. **Más conservadora:** separación global de 5 segundos entre correo y WhatsApp.

La propuesta soporta ambas políticas; cambia únicamente la clave de
coordinación del rate limiter.
