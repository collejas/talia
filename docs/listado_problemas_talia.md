# Listado de problemáticas que TalIA ya resuelve

## Funciones
- **Atender clientes por cualquier canal sin repartir equipos**  
  El backend unifica WhatsApp, voz Twilio, Instagram y webchat con rutas dedicadas y un asistente que puede operar 24/7, así que una sola plataforma da soporte omnicanal sin reconfigurar código ni abrir nuevas plataformas para cada canal.
- **Automatizar el embudo comercial y convertir leads en clientes**  
  El documento de características describe embudos, prospección multifuente, envíos segmentados y motores de cotización, mientras que el esquema de la base de datos tiene la tabla `clientes` con metadatos fiscales y funciones como `convertir_lead_en_cliente` y `crear_busqueda` para disparar conversiones y capturar búsquedas enriquecidas.
- **Detectar ciclos de reengagement y KPIs operativos sin hojas de cálculo**  
  Los dashboards `/api/dashboard/*` calculan embudos, tiempos de respuesta y actividad por agente, y la función `crm_contact_restart_stats` genera métricas de ciclos, montos y reintentos para priorizar qué contactos necesitan seguimiento especial.
- **Optimizar operaciones de fraccionamientos/residenciales**  
  La plataforma gestiona calendarios de amenidades, mantenimiento, comunicaciones segmentadas, mapas, portales del residente y roles con auditoría, por lo que cubre desde reservaciones hasta conciliación de cobros en un solo panel.
- **Cumplir requisitos de seguridad y auditoría**  
  El sistema usa Supabase/Postgres con políticas RLS y logs JSON por request y canal, asegurando que cada usuario vea solo sus datos y que cualquier cambio quede trazado.
- **Integrarse con ecosistema externo sin rehacer la pila**  
  Hay integración con Google Places, APIs FastAPI abiertas y webhooks listos para conectar con ERPs, contabilidad o accesos físicos, lo que evita que las empresas desarrollen conectores desde cero.
- **Convertir las búsquedas de Google Places y DENUE en prospectos seccionados**  
  Las vistas `v_google_places_contactables` y `v_denue_contactables` exponen datos ricos (rating, ubicación, métricas) y se pueden salvar como prospectos seleccionados para conservar la fuente, los filtros usados y permitir segmentar/envíos posteriores sin tocar los resultados crudos.
- **Filtrar canales según Twilio Lookup tras la selección**  
  Una vez que se elige un prospecto, se lanza la verificación Twilio Lookup que escribe vehículo (E.164, carrier, tipo) en la tabla `prospectos` con flags como `contacto_whatsapp_permitido` o `contacto_llamada_permitido`, de modo que el envío por WhatsApp se dispare solo a móviles confirmados.
- **Automatizar campañas/lotes multicanal con reintentos y monitoreo**  
  El plan de prospección describe un pipeline completo “Descubrir → Enriquecer → Preparar → Lanzar → Evaluar” que crea batches (`prospeccion_contacto_batch`/`prospeccion_contacto_envio`), los procesa con workers, expone SSE para métricas por lote y permite reintentos/cancelaciones en correo, WhatsApp y voz.
- **Asignar vendedores humanos, notificar reenganches y medir SLA**  
  El plan de vendedores en WhatsApp usa round-robin, registra cada asignación y actualiza metadata; complementarios, los planes de reenganche de WhatsApp y webchat disparan mensajes automáticos, revisan límites (`WHATSAPP_REENGAGE_*`, `WEBCHAT_REENGAGE_*`) y alertan al vendedor si el prospecto no responde.
- **Registrar tareas/actividades y recordatorios con prioridades/SLA**  
  El modelo ERD incluye la tabla `actividades` (tipo llamada, email, tarea, nota) y define campos obligatorios como `prioridad`, `fecha_vencimiento`, `sla_horas` y `recordatorio_en`, lo que permite disparar recordatorios multicanal y medir el cumplimiento de tareas del equipo comercial/operativo.

## Problemas que resolvemos

- Los equipos se pierden leads porque cada canal (WhatsApp, voz, Instagram, webchat) vive en su propio stack y nadie puede atender todo simultáneamente.
- El embudo comercial es manual y copia datos entre herramientas, por lo que convertir leads en clientes lleva más tiempo del necesario.
- Falta visibilidad operativa: no hay métricas claras de reengagement ni indicadores por canal, así que no saben a quién volver a contactar ni qué canales fallan.
- Las operaciones de fraccionamientos/residenciales usan múltiples sistemas para agendas, mantenimiento y cobranza, lo que impide coordinar amenidades y pagos eficazmente.
- Es difícil demostrar cumplimiento de seguridad y auditoría cuando cada canal guarda datos en silos sin políticas de acceso ni trazabilidad centralizada.
- Cada nueva integración con ERP, contabilidad o accesos físicos termina siendo un proyecto de ingeniería porque no hay APIs/webhooks listos.
- Las búsquedas de Google Places o DENUE se quedan en la vista, no hay forma de convertir esos resultados en prospectos listos para campañas posteriores.
- No se verifica el tipo de línea tras filtrar prospectos, así que se intenta contactar por WhatsApp o llamada sin saber si el número es móvil o válido.
- Las campañas y lotes multicanal se ejecutan de forma síncrona sin historial ni reintentos automatizados, por lo que es difícil medir su salud y reaccionar a fallos.
- Los vendedores no tienen una asignación confiable ni alertas cuando un lead queda inactivo, así que se pierde seguimiento y se repite trabajo.
- No existe un modelo de tareas/recordatorios con prioridades y SLA, con lo que las acciones críticas se olvidan o se duplican.
