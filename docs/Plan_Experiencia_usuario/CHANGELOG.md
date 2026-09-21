# Changelog — Experiencia de usuario de Prospección y Marketing

Este archivo registra decisiones, avances, validaciones, pendientes y bloqueos del refactor de Búsqueda, Prospección y Marketing de Tal-IA.

Plan principal: [PLAN_ARQUITECTURA_Y_REFACTOR_PROSPECCION_MARKETING.md](./PLAN_ARQUITECTURA_Y_REFACTOR_PROSPECCION_MARKETING.md)

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

### Regla de nombres y persistencia

- Los nombres técnicos actuales de tablas, columnas, relaciones y endpoints se conservan.
- Los nombres humanos pertenecen a la capa de UX/frontend.
- No se harán migraciones solo para igualar nombres entre backend y frontend.
- Si una capacidad existe, se reutiliza.
- Si existe con otro nombre, se mapea.
- Si realmente no existe, se crea.

### Fases aprobadas

- **F0 Baseline y contratos:** inventario real y matriz de compatibilidad.
- **F1 Listas para contactar:** reglas, compatibilidad y conteo actual.
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
