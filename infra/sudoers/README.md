# Sudoers de Deploy

Estos archivos documentan la politica `NOPASSWD` minima necesaria para los deploys no interactivos de Tal-IA.

Archivos:
- `talia-staging-deploy.sudoers`
- `talia-production-deploy.sudoers`

Instalacion manual:
```bash
sudo install -m 0440 infra/sudoers/talia-staging-deploy.sudoers /etc/sudoers.d/talia-staging-deploy
sudo visudo -cf /etc/sudoers.d/talia-staging-deploy

sudo install -m 0440 infra/sudoers/talia-production-deploy.sudoers /etc/sudoers.d/talia-production-deploy
sudo visudo -cf /etc/sudoers.d/talia-production-deploy
```

Nota:
- Estos archivos documentan el estado esperado del servidor.
- Si cambian los nombres de servicios o comandos permitidos, actualiza primero estos archivos del repo y luego `/etc/sudoers.d/`.
