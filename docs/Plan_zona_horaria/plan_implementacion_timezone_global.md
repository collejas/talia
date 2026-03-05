# Plan Integral: Zona Horaria Global (Usuario -> Organización -> Detección Inicial)

## 1) Objetivo
Unificar toda la app para que filtros, reportes y visualización de fechas usen una sola política de zona horaria, con este orden de prioridad:

1. `timezone` del usuario (si existe)
2. `timezone` de la organización
3. `timezone` detectada del navegador (solo inicial)
4. fallback técnico (`America/Mexico_City` o `UTC`, definido por sistema)

Además:
- Configuración de organización en `settings/variables`.
- Configuración de usuario (empleado) en `settings/usuarios`.
- Mantener latencia baja en toda la resolución de timezone y filtros de fecha, evitando degradar tiempos de respuesta de la app.

---

## 2) Estado actual (resumen)
Hoy existen comportamientos mixtos:
- Módulos que ya convierten día local -> UTC usando `webchat_calendar_timezone`.
- Módulos que interpretan fechas directo en UTC.
- Pantallas con filtro de fecha solo cliente.

Ejemplos detectados:
- `mapa-de-conversion`: ya corregido para usar timezone configurada en backend.
- `prospeccion/prospectos`: ya convierte día local -> UTC en repositorio.
- `prospeccion/metricas`: actualmente usa UTC directo.
- `oportunidades`: filtra fechas sin normalización por timezone de usuario/org.
- `inbox`: filtro de fecha “hoy/ayer/última semana/mes” se aplica en frontend.
- `embudo`: usa ventana `days` sobre `now()` UTC (sin timezone de usuario explícita).

---

## 3) Decisión de arquitectura

### 3.1 Fuente de verdad
- Persistir timezone por usuario en `public.usuarios`.
- Persistir timezone por organización en `public.organizaciones.config` (ruta canónica: `webchat.calendar.timezone`, ya usada en settings/variables).

### 3.2 Resolver único
Crear un resolver central (backend) para obtener timezone efectiva:
- Entrada: `user_id`, `organizacion_id`, hint opcional.
- Salida: `effective_timezone` y `source` (`user|organization|default`).

Regla:
- Si usuario tiene timezone válida, usarla.
- Si no, tomar organización.
- Si no, fallback global.

### 3.3 Política de fechas
- **Persistencia**: siempre UTC (`timestamptz`).
- **Filtros por día (`YYYY-MM-DD`)**: interpretar en timezone efectiva y convertir a UTC.
- **Presets (`hoy`, `ayer`, `semana`, etc.)**: calcular límites en timezone efectiva.
- **Render**: frontend formatea con timezone efectiva (no con suposiciones UTC).

### 3.4 Política de performance (latencia)
- El resolver de timezone debe ser O(1) por request, sin joins pesados ni múltiples llamadas remotas.
- Priorizar lectura de timezone desde datos ya disponibles en contexto/autenticación; evitar consultas repetidas.
- Cuando sea necesario consultar DB, hacerlo una sola vez por request y reutilizar en todo el flujo.
- Definir presupuesto objetivo:
  - overhead p50 <= 2 ms
  - overhead p95 <= 10 ms
- Cualquier cambio que exceda esos umbrales requiere optimización antes de rollout global.

---

## 4) Cambios de datos (DB)

## 4.1 Usuario
Agregar columna (si no existe):
- `public.usuarios.timezone text null`

Validación recomendada:
- Permitir solo IANA TZ válidas (ej. `America/Mexico_City`, `Europe/Madrid`).
- Opcional: constraint o validación en capa API.

### 4.2 Índices / impacto
- No requiere índice para consultas funcionales básicas.
- Si se reporta por timezone, evaluar índice parcial posteriormente.

### 4.3 Backfill
- Inicialmente `null` para usuarios existentes.
- No forzar actualización masiva al inicio.

---

## 5) Backend: refactor unificado

## 5.1 Nuevo módulo común
Crear utilitario, por ejemplo:
- `backend/app/services/timezone_resolver.py`

Funciones base:
- `resolve_effective_timezone(usuario_id, organizacion_id) -> str`
- `to_utc_range_for_local_dates(date_from, date_to, tz) -> (from_utc, to_utc_exclusive)`
- `resolve_preset_range(preset, tz, now_utc)`

## 5.2 Reemplazo progresivo de lógica dispersa
Buscar y migrar patrones actuales:
- `datetime.combine(..., tzinfo=timezone.utc)` para filtros de día.
- cálculos `now = datetime.now(timezone.utc)` usados para “hoy/ayer” en reportes.
- conversiones manuales duplicadas con `settings.webchat_calendar_timezone`.

Objetivo: todo endpoint de reportes/filtros llama al resolver único.

## 5.3 Endpoints prioritarios (fase 1)
1. `/crm/prospeccion/metricas`
2. `/crm/oportunidades`
3. `/crm/pipeline/scoring/kpis` (si aplica `days` por día local de negocio)
4. `/crm/inbox/threads` (si se decide llevar filtro fecha al backend)
5. Cualquier endpoint con `rango|desde|hasta|date_from|date_to|creado_desde|creado_hasta`

## 5.4 Logging de observabilidad
Agregar en respuestas o logs internos:
- `effective_timezone`
- `timezone_source`
- `range_from_utc`, `range_to_utc`

Esto facilita auditoría de diferencias de fechas.

## 5.5 Estrategia de baja latencia
- Implementar caché corta en memoria por `(organizacion_id, usuario_id)` para timezone efectiva (TTL corto, p.ej. 5-15 min).
- Invalidar caché al actualizar timezone de usuario u organización.
- Evitar transformar fechas múltiples veces en el mismo request; calcular una vez y reutilizar.
- Mantener queries index-friendly (comparar contra columnas UTC con rangos `>= from_utc` y `< to_utc_exclusive`).

---

## 6) Frontend: comportamiento consistente

## 6.1 Contexto global de timezone
Crear proveedor (ej. `TimezoneProvider`) con:
- `effectiveTimezone`
- `source`
- helper `formatDateTime(value, tz)`

## 6.2 Inputs de fecha
- Mantener `type="date"` para UX.
- Siempre enviar `YYYY-MM-DD` (sin hora).
- Backend convierte a UTC usando timezone efectiva.

## 6.3 Filtros hoy/ayer/semana/mes
- Mantener presets en UI.
- El cálculo definitivo del rango se hace en backend (no depender solo de navegador).

## 6.4 Inbox
Hoy el filtro fecha es local en cliente. Estandarizar:
- Opción recomendada: mover filtro fecha al backend para consistencia multi-dispositivo.
- Si temporalmente sigue en cliente, usar `effectiveTimezone` y no `new Date()` implícito.

---

## 7) Settings: dónde configurar

## 7.1 `settings/variables` (organización)
Usar y formalizar campo existente:
- `webchat.calendar.timezone`

Acciones:
- Validar IANA timezone.
- Mostrar ayuda: “Timezone por defecto para usuarios sin timezone personalizada”.

## 7.2 `settings/usuarios` (usuario)
Agregar campo editable por usuario:
- `timezone`

UI sugerida:
- Select searchable de zonas IANA frecuentes + input libre validado.
- Botón “Usar zona detectada de mi navegador”.
- Mostrar ejemplo de hora actual en esa zona.

Backend acciones (`settings/hr/actions.ts`):
- Extender `createUserAction` y `updateUserAction` para leer/escribir `timezone` en `public.usuarios`.
- Extender types de directorio (`HrUserItem`) para exponer `timezone`.

---

## 8) Detección automática de navegador (solo inicial)

Regla funcional:
- Detectar en frontend con `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Guardar **solo una vez** cuando el usuario no tenga timezone asignada.
- No sobreescribir automáticamente después (evita cambios inesperados por VPN/travel).

Puntos de implementación:
- Al login o al montar app shell:
  - pedir perfil usuario.
  - si `timezone` null y detección válida -> enviar patch a perfil.

---

## 9) Compatibilidad y migración

## 9.1 Estrategia sin corte
1. Agregar columna `usuarios.timezone`.
2. Publicar resolver backend sin activar en todos los endpoints.
3. Migrar endpoints por lotes detrás de feature flag (`features.timezone_unified`).
4. Activar por organización piloto.
5. Rollout global.

## 9.2 Feature flags
En `organizaciones.config.features`:
- `timezone_unified_filters: boolean`
- `timezone_backend_inbox: boolean` (si inbox se migra a backend)

---

## 10) Plan de ejecución por fases

## Fase 0: Inventario y contrato
- Catalogar todos los endpoints con filtros de fecha.
- Definir contrato único de respuesta opcional (`effective_timezone`, `timezone_source`).
- Acordar fallback final del sistema.

## Fase 1: Fundaciones
- Migración DB `usuarios.timezone`.
- Resolver backend central + utilidades de rango local->UTC.
- Pruebas unitarias de conversiones (DST, límites de día, timezone inválida).
- Benchmark base y benchmark post-cambio para validar overhead de latencia.

## Fase 2: Settings
- `settings/variables`: validación fuerte de timezone org.
- `settings/usuarios`: campo timezone usuario + acciones CRUD.
- Guardado inicial automático desde navegador para usuarios sin timezone.

## Fase 3: Refactor reportes/filtros
- Migrar primero `prospeccion/metricas`, `oportunidades`, `embudo`.
- Revisar `inbox` y decidir backend filtering vs client filtering con timezone efectiva.
- Unificar serialización de rangos en logs/respuestas.

## Fase 4: QA + rollout
- QA por organización piloto en 2-3 timezones.
- Comparativas antes/después (mismos filtros, resultados esperados).
- Activación gradual y monitoreo.

---

## 11) Pruebas obligatorias

## 11.1 Unitarias
- Conversión `YYYY-MM-DD` local a UTC (from inclusive / to exclusive).
- Presets `hoy/ayer/semana/mes` en distintas zonas.
- Manejo de timezone inválida (fallback controlado).

## 11.2 Integración
- Endpoint con `date_from/date_to` devuelve mismos registros que query SQL esperada.
- Validar prioridad usuario > organización > fallback.

## 11.3 E2E
- Usuario A (`America/Mexico_City`) y Usuario B (`Europe/Madrid`) con mismos datos UTC:
  - ven totales correctos para “Hoy” según su día local.
- Cambio de timezone en settings/usuarios impacta inmediatamente en filtros.

## 11.4 Performance
- Medir p50/p95 de endpoints críticos antes/después del refactor.
- Verificar que el overhead adicional por resolver timezone se mantenga dentro de presupuesto.
- Prueba de carga básica en vistas con filtros de fecha (mapa, métricas, oportunidades, embudo, inbox).

---

## 12) Criterios de aceptación (Definition of Done)
- Todas las vistas con filtros de fecha usan resolver unificado.
- No hay endpoints activos con interpretación mixta UTC/local para `YYYY-MM-DD`.
- `settings/variables` controla timezone default de organización.
- `settings/usuarios` controla timezone individual.
- Detección de navegador solo aplica cuando usuario no tiene timezone.
- Observabilidad disponible (`effective_timezone`, `source`, rangos UTC).
- Overhead de latencia validado dentro de presupuesto (p50/p95) en endpoints críticos.

---

## 13) Riesgos y mitigaciones
- Riesgo: cambios de totales “aparentes” por corrección de límites.
  - Mitigación: comunicar cambio y mostrar timezone efectiva en UI.

- Riesgo: zonas inválidas cargadas manualmente.
  - Mitigación: validación IANA en frontend y backend.

- Riesgo: inconsistencias temporales durante rollout.
  - Mitigación: feature flag por organización y migración por fases.

---

## 14) Entregables
1. Migración SQL (`usuarios.timezone`).
2. Resolver timezone backend + utilidades fecha.
3. Refactor endpoints priorizados.
4. UI/acciones de `settings/variables` y `settings/usuarios`.
5. Detección inicial de navegador y guardado one-time.
6. Suite de pruebas y checklist de QA.
7. Runbook de rollout + rollback por feature flag.
