# Rutina segura para eliminar un tenant duplicado

Fecha: 2026-04-22

Este documento describe como identificar el tenant correcto cuando hubo un doble clic en la creacion y se generaron dos registros iguales.

## Objetivo

- Detectar cual tenant es el valido.
- Confirmar que el duplicado no sea el que ya tiene configuracion real.
- Eliminar el duplicado sin tocar el tenant bueno.

## Caso tipico

Pasa cuando:

- se crea un tenant;
- el usuario vuelve a dar clic en `Crear tenant + admin`;
- el segundo request llega antes de que el frontend muestre el resultado;
- el backend alcanza a insertar otro registro y luego falla en la ruta `webchat`.

## Regla de oro

No borres nada hasta confirmar:

- `id` del tenant correcto;
- `fecha_alta`;
- rutas `webchat` y `whatsapp`;
- config de `whatsapp.provider`;
- secretos asociados;
- usuarios y roles creados.

## Paso 1. Identificar los dos tenants

En Supabase o en la base de datos, compara estos campos:

- `id`
- `nombre`
- `razon_social`
- `dominio_principal`
- `telefono`
- `estado_onboarding`
- `activo`
- `fecha_alta`

El tenant que normalmente quieres conservar es el que:

- tiene la configuracion correcta;
- tiene el admin ya creado;
- tiene la ruta `webchat` correcta;
- tiene el provider de WhatsApp que esperas.

## Paso 2. Revisar cual tiene la configuracion correcta

Consulta la configuracion de ambos registros y revisa:

- `config.whatsapp.provider`
- `config.whatsapp.meta.phone_number_id`
- `config.whatsapp.twilio.phone_number`
- `config.webchat.calendar.resource_id`

El tenant correcto normalmente sera el que ya tenga:

- `whatsapp.provider = meta` si es tu piloto Meta;
- o `whatsapp.provider = twilio` si es un tenant legacy.

## Paso 3. Revisar rutas del canal

Confirma en `organizacion_rutas_canal`:

- `canal = webchat`
- `clave = alias`

Debes verificar si ambos tenants tienen la misma ruta o si solo uno la tiene.

Si el alias ya existe y ambos tenants quedaron creados, el duplicado suele ser el que no debe conservarse.

## Paso 4. Revisar usuarios y permisos

Comprueba:

- usuarios asignados al tenant;
- roles creados;
- empleados creados;
- permisos iniciales.

Si uno de los tenants ya tiene el admin correcto, ese suele ser el que debes conservar.

## Paso 5. Elegir el tenant a conservar

Criterio sugerido:

1. Conserva el que tenga mas datos ya cargados.
2. Conserva el que tenga la configuracion correcta de WhatsApp.
3. Conserva el que tenga el admin correcto.
4. Conserva el que tenga la ruta `webchat` correcta.

## Paso 6. Respaldo antes de borrar

Antes de eliminar el duplicado, exporta o guarda:

- fila de `organizaciones`
- fila de `organizacion_rutas_canal`
- fila de `secretos`
- fila de `usuarios`
- fila de `usuarios_roles`
- fila de `empleados`

Si puedes, toma un snapshot o descarga un backup puntual del proyecto.

## Paso 7. Eliminar el duplicado

### Opcion recomendada

Si el backend expone una operacion administrada para borrar tenant, usa esa ruta antes que hacer SQL manual.

### Opcion manual en SQL

Si no existe una ruta administrativa, borra primero las dependencias y luego la organizacion.

Orden sugerido:

```sql
begin;

delete from public.organizacion_rutas_canal
where organizacion_id = '<TENANT_DUPLICADO_ID>';

delete from public.secretos
where organizacion_id = '<TENANT_DUPLICADO_ID>';

delete from public.usuarios_roles
where organizacion_id = '<TENANT_DUPLICADO_ID>';

delete from public.empleados
where organizacion_id = '<TENANT_DUPLICADO_ID>';

delete from public.calendar_resources
where organizacion_id = '<TENANT_DUPLICADO_ID>';

delete from public.organizaciones
where id = '<TENANT_DUPLICADO_ID>';

commit;
```

## Paso 8. Verificar que quedo solo el bueno

Confirma que:

- ya no aparece el tenant duplicado;
- la ruta `webchat` sigue apuntando al tenant correcto;
- los secretos del tenant bueno siguen intactos;
- el panel carga el tenant correcto.

## Paso 9. Limpiar cache si aplica

Si el panel o backend siguen mostrando datos viejos:

- reinicia el backend;
- reinicia el panel;
- espera a que expire cache de rutas si aplica.

## Si tienes dudas sobre cual borrar

No borres ninguno.

Primero revisa:

- fecha de creacion;
- configuracion de WhatsApp;
- rutas;
- admin creado;
- logs del request que disparo el alta.

## Recomendacion para evitar que vuelva a pasar

- Mantener el boton de crear deshabilitado mientras la request esta en curso.
- Agregar bloqueo de alias antes de insertar el tenant.
- Dejar el backend idempotente para que un doble clic no deje basura.

