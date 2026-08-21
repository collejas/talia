# Changelog · Plan de métricas

Registro de cambios del refactor para consolidar métricas y evitar duplicidad
entre las vistas de prospección y mapa de conversión.

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
