# Changelog · Plan de métricas

Registro de cambios del refactor para consolidar métricas y evitar duplicidad
entre las vistas de prospección y mapa de conversión.

## 2026-08-21 · Plan de refactor de navegación y UX

- Se creó `PLAN_REFACTOR_VISTA_METRICAS.md`.
- Se definió una navegación de tres niveles: resumen general, selección de
  canal y detalle especializado.
- Se separaron las responsabilidades de WhatsApp, Correo y Voz.
- Se estableció que el resumen general debe comparar canales sin mezclar
  unidades incompatibles.
- Se incorporó como objetivo un rediseño integral de la vista y sus subvistas,
  con una experiencia minimalista, limpia, accesible y enfocada en decisiones.

## 2026-08-21 · Primer corte seguro en `prospeccion/contactos`

### Cambios realizados

- Se eliminó de la vista `prospeccion/contactos` la carga de métricas globales.
- Se retiraron de esa vista los bloques:
  - `Salud por canal`.
  - `Conversión por fuente`.
  - `Eventos Correo`.
- Se conservó el flujo operativo de lotes, envíos, estados, errores,
  reintentos, cancelaciones y bitácora del lote seleccionado.
- Se agregó un enlace contextual hacia `prospeccion/metricas` para consultar el
  rendimiento global.
- El endpoint legacy `/prospeccion/contacto/metrics` permanece temporalmente
  disponible para compatibilidad, pero ya no participa en la carga de esta
  vista.

### Alcance protegido

- No se modificaron tablas ni datos de Supabase.
- No se modificaron listas de precios, cotizaciones ni snapshots de precios.
- No se modificó la lógica de `mapa-de-conversion`.
- No se eliminaron funciones backend que todavía tienen consumidores
  documentales o de compatibilidad.

### Validación

- ESLint del componente modificado: correcto.
- TypeScript del panel con `npx tsc --noEmit`: correcto.
- `git diff --check`: correcto.

## Próximos cambios previstos

- Simplificar `prospeccion/campanas` para conservar configuración y enlazar al
  tablero global de rendimiento.
- Consolidar en `prospeccion/metricas` los bloques de correo, WhatsApp y
  conversión con nombres y denominadores explícitos.
- Reducir el payload de atribución de campañas usado por
  `mapa-de-conversion` a adquisición y conversión.
- Validar filtros, exportaciones, permisos tenant-aware y datos reales.

## 2026-08-21 · Contrato explícito de correo en `prospeccion/metricas`

### Cambios realizados

- El endpoint `GET /prospeccion/metricas` ahora expone el bloque
  `campanas_correo` con resumen, detalle y series de correo.
- Se conserva `campanas` temporalmente como contrato compatible para otros
  consumidores.
- La pestaña principal se presenta como `Campañas correo` y consume el bloque
  explícito de correo cuando está disponible.
- Se mantienen separados `campanas_whatsapp` y `frases_whatsapp`.

### Validación

- `python3 -m py_compile backend/app/api/routes/crm.py`: correcto.
- TypeScript del panel: correcto.
- ESLint de métricas: sin errores; las advertencias restantes son de hooks y
  código preexistente del módulo.
- `git diff --check`: correcto.

## 2026-08-21 · Payload de campañas reducido en `mapa-de-conversion`

### Cambios realizados

- `GET /demografia/campanas-atribucion` ahora devuelve para correo únicamente
  identificadores de campaña/plantilla, `envios_enviados` y `sesiones_utm`.
- Para WhatsApp devuelve únicamente campaña, canal, conversaciones y
  oportunidades atribuidas.
- Se eliminaron del payload del mapa campos de entregabilidad, aperturas,
  clics, rebotes y estados operativos que pertenecen a `prospeccion/metricas`.
- Se conserva `web_sessions` como fuente de visitas web y no se modifica la
  atribución comercial ni la UI de las tres lecturas del mapa.

### Validación

- `python3 -m py_compile`: correcto.
- TypeScript del panel: correcto.
- ESLint de los componentes de atribución: correcto.
- `git diff --check`: correcto.

### Validación funcional reportada

- El usuario verificó la vista `mapa-de-conversion` en sus tres secciones:
  - Tráfico web.
  - Conversaciones.
  - Campañas.
- Las tres secciones continúan funcionando correctamente después del ajuste
  del payload.

## 2026-08-21 · Retiro de consumidor interno legacy

- Se eliminaron del cliente del panel el tipo `ContactoMetrics` y la función
  `getContactoMetrics`, que ya no tenían consumidores activos.
- Se conserva temporalmente el BFF y el endpoint backend
  `/prospeccion/contacto/metrics` para compatibilidad externa y documentación
  histórica.
- El flujo activo de métricas usa `prospeccion/metricas`; `contactos` conserva
  únicamente operación de lotes y envíos.

## 2026-08-21 · Retiro del endpoint legacy

### Evidencia previa

- No quedaron consumidores del endpoint dentro del panel ni del backend.
- No se encontraron referencias activas fuera de documentación histórica.
- La búsqueda de logs de Nginx no mostró accesos al endpoint en los archivos
  disponibles.

### Cambios realizados

- Se eliminó el BFF `frontend/panel/src/app/api/prospeccion/contacto/metrics/route.ts`.
- Se eliminó la ruta backend `/prospeccion/contacto/metrics`.
- Se eliminó el import del contador in-memory que solo utilizaba esa ruta.
- Se actualizó la documentación activa de endpoints.

### Protección

- No se tocaron los endpoints de lotes, envíos, logs, cuota Brevo ni métricas
  globales.
- No se modificaron datos, migraciones, precios ni mapa de conversión.

## 2026-08-21 · Segundo corte en `prospeccion/campanas`

### Cambios realizados

- Se detuvo la solicitud automática de atribución jerárquica al entrar a
  `prospeccion/campanas`.
- Se retiró de la experiencia visible el tablero duplicado de métricas
  campaña → plantilla → lote → envío.
- Se agregó un enlace contextual hacia `prospeccion/metricas` desde la sección
  de administración de campañas.
- Se conservaron la creación, edición, eliminación, plantillas, reglas y
  acciones operativas de campañas.

### Limpieza estructural

- Se retiraron estados, tipos, carga de detalle y helpers que solo existían para
  el árbol jerárquico duplicado.
- Se conservaron los componentes y contratos usados por administración de
  campañas, plantillas y reglas.

### Validación

- TypeScript del panel con `npx tsc --noEmit`: correcto.
- ESLint del componente: sin errores; conserva advertencias preexistentes del
  módulo.
- `git diff --check`: correcto.
