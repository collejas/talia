# Crea la carpeta donde Nginx leerá los archivos:
sudo mkdir -p /var/www/talia-landing

[text](.ruff_cache)# Copia el contenido de tu proyecto (carpeta landing/src/) hacia esa ruta.
sudo rsync -av --delete /home/devuser/talia/landing/src/ /var/www/talia-landing/

# Ajusta permisos para que Nginx (usuario www-data en Ubuntu) pueda servir los archivos:
sudo chown -R www-data:www-data /var/www/talia-landing

# Crear/Editar Nginx
sudo nano /etc/nginx/sites-available/talia
sudo micro /etc/nginx/sites-available/talia

# Habilita el sitio:
sudo ln -s /etc/nginx/sites-available/talia /etc/nginx/sites-enabled/

# (Opcional) Deshabilita el default si no lo necesitas:
sudo rm /etc/nginx/sites-enabled/default

# Verifica y recarga:
sudo nginx -t
sudo systemctl reload nginx

## verificar Que ya apunta a la nueva ip
dig +short talia.mx @8.8.8.8
dig +short talia.mx @1.1.1.1
dig talia.mx
nslookup talia.mx
curl -I http://talia.mx


dig +short tal-ia.mx @8.8.8.8
dig +short tal-ia.mx @1.1.1.1
dig tal-ia.mx
nslookup tal-ia.mx
curl -I http://tal-ia.mx

# Instalar Cerbot
  - Instala Certbot y el plugin de Nginx (sudo snap install core && sudo snap refresh core, luego sudo snap install --classic certbot y sudo ln -s /snap/bin/certbot /usr/bin/certbot).
  - Verifica que tu bloque server HTTP en /etc/nginx/sites-available/talia pase el lint (sudo nginx -t) y recarga (sudo systemctl reload nginx).
  - Ejecuta Certbot con sudo certbot --nginx -d talia.mx -d www.talia.mx; detectará el bloque existente, solicitará el correo y aceptará los ToS.
  - Acepta la redirección automática a HTTPS; Certbot añadirá un bloque listen 443 ssl con los certificados en /etc/letsencrypt/live/talia.mx/.
  - Comprueba el resultado con sudo nginx -t, sudo systemctl reload nginx, curl -I https://talia.mx y revisa el log /var/log/letsencrypt/letsencrypt.log.
  - Renueva en seco (sudo certbot renew --dry-run); el timer systemd se encargará de reacondicionar el certificado cada ~60 días.


# Sncronizar despues de cambios:
sudo rsync -av --delete ~/talia/landing/src/ /var/www/talia-landing/
sudo chown -R www-data:www-data /var/www/talia-landing

# levantar servicio:
poetry run uvicorn app.main:app --reload --port 8004


# NUEVO ARRANQUE CON SYSTEM, EDICION Y ESTATUS
sudo nano /etc/systemd/system/talia-panel.service
sudo micro /etc/systemd/system/talia-panel.service

sudo systemctl daemon-reload

sudo systemctl stop talia-panel.service
sudo systemctl stop talia-api.service

npm run build

npm run lint
npm run build --webpack
npm run build --webpack && npm start

sudo systemctl restart talia-panel.service
sudo systemctl restart talia-api.service

callSupabaseRpc

codex resume 019abccf-493a-7780-9114-64764b02f5cf

codex resume 019ab826-6d98-75e0-a14e-b37108504d61

psql "postgresql://postgres:DE_se479156376421@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require"
\pset pager off



sudo systemctl status talia-panel.service
sudo systemctl status talia-api.service

npm run dev
http://127.0.0.1:3000/dashboard
http://127.0.0.1:3000/auth/login

# Test
poetry run pytest

poetry run ruff check . (backend)


# Bse de datos

## hacer un respaldo

Usa el script `backend/scripts/backup_db.py`, que ya carga `backend/.env` o `.env` para recuperar `DATABASE_URL`. Cada corrida crea una carpeta `backups/<prefijo>_<timestamp>/` con los archivos generados.

- Respaldo completo (datos + esquema) **y** roles/permisos:
  ```bash
  cd ~/talia
  poetry run python backend/scripts/backup_db.py --output-dir backups
  ```
- Sólo dump completo y de esquema (sin roles globales):
  ```bash
  cd ~/talia
  poetry run python backend/scripts/backup_db.py --output-dir backups --no-globals
  ```
- Sólo roles/permisos globales (se creará también un `.sql` de esquema en la misma carpeta, puedes ignorarlo si no lo necesitas):
  ```bash
  cd ~/talia
  poetry run python backend/scripts/backup_db.py --mode schema --globals --output-dir backups
  ```
- Sólo dump completo:
  ```bash
  cd ~/talia
  poetry run python backend/scripts/backup_db.py --mode full --no-globals --output-dir backups
  ```

Dentro de cada carpeta verás los archivos `<prefijo>_<timestamp>_{full.dump|schema.sql|globals.sql}`.

## exportar url
export SUPABASE_DB_URL="postgresql://postgres:DE_se479156376421@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require"

## HAcer el restore de algun archivo *.dump

1. Restaura primero los roles/permisos globales para que los `GRANT` del dump principal se apliquen sin errores:
   ```bash
   psql "$SUPABASE_DB_URL" -f backups/<archivo>_globals.sql
   ```
2. Después ejecuta el `pg_restore` del dump completo (como se muestra abajo) o aplica el `.sql` de esquema según necesites.
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname "$SUPABASE_DB_URL" \
  supabase/migrations/20251023_131845_full.dump

### Supabase 
supabase start

export SUPABASE_DB_URL="postgresql://postgres:DE_se479156376421@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require"
  supabase db lint --db-url "$SUPABASE_DB_URL"

supabase db lint --db-url "postgresql://postgres:DE_se479156376421@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require"



# Exportacion de permisos servdor
export TALIA_SUPABASE_URL=https://qnimyamtczbbwmlrlejc.supabase.co
export TALIA_SUPABASE_DATABASE_URL=postgresql://postgres:DE_se479156376421@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require
export TALIA_SUPABASE_SERVICE_ROLE=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuaW15YW10Y3piYndtbHJsZWpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIyODg1NSwiZXhwIjoyMDc2ODA0ODU1fQ.MNUm-C1W7-pPTD6dR6_HlBq_J9nTLf2WNXy8-Z0t4KM
Nombre: J
EMAIL: administracion@gmail.com
contrasena: DE_se479156376421


sudo journalctl -u talia-api.service -n 50 --no-pager

TALIA_SUPABASE_URL=https://qnimyamtczbbwmlrlejc.supabase.co
TALIA_SUPABASE_DATABASE_URL=postgresql://postgres:xxxxxxxxxxx@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require
TALIA_SUPABASE_SERVICE_ROLE=eyJxxxxxxxxx
SUPABASE_ANON_KEY=eyJhbGxxxxxx
TALIA_SUPABASE_LEGACY_JWT_SECRET=z9bDxxxxx
TALIA_SUPABASE_ACCES_TOKEN=sbp_a3xxxx


# GOOGLE
sudo rsync -av --delete ~/talia/landing/src/ /var/www/talia-landing/
sudo grep "Googlebot" /var/log/nginx/access.log | tail

- Agrege: "application/manifest+json                       webmanifest;"  a nginx/mime.types     
- cree landing/src/robots.txt




# ME GUSTO ESTO:

¡Hola! Soy Tal-IA, tu especialista en agentes virtuales inteligentes con GenAI. Desarrollo soluciones que automatizan interacciones, procesan datos y aprenden de tus operaciones para potenciar tu productividad y toma de decisiones. También ofrezco servicios complementarios como: Automatización de procesos (RPA) Integración de sistemas y datos OT/IT Soluciones de análisis avanzado Trabajo contigo para entender tus flujos críticos y diseñar soluciones a medida que generen valor tangible desde el primer día. ¿Listo para llevar tu operación al siguiente nivel con agentes virtuales inteligentes? Habla conmigo, con Tal-IA. 





# ALGO QUE HAY QUE HACER 
  Pasos opcionales a considerar:


  2. Hacer una prueba end-to-end real desde https://talia.mx/inbox para confirmar que, tras el envío, la etiqueta siguiente_accion en
     Supabase se actualiza como esperamos.
  3. Si quieres personalizar más el correo (p. ej. distintos recursos según el giro), podemos extender la lógica con condiciones a
     futuro.

  Cuando quieras retomamos con eso.





# 
• Backend

  - backend/app/api/routes/panel.py:3251, backend/app/api/routes/panel.py:3286, backend/app/api/routes/panel.py:3327 expose POST/
    PATCH/DELETE /agenda/demos that call Supabase RPCs (fn_cita_upsert, fn_cita_cancel) and trigger sync_cita_after_*; removing these
    endpoints (and the _prepare_* helpers immediately above them) will cut panel-driven creación/edición/cancelación.
  - backend/app/channels/webchat/router.py:87 and backend/app/channels/webchat/service.py:1939 wire the Tal-IA function-calling
    flow (list_demo_slots, schedule_demo, reschedule_demo) to the same RPCs and calendar sync; delete these branches plus any
    _maybe_send_calendar_invitation usage to stop cita tooling from webchat.
  - backend/app/services/storage.py:1325, backend/app/services/storage.py:1355, backend/app/services/storage.py:1381, backend/app/
    services/storage.py:1719 wrap Supabase RPC/REST mutations for citas (upsert/schedule/reschedule/cancel/direct updates); retire
    these helpers and scrub their imports to prevent backend code from reintroducing the feature.
  - backend/app/services/calendar.py:509, backend/app/services/calendar.py:586, backend/app/services/calendar.py:680, backend/
    app/services/calendar.py:853 host the calendar sync + availability pipeline (sync_cita_after_*, compute_demo_availability,
    CalendarService providers); remove or stub these routines once citas are no longer managed. Also clean the re-export in backend/
    app/services/__init__.py:3.
  - backend/app/core/config.py:66 and backend/app/core/config.py:160 define env toggles for calendar providers and demo availability
    (slot/buffer/lead/max); delete these settings and dependent code once scheduling support disappears.
  - Tests and assets: backend/tests/panel/test_agenda.py:1, backend/tests/channels/test_webchat_tools.py:1, and the legacy panel JS
    in backend/app/public/panel/assets/js/agenda.js:1 all enforce or drive cita creation/edit flows—remove or rewrite them to avoid
    failing pipelines after the cleanup.

  Database & Backups

  - Schema creation lives in supabase/migrations/20251101_090000_lead_citas_demo.sql:6 and rename/expansion steps in supabase/
    migrations/20251202_090000_rename_citas.sql:6, supabase/migrations/20251108_210000_citas_invite_columns.sql:6, supabase/
    migrations/20251202_100500_citas_extra_columns.sql:6. Craft a new down-migration that drops the cita table (or strips write
    paths) while leaving the panel_agenda_* views intact if you still need read-only reporting.
  - Appointment logic is centralized in the functions defined by supabase/migrations/20251202_093000_citas_functions.sql:6,
    supabase/migrations/20251202_111500_citas_functions_fix.sql:6, supabase/migrations/20251203_112000_citas_provider_expand.sql:1,
    and supabase/migrations/20260111_240000_fn_cita_schedule_json.sql:1. Dropping these RPCs (plus fn_cita_reschedule and
    fn_agenda_slots_disponibles) is essential to fully disable creación/edición.
  - Resource tables and constraints for availability (agenda_calendarios, agenda_disponibilidad, agenda_excepciones, agenda_bloqueos)
    are set up in supabase/migrations/20260105_090000_agenda_disponibilidad.sql:9; remove them if the new planning flow will not
    consume calendar resources.
  - Extra indexes/grants live in supabase/migrations/20251202_103000_citas_rls_service_access.sql:6 and supabase/
    migrations/20251202_120500_citas_indexes.sql:6; include those objects in your teardown.
  - Seed data under supabase/seeds/agenda_calendarios_seed.sql:1 and supabase/seeds/agenda_disponibilidad_check.sql:1 should be
    purged so environments no longer provision cita infrastructure.
  - The schema snapshot backups/postgres_20251114_023519_schema.sql:340, backups/postgres_20251114_023519_schema.sql:1498, and
    neighbours document the same objects (enum cita_estado, table public.citas, RPCs, triggers, policies). Regenerate or replace
    these backups once the cleanup migration runs; note there are earlier snapshots (backups/postgres_20251109_*.sql, backups/
    postgres_20251112_*.sql) with identical structures that also need updating.

  Docs & Prompts

  - Product docs describe and instruct cita flows: docs/hoja_de_ruta_agenda_citas.md:1, docs/estado_actual_agenda.md:1, docs/
    plan_calendario_disponibilidad.md:1, docs/diseno_disponibilidad.md:1. Remove or rewrite them to reflect the deprecated backend.
  - Operational playbooks such as docs/scripts_limpieza_citas.md:1, docs/procedimiento_validacion_caldav.md:3, docs/
    plan_envio_invitaciones_demo.md:1, docs/credenciales.md:1 walk through maintenance and calendar credentials—strip cita sections
    after the code removal.
  - Prompt definitions in docs/funciones_prompt_openai.md:160 and related files reference schedule_demo/reschedule_demo; ensure
    assistant capabilities are revised once those RPCs vanish.
  - Misc references appear in docs/prompt_landing.md:1, docs/mapa_de_conversion.md:1, docs/canales/whatsapp.md:10, and landing/
    WIREFRAME.md:1; audit copy so no UI still promises booking support.

  Next Steps

  1. Draft a migration that tears down public.citas, its RPCs, triggers, policies, and availability tables while preserving or
     rewriting the panel_agenda_* views for read-only use.
  2. Remove the backend endpoints/services/tests listed above, then run the existing test suite to confirm nothing references the
     deleted cita APIs.
  3. Update documentation, prompts, and backups to match the new state; if the panel views must remain, validate they still render
     correctly after the schema changes.

---

## Estado actual (febrero 2026)

- La agenda legacy fue retirada: endpoints `/agenda/demos`, herramientas `list_demo_slots`/`schedule_demo`/`reschedule_demo`/`cancel_demo` y servicios asociados quedaron eliminados.
- Migración `20260201_000000_cleanup_citas.sql` publicada; elimina tablas `agenda_*`, columna `calendario_id` y todas las RPC heredadas, conservando únicamente las vistas `panel_agenda_*`.
- Seeds `supabase/seeds/agenda_calendarios_seed.sql` y `supabase/seeds/agenda_disponibilidad_check.sql` borradas para evitar reprovisionar información de citas.
- Documentación y prompts actualizados: mientras se diseña la nueva agenda, Tal-IA sólo envía información por correo (no agenda ni reprograma).
- Recordatorio: regenerar respaldos (`backups/postgres_*.sql`) tras aplicar la migración y documentar el nuevo flujo cuando se habilite el reemplazo.




  Siguiente paso (si quieres): manejar la actualización de métricas/contador global tras cada acción, o añadir un overlay de loading
  en el calendario mientras se aplican los cambios.








  • Pipeline Google Places

  - Las búsquedas pueden operar en modo texto o nearby; ambos normalizan los parámetros (query, radio, idioma, pageSize, tipos) antes
    de lanzar la ingesta.
  - El radio pedido se convierte en una cuadrícula (1×1, 3×3 o 5×5 según el tamaño) con pasos en metros y radios por tile. Cada
    centro se consulta con un círculo (locationBias/locationRestriction) para cubrir todo el radio sin huecos; la cobertura final es
    por radio, pero segmentada en tiles solapados para eludir los límites de la API.

  Paginación, deduplicación y enriquecimiento

  - Cada tile se recorre por páginas (hasta 20 resultados por página) siguiendo nextPageToken mientras haya datos nuevos.
  - Los resultados básicos se van deduplicando por place_id conforme llegan, de modo que un negocio repetido en distintos tiles/
    páginas solo se procesa una vez.
  - Tras sumar los basics, se filtran de nuevo usando distancia Haversine respecto al centro original para mantener únicamente los
    que caen dentro del radio exacto solicitado; si la UI pidió un límite, se recorta en este punto.
  - Luego se hace un lote de llamadas de detalles (places/{id}) para obtener teléfono, website, rating, etc., y se combinan basics +
    details en un formato homogéneo antes de insertarlos en la base.

  Conteo y almacenamiento

  - Una tarea en segundo plano ejecuta toda la ingesta, inserta los resultados mediante un RPC batch y usa el conteo devuelto (o el
    número de items normalizados) para actualizar el total de la búsqueda junto con el estado (processing, done, error).
  - En la tabla de búsquedas se conservan radio, centro, totales y metadatos; la tabla de resultados almacena cada prospecto
    normalizado para consultas posteriores.

  Presentación en el dashboard

  - La vista de resultados (/busquedas/:id) consume una vista agregada con paginación server-side y filtros por texto, actividad,
    fuente, rango de fechas y “dentro de radio”, lo que permite navegar decenas de miles de filas sin degradación.
  - El mapa se alimenta de otra vista optimizada y aplica ST_DWithin para mostrar exactamente el mismo radio/centro usado en la
    ingesta, sincronizado con la tabla. Exportaciones y acciones CRM siempre operan sobre el subconjunto filtrado vigente.





    https://talia.mx/api/whatsapp/webhook

    fallback 
    https://talia.mx/api/whatsapp/fallback

    https://talia.mx/api/whatsapp/status


TalIA es inteligencia artificial conversacional omnicanal que automatiza ventas, atención y soporte por canales como Teléfono, WhatsApp, Facebook, Instagram, webchat y más.

Hola Preguuuunntameeeee

https://talia.mx/
https://geoactiv.mx/
hola@talia.mx

# Algunas ideas para que el “Mapa de Conversión” haga honor al nombre y aporte más valor:

  - Embudo visual por región: además del total y las etapas, muestra un mini funnel o barras apiladas por estado/municipio destacando
    dónde caen más leads (ej. Captado → Demo → Ganado). Podría ser un gráfico en la columna derecha que cambie según la selección.
  - Calor por tasa de conversión: hoy coloreamos por volumen o canal; podrías ofrecer un modo adicional “Conversión” que pinte el
    mapa según % de ganados vs. captados por región, evitando que zonas muy grandes opaquen a las más eficientes.
  - Top conversion drivers: listado de regiones con mejor tasa de demo/ganado, con badges tipo “+20% vs promedio” para priorizar
    campañas.
  - Comparativa temporal: una pequeña tarjeta mostrando tendencia (últimos 7 días vs. periodo anterior) y un slider de fecha para ver
    cómo se movió la conversión en el mapa.
  - Filtros de etapa avanzada: permitir filtrar el mapa por “etapa actual” (p. ej. sólo mostrar regiones donde hay leads en
    Negociación o con Demo agendada), para que el mapa sea realmente una vista del embudo.




# embudo

› Perfecto!!!! ahoera vamos a la vista 'embudo', com opuedes ver en la vista, hay un sidebar lateral derecho que sale al darle clic a
  cualquier tarjeta, como puedes ver en ese sidebar, se muestran secciones las 'Proximas etapas', esas secciones se ven todas iguales
  visualmente, quisiera hacer algo para que se note que cad una es diferente que podriamos hacer, que propuestas tienes?


• Ideas rápidas para diferenciar visualmente cada sección de “Próximas etapas” en el drawer:

  1. Banderas de color y icono por etapa
      - Usa el metadatos.color de cada etapa para pintar una franja lateral o un badge con el nombre (“Demo”, “Cierre”).
      - Añade un icono alusivo (calendario, checklist, trofeo) al encabezado.
  2. Cards con niveles
      - Convierte cada etapa en una “card” con sombra y ligero gradiente distinto.
      - Añade una etiqueta pequeña “Paso 1 / 2 / 3” para reforzar el orden.
  3. Checklist expandible
      - Título más una barra de estado (ej. 2/4 campos completados) y cada campo como un item con línea divisoria.
      - Campos pendientes muestran un punto gris; completos, un check verde.
  4. Timeline vertical
      - Dibuja una línea vertical con puntos numerados; cada etapa cuelga de esa línea, con su panel de campos.
      - Colores del punto/label reflejan el estado (pendiente, en curso, listo).
  5. Separadores temáticos
      - Encabezado con fondo sólido (color del metadato), texto blanco y descripción corta; el contenido queda en un panel blanco para

  Puedo implementar el que prefieras; si ya tienes colores definidos en lead_etapas.metadatos.color, aprovecharía esa metadata para dar
  personalidad a cada bloque sin inventar estilos.


› me agradan los 5 puntos!!!! se pueden establecer los 5 o no?


• Podemos combinarlos; no son excluyentes. Por ejemplo:

  1. Color e icono → usar el metadatos.color en la franja/encabezado y poner un icono acorde a la etapa.
  2. Cards con sombra → cada sección se renderiza como card con gradiente suave + “Paso X”.
  3. Checklist → dentro de cada card, mostrar los campos de drawer_prep como lista, marcando completados/pending.
  4. Timeline → añadir una barra vertical (o numerador) que conecte las cards para reforzar la secuencia.
  5. Separadores → usar encabezado destacado (background sólido) y cuerpo blanco.

  Implementar los cinco a la vez implica retocar el componente del drawer (no lo vimos aún) para:

  - Leer metadatos.color e icono asociado.
  - Renderizar un contenedor tipo card (border + sombra) con badge “Paso N”.
  - Mostrar la barra vertical + bullet entre cards (CSS).
  - Dibujar para cada field un checklist item con estado (puedes marcar completados en función de si field.value existe).

  Si te parece bien, hago un primer diseño mezclando los cinco elementos y ajustamos después. Sólo confirma que quieres la versión
  “full combo” y que puedo tocar el componente del drawer (probablemente frontend/panel/src/components/embudo/...).




# FALTA:
- Clientes/portal: todo lo relacionado con /clientes, documentos del cliente, responsables, enlaces de portal y carga de
    archivos (/clientes/*, /portal/*), que aún dependen de lead_tarjetas y llamadas directas a Supabase.
  - Leads/legacy: aunque el embudo ya usa /crm, todavía hay endpoints legacy (/leads, panel_lead_*, conversión a cliente,
    eliminación de leads) que operan sobre lead_tarjetas, lead_movimientos, etc.
  - Agenda (parcial): la UI ya usa /crm/agenda/*, pero las rutas originales en panel.py siguen ahí. Hay que decidir si se
    remueven o quedan como compatibilidad.
  - Prospección DENUE/Google: las nuevas rutas viven en /crm/prospeccion/*, pero panel.py aún tiene las versiones antiguas (/
    prospeccion/...). Falta eliminarlas y asegurarse de que no haya otro código llamándolas.
  - Inbox/email/webchat auxiliares: siguen existiendo acciones como /conversaciones/*, subida de archivos, manual overrides,
    etc., que interactúan con Supabase e infra legacy.
  - RRHH/Configuración: secciones de personal, roles, departamentos, puestos (/config/*) con _sb_get/_sb_post.
  - Analytics/reportes: endpoints de mapas, conversiones, reportes CSV, etc., que consultan vistas legacy directamente.
  - Servicios compartidos: app/services/storage.py, calendar.py, quotes.py, etc., tienen muchas llamadas directas a Supabase
    (storage, documentos, leads) que deben encapsularse en repositorios CRM o servicios propios.



# FALTANTES

  - Embudo y cotizaciones aún dependen del panel legacy:
      - Los handlers Next.js siguen pegándole a /leads y /quotes sin el prefijo /crm (frontend/panel/src/app/api/embudo/leads/
        [oportunidadId]/cliente/route.ts:17-62, convertir/route.ts:17-66, quotes/route.ts:8-58, quotes/send/route.ts:8-56, quotes/
        [quoteId]/mark/route.ts:8-56).
      - La UI consume esos endpoints en frontend/panel/src/components/embudo/lead-drawer.tsx:826-937,1490-1555.
      - El backend equivalente vive sólo en panel.py (backend/app/api/routes/panel.py:2282-3107). Para cerrar ese archivo
        necesitamos exponer en crm.py lo que falta (listar/enviar/marcar cotizaciones y exponer /crm/leads/{id}/quotes*), mover
        la lógica de envíos (quotes_service) al router nuevo y actualizar el frontend para usar callCrmApi.
  - Logos y branding: frontend/panel/src/app/api/settings/logos/route.ts:1-100 y la vista (components/settings/quote-template-
    form.tsx:111-170) todavía llaman a /settings/logos, que sólo existe en panel.py:2679-2741. Falta crear los endpoints
    equivalentes en /crm/settings/logos, mover la lógica de subida a CRMRepository y apuntar el frontend a ellos.
  - Catálogo rápido (para el drawer de cotizaciones) sigue consultando /catalog/items legacy: frontend/panel/src/app/api/
    catalog/items/route.ts:1-52 y lead-drawer.tsx:887-905. Aunque ya tenemos /crm/catalog/items (ver backend/app/api/routes/
    crm.py:2159-2220), todavía no se usa. Hay que cambiar ese fetch (o eliminar el proxy y reutilizar las server actions de
    settings/catalogo) para dejar de depender del panel.
  - Inbox manual/responder/uploads continúan usando los endpoints históricos /conversaciones/* y /webchat/uploads:
      - Ver frontend/panel/src/app/api/inbox/[conversationId]/manual/route.ts:78-174, reply/route.ts:180-309, uploads/
        route.ts:7-66 y el fallback en src/lib/inbox/messages-server.ts:98-176.
      - El backend correspondiente está en panel.py:3442-3778. Para apagarlo necesitamos exponer en crm.py rutas como /
        crm/inbox/conversations/{id}/manual, /crm/inbox/conversations/{id}/reply, /crm/inbox/conversations/{id}/uploads
        (probablemente apoyadas en webchat_service y storage), y después actualizar estos handlers para usar callCrmApi (y
        eliminar el fallback a buildBackendTargets).
  - Agenda / demos desde el embudo: scheduleLeadDemo aún golpea /webchat/calendar/bookings (frontend/panel/src/lib/embudo/
    actions.ts:202-229), que vive en panel.py:2190-2338. En el CRM sólo tenemos reschedule/cancel (backend/app/api/routes/
    crm.py:2758-2818) pero no la creación, así que tenemos que exponer /crm/agenda/bookings para crear citas y luego apuntar el
    board a ese endpoint.
  - Residuos de fallback: mientras src/lib/inbox/messages-server.ts:98-176 siga recurriendo al panel si falla /crm/inbox/
    messages, no podremos borrar panel.py. Una vez que las rutas nuevas estén estables hay que retirar ese buildBackendTargets/
    fallback (y cualquier dependencia de getPanelApiBaseUrl fuera de /crm/*).





# FALTANTES:

• Paso 2 · Flujos del embudo y cotizaciones

  - backend/app/api/routes/crm.py:4021-4272 sigue trabajando con lead_tarjetas/lead_cotizaciones (endpoints /crm/leads/{id}/
    {cliente|convertir|quotes|quotes/send} y /crm/quotes/{id}/mark). Hay que reescribirlos para operar sobre oportunidades,
    cotizaciones y cotizacion_items, removiendo la dependencia de los RPC panel_lead_*.
  - backend/app/repositories/crm.py:681-874 mantiene helpers legacy (list_lead_quotes, fetch_lead_for_quote,
    create_lead_quote, mark_lead_quote, move_lead_to_stage, etc.) que llaman REST/RPC Legacy (/rest/v1/lead_cotizaciones, /
    rest/v1/lead_tarjetas, /rest/v1/rpc/panel_lead_*). Se necesita un bloque nuevo que use las tablas CRM (cotizaciones,
    cotizacion_items, oportunidades, oportunidad_etapas_historial) y elimine esas llamadas.
  - Los server actions y componentes del embudo ya operan con `oportunidadId` y consumen las rutas CRM:
      - Endpoints Next.js en frontend/panel/src/app/api/embudo/leads/[oportunidadId]/* (history, cliente, convertir, quotes,
        quotes/send) proxyan a `/crm/oportunidades/*` y `/crm/cotizaciones/*`.
      - Server actions frontend/panel/src/lib/embudo/actions.ts y helpers (helpers.ts, data.ts) leen/escriben payloads de
        oportunidades (campos `titulo`, `monto_estimado`, `estado`, metadata `stage_prep`) y sincronizan con `/crm/pipeline/*`.
      - Componentes React (frontend/panel/src/components/embudo/board-client.tsx, lead-drawer.tsx, lead-onboarding.tsx, stage-
        column.tsx, etc.) muestran y mutan `oportunidadId`, `titulo` y los DTOs nuevos al crear/mover etapas, generar
        cotizaciones o ejecutar onboarding.
  - Automatizaciones y servicios que aún empujan a lead_tarjetas:
      - backend/app/services/storage.py:887-1073 (`ensure_conversation_opportunity`, antes `ensure_lead_tarjeta`, `capture_opportunity_if_ready`, `promote_opportunity_stage`) deben
        migrar a crear/actualizar oportunidades nativas en lugar de usar lead_tarjetas + RPC panel_lead_move.
      - Canales/assistants (backend/app/channels/webchat/service.py:646-2163, backend/app/channels/whatsapp/service.py:82-249,
        backend/app/assistants/tools/lead.py:44-282) invocan esas funciones legacy; tras mover storage al nuevo modelo hay que
        ajustar los call-sites.
  - Supabase conserva las funciones panel_lead_* usadas por el backend (ver backups/postgres_20251123_232745/
    postgres_20251123_232745_schema.sql:2861-3750 y :7803-8011). Para completar el corte se debe reemplazar esos RPC por lógica
    FastAPI/Supabase REST sobre oportunidades y luego retirar las funciones.
  - Frontend de agenda, portal y visitas aún envía tarjeta_id en algunos DTOs (frontend/panel/src/lib/agenda/data.ts:23-284,
    frontend/panel/src/lib/agenda/data.ts:218). Validar y sustituir por oportunidad_id antes de retirar columnas legacy.

  Paso 3 · Clientes/portal y limpieza de referencias legacy

  - El modelo de clientes continúa anclado a lead_tarjeta_id:
      - Select central _cliente_select_clause en backend/app/api/routes/crm.py:454-464 y _CLIENTE_SELECT en backend/app/
        repositories/crm.py:74-85 exponen lead_tarjeta_id, tablero_id, etapa_id. Ajustar el esquema para que clientes
        referencie cuenta_id/oportunidad_id reales y poblar esos campos con la migración de datos.
      - Las consultas portal (get_cliente_por_oportunidad, convert_oportunidad_en_cliente, list_lead_events, etc.) en backend/app/
        repositories/crm.py:2656-2760 dependen del ID legacy; deben pasar a usar las tablas CRM.
  - Portal de clientes:
      - Endpoints /crm/portal/* en backend/app/api/routes/crm.py:4421-4635 cargan el cliente a través de cliente_portal_tokens
        → clientes (que hoy contiene lead_tarjeta_id). El flujo de emisión/validación (create_portal_token, get_portal_token,
        touch_portal_token en backend/app/repositories/crm.py:2893-2961) seguirá rompiendo si se elimina la columna legacy. Se
        debe actualizar el schema de tokens y las vistas que muestran documentos/responsables para usar los nuevos IDs.
      - Frontend del portal y de clientes (frontend/panel/src/lib/portal/data.ts:6-33, frontend/panel/src/lib/clientes/
        data.ts:74-173, frontend/panel/src/types/clientes.ts:45) todavía incluyen lead_tarjeta_id; requieren refactor para
        consumir los campos CRM.
  - Base de datos:
      - Los triggers y funciones que sincronizan lead_tarjetas con clientes siguen activos (backups/postgres_20251123_232745/
        postgres_20251123_232745_schema.sql:15676-15704, 7545-8023). Tras mover clientes/portal a CRM hay que deshabilitarlos o
        reescribirlos para las nuevas tablas.
      - Políticas RLS y vistas legacy (lead_tarjetas_member_* en backups/...schema.sql:6954-6955) permanecen habilitadas.
        Desactivarlas sólo será seguro cuando ningún flujo (portal, reportes, exports) dependa de lead_tarjetas.
  - Tipos y DTOs compartidos:
      - frontend/panel/src/lib/clientes/data.ts, frontend/panel/src/types/clientes.ts, y cualquier export a CSV/reportes
        siguen esperando lead_tarjeta_id, tablero_id, etapa_id. Actualizar los contratos para nuevos campos (cuenta_id,
        oportunidad_id, estado_onboarding homogéneo) y realizar la doble escritura temporal si se necesita compatibilidad.
  - Documentación/infra:
      - Actualizar supabase/migrations/20251122_230000_migrate_legacy_to_crm.sql para que además de copiar datos, rellene
        clientes.oportunidad_id/cuenta_id y elimine lead_tarjeta_id.
      - Una vez que portal/cliente consumes los nuevos campos, retirar las rutas estáticas legacy (backend/app/public/panel/*)
        y el montaje /panel en backend/app/main.py:53-90 para evitar accesos que continúen creando tarjetas legacy.

  Con estos pendientes cubiertos se cierra la dependencia del método anterior y se completa la migración funcional del CRM.


# Pendientes

• La migración se aplicó correctamente: el bloque DROP TABLE se ejecutó y Postgres confirmó los efectos en cascada (se eliminaron las
  vistas embudo/ventas_por_producto_mes, las FK de calendar_slot_holds/calendar_bookings hacia lead_tarjetas, y los FKs de clientes que
  apuntaban a lead_tableros/lead_etapas). Eso significa que todo el stack lead_* salió del esquema.

  Tareas de seguimiento:

  1. Revisar dependencias que quedaron sin FK
      - calendar_slot_holds y calendar_bookings ya no tienen tarjeta_id. Si esos módulos siguen vigentes deberías reemplazar esa columna
        por oportunidad_id o eliminarla según el nuevo modelo.
      - clientes ya no tiene FK a lead_tableros/lead_etapas, lo cual está bien (ahora depende de cuenta_id/oportunidad_id), pero si
        conservas columnas legacy asegúrate de documentarlo.
  2. Recrear vistas/reportes si las necesitas
      - Las vistas embudo y ventas_por_producto_mes se fueron junto con las tablas legacy. Si aún ocupas esos reportes, reescríbelos
        sobre oportunidades/cotizaciones.
  3. Respaldos y documentación
      - Dado que ya tomaste un dump antes del DROP, guarda ese respaldo como histórico.
      - Actualiza cualquier runbook o script interno para dejar claro que las tablas lead_* ya no existen.
  4. Pruebas rápidas
      - Corre tu suite (npm run lint && npm run build, poetry run pytest …) para garantizar que nada en la app intenta consultar las
        tablas borradas.