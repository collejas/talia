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
