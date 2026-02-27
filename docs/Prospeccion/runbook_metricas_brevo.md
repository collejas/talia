# Runbook · Metrica de correo (Brevo)

Objetivo: diagnosticar rapido por que en la app no suben metricas de correo (`entregados`, `aperturas`, `clics`, `respondidos`, `sesiones UTM`).

## 1) Checklist rapido (2-3 minutos)

1. En Brevo, webhook `Transactional` activo con URL:
   - `https://talia.mx/api/prospeccion/contacto/brevo/webhook`
2. Eventos habilitados:
   - `delivered`, `opened`, `unique_opened`, `click`, `unique_click`, `hard_bounce`, `soft_bounce`, `blocked`, `spam`, `invalid`, `error`, `unsubscribe`.
3. Enviar 1 correo de prueba desde la app.
4. Abrir correo y hacer 1 clic en enlace/imagen.
5. Refrescar `Prospeccion > Campanas` y `Prospeccion > Contactos`.

## 2) Que mide cada indicador

- `Totales`: registros de `prospeccion_contacto_envio` del lote/campana.
- `Entregados`: estado `entregado` en `prospeccion_contacto_envio` (actualizado por webhook).
- `Aperturas` (dashboard): conteo deduplicado por `envio_id` (1 por envío), priorizando `unique_opened`; si no existe, fallback a `opened`.
- `Clics` (dashboard): conteo deduplicado por `envio_id` (1 por envío), priorizando `unique_click`; si no existe, fallback a `click`.
- `Respondidos` (correo): requiere flujo de respuesta entrante (inbound email/reply) que registre `reply_inbound/respondido` en logs.
- `Sesiones UTM`: sesiones en `webchat_visitantes` con `utm_source=prospeccion`, `utm_medium=email` y senales `cid/tid/kw`.

## 3) SQL de verificacion (Supabase)

### 3.1 Resumen por campana/plantilla (vista final)

```sql
select
  c.nombre as campana,
  t.nombre as plantilla,
  count(*) as totales,
  count(*) filter (where e.estado = 'enviado') as enviados,
  count(*) filter (where e.estado = 'entregado') as entregados
from public.prospeccion_contacto_envio e
join public.prospeccion_contacto_batch b on b.id = e.batch_id and b.organizacion_id = e.organizacion_id
left join public.campanas c on c.id = b.campana_id
left join public.prospeccion_contacto_templates t
  on t.id = (b.metadata->'canales_config'->'correo'->>'template_id')::uuid
where e.organizacion_id = '00000000-0000-0000-0000-000000000001'
  and e.canal = 'correo'
  and e.creado_en >= now() - interval '1 day'
group by c.nombre, t.nombre
order by totales desc;
```

### 3.2 Eventos Brevo persistidos (aperturas/clics)

```sql
select
  lower(coalesce(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) as evento,
  count(*) as total
from public.prospeccion_contactos_log l
where l.organizacion_id = '00000000-0000-0000-0000-000000000001'
  and l.canal = 'correo'
  and l.creado_en >= now() - interval '1 day'
group by 1
order by 2 desc, 1 asc;
```

### 3.3 Funcion de atribucion consumida por UI

```sql
select *
from public.prospeccion_campana_template_atribucion(null, 250)
order by envios_totales desc;
```

## 4) Diagnostico por sintoma

### Sintoma A: `Totales` sube, todo lo demas en 0

Causa probable:
- no llega webhook al endpoint publico.

Acciones:
1. Validar URL exacta en Brevo.
2. Revisar intentos/fallos del webhook en consola de Brevo.
3. Verificar logs de request en API (`/api/crm/prospeccion/contacto/brevo/webhook`).

### Sintoma B: `Entregados` sube, `Aperturas/Clics` en 0

Causas probables:
- no se habilitaron eventos `opened/click` en Brevo, o
- eventos llegan pero no se persisten en `prospeccion_contactos_log`.

Acciones:
1. Confirmar eventos habilitados en Brevo.
2. Consultar SQL 3.2 para verificar persistencia real.
3. Revisar errores backend del logger `brevo.webhook`.

Nota tecnica (corregido):
- Se detecto y corrigio un fallo de persistencia por `organizacion_id` faltante al insertar logs de webhook en `backend/app/services/brevo.py`.

### Sintoma C: `Respondidos` correo en 0

Comportamiento esperado actual:
- para correo, sin inbound reply implementado/activo, `respondidos` permanece en 0.

### Sintoma D: `Sesiones UTM` en 0 con clics > 0

Causas probables:
- la landing del clic no genera sesion en `webchat_visitantes`, o
- faltan/rompen UTM (`utm_source=prospeccion`, `utm_medium=email`) o IDs (`cid/tid/kw`).

Acciones:
1. Verificar URL final del enlace en correo (incluye UTM y `cid/tid`).
2. Confirmar que la pagina de destino ejecuta alta de visita webchat (`/api/webchat/visit`).

## 5) Comandos operativos utiles

```bash
sudo systemctl restart talia-api.service
systemctl status talia-api.service --no-pager
```

## 6) Criterio de cierre

Se considera resuelto cuando:
1. En un correo de prueba nuevo, la app muestra al menos `Entregados >= 1`.
2. Tras abrir y hacer clic, la app refleja `Aperturas >= 1` y `Clics >= 1`.
3. SQL 3.2 confirma eventos `opened/click` persistidos en `prospeccion_contactos_log`.
