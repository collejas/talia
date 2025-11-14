## Plan · Agenda Responsiva en el Webchat

### 1. Propósito
- [ ] Habilitar un calendario mensual interactivo dentro del webchat para que Tal-IA ofrezca y confirme citas sin intervención humana.

### 2. Supuestos iniciales
- [ ] Disponibilidad centralizada en Supabase expuesta vía funciones RPC específicas para slots/holds/bookings.
- [ ] Widget del landing puede renderizar componentes shadcn/ui (ya sea vía Web Components o migración parcial a React).
- [ ] Prompt y herramientas de OpenAI se pueden actualizar para reintroducir `list_demo_slots` y `schedule_demo`.

### 3. Roadmap de alto nivel
1. **Diseño UX + Contracto técnico**
   - [ ] Definir mockups del calendario (navegación mensual, picker de día y lista de horarios).
   - [ ] Cerrar contrato JSON entre frontend ↔ backend ↔ OpenAI (estructura de `availability`, `slot_id`, `hold_id`).
2. **Infraestructura de disponibilidad (Supabase)**
   - [ ] Crear tablas `calendar_resources`, `calendar_availability_patterns`, `calendar_exceptions`, `calendar_slots_holds`, `calendar_bookings`.
   - [ ] Implementar RPC `fn_calendar_list_slots`, `fn_calendar_hold_slot`, `fn_calendar_confirm_slot`.
   - [ ] Sembrar recursos/slots demo para pruebas y generar nuevo backup.
3. **Backend FastAPI**
   - [ ] Endpoints REST `/api/webchat/calendar` (list, hold, confirm) con validaciones e integración Supabase.
   - [ ] Persistir selecciones y logging en `storage.register_webchat_message`.
   - [ ] Tests de integración para herramientas de agenda.
4. **Widget webchat (Landing)**
   - [ ] Montar componente shadcn/ui `CalendarSlotPicker` (mes + grid + horarios) y exponerlo como Web Component.
   - [ ] Integrar en `renderAvailabilityCalendar` incluyendo callbacks para holds y confirmaciones.
   - [ ] Manejar estados vacíos/errores y fallback a texto.
5. **Asistente / Prompt**
   - [ ] Actualizar `docs/prompt_landing.md` para reflejar el nuevo flujo (ofrecer calendario tras datos completos).
   - [ ] Reintroducir definiciones de `list_demo_slots` y `schedule_demo` en `docs/funciones_prompt_openai.md`.
   - [ ] Ajustar `_execute_function_call` para nuevos payloads y confirmaciones.
6. **Panel interno + Operación**
   - [ ] Nueva vista/reportes para citas confirmadas (`panel_calendar_bookings`) y UI en `frontend/panel`.
   - [ ] Reglas de notificación/email (ICS, recordatorios).
7. **QA & Lanzamiento**
   - [ ] Pruebas punta a punta (usuario dice “sí” → calendario → cita creada).
   - [ ] Validar zonas horarias, móviles y accesibilidad.
   - [ ] Documentar proceso de despliegue y monitoreo.

### 4. Métricas y checklist de validación
- [ ] % de conversaciones que ven el calendario vs. confirmaciones.
- [ ] Duración promedio del flujo de agendado.
- [ ] Errores por zona horaria o conflictos de slot (alertas en logs).
- [ ] Salud de colas/holds expirados.
