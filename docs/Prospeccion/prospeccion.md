# Prospección · Estado actual

## 1) Flujo operativo real

1. Descubrir
- Vistas: `google-busqueda`, `denue-busqueda`, `buscador`.
- Persistencia: `public.busquedas` + `public.resultados`.

2. Filtrar y guardar
- El usuario filtra resultados por búsqueda y guarda seleccionados como prospectos.
- Persistencia: `public.prospeccion_prospectos`.

3. Enriquecer
- Verificación telefónica (lookup), scraper y edición manual.
- Registro de cambios: `public.prospeccion_prospectos_audit`.

4. Contactar
- Se crean lotes y envíos por canal (correo, WhatsApp, llamada).
- Persistencia: `prospeccion_contacto_batch`, `prospeccion_contacto_envio`, `prospeccion_contactos_log`.

5. Evaluar
- Monitoreo de lotes, métricas, campañas y reintentos.
- Vistas: `prospeccion/contactos` y `prospeccion/campanas`.

## 2) Módulos principales

- Descubrimiento: Google/DENUE + jobs asíncronos.
- Prospectos: tabla central para selección comercial.
- Contacto: worker multicanal con reintentos y estado.
- Campañas: agrupación/duplicación de lotes.

## 3) Observaciones técnicas clave

- DENUE y Google comparten patrón: `busqueda -> resultados -> prospectos`.
- Para DENUE, el tamaño de empresa viene de `estrato`; para Google, `rating`.
- El backend ya soporta filtros complejos en DENUE (incluye `contact_match = all|any`).
- El frontend ya usa paginación alta para resultados (5000) en vistas geográficas.

## 4) Referencia de datos actual (MCP, instancia vigente)

- `busquedas`: Google 158, DENUE 9.
- `resultados`: Google 61,533, DENUE 4,195.
- `prospeccion_prospectos`: Google 72, DENUE 13.

## 5) Fuente de verdad para siguiente trabajo

Para cambios nuevos:
1. Revisar `frontend_vistas.md`.
2. Revisar contrato en `backend_endpoints.md`.
3. Validar impacto de datos en `base_datos.md`.

