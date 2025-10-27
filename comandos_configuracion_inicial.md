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

sudo systemctl stop talia-api.service
sudo systemctl enable talia-api.service
sudo systemctl restart talia-api.service
sudo systemctl start talia-api.service

sudo systemctl status talia-api.service

poetry run pytest



- Dashboard (panel.html)
- Inbox (inbox.html)
- Configuración (configuracion.html)


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
