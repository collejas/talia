# Changelog · Plan de métricas

Registro de cambios del refactor para consolidar métricas y evitar duplicidad
entre las vistas de prospección y mapa de conversión.

## 2026-08-22 · Refactor completo de campañas WhatsApp

- La subvista WhatsApp ahora analiza campañas de mercadotecnia usando
  `resultado_comercial_whatsapp` como fuente principal.
- Las tarjetas, el resumen general, el gráfico y la tabla principal muestran
  enviados, entregados, respuestas, oportunidades, clientes y conversión de
  campaña.
- La exportación CSV de WhatsApp ahora corresponde al resultado atribuido por
  campaña.
- Las métricas de lotes, eventos y mensajes del contexto operativo quedaron en
  un bloque colapsado de diagnóstico y ya no se presentan como KPI principales.
- Se corrigieron los agregados del resumen general para no sumar `787` como si
  fuera el total de mensajes de WhatsApp del tenant.

### Ajuste posterior

- Se retiró por completo el bloque `Diagnóstico técnico de ejecución` de esta
  vista para evitar mezclar métricas operativas con rendimiento de campañas.
- El detalle de lotes y eventos debe consultarse en las vistas operativas de
  prospección, no en el tablero de resultados de mercadotecnia.

## 2026-08-22 · Corrección de estados operativos WhatsApp

- Se corrigió la RPC `prospeccion_campana_whatsapp_metricas_rango` para que
  `mensajes_entregados` incluya mensajes que posteriormente fueron leídos.
- Se conservó `mensajes_con_evento_entrega` como métrica de trazabilidad y no
  como sinónimo de entregados.
- `mensajes_fallidos` conserva el último estado fallido observado para evitar
  presentar como fallido un mensaje que después fue entregado.
- Se aclararon las etiquetas de la subvista WhatsApp: lotes, mensajes
  salientes, entregados acumulados, leídos y fallidos.
- No se modificó el bloque `resultado_comercial_whatsapp` ni la fuente del
  mapa de conversión.

### Validación semántica

- Un mensaje leído ahora también cuenta como entregado.
- La tasa de entrega se calcula sobre entregados acumulados / mensajes
  salientes.
- Los mensajes salientes siguen siendo una métrica operativa del flujo y no se
  comparan directamente con los envíos atribuidos del resultado comercial.

## 2026-08-22 · Resultado comercial compartido de campañas WhatsApp

- Se documentó que `prospeccion/metricas` debe mostrar oportunidades, clientes
  y costos de WhatsApp como parte del rendimiento directo de campañas.
- Se estableció que CPO, CAC y costo por conversación solo deben mostrarse con
  costo conciliado; nunca debe tratarse un costo incompleto como cero.
- Se definió un agregado canónico compartido con `mapa-de-conversion`, evitando
  duplicar fórmulas o crear una segunda fuente de verdad.

### Primer corte implementado

- `GET /prospeccion/metricas` ahora expone `resultado_comercial_whatsapp` con
  resumen y detalle por campaña.
- La subvista WhatsApp muestra conversaciones, oportunidades, clientes, costo
  total, CPO y CAC.
- Los costos pendientes de conciliación se muestran como `Pendiente`.
- Validación de datos: 705 mensajes salientes atribuidos, 60 conversiones, 56
  oportunidades y 0 envíos atribuidos sin cobro.
- Validación técnica: `py_compile`, ESLint, TypeScript y `git diff --check`.

### 2026-08-22 · Alineación de conversaciones, respuestas y costos

- Se corrigió la lectura visual de WhatsApp para separar 508 conversaciones
  atribuidas de 53 conversaciones con primera respuesta.
- Se ajustó la precisión de costo, CPO y CAC a cuatro decimales para coincidir
  con `mapa-de-conversion`.
- Se corrigió el resultado comercial para no presentar el cohorte técnico de
  conversaciones como KPI principal; ahora usa el embudo de enviados,
  entregados, respuestas, oportunidades y clientes.

## 2026-08-21 · Plan de refactor de navegación y UX

- Se creó `PLAN_REFACTOR_VISTA_METRICAS.md`.
- Se definió una navegación de tres niveles: resumen general, selección de
  canal y detalle especializado.
- Se separaron las responsabilidades de WhatsApp, Correo y Voz.
- Se estableció que el resumen general debe comparar canales sin mezclar
  unidades incompatibles.
- Se incorporó como objetivo un rediseño integral de la vista y sus subvistas,
  con una experiencia minimalista, limpia, accesible y enfocada en decisiones.

### Primer corte implementado

- La vista abre ahora con un resumen general enfocado en actividad, resultados,
  respuestas y oportunidades.
- Se agregó navegación principal para Resumen general, Correo, WhatsApp y Voz.
- Se agregó una tabla compacta de rendimiento por canal con acceso directo al
  detalle.
- Se conservaron los contratos de datos, filtros, exportaciones y detalles
  existentes detrás de la navegación para permitir una transición segura.
- Se agregó al encabezado superior un selector compacto de periodo con rangos
  preconfigurados y opción personalizada mediante calendario, sin crear una
  sección adicional ni aumentar la altura normal de la vista.
- Se simplificó la cabecera de las subvistas de canal y se sustituyó la
  navegación duplicada por un selector secundario compacto para Campañas y
  Atribución de WhatsApp.
- Validación: ESLint del componente y TypeScript del panel correctos.

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

## 2026-08-22 · Simplificación adicional de la vista de campañas

### Cambios realizados

- Se eliminaron por completo de `prospeccion/metricas` los bloques:
  - `Campañas destacadas (Top 5)`.
  - `Resumen operativo de WhatsApp`.
  - `Enlaces / reglas WA (Top 5)`.
  - `Brevo hoy`.
- Se retiraron sus cálculos, estados y solicitudes exclusivas para evitar
  lógica y consultas sin consumidor visible.
- Se conservaron la selección de periodo, filtros, exportaciones y el
  resultado comercial por campaña de WhatsApp.

### Criterio

La vista queda enfocada en resultados comparables y detalle de campañas; los
diagnósticos operativos y cuotas quedan fuera del tablero principal para no
duplicar información ni mezclar fuentes de medición.

## 2026-08-22 · Eliminación de KPI duplicados de WhatsApp

- Se retiraron del encabezado de la subvista `Campañas WhatsApp` los KPI de
  campañas, enviados, entregados, respuestas y oportunidades.
- Esos valores permanecen únicamente dentro de `Resultado comercial`, junto
  con clientes ganados, costo, CPO y CAC.
- El resumen general y las vistas de Correo y Voz conservan sus KPI propios.

## 2026-08-22 · Porcentajes del resultado comercial WhatsApp

- `Entregados` muestra su porcentaje sobre los mensajes enviados.
- `Respuestas` muestra su porcentaje sobre las conversaciones atribuidas.
- `Oportunidades` muestra su porcentaje sobre las conversaciones atribuidas,
  siguiendo la definición canónica de conversión comercial.

## 2026-08-22 · Retiro del KPI de respuestas WhatsApp

- Se eliminó la tarjeta KPI `Respuestas` de `Resultado comercial` para evitar
  presentar como resultado separado una respuesta que el flujo comercial trata
  como oportunidad.
- También se eliminó la columna `Respuestas` de `Resultado por campaña`; la
  vista comercial queda enfocada en oportunidades, clientes y costos.
