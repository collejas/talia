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

### Regla de nombres y persistencia

- Los nombres técnicos actuales de tablas, columnas, relaciones y endpoints se conservan.
- Los nombres humanos pertenecen a la capa de UX/frontend.
- No se harán migraciones solo para igualar nombres entre backend y frontend.
- Si una capacidad existe, se reutiliza.
- Si existe con otro nombre, se mapea.
- Si realmente no existe, se crea.

### Fases aprobadas

1. Contratos y baseline: inventario real y matriz de compatibilidad.
2. Listas para contactar: reglas, compatibilidad y conteo actual.
3. Campañas por canal.
4. Mensajes, correos y guiones.
5. Crear envío, revisión, revalidación y ejecución.
6. Resultados, historial y métricas.
7. Refactor posterior de Prospectos y Búsqueda.

## Registro de avances

Usar este formato para cada cambio posterior:

```markdown
## AAAA-MM-DD — Título del avance

### Estado

En desarrollo | En validación | Completado | Bloqueado

### Cambios

- ...

### Archivos o superficies afectadas

- ...

### Validación

- ...

### Pendientes o riesgos

- ...
```

## Pendientes iniciales

- Auditar tablas, columnas, relaciones y endpoints actuales antes de diseñar migraciones.
- Confirmar cómo se conserva actualmente la definición histórica de las reglas de una lista.
- Confirmar la semántica real de `whatsapp_permitido` y separar, si corresponde, `Tiene WhatsApp` de `Se le puede enviar WhatsApp`.
- Confirmar estados y métricas reales disponibles para Voz con el proveedor actual.
- Diseñar wireframes de `Prospectos → Crear lista → Contactar lista → Campaña → Revisar → Enviar`.
- Definir pruebas funcionales autenticadas para preview, revalidación, compatibilidad de canal, idempotencia y aislamiento por organización.

