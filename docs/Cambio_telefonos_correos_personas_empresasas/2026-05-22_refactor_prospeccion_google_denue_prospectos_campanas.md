# Refactor de prospección: Google, DENUE, Prospectos y Campañas

## Objetivo

Alinear la prospección con los nuevos campos de contacto sin romper la captura histórica basada en `phone/email`.

## Qué se cambió

### `prospeccion/google-busqueda`

- La vista y el mapa ahora prefieren:
  - `telefono_principal_e164`
  - `correo_principal`
  - `correo_secundario`
- Si esos alias todavía no existen en un resultado, se mantiene fallback a `phone/email`.
- Al guardar prospectos desde Google, el backend persiste también los alias nuevos en `prospeccion_prospectos`.

### `prospeccion/denue-busqueda`

- La vista de resultados ahora muestra primero los alias nuevos y luego cae a `phone/email`.
- El guardado de prospectos desde DENUE usa el mismo puente backend que Google.

### `prospeccion/prospectos`

- La lista y el modal de conversión/edición ya leen primero:
  - `correo_principal`
  - `correo_secundario`
  - `telefono_principal_e164`
  - `telefono_movil_1_e164`
- Se conserva compatibilidad con `email`, `phone` y `phone_e164`.
- La conversión a contacto sigue escribiendo en `personas` y ahora también arrastra los alias nuevos al crear el prospecto base.

### `prospeccion/campanas`

- La previsualización de plantillas ahora toma primero los campos nuevos del prospecto.
- Si aún hay registros viejos, se mantiene fallback a los aliases anteriores.

## Qué cambió en backend y base de datos

- `prospeccion_prospectos` fue ampliada con:
  - `correo_principal`
  - `correo_secundario`
  - `telefono_principal_e164`
  - `telefono_principal_tipo_linea`
  - `telefono_principal_extension`
  - `telefono_movil_1_e164`
  - `telefono_movil_1_tipo_linea`
- Se agregó un trigger de sincronización para mantener compatibilidad entre los nombres viejos y nuevos.
- El dedupe por correo y teléfono ahora revisa también los aliases nuevos.

## Por qué se hizo así

- Google y DENUE son fuentes de entrada, no la fuente final de verdad del contacto.
- La fuente final debe quedar en `prospeccion_prospectos` y luego en `personas` cuando se convierte.
- Si se retiraban los aliases viejos de golpe, se rompían:
  - capturas históricas
  - deduplicación
  - previsualización de campañas
  - conversiones automáticas del asistente

## Verificación

- `python3 -m py_compile` sobre backend: OK
- `eslint` del panel sobre los archivos afectados: OK
- `react-doctor` sobre `frontend/panel`: 100/100
- Migración aplicada en Supabase: OK

