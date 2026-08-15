# Changelog — Plan de cobro de mensajes

Este archivo registra el avance del diseño e implementación del sistema de cobro por tenant.

## Estados utilizados

- **Propuesto:** pendiente de aprobación.
- **Aprobado:** decisión aceptada para el diseño.
- **En desarrollo:** implementación iniciada.
- **Validación:** requiere pruebas técnicas o funcionales.
- **Completado:** implementado y verificado.
- **Bloqueado:** no puede avanzar hasta resolver una dependencia.

## 2026-08-15

### Conciliación y separación de callbacks Meta — Completado

- Se confirmó en producción que los `103` callbacks Meta huérfanos no tenían mensaje local recuperable por organización + WAMID.
- Se aplicó `supabase/migrations/20260815_230000_delivery_event_reconciliation_status.sql`.
- Los `103` callbacks quedaron marcados como `no_conciliado`, con motivo explícito `mensaje_local_no_encontrado`.
- No se generaron cargos para callbacks sin `mensaje_id`, conversación ni contenido local.
- Los `3,815` callbacks que sí tienen mensaje local quedaron como `vinculado`.
- El backend desplegado vincula automáticamente callbacks tempranos cuando posteriormente aparece el mensaje local.
- Se verificó que no quedaron huérfanos antiguos pendientes y que existen `0` filas de cobro asociadas a los callbacks no conciliados.

### Auditoría de mensajes sin ledger — Aclarado

- Los `160` mensajes históricos que inicialmente aparecían como “sin cobro” son correos entrantes, no mensajes WhatsApp.
- Se identificaron por `datos.channel = correo` y por identificadores SMTP/Message-ID, no por WAMID ni SID de WhatsApp.
- Se verificó que `0` mensajes de correo están en `cobro_mensajes`.
- El ledger mantiene únicamente `canal = whatsapp`; no existe mezcla entre correo y cobro de WhatsApp.
- Los reportes de faltantes deben filtrar por canal WhatsApp y no interpretar cualquier valor de `mensajes.proveedor_mensaje_id` como un identificador Meta.

### Barrido automático de callbacks no conciliados — Listo para deploy

- Se agregó `supabase/migrations/20260815_231000_reconcile_stale_meta_delivery_events.sql`.
- La función `reconcile_stale_meta_delivery_events` procesa por lotes callbacks Meta `pendiente` con más de 15 minutos, sin mensaje local y sin coincidencia por organización + WAMID.
- El proceso es idempotente, usa `SKIP LOCKED`, no crea cargos y solo actualiza el estado de conciliación.
- Se agregó el worker periódico `meta_delivery_reconciliation_runner`, con intervalo, antigüedad mínima y tamaño de lote configurables.
- La migración SQL fue aplicada en producción y devolvió `0` filas en la primera ejecución porque no quedan huérfanos antiguos pendientes.
- Falta desplegar el backend para activar el worker en el servicio.

### Reporte de conciliación en Cobro de mensajes — Listo para deploy

- Se agregaron `/billing/reconciliation` y `/billing/master/reconciliation`.
- Los tenants normales consultan únicamente sus callbacks; el owner puede filtrar por tenant.
- El reporte aplica el rango de fechas seleccionado y devuelve solo conteos de `pendiente`, `vinculado` y `no_conciliado`.
- Se agregó la tarjeta **Conciliación de callbacks Meta** al panel `/settings/cobro-mensajes`.
- No se exponen payloads crudos, contenido de mensajes ni credenciales del proveedor.
- Pruebas de billing: `3 passed`; React Doctor: `100/100`.
- Falta desplegar backend y panel para activar esta visualización.

### Detalle de callbacks no conciliados — Listo para deploy

- Se agregaron `/billing/reconciliation/events` y `/billing/master/reconciliation/events`.
- El owner puede filtrar el detalle por tenant y ambos alcances respetan el rango de fechas.
- El panel muestra fecha, evento, WAMID, tenant y motivo de los últimos casos `no_conciliado`.
- No se exponen `payload_crudo`, texto del mensaje ni datos sensibles del proveedor.
- Validación: rutas de billing `3 passed`; React Doctor `100/100`.
- Falta desplegar backend y panel para activar esta vista.

## 2026-08-14

### Reparación de KPI Hilos activos — Completado

- Se detectó que la migración de snapshot de categoría Meta reemplazó el RPC de cobro y dejó de mantener `cobro_hilos_resumen`.
- Se aplicó `supabase/migrations/20260814_160000_message_billing_thread_summary_repair.sql`.
- Se reconstruyeron 376 resúmenes de hilo existentes y se agregó un trigger idempotente para cargos nuevos.
- El tenant `3dbb2a99-9d81-4233-8444-0990d53b93b3` quedó con 29 hilos activos en su periodo de agosto.
- Se verificó que RLS permite al usuario del tenant consultar sus 29 hilos.

### Filtro global por tenant en Cobro de mensajes — En desarrollo

- La vista del tenant maestro incorpora un selector de tenant con la opción `Todos los tenants`.
- El resumen KPI puede filtrarse por `organizacion_id` sin modificar los históricos.
- El detalle de mensajes conserva filtros por categoría Meta y dirección, combinables con el tenant seleccionado.
- Se agregó `GET /billing/master/tenants`, protegido por `es_owner` y contexto del tenant maestro, para cargar únicamente opciones activas.
- Se documentaron las rutas de consulta:
  - `GET /api/billing/master/summary?organizacion_id={uuid}`
  - `GET /api/billing/master/messages?organizacion_id={uuid}`
- Los tenants normales siguen usando exclusivamente sus endpoints tenant-scoped y no reciben el selector global.

### Corrección de atribución por tenant en prospección WhatsApp — Completado

- Los mensajes salientes de prospección ahora priorizan siempre el `organizacion_id` del envío/lote.
- Una persona genérica encontrada en el tenant maestro ya no puede arrastrar el mensaje, conversación o cobro al tenant maestro.
- Se habilitó propagación controlada `ON UPDATE CASCADE` en las FK compuestas de conversación, mensaje, eventos y ledger necesarias para corregir atribuciones sin romper integridad.
- Se corrigió el lote `090926e8-e725-4da5-8148-ec405cb1950d` del tenant `3dbb2a99-9d81-4233-8444-0990d53b93b3`.
- Se verificó: 1 envío, 1 mensaje, 1 cobro y 3 eventos bajo el tenant correcto.

### Corrección de callbacks de pricing de Meta — Completado

- Se agregó `phone_number_id` al schema `MetaWhatsAppStatusCallback`.
- El webhook de estados ya puede resolver correctamente el tenant Meta antes de persistir `eventos_entrega`.
- Se agregó una aserción de regresión para conservar el `phone_number_id` recibido en `metadata`.
- Se reinició el servicio activo y se verificó `GET /api/health` en el puerto `8004`.
- Las pruebas específicas de webhook, schema y servicio pasaron: `9 passed`.

Nota: los callbacks del lote `39a81418-ee27-4e4d-9a30-20b9b2dfa163` llegaron antes de esta corrección y no quedaron persistidos; sus precios reales no pueden recuperarse desde la base actual. Los siguientes envíos deberán probarse nuevamente.

## 2026-08-13

### Documentación inicial — Completado

- Se documentó la auditoría de contabilización actual de mensajes y eventos Meta.
- Se identificó el flujo `identidades_canal → conversaciones → mensajes → eventos_entrega`.
- Se registraron riesgos de duplicidad, mensajes sin proveedor, atribución por tenant y falta de categorías tarifarias normalizadas.
- Se confirmó posteriormente que la migración de concurrencia de WhatsApp está aplicada en la base activa.

Documento:

- `Auditoria_contabilizacion_mensajes_Meta.md`

### Regla comercial de cobro — Aprobado

- Cobro de **$0.09 MXN por cada mensaje entrante o saliente**.
- El cobro no depende de quién inició el hilo.
- El cobro no depende de la categoría Meta del mensaje.
- El hilo únicamente agrupa mensajes y no genera un cargo adicional.
- Los eventos `enviado`, `entregado` y `leído` no generan cargos independientes.
- Un mensaje aceptado por el proveedor se cobra una sola vez.

### Costo publicado de Meta — Aprobado

- Tarifa inicial documentada para México: **$0.5614 MXN**.
- Aplica como costo de Meta para mensajes salientes iniciados por la empresa, según la tarifa vigente configurada.
- El costo lo paga directamente el tenant a Meta.
- GEOACTIV no suma este costo al cargo propio durante la primera etapa.
- La tarifa Meta se versionará por vigencia y se actualizará cuando Meta publique un cambio.
- No se importarán facturas ni se manejará una conciliación financiera contra Meta.
- Sí se mantendrá conciliación técnica interna de duplicados, estados y mensajes sin proveedor.

### Tarifas GEOACTIV globales y particulares — Aprobado

- El dueño de la aplicación podrá establecer una tarifa global para todos los tenants.
- El dueño de la aplicación podrá establecer una tarifa particular para un tenant.
- La tarifa particular tendrá prioridad sobre la global.
- Si no existe tarifa particular activa, aplicará la tarifa global.
- Los tenants normales podrán consultar su tarifa efectiva, pero no modificarla.
- Las tarifas cerradas no se editarán; se creará una nueva versión con nueva vigencia.

### Arquitectura de datos — Aprobado

- La información estructural del cobro se modelará mediante columnas explícitas.
- No se utilizarán `metadata`, `payload`, `json`, `jsonb` ni estructuras equivalentes para la lógica principal del cobro.
- Se propusieron tablas para tarifas Meta, tarifas GEOACTIV, periodos, consumos, resúmenes de hilos, ajustes y alertas.
- Cada tabla tendrá `organizacion_id` y relaciones protegidas por tenant.
- Los consumos guardarán una fotografía de la tarifa aplicada para preservar históricos.

### Visualización y seguridad por tenant — Aprobado

- El tenant maestro tendrá un visualizador global.
- Cada tenant normal verá únicamente sus propios datos.
- El tenant maestro podrá configurar tarifas globales y particulares.
- RLS y backend deberán validar el tenant; el frontend no será la única protección.

Documentos:

- `Plan_base_cobro_mensajes_por_tenant.md`

### Estado de implementación

**Diseño y documentación:** completado.  
**Migraciones de cobro:** completado.
**Backend de cobro:** primera versión completada y validada en producción.
**Frontend de configuración y reportes:** primera versión completada y validada en producción.
**Activación de cobro:** pendiente.

### Base de datos — En desarrollo / estructura aplicada

- Se creó y aplicó `supabase/migrations/20260813_140000_message_billing_foundation.sql`.
- Se creó y aplicó `supabase/migrations/20260813_141000_message_billing_period_overlap_guard.sql`.
- Se crearon tablas para tarifas GEOACTIV globales/particulares, tarifas publicadas de proveedor, configuración de límites, periodos, ledger de mensajes, resúmenes de hilos, ajustes y alertas.
- Se agregó idempotencia por tenant, proveedor e ID del mensaje.
- Se agregaron claves foráneas compuestas para proteger relaciones entre tenant, mensaje, conversación, oportunidad y periodo.
- Se activó y forzó RLS en las nuevas tablas.
- El owner puede administrar tarifas y configuración; cada tenant puede consultar únicamente sus filas.
- Se cargó la tarifa global inicial de GEOACTIV de `$0.0900 MXN`.
- Se cargó la tarifa inicial de Meta de `$0.5614 MXN` para México, WhatsApp, categoría fallback y mensajes iniciados por empresa.
- No se generaron cargos ni se hizo backfill de mensajes históricos.
- Se añadió una restricción de exclusión para impedir periodos solapados del mismo tenant.

### Backend de contabilización — En desarrollo

- Se creó y aplicó `supabase/migrations/20260813_142000_message_billing_register_rpc.sql`.
- `cobro_mensajes.canal` quedó como columna explícita para resolver tarifas por canal.
- `registrar_cobro_mensaje` valida tenant, mensaje y conversación; resuelve tarifa particular/global; crea el periodo mensual; inserta el ledger de forma idempotente; actualiza el resumen del hilo y los totales del periodo.
- El cargo GEOACTIV se fija en `$0.09 MXN` por cada mensaje aceptado con identificador del proveedor, tanto entrante como saliente.
- El costo Meta se calcula únicamente para mensajes salientes del hilo iniciado por la empresa y queda separado del cargo GEOACTIV.
- `actualizar_cobro_meta_mensaje` captura posteriormente categoría, pricing y billable desde el status de Meta y ajusta el costo histórico del ledger y del periodo.
- El flujo WhatsApp llama al ledger después de persistir el mensaje. Un error de billing no interrumpe el registro ni la entrega del mensaje.
- Se agregaron pruebas unitarias para tarifas/campos explícitos, detección de Meta, extracción de pricing y ausencia de identificador del proveedor.

Pendiente de esta fase:

- Validar RLS con usuarios reales de owner y tenant normal.
- Probar una conversación real entrante y una conversación iniciada por la empresa con callbacks de Meta.
- Añadir el endpoint de consulta y el panel de reportes.

### API de consulta — Completado para primera versión

- Se agregó el router `/api/billing` al backend.
- El tenant autenticado puede consultar `/summary`, `/messages` y `/tariff/effective` únicamente para su organización real.
- El owner puede consultar `/master/summary` y `/master/messages` para visualizar todos los tenants y filtrar por organización.
- Los mensajes se entregan paginados y filtrables por periodo, dirección y categoría Meta.
- Las respuestas exponen columnas explícitas del ledger y no exponen payloads crudos de proveedores.
- Se agregaron pruebas de aislamiento de alcance y separación entre cargo GEOACTIV y costo Meta.

Pendiente de API:

- Agregar endpoints de configuración de límites, alertas y ajustes.
- Crear el panel visual de tenant y tenant maestro.

### Configuración de tarifa GEOACTIV — Completado para primera versión

- Se agregó `POST /api/billing/master/tariff/app`, exclusivo para el owner.
- Permite establecer tarifa global o override particular por tenant.
- El cambio se ejecuta mediante `crear_cobro_tarifa_app` dentro de una transacción.
- La versión anterior se cierra y los consumos históricos mantienen la fotografía de tarifa aplicada.
- No se permite configurar tarifas futuras en esta primera versión para evitar periodos sin tarifa activa.
- Se agregó `POST /api/billing/master/tariff/provider` para versionar la tarifa informativa de Meta por canal, país, categoría e iniciador del hilo.
- La tarifa de Meta permanece separada del cargo GEOACTIV y solo alimenta estadísticas de costo.

### Panel frontend — Primera versión completada

- Se creó `/settings/cobro-mensajes` con una vista reutilizable para tenant y tenant maestro.
- El tenant consulta sus KPIs, tarifa efectiva y detalle propio.
- El tenant maestro consulta el consolidado global, detalle de todos los tenants y configuración de tarifas.
- Se agregaron filtros por categoría Meta y dirección, paginación y estados de carga, error y vacío.
- Se agregaron proxies Next.js para mantener cookies/tokens del panel fuera del navegador.
- Se añadió la entrada **Cobro de mensajes** al menú de Settings.
- TypeScript, ESLint y React Doctor quedaron aprobados.

### Backfill histórico — Completado

- Se creó y aplicó `supabase/migrations/20260813_145000_message_billing_historical_backfill.sql`.
- Respaldo previo verificado: `backups/message_billing_before_backfill_20260813_224935/message_billing_before_backfill_20260813_224935_full.dump`.
- Se encontraron `2,603` mensajes históricos.
- Se insertaron `2,018` mensajes elegibles en `cobro_mensajes`, pertenecientes a `2` tenants.
- Se excluyeron `585` mensajes sin identificador del proveedor; no se pueden deduplicar con seguridad.
- Se reconstruyeron `277` resúmenes de hilo para `274` conversaciones.
- Se reconstruyeron `9` periodos mensuales.
- El cargo GEOACTIV histórico reconstruido es `$181.6200 MXN`.
- No se recuperaron cargos Meta históricos: los eventos disponibles conservaron categorías `service` y `referral_conversion` con `billable=false`; no hay registros históricos `marketing`.
- Se recuperaron `1,244` eventos históricos con información de pricing Meta; lo demás quedó como `unknown`.
- No quedaron candidatos elegibles sin ledger y no existen duplicados por mensaje ni por proveedor.
- No se modificaron filas originales de `mensajes` ni `eventos_entrega`.

### Alineación de plantillas WhatsApp y billing — 2026-08-13

- Se revisó `prospeccion/campanas` y el modal de plantillas WhatsApp.
- Confirmado: el modal registra en Tal-IA una referencia de una plantilla ya creada/aprobada en WhatsApp Manager; no crea la plantilla en Meta.
- La categoría seleccionada (`marketing`, `utility` o `authentication`) sí llegaba al lote, pero se perdía al registrar el mensaje de Inbox cuando Meta todavía no había enviado `pricing.category`.
- Se agregó `cobro_mensajes.categoria_meta_configurada`, separada de `categoria_meta`, que sigue siendo exclusivamente la categoría confirmada por Meta.
- Se corrigió el selector del wizard para resolver la plantilla por `slug` y `canal`, y se muestra la categoría Meta en la vista de campañas y en el selector de envíos.
- La categoría configurada no calcula ni inventa el costo Meta; el costo solo se actualiza con el pricing recibido de Meta.
- Migración aplicada: `supabase/migrations/20260813_146000_message_billing_template_category_snapshot.sql`.

### Corrección de contabilización y aislamiento — 2026-08-13

- Se identificó en logs que `registrar_cobro_mensaje` fallaba por una referencia ambigua a `organizacion_id`; se restauró la directiva de resolución de variables en la función SQL.
- Se repararon los mensajes recientes que habían quedado sin ledger mediante `supabase/migrations/20260813_147000_message_billing_repair_after_rpc_fix.sql`.
- La ausencia de costo Meta en los mensajes recientes quedó explicada: Meta los reportó como `service`, `free_customer_service` y `billable=false`; por eso el costo real Meta es `$0.0000` aunque el cargo GEOACTIV sí se registró.
- Se corrigió el alcance de `/settings/cobro-mensajes`: solo el contexto activo del tenant maestro usa el consolidado global; los demás contextos consultan exclusivamente sus propios datos.
- Se agregó la protección equivalente en backend: los endpoints `/billing/master/*` requieren propietario y contexto activo del tenant maestro.
- Se corrigió el identificador provisional de la validación RPC mediante `supabase/migrations/20260813_148000_repair_message_billing_provider_id.sql`.

### Alineación de envíos de prospección WhatsApp — 2026-08-14

- Se confirmó que `prospeccion/contactos` muestra el estado operativo de `prospeccion_contacto_envio`; `leido` no implicaba que existiera un registro en `mensajes` ni en el ledger.
- El worker de prospección actualizaba el envío y recibía el SID del proveedor, pero no ejecutaba el registro de mensaje WhatsApp ni el cobro asociado.
- Se conectó el flujo exitoso del worker con el registro existente de WhatsApp, conservando el estado `enviado/entregado/leido` y usando el SID como clave idempotente.
- La categoría configurada y la plantilla se conservan al registrar el mensaje para que el cargo GEOACTIV y la tarifa Meta se relacionen con el tenant correcto.
- Se corrigió la inferencia del iniciador: una plantilla saliente `marketing` conserva el carácter iniciado por empresa aunque reutilice una conversación previamente iniciada por el cliente.
- La misma regla se aplica al callback posterior de pricing Meta, evitando que una conciliación vuelva a dejar el costo en cero.
- Caso validado y reparado: `SEGI CASAS` del lote `9718faae-dc00-4006-9e90-8662352943cc` quedó relacionado con su mensaje, conversación y ledger; categoría `marketing`, cargo GEOACTIV `$0.0900`, costo Meta `$0.5614`, total `$0.6514`.

### Campañas WhatsApp exclusivamente por Meta — 2026-08-14

- La ruta de envíos de `prospeccion/contactos` dejó de invocar el selector histórico que podía elegir Twilio según configuración del runtime.
- Los envíos de campaña llaman directamente a Meta Cloud API y conservan el WAMID retornado por Meta para relacionar mensaje, estados y pricing.
- Se eliminó el fallback de texto libre: si falta la plantilla Meta aprobada o Meta rechaza el envío, queda error controlado para reintento sin duplicar el envío ni cambiar su naturaleza.
- Los flujos generales del inbox no se modificaron en esta fase; el cambio está limitado al worker de campañas de prospección.

### Reconciliación de callbacks Meta tempranos — 2026-08-14

- Se aplicó `20260814_151000_delivery_event_webhook_race.sql` en Supabase.
- `eventos_entrega` conserva ahora el `proveedor_mensaje_id` aunque el mensaje local todavía no exista.
- El webhook Meta recibe el `organizacion_id` de su ruta y puede guardar el evento de forma aislada por tenant.
- Al persistirse después el WAMID, el backend vincula los eventos pendientes y aplica `pricing.billable`, `pricing.category` y `pricing.pricing_model` al ledger.
- Esta corrección evita perder estados y pricing cuando Meta responde antes que la persistencia local.

### Tenant Meta e Inbox de prospección — 2026-08-14

- Los callbacks de estado Meta ahora resuelven el tenant por `phone_number_id` del payload; el `organizacion_id` de la URL queda como fallback.
- Se eliminó la promoción automática de prospectos y la vinculación de oportunidades durante el envío o los estados de una campaña saliente.
- Las conversaciones WhatsApp que solo contienen mensajes salientes ya no se proyectan en Inbox; la proyección se activa al llegar un mensaje entrante.
- La promoción comercial y la oportunidad quedan reservadas para el flujo de respuesta real del prospecto.
- Se ajustó la RPC histórica de registro para aceptar el envío saliente sin conversación comercial previa; esto permite conservar cobro y auditoría sin forzar una oportunidad.

## Próximas fases

### Fase 1 — Diseño técnico detallado

- Aprobar nombres finales de tablas y columnas.
- Confirmar constraints y claves foráneas compuestas.
- Confirmar la precedencia de tarifas globales y particulares.
- Confirmar la fecha de inicio del primer periodo de cobro.

### Fase 2 — Base de datos

- Crear migración de catálogos y tarifas.
- Crear migración del ledger de mensajes.
- Crear periodos, ajustes, alertas y resúmenes de hilos.
- Implementar índices, constraints y RLS.
- Validar aislamiento entre tenants.

### Fase 3 — Backend

- Validar en entorno real el servicio transaccional e idempotente ya creado.
- Completar la cobertura de Messenger, Webchat y otros canales cuando se active su cobro.
- Crear endpoints administrativos y de tenant.

### Fase 4 — Frontend

- Crear configuración global de tarifa GEOACTIV.
- Crear override particular por tenant.
- Crear visualizador global del tenant maestro.
- Crear visualizador individual de consumo.
- Crear reportes de costos y conversiones.

### Fase 5 — Validación

- Probar duplicados y reintentos.
- Probar mensajes entrantes y salientes.
- Probar tarifas globales y particulares.
- Probar cambio de vigencia sin alterar históricos.
- Probar RLS entre tenants.
- Probar límites y alertas.

### Fase 6 — Activación

- Ejecutar un periodo de prueba sin cobro real.
- Revisar discrepancias técnicas.
- Aprobar el primer periodo.
- Activar tenants seleccionados.
- Comenzar cobro con fecha de corte documentada.
