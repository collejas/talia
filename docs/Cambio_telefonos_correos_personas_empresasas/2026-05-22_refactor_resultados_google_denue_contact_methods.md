# Refactor de fuentes: Google Places, DENUE y `resultados`

## Objetivo

Hacer que las fuentes de prospección no se queden solo en `phone/email`, sino que también transporten los nuevos alias de contacto:

- `correo_principal`
- `correo_secundario`
- `telefono_principal_e164`
- `telefono_principal_tipo_linea`
- `telefono_principal_extension`
- `telefono_movil_1_e164`
- `telefono_movil_1_tipo_linea`

## Qué se cambió

### Google Places

- `normalize_place_for_result()` ahora emite los alias nuevos además de `phone/email`.
- El job de Google Places sigue insertando en `resultados`, pero ahora el payload ya trae los nuevos nombres.

### DENUE

- `normalize_denue_place()` ahora emite los mismos aliases nuevos.
- DENUE sigue alimentando `resultados`, pero ya no depende solo de `phone/email`.

### `public.resultados`

- Se agregaron columnas reales para los campos nuevos.
- Se agregó backfill desde los campos viejos y desde `raw`.
- Se actualizó `upsert_resultados_lote` para escribir los nuevos campos.
- Se recrearon las vistas `v_denue_contactables` y `v_google_places_contactables` para exponer los nuevos aliases.

### Repositorio CRM

- `list_contactables_by_ids()` ahora solicita los nuevos campos desde ambas vistas.
- `_build_prospecto_from_contactable()` ya puede convertir desde `correo_principal` y `telefono_principal_e164` sin depender solo de `email/phone`.

## Por qué se hizo

- Los resultados de búsqueda son la fuente intermedia entre Google/DENUE y los prospectos.
- Si esa capa no conoce los nuevos alias, la conversión a prospecto nunca los verá.
- Esto evita que la captura dependa de un único par legado `phone/email`.

## Verificación

- Migración aplicada en Supabase: OK
- `py_compile` backend: OK

