# Propuesta tecnica de implementacion frontend para el modal de contactos

Fecha: 2026-04-28 (UTC)

## Objetivo

Implementar el nuevo flujo de CRUD de contactos como una experiencia guiada, clara y consistente con el lenguaje del usuario final.

La UI debe hablar de:

- `Contacto`
- `Empresa`
- `Persona física con actividad empresarial`

Y no del modelo interno de backend.

## Alcance

Esta propuesta cubre solo frontend:

- vista de contactos
- modal/drawer de alta y edicion
- seleccion de tipo de alta
- formularios por caso de uso
- resumen lateral
- validacion visual
- manejo de estado del flujo
- flujo separado de `Vincular contacto a empresa`

No cambia contratos de backend salvo que el mapeo de UI ya requiera payloads existentes.

## Estructura propuesta

### 1. Punto de entrada

El boton `Nuevo contacto` debe abrir un flujo guiado.

Ademas, la vista debe exponer acciones de primer nivel para:

- `Nuevo contacto`
- `Nueva empresa`
- `Persona física con actividad empresarial`
- `Vincular contacto a empresa`

### 2. Componente orquestador

Crear un componente contenedor que administre:

- paso actual
- tipo de alta
- datos parciales
- validacion
- avance/retroceso
- confirmacion final

Responsabilidad:

- decidir que pantalla mostrar
- conservar el estado del formulario entre pasos
- mandar el payload al endpoint correcto

### 3. Pantallas del flujo

#### Paso 1. Seleccion de tipo

Tarjetas:

- `Contacto`
- `Empresa`
- `Persona física con actividad empresarial`

#### Paso 2. Formularios especificos

- Alta de contacto
- Alta de empresa
- Alta de persona física con actividad empresarial

#### Paso 3. Confirmacion / resumen

- resumen lateral
- validacion de duplicados
- confirmacion final antes de guardar

### Flujo independiente de vinculacion

La vinculacion no debe depender de crear un contacto nuevo.

Debe permitir:

- buscar contacto existente
- buscar empresa existente
- definir rol en la empresa
- marcar contacto principal si aplica
- guardar solo la relacion

## Componentes reutilizables

### A. Componentes actuales que conviene reutilizar

#### `contacts-data-table.tsx`

Se mantiene como punto de entrada de la vista de contactos.

Responsabilidad:

- toolbar
- acciones de listado
- apertura del modal/drawer

#### `contact-create-flow.tsx`

Se puede usar como base del flujo nuevo si ya concentra:

- alta
- validacion
- seleccion de empresa existente / nueva

#### `contact-edit-flow.tsx`

Se puede usar como base para la edicion estructurada.

#### `data-table.tsx`

No debe tocarse salvo que el flujo nuevo necesite alguna mejora menor de integracion con drawers o acciones.

### B. Componentes nuevos recomendados

#### `contact-crud-flow.tsx`

Componente orquestador principal.

Responsabilidad:

- control del wizard
- step state
- selected entity type
- resumen lateral
- cierre y confirmacion

#### `contact-type-selector.tsx`

Pantalla inicial con tarjetas.

Responsabilidad:

- mostrar las 3 opciones
- explicar cada una con microcopy
- notificar seleccion

#### `contact-form.tsx`

Formulario de alta de contacto.

Responsabilidad:

- capturar datos de contacto
- vincular empresa existente o nueva
- mostrar sugerencias de duplicados

#### `company-form.tsx`

Formulario de alta de empresa.

Responsabilidad:

- capturar datos de empresa
- capturar direccion
- agregar multiples contactos

#### `self-employed-form.tsx`

Formulario de persona física con actividad empresarial.

Responsabilidad:

- capturar datos de persona
- capturar datos del negocio
- definir relacion principal

#### `contact-flow-summary.tsx`

Resumen lateral.

Responsabilidad:

- mostrar progreso
- confirmar entidad elegida
- mostrar empresa vinculada
- mostrar alerta de duplicados

#### `contact-duplicate-banner.tsx`

Banner de coincidencias.

Responsabilidad:

- mostrar cuando el sistema detecta posible duplicado
- ofrecer `Usar existente` o `Crear nuevo`

#### `contact-link-flow.tsx`

Flujo especifico para vincular un contacto con una empresa.

Responsabilidad:

- buscar contacto existente
- buscar empresa existente
- definir rol y estado principal
- confirmar la relacion

## Estado y control de flujo

### State machine minima

1. `select_type`
2. `editing_contact`
3. `editing_company`
4. `editing_self_employed`
5. `review`
6. `submitting`
7. `success`
8. `error`

### Datos a conservar

- tipo seleccionado
- formulario parcial
- empresa seleccionada
- duplicados detectados
- decision del usuario sobre reutilizar o crear nuevo

## Reglas de UI

### Lenguaje visible

Usar solo lenguaje de front:

- contacto
- empresa
- persona física con actividad empresarial
- vincular empresa
- vincular contacto a empresa
- empresa existente
- crear empresa nueva

### Lenguaje interno

Se mantiene oculto:

- `persona_id`
- `cuenta_id`
- `cuenta_personas`
- `organizacion_id`

### Presentacion

- No usar modal angosto.
- Preferir drawer ancho o modal grande.
- Mantener un resumen lateral en desktop.
- En mobile, mostrar pasos apilados.

## Integracion con backend actual

### Alta de contacto

- reutilizar el endpoint ya existente de alta estructurada
- mapear campos del formulario al payload actual

### Alta de empresa

- reutilizar el mismo flujo de alta si el backend ya soporta crear cuenta y relacion
- si no, descomponer en alta de empresa + alta de contactos relacionados

### Persona física con actividad empresarial

- reutilizar alta estructurada y la relacion con empresa
- usar el mismo mecanismo de deduplicacion existente

### Vinculacion de contacto a empresa

- reutilizar endpoints existentes de relacion si ya estan disponibles
- si falta un endpoint dedicado, mapear la UI al flujo actual con la menor friccion posible
- el flujo no debe obligar a crear un contacto nuevo cuando solo se necesita asociarlo

## Prioridad de implementacion

### Fase 1

- crear el orquestador del flujo
- crear la pantalla de seleccion
- separar la UI en pasos
- agregar la accion directa de `Vincular contacto a empresa`

### Fase 2

- crear formularios por caso
- conectar resumen lateral
- integrar validacion visual

### Fase 3

- integrar deduplicacion
- integrar flujo independiente de vinculacion
- pulir microcopy
- revisar accesibilidad y mobile

## Riesgos

- mezclar logica de alta con logica de edicion
- duplicar formularios parecidos
- exponer nombres internos de backend en la UI
- dejar demasiados campos visibles en el primer paso

## Recomendacion concreta

La mejor ruta es:

1. conservar `contacts-data-table.tsx` como vista principal
2. introducir un orquestador nuevo para el flujo CRUD
3. dividir el formulario por tipo de alta
4. mantener el backend actual sin cambios grandes en la primera iteracion

## Resultado esperado

El usuario ve un flujo claro, con lenguaje de negocio, y el frontend puede seguir aprovechando la infraestructura actual sin una refactorizacion completa del backend en la primera etapa.
