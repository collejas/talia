# Plan Maestro de Metodos WhatsApp

Este directorio concentra el plan de migracion y coexistencia de proveedores de WhatsApp:

- Twilio, como metodo legado que se conserva sin eliminar.
- Meta WhatsApp Cloud API, como nuevo metodo que correra en paralelo.

## Documentos

- [Plan maestro](./PLAN_MAESTRO.md)
- [Plan tecnico de implementacion](./PLAN_TECNICO_IMPLEMENTACION.md)
- [Guia de credenciales Meta WhatsApp Cloud API](./GUIA_META_CREDENCIALES.md)
- [Paso a paso Meta](./PASO_A_PASO_META.md)
- [Piloto Meta implementado](./PILOTO_META_IMPLEMENTADO.md)
- [Diseno final webhook unico Meta](./DISEÑO_FINAL_META_WEBHOOK_UNICO.md)
- [Plan de ejecucion webhook unico Meta](./PLAN_EJECUCION_META_WEBHOOK_UNICO.md)
- [Checklist de tareas](./CHECKLIST.md)
- [Plan de ejecucion](./PLAN_EJECUCION.md)

## Objetivo

Permitir que cada tenant tenga su propio metodo de WhatsApp configurado desde `settings/tenants`, de forma que:

- tenants existentes sigan usando Twilio;
- tenants nuevos puedan nacer con Meta;
- el backend seleccione el proveedor por tenant;
- la migracion pueda hacerse por etapas y con corte controlado.
