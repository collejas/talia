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
   - [x] Cerrar contrato JSON entre frontend ↔ backend ↔ OpenAI (estructura de `availability`, `slot_id`, `hold_id`).
2. **Infraestructura de disponibilidad (Supabase)**
   - [x] Crear tablas `calendar_resources`, `calendar_availability_patterns`, `calendar_exceptions`, `calendar_slots_holds`, `calendar_bookings`.
   - [x] Implementar RPC `fn_calendar_list_slots`, `fn_calendar_hold_slot`, `fn_calendar_confirm_slot`.
   - [x] Sembrar recursos/slots demo para pruebas y generar nuevo backup.
3. **Backend FastAPI**
   - [x] Endpoints REST `/api/webchat/calendar` (list, hold, confirm) con validaciones e integración Supabase.
   - [x] Persistir selecciones y logging en `storage.register_webchat_message`.
   - [x] Tests de integración para herramientas de agenda.
4. **Widget webchat (Landing)**
   - [ ] Montar interacción del calendario en el widget (navegación semanal + refresco desde API).
   - [ ] Integrar en `renderAvailabilityCalendar` incluyendo callbacks para holds y confirmaciones (pendiente componente shadcn/ui completo).
   - [ ] Manejar estados vacíos/errores y fallback a texto.
5. **Asistente / Prompt**
   - [x] Actualizar `docs/prompt_landing.md` para reflejar el nuevo flujo (ofrecer calendario tras datos completos).
   - [x] Reintroducir definiciones de `list_demo_slots` y `schedule_demo` en `docs/funciones_prompt_openai.md`.
   - [x] Ajustar `_execute_function_call` para nuevos payloads y confirmaciones.
6. **Panel interno + Operación**
   - [x] Nueva vista/reportes para citas confirmadas (`panel_calendar_bookings`) y UI en `frontend/panel`.
   - [x] Migrar panel a Supabase REST usando `panel_calendar_bookings` en lugar de `panel_agenda_demos`.
   - [ ] Reglas de notificación/email (ICS, recordatorios).
7. **Sincronización con embudo + notificaciones**
   - [x] Agregar `tarjeta_id` a `calendar_slot_holds` y `calendar_bookings` + migración de datos históricos (cuando existan).
   - [x] Actualizar `backend/app/channels/webchat/service.py` para resolver la tarjeta con `storage.ensure_lead_tarjeta` y enviarla al RPC `fn_calendar_confirm_slot`.
   - [x] Crear trigger `tg_calendar_booking_sync_stage` que mueva la tarjeta a etapa `demo` al confirmar y la regrese/registre movimiento al cancelar.
   - [x] Implementar helper de correo/ICS post-confirmación (`send_demo_invite`) que escriba `invite_status` y `message_id` en `calendar_bookings.metadata`.
   - [ ] Ajustar docs/prompt (`docs/prompt_landing.md`, `docs/funciones_prompt_openai.md`) para reflejar que el backend envía el correo con los datos confirmados.
   - [ ] Una vez verificado el flujo, emitir migración que archive/elimine `public.citas` y su enum asociado.
8. **QA & Lanzamiento**
   - [ ] Pruebas punta a punta (usuario dice “sí” → calendario → cita creada).
   - [ ] Validar zonas horarias, móviles y accesibilidad.
   - [ ] Documentar proceso de despliegue y monitoreo.

### 4. Métricas y checklist de validación
- [ ] % de conversaciones que ven el calendario vs. confirmaciones.
- [ ] Duración promedio del flujo de agendado.
- [ ] Errores por zona horaria o conflictos de slot (alertas en logs).
- [ ] Salud de colas/holds expirados.
