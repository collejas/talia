# Plan Maestro Comercial

Última actualización: 2026-08-25.

Este directorio concentra la documentación base para la capa comercial de TalIA:

- planes comerciales;
- pricing;
- entitlements;
- billing;
- activación de tenants desde Stripe;
- aprovisionamiento inicial;
- migraciones de base de datos;
- orden de implementación.

## Documentos

- [ALINEACION_FLUJO_TENANT_USUARIO_CORREO.md](./ALINEACION_FLUJO_TENANT_USUARIO_CORREO.md): bloque previo que se debe cerrar antes de continuar con el flujo Stripe.
- [PLAN_MAESTRO_COMERCIAL.md](./PLAN_MAESTRO_COMERCIAL.md): visión general del plan, capas y reglas de negocio.
- [ALTA_TENANT_DESDE_STRIPE.md](./ALTA_TENANT_DESDE_STRIPE.md): definición funcional del alta de tenant desde Stripe.
- [IMPLEMENTACION_ALTA_TENANT_STRIPE.md](./IMPLEMENTACION_ALTA_TENANT_STRIPE.md): implementación por capas, separada en base de datos, backend y frontend.
- [MIGRACIONES_ALTA_TENANT_STRIPE.md](./MIGRACIONES_ALTA_TENANT_STRIPE.md): migraciones exactas propuestas para Supabase/PostgreSQL.
- La navegación administrativa propuesta para catálogo comercial y operación de Stripe queda definida en `PLAN_MAESTRO_COMERCIAL.md`, en la sección **Navegación administrativa comercial**.
- La ruta heredada `/settings/commercial-plans` queda fuera de la arquitectura objetivo; el módulo debe entrar por `/settings/commercial`.
- El módulo Comercial es exclusivo del usuario propietario (`owner`) del tenant maestro dueño de la aplicación; no debe estar disponible para tenants clientes ni para sus administradores.
- [CHANGELOG.md](./CHANGELOG.md): registro cronológico de cambios del plan.

## Orden de trabajo recomendado

1. Revisar `PLAN_MAESTRO_COMERCIAL.md` para mantener la visión de negocio.
2. Revisar `ALINEACION_FLUJO_TENANT_USUARIO_CORREO.md` y cerrar ese bloque antes de seguir con Stripe.
3. Revisar `MIGRACIONES_ALTA_TENANT_STRIPE.md` antes de tocar esquema.
4. Implementar backend de provisioning y webhook Stripe.
5. Ajustar frontend de administración y alta manual.
6. Registrar cada cambio relevante en `CHANGELOG.md`.

## Cómo registrar avances

- Usa `CHANGELOG.md` como bitácora principal.
- Registra la fecha exacta de cada avance.
- Si el cambio afecta varias capas, separa la nota por `Base de datos`, `Backend`, `Frontend` y `Operación/Notas`.
- Si un trabajo sigue abierto, deja evidencia de lo que falta en la sección de notas.

## Criterio de uso

Este directorio debe servir como fuente única de referencia para:

- decidir qué se vende;
- decidir cómo se activa un tenant;
- decidir qué se persiste en BD;
- decidir cómo se bloquea o habilita acceso;
- coordinar cambios entre backend, frontend y base de datos.

Estado actual del bloque de alineacion:

- ya esta implementado el flujo de confirmacion de correo + invitacion;
- ya queda guardado el estado intermedio en `tenant_access_invitations`;
- el alta manual y el alta por Stripe ya comparten la misma semantica de acceso inicial.
