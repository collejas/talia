# Plan de personas, empresa y contactos

Fecha: 2026-04-11 (UTC)
Estado: Borrador técnico

## Estado actual (2026-04-12)

Se completó la transición operativa de **alta**, **edición** y **exportación base de personas** del panel hacia el modelo nuevo.

Además, la vista de personas ya utiliza un panel lateral real de detalle y ya no depende del drawer genérico por defecto para la información de la persona.

Actualizacion reciente:

- el flujo CRUD de personas ya quedó guiado en el panel
- existe una accion independiente para `Vincular persona a empresa`
- la vista principal ya expone las cuatro acciones de entrada
- el resumen lateral y el lenguaje de usuario final ya forman parte del flujo

Nota de archivo:
- las referencias a `contactos` que permanecen en este documento describen la transición histórica
- el flujo activo ya opera sobre `personas`, `cuentas` y `cuenta_personas`
- el cierre operativo y documental completo vive en:
  - `docs/Plan_personas_empresa_contactos/cierre_refactor_runtime_y_documentacion.md`

Ver progreso detallado en:
- `docs/Plan_personas_empresa_contactos/progreso.md`

## 1. Objetivo

Reestructurar el dominio CRM de Tal-IA para separar con claridad:

1. La persona humana.
2. La cuenta o empresa.
3. La relación entre una persona y una cuenta.

La meta es evitar duplicidad de campos, soportar mejor personas físicas y morales, y permitir que una persona tenga varias relaciones con distintas cuentas sin romper el CRM actual.

## 2. Problema actual

Hoy la tabla `contactos` mezcla datos de:

- Persona.
- Empresa.
- Datos fiscales.
- Dirección.
- Relación con cuenta.

Eso hace que:

- Un contacto parezca una empresa duplicada.
- La misma información viva en varias tablas y columnas.
- Una persona física sea difícil de modelar bien.
- Una persona pueda terminar “atada” a una sola empresa cuando en realidad puede participar en varias.
- Los formularios de alta y edición se vuelvan confusos.

## 3. Modelo objetivo

### 3.1 `personas`

Entidad humana real.

Campos sugeridos:

- `id`
- `organizacion_id`
- `nombre`
- `apellido_paterno`
- `apellido_materno`
- `nombre_completo`
- `correo_principal`
- `telefono_principal_e164`
- `puesto`
- `area`
- `rol_decision`
- `estado`
- `origen`
- `notas`
- campos de compatibilidad interna
- `propietario_usuario_id`
- `creado_en`
- `actualizado_en`

Responsabilidad:

- Guardar quién es la persona.
- Guardar su información de contacto humana.
- Guardar notas y origen.
- `nombre_completo` debe tratarse como campo derivado o materializado.

No debería guardar:

- RFC fiscal.
- Razón social.
- Dirección fiscal completa.
- Tipo de cuenta.
- Datos de facturación.

### 3.2 `cuentas`

Entidad comercial o fiscal.

Campos sugeridos:

- `id`
- `organizacion_id`
- `nombre_comercial`
- `razon_social`
- `alias`
- `tipo_persona`
- `tipo_cuenta`
- `rfc`
- `industria`
- `segmento`
- `subindustria`
- `tamano`
- `sitio_web`
- `telefono_principal`
- `correo_principal`
- `direccion_fiscal_id`
- `direccion_operativa_id`
- `propietario_usuario_id`
- `estado`
- `notas`
- campos de compatibilidad interna
- `creado_en`
- `actualizado_en`

Responsabilidad:

- Guardar la entidad con la que se hace negocio.
- Guardar datos fiscales y comerciales.
- Guardar datos de facturación y dirección de la empresa.
- `tipo_persona` vive aquí, no en `personas`.
- La relación con múltiples ubicaciones ya queda preparada con `cuenta_direcciones`.

### 3.3 `cuenta_personas`

Tabla pivote entre personas y cuentas.

Campos sugeridos:

- `id`
- `organizacion_id`
- `cuenta_id`
- `persona_id`
- `rol_en_cuenta`
- `rol_catalogo_id` opcional a futuro
- `puesto`
- `es_contacto_principal`
- `es_contacto_facturacion`
- `es_representante_legal`
- `activo`
- `fecha_inicio`
- `fecha_fin`
- `notas`
- `creado_en`

Responsabilidad:

- Representar que una persona participa en una cuenta con un rol.
- Permitir que una persona esté en varias cuentas.
- Permitir que una cuenta tenga varias personas.
- `rol_en_cuenta` debe ser flexible, no un catálogo cerrado por `check`.
- `puesto` aquí es el puesto específico de la persona en esa cuenta.

### 3.4 `direcciones`

Tabla reutilizable para no repetir columnas de dirección en persona o cuenta.

Campos sugeridos:

- `id`
- `organizacion_id`
- `tipo`
- `pais`
- `entidad`
- `clave_entidad`
- `municipio`
- `clave_municipio`
- `localidad`
- `clave_localidad`
- `tipo_vialidad`
- `nombre_vialidad`
- `numero_exterior`
- `numero_interior`
- `codigo_postal`
- `tipo_asentamiento`
- `nombre_asentamiento`
- `tipo_establecimiento`
- `latitud`
- `longitud`
- campos de compatibilidad interna
- `creado_en`

Esta tabla es la base reusable. Se conecta con cuentas a través de `cuenta_direcciones`.

### 3.5 `cuenta_direcciones`

Pivote entre cuentas y direcciones.

Campos sugeridos:

- `id`
- `organizacion_id`
- `cuenta_id`
- `direccion_id`
- `tipo_relacion`
- `es_principal`
- `activo`
- `notas`
- campos de compatibilidad interna
- `creado_en`
- `actualizado_en`

Responsabilidad:

- Permitir varias direcciones por cuenta.
- Evitar que `cuentas` quede limitada a dos domicilios fijos.
- Soportar sucursales, envíos e historial.

## 4. Regla de negocio por tipo de persona

### 4.1 Persona física

La persona humana puede ser también la entidad comercial/fiscal.

Ejemplo:

- Persona: `Jorge Pérez López`
- Cuenta: `Jorge Pérez Arquitectura`
- Relación: persona = dueño / representante / contacto principal

En este caso:

- `persona` guarda el humano.
- `cuenta` guarda el negocio o actividad empresarial.
- `cuenta_personas` une ambos registros.

### 4.2 Persona moral

La persona humana y la empresa son entidades distintas.

Ejemplo:

- Persona: `Ana Soto`
- Cuenta: `Constructora del Bajío SA de CV`
- Relación: Ana = compras / contacto principal / facturación / representante, según aplique

En este caso:

- La persona no “es” la empresa.
- La cuenta es la entidad comercial/fiscal.
- La relación define cómo participa la persona en esa cuenta.

## 5. Estado actual en TALIA

Hoy el sistema ya tiene piezas útiles:

- `public.contactos`
- `public.cuentas`
- `contactos.cuenta_id`

Además ya existen campos de persona dentro de `contactos`, por ejemplo:

- `nombre_nombres`
- `apellido_paterno`
- `apellido_materno`
- `nombre_completo`
- `persona_fisica_moral`
- `correo`
- `telefono_e164`
- `puesto`
- `area`
- `rol_decision`

Y también campos que son más de empresa/fiscal:

- `razon_social`
- `rfc`
- `uso_cfdi`
- `metodo_pago`
- `forma_pago`
- `email_facturacion`
- `tipo_industria`
- `tamano`
- `website`
- `tipo_establecimiento`
- dirección completa

Este bloque describe el origen historico del modelo. El estado operativo actual del plan ya quedo resumido en el archivo de cierre de la misma carpeta.

Eso confirma que históricamente `contactos` funcionó como una mezcla de persona + empresa.

## 6. Propuesta de transición

No conviene hacer un big-bang sin compatibilidad. La migración debería ser por fases.

### Fase 1. Crear las tablas nuevas

Crear:

- `personas`
- `cuenta_direcciones`
- `cuenta_personas`
- `direcciones`

Mantener:

- `contactos`
- `cuentas`

Objetivo:

- Tener el modelo objetivo listo sin romper nada.

### Fase 2. Duplicar escritura de forma controlada

Cuando se crea o edita un contacto:

- Se guarda la persona en `personas`.
- Se guarda o actualiza la cuenta en `cuentas` si corresponde.
- Se crea o actualiza la relación en `cuenta_personas`.

Objetivo:

- Que el sistema nuevo empiece a recibir datos.
- Que el sistema actual siga funcionando.

### Fase 3. Lectura con compatibilidad

Durante la transición se usaron vistas y endpoints adaptadores.

Estado actual:

- el runtime activo ya no depende de `contactos` para el panel de contactos
- las referencias restantes son de archivo y migraciones históricas

Objetivo:

- mantener solo compatibilidad histórica donde todavía existan consumidores reales fuera del flujo principal

### Fase 4. Migración histórica

Backfill de registros existentes:

- `contactos` -> `personas`
- `cuentas` -> `cuentas`
- `direcciones` -> `direcciones`
- `contactos.cuenta_id` -> `cuenta_personas`

Primera pasada recomendada:

- conservar una fila por contacto legacy
- guardar la trazabilidad tecnica en campos de compatibilidad
- no fusionar duplicados todavía
- dejar la deduplicación para la fase de limpieza controlada

Segunda pasada recomendada:

- crear cuentas desde las personas legacy marcadas como empresa
- vincular cada cuenta creada con su persona legacy en `cuenta_personas`
- usar campos de compatibilidad para conservar el origen completo
- dejar `cuenta_direcciones` vacía hasta que existan domicilios reales que mapear

Objetivo:

- Llevar el histórico al modelo nuevo.

### Fase 5. Limpieza final

Cuando todo esté estable:

- reducir campos duplicados en `contactos`
- mover lógica de empresa/fiscal a `cuentas`
- dejar `contactos` solo como referencia histórica o desactivarlo donde ya no haya consumidores

Antes del backfill hay que definir reglas de deduplicación:

- Personas:
  - match fuerte por teléfono
  - match fuerte por correo
  - match débil por nombre + organización
- Cuentas:
  - match fuerte por RFC
  - match medio por razón social
  - match débil por nombre comercial

Objetivo:

- Eliminar deuda estructural.

## 7. Mapeo sugerido desde el modelo actual

### 7.1 `contactos` -> `personas`

Campos que sí migran bien:

- nombres y apellidos
- nombre completo
- correo principal
- teléfono principal
- puesto
- área
- rol decisión
- origen
- notas
- estado
- propietario_usuario_id

### 7.2 `contactos` -> `cuentas`

Campos que deberían moverse a cuenta:

- `razon_social`
- `rfc`
- `uso_cfdi`
- `metodo_pago`
- `forma_pago`
- `email_facturacion`
- `tipo_industria`
- `tamano`
- `website`
- `tipo_establecimiento`
- dirección
- `persona_fisica_moral`

### 7.3 `contactos.cuenta_id` -> `cuenta_personas`

La relación actual se puede traducir a:

- `cuenta_personas.cuenta_id = contactos.cuenta_id`
- `cuenta_personas.persona_id = personas.id`

## 8. Reglas recomendadas de creación

### 8.1 Si el contacto es persona física

- Crear `persona`.
- Crear `cuenta` solo si existe una actividad comercial/fiscal separada.
- Si no existe separación, derivar la cuenta del mismo nombre o dejarla como entidad ligada.

### 8.2 Si el contacto es persona moral

- Crear `persona`.
- Crear `cuenta` como empresa.
- Crear `cuenta_personas` para ligar la persona a la cuenta.

### 8.3 Si aún no hay empresa clara

- Crear solo `persona`.
- Dejar la cuenta para un momento posterior.

## 9. Cambios en el frontend

### Formulario de alta

La UI debería seguir esta secuencia:

1. Capturar persona.
2. Si aplica, crear cuenta.
3. Si aplica, vincular persona con cuenta.

### Evitar duplicidad visual

- No mostrar “crear empresa” como un bloque igual de protagonista que la persona.
- La persona debe ser el formulario principal.
- La cuenta debe ser una sección opcional o derivada.

### Edición

- Si el registro ya existe, mostrar persona por un lado.
- Mostrar cuenta por otro.
- Mostrar la relación en un bloque aparte si hace falta.

### Documento funcional asociado

La especificación funcional detallada del nuevo frontend de alta quedó en:

- `docs/Plan_personas_empresa_contactos/frontend_alta_persona_cuenta_relacion.md`

## 10. Riesgos

### Riesgo 1. Duplicar datos durante la transición

Mitigación:

- usar escritura dual temporal
- validar backfill con scripts

### Riesgo 2. Romper formularios existentes

Mitigación:

- usar vistas o endpoints adaptadores solo donde todavía existan consumidores reales
- no reintroducir dependencia del runtime principal sobre `contactos`

### Riesgo 3. Confundir al equipo con dos modelos vivos

Mitigación:

- documentar claramente qué tabla es fuente de verdad en cada fase
- marcar qué pantallas ya usan el modelo nuevo

## 11. Recomendación técnica

Sí conviene hacerlo.

Pero la forma correcta es:

- primero definir el nuevo modelo
- después convivir con el viejo
- después migrar datos
- después limpiar

Eso da un CRM más sólido y evita parches permanentes.

## 12. Resultado esperado

Al final deberíamos poder representar correctamente:

- una persona con una sola empresa
- una persona con varias empresas
- una empresa con varios contactos
- una persona física con actividad empresarial
- contactos sin empresa definida todavía

Y todo eso sin mezclar fiscal, comercial y humano en una sola tabla.

## 13. Siguiente paso propuesto

Si este plan te convence, el siguiente documento debe ser:

- el mapa de migración tabla por tabla
- con qué columnas salen de `contactos`
- qué columnas se quedan en `contactos`
- qué columnas se van a `personas`
- qué columnas se van a `cuentas`
- y cómo se crea `cuenta_personas`
