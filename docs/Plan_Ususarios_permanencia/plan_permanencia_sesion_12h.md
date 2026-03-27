# Plan de Permanencia de Sesión de Usuarios (12 horas)

## 1. Objetivo

Eliminar expiraciones prematuras de sesión y establecer una política profesional, segura y consistente para que cada sesión de usuario tenga una permanencia máxima de **12 horas**, sin degradar seguridad ni experiencia de uso.

## 2. Problema actual (resumen técnico)

Se observó que los usuarios son expulsados antes del tiempo esperado debido a una combinación de factores:

- El `access_token` expira en ventanas cortas (aprox. 1 hora en operación observada).
- El middleware del panel valida rutas/permisos usando ese token y redirige antes de completar una renovación controlada.
- Existe flujo de refresh, pero no como fuente única y centralizada para toda la app.

Resultado: percepción de “logout inesperado”, aunque existan cookies de mayor duración.

## 3. Principios de diseño (solución de fondo)

1. **JWT corto por seguridad**
- Mantener `access_token` de vida corta (recomendado: 60 minutos).

2. **Sesión larga por política, no por token largo**
- Lograr 12 horas con `refresh token` + control server-side.
- Evitar elevar el JWT a 12 horas.

3. **Una sola fuente de verdad de sesión**
- Centralizar validación/refresh en un único `SessionManager` server-side.

4. **Separación de responsabilidades**
- Middleware: control básico de acceso (público/privado).
- Backend/SSR/API: autenticación efectiva y permisos desde `SessionManager`.

## 4. Política de sesión propuesta (Supabase Auth)

Definir explícitamente en Supabase:

- `JWT expiry`: **60 min**
- `Time-box user session`: **12h**
- `Inactivity timeout`: **12h**
- `Single session per user`: según decisión de negocio (default recomendado: desactivado)

Notas:
- Si seguridad exige menor inactividad (ej. 4h), ajustar formalmente con aprobación.
- Documentar la política para operación y soporte.

## 5. Arquitectura objetivo

### 5.1 SessionManager (nuevo módulo central)

Responsabilidades:

- Leer cookies de sesión.
- Validar `access_token` actual.
- Si token está vencido o próximo a vencer, ejecutar refresh una sola vez.
- Reescribir cookies seguras y consistentes.
- Resolver usuario autenticado y contexto de permisos.
- Exponer API interna para middleware ligero, API routes, server actions y SSR.

Interfaz sugerida:

- `getSessionContext(request)`
- `requireAuth(request)`
- `requirePermission(request, permission)`
- `refreshIfNeeded(session)`

### 5.2 Middleware (refactor)

Debe quedar limitado a:

- Determinar si la ruta es pública o privada.
- Redirigir a login solo cuando no exista sesión utilizable.
- No resolver reglas de negocio/permisos complejos ni depender de JWT crudo para autorización fina.

### 5.3 Backend y frontend server-side

- Todas las rutas API protegidas consumen `requireAuth/requirePermission`.
- Layouts/páginas server-side obtienen sesión desde el manager central.
- Remover lógica duplicada de refresh dispersa.

## 6. Seguridad y hardening

1. Cookies
- `HttpOnly`, `Secure`, `SameSite=Lax` (o `Strict` donde aplique).
- Path y domain consistentes.
- Rotación correcta de tokens en refresh.

2. Control de refresh
- Un solo intento por request para evitar loops.
- Manejo explícito de `invalid_grant` y sesiones revocadas.

3. Revocación y cierre de sesión
- Logout invalida sesión en servidor y limpia cookies.
- Soporte para “cerrar sesión en todos los dispositivos” (opcional fase 2).

4. Auditoría
- Eventos mínimos: `session_refreshed`, `refresh_failed`, `auth_required`, `permission_denied`, `forced_logout`.

## 7. Plan de implementación (fases)

## Fase 0: Descubrimiento y baseline (0.5 día)

- Mapear flujo actual de login/session/middleware/backend.
- Confirmar parámetros actuales de Auth en Supabase (staging y producción).
- Levantar baseline de incidencias (frecuencia de relogin por hora).

Entregable:
- Documento técnico de baseline + riesgos.

## Fase 1: Política Auth en staging (0.5 día)

- Ajustar Auth en Supabase staging a política objetivo.
- Verificar comportamiento con usuarios reales de prueba.

Entregable:
- Evidencia de configuración aplicada y validada.

## Fase 2: SessionManager central (1–1.5 días)

- Implementar módulo central con contratos claros.
- Integrar refresh controlado y escritura consistente de cookies.
- Añadir logs estructurados.

Entregable:
- Módulo productivo + pruebas unitarias base.

## Fase 3: Refactor middleware + rutas críticas (1 día)

- Simplificar middleware.
- Migrar API routes/server actions/layouts protegidos al manager.
- Eliminar dependencias de validación ad-hoc.

Entregable:
- Flujo unificado sin cortes por expiración de access token.

## Fase 4: QA/E2E y hardening final (1 día)

Casos obligatorios:

1. Usuario navega >2h sin relogin.
2. Expira `access_token` durante navegación y se refresca sin interrupción.
3. Sesión termina correctamente al cumplir 12h.
4. Refresh inválido/revocado redirige a login de forma limpia.

Entregable:
- Reporte de pruebas + evidencias.

## Fase 5: Rollout controlado a producción (0.5 día)

- Ventana de despliegue definida.
- Monitoreo intensivo primeras 24–48h.
- Plan de rollback documentado.

Entregable:
- Checklist firmado de go-live.

## 8. Riesgos y mitigaciones

1. **Riesgo:** loops de refresh o sobrecarga.
- Mitigación: máximo 1 refresh por request + circuit breaker de errores.

2. **Riesgo:** inconsistencias entre middleware y backend.
- Mitigación: remover decisiones de permisos del middleware y centralizar en SessionManager.

3. **Riesgo:** cambio en experiencia de usuarios activos.
- Mitigación: rollout por staging, pruebas E2E y observabilidad temprana.

4. **Riesgo:** regresiones en rutas legacy.
- Mitigación: inventario de endpoints protegidos + pruebas de regresión.

## 9. Métricas de éxito

- Disminución >90% de relogins no intencionales dentro de 12h.
- Tasa de refresh exitoso >99%.
- Cero bucles de redirección auth.
- Cero incidencias críticas de seguridad por sesión.

## 10. Checklist operativo

Antes de producción:

- [ ] Política Auth definida y aprobada (12h).
- [ ] SessionManager integrado en rutas críticas.
- [ ] Middleware simplificado y validado.
- [ ] Pruebas E2E completas.
- [ ] Logs y alertas de auth habilitados.
- [ ] Plan de rollback probado.

Después de producción (48h):

- [ ] Monitoreo de `refresh_failed` y `forced_logout`.
- [ ] Validación de métricas de permanencia.
- [ ] Cierre de pendientes y lecciones aprendidas.

## 11. Recomendación final

La forma correcta y segura de lograr 12h de sesión es:

- Mantener JWT corto (seguridad).
- Gestionar continuidad por refresh server-side centralizado.
- Definir límites de sesión de 12h en Supabase Auth.
- Validar con pruebas E2E y observabilidad.

Esto resuelve el problema de raíz y evita parches frágiles.
