# Plan de ejecucion: coexistencia Twilio + Meta WhatsApp

## Fase 0. Definicion tecnica

### Objetivo

Aterrizar el contrato de configuracion y el modelo de coexistencia antes de tocar comportamiento.

### Entregables

- esquema de config por tenant
- lista de campos por provider
- definicion de mensajes de entrada y salida
- definicion de trazabilidad de delivery

### Dependencias

- aprobacion del modelo por producto/operacion
- confirmacion de que Twilio se conserva como legado

## Fase 1. Base de datos

### Objetivo

Guardar la configuracion por tenant y preparar la persistencia generica.

### Trabajo

- extender la configuracion del tenant para incluir `whatsapp.provider`
- crear ramas de configuracion para `twilio` y `meta`
- agregar trazabilidad generica en mensajes y delivery events
- revisar puntos que hoy dependan del nombre Twilio

### Criterio de salida

- un tenant puede guardar el provider sin afectar a otros tenants
- los mensajes ya pueden registrar el proveedor usado

## Fase 2. Backend base

### Objetivo

Introducir el resolvedor de provider y los adapters sin cambiar la logica del negocio.

### Trabajo

- crear un servicio de resolucion por tenant
- extraer la logica de Twilio a un adapter
- crear el adapter de Meta
- ajustar el router de WhatsApp para elegir adapter
- ajustar la validacion de webhook por provider

### Criterio de salida

- Twilio sigue funcionando
- Meta puede recibir y enviar mensajes en un tenant piloto

## Fase 3. Integracion con CRM e inbox

### Objetivo

Garantizar que ambos providers se comporten igual a nivel de experiencia de usuario.

### Trabajo

- revisar registro de conversaciones
- revisar deduplicacion
- revisar entrega y estados
- revisar adjuntos y metadata
- asegurar que los adjuntos WhatsApp se guarden en `whatsapp` y se sirvan via el proxy interno del inbox
- revisar notificaciones y flujo de asistente

### Criterio de salida

- el inbox muestra conversaciones de ambos providers
- el inbox abre PDFs, imagenes y videos de WhatsApp sin depender de la URL cruda de Storage
- el CRM no pierde historial ni relaciones de contacto

## Fase 4. Frontend de tenants

### Objetivo

Permitir administrar el provider desde `settings/tenants`.

### Trabajo

- selector de provider
- formularios condicionales por provider
- validacion de campos requeridos
- preseleccion segura para tenants nuevos y existentes

### Criterio de salida

- se puede cambiar o definir el provider desde la UI
- se puede guardar sin romper tenants en produccion

## Fase 5. Prueba en paralelo

### Objetivo

Usar un tenant nuevo con Meta y dejar Twilio intacto.

### Trabajo

- crear tenant piloto
- activar Meta
- correr pruebas de ida y vuelta
- comparar logs, estados y persistencia

### Criterio de salida

- el tenant piloto opera estable
- no hay regresiones en tenants Twilio

## Fase 6. Migracion gradual

### Objetivo

Pasar tenants seleccionados a Meta.

### Trabajo

- migrar tenant por tenant
- validar cada corte
- monitorear errores y delivery
- documentar excepciones

### Criterio de salida

- la mayoria o totalidad de tenants relevantes operan en Meta

## Fase 7. Suspender Twilio por configuracion

### Objetivo

Desactivar Twilio solo donde ya no se use.

### Trabajo

- dejar Twilio sin asignacion en tenants migrados
- conservar codigo y datos historicos
- documentar rollback por tenant

### Criterio de salida

- Twilio permanece como legado, no como dependencia activa

## Orden recomendado

1. Fase 0
2. Fase 1
3. Fase 2
4. Fase 3
5. Fase 4
6. Fase 5
7. Fase 6
8. Fase 7

## Decision clave

No mezclar la migracion tecnica con la migracion operativa:

- primero coexistencia
- luego pruebas
- despues corte gradual
- al final suspension por configuracion
