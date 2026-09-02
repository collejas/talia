# Changelog · Conexión asistida WhatsApp Meta

Este archivo registra las decisiones, evidencias, cambios, validaciones y despliegues del refactor de conexión asistida de WhatsApp Meta en Talia.

## 2026-09-02 · Recuperación de intentos fallidos

- Se permite corregir el WABA y el Phone Number ID cuando el intento anterior
  está pendiente o en error.
- Una conexión ya confirmada como `conectado` conserva sus IDs y no puede ser
  reemplazada accidentalmente desde el alta.
- Los IDs candidatos rechazados por Meta ya no reemplazan la conexión canónica;
  el error se conserva sin destruir los datos anteriores.
- La configuración operativa solo sincroniza el Phone Number ID cuando la
  suscripción fue confirmada y el estado final es `conectado`.
- El onboarding usa el estado persistido de la conexión asistida para distinguir
  entre una conexión fallida y una conexión realmente terminada.

## 2026-09-02 · Mensajes funcionales para errores de Meta

- Los errores del proveedor se clasifican por operación, código y estado HTTP.
- El tenant recibe una explicación y una acción concreta, sin el mensaje crudo
  de Meta ni nombres técnicos internos.
- Los códigos técnicos permanecen disponibles para diagnóstico interno y los
  errores temporales se identifican como reintentables.

## 2026-08-28 · Evidencia base confirmada

- Se confirmó que el token usado actualmente como `META_TOKEN` es un token de tipo `SYSTEM_USER`.
- Meta devolvió el token como válido y sin expiración (`expires_at: 0` y `data_access_expires_at: 0`).
- El token corresponde a la aplicación `App WhatApp Tal-IA`, `APP_ID: 950298070825920`.
- El token fue probado correctamente contra seis WABA:
  - Rentauto.
  - Porta Mezquite.
  - Tal-IA.
  - Saul Martinez.
  - Grupo Imlux.
  - Gran Peñón.
- En las seis WABA se confirmó:
  - Lectura de la WABA.
  - Lectura de sus números.
  - Relación válida entre WABA y `Phone Number ID`.
  - Aplicación de Talia incluida en `subscribed_apps`.
- Conclusión: el token actual puede ser la base del token global de Talia para el onboarding asistido.
- No se incluyeron tokens, App Secrets ni credenciales en este changelog.

## 2026-08-28 · Webhook compartido confirmado

- Los seis números consultados devuelven la misma aplicación de webhook:

  ```text
  https://talia.mx/api/whatsapp/meta/a2f79c76-340a-4fe7-b05a-6ff4dd532325/webhook
  ```

- Se determinó que esto representa una URL común configurada para la aplicación de Talia, no necesariamente una conexión exclusiva de Rentauto.
- Los mensajes llegan al tenant correcto porque Talia resuelve la organización mediante el `Phone Number ID` incluido en el payload de Meta.
- Decisión: mantener el webhook actual durante la primera versión del refactor.
- Mejora futura posible: evaluar un endpoint global más explícito sin modificarlo durante el primer despliegue.

## 2026-08-28 · Compatibilidad con producción establecida

- La conexión asistida se implementará en paralelo al flujo productivo existente.
- No se cambiarán inicialmente los tokens por tenant.
- No se cambiarán los `Phone Number ID` existentes.
- No se cambiarán el webhook compartido, proveedor, plantillas ni configuración operativa de los tenants actuales.
- El token global se utilizará inicialmente para:
  - Validar acceso a la WABA.
  - Validar el `Phone Number ID`.
  - Registrar un número nuevo.
  - Suscribir la aplicación.
  - Confirmar la suscripción.
- No se ejecutará `/register` automáticamente sobre un número ya registrado.
- Se definirá rollback antes de habilitar el flujo a tenants nuevos.

## 2026-08-28 · Decisiones funcionales

- El cliente autorizará el Business ID de Talia:

  ```text
  1358726956043196
  ```

- El cliente proporcionará a Talia:
  - `WABA_ID`.
  - `Phone Number ID`.
  - PIN de seis dígitos para el registro de Cloud API.
- El PIN no se persistirá en Talia.
- Talia recibirá el PIN temporalmente, lo enviará a Meta durante `/register` y lo descartará.
- El PIN de `/register` se documenta como PIN de verificación en dos pasos, distinto del OTP por SMS o llamada.
- La versión objetivo para las nuevas operaciones es `v25.0`.

## 2026-08-28 · Estado de Meta

- La solicitud adicional de aprobación de Meta quedó resuelta.
- El token global validado ya existe y no debe bloquear el diseño ni la implementación del onboarding asistido.
- Los permisos adicionales presentes en el token actual no se utilizarán como justificación para cambiar el flujo productivo.

## 2026-08-28 · Implementación inicial del flujo asistido

- [x] Agregados valores globales de Meta en configuración del backend, con compatibilidad para el `META_TOKEN` existente.
- [x] Creado el cliente server-side para validar acceso, registrar el número y suscribir la aplicación sin exponer tokens.
- [x] Agregados endpoints tenant-scoped protegidos por `settings.view` y `settings.manage`.
- [x] Agregada migración `whatsapp_meta_connections` para guardar WABA, Phone Number ID, estado, timestamps y errores sanitizados.
- [x] Agregado panel en `settings/variables > WhatsApp` con Business ID `1358726956043196` e instrucciones del onboarding.
- [x] Mantención del flujo productivo: el webhook compartido, los secretos existentes y el envío actual no se reemplazan; la configuración del tenant solo sincroniza el Phone Number ID después de validar.
- [x] Migración aplicada exitosamente en Supabase; la tabla tiene FK tenant, unicidad de WABA/número y RLS habilitado.
- [x] Variables globales agregadas al `.env` del backend; el backend lee Business ID, App ID, `v25.0` y el token global sin exponerlo.
- [x] Validación real de solo lectura contra Rentauto: WABA accesible, número verificado y aplicación suscrita.
- [x] Backend y panel desplegados; API saludable y panel activo.
- [x] Endpoint nuevo verificado sin autenticación: responde `401` y no permite acceso anónimo.
- [ ] Probar con un tenant nuevo y ejecutar regresión de los tenants existentes.

## Próximos cambios previstos

- Agregar las variables globales del backend, sin valores sensibles en el repositorio:
  - `META_TALIA_BUSINESS_ID`.
  - `META_TOKEN` como secreto de infraestructura.
  - `WHATSAPP_META_GRAPH_API_VERSION=v25.0`.
- Definir el almacenamiento por tenant de `WABA_ID`, estado y fechas de conexión.
- Crear endpoints backend para validación, registro, suscripción y verificación.
- Crear la interfaz guiada en `settings/variables`.
- Mantener compatibilidad con los secretos actuales por tenant durante la migración.
- Probar con una WABA nueva compartida por un cliente.
- Ejecutar pruebas de no regresión con tenants existentes.
- Rotar las credenciales que fueron expuestas antes de utilizarlas como configuración definitiva.
