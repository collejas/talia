# Plan · Interacción avanzada en el embudo

## Objetivo

Permitir a los usuarios:

1. Abrir cualquier tarjeta del embudo para consultar y editar su información.
2. Actualizar campos clave (monto, probabilidad, asignado, notas, etc.) desde un formulario unificado.
3. Arrastrar tarjetas (a partir de “Precalificado”) para moverlas entre etapas, registrando la transición en Supabase.

## Arquitectura & stack

- **Frontend**: Next.js 14 (app router), shadcn/ui (Radix), TailwindCSS.
- **Backend**: Supabase (Postgres + RPC), server actions Next 14.
- **Estado/AJAX**: server actions con invalidación (`revalidateTag`), optimist updates.
- **Drag & drop**: `@dnd-kit/core`.

## Fases

### 1. Análisis & diseño
- Identificar campos editables (`lead_tarjetas`, `contactos`, campos calculados).
- Definir reglas de movimiento (permitir avanzar/retroceder, restricciones por etapa).
- Mapear RPC existentes y las nuevas que se requieren.

### 2. Backend / Supabase ✅
- Crear RPC `panel_lead_update` (SQL) o server action que actualice los campos editables (tarjetas/contactos). **(Listo)**  
  ↳ `20251203_102500_panel_lead_actions.sql` define `panel_lead_update` y `panel_lead_move`, con permisos agregados en `20251203_103500_panel_lead_permissions.sql`.
- Crear RPC `panel_lead_move`:
  - Actualiza `lead_tarjetas.etapa_id`. ✔️
  - Inserta registro en `lead_movimientos`. ✔️
  - Devuelve la tarjeta actualizada (etapa, orden, categoría, timestamps). ✔️
- Escribir migraciones y pruebas asociadas. ✔️ (Migraciones listas en repo; **pendiente ejecutar en Supabase** `20251203_110000_panel_lead_move_fix.sql` y `20251203_112000_citas_provider_expand.sql` para habilitar `provider = 'caldav'` y el nuevo retorno de `panel_lead_move`)

### 3. Frontend – datos compartidos ✅
- Extender `loadEmbudoData` para traer `etapa_orden` y cualquier atributo adicional requerido por el Drawer. ✔️ (`EmbudoStage` incluye `orden`).
- Utilizar server actions con invalidación (`revalidateTag('embudo', 'default')`) para mantener sincronizado el embudo tras cada acción. ✔️  
  ↳ `updateLeadCard` y `moveLeadCard` consumen las RPC y normalizan la respuesta.

### 4. Drawer de detalle (`LeadDrawer`)
- Implementar `LeadDrawer` con shadcn/ui (`Drawer`/`Dialog` según viewport). ✅
- Capturar datos del lead (nombre, correo, teléfono, monto, probabilidad) y guardarlos vía `panel_lead_update`. ✅
- Tabs con Radix: “Resumen”, “Notas”, “Historial”.
- Formulario con React Hook Form + zod.
- Server action `updateLead` → llama RPC y devuelve la tarjeta actualizada.
- Toasts de feedback (éxito/error).
  ↳ **Extensión implementada**: secciones cronológicas para etapas futuras leyendo `metadatos.drawer_prep`; capturan y persisten `metadata.stage_prep` desde el Drawer (ver “Próximas etapas”).

### 5. Drag & drop ✅
- Integrar `@dnd-kit/core` en `EmbudoBoard`. ✔️
- Habilitar drag solo en columnas con `orden ≥ 2`. ✔️
- Destacar columnas válidas cuando una tarjeta está en drag. ✔️
- Server action `moveLead`:
  - Invoca `panel_lead_move`. ✔️
  - Actualiza estado local (optimist update) y revierte ante error. ✔️
- Validaciones: bloquear drops en etapas no permitidas y mostrar feedback al usuario. ✔️
  ↳ **Pendiente ejecutar** `20251204_090000_panel_lead_move_type_fix.sql` y `20251204_110000_panel_stage_drawer_prep.sql` en Supabase.

### 6. Historial & notas
- Mostrar en el Drawer una lista de movimientos (`lead_movimientos`) y notas.
- Cargar datos lazy al abrir el Drawer (RPC dedicada).
- Botón para agregar nota/comentario (Nuevo registro en `lead_movimientos.metadata`).

### 7. QA & UX
- Pruebas manuales: abrir → editar → guardar → mover → revertir.
- Validar integridad en Supabase (registros y movimientos).
- Revisar accesibilidad (enfoque, drag con teclado).
- Documentar flujos y comandos (`README`/`docs`).

### 8. Deploy
- Ejecutar migraciones Supabase.
- Desplegar backend/frontend.
- Comunicar cambios al equipo (changelog interno).

## Próximas etapas (secciones en el Drawer)

- **Migración** `20251204_110000_panel_stage_drawer_prep.sql`: define `drawer_prep` para etapas clave (Precalificado, Demo, Negociación, Cerrado Ganado/Perdido) y actualiza las RPC para exponer `etapa_codigo` y `etapa_metadatos`.
- Backend listo: `panel_leads_list`, `panel_lead_update` y `panel_lead_move` devuelven las nuevas columnas y conservan `metadata.stage_prep` con `mergeMetadata = true`.
- Frontend:
  - `EmbudoStage`/`LeadRow` incluyen `codigo` y `metadatos`.
  - `LeadDrawer` recibe todas las etapas, renderiza “Próximas etapas” según `orden` y persiste los valores en `card.metadata.stage_prep`.
- Validación recomendada tras ejecutar migraciones: recargar `/embudo`, abrir un lead, completar los formularios de etapas futuras y confirmar los valores en `lead_tarjetas.metadata->'stage_prep'`.

## Dependencias y tareas previas

- Alinear con equipo de negocio qué campos son editables y cómo impactan en reportes.
- Confirmar políticas RLS (nuevas RPC deben respetar `puede_ver_lead` y service role).
- Verificar compatibilidad SSR de `@dnd-kit/core` (componentes cliente).

## Próximos pasos sugeridos

1. Implementar y probar las RPC nuevas (`panel_lead_update`, `panel_lead_move`). ✅
2. Montar el Drawer con el formulario y server action `updateLead`. ✅
3. Integrar drag & drop con `moveLead` y feedback visual. ✅
