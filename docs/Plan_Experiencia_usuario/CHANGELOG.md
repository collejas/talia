# Changelog — Experiencia de usuario de Prospección y Marketing

Este archivo registra decisiones, avances, validaciones, pendientes y bloqueos del refactor de Búsqueda, Prospección y Marketing de Tal-IA.

Plan principal: [PLAN_ARQUITECTURA_Y_REFACTOR_PROSPECCION_MARKETING.md](./PLAN_ARQUITECTURA_Y_REFACTOR_PROSPECCION_MARKETING.md)

## 2026-09-22 — Cantidad máxima por envío

### Estado

En desarrollo.

### Fase

F4 — Envíos.

### Cambios

- Se corrigió el `500` del endpoint de contacto causado por enviar dos veces el parámetro interno `order` al consultar prospectos con filtros.
- La consulta conserva el orden solicitado por la lista y usa la fecha de creación descendente únicamente como valor predeterminado.
- El paso `¿Cuándo?` permite elegir todas las personas elegibles o una cantidad máxima específica para la ejecución actual.
- La cantidad se aplica por prospecto y no modifica las reglas de la Lista para contactar.
- El backend vuelve a resolver la lista y filtra la elegibilidad antes de limitar los destinatarios.
- La cantidad máxima no se mezcla con la separación entre mensajes ni con los bloques técnicos de Postmark, Brevo, WhatsApp o Voz.
- El botón final adapta el verbo al canal: `Enviar correo`, `Enviar mensaje` o `Llamar`.

### Archivos o superficies afectadas

- `frontend/panel/src/components/prospeccion/prospeccion-campaign-wizard.tsx`
- `frontend/panel/src/lib/prospeccion/prospectos-client.ts`
- `backend/app/api/routes/crm.py`
- `PLAN_ARQUITECTURA_Y_REFACTOR_PROSPECCION_MARKETING.md`

### Pendientes de validación

- Probar manualmente un envío con todas las personas elegibles y otro con cantidad específica en cada canal.
- Confirmar que la cantidad solicitada no cambia el procesamiento existente de cada proveedor.

## Estados de seguimiento

- **Propuesto:** identificado, pendiente de aprobación.
- **Aprobado:** decisión aceptada para diseño o implementación.
- **En desarrollo:** implementación iniciada.
- **En validación:** requiere pruebas técnicas o funcionales.
- **Completado:** implementado y verificado en la superficie correspondiente.
- **Bloqueado:** no puede avanzar hasta resolver una dependencia.

## 2026-09-21 — Arquitectura funcional y UX aprobadas

### Estado

- Arquitectura funcional y UX aprobadas; lista para implementación.
- No se ha modificado código funcional, base de datos ni endpoints como parte de este plan.

### Decisiones aprobadas

- La navegación principal queda reducida a Búsqueda, Prospección, Marketing, CRM y Agente IA.
- Búsqueda muestra `Buscar` y `Mis búsquedas`; Resultados es una vista contextual.
- Prospección muestra `Prospectos`, `Listas para contactar` y `Completar datos`.
- El historial de un prospecto es una vista contextual dentro de su detalle.
- Marketing se organiza por Correo, WhatsApp y Voz.
- Las listas para contactar se guardan mediante reglas dinámicas, no mediante una fotografía de IDs seleccionados.
- Las listas genéricas pueden utilizarse en varios canales; las listas orientadas a un canal solo muestran canales compatibles.
- Tal-IA no vuelve a preguntar información que ya conoce.
- El lenguaje visible se adapta al canal: correo, mensaje, guion, enviar, llamar, correos enviados, mensajes enviados o llamadas realizadas.
- Una comunicación real solo se produce al crear y ejecutar un envío.
- El backend vuelve a resolver y validar la lista antes de crear el envío.
- Los envíos históricos deben conservar las reglas históricas utilizadas para seleccionar prospectos cuando esa capacidad sea necesaria.
- La idempotencia debe complementarse con control de concurrencia para impedir que dos workers procesen el mismo destinatario.
- Cada comunicación debe conservar trazabilidad desde el envío hasta el proveedor, webhook y estado final.
- El nuevo asistente se activará progresivamente mediante un feature flag por organización o módulo, inicialmente `marketing_send_wizard_v2`.
- Una Lista para contactar es una vista guardada de los filtros de Prospectos; no es una lista reducida de reglas ni una fotografía de IDs.
- El modal de listas debe conservar todos los filtros de Prospectos que sirvan para decidir a quién contactar, agrupados por empresa, actividad, ubicación, contacto, historial, canal, fechas y CRM.
- `Segmento guardado`, `Actividad económica` y `Tipo de negocio` son filtros distintos y deben utilizar sus fuentes de datos correspondientes.
- Elegir canal primero determina compatibilidad y reglas específicas, pero no elimina los filtros generales de la lista.

### Regla de nombres y persistencia

- Los nombres técnicos actuales de tablas, columnas, relaciones y endpoints se conservan.
- Los nombres humanos pertenecen a la capa de UX/frontend.
- No se harán migraciones solo para igualar nombres entre backend y frontend.
- Si una capacidad existe, se reutiliza.
- Si existe con otro nombre, se mapea.
- Si realmente no existe, se crea.

### Fases aprobadas

- **F0 Baseline y contratos:** inventario real y matriz de compatibilidad.
- **F1 Listas para contactar:** vista guardada de filtros de Prospectos, compatibilidad, conteos e historial por canal.
- **F2 Campañas por canal.**
- **F3 Contenido:** correos, mensajes y guiones.
- **F4 Envíos:** crear, revisar, revalidar y ejecutar.
- **F5 Resultados e historial.**
- **F6 Prospectos y Búsqueda.**

## Registro de avances

Usar este formato para cada cambio posterior:

```markdown
## AAAA-MM-DD — Título del avance

### Estado

En desarrollo | En validación | Completado | Bloqueado

### Fase

F0 Baseline y contratos | F1 Listas para contactar | F2 Campañas por canal | F3 Contenido | F4 Envíos | F5 Resultados e historial | F6 Prospectos y Búsqueda

### Referencia

PR / commit / issue / migración relacionada, si aplica.

### Cambios

- ...

### Archivos o superficies afectadas

- ...

### Validación

- ...

### Pendientes o riesgos

- ...
```

## 2026-09-22 — Alineación de clasificación y origen de prospectos

### Estado

En validación

### Fase

F1 Listas para contactar

### Referencia

Filtros dinámicos de Prospectos; sin migración de nombres ni estructura de base de datos.

### Cambios

- `Segmento guardado` se mantiene como la etiqueta comercial asignada al prospecto.
- `Actividad económica (DENUE/SCIAN)` se filtra contra el campo `actividad`.
- `Tipo de negocio (Google)` se filtra contra `google_primary_type_display_name` y `google_primary_type`, manteniendo la misma relación entre las opciones mostradas y la consulta aplicada.
- `Búsqueda de origen` se mantiene separada y representa la consulta que originó el prospecto (`query_sort`/`busqueda_ref`).
- El endpoint de metadatos de Prospectos entrega valores reales para autocompletar estos filtros en la creación de una Lista para contactar.
- Se conservaron los nombres internos existentes; las etiquetas humanas se resuelven en la interfaz.

### Archivos o superficies afectadas

- `backend/app/repositories/crm.py`
- `backend/app/api/routes/crm.py`
- `frontend/panel/src/lib/prospeccion/prospectos-client.ts`
- `frontend/panel/src/app/prospeccion/listas/page.client.tsx`

### Validación

- Validación sintáctica de backend pendiente de ejecutar con el entorno virtual del proyecto.
- Validación de tipos y lint del panel pendiente.

### Pendientes o riesgos

- Confirmar en la interfaz autenticada que los valores mostrados provienen del tenant actual y que las tres reglas devuelven resultados esperados.

## 2026-09-22 — Selectores visibles para clasificación de prospectos

### Estado

En validación

### Fase

F1 Listas para contactar

### Cambios

- Los cuatro campos (`Segmento guardado`, `Actividad económica`, `Tipo de negocio` y `Búsqueda de origen`) ahora usan selectores visibles desde el primer clic.
- Se eliminó el uso de `datalist`, que hacía que las opciones dependieran de una interacción poco evidente del navegador.
- Los selectores permiten elegir varios valores y muestran los valores seleccionados con opción explícita para quitarlos.
- Se corrigió el contrato de respuesta del endpoint para incluir `tipos_negocio`; antes el backend lo calculaba, pero la ruta no lo enviaba al frontend.

### Validación

- Pendiente validar visualmente con datos reales del tenant y confirmar que `Tipo de negocio (Google)` muestra opciones.

## 2026-09-22 — Permisos por canal con exclusión predeterminada de bajas

### Estado

En validación

### Fase

F1 Listas para contactar

### Cambios

- Las listas de Correo y WhatsApp guardan automáticamente el canal para aplicar la protección de permisos correspondiente.
- Por defecto se excluyen las personas con una baja activa del canal seleccionado.
- Se reutiliza la tabla existente de supresiones; no se agregó ni renombró estructura de base de datos.
- La interfaz dejó de pedir manualmente un opt-out de WhatsApp dentro de los filtros generales y muestra la protección activa según el canal.
- Se conserva el comportamiento legado de `opt_out_whatsapp` para consultas antiguas de Prospectos.

## 2026-09-22 — Clasificadores específicos por fuente

### Estado

En validación

### Fase

F1 Listas para contactar

### Cambios

- Google muestra tipo de negocio, nombre/texto de empresa y calificación de Google.
- GobMX/DENUE muestra actividad económica y tamaño de empresa.
- Al elegir una fuente se limpian los clasificadores incompatibles de la fuente anterior.
- Con “Todas las fuentes” se muestran únicamente filtros comunes y se solicita elegir una fuente para ver clasificadores específicos.
- Los catálogos de actividad, tipo de negocio y búsqueda de origen se solicitan al backend con la fuente seleccionada, evitando mezclar valores de Google y DENUE.
- Al abrir el modal se muestran ambos grupos de clasificadores; al seleccionar una fuente se oculta el grupo incompatible sin perder los filtros comunes.

## 2026-09-22 — Selector simple para historial de contactos

### Estado

En validación

### Fase

F1 Listas para contactar

### Cambios

- El primer filtro después de elegir el canal ahora es `Historial de contactos`.
- Se agregaron las opciones `Cualquier cantidad`, `Nunca contactados`, `Contactados al menos una vez` y `Cantidad personalizada`.
- `Nunca contactados` se traduce internamente a mínimo `0` y máximo `0` para el canal seleccionado.
- `Contactados al menos una vez` se traduce internamente a mínimo `1` sin máximo.
- Las listas nuevas inician por defecto en `Nunca contactados` (`0` y `0`); al editar listas existentes se conservan sus reglas actuales.

## 2026-09-22 — Reordenamiento lógico de filtros por responsabilidad

### Estado

En validación

### Fase

F1 Listas para contactar

### Cambios

- `Segmento guardado` pasó a `Filtros generales de Prospectos`.
- El filtro de correo quedó dentro de `Datos de contacto del canal`.
- `Teléfono` y `Tipo de teléfono` quedaron agrupados como datos de contacto telefónico.
- WhatsApp y llamadas quedaron agrupados en `Permisos para contactar`.
- Se eliminó la mezcla de estos campos dentro de la sección genérica de reglas.

## 2026-09-21 — Preparación operativa del refactor

### Estado

Aprobado

### Fase

F0 — Baseline y contratos

### Referencia

Plan actualizado; código todavía sin modificar.

### Cambios

- Se unificó la numeración F0–F6 entre el plan y este changelog.
- Se estableció que las rutas actuales de listas son la opción inicial y no se crearán rutas `/audiencias` solo por limpieza semántica.
- Se agregaron requisitos de control de concurrencia e idempotencia para impedir destinatarios duplicados.
- Se agregó trazabilidad desde envío y destinatario hasta proveedor, webhook y estado final.
- Se agregó activación progresiva mediante `marketing_send_wizard_v2`.

### Validación

- Plan y changelog revisados para consistencia de fases y alcance.

### Pendientes o riesgos

- Ejecutar el inventario real de tablas, endpoints, workers, estados y proveedores en F0.

## Pendientes iniciales

- Auditar tablas, columnas, relaciones y endpoints actuales antes de diseñar migraciones.
- Confirmar la estrategia de claim, estados y restricciones únicas para evitar duplicados concurrentes.
- Definir la cadena de observabilidad `envío → destinatario → proveedor → webhook → estado final`.
- Confirmar cómo se conserva actualmente la definición histórica de las reglas de una lista.
- Confirmar la semántica real de `whatsapp_permitido` y separar, si corresponde, `Tiene WhatsApp` de `Se le puede enviar WhatsApp`.
- Confirmar estados y métricas reales disponibles para Voz con el proveedor actual.
- Diseñar wireframes de `Prospectos → Crear lista → Contactar lista → Campaña → Revisar → Enviar`.
- Definir pruebas funcionales autenticadas para preview, revalidación, compatibilidad de canal, idempotencia y aislamiento por organización.
- Definir pruebas de concurrencia, recuperación de workers y activación progresiva por feature flag.

## 2026-09-21 — Rangos de envíos en Listas para contactar

### Estado

En validación

### Fase

F1 — Listas para contactar

### Referencia

`frontend/panel/src/app/prospeccion/listas/page.client.tsx`

### Cambios

- La creación y edición de una lista ahora permite indicar un mínimo y un máximo de contactos previos por el canal seleccionado.
- Se soportan expresamente los casos “2 o más”, “2 o menos” y “exactamente 2”.
- El canal elegido determina si se guardan `envios_correo_*`, `envios_whatsapp_*` o `envios_voz_*`.
- Las listas existentes con `máximo = 0` continúan mostrándose y editándose como “nunca contactados”.
- Se agregó validación visible para impedir números negativos y mínimos mayores que máximos.

### Archivos o superficies afectadas

- `frontend/panel/src/app/prospeccion/listas/page.client.tsx`
- Contrato existente `ProspectoFiltroPayload` y filtros server-side de prospectos reutilizados sin migración.

### Validación

- ESLint del archivo modificado: correcto.
- TypeScript del panel (`tsc --noEmit`): correcto.
- `git diff --check`: correcto.

## 2026-09-22 — Refactor UX sin cambios en procesamiento de Correo ni WhatsApp

### Estado

Aprobado para el plan; pendiente de implementación en el wizard

### Fase

F4 — Envíos

### Referencia

`docs/Plan_Postmark/README.md`, `docs/Plan_Postmark/CHANGELOG.md` y la sección 2.8 del plan de experiencia.

### Cambios

- Se documentó que Correo conserva íntegramente la operación definida para Postmark y Brevo.
- El wizard no debe controlar separación entre correos ni tamaño técnico de bloques para Correo.
- Postmark mantiene bloques de hasta 500 mediante `/email/batch` y su pausa operativa entre bloques.
- Brevo conserva sus propios workers, cuotas y límites.
- WhatsApp conserva sus métodos actuales de envío, proveedor, workers, límites y reintentos.
- El refactor se limita a la experiencia de usuario y a la organización del wizard.

### Pendientes

- Ajustar el wizard para ocultar controles de separación y lote cuando el canal sea Correo.
- No cambiar el procesamiento backend de Correo ni WhatsApp dentro de este refactor.

## 2026-09-22 — F1: compatibilidad con plantillas WhatsApp históricas

### Estado

En validación

### Cambios

- Se evitó bloquear la selección de plantillas WhatsApp cuando no tienen campaña asociada.
- Si existen plantillas WhatsApp asociadas a la campaña, se muestran únicamente esas.
- Las plantillas históricas sin asociación siguen disponibles para no romper envíos existentes.

### Validación

- ESLint y TypeScript del panel: correctos.
- `py_compile` de rutas y repositorio CRM: correcto.
- `git diff --check`: correcto.

## 2026-09-22 — F1: preview real de contenido e imágenes por canal

### Estado

En validación

### Cambios

- El preview reemplaza variables de texto e imágenes con valores de ejemplo y recursos configurados.
- Correo renderiza el HTML real de la plantilla dentro de un iframe aislado, incluyendo sus imágenes.
- WhatsApp muestra la imagen de encabezado antes del cuerpo y elimina el marcador de imagen del texto.
- Las plantillas WhatsApp ahora se filtran también por la campaña seleccionada.

### Validación

- ESLint y TypeScript del panel: correctos.
- `py_compile` de rutas y repositorio CRM: correcto.
- `git diff --check`: correcto.

## 2026-09-22 — F1: vista previa completa de plantillas en el envío

### Estado

En validación

### Cambios

- Correo muestra asunto y cuerpo HTML o texto de la plantilla seleccionada.
- WhatsApp muestra el texto configurado y las imágenes asociadas cuando existen.
- La vista previa sigue siendo de solo lectura; no solicita variables ni permite modificar la plantilla.

### Validación

- ESLint y TypeScript del panel: correctos.
- `git diff --check`: correcto.

## 2026-09-22 — F1: orden persistente de las listas

### Estado

En validación

### Cambios

- Se agregó `Ordenar por` a la creación y edición de listas.
- Las opciones son Más recientes, Nombre (A-Z) y Orden diverso.
- El criterio se guarda dentro de los filtros existentes de la lista.
- El backend reutiliza el orden existente de Prospectos al resolver una lista.

### Validación

- ESLint y TypeScript del panel: correctos.
- `py_compile` de las rutas CRM: correcto.
- `git diff --check`: correcto.

## 2026-09-22 — F1: filtros clasificados por fuente

### Estado

En validación

### Fase

F1 — Listas para contactar

### Cambios

- `Clasificación de Google` quedó dentro del bloque de filtros de Google.
- `Tamaño de la empresa (GobMX)` quedó dentro del bloque de filtros GobMX/DENUE.
- Ambos filtros dejaron de aparecer en la sección de condiciones generales.
- Al elegir una fuente, solo se muestran sus clasificadores correspondientes.

### Validación

- ESLint de la vista de listas: correcto.
- TypeScript del panel con `npx tsc --noEmit`: correcto.
- `git diff --check`: correcto.

### Pendientes o riesgos

- Todavía faltan filtros temporales como “no contactado en los últimos N días”.
- Todavía falta trasladar a la lista todos los filtros avanzados de `Prospectos` como presencia de datos, ubicación, calificación, campaña y estado CRM.

## 2026-09-21 — Reglas generales para Listas para contactar

### Estado

En validación

### Fase

F1 — Listas para contactar

### Referencia

`frontend/panel/src/app/prospeccion/listas/page.client.tsx` y `backend/app/api/routes/crm.py`

### Cambios

- Las listas pueden guardar estado, municipio, existencia de teléfono, correo y sitio web.
- Se agregaron filtros de calificación mínima de Google y tamaño de empresa.
- Estos filtros se reutilizan mediante el contrato existente y se resuelven server-side al recalcular la lista o crear un envío.
- No se crearon tablas, columnas ni endpoints nuevos.

### Validación

- `py_compile` del módulo FastAPI modificado: correcto.
- ESLint de los archivos frontend modificados: correcto.
- TypeScript del panel (`tsc --noEmit`): correcto.
- `git diff --check`: correcto.

### Pendientes o riesgos

- Falta implementar el filtro de último contacto por canal y ventanas como “no contactado en los últimos N días”.
- Falta trasladar filtros de campaña, plantilla, respuestas, conversiones y estado CRM cuando se defina su semántica de lista.

## 2026-09-22 — Modal completo de reglas para Listas para contactar

### Estado

En validación

### Fase

F1 — Listas para contactar

### Referencia

`frontend/panel/src/app/prospeccion/listas/page.client.tsx`

### Cambios

- El modal conserva filtros generales de Prospectos además de los filtros específicos del canal.
- Se agregaron fuente, segmentos múltiples, actividad económica, tipo de negocio, búsqueda de origen, etapa, campaña, estados de validación, presencia de datos, ubicación, calificación, tamaño, historial, fechas y scraper.
- El contrato de filtros reutilizable acepta listas de actividades, tipos de negocio, consultas de origen, campañas, canales con historial y fechas.
- El repositorio aplica `tipo_negocio` contra las clasificaciones existentes de Google y conserva la resolución server-side.
- El canal sigue determinando compatibilidad y lenguaje, pero ya no elimina filtros generales.
- La campaña y el contenido disponibles en el modal se filtran por el canal elegido; al cambiar de canal se limpian selecciones incompatibles.
- No se crearon tablas ni endpoints nuevos.

### Archivos o superficies afectadas

- `backend/app/api/routes/crm.py`
- `backend/app/repositories/crm.py`
- `frontend/panel/src/lib/prospeccion/prospectos-client.ts`
- `frontend/panel/src/app/prospeccion/listas/page.client.tsx`

### Validación

- Contrato Pydantic probado con actividad, tipo de negocio, segmentos múltiples, rango de envíos y fechas.
- Backend compila correctamente.
- ESLint del panel: correcto.
- TypeScript del panel (`tsc --noEmit`): correcto.
- `git diff --check`: correcto.

### Pendientes o riesgos

- Falta implementar el último contacto por canal y ventanas relativas como “no contactado en los últimos N días”.
- La selección de actividad y tipo de negocio todavía usa texto separado por comas; debe evolucionar a catálogos/autocompletado basados en los valores reales disponibles.

## 2026-09-21 — Inventario inicial de F0

### Estado

En validación

### Fase

F0 — Baseline y contratos

### Referencia

Inspección local de rutas, schemas, wizard, repositorio y migraciones existentes.

### Hallazgos confirmados

- Ya existe la tabla `prospeccion_contacto_listas` para listas inteligentes por organización.
- Ya existen las rutas actuales `/prospeccion/contacto/listas` para listar, crear, editar y eliminar listas.
- `ProspectoContactarPayload` ya acepta `lista_id`, `filtros` o `prospecto_ids`; el nuevo flujo debe priorizar `lista_id`/reglas dinámicas.
- `prospeccion_contacto_batch` ya contiene `campana_id` y `lista_id`, además de programación y título amigable.
- Ya existen rutas actuales para batches, envíos, plantillas y campañas.
- El wizard existente ya tiene un origen `lista` y envía `lista_id` al backend.
- La persistencia de destinatarios ya cuenta con una restricción única equivalente a `batch_id + prospecto_id + canal`; se debe validar que la protección esté activa en el entorno objetivo antes de agregar otra.
- El componente actual de Prospectos continúa concentrando responsabilidades y debe dividirse por flujo, no solo por tamaño.

### Riesgos o validaciones pendientes

- Las reglas de las listas actuales se almacenan en `filtros` JSONB; antes de agregar filtros temporales o nuevas reglas debe determinarse qué puede reutilizarse y qué requiere columnas o estructuras explícitas.
- `whatsapp_permitido` necesita confirmación semántica para separar `Tiene WhatsApp` de `Se le puede enviar WhatsApp`.
- Debe validarse el claim atómico real de batches/destinatarios y la recuperación de workers antes de declarar completa la protección de concurrencia.
- Debe trazarse la cadena real envío → destinatario → proveedor → identificador externo → webhook → estado final.
- El inventario local todavía no demuestra por sí solo el estado desplegado ni el esquema remoto; falta validación autenticada y contra el entorno objetivo.

### Archivos o superficies revisadas

- `backend/app/api/routes/crm.py`
- `backend/app/repositories/crm.py`
- `backend/app/services/prospeccion_contact_sender.py`
- `frontend/panel/src/components/prospeccion/prospeccion-campaign-wizard.tsx`
- `frontend/panel/src/app/prospeccion/prospectos/page.client.tsx`
- `supabase/migrations/20270518_100000_prospeccion_campana_wizard.sql`
- Migraciones de batches, envíos, plantillas, métricas y coordinación de workers.

### Siguiente paso F0

- Completar la matriz concepto → tabla/columna/relación/endpoint.
- Confirmar el contrato desplegado de las rutas actuales.
- Validar en el entorno objetivo la estructura y restricciones existentes antes de modificar código o datos.

## 2026-09-21 — Primera entrega F1: Listas para contactar

### Estado

En validación

### Fase

F1 — Listas para contactar

### Referencia

Frontend local: `frontend/panel/src/app/prospeccion/listas/` y `frontend/panel/src/components/AppSidebar.tsx`.

### Cambios

- Se agregó la vista `Prospección → Listas para contactar` reutilizando las rutas actuales de listas.
- Se agregó búsqueda, actualización, estado vacío y carga de listas existentes.
- Se agregó creación y edición de listas con reglas visibles en lenguaje humano.
- Las reglas de la primera entrega se traducen a los campos actuales: tipo de empresa, teléfono válido, tipo de teléfono, permiso de WhatsApp y cantidad histórica de correos/WhatsApps.
- Se agregó `Contactar esta lista`, que abre el wizard actual con `lista_id` preseleccionado.
- Se agregó la entrada de navegación lateral sin crear tablas, migraciones, endpoints nuevos ni renombrar campos existentes.

### Validación

- ESLint sobre los archivos nuevos y `AppSidebar.tsx`: correcto.
- TypeScript del panel con `npx tsc --noEmit`: correcto.
- `git diff --check`: correcto.

### Pendientes o riesgos

- Validar visualmente la ruta autenticada en el panel desplegado.
- Confirmar en el entorno objetivo la semántica de `whatsapp_permitido` antes de ampliar las reglas de compatibilidad por canal.
- El wizard abierto desde la lista es el flujo existente; la adaptación completa por canal y el asistente de cuatro pasos quedan para F2–F4.
- Todavía no se ha validado un envío real ni la cadena proveedor → webhook → estado final.

## 2026-09-21 — F1: envío basado en contenido guardado

### Estado

En validación

### Fase

F1 — Listas para contactar

### Referencia

`frontend/panel/src/components/prospeccion/prospeccion-campaign-wizard.tsx` y `backend/app/api/routes/crm.py`.

### Cambios

- El wizard dejó de solicitar asunto, cuerpo, HTML, variables, logos o guiones al crear un envío.
- El usuario elige un solo canal y un contenido ya guardado en la plantilla correspondiente.
- El backend continúa resolviendo el contenido desde la plantilla seleccionada mediante `template_id`.
- Las llamadas ahora también recuperan el guion guardado cuando el envío solo recibe `template_id`.

### Validación

- ESLint del wizard y la vista de listas: correcto.
- TypeScript del panel con `npx tsc --noEmit`: correcto.
- Pruebas backend de resolución de plantillas: 2 correctas.
- `git diff --check`: correcto.

## 2026-09-21 — F1: listas orientadas al canal

### Estado

En validación

### Fase

F1 — Listas para contactar

### Referencia

`frontend/panel/src/app/prospeccion/listas/page.client.tsx` y el contrato actualizado del plan.

### Cambios

- La creación de una lista comienza preguntando si se usará para Correo, WhatsApp o Voz.
- El formulario muestra únicamente reglas relevantes para el canal seleccionado.
- Correo usa reglas de correo; WhatsApp usa teléfono móvil, permiso y envíos previos de WhatsApp; Voz usa teléfono, permiso de llamada y envíos previos de Voz.
- Las reglas se siguen guardando en los campos existentes de `filtros`; no se agregó una columna de canal ni una migración por nomenclatura.
- Las listas históricas se pueden editar y su canal se infiere únicamente cuando sus reglas actuales permiten determinarlo.

### Validación

- ESLint de la vista de listas: correcto.
- TypeScript del panel con `npx tsc --noEmit`: correcto.
- Pruebas backend de resolución de plantillas: 2 correctas.
- `py_compile` del módulo de rutas y `git diff --check`: correctos.

### Pendientes o riesgos

- La migración fue aplicada mediante MCP Supabase y validada en la base remota.
- La columna `canal` quedó nullable para conservar listas históricas; actualmente existe 1 lista histórica con `canal = NULL`.
- Las listas históricas con `canal = NULL` requieren inferencia o selección manual durante la transición.

## 2026-09-21 — F1: wizard contextual por canal

### Estado

En validación

### Fase

F1 — Listas para contactar

### Referencia

`frontend/panel/src/components/prospeccion/prospeccion-campaign-wizard.tsx` y `frontend/panel/src/app/prospeccion/listas/page.client.tsx`.

### Cambios

- El wizard recibe el canal guardado en la lista y oculta los demás canales.
- El paso de selección cambia a `Lista → Contenido → Cuándo`.
- El resumen muestra un solo canal, de acuerdo con la selección original.
- Una lista con canal guardado ya no vuelve a pedir una decisión que Tal-IA conoce.
- Las campañas y plantillas mantienen sus controles específicos por canal en sus propios modales.

### Validación

- ESLint del wizard y la vista de listas: correcto.
- TypeScript del panel con `npx tsc --noEmit`: correcto.
- `git diff --check`: correcto.

## 2026-09-22 — F1: campaña antes de plantilla en Contactar esta lista

### Estado

En validación

### Fase

F1 — Listas para contactar

### Referencia

`frontend/panel/src/components/prospeccion/prospeccion-campaign-wizard.tsx`.

### Cambios

- El flujo ahora sigue `Lista → Campaña → Plantilla → Cuándo`.
- La campaña se selecciona antes de consultar o mostrar plantillas.
- Solo se muestran campañas compatibles con el canal seleccionado.
- Solo se consultan plantillas del canal y de la campaña seleccionada.
- La campaña ya no aparece como un campo dentro del paso `Cuándo`.
- Crear una campaña desde el wizard también respeta el canal elegido.

### Validación

- ESLint del wizard, la vista de listas y el cliente de prospección: correcto.
- TypeScript del panel con `npx tsc --noEmit`: correcto.
- `git diff --check`: correcto.
