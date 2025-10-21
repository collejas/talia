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



dig +short talia.mx @8.8.8.8
dig +short talia.mx @1.1.1.1

dig talia.mx

nslookup talia.mx

curl -I http://talia.mx