# Matriz de permisos por rol

Fecha: 2026-02-11

Objetivo
Definir permisos mínimos por rol y las vistas habilitadas en el panel.

Notas
- Usar permisos ya existentes cuando sea posible.
- Si falta un permiso sugerido, se debe crear antes de asignar.
- Los permisos marcados como "nuevo" requieren alta en `public.permisos`.
- Los permisos legacy de busquedas (ver_busquedas_google, ver_busquedas_inegi, ejecutar_busquedas) se conservan, pero la UI y endpoints usan busquedas.view/run/delete.

## Roles
- Admin
- Supervisor
- Agente
- Invitado

## Permisos por rol (lista final)

| Rol | Permisos |
| --- | --- |
| Admin | ver_panel, ver_inbox, busquedas.view (nuevo), busquedas.run (nuevo), busquedas.delete (nuevo), prospectos.create (nuevo), conv.read, conv.write, conv.assign, contacts.read, contacts.write, messages.read, messages.write, calls.read, calls.write, reports.view, role.manage, user.manage, settings.view (nuevo), settings.manage (nuevo) |
| Supervisor | ver_panel, ver_inbox, busquedas.view (nuevo), busquedas.run (nuevo), prospectos.create (nuevo), conv.read, conv.write, conv.assign, contacts.read, contacts.write, messages.read, messages.write, calls.read, calls.write, reports.view, leads.view (nuevo), pipeline.view (nuevo), agenda.view (nuevo), propuesta.view (nuevo), clientes.view |
| Agente | ver_panel, ver_inbox, busquedas.view (nuevo), busquedas.run (nuevo), prospectos.create (nuevo), conv.read, conv.write, contacts.read, contacts.write, messages.read, messages.write, calls.read, calls.write, leads.view (nuevo), pipeline.view (nuevo), agenda.view (nuevo), propuesta.view (nuevo), clientes.view |
| Invitado | ver_panel, conv.read, contacts.read, messages.read, clientes.view |

## Vistas y permisos requeridos

Nota
- Las vistas de prospeccion/busquedas usan permisos nuevos `busquedas.view` y `busquedas.run`.
- Los permisos legacy (`ver_busquedas_google`, `ver_busquedas_inegi`, `ejecutar_busquedas`) se conservan pero no gobiernan la UI ni los endpoints.

| Vista (ruta) | Permiso requerido |
| --- | --- |
| /dashboard | ver_panel |
| /inbox | ver_inbox |
| /embudo | pipeline.view (nuevo) |
| /leads | leads.view (nuevo) |
| /contactos | contacts.read |
| /clientes | contacts.read (o clientes.view nuevo) |
| /agenda | agenda.view (nuevo) |
| /propuesta | propuesta.view (nuevo) |
| /visitas | reports.view |
| /mapa-de-conversion | reports.view |
| /prospeccion/google-busqueda | busquedas.view |
| /prospeccion/denue-busqueda | busquedas.view |
| /prospeccion/buscador | busquedas.run |
| /prospeccion/prospectos | busquedas.run |
| /prospeccion/contactos | contacts.read |
| /prospeccion/mensajes | messages.read |
| /prospeccion/campanas | reports.view (o campaigns.view nuevo) |
| /crm/oportunidades | conv.read |
| /crm/actividades | reports.view (o activities.view nuevo) |
| /crm/campanas | reports.view (o campaigns.view nuevo) |
| /crm/leads | leads.view (nuevo) |
| /crm/notas | messages.read (o notes.view nuevo) |
| /crm/archivos | reports.view (o files.view nuevo) |
| /crm/audit-logs | reports.view (o audit.view nuevo) |
| /crm/tickets | reports.view (o tickets.view nuevo) |
| /crm/whatsapp | conv.read |
| /settings | settings.view (nuevo) |
| /settings/usuarios | user.manage |
| /settings/usuarios/roles | role.manage |
| /settings/usuarios/permisos | role.manage |
| /settings/empleados | user.manage |
| /settings/hr | user.manage |
| /settings/variables | settings.manage (nuevo) |
| /settings/tenants | platform_admin (global) |
| /settings/catalogo | settings.manage (nuevo) |
| /settings/productos | settings.manage (nuevo) |
| /settings/propiedades | settings.manage (nuevo) |
| /settings/email | settings.manage (nuevo) |
| /settings/formato-cotizacion | settings.manage (nuevo) |
| /settings/reminders | settings.manage (nuevo) |
| /settings/prospeccion | settings.manage (nuevo) |

## Permisos nuevos propuestos
- busquedas.view
- busquedas.run
- busquedas.delete
- prospectos.create
- settings.view
- settings.manage
- leads.view
- pipeline.view
- agenda.view
- propuesta.view
- campaigns.view (opcional)
- activities.view (opcional)
- notes.view (opcional)
- files.view (opcional)
- audit.view (opcional)
- tickets.view (opcional)
