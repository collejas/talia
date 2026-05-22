# Contrato de payload para alta frontend-backend

Fecha: 2026-04-12 (UTC)
Estado: Propuesta tecnica para implementacion

## 1. Objetivo

Definir el contrato de datos del nuevo flujo de alta entre frontend y backend para el modelo:

- `personas`
- `cuentas`
- `cuenta_personas`

Este documento sirve como puente entre:

- la propuesta funcional del frontend
- el backend que estaba en transicion
- la implementacion final del alta

## 2. Principio

El frontend no debe seguir pensando en una entidad unica llamada `contacto`.

El alta debe modelarse con estas piezas:

- `persona`
- `contexto_comercial`
- `cuenta`
- `relacion`
- `extras`

## 3. Endpoint recomendado

## 3.1 Endpoint objetivo

Crear un endpoint de alto nivel, por ejemplo:

- `POST /crm/personas/alta`

Ese endpoint debe resolver internamente los escenarios de:

- solo persona
- persona + cuenta existente
- persona + cuenta nueva
- persona fisica con actividad empresarial

## 3.3 Edicion

La edicion de contacto usa el mismo shape funcional de `persona`, `contexto_comercial`, `cuenta`, `relacion` y `extras`, con la diferencia de que el backend recibe el identificador por ruta:

- `PATCH /crm/personas/{contacto_id}`

En edicion se conservan las mismas reglas por tabla: `personas` guarda los datos del humano y `cuentas` guarda los datos comerciales.

## 3.2 Compatibilidad temporal

Nota de archivo:
- este documento describe la fase histórica de transición
- el payload del frontend ya se construye con el nuevo shape conceptual
- el runtime activo ya no depende de la traducción legacy del panel de contactos

## 4. Shape del request

```json
{
  "persona": {},
  "contexto_comercial": {},
  "cuenta": null,
  "relacion": null,
  "extras": {}
}
```

## 5. Objeto `persona`

## 5.1 Responsabilidad

Representa la identidad humana real.

## 5.2 Shape propuesto

```json
{
  "nombre": "Jorge",
  "apellido_paterno": "Perez",
  "apellido_materno": "Lopez",
  "nombre_completo": "Jorge Perez Lopez",
  "correo_principal": "jorge@correo.com",
  "correo_secundario": "jorge@otra-cuenta.com",
  "telefono_principal_e164": "+5215555555555",
  "telefono_principal_tipo_linea": "movil",
  "telefono_principal_extension": "123",
  "telefono_secundario_e164": "+5215555555666",
  "telefono_secundario_tipo_linea": "fijo",
  "telefono_secundario_extension": "456",
  "puesto": "Director comercial",
  "area": "Ventas",
  "rol_decision": "Decisor",
  "origen": "manual_panel_contactos",
  "notas": "Lead inicial",
  "propietario_usuario_id": "uuid-opcional"
}
```

## 5.3 Reglas

- `nombre` es obligatorio
- `apellido_paterno` es obligatorio en el alta rapido actual
- `origen` es obligatorio en el alta actual
- `correo_principal` es obligatorio en `personas`
- `telefono_principal_e164` es obligatorio en `personas`
- `correo_secundario` es opcional
- `telefono_principal_tipo_linea` y `telefono_secundario_tipo_linea` se normalizan a `movil` o `fijo`
- `telefono_principal_extension` y `telefono_secundario_extension` aparecen cuando la línea es fija, pero no bloquean el guardado
- `nombre_completo` puede enviarse desde frontend, pero backend debe poder derivarlo
- backend debe tratar `nombre_completo` como derivado, no como fuente principal

## 5.4 Validaciones

- `nombre` no vacio
- `correo_principal` normalizado y obligatorio
- `telefono_principal_e164` normalizado y obligatorio
- `telefono_secundario_e164`, `telefono_secundario_extension` y `correo_secundario` son opcionales
- rechazar payload sin el medio de contacto requerido por modo

## 6. Objeto `contexto_comercial`

## 6.1 Responsabilidad

Define el camino de negocio del alta.

## 6.2 Shape propuesto

```json
{
  "modo": "solo_persona",
  "usar_cuenta_existente": false,
  "crear_cuenta_nueva": false,
  "es_persona_fisica_actividad_empresarial": false
}
```

## 6.3 Valores permitidos en `modo`

- `solo_persona`
- `empresa_existente`
- `empresa_nueva`
- `persona_fisica_actividad_empresarial`

## 6.4 Regla

`modo` es la fuente principal de decision. Los otros flags pueden omitirse en la version final si el backend opera unicamente con `modo`.

## 7. Objeto `cuenta`

## 7.1 Responsabilidad

Representa una cuenta existente o una nueva cuenta a crear.

## 7.2 Shape propuesto

```json
{
  "cuenta_id": null,
  "nombre_comercial": "Perez Arquitectura",
  "razon_social": "Jorge Perez Lopez",
  "tipo_persona": "fisica",
  "tipo_cuenta": "persona_fisica_actividad_empresarial",
  "rfc": "PELJ800101XXX",
  "industria": "Arquitectura",
  "segmento": "Servicios",
  "sitio_web": "https://ejemplo.com",
  "correo_principal": "contacto@ejemplo.com",
  "correo_secundario": "ventas@ejemplo.com",
  "telefono_principal_e164": "+5215555555555",
  "telefono_principal_tipo_linea": "movil",
  "telefono_principal_extension": "",
  "telefono_secundario_e164": "+5215555555666",
  "telefono_secundario_tipo_linea": "fijo",
  "telefono_secundario_extension": "123",
  "notas": "Cuenta creada desde alta"
}
```

## 7.3 Reglas por escenario

### `solo_persona`

- `cuenta = null`

### `empresa_existente`

- `cuenta.cuenta_id` obligatorio
- el resto de campos opcionales o ausentes

### `empresa_nueva`

- no enviar `cuenta_id`
- enviar datos minimos para crear cuenta
- `cuenta.correo_principal` obligatorio
- `cuenta.telefono_principal_e164` obligatorio

### `persona_fisica_actividad_empresarial`

- no enviar `cuenta_id`
- backend puede aceptar prellenados del frontend
- si falta `nombre_comercial`, backend puede usar `nombre_completo`
- `tipo_persona` debe ser `fisica`
- `tipo_cuenta` debe ser `persona_fisica_actividad_empresarial`
- `cuenta.correo_principal` obligatorio
- `cuenta.telefono_principal_e164` obligatorio

## 7.4 Campos minimos para crear cuenta

- `nombre_comercial` o `razon_social`
- `tipo_persona`
- `correo_principal`
- `telefono_principal_e164`

## 8. Objeto `relacion`

## 8.1 Responsabilidad

Define la relacion entre una persona y una cuenta.

## 8.2 Shape propuesto

```json
{
  "rol_en_cuenta": "dueno",
  "puesto": "Director",
  "es_contacto_principal": true,
  "es_contacto_facturacion": false,
  "es_representante_legal": true,
  "activo": true,
  "fecha_inicio": "2026-04-12",
  "notas": "Relacion inicial"
}
```

## 8.3 Reglas

- se omite o va en `null` si `modo = solo_persona`
- es obligatorio si existe cuenta
- para `persona_fisica_actividad_empresarial`, backend puede completar defaults:
  - `rol_en_cuenta = dueno`
  - `es_contacto_principal = true`
  - `es_representante_legal = true`

## 9. Objeto `extras`

## 9.1 Responsabilidad

Contener datos opcionales que no deben frenar el alta.

## 9.2 Shape propuesto

```json
{
  "fiscales": {
    "uso_cfdi": "G03",
    "forma_pago": "03",
    "metodo_pago": "PUE",
    "email_facturacion": "facturas@ejemplo.com"
  },
  "direccion": {
    "pais": "MX",
    "clave_entidad": "19",
    "entidad": "Nuevo Leon",
    "clave_municipio": "039",
    "municipio": "Monterrey",
    "localidad": "Monterrey",
    "tipo_vialidad": "Calle",
    "nombre_vialidad": "Morelos",
    "numero_exterior": "123",
    "numero_interior": "4",
    "codigo_postal": "64000"
  },
  "comercial": {
    "industria": "Construccion",
    "subindustria": "Acabados",
    "tamano": "mediana",
    "canal_adquisicion": "web"
  }
}
```

## 9.3 Regla

`extras` siempre es opcional.

El backend debe poder ignorarlo parcialmente sin romper el alta principal.

## 10. Escenarios de request completos

## 10.1 Solo persona

```json
{
  "persona": {
    "nombre": "Laura",
    "apellido_paterno": "Perez",
    "apellido_materno": "Gomez",
    "correo_principal": "laura@correo.com"
  },
  "contexto_comercial": {
    "modo": "solo_persona"
  },
  "cuenta": null,
  "relacion": null,
  "extras": {}
}
```

## 10.2 Persona + cuenta existente

```json
{
  "persona": {
    "nombre": "Ana",
    "apellido_paterno": "Lopez",
    "telefono_principal_e164": "+5215555555555"
  },
  "contexto_comercial": {
    "modo": "empresa_existente"
  },
  "cuenta": {
    "cuenta_id": "uuid-cuenta"
  },
  "relacion": {
    "rol_en_cuenta": "compras",
    "es_contacto_principal": true
  },
  "extras": {}
}
```

## 10.3 Persona + cuenta nueva

```json
{
  "persona": {
    "nombre": "Luis",
    "apellido_paterno": "Ramirez",
    "correo_principal": "luis@empresa.com"
  },
  "contexto_comercial": {
    "modo": "empresa_nueva"
  },
  "cuenta": {
    "nombre_comercial": "Constructora del Bajio",
    "razon_social": "Constructora del Bajio SA de CV",
    "tipo_persona": "moral",
    "tipo_cuenta": "empresa"
  },
  "relacion": {
    "rol_en_cuenta": "director",
    "es_contacto_principal": true
  },
  "extras": {}
}
```

## 10.4 Persona fisica con actividad empresarial

```json
{
  "persona": {
    "nombre": "Jorge",
    "apellido_paterno": "Perez",
    "apellido_materno": "Lopez",
    "telefono_principal_e164": "+5215555555555",
    "correo_principal": "jorge@correo.com"
  },
  "contexto_comercial": {
    "modo": "persona_fisica_actividad_empresarial"
  },
  "cuenta": {
    "nombre_comercial": "Perez Arquitectura",
    "razon_social": "Jorge Perez Lopez",
    "tipo_persona": "fisica",
    "tipo_cuenta": "persona_fisica_actividad_empresarial",
    "rfc": "PELJ800101XXX"
  },
  "relacion": {
    "rol_en_cuenta": "dueno",
    "es_contacto_principal": true,
    "es_representante_legal": true
  },
  "extras": {}
}
```

## 11. Respuesta esperada del backend

## 11.1 Shape recomendado

```json
{
  "persona": {},
  "cuenta": null,
  "relacion": null,
  "resumen": {
    "persona_id": "uuid",
    "cuenta_id": null,
    "relacion_id": null,
    "modo": "solo_persona"
  }
}
```

## 11.2 Regla

La respuesta no debe volver a un shape legacy de `contacto` si el frontend nuevo ya opera por entidades separadas.

## 12. Reglas de validacion por backend

## 12.1 Siempre

- validar `persona`
- derivar `nombre_completo` si falta
- normalizar medios de contacto

## 12.2 Si `modo = solo_persona`

- rechazar `cuenta` si viene con datos contradictorios
- ignorar `relacion`

## 12.3 Si `modo = empresa_existente`

- `cuenta.cuenta_id` obligatorio
- `relacion.rol_en_cuenta` obligatorio

## 12.4 Si `modo = empresa_nueva`

- crear cuenta
- crear relacion

## 12.5 Si `modo = persona_fisica_actividad_empresarial`

- forzar `tipo_persona = fisica`
- default de `tipo_cuenta = persona_fisica_actividad_empresarial`
- crear relacion tipo `dueno` por default si no viene

## 13. Adaptacion transitoria al backend actual

Durante la transición, el controlador del panel transformó este payload nuevo al shape temporal que existía.

Ejemplo de transformacion temporal:

- `persona` -> payload de contacto actual
- `cuenta` -> payload actual de cuentas
- `relacion` -> creacion de `cuenta_personas`

Esa traduccion quedó como referencia histórica de la migración.

## 14. Fases de implementacion tecnica

### Fase 1

Definir typescript types del payload nuevo en frontend.

### Documento de maqueta tecnica asociado

La maqueta tecnica del frontend de alta quedó en:

- `docs/Plan_personas_empresa_contactos/maqueta_tecnica_frontend_alta.md`

### Fase 2

Crear endpoint de fachada en panel:

- `POST /api/personas/alta`

### Fase 3

Implementar endpoint backend real:

- `POST /crm/personas/alta`

### Fase 4

Hacer que el frontend nuevo use ese contrato.

### Fase 5

Retirar la traduccion legacy.

Estado actual:

- la traducción legacy ya no forma parte del runtime activo del panel de contactos

## 15. Criterio de exito

El contrato se considera correcto cuando:

- el frontend puede crear cualquiera de los 4 escenarios sin ambiguedad
- el backend ya no depende del concepto viejo de `contacto` para el alta
- la respuesta del backend refleja claramente:
  - persona creada
  - cuenta creada o vinculada
  - relacion creada
