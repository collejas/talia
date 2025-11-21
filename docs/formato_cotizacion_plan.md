Formato de Cotización – Plan
============================

## Contexto
- El panel ya permite generar/enviar cotizaciones desde el drawer derecho del embudo, pero el PDF se arma a mano en `backend/app/services/quotes.py`, lo que dificulta cambios visuales.
- Necesitamos que un usuario no técnico ajuste el layout desde una vista en `Settings`, idealmente con vista previa y soporte para variables dinámicas (cliente, conceptos, totales, vigencia, firmas, etc.).
- El backend debe consumir ese template persistido y producir un PDF consistente sin reescribir lógica cada vez.

## Objetivos
1. Agregar la ruta `settings/formato-cotizacion` en el panel para editar el template completo.
2. Persistir el template (HTML + metadatos) en Supabase para que múltiples usuarios lo compartan.
3. Consumir el template guardado al momento de renderizar PDFs y correos/WhatsApp.
4. Permitir vista previa rápida para validar estilos antes de guardar.

## Arquitectura propuesta
- **Almacenamiento**: nueva tabla `quote_templates` (o extender `app_settings`) con columnas `id`, `nombre`, `html`, `variables`, `version`, `updated_by`, `updated_at`. Guardamos 1 registro "activo" y versiones históricas opcionales.
- **Editor**: vista en Settings usando shadcn/ui + `@tiptap/react` (editor rich text compatible con Next/React/ Radix). Barra con bold/italic, listas, tablas básicas, bloques HTML y placeholders (`{{cliente.nombre}}`).
- **Variables**: listado de tokens disponibles (nombre del lead, contacto, conceptos, importes, notas). Cada token se inserta via botón/`Command`. Se guarda como texto simple dentro del HTML.
- **Preview**: panel lateral que toma el HTML actual, lo renderiza con datos mock y muestra un canvas estilo PDF (podemos reutilizar Tailwind). Opcionalmente usar `<iframe>` con `/api/quotes/preview?draft=...` para asegurar que el backend renderiza igual que el PDF.
- **Generación PDF**: actualizar `render_quote_pdf` para:
  - Resolver template HTML (guardado) + contexto (datos del lead).
  - Renderizar a PDF usando un motor robusto (preferencia: **Playwright** o **Puppeteer** corriendo Chromium headless**). Alternativas simples: `weasyprint` o `pdfkit` si queremos evitar navegador completo.
  - Mantener `QuoteRenderContext` para pasar variables y fallback en caso de que no exista template.

## Frontend – tareas
1. Añadir subruta en el sidebar `Settings > Formato de cotización` (siguiendo patrón de `email_template_settings_plan`).
2. Crear página con layout de ancho doble: editor principal (Tiptap) + panel derecho con:
   - Lista de variables disponibles (chips copiables).
   - Botón "Insertar variable" que agrega `{{token}}` en el caret.
   - Vista previa (iframe) o render local.
3. Formulario con:
   - Nombre/versión del template.
   - Campo para CSS (opcional) o selección de tema.
   - Botones Guardar, Guardar y publicar, Revertir cambios.
4. Hook a Supabase/REST para cargar template actual, manejar loading/error states, confirmaciones.
5. Tests UI básicos (playwright/storybook) o al menos unit tests del hook que mapea variables.

## Backend – tareas
1. Tabla + RPCs
   - Migración Supabase para `quote_templates` (campos mencionados, RLS allow admins).
   - RPC `panel_quote_template_get` y `panel_quote_template_upsert` para el panel.
2. Servicio de templates (`app/services/quote_templates.py`):
   - Carga activo, aplica fallback si no existe.
   - Renderiza el HTML reemplazando `{{token}}` usando `jinja2`/`string.Template`.
3. Nuevo pipeline PDF:
   - Endpoint `/internal/quotes/render` que recibe HTML + datos -> PDF (utilidad Playwright).
   - `render_quote_pdf` se vuelve wrapper: obtiene template, hace render HTML, invoca helper PDF, retorna `QuoteDocument`.
4. Preview API (`/api/quotes/template-preview`): toma HTML "draft" desde el panel y devuelve imagen/PDF temporal para la vista previa.
5. Logging + fallback: si el template falla, registrar error y usar versión básica (actual) para no bloquear envíos.

## Integraciones adicionales
- **Versionado**: guardar historial (tabla secundaria `quote_template_versions`) para hacer rollback.
- **Permisos**: solo admins editan template; otros solo lo ven.
- **Assets**: permitir subir logo o referenciar URLs (usar el bucket existente de `assets/logos`).

## Roadmap sugerido
1. **Infraestructura de datos** (tabla + RPC + servicio de templates).
2. **Editor en Settings** (UI, hooks, guardado, lista de variables).
3. **Preview / render HTML** (mock de datos + endpoint preview backend).
4. **Motor PDF** (Playwright/Weasyprint) + integración con `render_quote_pdf`.
5. **QA end-to-end** (crear template nuevo, generar cotización real, enviar por email/WhatsApp, validar PDF, fallback al template anterior si falla).

## Riesgos y mitigaciones
- **Performance PDF**: Playwright puede ser pesado; mantener un worker o cachear navegador para evitar frío.
- **Seguridad**: sanitizar HTML guardado (limitar scripts) para evitar XSS cuando se hace preview.
- **Placeholders faltantes**: mostrar validación en UI (lista de tokens obligatorios) y fallback en backend.

## Próximos pasos inmediatos
1. Diseñar migración Supabase + seed template por defecto.
2. Crear API (Next route) para leer/guardar template desde el panel.
3. Implementar editor Tiptap + panel de variables + preview básico.
