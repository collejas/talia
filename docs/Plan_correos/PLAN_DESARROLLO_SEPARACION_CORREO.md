# Plan de desarrollo: separación de enrutamiento de correos

Fecha: 13 de marzo de 2026.

## Objetivo funcional

Implementar enrutamiento por tipo de flujo:

- Prospección por correo: **Brevo**
- Correos de asistentes IA (WhatsApp/Webchat): **SMTP normal**
- Confirmación de cita desde `https://talia.mx/demo.html`: **SMTP normal**

## Principio de diseño

No depender de una regla global "si hay `brevo.api_key`".  
El proveedor de envío debe resolverse por **contexto de negocio**.

## Alcance técnico

- Backend: lógica de envío y endpoints/servicios que disparan correo.
- Frontend: sin cambios obligatorios para separar proveedor; opcional mostrar etiqueta informativa.
- Base de datos: no requiere migración estructural para fase inicial.

## Fase 1: Introducir enrutamiento explícito por proveedor

### Tareas

1. Extender `send_email` para aceptar estrategia explícita:
- `provider_preference = "brevo" | "smtp" | "auto"` (default temporal: `auto` por compatibilidad).

2. Ajustar resolución interna:
- `brevo`: falla si falta API key.
- `smtp`: ignora Brevo y usa SMTP.
- `auto`: comportamiento legado (actual) para no romper flujos no migrados.

3. Agregar logs estructurados:
- proveedor elegido
- organizacion_id
- flujo (`prospeccion`, `assistant_info_email`, `booking_public_demo`, etc.)

### Criterio de aceptación

- Se puede forzar SMTP aun cuando exista `brevo.api_key`.
- Se puede forzar Brevo en prospección.

## Fase 2: Aplicar enrutamiento por flujo

### Tareas

1. Prospección
- Mantener envío con `provider_preference="brevo"`.
- Archivo objetivo: `backend/app/services/prospeccion_contact_sender.py`.

2. Asistente WhatsApp (correo informativo)
- Cambiar a `provider_preference="smtp"`.
- Archivo objetivo: `backend/app/channels/whatsapp/tools.py`.

3. Asistente Webchat / lead tools (correo informativo)
- Cambiar a `provider_preference="smtp"`.
- Archivo objetivo: `backend/app/assistants/tools/lead.py`.

4. Confirmaciones de booking en chat (si aplican)
- Cambiar confirmación/reprogramación/cancelación a `provider_preference="smtp"`.
- Archivo objetivo: `backend/app/channels/webchat/service.py`.

### Criterio de aceptación

- Con Brevo configurado, los correos de asistentes/booking salen por SMTP.
- Prospección sigue saliendo por Brevo.

## Fase 3: Enviar confirmación desde agenda pública (`demo.html`)

### Problema actual

`POST /crm/web/booking/book` crea booking pero no dispara correo de confirmación.

### Tareas

1. Al confirmar booking público:
- invocar función de confirmación de correo existente (o helper nuevo reutilizable).
- usar `provider_preference="smtp"`.

2. Persistir trazabilidad en metadata de `calendar_bookings`:
- `invite_status`
- `invite_message_id`
- `invite_sent_at`
- `invite_error` (si aplica)

3. Mantener adjunto ICS y textos actuales de confirmación.

### Criterio de aceptación

- Cada cita creada desde `demo.html` genera correo de confirmación SMTP.
- En BD queda `invite_status='sent'` cuando procede.

## Fase 4: QA funcional y técnica

### Casos de prueba mínimos

1. Tenant con `mail.*` + `brevo.api_key` activos:
- prospección => Brevo
- asistente WhatsApp => SMTP
- asistente Webchat => SMTP
- agenda pública demo => SMTP

2. Tenant sin Brevo:
- prospección debe fallar con error claro de configuración (o policy definida por negocio).

3. Tenant con SMTP incompleto:
- asistentes y demo booking deben fallar con error claro y registro en metadata/log.

4. Verificación de persistencia:
- `web_booking_sessions` con `booked_at`
- `calendar_bookings.metadata.invite_*` actualizado

## Fase 5: endurecimiento y operación

### Tareas

1. Métricas/observabilidad
- dashboard simple por proveedor (`email_provider=brevo|smtp`)
- tasa de fallo por flujo

2. Documentación operativa
- matriz de flujos y proveedor esperado
- checklist de onboarding de tenant (SMTP y Brevo)

3. Fallback policy (decisión explícita)
- definir si un flujo SMTP debe intentar Brevo como respaldo o no
- recomendación inicial: **sin fallback cruzado**, para mantener separación nítida

## Riesgos y mitigación

1. Riesgo: romper prospección al cambiar `send_email`.
- Mitigación: mantener `auto` y migrar llamadas por fases.

2. Riesgo: falta configuración SMTP en tenants.
- Mitigación: validación previa en `/settings/variables` + mensajes de error claros.

3. Riesgo: duplicar envíos al integrar demo booking.
- Mitigación: guardar `invite_status` y no reenviar si ya existe `sent` para mismo booking.

## Entregables

1. Código backend actualizado con enrutamiento explícito.
2. Endpoint de booking público enviando confirmación SMTP.
3. Logs y trazabilidad en metadata de booking.
4. Pruebas manuales y, donde aplique, tests automatizados.

## Orden recomendado de ejecución

1. Fase 1 (infra de enrutamiento)
2. Fase 2 (migrar flujos existentes)
3. Fase 3 (activar confirmación demo pública)
4. Fase 4 (QA)
5. Fase 5 (operación/observabilidad)

