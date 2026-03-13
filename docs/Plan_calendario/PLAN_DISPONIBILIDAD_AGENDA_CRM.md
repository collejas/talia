# Plan de desarrollo: CRUD de disponibilidad en Agenda (panel)

## 1) Objetivo
Habilitar administración operativa de disponibilidad de agenda desde el panel, con dos niveles:
- Ajustes rápidos desde `agenda/` (modal).
- Administración completa en una vista dedicada `agenda/disponibilidad`.

Resultado esperado:
- El equipo puede crear, editar y eliminar disponibilidad sin tocar SQL.
- Menor dependencia técnica para operar demos, horarios y bloqueos.
- Consistencia entre lo que se configura y lo que ve el cliente en `demo.html`.

## 2) Recomendación de UX
## 2.1 En `agenda/`
Agregar botón: `Configurar disponibilidad`.
Al hacer clic, abrir modal con acciones rápidas:
- `Bloquear rango` (vacaciones, festivos, ocupación).
- `Abrir horario extra` (ventana adicional puntual).
- `Editar recurso` (slot, buffer, capacidad, días visibles).
- `Abrir administrador avanzado` (navega a `agenda/disponibilidad`).

## 2.2 En `agenda/disponibilidad`
Vista dedicada con tabs:
1. `Patrones semanales`
- CRUD de reglas recurrentes por día de semana.
- Soporte de fechas de vigencia (start/end).

2. `Excepciones`
- CRUD de bloques (`kind='block'`) y extras (`kind='extra'`).
- Filtro por rango de fechas.

3. `Recurso`
- Parámetros del recurso (`slot_minutes`, `buffer_minutes`, `capacity_per_slot`, `max_days_visible`, `timezone`).

4. `Preview`
- Calendario de validación (simulación visual de slots resultantes).

## 3) Alcance funcional MVP (fase 1)
Incluye:
- Botón en `agenda/` para abrir modal.
- Modal con creación rápida de excepción `block` y `extra`.
- Vista `agenda/disponibilidad` con listado + alta/edición/baja de excepciones.
- Ajuste de `max_days_visible` del recurso desde UI.

No incluye (fases siguientes):
- Editor visual avanzado de patrones con drag-and-drop.
- Plantillas de horarios por temporada.
- Versionado/auditoría avanzada de cambios.

## 4) Modelo de datos a usar (ya existente)
Tablas principales:
- `public.calendar_resources`
- `public.calendar_availability_patterns`
- `public.calendar_exceptions`
- `public.calendar_slot_holds`
- `public.calendar_bookings`

Campos clave para operaciones:
- `calendar_resources.max_days_visible`
- `calendar_resources.slot_minutes`
- `calendar_resources.buffer_minutes`
- `calendar_resources.capacity_per_slot`
- `calendar_exceptions.kind` (`block`/`extra`)
- `calendar_exceptions.start_at`, `end_at`, `capacity`
- `calendar_availability_patterns.weekday`, `start_time`, `end_time`, `capacity`, `start_date`, `end_date`

## 5) Backend/API propuesto
Base path sugerido: `/crm/agenda/disponibilidad`

Endpoints fase 1:
1. `GET /resources`
- Lista recursos activos del tenant.

2. `PATCH /resources/{resource_id}`
- Actualiza `slot_minutes`, `buffer_minutes`, `capacity_per_slot`, `max_days_visible`, `timezone`.

3. `GET /exceptions`
- Lista excepciones por rango (`from`, `to`, `kind`).

4. `POST /exceptions`
- Crea excepción `block` o `extra`.

5. `PATCH /exceptions/{exception_id}`
- Edita excepción.

6. `DELETE /exceptions/{exception_id}`
- Elimina excepción.

Endpoints fase 2:
7. `GET /patterns`
8. `POST /patterns`
9. `PATCH /patterns/{pattern_id}`
10. `DELETE /patterns/{pattern_id}`

Reglas técnicas:
- Scope obligatorio por `organizacion_id`.
- Validar solapes y rangos inválidos.
- Responder errores claros (`range_invalid`, `resource_not_found`, `overlap_conflict`).

## 6) Frontend propuesto
## 6.1 `agenda/` (modal rápido)
Componente: `AgendaDisponibilidadQuickModal`
Funciones:
- Crear bloqueo rápido.
- Crear horario extra rápido.
- Cambiar `max_days_visible`.
- Link a `agenda/disponibilidad`.

## 6.2 `agenda/disponibilidad`
Componente principal: `AgendaDisponibilidadPage`
Secciones:
- Filtros de rango.
- Tabla de excepciones con acciones.
- Formulario de alta/edición en drawer/modal.
- Tarjeta de configuración del recurso.
- Panel de preview.

## 7) Seguridad y permisos
Permisos sugeridos:
- `agenda.view` para lectura.
- `agenda.manage` para crear/editar/eliminar disponibilidad.

Política:
- Usuarios sin `agenda.manage` solo lectura.
- Toda mutación valida tenant scope.

## 8) Plan por fases
## Fase 1 (rápida, alto impacto)
- Botón en `agenda/` + modal rápido.
- CRUD de excepciones.
- Ajuste de `max_days_visible`.
- Pruebas básicas end-to-end con `demo.html`.

## Fase 2 (completa)
- CRUD de patrones semanales.
- Preview más detallado por semana.
- Mejoras de UX (copiar horario, duplicar regla).

## Fase 3 (operación avanzada)
- Auditoría de cambios de disponibilidad.
- Plantillas de disponibilidad por temporada.
- Validaciones anti-conflicto más estrictas.

## 9) Criterios de aceptación
1. Desde `agenda/` se puede crear un bloqueo y se refleja en disponibilidad pública.
2. Se puede crear un horario extra y aparece en `demo.html`.
3. Se puede modificar `max_days_visible` desde UI y afecta el rango de disponibilidad.
4. No hay fugas entre tenants.
5. Errores de validación se muestran de forma comprensible al usuario.

## 10) Riesgos y mitigaciones
1. Complejidad de reglas recurrentes.
- Mitigación: sacar patterns a fase 2, empezar por excepciones.

2. Conflictos por zonas horarias.
- Mitigación: normalizar UTC en backend y mostrar timezone explícita en UI.

3. Cambios accidentales de operación.
- Mitigación: confirmación para acciones destructivas + resumen antes de guardar.

## 11) Orden de implementación recomendado
1. Backend CRUD de excepciones + update de recurso.
2. Modal rápido en `agenda/`.
3. Vista dedicada `agenda/disponibilidad` (excepciones + recurso).
4. Integración con preview.
5. Fase 2 con patterns.

## 12) Definición de éxito
El equipo comercial/operativo puede ajustar disponibilidad sin soporte técnico y ver el efecto inmediato en la agenda pública de clientes.
