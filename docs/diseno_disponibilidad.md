## Diseño propuesto de disponibilidad real para demos

### 1. Objetivos
- Representar horarios laborales recurrentes, excepciones y bloqueos manuales con granularidad por asesor/calendario.
- Calcular slots disponibles sin empalmes considerando:
  - Citas registradas en `public.citas`.
  - Eventos bloqueados provenientes del proveedor CalDAV.
  - Reglas de negocio (duración estándar, buffers, zona horaria).
- Exponer la disponibilidad mediante funciones SQL seguras (RLS) para que el backend y Tal-IA consuman un calendario real.

---

### 2. Esquema de tablas

#### 2.1 `agenda_calendarios`
- **Propósito**: catálogo de calendarios o recursos (ej. agenda de Tal-IA, vendedores, salas).
- **Campos sugeridos**:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
  - `nombre text NOT NULL`.
  - `descripcion text`.
  - `owner_usuario_id uuid` (relación con `public.usuarios` para permisos).
  - `provider text NOT NULL DEFAULT 'caldav'` (match con `public.citas.provider`).
  - `provider_calendar_id text` (identificador en el proveedor externo).
  - `timezone text NOT NULL DEFAULT 'America/Mexico_City'`.
  - `capacidad smallint DEFAULT 1` (slots concurrentes permitidos).
  - `metadata jsonb NOT NULL DEFAULT '{}'`.
  - `activo boolean NOT NULL DEFAULT true`.
  - Fechas de auditoría `creado_en`, `actualizado_en`.
- **Relaciones**:
  - FK opcional a `public.usuarios` (`owner_usuario_id`).
  - Unique `(provider, provider_calendar_id)` para evitar duplicados.

#### 2.2 `agenda_disponibilidad`
- **Propósito**: definir bloques recurrentes de disponibilidad para cada calendario.
- **Campos**:
  - `id uuid PRIMARY KEY`.
  - `calendario_id uuid REFERENCES agenda_calendarios(id) ON DELETE CASCADE`.
  - `weekday smallint NOT NULL` (0 = lunes … 6 = domingo).
  - `start_time time NOT NULL`.
  - `end_time time NOT NULL`.
  - `capacidad smallint DEFAULT 1` (si admite slots simultáneos dentro del bloque).
  - `metadata jsonb NOT NULL DEFAULT '{}'`.
  - `activo boolean NOT NULL DEFAULT true`.
  - Auditoría `creado_en`, `actualizado_en`.
- **Validaciones**:
  - Constraint `CHECK (end_time > start_time)`.
  - Índice `UNIQUE(calendario_id, weekday, start_time, end_time)` para evitar duplicados exactos.

#### 2.3 `agenda_excepciones`
- **Propósito**: representar días especiales (feriados, mantenimiento, horarios extendidos).
- **Campos**:
  - `id uuid PRIMARY KEY`.
  - `calendario_id uuid REFERENCES agenda_calendarios(id) ON DELETE CASCADE`.
  - `fecha date NOT NULL`.
  - `tipo text NOT NULL` (`'cerrado'`, `'especial'`, `'bloqueo'`, `'abierto_extra'`).
  - `start_time time` / `end_time time` (para horarios parciales).
  - `descripcion text`.
  - `metadata jsonb NOT NULL DEFAULT '{}'`.
  - `creado_en`, `actualizado_en`.
- **Validaciones**:
  - Si `tipo = 'cerrado'`, `start_time`/`end_time` pueden ser nulos.
  - Si `start_time`/`end_time` existen, `end_time > start_time`.
  - Índice `UNIQUE(calendario_id, fecha, tipo, start_time, end_time)`.

#### 2.4 `agenda_bloqueos`
- **Propósito**: bloqueos ad-hoc (reuniones internas, vacaciones, eventos externos sincronizados).
- **Campos**:
  - `id uuid PRIMARY KEY`.
  - `calendario_id uuid REFERENCES agenda_calendarios(id) ON DELETE CASCADE`.
  - `range tstzrange NOT NULL`.
  - `origen text` (`'manual'`, `'caldav'`, `'google'`, `'api'`).
  - `descripcion text`.
  - `metadata jsonb NOT NULL DEFAULT '{}'`.
- **Validaciones**:
  - Constraint `CHECK (lower(range) < upper(range))`.
  - Índice `gist(range)` para consultas de traslapes.
  - Índice compuesto `(calendario_id, range)` para filtros rápidos.

#### 2.5 Ajustes en `public.citas`
- Agregar columna `calendario_id uuid` (FK a `agenda_calendarios`) para asociar explícitamente la cita con un recurso.
- Constraint para garantizar que `provider` y `calendario_id` correspondan (por ejemplo, `provider_calendar_id` debe coincidir con la definición en `agenda_calendarios`).
- `EXCLUDE USING gist` opcional sobre `(calendario_id WITH =, tstzrange(start_at, end_at) WITH &&)` cuando `estado` ∈ activos, respetando `capacidad`.

---

### 3. Índices y constraints propuestos
- `agenda_calendarios`:
  - `UNIQUE(provider, provider_calendar_id)` (nullable-safe).
  - `INDEX(owner_usuario_id)`.
- `agenda_disponibilidad`:
  - `UNIQUE(calendario_id, weekday, start_time, end_time, activo)` opcional.
  - `INDEX(calendario_id, weekday)`.
- `agenda_excepciones`:
  - `INDEX(calendario_id, fecha)`.
- `agenda_bloqueos`:
  - `INDEX(calendario_id, range)` (btree + gist).
  - `INDEX(origen)`.
- `public.citas`:
  - `EXCLUDE` para evitar traslapes (cuando `capacidad = 1`).
  - Índices existentes (`citas_estado_idx`, `citas_start_idx`) se mantienen.

---

### 4. Políticas RLS sugeridas
- `agenda_calendarios`:
  - Lectura: roles `service_role`, `authenticated` (solo calendarios activos).
  - Escritura: restringir a administradores o supuestos “owners”.
- `agenda_disponibilidad` y `agenda_excepciones`:
  - Lectura para todos los que puedan ver el calendario.
  - Escritura solo para `service_role` o usuarios con permiso específico.
- `agenda_bloqueos`:
  - Lectura: permitir al orquestador IA y panel.
  - Inserción/actualización: IA solo puede crear bloqueos `origen='caldav'` (sin editar otros).
- `public.citas`:
  - Ajustar políticas existentes para permitir lectura combinada con `calendario_id`.

---

### 5. Función `public.fn_agenda_slots_disponibles`

**Firma implementada (`supabase/migrations/20260105_090000_agenda_disponibilidad.sql`)**
```sql
CREATE FUNCTION public.fn_agenda_slots_disponibles(
    p_conversacion_id uuid,
    p_fecha_inicio date,
    p_fecha_fin date,
    p_calendario_id uuid DEFAULT NULL,
    p_slot_minutes integer DEFAULT 45,
    p_buffer_minutes integer DEFAULT 15,
    p_timezone text DEFAULT NULL,
    p_max_slots integer DEFAULT 100,
    p_exclude_cita_id uuid DEFAULT NULL
) RETURNS TABLE (
    calendario_id uuid,
    start_at timestamptz,
    end_at timestamptz,
    timezone text,
    capacidad integer,
    source text,
    metadata jsonb
);
```

> Para mantener compatibilidad, también se crea un wrapper con la firma anterior (sin `p_calendario_id`) que simplemente delega al cuerpo principal usando `NULL`.

**Lógica principal**
1. Validar inputs (`fecha_fin >= fecha_inicio`, duraciones positivas). `p_conversacion_id` queda reservado por si se requiere auditoría o RLS personalizada.
2. Obtener bloques de `agenda_disponibilidad` por día hábil.
3. Aplicar excepciones (`agenda_excepciones`):
   - Si `tipo='cerrado'`, omitir el día completo.
   - Si hay horarios especiales, reemplazar el bloque original.
4. Construir slots con `generate_series` respetando `p_slot_minutes`.
5. Excluir slots ocupados por:
   - Citas activas en `public.citas` (`estado` ∈ activos, `calendario_id` coincidente).
   - Bloqueos en `agenda_bloqueos` (`range && slot`).
   - Eventos del proveedor externo (sincronizados a `agenda_bloqueos` o consultados en tiempo real).
   - Parámetro `p_exclude_cita_id` permite ignorar una cita específica (usado al reprogramar).
6. Ajustar respuesta:
   - Devolver `metadata` con etiquetas (`weekday`, `label`, `local_date`).
   - Incluir `source='calculated'` o `source='special'`.
7. Ordenar por `start_at` y limitar a `p_max_slots`.

**Consideraciones adicionales**
- Permitir `p_calendario_id = NULL` para usar un calendario default (ej. Tal-IA).
- Incorporar `capacidad` > 1: si la agenda permite dos slots simultáneos, la función debe contar cuántas citas existen y devolver el slot mientras haya cupo.

---

### 6. Wrappers para operaciones de cita

#### 6.1 `public.fn_cita_schedule`
- Ya implementada (`supabase/migrations/20260105_090000_agenda_disponibilidad.sql`).
- Firma: `(p_tarjeta_id uuid, p_contacto_id uuid, p_conversacion_id uuid, p_start_at timestamptz, p_calendario_id uuid DEFAULT NULL, ...)`.
- Valida disponibilidad llamando `fn_agenda_slots_disponibles` para el día/slot exacto.
- Usa `fn_cita_upsert` y actualiza `public.citas.calendario_id`; por defecto `scheduled_via = 'ia'`.
- Propaga errores claros (`slot_not_available`, `provider_invalid`, etc.).
- Se mantiene un wrapper con la firma anterior (calendario como primer parámetro) para compatibilidad.

#### 6.2 `public.fn_cita_reschedule`
- Implementada en la misma migración.
- Recupera la cita, valida el nuevo slot excluyendo la propia cita (`p_exclude_cita_id`).
- Delegada a `fn_cita_upsert` para consolidar cambios manteniendo metadata y recordatorios.

#### 6.3 `public.fn_cita_cancel`
- Limpiar bloqueo asociado si la cita fue creada por Tal-IA.
- Integrar con `sync_cita_after_cancel` para eliminar evento en CalDAV cuando aplique.

---

### 7. Integración con CalDAV
- Crear worker/tarea que sincronice eventos externos → `agenda_bloqueos` (mismo `provider_event_id`).
- Cuando la IA agenda una cita:
  1. Llama a `fn_cita_schedule`.
  2. El backend genera evento CalDAV y guarda UID/Etag.
  3. Se inserta bloqueo con `metadata` (`caldav_uid`, `etag`).
- Para eventos creados manualmente en CalDAV:
  - La sincronización detecta el nuevo evento y crea un bloqueo (sin cita asociada).
  - La función de slots lo tratará como ocupado.

---

### 8. Próximos pasos
1. Implementar migración SQL con las tablas y constraints anteriores.
2. Construir `fn_agenda_slots_disponibles` con pruebas unitarias (datos ficticios).
3. Ajustar `compute_demo_availability` en el backend para utilizar la nueva función.
4. Actualizar `schedule_demo` en el backend para usar `fn_cita_schedule`.
5. Ajustar prompts/funciones (`docs/funciones_prompt_openai.md`) y frontend para consumir los datos enriquecidos (calendario mensual).
6. Probar flujo end-to-end con datos de desarrollo antes de mover a producción.

---

### 9. Migración de referencia
- Archivo: `supabase/migrations/20260105_090000_agenda_disponibilidad.sql`.
- Contenido:
  - Crea `agenda_calendarios`, `agenda_disponibilidad`, `agenda_excepciones`, `agenda_bloqueos` con índices y triggers de `tg_touch_updated_at`.
  - Añade columna `calendario_id` a `public.citas`, índice filtrado y constraint `citas_calendario_range_excl` (requiere `btree_gist`).
  - Define función `public.cita_slot_range(start_at, end_at)` marcada `IMMUTABLE` para apoyar el constraint de exclusión.
  - Implementa `fn_agenda_slots_disponibles`, `fn_cita_schedule` y `fn_cita_reschedule`.
- Pasos sugeridos de despliegue:
  1. Ejecutar migración en staging y poblar registros de ejemplo.
  2. Verificar que `EXCLUDE` evita empalmes con pruebas concurrentes.
  3. Poblar `agenda_calendarios` con el calendario principal (`provider='caldav'`, URL actual).
  4. Asociar citas existentes a `calendario_id` antes de activar constraint en producción (si aplica).

### 10. Seed de ejemplo
- Archivo: `supabase/seeds/agenda_calendarios_seed.sql`.
- Inserta:
  - Calendario principal (`uuid 00000000-0000-4000-8000-000000000001`, provider `caldav`).
  - Bloques de disponibilidad lunes-viernes 09:00–18:00.
- Uso recomendado:
  1. `psql "$SUPABASE_DATABASE_URL" -f supabase/seeds/agenda_calendarios_seed.sql`.
  2. Confirmar con `SELECT * FROM public.agenda_calendarios` y `public.agenda_disponibilidad`.
  3. Para rollback, `DELETE FROM public.agenda_disponibilidad WHERE calendario_id = '00000000-0000-4000-8000-000000000001'; DELETE FROM public.agenda_calendarios WHERE id = '00000000-0000-4000-8000-000000000001';`.
