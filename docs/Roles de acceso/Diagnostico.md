# Diagnostico de acceso por roles y jerarquia

Fecha: 2026-02-10

Resumen ejecutivo
- El modelo RBAC existe (roles, permisos, roles_permisos, usuarios_roles, puestos, empleados), pero no contempla jerarquia de jefes.
- El backend usa service role en muchas llamadas, lo que puede bypassar RLS si no se controla.
- El frontend solo valida sesion, sin controles de permisos por vista o ruta.

Hallazgos en base de datos
- Tablas RBAC: public.roles, public.permisos, public.roles_permisos, public.usuarios_roles, public.puestos, public.empleados.
- public.empleados no tiene relacion explicita jefe -> subordinado. Solo tiene es_gestor y departamento_id.
- RLS actual suele permitir admin o propietario/asignado, pero no equipo o jerarquia.

Roles actuales (org principal 00000000-0000-0000-0000-000000000001)
- admin: Admin (Acceso total a la plataforma)
- 0002: Supervisor
- 0003: Agente
- 0004: Invitado
- 0005, 0006, 0007: roles de prueba (sin usuarios asignados)

Permisos actuales (org principal)
- calls.read, calls.write
- contacts.read, contacts.write
- conv.read, conv.write, conv.assign
- messages.read, messages.write
- reports.view
- role.manage, user.manage
- ver_panel, ver_inbox, ver_busquedas_google, ver_busquedas_inegi, ejecutar_busquedas

Backend
- CRMRepository usa service role por defecto, lo que ignora RLS.
- Hay algunas rutas que usan token de usuario, pero no es uniforme.

Frontend
- middleware solo verifica sesion; no hay guards por permiso.
- No hay ocultamiento de vistas segun permisos.

Riesgos actuales
- Fugas de datos si endpoints usan service role sin checks.
- Acceso transversal entre vendedores (no hay jerarquia de equipo).
- UI muestra vistas que el usuario no deberia ver.

Policies RLS aplicadas (resumen)
- contactos: contactos_admin_all, contactos_miembro_acceso, contactos_rpc_access
- conversaciones: conversaciones_admin_all, conversaciones_miembro_select, conversaciones_miembro_insert, conversaciones_miembro_update, conversaciones_miembro_delete, conversaciones_rpc_access
- mensajes: mensajes_select, mensajes_insert, mensajes_update, mensajes_delete, mensajes_rpc_access
- oportunidades: oportunidades_admin_all, oportunidades_miembro_acceso
- leads: leads_admin_all, leads_member_org
- calendar_bookings: calendar_bookings_admin_all, calendar_bookings_member_org
- actividades: actividades_admin_all, actividades_member_org
- clientes: clientes_admin_all, clientes_miembro_acceso
- empleados: empleados_select_authenticated, empleados_insert_admin, empleados_update_admin, empleados_delete_admin
- usuarios: usuarios_select, usuarios_insert_admin, usuarios_update, usuarios_delete_admin

Notas recientes
- Embudo/leads/agenda usan token de usuario y respetan RLS.
- panel_calendar_bookings usa security_invoker para respetar RLS.
- Asignacion de oportunidades ahora prioriza propietario del contacto.
- Fix critico permisos (2026-02-11):
  - Hallazgo: current_user_has_perm siempre devolvia true por sombra de parametro (codigo) con columna p.codigo.
  - Impacto: usuarios sin permiso podian ejecutar busquedas (ejecutar_busquedas) y otras acciones protegidas.
  - Correccion:
    - DB: recrear funcion public.current_user_has_perm con parametro perm_code y comparar lower(p.codigo)=lower(perm_code).
    - Backend: RPC ahora envia {perm_code} en lugar de {codigo}.
    - Verificacion: current_user_has_perm('ejecutar_busquedas') devuelve false para rol Agente y el endpoint /api/crm/prospeccion/denue/busquedas responde 403.
- Estandar busquedas (2026-02-11):
  - Se definio el modelo busquedas.view/run/delete para separar ver/ejecutar/eliminar.
  - La lista final de vistas usa busquedas.view para /prospeccion/*-busqueda y busquedas.run para /prospeccion/buscador y /prospeccion/prospectos.
