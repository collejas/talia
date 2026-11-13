# Recuperación de envíos de prospección

## Alcance

Corregir el import de errores Postmark, hacer visibles los errores de persistencia
y evitar que un envío permanezca indefinidamente en `procesando` tras un timeout
o reinicio. La protección global de carga conserva su comportamiento.

## Regla de recuperación

- Registrar `procesamiento_iniciado_en` como columna explícita al reclamar un envío.
- Revisar cada minuto, por canal y en bloques acotados, reclamaciones de más de
  una hora. Usar bloqueos de fila con `SKIP LOCKED` para workers concurrentes.
- Conciliar correos por organización y clave `prospeccion-envio:<id>` con la cola
  durable de correo. Conservar resultado, identificadores y fechas existentes.
- Si el correo sigue en cola, el envío de prospección queda como `enviado`
  (encolado internamente), sin afirmar aceptación del proveedor. La cola de correo
  conserva la responsabilidad del despacho; no se crea otro mensaje.
- Si no existe resultado verificable, terminar con error
  `processing_expired_review_required`. No reencolar automáticamente: un timeout
  no demuestra que el proveedor no recibió el mensaje.
- Actualizar los lotes afectados dentro de la misma transacción. No modificar
  envíos cancelados ni otros estados terminales.

## Validación y operación

Reproducir fallos de preparación Postmark, finalización después de aceptación y
recuperación con aislamiento de tenant, estados terminales y reclamaciones activas.
Aplicar primero la migración compatible con workers anteriores; después reiniciar
los workers y verificar versión, salud y contador. No reabrir los 488 registros
cerrados por instrucción del usuario. La recuperación conservadora puede requerir
revisión manual de envíos sin evidencia; nunca enviarlos de nuevo por defecto.

## Entrega del 13 de noviembre de 2026

- Migración `20261113220927_recover_stalled_prospeccion_envios.sql` aplicada.
- 57 pruebas Python aprobadas (servicio/adaptador Postmark y sender).
- Regresión SQL en PostgreSQL 17 aislado: estados de correo, aceptación real,
  aislamiento de tenant, cancelaciones y permisos. Comprobación adicional con
  dos conexiones: filas bloqueadas omitidas y ejecución como `service_role`.
- Workers de correo y WhatsApp reiniciados a las 22:13 UTC. Recuperación consultada
  contra producción sin candidatos; contador global en cero y protección liberada.
- No se modificó el prompt ni el umbral global. Los envíos inciertos requieren
  revisión, no reintento automático. No se reabrieron los registros cancelados.
