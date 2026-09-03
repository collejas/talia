# Plan de cambio de nomenclatura: DENUE → GobMX

**Fecha de documentación:** 2026-09-03
**Estado:** Fases 1 y 2 implementadas localmente; publicación pendiente
**Alcance inicial:** Frontend del panel y etiquetas visibles de seguimiento de prospección

## 1. Idea de producto

La plataforma dejará de mostrar la palabra **DENUE** como nombre de producto en la interfaz del panel y utilizará **GobMX** como nombre visible para los usuarios.

La intención es presentar esta fuente como una capacidad propia y clara de prospección, sin exponer innecesariamente el nombre técnico del proveedor o de la integración.

La nomenclatura propuesta para la interfaz es:

```text
GobMX
Directorio oficial de establecimientos
```

Cuando sea necesario explicar el origen de los datos en documentación técnica, se podrá mencionar que GobMX utiliza la fuente oficial DENUE/INEGI. Esa aclaración no debe volver a introducir DENUE como nombre principal de la funcionalidad para el usuario operativo.

## 2. Hallazgos de la revisión inicial

Se revisaron las vistas:

- `prospeccion/denue-busqueda`
- `prospeccion/prospectos`

También se revisaron las apariciones relacionadas dentro del frontend y los documentos:

- `docs/Busqueda_denue`
- `docs/Plan_mapa_conversion`
- `docs/Plan_personas_empresa_contactos`
- `docs/Prospeccion`

### 2.1 Inventario general

En el frontend se encontraron aproximadamente **252 apariciones** de `denue` en **30 archivos**.

No todas son texto visible. Las apariciones se dividen en:

1. Etiquetas y mensajes visibles al usuario.
2. Valores internos de fuente y seguimiento.
3. Rutas API y proxies de Next.js.
4. Tipos, funciones, nombres de módulos y variables.
5. Configuración de tenants, secretos y límites comerciales.

En la documentación indicada se encontraron aproximadamente **175 apariciones** en los documentos de `Busqueda_denue` y `Prospeccion`.

No se encontraron apariciones literales de `denue` en `Plan_mapa_conversion` ni en `Plan_personas_empresa_contactos`; esos documentos utilizan conceptos generales de origen, atribución, personas, cuentas y contactos.

## 3. Regla principal de compatibilidad

El cambio debe ser de presentación, no un reemplazo textual indiscriminado.

```text
Valor almacenado y contrato interno: denue
Etiqueta visible en el panel: GobMX
```

Se debe conservar inicialmente el valor interno `denue` porque actualmente participa en:

- `fuente = "denue"` en prospectos.
- Filtros de la vista `prospeccion/prospectos`.
- Payload para guardar resultados como prospectos.
- `fuente_busqueda` y etiquetas de seguimiento.
- URLs internas `/api/prospeccion/denue/...`.
- Rutas backend `/crm/prospeccion/denue/...`.
- Jobs, RPCs y respuestas relacionadas con la fuente.
- Configuración `denue.base_url` y secreto `denue.token`.
- Límites comerciales como `limit.prospeccion.denue_raw_results_month`.

Cambiar estos valores sólo en el frontend rompería contratos con el backend, filtros existentes, registros históricos y métricas.

## 4. Elementos visibles que deben usar GobMX

### 4.1 Navegación y títulos

- Sidebar: `Denue búsqueda` → `GobMX búsqueda`.
- Título de la página: `DENUE búsqueda · Prospección` → `GobMX · Prospección` o `Búsqueda GobMX · Prospección`.
- Descripción de la etapa: `Búsquedas en Google, DENUE y webscraper` → `Búsquedas en Google, GobMX y webscraper`.

La ruta `/prospeccion/denue-busqueda` puede conservarse inicialmente para evitar romper enlaces, favoritos, permisos y navegación existente. El cambio de URL a `/prospeccion/gobmx-busqueda` debe tratarse como una decisión separada, con alias o redirección compatible.

### 4.2 Vista `prospeccion/denue-busqueda`

Cambiar textos visibles como:

- `Resultados crudos DENUE`.
- `Búsqueda DENUE en cola`.
- `Búsqueda DENUE completada`.
- `Búsqueda DENUE cancelada`.
- `Búsqueda DENUE falló`.
- `Se guardaron ... resultados desde DENUE`.
- `Se guardaron ... prospectos desde DENUE`.
- `Define el centro y el radio antes de consultar DENUE`.
- `Instrucciones de búsqueda DENUE`.
- `DENUE buscará negocios...`.
- `Procesando búsqueda DENUE`.
- `Selecciona ... clases del DENUE`.
- Confirmaciones que hablen de una captura de DENUE.

La funcionalidad de búsqueda normal, búsqueda avanzada, filtros, mapa, resultados almacenados, jobs y guardado como prospectos debe conservar exactamente su comportamiento.

### 4.3 Vista `prospeccion/prospectos`

Cambiar etiquetas de presentación como:

- Opción de fuente `DENUE` → `GobMX`.
- Placeholder `Prospectos DENUE Norte` → `Prospectos GobMX Norte`.
- Mapeo `FUENTE_LABELS.denue` → `GobMX`.
- Cualquier texto visible derivado de `fuente = "denue"`.

El filtro debe seguir enviando `fuente=denue` al backend y los prospectos existentes deben comenzar a mostrarse como GobMX sin migración de datos.

### 4.4 Seguimiento, campañas y embudo

Revisar y cambiar las etiquetas visibles en:

- Selector de fuente/origen del asistente de campañas.
- Vista previa de plantillas y campo `canal_origen` mostrado al usuario.
- Etiqueta de origen en tarjetas y detalle del embudo.
- Resolución de origen de contacto que actualmente transforma `denue` a `DENUE`.
- Resúmenes o nombres de campañas que reflejen la fuente.

El valor interno de `canal_origen`, `fuente` o metadata no debe cambiar durante esta primera fase salvo que exista un contrato específico que lo permita.

## 5. Elementos que deben conservar `denue` internamente

No cambiar en la primera fase:

- Directorios y nombres técnicos:
  - `denue-busqueda-view.tsx`.
  - `advanced-denue-search-modal.tsx`.
  - `denue-client.ts`.
- Tipos y funciones:
  - `DenueBusquedaItem`.
  - `DenueResultadoItem`.
  - `DenueCatalogosResponse`.
  - `createDenueBusqueda`.
  - `listDenueResultados`.
- Proxies frontend `/api/prospeccion/denue/...`.
- Literales de contrato `"denue"`.
- Campos de formularios administrativos como `denue_base_url` y `denue_token`.
- Claves de secretos y límites.
- Nombres de endpoints, jobs, RPCs, tablas y vistas existentes.

Un renombrado técnico completo requeriría coordinar frontend, backend, migraciones, compatibilidad histórica, permisos, documentación de API y despliegue. No forma parte del cambio de etiqueta inicial.

## 6. Relación con seguimiento y métricas

La fuente GobMX debe seguir siendo identificable como fuente de prospección, pero no debe confundirse con el origen de tráfico web del mapa de conversión.

Se deben conservar estas diferencias:

- `fuente = denue`: fuente del prospecto.
- `fuente_busqueda`: referencia de la búsqueda que originó el prospecto.
- `source_class`: clasificación del origen de tráfico web.
- `utm_source`, `utm_medium`, `utm_campaign`: datos de atribución de campañas web.
- `source = prospeccion`: contexto general de prospección en mensajes o conversaciones.
- `canal_origen`: canal o procedencia usada en el flujo de contacto/campaña.

La etiqueta visible puede decir GobMX mientras el dato persistido continúa siendo `denue`.

No se debe agregar GobMX como una categoría de `source_class` sin una decisión específica de producto y datos. GobMX pertenece inicialmente a la taxonomía de fuentes de prospección.

## 7. Documentación a actualizar

### 7.1 `docs/Busqueda_denue`

Actualizar títulos y lenguaje de producto de:

- `INSTRUCTIVO_DENUE.md`.
- `PLAN_DESARROLLO_DENUE.md`.

Conviene mantener las referencias técnicas a la API oficial DENUE/INEGI, sus endpoints externos y sus contratos cuando sean necesarias para desarrolladores.

### 7.2 `docs/Prospeccion`

Actualizar la nomenclatura de producto en:

- `README.md`.
- `frontend_vistas.md`.
- `backend_endpoints.md`.
- `base_datos.md`.
- `prospeccion.md`.
- `CHANGELOG.md`.
- Documentos de planes y siguientes pasos que describan la experiencia del usuario.

Los nombres reales de tablas, funciones, vistas, columnas y endpoints deben mantenerse sin cambios dentro de los bloques técnicos.

### 7.3 `docs/Plan_mapa_conversion`

No requiere reemplazo global. Sus documentos no usan DENUE directamente y describen la taxonomía general de atribución. Sólo se deberá agregar GobMX si en el futuro se documenta explícitamente la integración entre fuentes de prospección y métricas de conversión.

### 7.4 `docs/Plan_personas_empresa_contactos`

No requiere reemplazo global. No contiene referencias directas a DENUE y su responsabilidad es documentar personas, cuentas, contactos y relaciones.

## 8. Fases propuestas

### Fase 0: documentación y decisión

- Aceptar la regla `denue` interno / `GobMX` visible.
- Confirmar si la URL pública seguirá siendo `/prospeccion/denue-busqueda`.
- Confirmar el texto final de títulos, ayudas y límites.

### Fase 1: catálogo central de etiquetas

- Crear o consolidar un único mapeo de etiqueta visible para la fuente.
- Evitar que cada vista tenga su propio texto `DENUE`, `Denue` o `GobMX`.
- Usar el mapeo en Prospectos, campañas, embudo y componentes compartidos.

### Fase 2: vistas operativas

- Actualizar Sidebar y navegación.
- Actualizar `prospeccion/denue-busqueda`.
- Actualizar `prospeccion/prospectos`.
- Revisar estados vacíos, errores, confirmaciones, tooltips y mensajes de éxito.

### Fase 3: seguimiento y administración

- Actualizar etiquetas de origen en campañas y embudo.
- Actualizar límites y configuración visibles para administradores.
- Mantener nombres de campos técnicos y secretos sin romper formularios.

### Fase 4: documentación

- Actualizar `docs/Busqueda_denue` y `docs/Prospeccion`.
- Conservar contratos técnicos en bloques de código y tablas de arquitectura.
- Registrar en este changelog cada archivo y validación.

### Fase 5: validación

- Buscar nuevamente `DENUE`, `Denue` y `denue` en el frontend.
- Clasificar cada aparición restante como visible permitida o contrato interno justificado.
- Ejecutar lint, TypeScript y React Doctor.
- Verificar las rutas `prospeccion/denue-busqueda` y `prospeccion/prospectos`.
- Probar búsqueda, filtros, guardado como prospecto, filtro por fuente y vista de seguimiento.
- Confirmar que los registros existentes con `fuente=denue` aparecen como GobMX.

## 9. Riesgos

- Renombrar el literal `denue` puede romper filtros, payloads y deduplicación.
- Cambiar rutas puede romper favoritos, enlaces internos y permisos.
- Cambiar etiquetas almacenadas puede fragmentar métricas históricas.
- Reemplazar DENUE dentro de documentación técnica puede ocultar el proveedor real o dificultar mantenimiento.
- No centralizar la etiqueta puede producir una interfaz mezclada entre GobMX, Denue y DENUE.
- Cambiar `source_class` sin una migración conceptual puede mezclar tráfico web con fuentes de prospección.

## 10. Criterios de terminado

El cambio podrá considerarse terminado cuando:

- No existan etiquetas visibles no justificadas con `DENUE`, `Denue` o `denue`.
- La interfaz muestre consistentemente `GobMX`.
- Los valores internos `denue` sigan funcionando.
- Los prospectos históricos se filtren y muestren correctamente.
- La búsqueda normal y avanzada continúen operativas.
- El guardado de resultados como prospectos conserve su fuente.
- Campañas, contactos, embudo y métricas no pierdan el origen.
- La documentación diferencie claramente nombre de producto y contrato técnico.
- Las validaciones estáticas y las pruebas funcionales pasen.

## 11. Estado actual

- Revisión inicial completada.
- Fase 1 implementada localmente: catálogo central de etiqueta visible `GobMX`.
- Fase 2 implementada localmente: actualización de vistas operativas y componentes de seguimiento del frontend.
- Los contratos internos `denue` no fueron modificados.
- Datos y contratos internos sin modificar.
- Plan documentado.
- Changelog inicial creado.
- Validación de diff pendiente de completar en este cambio.
