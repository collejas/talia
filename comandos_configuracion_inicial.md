# Crea la carpeta donde Nginx leerá los archivos:
sudo mkdir -p /var/www/talia-landing

# Copia el contenido de tu proyecto (carpeta landing/src/) hacia esa ruta.
sudo rsync -av --delete /home/devuser/talia/landing/src/ /var/www/talia-landing/

# Ajusta permisos para que Nginx (usuario www-data en Ubuntu) pueda servir los archivos:
sudo chown -R www-data:www-data /var/www/talia-landing

# Crear/Editar Nginx
sudo nano /etc/nginx/sites-available/talia

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

# Bse de datos

## hacer un respaldo

## exportar url
export SUPABASE_DB_URL="postgresql://postgres:DE_se479156376421@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require"

## HAcer el restore de algun archivo *.dump
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname "$SUPABASE_DB_URL" \
  supabase/migrations/20251023_131845_full.dump





# NUEVO ARRANQUE CON SYSTEM, EDICION Y ESTATUS

sudo nano /etc/systemd/system/talia-api.service


sudo systemctl start talia-api.service
sudo systemctl stop talia-api.service
sudo systemctl enable talia-api.service
sudo systemctl restart talia-api.service
sudo systemctl status talia-api.service

npm run dev
http://localhost:8004/panel-react/auth/login


npm run build


poetry run pytest

fondo #eff1f5
adentro #ffffff

#4400e3ff
#7b44ff
#9142ff
#b458ffff

# Exportacion de permisos servdor
export SUPABASE_URL="https://qnimyamtczbbwmlrlejc.supabase.co"
export SERVICE_ROLE="<<eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuaW15YW10Y3piYndtbHJsZWpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIyODg1NSwiZXhwIjoyMDc2ODA0ODU1fQ.MNUm-C1W7-pPTD6dR6_HlBq_J9nTLf2WNXy8-Z0t4KM>>"
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





VITE_ENVIRONMENT=development
VITE_LOG_LEVEL=info
VITE_REQUEST_LOG_LEVEL=info

VITE_OPENAI_API_KEY=sk-proj-XXXXX
VITE_OPENAI_ASSISTANT_ID=pmpt_69001211f6688194b2e27f3cf50e959f08c8cd898208331e
VITE_OPENAI_PROMPT_VERSION=24
VITE_OPENAI_PROJECT_ID=sk-proj-XXX
VITE_TWILIO_ACCOUNT_SID=AC...
VITE_TWILIO_AUTH_TOKEN=...
VITE_SUPABASE_URL=https://qnimyamtczbbwmlrlejc.supabase.co
VITE_SUPABASE_DATABASE_URL=postgresql://postgres:XXXXXX@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require
VITE_SUPABASE_SERVICE_ROLE=XXXXXX
SUPABASE_ANON_KEY=XXXXXXXXX
VITE_SUPABASE_LEGACY_JWT_SECRET=XXXXX
VITE_SUPABASE_ACCES_TOKEN=XXXXXXXXX
DATABASE_URL=postgresql://postgres:XXXXXXX@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require
SUPABASE_DB_PASSWORD=XXXXXX
VITE_WEBCHAT_INACTIVITY_HOURS=2
VITE_WEBCHAT_PERSIST_SESSION=false

# CORREO #
VITE_MAIL_USERNAME=hola@talia.mx
VITE_MAIL_CONTRASENA=XXXXXX
VITE_MAIL_INCOMING_SERVER=mail.talia.mx
VITE_MAIL_INCOMING_PORT_IMAP=993
VITE_MAIL_OUTGOING_SERVER=mail.talia.mx 
VITE_MAIL_OUTGOING_PORT_SMTP=465

# CALENDARIO #
VITE_CALENDARIO_USERNAME=hola@talia.mx
VITE_CALENDARIO_SERVER_URL=https://mail.talia.mx:2080
VITE_CALENDARIO_SERVER_PORT=2080
VITE_CALENDARIO_SERVER_URL_ALTERNATE=https://mail.talia.mx:2080/principals/hola@talia.mx
VITE_CALENDARIO_FULL_CALENDAR_URL=https://mail.talia.mx:2080/calendars/hola@talia.mx/calendar
VITE_CALENDARIO_FULL_CONTACT_LIST_URL=https://mail.talia.mx:2080/addressbooks/hola@talia.mx/addressbook


npx shadcn@latest add "https://v0.app/chat/b/b_mxlbOBL8zSH?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..wv9M7O6jQT_e-pVT.5zjUlUJDNKXIAiQHqArmcjTTRNxWEDqz-KOZ4PFDZv1dK-ASKlSeLpNERM8.-HDFVn8rF-1cPqUOfLaKoA"