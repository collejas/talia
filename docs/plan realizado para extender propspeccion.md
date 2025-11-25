# solicitud que hizo el Cliene:

Revisa a fondo mi sistema, (TODOS LOS CODIGOS ARCHIVOS, SCRIPTS Y CARPETAS)  y la copia de base de datos que puse aqui: backups/postgres_20251125_164752, y la copia del prompt y funciones que viven en openai que puse aqui: docs/prompt_landing.md, docs/funciones_prompt_openai.md, quiero que me des ideas de que puedo hacer con las vistas: 'Google busquedas' y 'Denue busquedas' para que del resultado de esas búsquedas y un filtrado posterior o selección de prospectos, pueda guardar esos prospectos seccionados  y en el caso del telefono hacer un: 
Checar con Twilio Lookup
Con Twilio Lookup API puedes pedir:
Formato estandarizado (E.164)
Tipo: mobile, landline, voip etc..

{
  "phone_number": "+5214441234567",
  "country_code": "MX",
  "national_format": "444 123 4567",
  "carrier": {
    "name": "TELCEL",
    "type": "mobile"
  }
}

Y si: 

Si carrier.type == "mobile" → lo das por bueno para WhatsApp.


Con ello  automatizar que se envíen por correo (correos de primer contacto o solicitudes de agrandamiento) por whatsapp (preselección en frio para ventas para los teléfonos que fueron tipo móvil), y por teléfono hacer llamada en frio, y todo esto que quede registrado en base de datos. Este método de averiguar que tipo de linea es el teléfono debe ser un método posterior al de la búsqueda, debe ser un método que se accionado solo cuando ya se hizo la primer seleccion o filtro, para luego ya seccionados hacer la verificación de tipo de teléfono, y con ello poder seleccionar a los que se les enviara correo, los que se harán por medio de whatsapp y los que se les hará una llamada


## Propuestas:

Ideas para explotar las vistas “Google búsquedas” y “Denue búsquedas” con verificación Twilio y flujos de contacto

1. Canalizar resultados filtrados a un módulo de prospectos
    Las vistas v_google_places_contactables y v_denue_contactables ya exponen nombre, teléfono, email, web, ubicación, rating y distancia junto con metadatos de la búsqueda. Puedes usar esos campos como insumos para crear registros de “prospecto” una vez seleccionados los resultados pertinentes, guardando la fuente (busqueda_id) y las métricas que justifican la selección. Esto permite persistir la segmentación posterior sin tocar las tablas de resultados en bruto.


- Persistir prospectos seleccionados a partir de las vistas de búsquedas:
* Crear un endpoint en `backend/app/api/routes/crm.py` que reciba IDs de resultados de `v_google_places_contactables` o `v_denue_contactables` y los inserte en una tabla `prospectos` con campos fuente (`busqueda_id`, `fuente_resultado`), datos de contacto y métricas (rating, distancia, estrato).
* Añadir en el repositorio CRM un método que lea los registros desde las vistas usando los filtros existentes de `/prospeccion/*/resultados` para obtener los datos completos antes de insertarlos.
* Extender el front en `frontend/panel/src/app/prospeccion/*-busqueda` para permitir seleccionar filas y disparar el guardado de prospectos.

2. Verificación diferida de teléfonos con Twilio Lookup
   Tras la primera selección, dispara un paso “verificar teléfono” que consulte Twilio Lookup y guarde phone_e164, carrier.name y carrier.type. Así puedes etiquetar automáticamente qué prospectos sirven para WhatsApp (carrier.type = mobile) sin afectar la búsqueda inicial.

- Agregar verificación Twilio Lookup para prospectos seleccionados:
* Implementar un servicio en `backend/app/api/routes/crm.py` (o módulo auxiliar) que reciba IDs de prospectos, consulte Twilio Lookup y guarde el resultado (número E.164, carrier.name, carrier.type, timestamp) en columnas nuevas de la tabla `prospectos`.
* Añadir flags derivados (`contacto_whatsapp_permitido`, `contacto_llamada_permitido`) calculados desde `carrier.type` y guardar cualquier error o ausencia de número para seguimiento.
* Exponer un endpoint batch (ej. `POST /prospeccion/prospectos/verificar-telefonos`) para lanzar la verificación sólo sobre prospectos sin estatus previo.
* Incluir en el front un botón “Verificar teléfonos” en las pantallas de resultados filtrados para ejecutar esta acción post-selección.


3. Automatizar envíos multicanal y registrar el historial
   Con los prospectos ya verificados, puedes disparar automáticamente: correo de primer contacto para todos con email válido, mensaje templado de WhatsApp sólo a móviles y creación de tareas de llamada. Cada acción debe registrarse (estado, timestamp, canal) para medir conversión y evitar duplicados.

- Orquestar envíos de correo, WhatsApp y tareas de llamada con logging:
* Añadir en el backend un job o endpoint que tome prospectos con estatus “pendiente de contacto” y, según los flags de verificación, envíe correo (API SMTP), WhatsApp (proveedor elegido) o cree una tarea de llamada, marcando cada intento en una tabla `contactos_log` con canal, resultado y mensaje.
* Incorporar reintentos/estado (`pendiente`, `enviado`, `error`) para cada canal y evitar contactos duplicados mediante llaves por prospecto+canal+fecha.
* Exponer en `frontend/panel/src/app/prospeccion/*` un tablero que muestre el historial por prospecto (último intento, canal, estatus) y permita reprogramar contactos manualmente.


# Archivos Modificados:
backend/pyproject.toml
backend/app/api/routes/crm.py
backend/app/repositories/crm.py
backend/app/services/__init__.py
backend/tests/channels/test_whatsapp_service.py
frontend/panel/src/components/AppSidebar.tsx

# Archivos Crados
Makefile
backend/app/services/twilio_lookup.py
frontend/panel/src/app/api/prospeccion/prospectos/route.ts
frontend/panel/src/app/api/prospeccion/prospectos/contactar/route.ts
frontend/panel/src/app/api/prospeccion/prospectos/verificar-telefonos/route.ts
frontend/panel/src/lib/prospeccion/prospectos-client.ts

# Migracion Nueva
supabase/migrations/20260605_120000_prospeccion_prospectos.sql
supabase/migrations/20260921_120000_prospeccion_prospectos_core.sql


