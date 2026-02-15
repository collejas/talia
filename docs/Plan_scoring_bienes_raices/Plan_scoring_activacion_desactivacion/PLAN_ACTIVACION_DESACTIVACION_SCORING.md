# Plan de Activacion/Desactivacion de Perfilamiento y Scoring

## 1. Objetivo
Definir una politica unica para activar/desactivar el perfilamiento de IA por tenant, con control exclusivo del tenant maestro.

Tenant maestro (controlador):
- `00000000-0000-0000-0000-000000000001`

## 2. Regla de gobierno
- Solo el tenant maestro puede cambiar el estado de perfilamiento de cualquier tenant.
- Los tenants inferiores no pueden activar ni desactivar esta funcion.
- Los tenants inferiores tampoco pueden editar configuraciones de scoring cuando el perfilamiento este desactivado.

## 3. Regla de producto (UI)
Para cada tenant objetivo:
- Si `profiling_enabled = true`:
  - Se muestra la vista `/settings/scoring`.
  - Se permite administrar preguntas, repreguntas, reglas y perfiles.
- Si `profiling_enabled = false`:
  - Se oculta `/settings/scoring` en navegacion.
  - La ruta `/settings/scoring` no debe renderizar contenido (redirect/403).

## 4. Comportamiento operativo por estado
### 4.1 Perfilamiento ON
- Flujo normal con preguntas de `scoring_questions`.
- Se aplican `scoring_rules`, `scoring_profiles` y repreguntas.
- Se exige el conjunto `required_for_case_a` para agenda/notificacion caso A.

### 4.2 Perfilamiento OFF
- Solo se captura base:
  - `nombre`
  - `telefono`
  - `email`
  - `empresa`
  - `necesidad`
- No se ejecuta perfilamiento para agenda/scoring.
- No se muestra ni se permite gestionar catalogo de scoring del tenant.

## 5. Seguridad y control de acceso
- Backend es la fuente de verdad (no confiar en ocultar botones).
- Validar permiso master en endpoints de:
  - activar/desactivar perfilamiento
  - mutaciones de catalogo scoring (`questions`, `reprompts`, `rules`, `profiles`)
- Para tenants no autorizados, responder `403 Forbidden`.
- Registrar auditoria por cambio:
  - actor, tenant objetivo, valor anterior/nuevo, timestamp, motivo.

## 6. Modelo de configuracion propuesto
Configuracion por tenant:
- `profiling_enabled` (boolean)
- `updated_at`
- `updated_by`
- `reason` (opcional)

Opcional (fase 2):
- `profiling_enabled_by_channel` (`whatsapp`, `webchat`) cuando se requiera granularidad por canal.

## 7. Reglas de backend
- Resolver estado con helper central, por ejemplo:
  - `is_profiling_enabled(tenant_id, channel)`
- Antes de ejecutar scoring/prefilter/schedule guards:
  - Si OFF: saltar perfilamiento y operar en modo captura base.
  - Si ON: mantener flujo completo por catalogo.

## 8. Reglas de frontend
- Menu: mostrar `settings/scoring` solo si `profiling_enabled=true`.
- Route guard server-side:
  - si OFF -> redirect a settings general o mostrar 403.
- Bloquear acciones de guardado si el backend indica `profiling_enabled=false`.

## 9. Observabilidad
Agregar eventos de log:
- `profiling.toggle.changed`
- `profiling.toggle.denied_non_master`
- `profiling.route.blocked`
- `profiling.mode.on/off` por ejecucion de tools criticas.

## 10. Plan de implementacion
1. BD + auditoria del flag.
2. Endpoint backend para toggle (solo master).
3. Guardas backend en scoring/tools/rutas de catalogo.
4. Guardas frontend (menu + ruta `/settings/scoring`).
5. Pruebas E2E ON/OFF por tenant en `webchat` y `whatsapp`.

## 11. Criterios de aceptacion
- Un tenant inferior no puede cambiar el flag ni por UI ni por API.
- Con perfilamiento OFF, `/settings/scoring` no es accesible.
- Con perfilamiento ON, `/settings/scoring` funciona normalmente.
- El flujo conversacional en OFF solo pide datos base.
- El flujo en ON mantiene perfilamiento completo segun catalogo BD.

## 12. Checklist tecnico de ejecucion
### 12.1 Base de datos
- [ ] Crear tabla de control por tenant:
  - `tenant_feature_flags(organizacion_id uuid pk, profiling_enabled bool, updated_at timestamptz, updated_by uuid, reason text)`
- [ ] Crear tabla de auditoria:
  - `tenant_feature_flags_audit(id uuid, organizacion_id, changed_by, old_value, new_value, reason, changed_at)`
- [ ] Seed inicial:
  - `profiling_enabled=true` para tenant maestro.
  - Definir default para tenants nuevos.
- [ ] Indices:
  - `tenant_feature_flags.organizacion_id`
  - `tenant_feature_flags_audit.organizacion_id, changed_at desc`

### 12.2 Seguridad (RLS + API)
- [ ] Definir politica para que solo actor master pueda modificar flags.
- [ ] En backend, validar actor master tambien a nivel de servicio (doble control).
- [ ] Retornar `403` en cualquier intento de tenant inferior.

### 12.3 Backend (servicios y rutas)
- [ ] Crear helper central:
  - `is_profiling_enabled(organizacion_id, channel=None) -> bool`
- [ ] Integrar helper en:
  - flujo `close_lead`
  - guardas de `schedule_demo`
  - `apply_lead_scoring`
  - notificaciones que dependen de `required_for_case_a`
- [ ] Si OFF:
  - saltar perfilamiento/scoring catalogo
  - exigir solo datos base para el flujo comercial definido
- [ ] Proteger endpoints de catalogo scoring:
  - `questions`
  - `reprompts`
  - `rules`
  - `profiles`
  - bloquear escritura cuando `profiling_enabled=false`
- [ ] Crear endpoint admin (master only):
  - `PATCH /admin/tenants/{organizacion_id}/profiling-toggle`

### 12.4 Frontend (panel)
- [ ] Mostrar switch de perfilamiento solo al tenant maestro.
- [ ] Guardar cambios via endpoint admin.
- [ ] Mostrar `settings/scoring` solo si flag ON para tenant objetivo.
- [ ] Enrutamiento protegido:
  - si flag OFF -> redirect/403 server-side
- [ ] Ocultar acciones de edicion scoring si OFF.

### 12.5 Observabilidad y auditoria
- [ ] Log estructurado en cambios de flag:
  - `profiling.toggle.changed`
  - `profiling.toggle.denied_non_master`
- [ ] Log de modo por ejecucion:
  - `profiling.mode.on`
  - `profiling.mode.off`
- [ ] Exponer trazabilidad en panel master (historial de cambios).

### 12.6 Pruebas
- [ ] Unit tests:
  - resolucion de flag ON/OFF
  - permisos master vs tenant inferior
- [ ] Integration tests:
  - OFF: no perfilamiento, solo captura base
  - ON: perfilamiento completo por catalogo
- [ ] E2E por canal:
  - `whatsapp` y `webchat` en modo ON y OFF
- [ ] Regression tests:
  - notificacion vendedor (A/B)
  - agenda de cita sin falsos positivos

### 12.7 Rollout recomendado
- [ ] Fase 1: desplegar BD + endpoint + guardas backend (sin habilitar UI).
- [ ] Fase 2: habilitar UI master y route guards.
- [ ] Fase 3: piloto en 1 tenant inferior.
- [ ] Fase 4: habilitacion controlada por lotes.
