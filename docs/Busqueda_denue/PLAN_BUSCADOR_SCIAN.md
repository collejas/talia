# Plan de mejora: buscador SCIAN para la búsqueda avanzada DENUE

Documento de propuesta para mejorar la selección de actividades SCIAN en la
vista `prospeccion/denue-busqueda`.

## 1. Objetivo

Evitar que el usuario tenga que recorrer todo el árbol SCIAN para encontrar una
actividad. El usuario podrá escribir una palabra, frase o código y recibirá
coincidencias con su ruta completa dentro de la clasificación SCIAN.

Ejemplo:

```text
23611

23 Construcción
└── 236 Edificación
    └── 2361 Edificación residencial
        └── 23611 Edificación residencial
```

La selección continuará utilizando los códigos SCIAN reales. El buscador sólo
facilitará localizar la actividad; no cambiará las reglas de consulta DENUE.

## 2. Estado actual

- La vista ya carga el catálogo SCIAN completo.
- El árbol actualmente puede resultar demasiado grande para navegarlo
  manualmente.
- Existe un campo visual de búsqueda de actividad, pero todavía no tiene una
  lógica funcional de filtrado.
- La vista utiliza los niveles sector, subsector, rama, subrama y clase.
- La búsqueda avanzada debe seguir enviando códigos válidos al backend.
- Los códigos de subrama, como `23611`, deben continuar resolviéndose a sus
  clases descendientes antes de consultar DENUE.

Archivos principales relacionados:

- `frontend/panel/src/app/prospeccion/denue-busqueda/advanced-denue-search-modal.tsx`
- `backend/app/api/routes/crm.py`
- `backend/app/repositories/crm.py`
- `backend/app/services/denue.py`
- `supabase/migrations/20280401_120000_scian_vector_store.sql`

## 3. Estrategia recomendada

Se implementará una búsqueda híbrida en tres pasos:

1. búsqueda textual rápida;
2. búsqueda semántica como complemento;
3. mantenimiento y actualización controlada de los embeddings.

La búsqueda textual debe ser la fuente principal para códigos y nombres
exactos. La búsqueda semántica ayudará cuando el usuario utilice lenguaje
natural o conceptos relacionados.

## 4. Paso 1: búsqueda textual rápida

### Alcance

Implementar la búsqueda directamente sobre el catálogo SCIAN que ya carga la
vista, sin modificar inicialmente la base de datos.

### Campos consultables

- Código SCIAN.
- Nombre o título de la actividad.
- Descripción.
- Inclusiones.
- Exclusiones, si están disponibles.
- Índices o términos asociados, si están disponibles.

La comparación debe normalizar mayúsculas, minúsculas y acentos. Debe aceptar
tanto búsquedas como estas:

- `23611`
- `236111`
- `edificacion residencial`
- `vivienda`
- `construccion de casas`

### Comportamiento visual

Cuando el campo esté vacío:

- mostrar sólo los niveles principales o mantener el árbol contraído;
- no presentar todos los nodos abiertos simultáneamente.

Cuando exista una búsqueda:

- mostrar únicamente las coincidencias y sus nodos padre;
- mostrar código, nombre y ruta completa;
- mostrar el total de coincidencias;
- resaltar el texto coincidente;
- permitir seleccionar el resultado directamente;
- limitar inicialmente la lista a 20 o 50 resultados.

### Ventajas

- No requiere una nueva llamada a OpenAI.
- No requiere una migración.
- Tiene respuesta inmediata.
- Permite validar la experiencia antes de agregar complejidad.
- Mantiene coincidencias deterministas para códigos SCIAN.

### Validación mínima

Se deben probar al menos:

1. `23611`, mostrando la subrama y sus clases descendientes.
2. `236111`, mostrando la clase exacta.
3. `edificación residencial`, ignorando acentos.
4. `vivienda`, mostrando las rutas que contienen el término.
5. Una búsqueda sin coincidencias, mostrando un estado vacío claro.
6. Selección de un resultado y ejecución real de la búsqueda avanzada.

## 5. Paso 2: búsqueda semántica

### Alcance

Agregar una búsqueda backend para encontrar clases SCIAN relacionadas por
significado, no únicamente por coincidencia literal.

Ejemplo:

```text
Consulta: empresas que construyen casas
Resultado: actividades relacionadas con edificación residencial
```

### Flujo propuesto

1. El usuario escribe una consulta.
2. El frontend intenta primero la búsqueda textual.
3. Si no hay coincidencias suficientes, o el usuario solicita buscar por
   significado, se consulta el backend.
4. El backend genera el embedding de la consulta.
5. El backend consulta los embeddings SCIAN mediante Supabase.
6. La respuesta incluye las clases encontradas y su ruta completa.
7. El usuario selecciona explícitamente el resultado antes de ejecutar la
   búsqueda DENUE.

### Contrato sugerido

```text
GET /api/prospeccion/denue/scian/busqueda
  ?q=construccion%20de%20casas
  &mode=semantic
  &limit=20
```

Respuesta conceptual:

```json
{
  "items": [
    {
      "codigo": "236111",
      "nivel": "clase",
      "titulo": "Edificación residencial unifamiliar",
      "ruta": [
        {"codigo": "23", "titulo": "Construcción"},
        {"codigo": "236", "titulo": "Edificación"},
        {"codigo": "2361", "titulo": "Edificación residencial"},
        {"codigo": "236111", "titulo": "Edificación residencial unifamiliar"}
      ],
      "similaridad": 0.91
    }
  ],
  "total": 1
}
```

### Reglas importantes

- No generar embeddings por cada carácter escrito.
- Aplicar debounce y exigir una consulta mínima, por ejemplo tres caracteres.
- Mantener una caché de consultas recientes.
- No exponer claves de OpenAI en el navegador.
- No convertir automáticamente una coincidencia semántica en filtro DENUE.
- La selección final siempre debe usar un código SCIAN explícito.

La infraestructura existente de embeddings SCIAN debe verificarse antes de
usarse en producción: cantidad de registros, modelo utilizado, dimensión del
vector y fecha de actualización.

## 6. Paso 3: mantenimiento de embeddings

### Objetivo

Garantizar que la búsqueda semántica no dependa de datos incompletos u
obsoletos.

### Requisitos

- Proceso idempotente de generación o regeneración.
- Una fila por clase SCIAN.
- Modelo y dimensión consistentes con la columna vectorial.
- Registro de fecha de actualización.
- Posibilidad de reindexar sin duplicar registros.
- Reporte de clases sin embedding o con error.

Este proceso debe ejecutarse como tarea administrativa o de mantenimiento, no
durante la escritura del usuario en el buscador.

## 7. Arquitectura propuesta

### Primera fase

```text
Catálogo SCIAN ya cargado
        ↓
Normalización local
        ↓
Búsqueda textual
        ↓
Resultados con ruta y selección
```

### Fase semántica

```text
Frontend
   ↓
Proxy Next.js
   ↓
FastAPI
   ↓
Embedding de la consulta
   ↓
Supabase / scian_clase_embeddings_search
   ↓
Clases SCIAN + ruta completa
```

## 8. Criterios de aceptación

La mejora se considerará correcta cuando:

- el usuario pueda buscar por código, nombre o palabra clave;
- la lista inicial no aparezca completamente expandida;
- cada resultado muestre su ruta SCIAN completa;
- la selección conserve el código correcto;
- `23611` continúe resolviéndose correctamente a sus clases descendientes;
- la consulta avanzada siga devolviendo resultados reales de DENUE;
- las búsquedas sin coincidencias muestren un mensaje claro;
- la búsqueda semántica no reemplace silenciosamente la selección explícita;
- no se expongan secretos ni se llame directamente a OpenAI desde el cliente.

## 9. Orden de implementación recomendado

1. Implementar y probar la búsqueda textual local.
2. Validar la experiencia con códigos y términos reales del catálogo SCIAN.
3. Verificar el contenido de `scian_clase_embeddings`.
4. Implementar el endpoint semántico backend.
5. Integrar la búsqueda semántica como respaldo o modo explícito.
6. Agregar el proceso de mantenimiento de embeddings.

La primera fase debe implementarse antes de modificar base de datos o agregar
costos de embeddings. Así se valida rápidamente si la mejora de navegación
resuelve la principal dificultad de la lista SCIAN.

