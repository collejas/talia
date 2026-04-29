# Plan de refactor del modal CRUD de contactos

Fecha: 2026-04-28 (UTC)

## Objetivo

Rehacer el modal de CRUD de contactos dentro de la vista de contactos para que el usuario final entienda el flujo sin lenguaje de backend.

El front debe hablar de:

- `Contacto`
- `Empresa`
- `Persona física con actividad empresarial`

Y no de:

- `persona_id`
- `cuenta_id`
- `cuenta_personas`
- `organizacion_id`

Ademas, el flujo debe dejar visible la accion de:

- `Vincular contacto a empresa`

## Problema actual

El modal actual mezcla conceptos de:

- contacto humano
- empresa
- relación entre ambos

Eso hace que:

- el usuario no entienda qué crea realmente
- el formulario se vea largo y poco claro
- el lenguaje interno del backend aparezca en la UI
- sea difícil crear varios contactos por empresa

## Principio de diseño

El flujo debe ser guiado y explícito.

Primero se elige qué se quiere crear.
Despues se muestra solo el formulario que corresponde.

## Propuesta de flujo visual

### Acciones de primer nivel

La vista debe tener botones separados para:

- `Nuevo contacto`
- `Nueva empresa`
- `Persona física con actividad empresarial`
- `Vincular contacto a empresa`

### Paso 1. Elegir tipo de alta

Pantalla inicial con tres tarjetas:

- `Contacto`
- `Empresa`
- `Persona física con actividad empresarial`

Cada tarjeta debe incluir una explicación breve:

- `Contacto`: persona a la que se dará seguimiento
- `Empresa`: razón social o negocio
- `Persona física con actividad empresarial`: persona y negocio en un solo registro

### Paso 2. Completar formulario según el caso

#### Caso A. Contacto

Campos sugeridos:

- nombre
- correo
- teléfono
- puesto
- notas

Bloque final:

- `Vincular a empresa`
  - `Empresa existente`
  - `Crear empresa nueva`
  - `No asociar`

#### Caso A.1 Vincular contacto a empresa

Este flujo debe existir tambien como accion independiente.

Se usa cuando:

- el contacto ya existe
- la empresa ya existe
- solo falta crear la relacion

Campos sugeridos:

- buscar contacto
- buscar empresa
- rol en la empresa
- puesto
- contacto principal
- notas de la relacion

Acciones:

- `Vincular`
- `Cancelar`

#### Caso B. Empresa

Campos sugeridos:

- nombre comercial
- razón social
- RFC
- sitio web
- dirección

Bloque final:

- `Agregar contactos a esta empresa`
- botón `+ Agregar contacto`

### Accion adicional

- `Vincular contacto existente`
- Buscar contacto ya creado
- Asociarlo a la empresa en un paso aparte

#### Caso C. Persona física con actividad empresarial

Sección 1:

- datos de la persona

Sección 2:

- datos del negocio

Sección 3:

- relación principal
- contacto principal
- posibilidad de agregar más contactos después

## Decisiones de UX

- El flujo principal debe ser `Nuevo contacto`.
- El contenido debe abrirse en un drawer ancho o modal grande tipo wizard.
- En desktop, conviene layout de dos columnas:
  - izquierda: formulario
  - derecha: resumen de lo que se está creando
- En mobile, conviene layout vertical por pasos.

## Reglas de lenguaje

La UI debe usar lenguaje de front.

### Sí usar

- contacto
- empresa
- persona física con actividad empresarial
- vincular empresa
- empresa existente
- crear empresa nueva
- contacto principal

### No usar en la UI

- `cuenta`
- `relación`
- `persona_id`
- `cuenta_id`
- `cuenta_personas`
- `organizacion_id`

## Alcance técnico

### Frontend

- Reemplazar el modal CRUD actual por un flujo guiado.
- Separar la selección de tipo de alta del formulario.
- Agregar copy contextual por cada tipo de alta.
- Mantener la compatibilidad con el backend existente.

### Backend

- No cambiar contratos en esta fase si no es necesario.
- Reutilizar los endpoints actuales de alta y edición.
- Solo adaptar el mapeo de UI a payloads existentes.

## Fases sugeridas

### Fase 1. Diseño de la experiencia

- Definir la pantalla inicial con tarjetas.
- Definir los tres formularios por caso.
- Definir el resumen lateral.

### Fase 2. Implementacion UI

- Separar el selector de tipo de alta.
- Implementar el flujo guiado.
- Ajustar textos, labels y estados vacíos.

### Fase 3. Validacion funcional

- Crear contacto sin empresa.
- Crear contacto con empresa existente.
- Crear contacto con empresa nueva.
- Crear empresa con varios contactos.
- Crear persona física con actividad empresarial.

### Fase 4. Pulido

- Ajustar copy.
- Ajustar tamaños del modal/drawer.
- Revisar accesibilidad y mobile.

## Criterios de exito

- El usuario entiende en menos de 5 segundos qué puede crear.
- No aparecen nombres de backend en la UI.
- Es claro cómo crear varios contactos por empresa.
- Es claro cuándo una persona también representa su actividad empresarial.
- El flujo no obliga a llenar campos irrelevantes para el caso elegido.

## Resultado esperado

El modal deja de ser un formulario ambiguo y pasa a ser un flujo guiado, con tres caminos claros, coherentes con el modelo `personas + cuentas + cuenta_personas`.
