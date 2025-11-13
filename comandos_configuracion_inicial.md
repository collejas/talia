# Crea la carpeta donde Nginx leerá los archivos:
sudo mkdir -p /var/www/talia-landing

# Copia el contenido de tu proyecto (carpeta landing/src/) hacia esa ruta.
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

# Bse de datos

## hacer un respaldo

## exportar url
export SUPABASE_DB_URL="postgresql://postgres:DE_se479156376421@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require"

## HAcer el restore de algun archivo *.dump
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname "$SUPABASE_DB_URL" \
  supabase/migrations/20251023_131845_full.dump


# NUEVO ARRANQUE CON SYSTEM, EDICION Y ESTATUS
sudo nano /etc/systemd/system/talia-panel.service
sudo micro /etc/systemd/system/talia-panel.service

sudo systemctl daemon-reload

sudo systemctl stop talia-panel.service
sudo systemctl stop talia-api.service

npm run lint
npm run build --webpack
npm run build --webpack && npm start

sudo systemctl restart talia-panel.service
sudo systemctl restart talia-api.service

codex resume 019a7964-21c7-76e0-933b-3e66028eca90

codex resume 019a704a-bbeb-7132-bfd0-859919497aa2
codex resume 019a704a-bbeb-7132-bfd0-859919497aa2
codex resume 019a704a-bbeb-7132-bfd0-859919497aa2

sudo systemctl status talia-panel.service
sudo systemctl status talia-api.service

npm run dev
http://127.0.0.1:3000/dashboard
http://127.0.0.1:3000/auth/login

poetry run pytest


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