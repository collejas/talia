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
- Prospectos: tabla central para selección comercial, con snapshot optimizado al convertir resultados y columnas hot para operación diaria.
- Contacto: worker multicanal con reintentos y estado.
- Campañas: agrupación/duplicación de lotes.
- Inbox comercial: operación de respuestas de prospección desde `/inbox` con filtros de origen/canal/lote/campaña.

## 3) Observaciones técnicas clave

- DENUE y Google comparten patrón: `busqueda -> resultados -> prospectos`.
- Para DENUE, el tamaño de empresa viene de `estrato`; para Google, `rating`.
- El backend ya soporta filtros complejos en DENUE (incluye `contact_match = all|any`).
- El frontend ya usa paginación alta para resultados (5000) en vistas geográficas.
- En `prospeccion/prospectos`, la tabla ya permite orden por columna, reordenar columnas y ocultar/mostrar columnas.
- En `google-busqueda` y `denue-busqueda`, ya existe eliminación individual y masiva de búsquedas recientes.
- La conversión resultado -> prospecto debe guardar `nombre_comercial`, `razon_social` y dirección desglosada cuando aplique, sin copiar `raw` completo a la tabla operativa.

## 4) Referencia de datos actual (MCP, instancia vigente)

- `busquedas`: Google 158, DENUE 9.
- `resultados`: Google 61,533, DENUE 4,195.
- `prospeccion_prospectos`: Google 72, DENUE 13.

## 5) Fuente de verdad para siguiente trabajo

Para cambios nuevos:
1. Revisar `frontend_vistas.md`.
2. Revisar contrato en `backend_endpoints.md`.
3. Validar impacto de datos en `base_datos.md`.

## 6) Decisiones vigentes (sin historial repetido)

- Modelo operativo único:
  - gestionar campañas y plantillas en `prospeccion/campanas`,
  - ejecutar envíos en `prospeccion/prospectos`.
- Campaña y plantilla son obligatorias para ejecución.
- Plantillas quedan ligadas a campaña y al canal de la campaña.
- Regla de no bloqueo:
  - mensajes entrantes no-prospección no se bloquean por ausencia de campaña.
- Embudo:
  - se mantiene el embudo actual (no se crea uno nuevo de prospección).

## 7) Estado de implementación actual

- WhatsApp en frío operativo con prompt especializado y routing por contexto de prospección.
- Correo de prospección operativo por Brevo con plantillas y `{{logo_url}}`.
- Carga de imágenes desde modal de plantillas (correo/whatsapp) con metadata de trazabilidad.
- URLs de tracking para media/CTA en WhatsApp y links de correo.
- Base URL CTA por tenant desde `settings/variables`:
  - `sitio_web` y fallback `dominio_principal`,
  - sin fallback global a `talia.mx`.
- Retirada de “Salud por canal” en `prospeccion/campanas` por no ser tenant-safe.

## 8) Dónde ver el historial detallado

- Detalle cronológico de cambios: `docs/Prospeccion/CHANGELOG.md`.
- Pendientes reales actuales: `docs/Prospeccion/siguiente_pasos.md`.
- Refactor de columnarización y snapshot al convertir resultados: `docs/Prospeccion/plan_columnarizacion_resultados_direccion.md` y `docs/Prospeccion/plan_resultado_a_prospecto_snapshot.md`.
