# Maqueta del flujo del modal CRUD de contactos

Fecha: 2026-04-28 (UTC)

## Estado actual

La maqueta ya coincide en gran parte con lo que quedo implementado en el panel:

- la accion principal es `Nuevo contacto`
- existen acciones separadas para:
  - `Nueva empresa`
  - `Persona física con actividad empresarial`
  - `Vincular contacto a empresa`
- el flujo de vinculacion ya no depende de crear un contacto nuevo
- el alta y la edicion muestran la experiencia con lenguaje de front
- el layout real ya privilegia un panel amplio con resumen contextual

## Objetivo

Definir la experiencia visual del modal de alta y edicion de contactos para que el usuario entienda claramente que esta creando:

- `Contacto`
- `Empresa`
- `Persona fisica con actividad empresarial`

## Estructura general

### Formato recomendado

- Drawer ancho en desktop
- Modal de pantalla completa en mobile
- Flujo tipo wizard con pasos visibles

### Distribucion

- Columna izquierda: contenido principal
- Columna derecha: resumen contextual

## Pantalla 1. Seleccion de tipo

### Titulo

`Nuevo contacto`

### Subtitulo

`Elige que deseas crear`

### Tarjetas

#### Tarjeta 1. Contacto

- Titulo: `Contacto`
- Descripcion: `Persona a la que le daras seguimiento`
- Ayuda: `Puede pertenecer a una empresa existente o nueva`

#### Tarjeta 2. Empresa

- Titulo: `Empresa`
- Descripcion: `Razón social o negocio`
- Ayuda: `Puedes agregar uno o varios contactos`

#### Tarjeta 3. Persona fisica con actividad empresarial

- Titulo: `Persona fisica con actividad empresarial`
- Descripcion: `Persona y negocio en un solo registro`
- Ayuda: `Ideal cuando el negocio pertenece a la misma persona`

### Accion adicional en primer nivel

- `Vincular contacto a empresa`
- Ayuda: `Relaciona un contacto ya existente con una empresa ya creada`

### Acciones

- Boton primario: `Continuar`
- Boton secundario: `Cancelar`

## Pantalla 2A. Alta de contacto

### Seccion principal

#### Bloque: Datos del contacto

- Nombre
- Correo
- Telefono
- Puesto
- Notas

#### Bloque: Vincular a empresa

Opciones tipo radio o selector:

- `Empresa existente`
- `Crear empresa nueva`
- `No asociar`

### Flujo aparte: Vincular contacto a empresa

Este flujo debe poder abrirse desde el toolbar o desde el detalle de un contacto.

#### Paso 1

- Buscar contacto existente
- Buscar empresa existente

#### Paso 2

- Definir rol en la empresa
- Definir si sera contacto principal
- Agregar notas de la relacion

#### Paso 3

- Confirmar vinculacion

### Acciones

- Boton primario: `Vincular`
- Boton secundario: `Cancelar`

### Si elige empresa existente

- Campo buscar empresa
- Lista de coincidencias
- Vista breve de la empresa seleccionada

### Si elige crear empresa nueva

- Nombre comercial
- Razon social
- RFC
- Sitio web
- Direccion

### Resumen lateral

Mostrar en formato compacto:

- Contacto: pendiente / nombre capturado
- Empresa: pendiente / seleccionada / nueva
- Relacion: pendiente / vinculada / sin asociar

### Acciones

- Boton primario: `Guardar contacto`
- Boton secundario: `Atras`

## Pantalla 2B. Alta de empresa

### Seccion principal

#### Bloque: Datos de la empresa

- Nombre comercial
- Razon social
- RFC
- Sitio web
- Tipo de empresa

#### Bloque: Direccion

- Calle
- Numero exterior
- Numero interior
- Codigo postal
- Municipio
- Estado
- Pais

#### Bloque: Contactos de la empresa

- Titulo: `Contactos de esta empresa`
- Texto de apoyo: `Puedes agregar uno o varios contactos`
- Boton: `+ Agregar contacto`

#### Accion adicional

- Boton: `Vincular contacto existente`
- Este boton abre el flujo de relacion sin crear un contacto nuevo

### Comportamiento

- Cada contacto agregado se muestra como una tarjeta o fila expandible
- Cada contacto puede capturarse sin salir del flujo
- El primer contacto puede marcarse como principal

### Resumen lateral

- Empresa: nombre capturado
- Contactos: cantidad capturada
- Direccion: completa / incompleta

### Acciones

- Boton primario: `Guardar empresa`
- Boton secundario: `Atras`

## Pantalla 2C. Alta de persona fisica con actividad empresarial

### Seccion principal

#### Bloque: Datos de la persona

- Nombre
- Apellido paterno
- Apellido materno
- Correo
- Telefono
- Puesto

#### Bloque: Datos del negocio

- Nombre comercial
- Razon social
- RFC
- Sitio web
- Direccion

#### Bloque: Relacion principal

- Checkbox: `Esta persona sera el contacto principal`
- Checkbox: `Agregar otro contacto despues`

#### Accion adicional

- Boton: `Vincular contacto a empresa`
- Usa el mismo flujo que la relacion independiente, pero puede precargar la persona o la empresa segun desde donde se abra

### Resumen lateral

- Persona: capturada
- Negocio: capturado
- Relacion: principal / complementaria

### Acciones

- Boton primario: `Guardar registro`
- Boton secundario: `Atras`

## Estado vacio y ayuda

### Mensaje general

`Tu informacion se guarda de forma progresiva para evitar formularios largos y confusos.`

### Microcopy sugerido

- `Una empresa puede tener varios contactos`
- `Un contacto puede vincularse a una empresa existente`
- `Si la persona y la empresa son la misma entidad economica, usa Persona fisica con actividad empresarial`

## Estados de apoyo

### Validacion de duplicados

Si se detecta coincidencia:

- `Ya existe una coincidencia posible`
- Mostrar opciones:
  - `Usar existente`
  - `Crear nuevo`

### Guardado parcial

Si el usuario cierra el flujo:

- guardar borrador solo si ya hay suficiente informacion
- no bloquear el cierre por validaciones no criticas

## Recomendacion visual

### Lo que ya quedo aterrizado

- Drawer o panel ancho para el flujo principal
- Resumen lateral en desktop
- Apilado vertical en mobile
- Paso inicial claro para elegir el tipo de alta

### Lo que sigue afinandose

- microcopy de ayuda para duplicados
- estados vacios por caso
- pulido de densidad visual en pantallas pequenas
- No usar un modal chico
- No mezclar todos los campos en una sola vista
- Usar lenguaje de negocio en la UI
- Mostrar resumen en la derecha para reforzar que se esta creando
- Mantener los nombres internos del backend fuera de la interfaz

## Resultado esperado

El usuario entiende desde el inicio si esta creando una persona, una empresa o una combinacion de ambas, y puede agregar varios contactos por empresa sin perderse en terminologia tecnica.
