---
name: geoactiv-security-review
description: Use this skill when reviewing GEOACTIV security, permissions, authentication, authorization, data exposure, secrets, logs, webhooks, APIs, Supabase, SQL, CORS, deployment, Nginx, systemd, Docker, or sudoers.
license: Proprietary
metadata:
  author: GEOACTIV
  version: "1.0.0"
  organization: GEOACTIV
  stack: FastAPI, Next.js, Supabase, PostgreSQL, Nginx, systemd, Docker
  date: June 2026
  abstract: Guides Codex to perform practical security reviews across GEOACTIV backend, frontend, database, infrastructure, logs, webhooks, permissions, and integrations before changes are delivered.
---

# GEOACTIV Security Review

Este skill guía la revisión de seguridad para GEOACTIV.

## Objetivo

Detectar riesgos de seguridad antes de entregar cambios en backend, frontend, base de datos, integraciones, webhooks, deploy o automatizaciones.

La revisión debe enfocarse en seguridad práctica, no en teoría innecesaria.

## Áreas a revisar

* Autenticación.
* Autorización.
* Permisos por usuario, cliente, tenant, organización o rol.
* Exposición de datos sensibles.
* Secretos, tokens, API keys y credenciales.
* Logs.
* Webhooks.
* CORS.
* SQL e inyección.
* Supabase y RLS cuando aplique.
* Validación de entrada.
* Validación de salida.
* Manejo de errores.
* Integraciones externas.
* Deploy, Nginx, systemd, Docker y sudoers.

## Reglas fuertes

* Nunca exponer secretos en código, logs, errores, frontend o respuestas API.
* Nunca hardcodear tokens, llaves API, passwords o credenciales.
* Validar permisos antes de leer, modificar o eliminar datos.
* No confiar en datos recibidos desde frontend, webhooks o servicios externos.
* No devolver información de más en endpoints.
* No mostrar stack traces al usuario final.
* No imprimir payloads sensibles completos en logs.
* No usar SQL inseguro.
* No abrir CORS de forma amplia sin justificación.
* No crear endpoints administrativos sin protección clara.
* No asumir que un usuario puede acceder a un recurso solo porque conoce su ID.

## Backend FastAPI

Revisar:

* Que los endpoints validen entrada con Pydantic.
* Que exista autorización antes de acceder a recursos.
* Que no se filtre información sensible en errores.
* Que los errores externos se manejen de forma segura.
* Que no haya lógica crítica basada solo en datos enviados por el cliente.
* Que las rutas administrativas tengan protección explícita.
* Que los webhooks validen origen, firma, token o mecanismo equivalente cuando aplique.
* Que procesos lentos no bloqueen webhooks críticos innecesariamente.

## Base de datos / Supabase

Revisar:

* Foreign keys.
* Constraints.
* Índices necesarios.
* Políticas RLS cuando aplique.
* Que las consultas respeten tenant, organización, cliente o usuario.
* Que no se usen queries dinámicas inseguras.
* Que información sensible no se guarde sin necesidad.
* Que no haya datos críticos escondidos en metadata/jsonb sin justificación.

## Frontend

Revisar:

* Que no se expongan secretos en variables públicas.
* Que el frontend no sea la única capa de autorización.
* Que las pantallas oculten acciones no permitidas, pero que el backend también valide.
* Que errores no muestren datos internos.
* Que los formularios validen datos sin sustituir la validación del backend.

## Logs

Revisar que no se registren:

* Tokens.
* API keys.
* Passwords.
* Códigos temporales.
* Datos personales innecesarios.
* Payloads completos sensibles.
* Headers de autorización.
* Respuestas completas de proveedores externos si contienen información sensible.

## Integraciones externas

Para OpenAI, Twilio, Mapbox, Supabase u otros servicios:

* Usar variables de entorno.
* No exponer llaves en frontend salvo que sean públicas por diseño.
* Validar errores y timeouts.
* Registrar eventos útiles sin guardar secretos.
* Controlar reintentos para evitar duplicados.
* Validar webhooks cuando el proveedor lo permita.

## Infraestructura

Revisar:

* Configuración de Nginx.
* Servicios systemd.
* Dockerfile y docker-compose si existen.
* Permisos sudoers.
* Variables de entorno.
* Archivos `.env`.
* Archivos temporales o backups dentro del repo.
* Comandos de deploy con permisos mínimos necesarios.

## Checklist antes de aprobar

Antes de considerar seguro un cambio, responder:

1. ¿Quién puede ejecutar esta acción?
2. ¿Cómo se valida ese permiso?
3. ¿El backend valida lo mismo que el frontend?
4. ¿Se puede acceder a datos de otro tenant, cliente u organización?
5. ¿Hay secretos expuestos?
6. ¿Los errores filtran información interna?
7. ¿Los logs guardan datos sensibles?
8. ¿Hay SQL inseguro?
9. ¿CORS está limitado correctamente?
10. ¿Los webhooks están protegidos?
11. ¿La base de datos protege integridad?
12. ¿Hay riesgo de duplicidad, replay o abuso?
13. ¿El cambio rompe alguna política de seguridad existente?

## Al entregar

Explicar:

* Riesgos encontrados.
* Archivos o áreas afectadas.
* Severidad: crítica, alta, media o baja.
* Recomendación concreta.
* Cambios sugeridos o aplicados.
* Riesgos pendientes si no se resolvieron.

## Formato de salida recomendado

Usar este formato:

```txt
Resultado de seguridad:
- Estado general: Aprobado / Aprobado con observaciones / No aprobado

Hallazgos:
1. [Severidad] Descripción del riesgo
   - Archivo:
   - Impacto:
   - Recomendación:

Cambios aplicados:
- ...

Pendientes:
- ...
```
