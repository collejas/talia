# F6.0 — Línea base técnica de Prospectos y Búsqueda

**Fecha:** 2026-09-22  
**Estado:** Inventario técnico completado; pendiente de revisión visual y aprobación para F6.1  
**Plan principal:** [PLAN_ARQUITECTURA_Y_REFACTOR_PROSPECCION_MARKETING.md](./PLAN_ARQUITECTURA_Y_REFACTOR_PROSPECCION_MARKETING.md)  
**Regla:** esta subfase documenta lo que existe. No renombra tablas, columnas ni endpoints y no crea estructuras paralelas.

## 1. Objetivo de F6.0

Establecer una línea base verificable antes de separar el frontend de Prospectos y Búsqueda. El inventario cubre:

- responsabilidades actuales de cada vista;
- contratos frontend, BFF/API y repositorio;
- filtros disponibles y cómo llegan al backend;
- diferencias entre Google Places y GobMX/DENUE;
- resultados, mapa, historial y paginación;
- persistencia, índices y puntos de riesgo;
- dependencias con Listas para contactar, Completar datos y Marketing.

La siguiente fase puede extraer componentes sin inventar contratos nuevos ni cambiar el comportamiento por accidente.

## 2. Inventario de superficies actuales

| Superficie | Archivo principal | Responsabilidad actual | Tamaño aproximado | Riesgo para el refactor |
|---|---|---|---:|---|
| Prospectos | `frontend/panel/src/app/prospeccion/prospectos/page.client.tsx` | Carga de datos, estado de filtros, vistas de grupos/prospectos, tabla, selección, acciones masivas, verificaciones, detalle contextual, historial, planner y navegación a métricas | 6,928 líneas | Muy alto: demasiadas responsabilidades y estado compartido |
| Cliente de Prospectos | `frontend/panel/src/lib/prospeccion/prospectos-client.ts` | Tipos, serialización de filtros, llamadas de listado/bootstrap, listas, contacto y campañas | 2,596 líneas | Alto: contrato amplio; debe conservarse mientras se extraen helpers |
| Buscar en Google | `frontend/panel/src/app/prospeccion/google-busqueda/google-busqueda-view.tsx` | Formulario Google, historial, resultados, filtros, selección, mapa, guardado de prospectos y borrado | 2,445 líneas | Alto: comparte patrones con DENUE, pero tiene filtros propios |
| Cliente Google | `frontend/panel/src/lib/prospeccion/google-client.ts` | Búsquedas, tipos, resultados, mapa, bounds, uso y guardado | 498 líneas | Medio: contrato relativamente delimitado |
| Buscar en GobMX/DENUE | `frontend/panel/src/app/prospeccion/denue-busqueda/denue-busqueda-view.tsx` | Formulario radial/avanzado, historial, catálogo SCIAN/geografía, resultados, filtros, selección, mapa y guardado | 3,047 líneas | Alto: mayor variedad de clasificadores y modos de búsqueda |
| Cliente DENUE | `frontend/panel/src/lib/prospeccion/denue-client.ts` | Búsquedas, jobs, catálogo, actividades, resultados, mapa, bounds y guardado | 571 líneas | Medio/alto: incluye flujo síncrono y asíncrono |
| BFF de panel | `frontend/panel/src/app/api/prospeccion/**` | Proxy autenticado hacia FastAPI | Varios archivos | Medio: debe mantener rutas actuales durante la extracción |
| API CRM | `backend/app/api/routes/crm.py` | Rutas de Google, DENUE, Prospectos, listas, enriquecimiento y contacto | Monolítica por dominio | Alto: no se debe mezclar la extracción visual con cambios de dominio |
| Repositorio CRM | `backend/app/repositories/crm.py` | Consultas de prospectos, resultados, filtros, indicadores y catálogos | Módulo amplio | Alto: contiene la semántica server-side que debe preservarse |

## 3. Contratos actuales de Prospectos

### 3.1 Listado principal

La vista usa principalmente:

```text
GET /api/prospeccion/prospectos
GET /api/prospeccion/prospectos/bootstrap
GET /api/prospeccion/prospectos/queries
```

El endpoint FastAPI correspondiente es `GET /prospeccion/prospectos` en `backend/app/api/routes/crm.py`. El listado delega en `CRMRepository.list_prospectos` y devuelve:

```text
ok
items
total
limit
offset
```

La paginación ya es server-side. El límite del schema actual es `1..500` y el offset está limitado a `10,000`.

### 3.2 Campos que actualmente regresan los prospectos

El repositorio selecciona, entre otros:

- identidad: `id`, `display_name`, `nombre_comercial`, `titulo`, `nombre` y apellidos;
- origen: `fuente`, `fuente_busqueda`, `busqueda_ref`, `busqueda_id`;
- clasificación: `actividad`, `estrato`, `segmento`, `google_primary_type`, `google_primary_type_display_name`, `google_types`;
- contacto: teléfonos, tipos de línea, `carrier_type`, correo principal/secundario y sitio web;
- validación: `lookup_status`, `email_lookup_status`, `website_lookup_status`, estado HTTP del sitio;
- ubicación: estado, municipio, localidad, vialidad, colonia, código postal y dirección completa;
- operación: `rating`, permisos de WhatsApp/llamada, fechas y contadores de envíos;
- información histórica adicional: `metadata` existente.

La UI agrega indicadores de contacto y, si se solicita, estados de scraper después de la consulta principal.

### 3.3 Filtros actualmente serializados por el frontend

`prospectos-client.ts` construye los parámetros server-side para:

- texto general;
- fuente;
- estado de verificación de teléfono, correo y sitio;
- relación entre dominio de correo y sitio;
- Segmento guardado, incluyendo selección múltiple;
- Actividad económica;
- tipo de línea: móvil, fija o VoIP;
- orden: recientes, nombre o diverso;
- etapa interna;
- tiene teléfono, correo o sitio;
- permiso de WhatsApp y permiso de llamada;
- estado y municipio;
- calificación mínima;
- tamaño/estrato;
- búsqueda de origen/consulta;
- fecha de creación;
- campaña;
- plantilla;
- con/sin envíos y canales con envío;
- cantidad mínima/máxima de envíos de Correo, WhatsApp y Voz;
- opt-out por canal;
- scraper.

La UI actual los muestra en un formulario único. F6.2 debe reordenarlos por intención sin eliminar capacidad.

## 4. Diferencias de clasificación por fuente

| Concepto visible | Fuente real | Campo/contrato actual | Observación |
|---|---|---|---|
| Segmento guardado | Clasificación manual/comercial de Tal-IA | `segmento` / `segmentos` | No debe confundirse con la actividad económica ni con Google |
| Actividad económica | GobMX/DENUE, SCIAN | `actividad`, códigos/nombres en búsquedas DENUE | Es la clasificación empresarial de DENUE; permite selección jerárquica y búsquedas avanzadas |
| Tipo de negocio | Google u otra fuente compatible | `google_primary_type`, `google_primary_type_display_name`, `google_types` | Google trabaja con clasificación/tipo, nombre y texto de búsqueda; no debe mezclarse con SCIAN |
| Búsqueda de origen | Consulta que generó el registro | `busqueda_ref`, `fuente_busqueda`, `query_sort`/metadatos | Debe permanecer vinculada a la búsqueda real, no a una etiqueta inventada en frontend |
| Tamaño de empresa | Principalmente GobMX/DENUE | `estrato` y `estrato_group` | No debe mostrarse como filtro propio de Google |
| Calificación | Google | `rating` / `min_rating` | No debe presentarse como tamaño empresarial |

### Brecha detectada: `tipo_negocio`

El campo `tipo_negocio` existe en `ProspectoListQuery`, `ProspectoFiltroPayload` y en la firma del repositorio, pero la ruta de listado actual no lo pasa explícitamente a `repo.list_prospectos`. El cliente de Prospectos tampoco lo expone en `ListProspectosParams` como filtro funcional.

Esto debe resolverse en F6.2 como una corrección de contrato, no mediante renombrar columnas. Antes de implementarlo se debe confirmar si la fuente canónica será `google_primary_type_display_name`, `google_primary_type`, o ambas mediante la misma regla ya prevista en el repositorio.

## 5. Google Places: contrato y comportamiento actual

### Búsqueda e historial

```text
POST /api/prospeccion/google/busquedas
GET  /api/prospeccion/google/busquedas
GET  /api/prospeccion/google/tipos
GET  /api/prospeccion/google/usage
```

La vista permite definir texto, clasificación/tipos Google, ubicación, radio, idioma y región. Conserva historial de búsquedas y permite abrir una búsqueda para consultar sus resultados.

### Resultados

```text
GET /api/prospeccion/google/resultados
GET /api/prospeccion/google/resultados/map
GET /api/prospeccion/google/resultados/bounds
```

Filtros server-side actuales de resultados:

- texto;
- teléfono presente/ausente;
- sitio presente/ausente;
- calificación mínima;
- actividad textual derivada del resultado;
- orden reciente, calificación o distancia.

La tabla usa paginación con `limit/offset`; el mapa utiliza bounding box, zoom y un límite de puntos con indicador de truncado.

### Guardado

La vista permite guardar prospectos seleccionados o filtrados. La selección se realiza sobre resultados Google, pero el guardado debe seguir siendo la transición explícita de resultado de búsqueda a prospecto.

## 6. GobMX/DENUE: contrato y comportamiento actual

### Búsqueda e historial

```text
POST /api/prospeccion/denue/busquedas
GET  /api/prospeccion/denue/busquedas
GET  /api/prospeccion/denue/jobs/{job_id}
POST /api/prospeccion/denue/jobs/{job_id}/cancel
GET  /api/prospeccion/denue/catalogos
GET  /api/prospeccion/denue/actividades
GET  /api/prospeccion/denue/scian/clase-indice
```

DENUE soporta búsqueda radial y modos avanzados por actividad, tamaño/estrato, estado y municipio. Puede ejecutar jobs asíncronos y la UI hace polling de su estado.

### Resultados

```text
GET /api/prospeccion/denue/resultados
GET /api/prospeccion/denue/resultados/map
GET /api/prospeccion/denue/resultados/bounds
```

Filtros server-side actuales:

- texto;
- actividad económica/SCIAN;
- tamaño/estrato;
- teléfono, correo y sitio presentes/ausentes;
- coincidencia de datos de contacto: todos o cualquiera;
- estado y municipio;
- orden reciente o distancia.

La tabla usa `limit/offset`; el mapa usa bounding box, zoom, filtros y límite de puntos con indicador de truncado.

### Diferencia que debe conservarse

Google y DENUE pueden compartir tabla, mapa, selección y acciones de guardado, pero no comparten el significado de sus clasificadores:

- Google: nombre/texto, tipos de negocio y calificación.
- DENUE: actividad económica SCIAN, tamaño/estrato y geografía empresarial.

F6.3 puede compartir el workspace visual, pero debe recibir adaptadores de fuente que definan sus filtros y etiquetas.

## 7. Persistencia e índices identificados

La línea base actual reutiliza estas estructuras existentes:

| Responsabilidad | Persistencia actual |
|---|---|
| Prospectos guardados | `public.prospeccion_prospectos` |
| Búsquedas/resultados generales | `public.busquedas` y `public.resultados`, además de vistas específicas de resultados |
| Búsqueda avanzada DENUE y jobs | tablas/servicios de búsqueda DENUE y `prospeccion_buscador_jobs` cuando aplica |
| Listas dinámicas | `public.prospeccion_contacto_listas`, con `filtros` existente |
| Envíos y destinatarios | `public.prospeccion_contacto_batch` y `public.prospeccion_contacto_envio` |
| Historial de contacto | `public.prospeccion_contactos_log` |

Índices relevantes ya presentes o añadidos por migraciones existentes:

- búsqueda y fuente de prospecto;
- organización, estado/municipio, código postal y clasificación Google;
- estados de verificación de sitio;
- contadores de envíos por Correo, WhatsApp, Voz y total;
- organización y nombre de listas;
- batch, prospecto y canal de los envíos.

La revisión de rendimiento debe comprobar las consultas reales con `EXPLAIN` antes de agregar índices. F6.0 no agrega ninguno.

## 8. Paginación, mapa y límites actuales

### Prospectos

- Listado server-side.
- `limit` máximo actual: 500.
- `offset` máximo actual: 10,000.
- `bootstrap` combina listado, metadatos y preferencias.
- El backend agrega indicadores de contacto después del listado principal.

### Google y DENUE

- Resultados server-side con `limit/offset`.
- Los endpoints de resultados aceptan límites altos, pero el frontend usa páginas pequeñas.
- El mapa no intenta pintar todos los registros: usa bounding box/zoom y marca truncado.
- Las opciones de actividad y metadatos se cargan bajo demanda o por búsqueda activa.

### Riesgos

- Cambiar el tamaño de página en la UI sin conservar el contrato puede provocar respuestas 422 o cargas excesivas.
- El mapa y la tabla no deben asumir que el total de puntos visibles equivale al total de resultados.
- Las opciones de filtros deben actualizarse al cambiar fuente, fecha o consulta sin borrar silenciosamente selecciones válidas.

## 9. Dependencias con otros módulos

| Dependencia | Contrato actual | Regla para F6 |
|---|---|---|
| Listas para contactar | `prospeccion_contacto_listas` y filtros reutilizables | Prospectos puede originar reglas; no debe convertir una selección temporal de IDs en lista dinámica sin indicarlo |
| Completar datos | acciones de verificación de teléfonos, correos y sitios | Extraer acciones sin cambiar sus endpoints ni estados |
| Marketing | campañas, contenidos/plantillas, batches y destinatarios | Las acciones masivas deben conservar trazabilidad de lista, campaña y envío |
| Métricas | `/prospeccion/metricas` y drill-down | No duplicar contadores ni crear una segunda fuente de verdad |
| CRM | etapas, contactos, oportunidades y atribución | Mantener la separación entre prospecto, contacto y oportunidad |

## 10. Decisiones para la siguiente subfase

F6.1 puede comenzar con extracción puramente estructural:

1. Mantener el contrato de datos y las URLs actuales.
2. Extraer la barra superior y estado de vista.
3. Extraer el bloque de filtros sin cambiar etiquetas ni semántica.
4. Extraer tabla, selección y acciones masivas.
5. Extraer detalle/historial contextual.
6. Extraer paginación y estados de carga/error/vacío.
7. Ejecutar pruebas después de cada extracción.

No se debe corregir todavía la brecha de `tipo_negocio`, reorganizar visualmente todos los filtros ni unificar Google/DENUE en el mismo cambio. Esas tareas pertenecen a F6.2 y F6.3.

## 11. Criterios de cierre de F6.0

- [x] Se localizaron las vistas y clientes actuales.
- [x] Se localizaron los endpoints de Google, DENUE y Prospectos.
- [x] Se documentaron filtros y paginación existentes.
- [x] Se documentaron diferencias Google/DENUE.
- [x] Se identificaron tablas, relaciones e índices relevantes.
- [x] Se identificó la brecha de `tipo_negocio`.
- [x] Se documentaron riesgos y dependencias.
- [ ] Revisión visual en navegador con el tenant de trabajo.
- [ ] Aprobación de inicio de F6.1.

**Conclusión:** F6.0 deja una línea base técnica suficiente para separar el componente de Prospectos de forma incremental. El siguiente trabajo autorizado es F6.1; no requiere migración de base de datos ni nuevos endpoints por nomenclatura.
