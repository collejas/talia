# Checklist TalIA

## Fase 0 · Preparación
- [ ] Registrar credenciales de Twilio, OpenAI, Supabase/Postgres y servicios asociados. Referencia: `docs/credenciales.md`.
- [x] Definir estrategia de despliegue (Docker/Compose, systemd, etc.) y flujo CI/CD. Referencia: `docs/despliegue_ci_cd.md`.
- [x] Diseñar el prompt conversacional de landing (guion de ventas, captación de nombre/correo/teléfono, handoff). Referencia: `docs/prompt_landing.md`.
- [x] Documentar wireframe y estados UI basados en la vista 'sin sesión' de ChatGPT (layout, tipografía, degradados, estados typing/error).
- [x] Crear repositorio/base para backend FastAPI con linters y tests iniciales. Referencia: `docs/backend_fastapi_base.md`.

## Fase 1 · Núcleo FastAPI
- [x] Estructurar proyecto (`app/main.py`, routers, configuración, dependencias).
- [x] Implementar middlewares (CORS, logging/trazabilidad, manejo de errores).
- [ ] Definir modelos de datos y migraciones iniciales (Alembic).

## Fase 2 · Integraciones de canales
- [ ] Implementar webhooks de Twilio WhatsApp (mensajes, adjuntos, callbacks). Referencia: `docs/canales/whatsapp.md`.
- [ ] Implementar flujo de voz en tiempo real con `<Connect><Stream>`. Referencia: `docs/canales/voz.md`.
- [ ] Definir endpoints para Instagram y webchat (placeholders + validaciones). Referencia: `docs/canales/webchat.md`.
- [ ] Configurar verificación de firmas y reintentos para cada canal. Referencia: `docs/canales/whatsapp.md`, `docs/canales/voz.md`.

## Fase 3 · Inteligencia conversacional
- [ ] Crear módulo de asistentes con prompts versionados y variables dinámicas.
- [ ] Integrar proveedor LLM (OpenAI) con manejo de límites y auditoría.
- [ ] Generar “prompt wizard” configurable por industria y tono.

## Fase 4 · Persistencia y analítica
- [ ] Diseñar schema relacional (conversaciones, mensajes, adjuntos, eventos).
- [ ] Construir consultas agregadas para KPIs y embudos.
- [ ] Exponer endpoints `/api/dashboard/*` y escribir tests para ellos.

## Fase 5 · Frontend y observabilidad
- [ ] Reemplazar la landing por UI tipo ChatGPT conectada al prompt de ventas y pipeline de leads.
- [ ] Implementar dashboard web con autenticación y consumo de métricas.
- [ ] Configurar monitoreo (logs centralizados, alertas, tracing).
- [ ] Documentar playbooks de operación, backups y renovación SSL.

## Landing & operaciones
- [ ] Afinar microcopys y assets del landing conversacional acorde al guion de ventas.
- [x] Instrumentar la conexión con el prompt de OpenAI y registrar leads (nombre, correo, teléfono).
- [ ] Automatizar sincronización `landing/src` → `/var/www/talia-landing` (deploy script/CI).
- [ ] Validar en QA que la UI final respete wireframe, estados y copy definidos.
- [ ] Verificar `certbot renew --dry-run` y programar revisiones periódicas.
