# Plan de separación: productos inmobiliarios vs no inmobiliarios

## Objetivo

Separar el acceso al catálogo para asistentes en dos dominios claramente controlados:

- catálogo inmobiliario;
- catálogo no inmobiliario.

El comportamiento esperado es:

- si solo se activa uno, el asistente solo ve ese catálogo;
- si se activan ambos, el asistente ve ambos;
- si se desactivan ambos, el asistente no usa catálogo.

## Decisión de producto

Este cambio amplía lo que ya existe, pero reemplaza el significado del switch anterior.

- Ya no debe existir un único switch de `catalog_backend`.
- La configuración debe exponer dos flags funcionales:
  - `features.catalog_inmobiliario.enabled`
  - `features.catalog_no_inmobiliario.enabled`

## Alcance

### Frontend

- `settings/tenants`
- `settings/variables`
- textos de ayuda y labels de módulos
- estado de formulario por tenant

### Backend

- resolución de flags por tenant
- filtro de tools de asistentes
- rutas de OpenAI / WhatsApp / Webchat
- búsqueda de catálogo por dominio
- validaciones y tests

### Base de datos

- uso de `organizaciones.config.features`
- revisión del catálogo actual
- revisión de los campos que distinguen inventario inmobiliario de inventario no inmobiliario

## Estado actual detectado

- `settings/tenants` maneja hoy un switch único llamado `catalog_backend`.
- `tenant_runtime.is_catalog_backend_enabled()` lee `organizaciones.config.features.catalog_backend.enabled`.
- `filter_assistant_tools()` bloquea `list_catalog_fraccionamientos`, `list_catalog_modelos` y `fetch_catalog_item_details`.
- `fetch_catalog_item_details` busca en `catalog_items` sin distinguir dominio inmobiliario vs no inmobiliario.
- `catalog_items` es un catálogo general de productos, servicios y paquetes.

## Problema a resolver

Hoy el sistema mezcla dos cosas distintas:

1. catálogo inmobiliario usado por asistentes para inventario de propiedades;
2. catálogo comercial general de productos y servicios.

Eso significa que el switch actual no basta para controlar el alcance real. La separación debe hacerse por dominio, no solo por “catálogo sí / catálogo no”.

## Estrategia técnica

### 1. Configuración

Definir dos flags nuevos:

- `features.catalog_inmobiliario.enabled`
- `features.catalog_no_inmobiliario.enabled`

El flag viejo deja de ser el contrato funcional principal.

### 2. Runtime de asistentes

Separar el acceso en dos grupos:

- inmobiliario:
  - `list_catalog_fraccionamientos`
  - `list_catalog_modelos`
- no inmobiliario:
  - `fetch_catalog_item_details`

Cada tool debe revisarse contra el flag correcto antes de ejecutarse.

### 3. Búsqueda y fallback

Alinear la búsqueda de catálogo con el dominio:

- cuando el asistente busque inventario inmobiliario, solo debe consultar el subconjunto inmobiliario;
- cuando busque productos/servicios no inmobiliarios, solo debe consultar ese subconjunto;
- si ambos flags están apagados, no debe ejecutarse recuperación de catálogo.

### 4. UI

Mostrar los dos checks en:

- vista de `settings/tenants`;
- vista de `settings/variables`.

Los textos deben dejar claro qué activa cada uno y que ambos pueden convivir.

## Nombres propuestos para los checks

Los checks deben usar nombres de negocio, no nombres técnicos.

- `Catálogo inmobiliario`
  - activa el inventario de propiedades, fraccionamientos, modelos y unidades ligadas al negocio inmobiliario;
  - corresponde al catálogo que usan los asistentes para responder sobre inventario real de vivienda o desarrollo.
- `Activar productos y servicios`
  - activa el catálogo comercial general que no depende de propiedades;
  - corresponde a productos, servicios y paquetes que el asistente puede consultar o mencionar sin relación inmobiliaria.

La recomendación principal es mantener:

- `Activar inmobiliario`
- `Activar productos y servicios`

## Plan por capas

### Fase 1. Contrato de configuración

- agregar los dos flags nuevos en la construcción de `config.features`;
- remover el uso funcional del flag único anterior;
- dejar el JSON final explícito y legible.

### Fase 2. Frontend

- reemplazar el switch único por dos checks;
- actualizar labels, helper text y resumen visual con los nombres de negocio propuestos;
- asegurar que la edición en `settings/tenants` y `settings/variables` escriba exactamente los mismos keys.

### Fase 3. Backend

- crear helpers de lectura para `catalog_inmobiliario` y `catalog_no_inmobiliario`;
- ajustar la composición de tools por asistente;
- ajustar la lógica de consulta de catálogo para no mezclar dominios;
- revisar rutas de WhatsApp y Webchat para usar el flag correcto.

### Fase 4. Base de datos

- validar si el inventario inmobiliario ya está distinguido por campos reales como `propiedad_id` y `unidad_id`;
- validar qué filas de `catalog_items` pertenecen al catálogo no inmobiliario;
- definir si hace falta un campo explícito de dominio en `catalog_items` o si la separación se puede resolver por relaciones existentes.

### Fase 5. Pruebas

- pruebas unitarias para lectura de flags;
- pruebas para filtrado de tools;
- pruebas para búsqueda por dominio;
- pruebas para UI o contratos si el repo ya tiene cobertura en esas capas.

## Criterios de aceptación

- El usuario puede activar solo `Activar inmobiliario`.
- El usuario puede activar solo `Activar productos y servicios`.
- El usuario puede activar ambos.
- El usuario puede desactivar ambos y el asistente no usa catálogo.
- `settings/tenants` y `settings/variables` muestran el mismo comportamiento.
- El backend no filtra tools equivocadas.
- La búsqueda no devuelve ítems del dominio incorrecto.

## Riesgos

- Si el catálogo no inmobiliario y el inmobiliario siguen compartiendo la misma tabla sin marca de dominio, la separación puede quedarse solo en runtime y no en datos.
- Si algún flujo usa `catalog_backend` directo, puede quedar inconsistencia hasta que se migre todo el código.
- Si el fallback de embeddings sigue sin distinguir dominio, puede haber mezcla de resultados aunque la UI ya esté separada.

## Cierre esperado

Este cambio debe terminar con una separación clara de alcance:

- inmobiliario por un lado;
- no inmobiliario por el otro;
- sin depender de un único switch ambiguo.

Cuando este plan se ejecute, el resultado debe ser coherente en frontend, backend y datos.
