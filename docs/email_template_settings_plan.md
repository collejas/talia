Email Template Settings – Plan
==============================

- [x] Convert the “Settings” button in the sidebar into a dropdown menu.
  - [x] Add submenu entry (e.g. “Formato de correos”) pointing to new route.
- [x] Create `/settings/email` page in the panel with form to edit:
  - [x] Introducción / resumen principal.
  - [x] Lista de puntos clave (beneficios).
  - [x] Recursos (label + URL).
  - [x] Texto de cierre / CTA.
- [x] Persist configuration in Supabase (new table or existing settings store).
- [x] Update backend `send_information_email` to read values from storage.
- [x] Implement fallback defaults if settings are empty.
- [x] Add basic validation + success/error feedback in UI.
- [ ] QA end-to-end: ajustar copy en panel, disparar email desde chat y verificar el output real.
