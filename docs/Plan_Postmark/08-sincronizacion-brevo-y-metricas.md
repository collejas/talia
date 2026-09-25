# Sincronización Brevo y métricas unificadas

## Objetivo

Los tenants que usan Brevo deben ver sus eventos de correo en la misma vista
`prospeccion/metricas` que los tenants que usan Postmark. La aplicación conserva
el proveedor en la configuración del tenant, pero la métrica operacional se
presenta con el contrato común de Prospección.

## Flujo

1. Brevo envía eventos en tiempo real al webhook existente.
2. TalIA correlaciona cada evento por tenant y `message-id`.
3. Cada evento se persiste en `prospeccion_correo_eventos`; esta tabla es
   histórica e idempotente y no se borra cuando Brevo deja de conservar el
   evento.
4. El registro legado de Prospección se actualiza solo cuando el evento mejora
   el estado del envío. Aperturas, clics y rebotes tardíos se conservan aunque
   no degraden un envío ya entregado.
5. La conciliación histórica consulta `/smtp/statistics/events` de Brevo en un
   worker separado. No participa en la creación ni en el envío del lote.

## Operación

El worker histórico está desactivado por defecto. Para habilitarlo:

```env
BREVO_SYNC_ENABLED=true
BREVO_SYNC_INTERVAL_SECONDS=900
BREVO_SYNC_DAYS=90
```

Instalación del servicio:

```bash
sudo chmod 755 backend/scripts/run_brevo_sync_worker.sh
sudo cp infra/systemd/talia-brevo-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now talia-brevo-sync.service
```

La ventana máxima es de 90 días por las limitaciones de la API de Brevo. La
persistencia local es acumulativa: una nueva conciliación hace upsert lógico
por tenant, proveedor, mensaje, evento y fecha, y no elimina historial.

## Seguridad y aislamiento

- Las API keys se leen desde secretos cifrados por tenant.
- La consulta histórica se ejecuta por tenant y nunca reutiliza la key de otro.
- La tabla no otorga acceso a `public` ni a `authenticated`; solo el backend
  con `service_role` puede escribirla.
- El payload variable se conserva únicamente como auditoría técnica; los
  campos usados para métricas, filtros y correlación son columnas explícitas.

## Evidencia de proveedor

Brevo documenta eventos transaccionales de entrega, apertura, clic, rebote,
spam, bloqueo y baja, además del endpoint histórico de actividad SMTP. La vista
de métricas reutiliza el contrato existente y no crea una pantalla separada por
proveedor.
