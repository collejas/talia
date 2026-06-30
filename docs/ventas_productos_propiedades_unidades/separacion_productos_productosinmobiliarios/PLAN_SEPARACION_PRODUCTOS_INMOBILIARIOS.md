# Plan de separación: productos inmobiliarios vs no inmobiliarios

## Objetivo

Separar el acceso al catálogo para asistentes en dos dominios claramente controlados:

- catálogo inmobiliario;
- catálogo no inmobiliario.

El comportamiento esperado es:

- si solo se activa uno, el asistente solo ve ese catálogo;
- si se activan ambos, el asistente ve ambos;
- si se desactivan ambos, el asistente no usa catálogo.

## Estado de implementación

Este plan ya quedó implementado en la rama de trabajo actual.

Lo que quedó aplicado:

- el panel reemplazó el switch único por dos checks de negocio;
- el backend separó la lectura de flags y el filtrado de tools por dominio;
- la búsqueda de catálogo ya distingue entre inmobiliario y no inmobiliario;
- la configuración por tenant y por variables expone los dos checks;
- los tests de runtime y canales quedaron actualizados.

En términos de contrato visible, los nombres acordados quedaron como:

- `Activar inmobiliario`
- `Activar productos y servicios`

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

Estado real:

- el backend ya lee ambos flags;
- `catalog_backend` quedó solo como compatibilidad histórica de lectura donde todavía exista configuración vieja;
- la UI ya escribe ambos flags desde `settings/tenants` y `settings/variables`.

### 2. Runtime de asistentes

Separar el acceso en dos grupos:

- inmobiliario:
  - `list_catalog_fraccionamientos`
  - `list_catalog_modelos`
- no inmobiliario:
  - `fetch_catalog_item_details`

Cada tool debe revisarse contra el flag correcto antes de ejecutarse.

Estado real:

- `filter_assistant_tools()` ya filtra por los dos flags;
- WhatsApp y Webchat ya usan el dominio correcto al consultar catálogo;
- `fetch_catalog_item_details` ya consulta el catálogo no inmobiliario.

### 3. Búsqueda y fallback

Alinear la búsqueda de catálogo con el dominio:

- cuando el asistente busque inventario inmobiliario, solo debe consultar el subconjunto inmobiliario;
- cuando busque productos/servicios no inmobiliarios, solo debe consultar ese subconjunto;
- si ambos flags están apagados, no debe ejecutarse recuperación de catálogo.

Estado real:

- la búsqueda por embeddings ya recibe `domain`;
- la búsqueda SQL-first ya separa por dominio;
- el metadata de indexación ya guarda las claves necesarias para diferenciar inventario inmobiliario y no inmobiliario.

### 4. UI

Mostrar los dos checks en:

- vista de `settings/tenants`;
- vista de `settings/variables`.

Los textos deben dejar claro qué activa cada uno y que ambos pueden convivir.

Estado real:

- `settings/tenants` ya muestra los dos checks con copy funcional;
- `settings/variables` también expone los dos flags;
- los nombres visibles acordados son los que se usan en la interfaz.

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

## Checklist de ejecución

### 1. Base de datos

- [x] Confirmar cómo se distinguen hoy los ítems inmobiliarios y no inmobiliarios en `catalog_items`.
- [x] Validar si el inventario inmobiliario ya está marcado por `propiedad_id` y `unidad_id`.
- [x] Definir si hace falta un campo explícito de dominio en BD o si la separación se resuelve por relaciones existentes.
- [x] Revisar qué tablas, vistas o consultas consumen el catálogo sin distinguir dominio.
- [x] Documentar el criterio final para clasificar cada ítem del catálogo.
- Resultado:
  - el dominio inmobiliario se clasifica por relación explícita a `propiedad_id` y/o `unidad_id`;
  - el dominio no inmobiliario se resuelve sobre `catalog_items`;
  - la lógica de consulta y embeddings ya respeta ese dominio.

### 2. Backend

- [x] Sustituir la lectura funcional del flag único por dos flags de negocio.
- [x] Implementar `Activar inmobiliario` para las tools de inventario inmobiliario.
- [x] Implementar `Activar productos y servicios` para la consulta de catálogo general.
- [x] Ajustar el filtrado de tools en WhatsApp y Webchat.
- [x] Ajustar la búsqueda de catálogo para que no mezcle dominios.
- [x] Revisar defaults de creación de tenant y de bootstrap de configuración.
- [x] Actualizar tests de runtime, tools y endpoints relacionados.
- Resultado:
  - el backend ya filtra `list_catalog_fraccionamientos`, `list_catalog_modelos` y `fetch_catalog_item_details` por el flag correcto;
  - WhatsApp, Webchat y Messenger ya pasan dominio explícito;
  - la compatibilidad con el switch viejo quedó solo como fallback histórico.

### 3. Frontend

- [x] Reemplazar el switch único por dos checks con nombre de negocio.
- [x] Mostrar `Activar inmobiliario` en `settings/tenants`.
- [x] Mostrar `Activar productos y servicios` en `settings/tenants`.
- [x] Mostrar los mismos dos checks en `settings/variables`.
- [x] Actualizar textos de ayuda para explicar claramente el efecto de cada check.
- [x] Verificar que ambos formularios escriban los mismos keys en `organizaciones.config.features`.
- [x] Ajustar los estados iniciales para respetar configuraciones ya guardadas.
- Resultado:
  - ambos formularios escriben `features.catalog_inmobiliario.enabled` y `features.catalog_no_inmobiliario.enabled`;
  - el copy visible quedó alineado a los nombres acordados;
  - la configuración vieja no se usa como contrato primario.

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

Estado real:

- la suite focalizada quedó verde después del refactor;
- los tests de asistentes, webchat y workflow de tenants fueron actualizados;
- el comportamiento final ya quedó validado con `pytest`.

## Criterios de aceptación

- El usuario puede activar solo `Activar inmobiliario`.
- El usuario puede activar solo `Activar productos y servicios`.
- El usuario puede activar ambos.
- El usuario puede desactivar ambos y el asistente no usa catálogo.
- `settings/tenants` y `settings/variables` muestran el mismo comportamiento.
- El backend no filtra tools equivocadas.
- La búsqueda no devuelve ítems del dominio incorrecto.

Estado de cierre:

- estos criterios ya quedaron cumplidos en el código actual.

## Riesgos

- Si el catálogo no inmobiliario y el inmobiliario siguen compartiendo la misma tabla sin marca de dominio, la separación puede quedarse solo en runtime y no en datos.
- Si algún flujo usa `catalog_backend` directo, puede quedar inconsistencia hasta que se migre todo el código.
- Si el fallback de embeddings sigue sin distinguir dominio, puede haber mezcla de resultados aunque la UI ya esté separada.

Estado real:

- esos riesgos quedaron mitigados con el refactor ya aplicado, aunque la compatibilidad histórica del flag viejo sigue existiendo como fallback.

## Cierre esperado

Este cambio debe terminar con una separación clara de alcance:

- inmobiliario por un lado;
- no inmobiliario por el otro;
- sin depender de un único switch ambiguo.

Cuando este plan se ejecute, el resultado debe ser coherente en frontend, backend y datos.

## Cierre ejecutado

La separación ya quedó aplicada en el código base actual.

Referencia rápida de lo que quedó hecho:

- frontend: `settings/tenants` y `settings/variables` muestran los dos checks;
- backend: la lógica de runtime usa `catalog_inmobiliario` y `catalog_no_inmobiliario`;
- catálogo: la recuperación y el filtrado ya respetan el dominio;
- validación: los tests focalizados pasaron en verde.
