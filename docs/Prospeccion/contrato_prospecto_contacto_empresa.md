# Contrato de ciclo de vida: prospecto, contacto y empresa

Última actualización: 2026-10-16 (UTC)

Estado: contrato funcional y técnico vigente. Este documento define la separación
entre el módulo de prospección y el CRM de personas/empresas.

## 1. Regla principal

Un `prospecto` es un registro de prospección, no un contacto CRM ni una empresa.

El prospecto solo puede promoverse a CRM cuando existe una respuesta o interacción
real del destinatario después de un contacto de prospección por alguno de estos
canales:

- correo;
- WhatsApp;
- voz.

El envío creado, la aceptación del proveedor, la entrega, la lectura o un intento
fallido no son suficientes para crear una persona o una empresa.

Mientras no exista respuesta real, el registro debe permanecer únicamente en
`public.prospeccion_prospectos` y en sus tablas de envíos, eventos y auditoría.

## 2. Entidades y responsabilidades

| Entidad | Fuente de verdad | Responsabilidad | Puede crear CRM |
| --- | --- | --- | --- |
| Resultado | `public.resultados` | Resultado técnico de Google/DENUE u otra búsqueda | No |
| Prospecto | `public.prospeccion_prospectos` | Registro comercial seleccionable, enriquecible y contactable | No, por sí solo |
| Persona/contacto | `public.personas` | Persona humana con datos de contacto | Sí, solo después de respuesta o alta CRM explícita |
| Empresa/cuenta | `public.cuentas` | Entidad comercial o fiscal | Sí, vinculada al contacto cuando corresponda |
| Relación | `public.cuenta_personas` | Vínculo de una persona con una empresa | Solo como parte de una promoción/alta CRM válida |

Los registros de `prospeccion_contacto_batch`,
`prospeccion_contacto_envio` y `prospeccion_contactos_log` representan la ejecución
y el resultado del contacto. No sustituyen a `personas`, `cuentas` ni
`cuenta_personas`.

## 3. Ciclo de vida permitido

```text
resultado de búsqueda
        ↓
prospecto
        ↓
envío de prospección
        ↓
respuesta real
        ↓
deduplicación CRM
        ↓
persona/contacto y, si corresponde, empresa/cuenta
        ↓
relación y oportunidad
```

### 3.1 Antes de contactar

Se puede:

- buscar y filtrar resultados;
- guardar resultados como prospectos;
- enriquecer teléfono, correo, sitio, dirección y actividad;
- editar datos del prospecto;
- seleccionar prospectos para campañas.

No se debe:

- crear una persona CRM solo por guardar un prospecto;
- crear una empresa solo porque el resultado contiene `nombre_comercial`,
  `razon_social`, actividad o domicilio;
- ejecutar la deduplicación de personas/cuentas contra la tabla de prospectos.

### 3.2 Después del envío

El sistema debe registrar el envío y sus estados por canal:

- `pendiente`;
- `enviado`;
- `entregado`;
- `leido`;
- `fallido`;
- `respondido`.

Solo `respondido` —o un estado equivalente que represente interacción humana
confirmada— habilita la promoción automática.

### 3.3 Después de una respuesta

Cuando se confirma la respuesta:

1. Se identifica el `prospecto_id`, `organizacion_id` y canal.
2. Se conserva el prospecto como historial de origen.
3. Se ejecuta la deduplicación únicamente sobre `personas` y `cuentas`.
4. Se reutiliza la persona/empresa existente o se crea la que corresponda.
5. Se crea o actualiza `cuenta_personas` si existe una empresa.
6. Se crea o actualiza la oportunidad y su historial.
7. Se registra en la persona la trazabilidad de la promoción:
   `prospecto_id`, fuente, canal y fecha.

La promoción debe ser idempotente. Una segunda respuesta del mismo prospecto no
debe crear otra persona, empresa u oportunidad duplicada.

## 4. Dos deduplicaciones distintas

### 4.1 Dedupe de prospectos

Su objetivo es evitar que el mismo resultado se guarde varias veces dentro del
módulo de prospección.

Puede utilizar:

- `organizacion_id + fuente + external_id`;
- identidad del resultado;
- claves normalizadas de teléfono, correo, nombre y ubicación cuando no exista
  `external_id` confiable.

Este dedupe solo decide si se crea o actualiza un registro en
`prospeccion_prospectos`. Nunca debe reutilizar una fila de `personas` o
`cuentas`, ni mostrarla como duplicidad CRM.

### 4.2 Dedupe CRM

Su objetivo es evitar crear personas o empresas duplicadas después de una respuesta
real o durante un alta CRM explícita.

Para personas:

- coincidencia fuerte: teléfono normalizado o correo normalizado;
- coincidencia débil: nombre y organización;
- una coincidencia débil requiere confirmación humana.

Para empresas:

- coincidencia fuerte: RFC;
- coincidencia media: razón social;
- coincidencia débil: nombre comercial o alias;
- una coincidencia media/débil requiere confirmación humana.

Las consultas de dedupe CRM deben leer únicamente:

- `public.personas`;
- `public.cuentas`;
- `public.cuenta_personas` cuando se necesite validar una relación.

No deben consultar `public.prospeccion_prospectos` como fuente de candidatos CRM.

## 5. Matriz de decisión

| Evento | Permanece prospecto | Busca dedupe CRM | Crea/reutiliza persona | Crea/reutiliza empresa |
| --- | ---: | ---: | ---: | ---: |
| Guardar resultado como prospecto | Sí | No | No | No |
| Editar/enriquecer prospecto | Sí | No | No | No |
| Envío pendiente/enviado | Sí | No | No | No |
| Entregado o leído sin respuesta | Sí | No | No | No |
| Fallo o rebote | Sí | No | No | No |
| Respuesta real por correo | Sí, como origen | Sí | Sí | Si corresponde |
| Respuesta real por WhatsApp | Sí, como origen | Sí | Sí | Si corresponde |
| Respuesta/interacción válida por voz | Sí, como origen | Sí | Sí | Si corresponde |
| Alta manual desde Contactos | No aplica | Sí | Sí | Si corresponde |

El alta manual desde Contactos es un flujo CRM independiente. No debe confundirse
con la promoción automática de un prospecto y debe quedar auditada como origen
`manual_panel_contactos`.

## 6. Reglas por canal

### Correo

La respuesta debe asociarse al envío mediante `Message-ID`, `In-Reply-To`,
`References` o el fallback controlado por correo remitente. Solo después de marcar
el envío como `respondido` se ejecuta la promoción.

No deben contar como respuesta humana las autorespuestas, rebotes, avisos de
calendario o notificaciones automáticas.

### WhatsApp

El mensaje entrante debe asociarse al prospecto y al envío de prospección mediante
la conversación, teléfono, `envio_id` o metadata de campaña. Después de persistir
el evento `reply_inbound` y marcar `respondido`, debe ejecutarse la promoción
idempotente.

Un mensaje saliente aceptado por Meta, una entrega o una lectura no promueven por sí
solos al prospecto.

### Voz

La promoción requiere una señal de interacción humana confirmada, no solamente
`queued`, `ringing`, `in-progress`, `busy`, `failed` o `completed` sin conversación
válida. La clasificación final debe quedar registrada en el log del envío.

## 7. No confundir `segmento` con empresa

`segmento`, `actividad`, `industria`, `estrato` y `tipo de negocio` son atributos
del prospecto. No deben convertirse automáticamente en `cuentas.nombre_comercial`
ni en `cuentas.razon_social`.

Al promover:

- usar el nombre comercial o razón social real si fue confirmado;
- usar los datos proporcionados por la persona durante la respuesta;
- crear solo la persona si la empresa no está clara;
- crear la cuenta únicamente cuando exista una empresa identificable;
- conservar la información no confirmada como contexto del prospecto, no como
  identidad fiscal definitiva.

## 8. Contratos y límites de endpoints

### Prospectos

Los endpoints bajo `/crm/prospeccion/prospectos` administran descubrimiento,
enriquecimiento, selección, envíos, auditoría y métricas de prospectos.

Su dedupe pertenece exclusivamente a la capa de prospectos.

### CRM

Los endpoints bajo `/crm/personas` y `/crm/cuentas` administran personas,
empresas, relaciones y merges CRM.

Su dedupe pertenece exclusivamente a la capa CRM.

### Promoción

La promoción automática debe ser una operación interna disparada por una respuesta
real. Cualquier endpoint explícito de conversión manual debe:

- exigir una acción y permiso CRM explícitos;
- indicar que es una conversión manual;
- no presentarse como dedupe de prospectos;
- conservar el `prospecto_id` de origen;
- ser idempotente.

## 9. Reglas de auditoría

Cada promoción debe conservar:

- `organizacion_id`;
- `prospecto_id`;
- `persona_id` creada o reutilizada;
- `cuenta_id` creada o reutilizada, si existe;
- canal de respuesta;
- fecha y hora de respuesta;
- identificador del envío y mensaje/proveedor cuando exista;
- motivo de promoción (`respuesta_correo`, `respuesta_whatsapp`,
  `respuesta_voz` o `manual_panel_contactos`).

Una respuesta que no logre crear o reutilizar CRM debe dejar un error observable y
reintentable; no debe crear una segunda entidad parcial.

## 10. Pendientes de implementación identificados

Este contrato documenta el comportamiento esperado. Al 2026-10-16 quedan por
verificar o ajustar estos puntos en runtime:

1. Deben existir pruebas por canal que demuestren:
   - sin respuesta no se crea CRM;
   - con respuesta se reutiliza el CRM existente;
   - con respuesta y sin coincidencia se crea la entidad correcta;
   - una segunda respuesta no duplica persona, empresa ni oportunidad.

Implementado en el runtime durante esta corrección:

- WhatsApp ejecuta el autopromotor después de persistir la respuesta entrante.
- La conversión manual requiere permiso CRM `contacts.write` y no toma el nombre
  comercial o segmento del prospecto como empresa implícita.
- El autopromotor ya no usa `segmento` para crear `company_name`.

## 11. Criterio de aceptación

El contrato se considera implementado cuando:

- guardar o enriquecer prospectos nunca crea personas/cuentas;
- entregas y lecturas sin respuesta nunca crean personas/cuentas;
- correo, WhatsApp y voz promueven solo ante respuesta válida;
- la deduplicación CRM consulta únicamente personas/cuentas;
- los prospectos permanecen como origen e historial;
- `segmento` y actividad no se convierten en identidad empresarial;
- la promoción es idempotente y tenant-scoped;
- la trazabilidad de respuesta y promoción es visible en auditoría.
