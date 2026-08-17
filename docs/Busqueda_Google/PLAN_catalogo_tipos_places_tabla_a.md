# Plan: catálogo bilingüe de tipos Google Places Tabla A

## 1. Objetivo

Mejorar la vista `/prospeccion/google-busqueda` para que, cuando el usuario seleccione la estrategia **Cercanía / Nearby**, no tenga que escribir manualmente códigos como `restaurant` o `car_dealer`.

La vista deberá mostrar las clasificaciones de Google Places en castellano, agrupadas por categoría madre, y permitir seleccionar uno o varios tipos hijos. El sistema seguirá enviando a Google los códigos oficiales en inglés.

Fuente inicial del catálogo:

```txt
/var/www/talia/docs/Busqueda_Google/google_places_table_a_bilingual.csv
```

Fuente oficial de referencia:

<https://developers.google.com/maps/documentation/places/web-service/place-types?hl=es-419>

## 2. Estado actual revisado

Actualmente el flujo ya soporta la estrategia `nearby` y recibe una lista manual de `included_types`.

Flujo actual:

1. La vista permite escribir tipos separados por coma.
2. El frontend transforma el texto en `included_types`.
3. El backend exige al menos un tipo cuando la estrategia es `nearby`.
4. El job de Google Places envía esos valores como `includedTypes`.
5. La búsqueda guarda los tipos seleccionados dentro de `busquedas.meta.included_types`.

Archivos relacionados:

- `frontend/panel/src/app/prospeccion/google-busqueda/google-busqueda-view.tsx`
- `frontend/panel/src/lib/prospeccion/google-client.ts`
- `backend/app/api/routes/crm.py`
- `backend/app/services/google_places.py`
- `backend/app/services/google_search_jobs.py`
- `supabase/migrations/`

El cambio no requiere modificar inicialmente el contrato de creación de búsquedas ni la tabla `busquedas`, porque el flujo existente ya transporta y conserva los códigos seleccionados.

## 3. Decisión arquitectónica

Crear un catálogo global de tipos Google Places en PostgreSQL/Supabase.

No será una tabla por tenant ni una configuración editable por organización. La clasificación de Google es una referencia común para todo el sistema.

El CSV se utilizará como fuente de carga inicial mediante una migración o seed. No se debe leer el CSV desde el filesystem en cada búsqueda ni depender de que el archivo exista en producción para que la UI funcione.

### Motivos para usar una tabla

- Validar en backend que los códigos enviados pertenecen a la Tabla A.
- Evitar códigos inválidos escritos manualmente.
- Mostrar castellano e inglés sin duplicar el catálogo en frontend y backend.
- Ordenar y agrupar las categorías de manera consistente.
- Activar o desactivar tipos retirados sin borrar históricos.
- Registrar la versión o fecha de la fuente utilizada.
- Permitir actualizar el catálogo cuando Google agregue o retire tipos.

## 4. Modelo de datos propuesto

Tabla sugerida:

```txt
public.google_places_types
```

Columnas explícitas recomendadas:

| Columna | Tipo sugerido | Regla / propósito |
|---|---|---|
| `id` | `bigint generated always as identity` | Identificador interno |
| `categoria_codigo` | `text` | Identificador estable de la categoría madre |
| `categoria_nombre_en` | `text` | Nombre original de la categoría |
| `categoria_nombre_es` | `text` | Nombre visible en castellano |
| `codigo_google` | `text` | Código oficial enviado a Google, por ejemplo `restaurant` |
| `nombre_en` | `text` | Nombre original del tipo |
| `nombre_es` | `text` | Nombre visible en castellano |
| `agregado_en_google` | `boolean` | Indica si el registro fue agregado recientemente según la fuente |
| `tabla_google` | `text` | Debe ser `A` para este catálogo |
| `activo` | `boolean` | Permite retirar tipos sin borrar registros |
| `orden_categoria` | `integer` | Orden de las categorías madre |
| `orden_tipo` | `integer` | Orden de los tipos dentro de la categoría |
| `fuente_url` | `text` | URL oficial del catálogo |
| `version_catalogo` | `text` | Fecha o versión de la carga |
| `creado_en` | `timestamptz` | Auditoría |
| `actualizado_en` | `timestamptz` | Auditoría |

La categoría madre será un agrupador de UI. No debe enviarse automáticamente como tipo de búsqueda salvo que también aparezca como `codigo_google` válido en el CSV y en la documentación de Google.

### Constraints e índices

- `PRIMARY KEY (id)`.
- `UNIQUE (codigo_google)`.
- `CHECK (tabla_google = 'A')`.
- `CHECK (length(trim(codigo_google)) > 0)`.
- `CHECK (length(trim(nombre_es)) > 0)`.
- `CHECK (orden_categoria >= 0)`.
- `CHECK (orden_tipo >= 0)`.
- Índice para `(activo, orden_categoria, orden_tipo)`.
- Índice para `(categoria_codigo, activo, orden_tipo)`.
- Índice o unicidad adicional sobre `(categoria_codigo, codigo_google)` si se conserva la categoría como clave de agrupación.

No se deben agregar columnas `metadata`, `config`, `payload` o `jsonb` para representar la estructura principal de este catálogo.

## 5. Carga inicial desde el CSV

Antes de insertar datos se deberá validar el archivo:

- Encabezados esperados.
- Codificación UTF-8.
- 478 filas de tipos más encabezado, según la copia revisada.
- Códigos Google no vacíos.
- Códigos Google sin duplicados.
- Nombres en inglés y castellano no vacíos.
- Todos los registros con `table = A`.
- Correspondencia entre `added_2026_02_12` y `agregado_en_google`.
- URL de fuente oficial.

La migración/seed deberá ser idempotente. Si se ejecuta nuevamente, debe actualizar los textos, orden y estado sin duplicar tipos.

La fecha `2026-02-12` debe quedar documentada como versión de la carga inicial, porque Google marca esos tipos como agregados en esa fecha en su documentación.

## 6. API propuesta

Crear un endpoint de solo lectura para el panel:

```http
GET /crm/prospeccion/google/tipos
```

El BFF del panel deberá exponerlo mediante una ruta equivalente bajo `/api/prospeccion/google/...`, siguiendo el patrón actual del panel.

### Parámetros posibles

```txt
activo=true
tabla=A
search=texto opcional
```

No se necesita paginación para la carga completa inicial si el endpoint devuelve únicamente los aproximadamente 478 registros; aun así, el backend debe limitar el tamaño máximo y devolver una respuesta consistente.

### Respuesta sugerida

```json
{
  "ok": true,
  "items": [
    {
      "categoria_codigo": "food_and_drink",
      "categoria_nombre_es": "Comidas y bebidas",
      "categoria_nombre_en": "Food and Drink",
      "codigo_google": "restaurant",
      "nombre_es": "Restaurante",
      "nombre_en": "Restaurant",
      "agregado_en_google": false,
      "tabla_google": "A",
      "activo": true,
      "orden_categoria": 8,
      "orden_tipo": 1
    }
  ],
  "total": 1,
  "version_catalogo": "2026-02-12"
}
```

### Validación del endpoint de búsquedas

El endpoint `POST /crm/prospeccion/google/busquedas` deberá validar, cuando `strategy = nearby`, que cada valor de `included_types`:

1. Exista en `google_places_types`.
2. Esté activo.
3. Pertenezca a `tabla_google = 'A'`.

Si alguno no es válido, responder con un error estable, por ejemplo:

```json
{
  "error": {
    "code": "google_place_type_invalid",
    "message": "Una o más clasificaciones de Google Places no son válidas."
  }
}
```

La respuesta no debe exponer consultas SQL, stack traces ni detalles internos.

## 7. Cambio de UI/UX

En la vista `/prospeccion/google-busqueda`:

### Estrategia Nearby

Reemplazar el `Input` actual de texto libre por un selector jerárquico:

```txt
Clasificación de Google Places

Buscar clasificación...

▾ Automotriz
    □ Concesionario de automóviles
    □ Taller de reparación de automóviles
    □ Gasolinera

▾ Comidas y bebidas
    □ Restaurante
    □ Restaurante mexicano
    □ Cafetería
```

Comportamiento esperado:

- Mostrar nombres en castellano.
- Permitir seleccionar varios tipos.
- Mostrar la categoría madre como agrupador visual.
- Permitir expandir y contraer categorías.
- Incluir búsqueda por nombre castellano, nombre inglés y código Google.
- Mostrar un resumen de selecciones, por ejemplo `3 clasificaciones seleccionadas`.
- Permitir limpiar la selección.
- Enviar solo `codigo_google` al backend.
- No permitir que una categoría madre se envíe por error como código.

### Estrategia Texto

Conservar el campo `Texto a buscar` sin cambios funcionales. El selector de clasificaciones debe quedar deshabilitado o no visible cuando la estrategia sea `text`.

### Estados obligatorios

- Cargando catálogo.
- Catálogo vacío.
- Error al cargar catálogo.
- Catálogo cargado.
- Búsqueda sin selección.
- Selección válida.
- Error de validación devuelto por backend.

El selector debe reutilizar componentes existentes de shadcn/ui/Radix y evitar cargar el catálogo repetidamente en cada render.

## 8. Compatibilidad histórica

No se deben modificar ni recalcular búsquedas anteriores.

- `busquedas.meta.included_types` debe conservar los códigos históricos.
- Las búsquedas antiguas pueden mostrar sus códigos aunque un tipo haya sido desactivado posteriormente.
- Desactivar un tipo solo debe impedir nuevas búsquedas.
- Los resultados existentes y sus campos `google_primary_type`, `google_primary_type_display_name` y `google_types` no deben alterarse.
- La tabla nueva no debe introducir una migración destructiva sobre `busquedas` o `resultados`.

## 9. Seguridad y permisos

- El catálogo es de lectura y no debe ser editable desde la vista de prospección.
- El endpoint debe requerir autenticación del panel.
- Debe respetar el patrón de permisos existente para prospección; como mínimo, el usuario debe tener permiso de consulta de búsquedas.
- No debe aceptar `organizacion_id` desde el frontend para consultar el catálogo, porque es global.
- La validación de tipos debe estar en backend, no únicamente en React.
- El CSV, la migración y la respuesta API no deben contener secretos.
- No registrar tokens ni payloads completos en logs.

## 10. Fases de implementación

### Fase 1: preparación y validación del catálogo

- Revisar definitivamente el CSV.
- Definir la versión de carga inicial.
- Crear script o proceso idempotente de importación.
- Confirmar que los 478 códigos coinciden con la Tabla A vigente.

### Fase 2: base de datos

- Crear migración para `public.google_places_types`.
- Agregar constraints e índices.
- Cargar el catálogo inicial.
- Revisar RLS y permisos de lectura.
- Verificar conteos, duplicados y códigos inválidos.

### Fase 3: backend y API

- Crear schema de respuesta del catálogo.
- Crear endpoint de lectura.
- Crear acceso de repositorio siguiendo el patrón existente.
- Validar `included_types` contra el catálogo activo en nuevas búsquedas Nearby.
- Mantener compatibilidad con búsquedas `text`.
- Agregar errores de API estables y seguros.

### Fase 4: BFF y cliente TypeScript

- Crear la ruta proxy del panel.
- Crear tipos TypeScript explícitos.
- Implementar carga con `cache: no-store` o la estrategia de caché apropiada.
- Manejar expiración de sesión y errores como en los clientes existentes.

### Fase 5: UI

- Crear el selector jerárquico reutilizable.
- Reemplazar el input manual únicamente para Nearby.
- Mantener un estado interno como `Set<string>` para los códigos seleccionados.
- Convertir el conjunto a `included_types` al enviar.
- Mostrar nombres castellanos y conservar el código solo como dato técnico secundario.

### Fase 6: pruebas y verificación

- Probar carga del catálogo.
- Probar selección de una clasificación.
- Probar selección múltiple.
- Probar búsqueda y filtrado dentro del selector.
- Probar envío de códigos oficiales.
- Probar rechazo de un código inválido enviado manualmente.
- Probar estrategia `text`.
- Probar usuarios sin permiso.
- Probar búsquedas históricas.
- Ejecutar pruebas backend, typecheck/lint del panel y revisión de diff.

## 11. Criterios de aceptación

La funcionalidad podrá considerarse terminada cuando:

- El catálogo se cargue desde Supabase y no desde un archivo local en runtime.
- La vista muestre las categorías madre y sus tipos hijos en castellano.
- El usuario pueda seleccionar uno o varios tipos sin escribir códigos.
- Google reciba los códigos oficiales de Tabla A en `includedTypes`.
- El backend rechace códigos no existentes o inactivos.
- Las búsquedas `text` sigan funcionando igual.
- Las búsquedas históricas sigan visibles y sin cambios.
- Existan constraints e índices adecuados.
- El endpoint tenga autenticación y permisos correctos.
- Se cubran estados de carga, vacío, error y éxito.
- Se verifique el flujo autenticado del panel y la ejecución real de una búsqueda Nearby.

## 12. Riesgos y decisiones pendientes

1. **Cambios futuros de Google:** el catálogo debe poder actualizarse mediante una nueva carga versionada.
2. **Tipos retirados:** se deben desactivar, no borrar, para no romper referencias históricas.
3. **Nombres traducidos:** las traducciones del CSV deben conservarse como copia controlada de la fuente usada para la UI.
4. **Límite de tipos por solicitud:** antes de implementar selección ilimitada, confirmar el límite vigente de Google Places y aplicar validación si corresponde.
5. **Actualización automática:** inicialmente se recomienda actualización controlada mediante CSV/migración; un sincronizador automático puede evaluarse después.
6. **Edición administrativa:** no incluirla en la primera versión. El catálogo debe mantenerse alineado con Google y no convertirse en un catálogo comercial editable por tenant.

## 13. Archivos que probablemente se modificarán al implementar

```txt
supabase/migrations/<timestamp>_create_google_places_types.sql
backend/app/api/routes/crm.py
backend/app/repositories/crm.py
backend/app/schemas/             # si el patrón actual lo requiere
backend/app/services/            # validación separada si se extrae del endpoint
frontend/panel/src/app/api/prospeccion/google/tipos/route.ts
frontend/panel/src/lib/prospeccion/google-client.ts
frontend/panel/src/app/prospeccion/google-busqueda/google-busqueda-view.tsx
frontend/panel/src/components/   # selector jerárquico, si conviene separarlo
```

Archivo fuente de carga inicial:

```txt
docs/Busqueda_Google/google_places_table_a_bilingual.csv
```

Este documento describe el plan. No incluye todavía la migración, la tabla, el endpoint ni el cambio de interfaz.
