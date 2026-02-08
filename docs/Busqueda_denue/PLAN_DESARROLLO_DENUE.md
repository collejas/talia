# Plan y desarrollo: búsqueda avanzada DENUE

## Objetivo
Documentar el diseño y los pasos necesarios para agregar a `/prospeccion/denue-busqueda` un modo "Búsqueda avanzada" sin romper la funcionalidad radial actual. El objetivo es tener claro qué se debe construir en frontend, qué datos del backend se necesitan y cómo se relaciona con el catálogo SCIAN y los endpoints de DENUE.

## Alcance
1. Mantener el modo estándar (palabra clave + centro + radio) sin cambios.
2. Agregar un modal "Búsqueda avanzada" con toggles por sección y campos que permiten:
   - Capturar búsquedas textuales (nombre, calle, colonia, CP).
   - Explorar el árbol SCIAN (sector → subsector → rama → subrama → clase → índice). Cada nodo sale con checkboxes y toggles para expandir el siguiente nivel.
   - Filtrar por tamaño de establecimiento (0–5, 6–10, ... 251+), con opción "Todos".
   - Seleccionar la geografía (estados y municipios) usando los catálogos almacenados en `backend/app/data`.
3. Al confirmar el modal, enviar los filtros a un endpoint que decida qué método DENUE usar (`Buscar`, `BuscarEntidad`, `BuscarAreaAct`, `BuscarAreaActEstr`) y registrar la metadata.
4. Actualizar la UI para mostrar qué tipo de búsqueda se usó y permitir guardar/replicar filtros.

## Datos de entrada disponibles
- Catálogos SCIAN: tablas `scian_sector`, `scian_subsector`, `scian_rama`, `scian_subrama`, `scian_clase`, `scian_clase_indice`, `scian_clase_embeddings`. La tabla `scian_vector_store_progress` documenta estado de ingestión.
- Árbol geográfico: la carpeta `backend/app/data/geo` expone un manifiesto (`municipios/manifest.json`) con los 32 estados (claves `01`–`32`) y apunta a geojson por estado (`municipios_XX_clean.geojson`). El helper `backend/app/data/geo/locations.py` carga el manifiesto y los geojson para resolver nombres y códigos de municipios (`cve_mun`), por lo que podemos reutilizar esos JSON para poblar el árbol Estado → Municipio/Localidad del modal.
- Opciones de estrato/tamaño: valores 1..7 (SEGÚN DENUE), aunque en UI se muestran rangos descriptivos.
- Métodos DENUE: `Buscar` (radio), `BuscarEntidad` (2 dígitos entidad), `BuscarAreaAct`, `BuscarAreaActEstr`, `Cuantificar` (pero no se incluye aquí). El plan debe mapear qué combinación de filtros usa cada endpoint.

## Diseño del modal avanzado
1. **Toggle "Búsqueda"**: al desplegar, cuatro campos (nombre/razón, calle/avenida, colonia/fracc, CP). Estos se pueden concatenar cuando se llame a la API o guardar separados en `meta`.
2. **Toggle "Actividad Económica"**: incluye input de texto para búsquedas ad-hoc y un visor jerárquico que hojea los nodos SCIAN. Cada nodo (sector/subsector/rama/subrama/clase/ítem) tiene:
   - Checkbox para selección múltiple.
   - Botón/toggle para expandir el siguiente nivel con animaciones sencillas.
   - Resumen del número de subitems (opcional).
3. **Toggle "Tamaño del establecimiento"**: lista de checkboxes con las siete categorías y "Todos los tamaños". Guardar la clave (0–7) que el parámetro `Estrato` de los endpoints acepta.
4. **Toggle "Área geográfica"**: representaciones en árbol Estado → Municipio (y eventualmente localidad). Cada nivel también tiene checkbox y toggle para desglosar municipios. Al confirmar, derivar claves (por ejemplo, `01`, `01001`, etc.).
5. Finalmente, botones "Aplicar filtros" y "Cancelar". "Aplicar" manda la composición al backend.

## Backend y routing
1. Extender `CreateDenueSearchPayload`/`DenueBusquedaPayload` para incluir:
   - `modo`: `"radio" | "entidad" | "area_act" | "area_act_estr"`.
   - Campos opcionales: `texto`, `calle`, `colonia`, `cp`, `entidad`, `municipio`, `actividad_codigos`, `estrato_ids` (lista de 1..7), `geografia` (lista de claves), `meta_avanzado`.
2. En `DenueClient`, mantener `search` para radio y agregar métodos `search_by_entidad`, `search_area_act`, `search_area_act_estr` para construir las URLs de los diferentes métodos (ver instructivo). Cada método debe normalizar y devolver la misma estructura de registros. Reutilizar `normalize_denue_place`.
3. El endpoint `crear_busqueda_denue` decide qué método invocar según `payload.modo` y qué filtros están presentes; publica la metadata en `p_meta` y marca `meta` en `busquedas` para saber qué filtros se usaron.
4. Limitar la paginación: `BuscarAreaAct*` puede devolver muchos resultados, así que en el frontend hay que controlar offset/limit (DENUE usa `registro inicial/final`), probablemente con `limit=1000` y `registroInicial` multiplo de `limit`.
5. Guardar en `meta` o `busquedas.meta` los parámetros usados para poder re-ejecutar el mismo filtro desde el historial.

## Acciones posteriores
1. Crear componente del modal y árbol SCIAN `frontend/panel/src/app/prospeccion/denue-busqueda/advanced-search-modal.tsx` (o similar). Reusar componentes de UI (`Accordion` o `Disclosure`) para los toggles, `CheckboxTree` para árbol.
2. Ajustar `denue-client.ts` para poder enviar nuevos filtros y para que el UI sepa cuándo usar el modo avanzado vs. el estándar.
3. Documentar en este archivo la forma en que se deben mapear los filtros del modal a las URLs `BuscarEntidad`, `BuscarAreaAct` y `BuscarAreaActEstr` (incluir ejemplos). También anotar qué tablas SCAN alimentan el árbol.
4. Definir pruebas automáticas para el backend: asegurar que `DenueClient` construye correctamente las URLs y que `crear_busqueda_denue` guarda la metadata.

## Seguimiento
- [ ] Revisar los datos de `backend/app/data` para poder cargar estados y municipios dinámicamente. (Responsable: frontend) – plazo immediate. 
- [ ] Diseñar el mock del árbol SCIAN para la búsqueda avanzada (Responsable: frontend). 
- [ ] Extender `DenueClient` con nuevos métodos y propagar `modo` al RPC de `crear_busqueda`. (Responsable: backend) 
- [ ] Validar que los resultados normalizados se muestren y se puedan guardar como prospectos. (Responsable: QA)

## Referencias
- `docs/Busqueda_denue/INSTRUCTIVO_DENUE.md` – repertorio de endpoints y parámetros. 
- Tablas `scian_*` y `busquedas`/`resultados` del esquema Supabase (ver migraciones ya aplicadas). 
- `backend/app/data` – catálogos geográficos de estados/municipios.
