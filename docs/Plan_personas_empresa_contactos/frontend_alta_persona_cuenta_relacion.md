# Frontend funcional de alta: persona, cuenta y relacion

Fecha: 2026-04-12 (UTC)
Estado: Propuesta funcional para implementacion

## 1. Objetivo

Definir el flujo completo de alta en frontend para el nuevo modelo CRM basado en:

- `personas`
- `cuentas`
- `cuenta_personas`

La meta es que el alta se sienta natural, rapida y clara para el usuario, y que deje de arrastrar las ambiguedades del modelo legacy de `contactos`.

Nota de archivo:
- este documento describe la propuesta funcional histórica de transición
- el flujo activo ya opera con el modelo nuevo en el panel de contactos

## 2. Principio rector

El alta siempre empieza por la persona.

Nunca se debe empezar por empresa, razon social o datos fiscales. Primero se captura al humano real y despues se define si existe o no una cuenta asociada.

## 3. Resultado esperado del rediseño

El nuevo frontend debe permitir estos escenarios sin friccion:

1. Crear solo una persona.
2. Crear una persona y vincularla a una cuenta existente.
3. Crear una persona y una cuenta nueva.
4. Crear una persona fisica con actividad empresarial como:
   - una persona
   - una cuenta propia
   - una relacion entre ambas

## 4. Estructura general recomendada

Para TALIA conviene implementar primero una vista por bloques dinamicos, no un wizard estricto de 7 pantallas.

La pantalla o modal de alta debe organizarse en:

- Bloque A: Datos de la persona
- Bloque B: Contexto comercial
- Bloque C: Cuenta asociada
- Bloque D: Rol dentro de la cuenta
- Bloque E: Datos opcionales
- Bloque F: Confirmacion y guardado

Cada bloque se muestra u oculta segun el contexto seleccionado.

## 5. Flujo funcional

## 5.1 Bloque A - Datos de la persona

Este bloque siempre existe.

### Objetivo

Capturar a la persona humana, aunque todavia no se sepa si pertenece a una empresa, si es independiente o si solo es un lead aislado.

### Campos obligatorios minimos

- `nombre`
- `apellido_paterno`
- al menos uno:
  - `telefono_principal_e164`
  - `correo_principal`

### Campos opcionales recomendados

- `apellido_materno`
- `puesto`
- `area`
- `rol_decision`
- `propietario_usuario_id`
- `origen`
- `notas`

### Validaciones

- `nombre` no vacio
- debe existir telefono o correo
- si hay correo, validarlo
- si hay telefono, normalizarlo

### Regla UX

Debe existir un CTA secundario:

- `Guardar solo persona`

Eso permite registrar leads o contactos todavia no asociados a una cuenta.

### Payload conceptual

Se prepara informacion para `personas`:

- `nombre`
- `apellido_paterno`
- `apellido_materno`
- `nombre_completo`
- `correo_principal`
- `telefono_principal_e164`
- `puesto`
- `area`
- `rol_decision`
- `notas`
- `origen`
- `propietario_usuario_id`

## 5.2 Bloque B - Contexto comercial

Este bloque define el camino del alta.

### Objetivo

Determinar si debe existir cuenta y de que tipo.

### Opciones de interfaz

Usar radios grandes o tarjetas seleccionables:

1. `Solo persona por ahora`
2. `Trabaja para una empresa`
3. `Persona fisica con actividad empresarial`

### Reglas de negocio

#### Opcion 1 - Solo persona por ahora

- se crea solo `personas`
- no aparece bloque de cuenta
- no aparece bloque de relacion

#### Opcion 2 - Trabaja para una empresa

- aparece bloque de cuenta
- aparece bloque de relacion despues de definir cuenta
- la cuenta puede ser existente o nueva

#### Opcion 3 - Persona fisica con actividad empresarial

- aparece bloque de cuenta propia
- aparece bloque de relacion prellenado
- se debe crear:
  - `personas`
  - `cuentas`
  - `cuenta_personas`

### Reglas UX

Debajo de cada opcion debe mostrarse una descripcion breve.

Ejemplo:

- `Persona fisica con actividad empresarial`
- `Se creara una cuenta comercial o fiscal propia vinculada a esta persona.`

## 5.3 Bloque C - Cuenta asociada

Este bloque solo aparece si el usuario eligio:

- `Trabaja para una empresa`
- `Persona fisica con actividad empresarial`

### 5.3.1 Escenario empresa

La UI debe ofrecer dos caminos:

1. `Buscar cuenta existente`
2. `Crear nueva cuenta`

### Buscar cuenta existente

Debe existir un buscador por:

- `nombre_comercial`
- `razon_social`
- `rfc`
- `correo_principal`
- `telefono_principal`

Si el usuario selecciona una cuenta existente:

- se guarda temporalmente `cuenta_id`
- se habilita el bloque de relacion

### Crear nueva cuenta

Campos obligatorios minimos:

- `nombre_comercial` o `razon_social`
- `tipo_persona`

Campos recomendados:

- `razon_social`
- `rfc`
- `industria`
- `segmento`
- `sitio_web`
- `correo_principal`
- `telefono_principal`
- `notas`

### Regla UX

No meter en el alta basica:

- domicilio completo de 20 campos
- CFDI completo
- metodo de pago
- forma de pago
- coordenadas

Eso debe vivir en edicion posterior o en el bloque opcional.

### 5.3.2 Escenario persona fisica con actividad empresarial

Debe sentirse como un flujo especial y simplificado.

Campos prellenados:

- `tipo_persona = fisica`
- `tipo_cuenta = persona_fisica_actividad_empresarial`
- `razon_social = nombre_completo de la persona`

Campos visibles:

- `nombre_comercial`
- `rfc`
- `correo_principal`
- `telefono_principal`
- `sitio_web`
- `industria`
- `segmento`
- `notas`

### Regla UX

Si no hay `nombre_comercial`, se permite usar el nombre completo como valor provisional.

## 5.4 Bloque D - Rol dentro de la cuenta

Este bloque solo aparece si ya existe cuenta seleccionada o creada.

### Objetivo

Definir la relacion real entre la persona y la cuenta.

### Campo obligatorio minimo

- `rol_en_cuenta`

### Campos opcionales

- `puesto`
- `es_contacto_principal`
- `es_contacto_facturacion`
- `es_representante_legal`
- `activo`
- `fecha_inicio`
- `notas`

### Roles sugeridos

- `dueno`
- `representante_legal`
- `director`
- `compras`
- `facturacion`
- `operacion`
- `contacto_principal`
- `asistente`
- `otro`

### Regla especial para PFAE

Prellenar:

- `rol_en_cuenta = dueno`
- `es_contacto_principal = true`
- `es_representante_legal = true`

Debe quedar editable.

### Payload conceptual

Se prepara informacion para `cuenta_personas`:

- `cuenta_id`
- `persona_id`
- `rol_en_cuenta`
- `puesto`
- `es_contacto_principal`
- `es_contacto_facturacion`
- `es_representante_legal`
- `activo`
- `fecha_inicio`
- `notas`

## 5.5 Bloque E - Datos opcionales

Este bloque debe ser opcional y colapsable.

### Objetivo

No frenar el alta, pero permitir enriquecer el registro si el usuario quiere.

### Secciones sugeridas

#### Datos fiscales

Principalmente para `cuentas`:

- `rfc`
- `uso_cfdi`
- `forma_pago`
- `metodo_pago`
- `email_facturacion`

#### Direccion

- `pais`
- `entidad`
- `municipio`
- `localidad`
- `tipo_vialidad`
- `nombre_vialidad`
- `numero_exterior`
- `numero_interior`
- `codigo_postal`

#### Comercial

- `industria`
- `subindustria`
- `tamano`
- `sitio_web`
- `origen`
- `canal_adquisicion`

#### Notas internas

- `notas`
- `contexto_comercial`
- `necesidad_detectada`

### Regla UX

Este bloque debe poder omitirse con una accion clara:

- `Omitir por ahora`

## 5.6 Bloque F - Confirmacion y guardado

Antes de guardar debe mostrarse un resumen corto y entendible.

### Resumen sugerido

#### Persona

- nombre completo
- correo
- telefono

#### Cuenta

- nombre de la cuenta
- tipo de cuenta

#### Relacion

- rol
- flags principales

### Reglas de guardado

#### Escenario A - Solo persona

Se crea:

- `personas`

#### Escenario B - Persona + cuenta existente

Se crea:

- `personas`
- `cuenta_personas`

#### Escenario C - Persona + cuenta nueva

Se crea:

- `personas`
- `cuentas`
- `cuenta_personas`

#### Escenario D - PFAE

Se crea:

- `personas`
- `cuentas`
- `cuenta_personas`

con defaults orientados a cuenta propia.

## 6. Vista post-alta

No conviene regresar a la lista fria inmediatamente.

La experiencia ideal es abrir una vista de detalle del registro creado.

## 6.1 Vista minima sugerida

Tarjeta 1 - Persona:

- nombre
- correo
- telefono
- puesto
- notas

Tarjeta 2 - Cuenta:

- nombre comercial
- razon social
- rfc
- industria
- sitio web

Tarjeta 3 - Relacion:

- rol_en_cuenta
- flags
- estado

### Acciones rapidas

- `Editar persona`
- `Editar cuenta`
- `Editar relacion`
- `Agregar otra cuenta a esta persona`
- `Agregar otro contacto a esta cuenta`
- `Completar datos fiscales`
- `Completar direccion`

## 7. Reglas de visibilidad en frontend

### Regla 1

La persona siempre va primero.

### Regla 2

La cuenta solo aparece si aplica.

### Regla 3

La relacion solo aparece si ya existe contexto de cuenta.

### Regla 4

Persona fisica con actividad empresarial no reemplaza a la persona.

Solo cambia el tipo de cuenta y la relacion prellenada.

### Regla 5

No pedir todos los datos en el alta.

El alta debe ser ligera. Lo detallado debe vivir en edicion posterior.

## 8. Recomendacion de implementacion en TALIA

No empezar por un wizard estricto de 7 pantallas.

La primera implementacion debe ser una sola pantalla o modal por bloques dinamicos:

- bloque persona
- bloque contexto comercial
- bloque cuenta
- bloque relacion
- bloque extras
- resumen y guardado

### Por que

- reduce friccion
- evita pasos innecesarios
- encaja mejor con un CRM de escritorio
- aprovecha el modelo nuevo sin seguir parchando el modal legacy

## 9. Contrato de frontend recomendado

El frontend dejó de pensar en `contactos` como fuente de verdad.

Debe trabajar conceptualmente con tres payloads:

- `persona`
- `cuenta`
- `relacion`

La compatibilidad legacy quedó como referencia histórica de la migración.

## 10. Fases de implementacion

### Fase 1

Diseñar el nuevo modal o pantalla de alta por bloques.

### Documento tecnico asociado

El contrato tecnico del alta entre frontend y backend quedó en:

- `docs/Plan_personas_empresa_contactos/contrato_payload_alta_frontend_backend.md`
- `docs/Plan_personas_empresa_contactos/maqueta_tecnica_frontend_alta.md`

### Fase 2

Definir payload final del alta:

- `persona`
- `contexto_comercial`
- `cuenta`
- `relacion`
- `extras`

### Fase 3

Implementar guardado contra el backend nuevo.

### Fase 4

Implementar vista post-alta.

### Fase 5

Rehacer la edicion con la misma separacion:

- persona
- cuenta
- relacion

### Fase 6

Retirar completamente el modal legacy.

Estado actual:

- el modal legacy ya no forma parte del flujo activo del panel de contactos

## 11. Criterio de exito

El rediseño se considera correcto cuando:

- crear una persona sola sea rapido
- crear una persona con empresa existente sea directo
- crear una PFAE no se sienta forzado
- el frontend deje de mezclar datos de persona con datos de empresa
- el backend reciba datos alineados al modelo nuevo
- el usuario entienda claramente que se esta creando:
  - una persona
  - una cuenta
  - una relacion
