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
