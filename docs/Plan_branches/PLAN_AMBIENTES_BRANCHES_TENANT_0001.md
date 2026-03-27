# Plan de ambientes y branches (sin afectar producción)

## Objetivo
Permitir que el equipo siga desarrollando y validando cambios reales sin impactar a los tenants productivos, usando:
- separación de ambientes (`producción`, `staging`, `desarrollo`),
- estrategia de branches de código y base de datos,
- validación controlada con tenant maestro `0001`.

## Estado actual (2026-03-26)
- Existe un único stack activo de app (`talia-api.service` + `talia-panel.service`).
- El repo está operando en `main` como flujo principal.
- Supabase del proyecto principal enlazado a un solo `project-ref` (`qnimyamtczbbwmlrlejc`) en branch `main`.
- El sistema sí es multi-tenant por `organizacion_id` + RLS.
- Ya existe mecanismo para operar contexto de tenant en panel (`Operar este tenant`) con cookie `talia.tenant_context`.
- Tenant maestro identificado: `00000000-0000-0000-0000-000000000001`.
- Existe script de deploy atómico de panel (`scripts/deploy_panel_atomic.sh`), pero actualmente el servicio de panel usa `WorkingDirectory=/var/www/talia/frontend/panel`; por lo tanto, el symlink `current/panel` aún no es el runtime efectivo de producción.

## Estrategia de deploy atómico (panel)
Objetivo: conservar el script actual y convertirlo en ruta oficial de despliegue, evitando cortes y permitiendo rollback rápido.

Decisión:
1. No eliminar `scripts/deploy_panel_atomic.sh`.
2. Mantenerlo para `producción`.
3. Crear variante `staging` (o parametrización por ambiente) para no mezclar rutas/servicios.
4. Ajustar `talia-panel.service` para ejecutar desde `current/panel` cuando se haga el cutover.

Secuencia de migración segura:
1. Preparar staging con deploy atómico primero.
2. Validar que staging usa symlink `current/panel-staging` y rollback funcional.
3. Replicar el mismo patrón en producción.
4. Cambiar `talia-panel.service` a `WorkingDirectory=/var/www/talia/current/panel`.
5. Confirmar que el script y el servicio apuntan a la misma ruta runtime.

Criterio de salida:
- El release activo siempre se identifica por symlink (`current/...`) y no por carpeta fija.
- Rollback a release previo se puede ejecutar en minutos.
- Producción y staging tienen scripts/servicios desacoplados.

## Convención exacta de servicios y rutas
Definir desde ahora nombres y rutas fijas para evitar ambigüedad operativa.

Producción:
- Servicio API: `talia-api.service`
- Servicio panel: `talia-panel.service`
- Symlink runtime panel: `/var/www/talia/current/panel`
- Releases panel: `/var/www/talia/releases/panel/<timestamp>`
- Script deploy panel: `scripts/deploy_panel_atomic.sh`

Staging:
- Servicio API: `talia-api-staging.service`
- Servicio panel: `talia-panel-staging.service`
- Symlink runtime panel: `/var/www/talia/current/panel-staging`
- Releases panel: `/var/www/talia/releases/panel-staging/<timestamp>`
- Script deploy panel: `scripts/deploy_panel_staging_atomic.sh`

Regla:
- Cada servicio debe ejecutar desde su symlink `current/*`.
- Ningún servicio debe ejecutar directamente desde `frontend/panel` en despliegues administrados.

## Principio operativo
No mezclar "aislamiento por tenant" con "aislamiento por ambiente".
- Aislamiento por tenant protege datos entre clientes dentro de un ambiente.
- Aislamiento por ambiente protege estabilidad de producción frente a cambios en desarrollo.

## Arquitectura objetivo
1. Producción:
- servicios: `talia-api.service`, `talia-panel.service`
- dominio actual
- base de datos Supabase productiva

2. Staging:
- servicios separados: `talia-api-staging.service`, `talia-panel-staging.service`
- subdominio sugerido: `staging.talia.mx`
- base Supabase separada (preferido: proyecto aparte; alternativa: branch de Supabase con reglas claras)

3. Desarrollo:
- ejecución local (puertos locales)
- DB local o branch temporal de Supabase

## Estrategia de ramas (Git)
- `main`: siempre deployable a producción.
- `develop` (opcional pero recomendado): integración previa a staging.
- `feature/*`: cambios de trabajo.
- `hotfix/*`: correcciones urgentes de producción.

Flujo:
1. `feature/*` -> PR -> `develop`
2. `develop` -> deploy staging + pruebas
3. `develop` -> PR -> `main`
4. `main` -> deploy producción

## Estrategia de base de datos (Supabase)
1. Mantener migraciones versionadas en `supabase/migrations`.
2. Nunca aplicar SQL directo en producción sin migración registrada.
3. Promoción por etapas:
- aplicar migraciones en `staging`
- validar funcionalidad y performance
- aplicar exactamente las mismas migraciones en `producción`

## Estrategia tenant maestro `0001`
Uso recomendado:
- `0001` en **staging** como tenant de validación funcional principal.
- en producción, usar `0001` sólo para activaciones controladas (feature flags) cuando sea necesario.

Reglas:
1. Toda funcionalidad nueva sale detrás de flag en `organizaciones.config`.
2. Activar primero en `0001`.
3. Medir logs/errores/latencia.
4. Expandir gradualmente a más tenants.

## Plan de implementación por fases

### Fase 1 - Base de ambientes (infra)
1. Crear archivos de entorno por ambiente:
- `backend/.env.production`
- `backend/.env.staging`
- `frontend/panel/.env.production`
- `frontend/panel/.env.staging`

2. Crear servicios systemd staging:
- `talia-api-staging.service`
- `talia-panel-staging.service`

3. Definir puertos staging (ejemplo):
- API staging: `8104`
- Panel staging: `3101`

4. Configurar Nginx para `staging.talia.mx`.

Criterio de salida:
- producción y staging corren en paralelo sin compartir puertos ni procesos.

### Fase 2 - Flujo de despliegue
1. Duplicar/ajustar script de deploy para staging:
- `scripts/deploy_panel_staging_atomic.sh`

2. Hacer compatible runtime + script (staging primero, producción después):
- staging: servicio apunta a `current/panel-staging`
- producción: servicio apunta a `current/panel`

3. Definir pipeline manual mínimo:
- deploy staging desde `develop`
- pruebas smoke
- promoción a `main`
- deploy prod

Criterio de salida:
- cada cambio pasa por staging antes de producción.
- el deploy atómico realmente controla el runtime activo.

### Fase 3 - Control por tenant
1. Estandarizar flags en `organizaciones.config`:
- `features.<modulo>.enabled`
- `features.<modulo>.rollout_pct`

2. Crear checklist de activación por tenant.

3. Validar primero en tenant `0001`.

Criterio de salida:
- cambios de alto riesgo pueden activarse sin liberar globalmente.

### Fase 4 - Hardening operativo
1. Monitoreo por ambiente y por tenant (errores, p95, throughput).
2. Alertas mínimas para staging y producción.
3. Runbook de rollback app + rollback DB.

Criterio de salida:
- rollback ejecutable en minutos ante incidente.

## Checklists operativos

### Pre-deploy a staging
- [ ] Migraciones aplicadas en staging
- [ ] Build/lint/tests OK
- [ ] Variables de entorno de staging validadas
- [ ] Smoke tests en tenant `0001`

### Pre-deploy a producción
- [ ] Validación funcional completa en staging
- [ ] Plan de rollback confirmado
- [ ] Ventana/impacto comunicados
- [ ] Flags definidas (si aplica rollout gradual)

### Post-deploy producción
- [ ] Salud de API y panel OK
- [ ] Logs sin errores críticos
- [ ] Métricas p95 dentro de umbral
- [ ] Activación inicial sólo para `0001` (si aplica)

## Riesgos a evitar
- Usar el mismo proyecto DB para staging y producción con datos mezclados.
- Cambios SQL manuales sin migración versionada.
- Deploy directo a producción sin validación previa en staging.
- Feature release global sin flag por tenant.

## Próximos pasos inmediatos (orden recomendado)
1. Crear servicios `*-staging` + subdominio de staging.
2. Crear `.env` separados por ambiente.
3. Definir y probar deploy atómico de staging.
4. Formalizar rama `develop` y policy de PR.
5. Ejecutar primera prueba completa usando tenant `0001` en staging.

## Matriz de owners y aprobaciones
Definir responsables por tipo de cambio y aprobación mínima antes de promover a `main`.

Roles sugeridos:
- Owner Backend
- Owner Frontend
- Owner DB
- Owner Infra/DevOps
- Release Manager

Reglas:
- Cambios con migraciones SQL requieren aprobación de Owner DB.
- Cambios en servicios/systemd/nginx requieren aprobación de Owner Infra.
- Cambios cross-stack (frontend+backend+db) requieren aprobación del Release Manager.

Checklist:
- [ ] Owner asignado por PR
- [ ] Reviewer técnico asignado
- [ ] Aprobaciones requeridas completas
- [ ] Riesgo del cambio etiquetado (`low|medium|high`)

## Go/No-Go por ambiente
Criterios mínimos para promocionar cambios entre ambientes.

Go `develop -> staging`:
- [ ] CI verde (build + lint + tests)
- [ ] Sin cambios pendientes de migración no versionada
- [ ] Feature flags definidas para funcionalidades nuevas

Go `staging -> main`:
- [ ] Smoke suite completa en tenant `0001`
- [ ] Errores críticos = 0 en staging durante ventana de validación
- [ ] p95 endpoints críticos dentro de umbral definido
- [ ] Validación manual de flujos críticos completada

No-Go (bloquea release):
- fallo en migración
- regresión en login/inbox/crm/webchat
- incremento significativo de error rate o latencia

## Runbook de rollback detallado
Objetivo: restaurar servicio estable en minutos.

Rollback aplicación (panel/api):
1. Identificar último release sano.
2. Reapuntar symlink `current/...` al release anterior.
3. Reiniciar servicios del ambiente afectado.
4. Validar health endpoints y smoke básico.

Rollback base de datos:
1. Si migración es reversible, ejecutar migración de rollback versionada.
2. Si no es reversible, ejecutar plan de contingencia desde backup.
3. Verificar integridad de datos y RLS.

Rollback de feature flags por tenant:
1. Desactivar `features.<modulo>.enabled` para tenants afectados.
2. Mantener activo sólo en `0001` si aplica diagnóstico.
3. Documentar incidente y causa raíz.

Checklist:
- [ ] Runbook probado al menos una vez en staging
- [ ] Tiempo objetivo de recuperación (RTO) documentado
- [ ] Persona on-call definida por ventana de release

## Plan de migraciones con ventana y respaldo
Secuencia obligatoria por release con cambios SQL.

1. Antes de staging:
- [ ] Backup lógico reciente
- [ ] Script/migración revisado por Owner DB

2. En staging:
- [ ] Aplicar migraciones
- [ ] Validar queries críticas
- [ ] Ejecutar smoke/regresión

3. Antes de producción:
- [ ] Confirmar backup pre-release de producción
- [ ] Confirmar ventana de mantenimiento (si aplica)

4. En producción:
- [ ] Aplicar migraciones en orden
- [ ] Validar métricas + consultas críticas
- [ ] Confirmar consistencia por tenant (incluyendo `0001`)

## Observabilidad mínima obligatoria
Métricas y señales mínimas a revisar por ambiente.

API:
- error rate
- p95/p99 latencia
- throughput por endpoint crítico

Panel:
- errores de render/hidratación
- tiempos de respuesta de APIs server-side

DB/Supabase:
- errores SQL
- locks largos
- tiempo de consultas críticas

Canales (webchat/whatsapp):
- tasa de entrega
- errores de webhook
- tiempo de procesamiento

Checklist:
- [ ] Dashboard por ambiente (`prod`, `staging`)
- [ ] Alertas configuradas para error rate y p95
- [ ] Logs centralizados por servicio

## Plan de pruebas por tenant `0001`
Suite funcional mínima por cada release en staging.

Flujos obligatorios:
- [ ] Login y sesión
- [ ] Dashboard principal
- [ ] CRM (contactos/oportunidades)
- [ ] Inbox (lectura/respuesta)
- [ ] Webchat (entrada -> creación/actualización de entidad)
- [ ] WhatsApp (si aplica canal activo)
- [ ] Settings críticos (tenants, usuarios, variables)

Regla:
- No pasar a producción sin suite `0001` completa en staging.

## Política de secretos y variables por ambiente
Separación estricta de configuración sensible.

Reglas:
- Secrets de terceros por tenant en `public.secretos` (cifrado).
- Variables de infraestructura por ambiente en `.env` del servicio correspondiente.
- No reutilizar keys de producción en staging/desarrollo.
- Rotación periódica de llaves críticas (service role, APIs externas, SMTP, etc.).

Checklist:
- [ ] Inventario de variables por ambiente
- [ ] Inventario de secretos por tenant
- [ ] Política de rotación y fecha de última rotación
- [ ] Acceso mínimo necesario por rol

## Cronograma de implementación
Plan sugerido en 4 semanas (ajustable).

Semana 1:
- Definir owners, aprobaciones y política Go/No-Go
- Preparar archivos `.env` por ambiente

Semana 2:
- Levantar servicios/dominio de staging
- Implementar deploy atómico staging

Semana 3:
- Alinear producción a runtime por symlink (`current/panel`)
- Ejecutar primer ciclo completo `develop -> staging -> main`

Semana 4:
- Activar observabilidad/alertas mínimas
- Simular rollback en staging
- Cerrar checklist de hardening

Entregables:
- [ ] Staging operativo
- [ ] Flujo de release formalizado
- [ ] Runbook validado
- [ ] Primer release completo con validación en `0001`

## Tabla de ejecución (seguimiento)
Usar esta tabla como control semanal. El estado debe actualizarse en cada revisión.

Avance ejecutado (2026-03-26):
- Script creado: `scripts/deploy_panel_staging_atomic.sh`.
- Script backend staging creado: `backend/scripts/run_api_staging.sh` (puerto `8104`, env `backend/.env.staging`).
- Plantillas systemd creadas: `infra/systemd/talia-api-staging.service`, `infra/systemd/talia-panel-staging.service`.
- Plantilla Nginx creada: `infra/nginx/staging.talia.mx.conf.example`.
- Plantillas de entorno creadas: `backend/.env.staging.example`, `frontend/panel/.env.staging.example`.
- Archivos reales creados: `backend/.env.staging`, `frontend/panel/.env.staging`.
- Primer release staging generado con deploy atómico (sin restart): `releases/panel-staging/20260326_232813`.
- Guía de bootstrap creada: `docs/Plan_branches/bootstrap/README_STAGING_BOOTSTRAP.md`.
- Bloqueo actual: esta sesión no tiene `sudo` sin contraseña para instalar/activar servicios y Nginx.

| ID | Tarea | Responsable sugerido | Fecha objetivo | Estado |
|---|---|---|---|---|
| E1 | Definir owners y aprobaciones por tipo de cambio | Release Manager | 2026-03-29 | Pendiente |
| E2 | Formalizar política Go/No-Go (`develop->staging->main`) | Release Manager + Owners | 2026-03-30 | Pendiente |
| E3 | Crear `.env.production` y `.env.staging` (API/panel) | Owner Infra + Owners App | 2026-03-31 | En progreso |
| E4 | Crear `talia-api-staging.service` y `talia-panel-staging.service` | Owner Infra | 2026-04-01 | Completado |
| E5 | Configurar `staging.talia.mx` en Nginx | Owner Infra | 2026-04-01 | Completado |
| E6 | Implementar `scripts/deploy_panel_staging_atomic.sh` | Owner Infra + Owner Frontend | 2026-04-02 | Completado |
| E7 | Validar rollback de panel en staging (symlink `current/panel-staging`) | Owner Infra | 2026-04-03 | Pendiente |
| E8 | Alinear producción a runtime por symlink `current/panel` | Owner Infra | 2026-04-04 | Pendiente |
| E9 | Definir checklist de migraciones con backup pre-release | Owner DB | 2026-04-05 | Pendiente |
| E10 | Activar dashboard y alertas mínimas por ambiente | Owner Infra + Owner Backend | 2026-04-06 | Pendiente |
| E11 | Ejecutar suite smoke `0001` completa en staging | QA/Owner Frontend + Owner Backend | 2026-04-07 | Completado |
| E12 | Primer ciclo completo `feature -> develop -> staging -> main -> prod` | Release Manager | 2026-04-08 | Pendiente |
| E13 | Simulación de incidente + rollback (app + DB + flags) | Owner Infra + Owner DB | 2026-04-09 | Pendiente |
| E14 | Cierre de hardening y acta de operación estable | Release Manager | 2026-04-10 | Pendiente |

Leyenda de estado:
- `Pendiente`
- `En progreso`
- `Bloqueado`
- `Completado`
