# Changelog — Plan de cobro de mensajes

Este archivo registra el avance del diseño e implementación del sistema de cobro por tenant.

## Estados utilizados

- **Propuesto:** pendiente de aprobación.
- **Aprobado:** decisión aceptada para el diseño.
- **En desarrollo:** implementación iniciada.
- **Validación:** requiere pruebas técnicas o funcionales.
- **Completado:** implementado y verificado.
- **Bloqueado:** no puede avanzar hasta resolver una dependencia.

## 2026-08-13

### Documentación inicial — Completado

- Se documentó la auditoría de contabilización actual de mensajes y eventos Meta.
- Se identificó el flujo `identidades_canal → conversaciones → mensajes → eventos_entrega`.
- Se registraron riesgos de duplicidad, mensajes sin proveedor, atribución por tenant y falta de categorías tarifarias normalizadas.
- Se confirmó posteriormente que la migración de concurrencia de WhatsApp está aplicada en la base activa.

Documento:

- `Auditoria_contabilizacion_mensajes_Meta.md`

### Regla comercial de cobro — Aprobado

- Cobro de **$0.09 MXN por cada mensaje entrante o saliente**.
- El cobro no depende de quién inició el hilo.
- El cobro no depende de la categoría Meta del mensaje.
- El hilo únicamente agrupa mensajes y no genera un cargo adicional.
- Los eventos `enviado`, `entregado` y `leído` no generan cargos independientes.
- Un mensaje aceptado por el proveedor se cobra una sola vez.

### Costo publicado de Meta — Aprobado

- Tarifa inicial documentada para México: **$0.5614 MXN**.
- Aplica como costo de Meta para mensajes salientes iniciados por la empresa, según la tarifa vigente configurada.
- El costo lo paga directamente el tenant a Meta.
- GEOACTIV no suma este costo al cargo propio durante la primera etapa.
- La tarifa Meta se versionará por vigencia y se actualizará cuando Meta publique un cambio.
- No se importarán facturas ni se manejará una conciliación financiera contra Meta.
- Sí se mantendrá conciliación técnica interna de duplicados, estados y mensajes sin proveedor.

### Tarifas GEOACTIV globales y particulares — Aprobado

- El dueño de la aplicación podrá establecer una tarifa global para todos los tenants.
- El dueño de la aplicación podrá establecer una tarifa particular para un tenant.
- La tarifa particular tendrá prioridad sobre la global.
- Si no existe tarifa particular activa, aplicará la tarifa global.
- Los tenants normales podrán consultar su tarifa efectiva, pero no modificarla.
- Las tarifas cerradas no se editarán; se creará una nueva versión con nueva vigencia.

### Arquitectura de datos — Aprobado

- La información estructural del cobro se modelará mediante columnas explícitas.
- No se utilizarán `metadata`, `payload`, `json`, `jsonb` ni estructuras equivalentes para la lógica principal del cobro.
- Se propusieron tablas para tarifas Meta, tarifas GEOACTIV, periodos, consumos, resúmenes de hilos, ajustes y alertas.
- Cada tabla tendrá `organizacion_id` y relaciones protegidas por tenant.
- Los consumos guardarán una fotografía de la tarifa aplicada para preservar históricos.

### Visualización y seguridad por tenant — Aprobado

- El tenant maestro tendrá un visualizador global.
- Cada tenant normal verá únicamente sus propios datos.
- El tenant maestro podrá configurar tarifas globales y particulares.
- RLS y backend deberán validar el tenant; el frontend no será la única protección.

Documentos:

- `Plan_base_cobro_mensajes_por_tenant.md`

### Estado de implementación

**Diseño y documentación:** completado.  
**Migraciones de cobro:** pendientes.  
**Backend de cobro:** pendiente.  
**Frontend de configuración y reportes:** pendiente.  
**Activación de cobro:** pendiente.

### Base de datos — En desarrollo / estructura aplicada

- Se creó y aplicó `supabase/migrations/20260813_140000_message_billing_foundation.sql`.
- Se creó y aplicó `supabase/migrations/20260813_141000_message_billing_period_overlap_guard.sql`.
- Se crearon tablas para tarifas GEOACTIV globales/particulares, tarifas publicadas de proveedor, configuración de límites, periodos, ledger de mensajes, resúmenes de hilos, ajustes y alertas.
- Se agregó idempotencia por tenant, proveedor e ID del mensaje.
- Se agregaron claves foráneas compuestas para proteger relaciones entre tenant, mensaje, conversación, oportunidad y periodo.
- Se activó y forzó RLS en las nuevas tablas.
- El owner puede administrar tarifas y configuración; cada tenant puede consultar únicamente sus filas.
- Se cargó la tarifa global inicial de GEOACTIV de `$0.0900 MXN`.
- Se cargó la tarifa inicial de Meta de `$0.5614 MXN` para México, WhatsApp, categoría fallback y mensajes iniciados por empresa.
- No se generaron cargos ni se hizo backfill de mensajes históricos.
- Se añadió una restricción de exclusión para impedir periodos solapados del mismo tenant.

Pendiente de esta fase:

- Crear el servicio transaccional que poblará el ledger.
- Definir la resolución final de tarifa Meta por categoría y fallback.
- Validar RLS con usuarios reales de owner y tenant normal.

## Próximas fases

### Fase 1 — Diseño técnico detallado

- Aprobar nombres finales de tablas y columnas.
- Confirmar constraints y claves foráneas compuestas.
- Confirmar la precedencia de tarifas globales y particulares.
- Confirmar la fecha de inicio del primer periodo de cobro.

### Fase 2 — Base de datos

- Crear migración de catálogos y tarifas.
- Crear migración del ledger de mensajes.
- Crear periodos, ajustes, alertas y resúmenes de hilos.
- Implementar índices, constraints y RLS.
- Validar aislamiento entre tenants.

### Fase 3 — Backend

- Crear servicio transaccional e idempotente de consumo.
- Registrar mensajes entrantes y salientes.
- Resolver tarifa Meta y tarifa GEOACTIV efectiva.
- Calcular cargo de la aplicación y costo combinado.
- Crear endpoints administrativos y de tenant.

### Fase 4 — Frontend

- Crear configuración global de tarifa GEOACTIV.
- Crear override particular por tenant.
- Crear visualizador global del tenant maestro.
- Crear visualizador individual de consumo.
- Crear reportes de costos y conversiones.

### Fase 5 — Validación

- Probar duplicados y reintentos.
- Probar mensajes entrantes y salientes.
- Probar tarifas globales y particulares.
- Probar cambio de vigencia sin alterar históricos.
- Probar RLS entre tenants.
- Probar límites y alertas.

### Fase 6 — Activación

- Ejecutar un periodo de prueba sin cobro real.
- Revisar discrepancias técnicas.
- Aprobar el primer periodo.
- Activar tenants seleccionados.
- Comenzar cobro con fecha de corte documentada.
