# Prospección · Estado actual

## 1) Flujo operativo real

1. Descubrir
- Vistas: `google-busqueda`, `denue-busqueda`, `buscador`.
- Persistencia: `public.busquedas` + `public.resultados`.

2. Filtrar y guardar
- El usuario filtra resultados por búsqueda y guarda seleccionados como prospectos.
- Persistencia: `public.prospeccion_prospectos`.

3. Enriquecer
- Verificación telefónica (lookup), scraper y edición manual.
- Registro de cambios: `public.prospeccion_prospectos_audit`.

4. Contactar
- Se crean lotes y envíos por canal (correo, WhatsApp, llamada).
- Persistencia: `prospeccion_contacto_batch`, `prospeccion_contacto_envio`, `prospeccion_contactos_log`.

5. Evaluar
- Monitoreo de lotes, métricas, campañas y reintentos.
- Vistas: `prospeccion/contactos` y `prospeccion/campanas`.

## 2) Módulos principales

- Descubrimiento: Google/DENUE + jobs asíncronos.
- Prospectos: tabla central para selección comercial.
- Contacto: worker multicanal con reintentos y estado.
- Campañas: agrupación/duplicación de lotes.
- Inbox comercial: operación de respuestas de prospección desde `/inbox` con filtros de origen/canal/lote/campaña.

## 3) Observaciones técnicas clave

- DENUE y Google comparten patrón: `busqueda -> resultados -> prospectos`.
- Para DENUE, el tamaño de empresa viene de `estrato`; para Google, `rating`.
- El backend ya soporta filtros complejos en DENUE (incluye `contact_match = all|any`).
- El frontend ya usa paginación alta para resultados (5000) en vistas geográficas.
- En `prospeccion/prospectos`, la tabla ya permite orden por columna, reordenar columnas y ocultar/mostrar columnas.
- En `google-busqueda` y `denue-busqueda`, ya existe eliminación individual y masiva de búsquedas recientes.

## 4) Referencia de datos actual (MCP, instancia vigente)

- `busquedas`: Google 158, DENUE 9.
- `resultados`: Google 61,533, DENUE 4,195.
- `prospeccion_prospectos`: Google 72, DENUE 13.

## 5) Fuente de verdad para siguiente trabajo

Para cambios nuevos:
1. Revisar `frontend_vistas.md`.
2. Revisar contrato en `backend_endpoints.md`.
3. Validar impacto de datos en `base_datos.md`.

## 6) Avance WhatsApp en frío (2026-02-24)

- Endpoint de verificación operativa disponible: `GET /crm/prospeccion/whatsapp/readiness`.
- Envío WhatsApp de prospección exige plantilla y usa fallback por tenant (`whatsapp.templates.sales`).
- Proxy frontend de `POST /api/prospeccion/prospectos/contactar` ya propaga `X-Organizacion-Id`.
- Resultado: desde modal de `prospeccion/prospectos`, `Guardar acciones` para canal WhatsApp ya no falla por header faltante.

## 7) Avance WhatsApp en frío (2026-02-25)

- Se estabilizó la relación conversación ↔ oportunidad para evitar oportunidades duplicadas en respuestas de prospección.
- Se fortaleció el flujo de agenda para que el assistant use tools (`list_demo_slots`/`schedule_demo`) al confirmar horario.
- Se completó el post-agenda de prospección:
  - persistencia de contexto mínimo en contacto,
  - guardado de insights de conversación,
  - ajuste automático de título/descripción cuando la oportunidad queda con nombre genérico.
- La notificación al asesor en `booking_confirmed` ahora contempla el caso prospección sin requerir perfilamiento completo.

## 8) Avance Correo de prospección (2026-02-25)

- Envío operativo por Brevo validado con `subject/body/body_html`.
- Plantillas/modales de correo con variable `{{logo_url}}` (incluye normalización desde `{{DATA:IMAGE:...}}`).
- Logo de correo con estilo por defecto de `5/6` del cuerpo (`width:83.333%`, alto proporcional).
- Imágenes en HTML de correo envueltas con link a `https://talia.mx/` con UTM + `kw` para atribución.
- Carga de logos desde `settings/formato-cotizacion` corregida (insert con `organizacion_id` y compatibilidad RLS).
