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
