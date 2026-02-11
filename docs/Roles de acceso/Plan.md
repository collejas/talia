# Plan detallado: roles, permisos y jerarquia por arbol

Fecha: 2026-02-10
Objetivo
- Mostrar solo informacion autorizada segun rol y jerarquia de cada empleado.
- Restringir vistas segun permisos del rol.
- Evitar que vendedores vean informacion de otros vendedores, pero permitir a jefes ver a su equipo completo (arbol).

Alcance
- Base de datos: jerarquia y RLS.
- Backend: uso de token de usuario y validacion de permisos.
- Frontend: guardias de ruta y UI por permisos.

Fase 1: Diseno funcional
- Definir matriz de permisos por rol.
- Definir reglas de visibilidad por entidad (contactos, conversaciones, oportunidades, leads, clientes).
- Confirmar vistas bloqueadas por permiso.

Entregables
- Documento de matriz rol-permisos.
- Lista de vistas y permisos requeridos.
- Prototipo de vista "Roles y permisos" para asignar permisos a roles.

Matriz rol-permisos (lista final)
Nota: permisos definitivos para la matriz. Los permisos legacy de busquedas se mantienen, pero la UI y endpoints usan busquedas.view/run/delete.

| Rol | Permisos clave |
| --- | --- |
| Admin | ver_panel, ver_inbox, busquedas.view, busquedas.run, busquedas.delete, conv.read, conv.write, conv.assign, contacts.read, contacts.write, messages.read, messages.write, calls.read, calls.write, reports.view, role.manage, user.manage, settings.view, settings.manage |
| Supervisor | ver_panel, ver_inbox, busquedas.view, busquedas.run, conv.read, conv.write, conv.assign, contacts.read, contacts.write, messages.read, messages.write, calls.read, calls.write, reports.view, leads.view, pipeline.view, agenda.view, propuesta.view |
| Agente | ver_panel, ver_inbox, busquedas.view, busquedas.run, conv.read, conv.write, contacts.read, contacts.write, messages.read, messages.write, calls.read, calls.write, leads.view, pipeline.view, agenda.view, propuesta.view |
| Invitado | ver_panel, conv.read, contacts.read, messages.read |

Reglas de visibilidad por entidad (jerarquia por arbol)
- Contactos: admin ve todo; usuario ve sus contactos; supervisor ve contactos de su equipo.
- Conversaciones: admin ve todo; usuario ve conversaciones propias o de contactos propios; supervisor ve las del equipo.
- Oportunidades: admin ve todo; usuario ve asignadas o propias; supervisor ve las del equipo.
- Leads: admin ve todo; usuario ve leads ligados a sus contactos; supervisor ve leads del equipo.
- Agenda: admin ve todo; usuario ve citas propias o ligadas a sus contactos; supervisor ve citas del equipo.
- Clientes: admin ve todo; usuario ve clientes ligados a oportunidades o contactos propios; supervisor ve clientes del equipo.

Lista final de vistas y permisos
Nota: lista definitiva para integrar en la matriz.

| Vista (ruta) | Permiso sugerido |
| --- | --- |
| /dashboard | ver_panel |
| /inbox | ver_inbox |
| /prospeccion/google-busqueda | busquedas.view |
| /prospeccion/denue-busqueda | busquedas.view |
| /prospeccion/buscador | busquedas.run |
| /prospeccion/prospectos | busquedas.run |
| /prospeccion/contactos | contacts.read |
| /prospeccion/mensajes | messages.read |
| /prospeccion/campanas | reports.view (o proponer campaigns.view) |
| /embudo | conv.read (o proponer pipeline.view) |
| /leads | conv.read (o proponer leads.view) |
| /contactos | contacts.read |
| /clientes | contacts.read (o proponer clientes.view) |
| /crm/oportunidades | conv.read |
| /crm/actividades | reports.view (o proponer activities.view) |
| /crm/campanas | reports.view (o proponer campaigns.view) |
| /crm/leads | conv.read |
| /crm/notas | messages.read (o proponer notes.view) |
| /crm/archivos | reports.view (o proponer files.view) |
| /crm/audit-logs | reports.view (o proponer audit.view) |
| /crm/tickets | reports.view (o proponer tickets.view) |
| /crm/whatsapp | conv.read |
| /mapa-de-conversion | reports.view |
| /visitas | reports.view |
| /agenda | conv.read (o proponer agenda.view) |
| /propuesta | conv.read (o proponer propuesta.view) |
| /settings | settings.view (nuevo) |
| /settings/usuarios | user.manage |
| /settings/usuarios/roles | role.manage |
| /settings/usuarios/permisos | role.manage |
| /settings/empleados | user.manage |
| /settings/hr | user.manage |
| /settings/variables | settings.manage (nuevo) |
| /settings/tenants | platform_admin (se controla por admin global) |
| /settings/catalogo | settings.manage (nuevo) |
| /settings/productos | settings.manage (nuevo) |
| /settings/propiedades | settings.manage (nuevo) |
| /settings/email | settings.manage (nuevo) |
| /settings/formato-cotizacion | settings.manage (nuevo) |
| /settings/reminders | settings.manage (nuevo) |
| /settings/prospeccion | settings.manage (nuevo) |

Permisos CRUD + acciones especiales por modulo (adoptado)
Objetivo: permitir configurar desde la UI si un rol puede ver/crear/editar/eliminar y ejecutar acciones especiales.

Convencion sugerida
- {modulo}.view
- {modulo}.create
- {modulo}.edit
- {modulo}.delete
- {modulo}.export (opcional)
- {modulo}.assign (opcional)
- {modulo}.import (opcional)
- {modulo}.run (procesos automáticos)

Aplicacion inmediata (prospeccion/busquedas) - lista final
- busquedas.view (ver listas/resultados)
- busquedas.run (ejecutar nuevas busquedas)
- busquedas.delete (eliminar busquedas/resultados)
Aplicacion inmediata (prospeccion/prospectos) - UI
- prospectos.create (guardar resultados como prospectos)

Impacto en backend
- GET /prospeccion/* -> busquedas.view
- POST /prospeccion/* (crear) -> busquedas.run
- DELETE /prospeccion/* -> busquedas.delete

Impacto en frontend
- Mostrar/ocultar botones según permisos CRUD/acciones.

Fase 2: Modelo de jerarquia
Decision
- Usar relacion explicita entre empleados para soportar jerarquia por arbol.

Cambios DB
- [check] Crear tabla public.empleados_supervisores:
  - empleado_id uuid
  - supervisor_id uuid
  - organizacion_id uuid
  - constraints y FK a public.empleados y public.usuarios
- [check] Crear funcion recursiva public.equipo_usuario_ids(uid uuid) que devuelva todos los subordinados directos e indirectos.
- [check] Crear helper public.current_user_team_ids() que use auth.uid().
- [check] Crear helper public.current_user_scope_ids() (self + equipo).

Entregables
- [check] Migracion con DDL y funciones.
- Pruebas SQL basicas para validar arbol.

Fase 3: Permisos y helpers
Cambios DB
- [check] Crear funcion public.current_user_has_perm(codigo text) que verifique permisos por roles.
- [check] Crear view o RPC public.mi_contexto_permisos() que devuelva:
  - usuario_id
  - organizacion_id
  - roles
  - permisos
  - es_admin
- [check] Fix de current_user_has_perm: parametro renombrado a perm_code y comparacion correcta con p.codigo.

Entregables
- [check] Migracion con funciones y view/RPC.
- Consulta de prueba con usuario real.

Fase 4: RLS por jerarquia
Tablas objetivo (minimo)
- public.contactos
- public.conversaciones
- public.mensajes
- public.oportunidades
- public.lead_tarjetas
- public.clientes
- public.empleados
- public.usuarios
- public.calendar_bookings
- public.leads
- public.actividades

Reglas base
- admin ve todo.
- usuario ve propios registros si es propietario/asignado.
- supervisor ve registros del equipo completo (arbol).

Entregables
- [check] Migracion con nuevas policies o actualizacion de policies existentes (contactos/conversaciones via funciones, oportunidades, clientes, empleados, usuarios).
- [check] Ajuste de policies para leads, agenda y actividades con scope por usuario/arbol.
- [check] Ajuste de views para respetar RLS (panel_calendar_bookings security_invoker).
- Lista de policies aplicadas por tabla.

Fase 5: Backend
Objetivo
- Asegurar que endpoints del panel respeten permisos y RLS.

Cambios
- [check] Reemplazar llamadas con service role por llamadas con token de usuario en rutas user-facing.
- Agregar validacion de permisos por endpoint critico.
- Crear helper require_perm en backend para centralizar checks.
- [check] Requerir user token en endpoints de embudo/leads/agenda y evitar service_role en headers.
- [check] Ajustar RPC current_user_has_perm a {perm_code} y validar 403 en busquedas Denue.

Archivos candidatos
- backend/app/repositories/crm.py
- backend/app/api/routes/crm.py

Entregables
- PR con cambios de repositorio y rutas.
- Tests basicos por endpoint sensible.

Fase 6: Frontend
Objetivo
- Ocultar o bloquear vistas segun permisos.

Cambios
- Hook usePermissions() que consuma mi_contexto_permisos.
- Guardias por ruta en layouts de settings y secciones sensibles.
- Filtrado de menu segun permisos (ver_panel, ver_inbox, etc).
- [check] Vista administrativa para asignar permisos a roles (checkboxes por permiso/rol).

Fase 8: Limpieza de permisos legacy (final)
Objetivo
- [check] Retirar permisos legacy de busquedas una vez validado el nuevo esquema.

Pasos
1. [check] Confirmar que UI y backend usan solo busquedas.view/run/delete.
2. [check] Validar que ningun rol depende de ver_busquedas_google, ver_busquedas_inegi o ejecutar_busquedas.
3. [check] Eliminar permisos legacy de public.permisos y limpiar roles_permisos.

Entregables
- [check] Migracion de limpieza y respaldo de cambios.

Archivos candidatos
- frontend/panel/src/lib/api/crm.ts
- frontend/panel/src/app/settings/*
- frontend/panel/src/components/nav/*

Entregables
- Hook y guardias implementados.
- UI con menu y accesos filtrados.
- Pantalla de asignacion rol-permisos operativa.
- [check] Roles asignables desde /settings/usuarios con persistencia en usuarios_roles.

Fase 7: Pruebas
DB
- [check] Caso vendedor no ve otros vendedores.
- [check] Caso supervisor ve equipo completo.
- [check] Caso admin ve todo.

Backend
- [check] Endpoints retornan 403 cuando falta permiso.

Frontend
- [check] Vistas restringidas no aparecen ni se pueden acceder.

Entregables
- Checklist de pruebas.
- Datos de prueba de jerarquia.
- [check] Correccion de asignacion: oportunidad sigue propietario del contacto cuando existe.

Checklist regresion permisos (minimo)
- Usuario sin `ejecutar_busquedas`:
  - POST `/api/crm/prospeccion/denue/busquedas` devuelve 403.
  - POST `/api/crm/prospeccion/google/busquedas` devuelve 403.
  - POST `/api/crm/prospeccion/buscador/run` devuelve 403.
  - DELETE `/api/crm/prospeccion/denue/busquedas/{id}` devuelve 403.
  - DELETE `/api/crm/prospeccion/google/busquedas/{id}` devuelve 403.
  - DELETE `/api/crm/prospeccion/denue/resultados` devuelve 403.
  - DELETE `/api/crm/prospeccion/google/resultados` devuelve 403.
- Usuario con solo `ver_busquedas_*`:
  - GET `/api/crm/prospeccion/denue/busquedas` devuelve 200.
  - GET `/api/crm/prospeccion/google/busquedas` devuelve 200.
- Confirmar `current_user_has_perm('ejecutar_busquedas')`:
  - Con rol Agente -> false.
  - Con rol Supervisor/Admin -> true.
- [check] Sincronizacion automatica de matriz rol-permisos (hash + script + arranque).
- [check] Boton de sincronizacion de matriz en UI (roles).

Checklist de pruebas (minimo)
- Vendedor solo ve: contactos propios, conversaciones propias, oportunidades asignadas, agenda propia.
- Vendedor no ve: oportunidades de otros, leads de otros, agenda de otros.
- Supervisor ve: datos propios + equipo completo.
- Admin ve: todo.
- Acceso por URL a vistas restringidas retorna /unauthorized.
- Cambios de rol en /settings/usuarios se reflejan en permisos y menu.

Riesgos y mitigaciones
- Riesgo: service role bypassa RLS.
  - Mitigacion: migrar a token de usuario y checks de permiso.
- Riesgo: jerarquia incompleta.
  - Mitigacion: tabla explicita y CTE recursivo.
- Riesgo: permisos inconsistentes entre UI y API.
  - Mitigacion: misma fuente de permisos desde DB.

Siguientes pasos
- [check] Confirmar estructura de jerarquia (tabla empleados_supervisores).
- [check] UI para asignar supervisor en /settings/empleados.
- Aprobar lista de permisos obligatorios por vista.
- Definir orden de aplicacion por modulos.
