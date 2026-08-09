# Crea la carpeta donde Nginx leerá los archivos:
sudo mkdir -p /var/www/talia

[text](.ruff_cache)# Copia el contenido de tu proyecto (carpeta landing/src/) hacia esa ruta.
sudo rsync -av --delete ~/talia/landing/src/ /var/www/talia/

sudo rsync -av --delete ~/talia/landing/src/ /var/www/talia/
sudo chown -R www-data:www-data /var/www/talia

# Ajusta permisos para que Nginx (usuario www-data en Ubuntu) pueda servir los archivos:
sudo chown -R www-data:www-data /var/www/talia

# Instalar Nginx
sudo apt update
sudo apt install nginx -y

# Crear/Editar Nginx
sudo nano /etc/nginx/sites-available/talia.conf
sudo micro /etc/nginx/sites-available/talia.conf

sudo nano /etc/systemd/resolved.conf

# Habilita el sitio:
sudo ln -s /etc/nginx/sites-available/talia.conf /etc/nginx/sites-enabled/

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


# Instalar Cerbot

## Abrir puerto 443 en el firewall
sudo ufw allow 443/tcp
sudo ufw status

## Instalar Certbot (método recomendado en Ubuntu actual)
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

## Sacar certificados y que Certbot te configure Nginx
sudo certbot --nginx \
  -d talia.mx \
  -d www.talia.mx

# Instala las dependencias del sistema para WeasyPrint (Ubuntu/Debian):
sudo apt-get update
sudo apt-get install -y libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0 libcairo2 libffi-dev libgdk-pixbuf-2.0-0
libglib2.0-0

# levantar servicio:
poetry run uvicorn app.main:app --reload --port 8004
poetry run uvicorn app.main:app --host 0.0.0.0 --port 8004 --env-file .env

FUa7NWxedjsEGv5

# crear system para talia-panel.service
sudo nano /etc/systemd/system/talia-panel.service
sudo micro /etc/systemd/system/talia-panel.service

# crear system para talia-api.service
sudo nano /etc/systemd/system/talia-api.service
sudo micro /etc/systemd/system/talia-api.service

poetry run uvicorn app.main:app --host 0.0.0.0 --port 8004 --env-file .env

sudo systemctl stop talia-api.service
sudo systemctl stop talia-panel.service

sudo systemctl daemon-reload

npx tsc --noEmit
npm run lint
npm run build

sudo systemctl restart talia-api.service
sudo systemctl restart talia-panel.service


# Permisos Git
sudo chown -R jorge:jorge /var/www/talia/.git

# Reinicios: 
  - Solo cambios de panel:

  bash scripts/deploy_panel_atomic.sh

  - Cambios de panel + backend:

  RESTART_API=1 bash scripts/deploy_panel_atomic.sh

qOmfDOWUq7L9l5Nlsgdgd#$VD^^#&*XFHh_g


# REinicio de Landing:
cd /var/www/talia/landing/src && node scripts/generate-sitemap.mjs && sudo rsync -a /var/www/talia/landing/src/ /var/www/talia-landing/

# LIMPIEZA
  cd /var/www/talia

  # Ver releases activos (NO borrar estos)
  CUR_STG="$(readlink -f current/panel-staging)"
  CUR_PROD="$(readlink -f current/panel)"
  echo "CUR_STG=$CUR_STG"
  echo "CUR_PROD=$CUR_PROD"

  # Borrar temporales staging
  sudo rm -rf releases/panel-staging/*.tmp 2>/dev/null || true

  # Dejar solo 2 releases de staging (incluyendo el activo)
  for d in $(ls -1dt releases/panel-staging/* 2>/dev/null); do
    [ "$d" = "$CUR_STG" ] && continue
    KEEP="${KEEP:-$d}"
  done
  for d in $(ls -1dt releases/panel-staging/* 2>/dev/null | tail -n +3); do
    [ "$d" = "$CUR_STG" ] && continue
    sudo rm -rf "$d"
  done

  # Dejar solo 2 releases de prod (incluyendo el activo)
  for d in $(ls -1dt releases/panel/* 2>/dev/null | tail -n +3); do
    [ "$d" = "$CUR_PROD" ] && continue
    sudo rm -rf "$d"
  done

  df -h /
# Gilberto Nunez director comercial comebi cel personal +5215530862988   cel trabajo +5214441692305

sudo cat /proc/$(pgrep -f "next start")/environ | tr '\0' '\n' | grep -E 'SUPABASE|PANEL'

# ANALYTICS
AIzaSyAhf3QSTXkwvczUUmWaxF5hFLfs7U8XFRY

# VER USO DE RAM
df -h
du -sh /var/www/talia
free -m


# REINDEXAR
cd /var/www/talia/backend
.venv/bin/python scripts/index_catalog.py --organizacion-id 00000000-0000-0000-0000-000000000001
# DIAGNOSTICO DE CPU

echo "========== LOAD =========="
uptime

echo
echo "========== MEM =========="
free -m

echo
echo "========== VMSTAT =========="
vmstat 1 5

echo
echo "========== DISCO =========="
df -h

echo
echo "========== IOSTAT =========="
iostat -xz 1 3 2>/dev/null || echo "iostat no instalado"

echo
echo "========== TOP MEM =========="
ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%mem | head -n 15

echo
echo "========== TOP CPU =========="
ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%cpu | head -n 15

echo
echo "========== PANEL =========="
sudo systemctl status talia-panel.service --no-pager -l | sed -n '1,20p'

echo
echo "========== API =========="
sudo systemctl status talia-api.service --no-pager -l | sed -n '1,20p'

echo
echo "========== MONITOR =========="
tail -n 20 /var/www/talia/logs/maintenance/resource_health.log

echo
echo "========== RELEASES PANEL =========="
du -sh /var/www/talia/releases/panel/*
readlink -f /var/www/talia/current/panel
du -shL /var/www/talia/current/panel
/var/www/talia/cotizacion-e37183ad-20260607180303.pdf
# EJECUTAR LIMPIEZA DE MI TELEFONO:
  select public.cleanup_test_phone_whatsapp(
    '+5214441302811',
    'a2f79c76-340a-4fe7-b05a-6ff4dd532325'::uuid
  );
Gran Penon
  select public.cleanup_test_phone_whatsapp(
    '+5214441882244',
    '3dbb2a99-9d81-4233-8444-0990d53b93b3'::uuid
  );

    select public.cleanup_test_phone_whatsapp(
    '+5214441306206',
    '00000000-0000-0000-0000-000000000001'::uuid
  );

  delete from public.oportunidades
  where organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
    and metadata->>'seed_batch' = 'seed_oportunidades_prueba_20260316_v2';

  delete from public.contactos
  where organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
    and contacto_datos->>'seed_batch' = 'seed_oportunidades_prueba_20260316_v2';
  
# GENERAR CONTRASENAS:
python3 - <<'PY'
import base64, os
print("TALIA_SECRETS_MASTER_KEY=" + base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('='))
print("TALIA_SECRETS_MASTER_KEY_HIGH=" + base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('='))
PY

# SORIANA
carlossanchez-fanjul@soriana.com
# Sncronizar despues de cambios:
sudo chown -R www-data:www-data /var/www/talia

sudo systemctl status talia-panel.service
sudo systemctl status talia-api.service

sudo journalctl -u talia-api.service -n 50 -l --no-pager
sudo journalctl -u talia-api.service -n 200 -l --no-pager | grep -E "permission.check|denue/busquedas|prospeccion"

# Dejar git GLOBL
git config --global user.name collejas
git config --global user.email collejas1@gmail.com

# DUENO:
sudo chown -R jorge:jorge /var/www/talia
sudo chown -R jorge:jorge /var/www/talia/frontend/panel/.next
sudo chown -R jorge:jorge /var/www/talia/logs/mapbox-debug.log

git clone <https://github.com/collejas/buscador.git> /var/www/
        talia/buscador
https://github.com/collejas/buscador.git

TU_puTA_mADRE_479156376421_8NbukI5vDpp0We1Ufhdfy%^$%^$VDFGdff

cd frontend/panel
npm run dev
- Local:         http://localhost:3000

npx next dev --webpack

IA de WhatsApp
IA para WhatsApp
IA para ventas
asistente de IA
CRM IA

• Ese error es del sistema, no de tu código: se acabó el límite de file watchers (inotify).

  Haz esto en Ubuntu:

  # Ver valores actuales
  cat /proc/sys/fs/inotify/max_user_watches
  cat /proc/sys/fs/inotify/max_user_instances
  cat /proc/sys/fs/inotify/max_queued_events

  # Subir límites (inmediato)
  sudo sysctl -w fs.inotify.max_user_watches=524288
  sudo sysctl -w fs.inotify.max_user_instances=1024
  sudo sysctl -w fs.inotify.max_queued_events=32768

  # Dejarlo permanente
  echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
  echo "fs.inotify.max_user_instances=1024" | sudo tee -a /etc/sysctl.conf
  echo "fs.inotify.max_queued_events=32768" | sudo tee -a /etc/sysctl.conf
  sudo sysctl -p

  Luego limpia y vuelve a levantar:

  cd /var/www/talia/frontend/panel
  rm -rf .next
  npm run dev

  Si quieres evitar Turbopack temporalmente:

  npx next dev --webpack

# Entarada a Ser
ssh jorge T@67.205.156.148 port: 2222

psql "postgresql://postgres:DE_se479156376421@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require"
\pset pager off

# Test
poetry run pytest

poetry run pytest 2>&1 | tee "resultados_pytest_general_$(date +%Y%m%d_%H%M%S).txt"

poetry run ruff check . (backend)

# META

* Exportar 
export META_TOKEN='EAANgSoLxO8ABRTy101AgFqoMq2R6ZAP8674vZC6niWQEHiWfYkclA5BphzhEIqtQAjsxNOQipxFHyxFEEoO9vO7eyZAJT3SVuhGOt32OwS44FM9jcaTWdgfMdbJfiN9ZAvP8fmr2emXgZCRW5QyZCqyG0szYhbemUG3a2TQNmZCQcIMk5zc03FqWFSGeF2Nr0rn4wZDZD'      Esta en .env

* comprobar como va:
curl -X GET "https://graph.facebook.com/v25.0/<<<<WhatsApp Business Account ID>>>>/phone_numbers?fields=id,display_phone_number,verified_name,name_status,code_verification_status,quality_rating" \
-H "Authorization: Bearer $META_TOKEN"    

Esto: <<<<WhatsApp Business Account ID>>>> es el: WABA ID se debe cambiar por el del cliente, y es diferente al: Phone Number ID

## Siguiente comando

Usa el Phone Number ID de Gran Peñon, que ya vimos que es:

1139218909270276

Y corre:

curl -X POST "https://graph.facebook.com/v25.0/1139218909270276/register" \
-H "Authorization: Bearer $META_TOKEN" \
-H "Content-Type: application/json" \
-d '{
  "messaging_product": "whatsapp",
  "pin": "915637"
}'

Pon un PIN de 6 dígitos que vayas a guardar bien.

Si responde esto:
{"success": true}

entonces ya quedó registrado.

Luego prueba envío
curl -X POST "https://graph.facebook.com/v25.0/1139218909270276/messages" \
-H "Authorization: Bearer $META_TOKEN" \
-H "Content-Type: application/json" \
-d '{
  "messaging_product": "whatsapp",
  "to": "5214441302811",
  "type": "text",
  "text": {
    "body": "Prueba desde Gran Peñon"
  }
}'

el:   "to": "5214441302811", es a un telefono de prueba, que previamente debiste enviar un mensaje al que vas a probar
Si te regresa un messages[].id, ya quedó funcionando.

En resumen

Ya confirmaste por comando exactamente lo que querías:

WABA correcto
phone number id correcto
nombre aprobado
número verificado

Ahora solo falta:

POST /register
prueba con /messages

Y guarda esto en tu sistema para ese cliente:

waba_id = 3483150995170974
phone_number_id = 1139218909270276

Y no vuelvas a reutilizar ese token expuesto; al terminar, ró­talo.

# Bse de datos

## Hacer respaldo sin IPv6 Direct Connection USANDO Pooler (Transaction)
unset DATABASE_URL
cd /var/www/talia/backend
PATH=/usr/lib/postgresql/17/bin:$PATH poetry run python scripts/backup_db.py --output-dir ../backups

curl -v smtps://mail.talia.mx:465 \
       --mail-from hola@talia.mx \
       --mail-rcpt hola@talia.mx \
       --upload-file <(printf "Subject: Prueba SMTP\r\n\r\nHola") \
       --user 'hola@talia.mx:TU_puTA_mADRE_479156376421_8NbukI5vDpp0We1U'

curl -v smtps://mail.talia.mx:465 \
    --mail-from hola@talia.mx \
    --mail-rcpt collejas1@gmail.com \
    --upload-file <(printf "Subject: Prueba SMTP\r\nTo: collejas1@gmail.com\r\nFrom: hola@talia.mx\r\n\r\nHola, esto es una prueba
  desde curl.") \
    --user 'hola@talia.mx:TU_puTA_mADRE_479156376421_8NbukI5vDpp0We1U'

## hacer un respaldo con IPv6 Direct Connection

Usa el script `backend/scripts/backup_db.py`, que ya carga `backend/.env` o `.env` para recuperar `DATABASE_URL`. Cada corrida crea una carpeta `backups/<prefijo>_<timestamp>/` con los archivos generados.

- Respaldo completo (datos + esquema) **y** roles/permisos:
  ```bash
  cd /var/www/talia/backend
  poetry run python scripts/backup_db.py --output-dir ../backups
  ```
- Sólo dump completo y de esquema (sin roles globales):
  ```bash
  cd /var/www/talia/backend
  poetry run python scripts/backup_db.py --output-dir backups --no-globals
  ```
- Sólo roles/permisos globales (se creará también un `.sql` de esquema en la misma carpeta, puedes ignorarlo si no lo necesitas):
  ```bash
  cd /var/www/talia/backend
  poetry run python scripts/backup_db.py --mode schema --globals --output-dir ../backups
  ```
- Sólo dump completo:
  ```bash
  cd /var/www/talia/backend
  poetry run python scripts/backup_db.py --mode full --no-globals --output-dir ../backups
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



# Ejectutar buscador:

poetry run python ../buscador/main.py \
    --sitio=domain \
    --url="https://www.andresycia.com" \
    --mode=generic \
    --max-pages=2000 \
    --max-depth=50 \
    --output="resultados_andres_generico.json"

# ME GUSTO ESTO:

¡Hola! Soy Tal-IA, tu especialista en agentes virtuales inteligentes con GenAI. Desarrollo soluciones que automatizan interacciones, procesan datos y aprenden de tus operaciones para potenciar tu productividad y toma de decisiones. También ofrezco servicios complementarios como: Automatización de procesos (RPA) Integración de sistemas y datos OT/IT Soluciones de análisis avanzado Trabajo contigo para entender tus flujos críticos y diseñar soluciones a medida que generen valor tangible desde el primer día. ¿Listo para llevar tu operación al siguiente nivel con agentes virtuales inteligentes? Habla conmigo, con Tal-IA. 





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





# Correo pui@pui.geoactiv.mx  
2?ckWbEQqZ%HX8Tn


pui_api_key=<OPENAI_API_KEY_REDACTED>



# PROPUESTA PARA MEJROAR ASISTENTE

traería mejoras, pero son marginales y más de robustez que de “que el chat responda mejor”.

  Qué te aporta contact_id:

  - Permite al prompt saber exactamente quién está hablando sin depender solo de conversacion_id.
  - Ayuda si quieres personalizar mejor respuestas con datos del contacto.
  - Sirve para desambiguar cuando una conversación se cruza con varios registros o cuando el backend hace reconciliación de contacto.
  - Facilita instrucciones del tipo “si ya existe este contacto, no vuelvas a pedir correo/teléfono”.

  Qué te aporta session_id:

  - Ayuda a ligar el turno del chat con la sesión del sitio.
  - Es útil para depuración, trazabilidad y atribución.
  - Puede servir si quieres que el prompt adapte su tono o comportamiento según continuidad de sesión.
  - También ayuda a detectar sesiones reanudadas vs nuevas.

  Lo importante:

  - No son necesarios para que el webchat funcione.
  - El maestro no depende de que estén como variables del prompt.
  - El fallo que tenías era porque conversacion_id faltaba en la versión correcta del prompt.
  - contact_id y session_id ya existen como contexto interno del backend, solo no se mandan como variables visibles al prompt.

  Mi recomendación práctica:

  - Deja conversacion_id como variable obligatoria.
  - Si quieres más control, agrega contact_id y session_id solo si el prompt realmente los va a usar.
  - Si no los usas en las instrucciones del prompt, meterlos solo agrega complejidad y riesgo de desalineación.



  fotos
  lista precios


  ** no repetir nombre cliente
  ** no ser tan precisos en la info que da
  ** de contado 7160
  ** Credito 7200 credito bancario e info
  ** pregunta  de tipo de cliente
  ** no repetir gracias




# ACTIVACION DE WHATSAPP API

* Usa el Phone Number ID
curl -X POST "https://graph.facebook.com/v25.0/"ID DEL WHATSAPP CLIENTE"/register" \
-H "Authorization: Bearer $META_TOKEN" \
-H "Content-Type: application/json" \
-d '{
  "messaging_product": "whatsapp",
  "pin": "915637"
}'

Si TODO SALE BIEN DEBE RESPONDER:  {"success": true}


* Luego prueba envío

curl -X POST "https://graph.facebook.com/v25.0/1046129768592659/messages" \
-H "Authorization: Bearer $META_TOKEN" \
-H "Content-Type: application/json" \
-d '{
  "messaging_product": "whatsapp",
  "to": "5214441302811",
  "type": "text",
  "text": {
    "body": "Prueba desde IMLUX"
  }
}'

Si te regresa un messages[].id, ya quedó funcionando.


# correr rellenos:

  Comandos:

cd /var/www/talia/backend
poetry run python scripts/backfill_opportunity_insights.py --organizacion-id 00000000-0000-0000-0000-000000000001
poetry run python scripts/backfill_opportunity_insights.py --organizacion-id 00000000-0000-0000-0000-000000000001 --apply

  Para recomputar resumen e insights de una conversación específica:

cd /var/www/talia/backend
poetry run python scripts/recompute_conversation_insights.py --conversation-id 7f852e0d-1fa8-459a-b059-7ec92fc1c3a0
poetry run python scripts/recompute_conversation_insights.py --conversation-id 7f852e0d-1fa8-459a-b059-7ec92fc1c3a0 --apply

  Para correr por tenant:

cd /var/www/talia/backend
poetry run python scripts/recompute_conversation_insights.py --organizacion-id 00000000-0000-0000-0000-000000000001
poetry run python scripts/recompute_conversation_insights.py --organizacion-id 00000000-0000-0000-0000-000000000001 --apply




# activar vista de precios stripe

* Para activarlo temporalmente:

SHOW_PUBLIC_BILLING=1 node landing/src/scripts/write-public-config.mjs

* Para ocultarlo otra vez:

SHOW_PUBLIC_BILLING=0 node landing/src/scripts/write-public-config.mjs