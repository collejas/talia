# Cierre del refactor de runtime y documentacion

Fecha: 2026-04-28 (UTC)

Este documento resume todo lo que se fue cerrando dentro del plan `personas, cuentas y relacion` despues de la transicion operativa inicial. La idea es dejar en un solo lugar lo que ya quedo hecho, lo que quedo como contrato por compatibilidad y lo que ya solo vive como archivo historico.

## 1. Lo que ya quedo cerrado en el producto

### 1.1 Vista de contactos

- La grafica de `contactos` ya no queda alta de mas.
- Se agrego buscador de contactos en el toolbar superior.
- El buscador se alineo con el resto de acciones de la barra superior.
- Se movio el contador y el buscador al lado izquierdo.
- Las acciones `Exportar CSV`, `Nuevo contacto` y `Personalizar columnas` quedaron del lado derecho.
- La columna de acciones quedo justo despues del nombre del contacto.
- Los botones de acciones quedaron compactos, con icono.
- El drawer lateral dejo de ser el drawer generico del layout y ahora muestra detalle real del contacto.
- El footer del drawer se simplifico para no simular un submit inexistente.
- El alta ahora abre automaticamente la ficha rica del contacto creado o reutilizado,
  evitando regresar al listado sin contexto.

### 1.2 Flujo guiado de CRUD de contactos

- El alta de contactos ya no se presenta como un modal monolitico.
- La vista principal ofrece acciones separadas para:
  - `Nuevo contacto`
  - `Nueva empresa`
  - `Persona física con actividad empresarial`
  - `Vincular contacto a empresa`
- El flujo de alta ya usa copy de usuario final.
- El flujo de edicion se alineo al mismo lenguaje.
- La vinculacion contacto-empresa quedo como flujo independiente.
- El resumen lateral ya acompana el flujo en desktop.
- La vista dedicada de detalle quedo disponible en `/personas/[contactoId]`.
- Desde esa ficha ya se puede editar, vincular a empresa y disparar el merge controlado.

### 1.3 Exportacion

- El exportador local del listado se reemplazo por un export backend.
- El export descarga CSV desde el backend.
- El export respeta el filtro de busqueda activo.
- El archivo exportado se alinea con el modelo nuevo de `personas + cuentas + cuenta_personas + conversaciones`.

### 1.4 Reasignacion

- El modal de reasignar vendedor dejo de ocupar todo el ancho de la vista.
- Se compacto para que solo use el espacio necesario.

## 2. Lo que ya quedo cerrado en runtime/backend

### 2.1 Dependencia legacy de `public.contactos`

- El runtime activo del panel ya no depende de `public.contactos`.
- El detalle de contacto ya no cae al fallback legacy.
- Los lookups activos por email, telefono y WhatsApp quedaron apuntando al modelo nuevo.
- La escritura legacy de alta, edicion y borrado quedo retirada del flujo operativo.
- El backend de contactos quedo sin lecturas ni escrituras `legacy_*` para el flujo activo; la clave operativa ahora es `personas.id`.

### 2.2 Contactos y relaciones

- La vista activa se nutre de `personas`, `cuentas`, `cuenta_personas` y `conversaciones`.
- El repo ya resuelve detalle y listas desde el modelo nuevo.
- Se elimino el ultimo embed directo de `contactos` en el runtime activo.

### 2.3 Limpieza semantica interna reciente

- Se siguio moviendo el backend hacia aliases `persona_*` en helpers de `storage.py`.
- `webchat`, `whatsapp`, `assistants` y `webchat_followups` ya consumen varios de esos
  aliases nuevos.
- el nucleo de webchat ya expone `persona_id` en su contexto interno y usa helpers de
  seguimiento con semantica `persona_*`, manteniendo compatibilidad con `contact_id`
  donde siguen existiendo contratos viejos.
- el nucleo de WhatsApp ya expone `ToolRuntimeContext.persona_id` y `whatsapp_followups`
  ya tiene helpers `persona_*` para reenganche y escalación, con wrappers legacy para
  no romper los call sites restantes.
- el bloque operativo de `backend/app/channels/whatsapp/tools.py` ya quedó con un
  helper local `persona_id` en los flujos centrales de alta, correo, cierre, agenda,
  reprogramación, cancelación y notificación a ventas, conservando alias de
  compatibilidad donde el contrato externo sigue llamándose `contact_id`
- Se agregaron puentes como:
  - `fetch_opportunity_persona(...)`
  - `get_webchat_persona_id(...)`
  - `fetch_webchat_session_id_by_persona(...)`
  - `maybe_promote_prequalified_from_persona(...)`
  - `capture_persona_lead_if_ready(...)`
- Se mantuvieron los nombres legacy estructurales (`contact_id`, `contacto_id`) para no
  romper contratos ni RPCs que todavia sirven como compatibilidad.
- La validacion reciente quedo verde con compilacion, tests focalizados y `GET /health`.

### 2.4 Puente legacy minimo que sigue vivo

Aunque el runtime principal ya opera sobre `personas`, quedaron algunas tablas que aun
exigen FK a `public.contactos`. Para no hacer hardcode por tenant, se dejo un puente
general que materializa una sombra legacy solo cuando hace falta:

- `asignaciones_vendedores`
- `prospeccion_whatsapp_atribucion_eventos`
- `web_sessions`
- `web_booking_sessions`
- `openai_request_usage`

Ese puente toma `persona_id`, crea o reutiliza la fila sombra en `contactos` y luego deja
que la escritura legacy siga su curso. La traza operativa no cambia; solo se mantiene
compatibilidad hasta retirar esas FKs.

`web_sessions` entra al puente solo para el writer first-party que sigue persistiendo
`contacto_id`; su uso de lectura y analitica sigue separado del ciclo de alta de personas.

### 2.5 Merge controlado

- Se agrego `POST /crm/personas/{contacto_id}/merge` para fusionar duplicados de persona
  de forma controlada.
- La fusion mueve oportunidades al contacto destino, reubica relaciones de empresa y
  archiva el origen con metadata de merge.
- La pantalla dedicada de detalle en el panel expone esta accion desde la ficha rica.

## 3. Limpieza semantica que se hizo

La base de codigo original se escribio con el concepto `contact`, y por eso quedaron contratos y helpers con ese nombre. Durante esta etapa se limpio bastante semantica interna para que el codigo hable mas de `persona` y menos de `contacto`.

### 3.1 Archivos tocados

- `backend/app/repositories/crm.py`
- `backend/app/channels/webchat/service.py`
- `backend/app/channels/webchat/notifications.py`
- `backend/app/channels/whatsapp/service.py`
- `backend/app/channels/whatsapp/tools.py`
- `backend/app/assistants/tools/lead.py`
- `backend/app/services/prospeccion_contact_sender.py`

### 3.2 Cambios principales

- Se renombraron helpers internos para hablar de `persona`.
- Se renombraron variables locales con ruido semantico viejo.
- Se alinearon los flujos de booking, scoring y notificacion.
- Se corrigieron referencias internas rotas que quedaron a mitad del rename.
- Se conservaron los contratos publicos que otras capas consumen.

## 4. Que quedo por compatibilidad

Lo que sigue usando `contact` no significa que siga dependiendo de `public.contactos`.
En la practica, ya son contratos o nombres historicos:

- firmas publicas de helpers compartidos
- parametros de llamadas entre modulos
- wrappers de notificacion que ya estaban acoplados a la semantica original
- nombres de APIs ya consumidas por otras capas

Se decidio no renombrar todo de una vez porque eso requeriria una refactorizacion coordinada de firmas publicas, no solo una limpieza interna.

## 5. Estado del plan

### 5.1 Cerrado

- Alta estructurada
- Edicion estructurada
- Flujo guiado de CRUD de contactos
- Vinculacion independiente contacto-empresa
- Exportacion base
- Detalle real en el drawer
- Retiro del fallback legacy en runtime
- Limpieza semantica mayoritaria del backend activo

### 5.2 Pendiente

- Deduplicacion controlada
- Decidir si se renombra el contrato publico de `contact` a `persona`

## 6. Lectura final

Hoy el sistema ya opera sobre `personas`, `cuentas` y `cuenta_personas`.
`contactos` quedo como referencia historica y ya no es la fuente activa del runtime del panel.

Lo que aun conserva `contact` en nombres o firmas es semantica heredada, no dependencia del modelo viejo.
