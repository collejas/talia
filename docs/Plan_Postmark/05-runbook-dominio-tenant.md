# Runbook: dominio de envío de un tenant

## Objetivo

Permitir que un tenant envíe desde `usuario@su-dominio.com` usando Postmark, sin que pueda utilizar el dominio de otra organización.

## Precondiciones

- El usuario tiene permiso de administración del tenant.
- El dominio pertenece al tenant y puede modificar su DNS.
- La cuenta Postmark tiene plan y permisos suficientes.
- El backend tiene acceso al Account API Token sin exponerlo.

## Procedimiento

1. El usuario introduce un dominio normalizado, sin protocolo ni ruta.
2. Backend valida formato y ownership declarado por el usuario.
3. Backend consulta si el dominio ya pertenece a otra organización.
4. Backend crea el dominio con Domains API.
5. Talia guarda `postmark_domain_id`, estado `pending_dns` y los datos DNS.
6. Panel muestra el TXT DKIM y el CNAME Return-Path.
7. Tenant publica los registros en su proveedor DNS.
8. Backend verifica DKIM y Return-Path mediante API.
9. Talia marca `verified` solo cuando los controles requeridos estén completos.
10. Usuario registra o selecciona `From` y `Reply-To` dentro del dominio.
11. Backend envía prueba transaccional a un destinatario autorizado.
12. Si la prueba es correcta, el dominio queda disponible para campañas conforme a su cuota.

## Registros DNS esperados

Postmark devuelve valores concretos por dominio. No se deben hardcodear.

- TXT DKIM: host y valor devueltos por `DKIMPendingHost`/`DKIMPendingTextValue`.
- CNAME Return-Path: host configurado como subdominio del dominio del remitente y destino `pm.mtasv.net`, cuando se habilite.

## Estados

| Estado | Puede enviar | Acción |
|---|---:|---|
| `pending_dns` | No | Publicar registros DNS |
| `pending_verification` | No | Ejecutar verificación |
| `verified` | Sí | Permitir remitentes del dominio |
| `blocked` | No | Revisar seguridad, rebotes o quejas |
| `removed` | No | Eliminar asociaciones y evitar nuevos envíos |

## Errores y controles

- Dominio duplicado: devolver error de conflicto sin revelar el tenant propietario.
- DNS no propagado: mantener pendiente; no crear reintentos agresivos.
- Sender no verificado: bloquear envío antes de llamar a Postmark.
- Dominio eliminado: invalidar remitentes asociados y pausar campañas.
- Alto rebote/quejas: marcar `blocked` y requerir revisión de plataforma.

## Prueba de aceptación

- El tenant A puede crear y verificar `a.example`.
- El tenant B no puede seleccionar `a.example`.
- Un `From` fuera de `a.example` es rechazado por backend.
- Un dominio no verificado no puede enviar.
- El envío de prueba produce `provider_message_id` y evento de entrega.
- El webhook actualiza solo el envío correspondiente.

