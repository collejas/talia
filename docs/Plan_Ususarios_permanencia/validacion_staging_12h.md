# Validación Staging - Sesión de 12 horas

Fecha: 2026-03-27 (UTC)

## 1) Configuración objetivo en Supabase Dashboard (staging)

Ruta:
- `Auth` -> `Sessions`

Valores:
- `JWT expiry`: `60 minutes`
- `Time-box user sessions`: `12 hours`
- `Inactivity timeout`: `12 hours`
- `Single session per user`: `OFF` (recomendado, salvo política contraria)

## 2) Confirmación de código aplicado

Estado actual del panel:
- `SessionManager` server-side activo: `src/lib/auth/server-session.ts`
- Endpoints API críticos migrados a refresh server-side automático.
- Solo quedan lecturas directas de cookie en:
  - `src/app/api/session/route.ts`
  - `src/app/api/auth/logout/route.ts`

Esto es intencional (flujo de sesión y cierre de sesión).

## 3) Prueba funcional mínima (15-20 min)

1. Iniciar sesión en staging.
2. Navegar por módulos que hagan llamadas API (`inbox`, `prospección`, `settings`).
3. Verificar que no hay redirecciones inesperadas a login/unauthorized.
4. Dejar la sesión abierta 65-75 minutos y volver a ejecutar acciones.
5. Resultado esperado: sesión sigue activa por refresh automático, sin relogin.

## 4) Prueba de permanencia (12 horas)

1. Iniciar sesión y registrar hora exacta UTC (ejemplo: `2026-03-27 22:30 UTC`).
2. Mantener actividad periódica (cada 20-40 min) en rutas protegidas.
3. Verificar que la sesión no se corta antes de `+12h`.
4. Al acercarse a las 12h, validar que sí exige reautenticación (time-box).

## 5) Evidencia técnica (MCP SQL)

Consulta A: logins recientes
```sql
select now() as now_utc,
       created_at,
       payload->>'action' as action,
       payload->>'actor_username' as actor_username
from auth.audit_log_entries
where payload->>'action' = 'login'
order by created_at desc
limit 30;
```

Consulta B: intervalos entre logins
```sql
with logins as (
  select created_at
  from auth.audit_log_entries
  where payload->>'action' = 'login'
  order by created_at desc
  limit 60
)
select created_at,
       lag(created_at) over (order by created_at) as prev_login,
       round(extract(epoch from (created_at - lag(created_at) over (order by created_at))) / 3600.0, 2) as hours_since_prev
from logins
order by created_at desc
limit 30;
```

Criterio esperado:
- Desaparece patrón frecuente de relogin ~1h en uso normal.
- Solo hay login al inicio, eventos de refresh transparentes y relogin al terminar política de sesión (12h).

## 6) Criterio de aceptación

- No hay logout inesperado dentro de ventana de trabajo normal.
- Refresh automático ocurre sin fricción en navegación.
- La sesión termina de forma consistente al límite configurado de 12h.
- No aparecen bucles `unauthorized`/`login`.
