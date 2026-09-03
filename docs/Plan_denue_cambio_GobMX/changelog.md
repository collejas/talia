# Changelog: cambio de nomenclatura DENUE → GobMX

## 2026-09-03 — Documentación inicial

### Estado

Plan documentado. No se han modificado frontend, backend, base de datos ni datos operativos.

### Revisión realizada

- Se revisó `frontend/panel/src/app/prospeccion/denue-busqueda`.
- Se revisó `frontend/panel/src/app/prospeccion/prospectos`.
- Se revisaron componentes compartidos de navegación, campañas y embudo.
- Se revisó el cliente frontend de prospección.
- Se revisaron:
  - `docs/Busqueda_denue`.
  - `docs/Plan_mapa_conversion`.
  - `docs/Plan_personas_empresa_contactos`.
  - `docs/Prospeccion`.

### Hallazgos registrados

- El frontend contiene aproximadamente 252 apariciones de `denue` en 30 archivos.
- Las apariciones mezclan etiquetas visibles, contratos internos, rutas, tipos, funciones y configuración.
- La fuente de prospectos se persiste como `fuente = "denue"`.
- El filtro de fuente de Prospectos utiliza el valor interno `denue`.
- El guardado de resultados desde la búsqueda hacia Prospectos envía `fuente: "denue"`.
- Las rutas frontend y backend utilizan `/prospeccion/denue/...`.
- La configuración y los secretos utilizan claves como `denue.base_url` y `denue.token`.
- Las métricas y límites utilizan identificadores técnicos que contienen `denue`.
- Las etiquetas visibles se pueden cambiar a GobMX sin migrar datos si se mantiene el valor interno.
- `Plan_mapa_conversion` y `Plan_personas_empresa_contactos` no contienen referencias literales a DENUE y no requieren reemplazo global.

### Decisión documentada

Aplicar inicialmente esta separación:

```text
Etiqueta visible: GobMX
Contrato interno: denue
```

No se autoriza todavía un renombrado de rutas, endpoints, tipos, tablas, RPCs, claves de configuración o valores persistidos.

### Pendientes

- Confirmar si la ruta visible seguirá siendo `/prospeccion/denue-busqueda`.
- Definir textos finales para títulos, ayudas, errores, límites y mensajes de seguimiento.
- Crear un catálogo central de etiquetas de fuente.
- Actualizar primero las etiquetas visibles del frontend.
- Revisar las etiquetas de campañas, plantillas y embudo.
- Actualizar después la documentación de `Busqueda_denue` y `Prospeccion`.
- Ejecutar validación estática y pruebas funcionales antes de publicar.

## 2026-09-03 — Fases 1 y 2: nomenclatura visible del frontend

### Estado

Implementado localmente. No se modificaron backend, base de datos, rutas API ni valores persistidos.

### Cambios realizados

- Se creó `frontend/panel/src/lib/prospeccion/source-labels.ts` como catálogo central de etiquetas visibles.
- La fuente interna `denue` ahora se presenta como `GobMX` en el panel.
- Se actualizaron los textos visibles de `prospeccion/denue-busqueda`:
  - título y navegación;
  - descripciones y ayudas;
  - mensajes de cola, éxito, cancelación y error;
  - resultados crudos;
  - búsqueda avanzada y filtros;
  - guardado de prospectos.
- Se actualizó la fuente visible en `prospeccion/prospectos`.
- Se actualizaron etiquetas visibles de origen en campañas, plantillas, embudo y navegación de prospección.
- Se actualizaron etiquetas administrativas de configuración y límites comerciales.

### Compatibilidad conservada

- `fuente: "denue"` continúa enviándose al backend.
- Se conservaron las rutas `/prospeccion/denue-busqueda` y `/api/prospeccion/denue/...`.
- Se conservaron tipos, funciones, jobs, secretos, límites y claves internas con `denue`.
- No se migraron registros históricos ni metadata.

### Validación inicial

- `git diff --check`: correcto para los cambios rastreados; también se revisaron archivos nuevos sin espacios finales.
- Lint, TypeScript y prueba funcional de navegador: pendientes de ejecutar/verificar según disponibilidad del entorno.

### Pendientes

- Revisar visualmente las dos vistas en navegador.
- Ejecutar lint y TypeScript con las dependencias instaladas.
- Ejecutar React Doctor y revisar sus hallazgos.
- Actualizar la documentación de `docs/Busqueda_denue` y `docs/Prospeccion`.
- Probar búsqueda, filtros, guardado, fuente GobMX y seguimiento end-to-end.

## 2026-09-03 — Armonización de etiquetas generadas por backend

### Estado

Implementado localmente. El valor persistido continúa siendo `denue`.

### Cambios realizados

- `Prospección – DENUE` ahora se devuelve como `Prospección – GobMX`.
- `Denue` ahora se devuelve como `GobMX` en la etiqueta corta de origen del pipeline.
- `Denue` ahora se devuelve como `GobMX` en la resolución de `canal_origen` del flujo de prospectos.
- El servicio de promoción automática también genera `Prospección – GobMX` y `GobMX` para los datos derivados de seguimiento.

### Compatibilidad conservada

- No se cambiaron los literales internos `fuente = "denue"`.
- No se cambiaron rutas, endpoints, tablas, RPCs, tipos ni claves de configuración.
- El cambio afecta únicamente etiquetas legibles derivadas para presentación y seguimiento.

### Validación realizada

- Los helpers backend devolvieron `Prospección – GobMX` y `GobMX` para una fila con `fuente = "denue"`.
- `compileall` de `crm.py` y `prospeccion_auto_promoter.py`: correcto.
- `git diff --check`: correcto.
- La suite backend enfocada se ejecutó: 21 pruebas seleccionadas; hubo fallos preexistentes/no relacionados en cotizaciones, payloads de actualización y dobles de repositorio/logging.

### Pendientes

- Probar una respuesta real de Prospectos y del pipeline para confirmar que no se muestra la etiqueta anterior.
- Ejecutar lint y TypeScript del panel cuando se instalen sus dependencias.
- Revisar visualmente las dos vistas en navegador.

## 2026-09-03 — Normalización visual en mapa de conversión

### Estado

Implementado localmente. No se modificaron visitas, UTMs ni registros históricos.

### Cambios realizados

- El mapa traduce visualmente `denue`, `DENUE`, `GobMX` y variantes de prospección a `GobMX`.
- Se actualizó el selector de origen de visita.
- Se actualizó el resumen UTM y el detalle geográfico.
- La tabla `Vistas Web` ahora normaliza `Origen contacto` y `Origen de la promoción`.
- La etiqueta principal `Visita / sesión` también normaliza filas históricas cuyo encabezado era `Denue`.
- La construcción de filas de `Vistas Web` también normaliza `type` (`Origen / ubicación`), que se alimenta de `contacto_origen`.
- Los valores originales continúan utilizándose para filtros, consultas y trazabilidad.

### Validación

- `git diff --check`: correcto.
- React Doctor sobre los cinco archivos modificados: 100/100, sin incidencias.

### Pendientes

- Validar visualmente la vista con datos históricos en navegador.
- Auditar si existen copias históricas textuales en metadata de contactos u oportunidades que requieran backfill selectivo.
