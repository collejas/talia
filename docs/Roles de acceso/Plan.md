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

Lista inicial de vistas y permisos sugeridos
Nota: se usan permisos ya existentes cuando aplican. Si falta alguno, se propone uno nuevo.

| Vista (ruta) | Permiso sugerido |
| --- | --- |
| /dashboard | ver_panel |
| /inbox | ver_inbox |
| /prospeccion/google-busqueda | ver_busquedas_google |
| /prospeccion/denue-busqueda | ver_busquedas_inegi |
| /prospeccion/buscador | ejecutar_busquedas |
| /prospeccion/prospectos | ejecutar_busquedas |
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

Fase 2: Modelo de jerarquia
Decision
- Usar relacion explicita entre empleados para soportar jerarquia por arbol.

Cambios DB
- Crear tabla public.empleados_supervisores:
  - empleado_id uuid
  - supervisor_id uuid
  - organizacion_id uuid
  - constraints y FK a public.empleados y public.usuarios
- Crear funcion recursiva public.equipo_usuario_ids(uid uuid) que devuelva todos los subordinados directos e indirectos.
- Crear helper public.current_user_team_ids() que use auth.uid().

Entregables
- Migracion con DDL y funciones.
- Pruebas SQL basicas para validar arbol.

Fase 3: Permisos y helpers
Cambios DB
- Crear funcion public.current_user_has_perm(codigo text) que verifique permisos por roles.
- Crear view o RPC public.mi_contexto_permisos() que devuelva:
  - usuario_id
  - organizacion_id
  - roles
  - permisos
  - es_admin

Entregables
- Migracion con funciones y view/RPC.
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

Reglas base
- admin ve todo.
- usuario ve propios registros si es propietario/asignado.
- supervisor ve registros del equipo completo (arbol).

Entregables
- Migracion con nuevas policies o actualizacion de policies existentes.
- Lista de policies aplicadas por tabla.

Fase 5: Backend
Objetivo
- Asegurar que endpoints del panel respeten permisos y RLS.

Cambios
- Reemplazar llamadas con service role por llamadas con token de usuario en rutas user-facing.
- Agregar validacion de permisos por endpoint critico.
- Crear helper require_perm en backend para centralizar checks.

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
- Vista administrativa para asignar permisos a roles (checkboxes por permiso/rol).

Archivos candidatos
- frontend/panel/src/lib/api/crm.ts
- frontend/panel/src/app/settings/*
- frontend/panel/src/components/nav/*

Entregables
- Hook y guardias implementados.
- UI con menu y accesos filtrados.
- Pantalla de asignacion rol-permisos operativa.

Fase 7: Pruebas
DB
- Caso vendedor no ve otros vendedores.
- Caso supervisor ve equipo completo.
- Caso admin ve todo.

Backend
- Endpoints retornan 403 cuando falta permiso.

Frontend
- Vistas restringidas no aparecen ni se pueden acceder.

Entregables
- Checklist de pruebas.
- Datos de prueba de jerarquia.

Riesgos y mitigaciones
- Riesgo: service role bypassa RLS.
  - Mitigacion: migrar a token de usuario y checks de permiso.
- Riesgo: jerarquia incompleta.
  - Mitigacion: tabla explicita y CTE recursivo.
- Riesgo: permisos inconsistentes entre UI y API.
  - Mitigacion: misma fuente de permisos desde DB.

Siguientes pasos
- Confirmar estructura de jerarquia (tabla empleados_supervisores).
- Aprobar lista de permisos obligatorios por vista.
- Definir orden de aplicacion por modulos.
