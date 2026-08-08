# Inbox persistente: solución estructural definitiva

Fecha: 2026-08-08 (UTC)
Estado: Implementado y desplegado en producción

## Objetivo

Eliminar el costo de reagrupar todas las conversaciones y reconstruir sus mensajes en cada apertura o polling de Inbox. La solución reemplaza la lectura principal de `panel_inbox_threads_grouped`, que inspeccionaba hasta 10,000 conversaciones antes de paginar, por una proyección persistente e incremental.

## Modelo

### `public.inbox_threads`

Una fila por hilo operativo. Los campos usados para filtrar, ordenar, relacionar y mostrar son columnas explícitas: organización, clave estable de agrupación, canal, teléfono normalizado, conversación canónica, persona, cuenta/empresa, estado, prioridad, asignación, último mensaje, no leídos, source, batch, campaña y template.

### `public.inbox_thread_conversations`

Relación explícita entre un hilo y sus conversaciones históricas. Cada conversación pertenece a un solo hilo.

## Contrato persona, contacto y empresa

- `persona_id` es la identidad humana canónica.
- El nombre legacy `contacto_id` sólo se conserva en la respuesta API para compatibilidad; su valor proviene de `personas.id`.
- `cuenta_id` representa la empresa y se resuelve desde `cuenta_personas`, priorizando una relación activa principal.
- No se escribe `personas.id` dentro de tablas legacy de contactos.
- Oportunidades, personas, cuentas y relaciones no se migran ni eliminan; la proyección sólo las referencia.

Esto mantiene el contrato de `docs/Plan_personas_empresa_contactos`.

## Sincronización incremental

La proyección se actualiza mediante triggers acotados sobre conversaciones, mensajes, personas y relaciones `cuenta_personas`. `inbox_sync_conversation(uuid)` recalcula únicamente el hilo afectado. `inbox_rebuild_threads(uuid)` queda como herramienta de backfill o reparación administrada y no participa en la lectura interactiva.

## Lectura

`panel_inbox_threads_persisted` filtra y pagina `inbox_threads` antes de obtener persona, oportunidad, historial y mensajes de la página. `panel_inbox_filter_options_persisted` obtiene batches y campañas directamente desde la proyección y ya no vuelve a ejecutar la consulta de threads.

## Realtime y cache

- Se deshabilitó el cache in-memory de threads para no servir datos obsoletos después de SSE ni divergir entre procesos.
- El frontend conserva el bootstrap SSR y ya no dispara otro bootstrap inmediato al hidratar.
- SSE sigue siendo el mecanismo primario; polling queda como fallback.
- El refresh periódico de la MV anterior se retiró del ciclo de vida del backend.

## Seguridad

- RLS habilitado en las dos tablas nuevas.
- Lectura `authenticated` limitada a `usuario_organizacion_id(auth.uid())`.
- `anon` sin permisos y escritura directa reservada a `service_role`/funciones internas.
- Funciones `SECURITY DEFINER` con `search_path` fijo.
- El rebuild no es ejecutable por usuarios autenticados.

## Backfill y conservación

- conversaciones: 368
- relaciones hilo-conversación: 368
- hilos persistidos: 339
- relaciones huérfanas: 0
- hilos sin conversación canónica: 0
- oportunidades conservadas: 364
- personas conservadas: 1,255
- cuentas conservadas: 1,854

No se borraron conversaciones ni registros CRM.

Las 70 conversaciones de correo todavía no vinculadas a una persona conservan
el nombre y correo del remitente desde las columnas explícitas de
`conversaciones`; no se crean personas artificiales durante esa transición.

## Rendimiento inicial

Antes, `panel_inbox_threads_grouped` registraba 244 ejecuciones, media de 2,169 ms, máximo de 7,499 ms y 529 segundos acumulados.

Después del backfill:

- lectura indexada de 40 hilos: 0.147 ms;
- RPC compatible completo de 40 hilos y un mensaje: 134.4 ms.

## Criterios de cierre

- cobertura conversación/proyección 100%;
- cero relaciones huérfanas;
- p95 de bootstrap menor a 1,200 ms durante siete días;
- p95 del RPC persistente menor a 500 ms;
- cero llamadas al RPC agrupado anterior desde el backend desplegado;
- oportunidades, personas y cuentas sin pérdidas;
- mensajes nuevos visibles mediante trigger + SSE.

## Validación de entrega

- migraciones aplicadas en Supabase;
- API y panel activos desde 2026-08-08 17:49 UTC;
- health de API: HTTP 200;
- Inbox público: HTTP 200;
- TypeScript, lint y build de producción aprobados;
- React Doctor: 100/100;
- pruebas del repositorio de Inbox persistente: 2 aprobadas.
