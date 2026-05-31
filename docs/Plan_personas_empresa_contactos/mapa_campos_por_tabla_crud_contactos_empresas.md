# Mapa de campos por tabla para el CRUD de contactos y empresas

Fecha: 2026-04-29 (UTC)

## Regla base

- La UI debe alinearse con las tablas reales de la base de datos.
- El modal de creacion se organiza en tres botones de alta: `Contacto`, `Empresa` y `Persona física con actividad empresarial`.
- `Vincular contacto a empresa` existe como accion secundaria independiente.
- `Persona física con actividad empresarial` crea automaticamente la relacion principal al guardar.
- Solo se ocultan los campos `id` y los IDs de relación cuando no aporten al usuario final.
- Los timestamps pueden mostrarse como metadatos o solo lectura, pero no forman parte del flujo de captura principal.
- Los campos técnicos o de compatibilidad pueden ir en un bloque avanzado si hacen falta, pero no deben desaparecer del mapa.

## Criterio de lectura

- `Visible`: se muestra en la UI principal.
- `Avanzado`: se muestra en un bloque secundario o colapsable.
- `Solo lectura`: se muestra, pero no se edita.
- `Oculto`: no se muestra en el flujo normal.

## `public.personas`

| Campo | Estado | Notas |
|---|---|---|
| `organizacion_id` | Oculto | ID de tenant |
| `nombre` | Visible | Nombre de la persona |
| `apellido_paterno` | Visible | Apellido |
| `apellido_materno` | Visible | Apellido |
| `nombre_completo` | Solo lectura | Derivado / materializado |
| `correo_principal` | Visible | Correo 1 principal |
| `correo_secundario` | Visible | Correo 2 |
| `telefono_principal_e164` | Visible | Teléfono principal |
| `telefono_principal_tipo_linea` | Visible | Selector `movil` o `fijo` |
| `telefono_principal_extension` | Visible | Aparece si la línea es fija, sin bloquear guardado |
| `telefono_secundario_e164` | Visible | Teléfono 2 |
| `telefono_secundario_tipo_linea` | Visible | Selector `movil` o `fijo` |
| `telefono_secundario_extension` | Visible | Aparece si la línea es fija, sin bloquear guardado |
| `puesto` | Visible | Cargo |
| `area` | Visible | Área |
| `rol_decision` | Visible | Rol de decisión |
| `estado` | Visible | Estado operativo |
| `origen` | Visible | Fuente de captura |
| `notas` | Visible | Notas libres |
| `metadata` | Avanzado | Datos técnicos de compatibilidad, no para captura principal |
| `propietario_usuario_id` | Oculto | Relación interna |
| `creado_en` | Solo lectura | Auditoría |
| `actualizado_en` | Solo lectura | Auditoría |

## `public.cuentas`

Nota de transición:
- el bloque de dirección que hoy vive en `cuentas` se mantiene como compatibilidad temporal
- la fuente de verdad final para domicilios debe ser `cuenta_direcciones`
- mientras dura la migración, `cuentas.direccion` y los campos planos de domicilio se leen como fallback fiscal/legacy

| Campo | Estado | Notas |
|---|---|---|
| `organizacion_id` | Oculto | ID de tenant |
| `nombre` | Visible | Nombre principal de la cuenta |
| `alias` | Visible | Nombre alterno |
| `tipo` | Visible | Tipo de cuenta |
| `industria` | Visible | Industria |
| `tamano` | Visible | Tamaño |
| `sitio_web` | Visible | Sitio web |
| `correo_principal` | Visible | Correo 1 principal |
| `correo_secundario` | Visible | Correo 2 |
| `telefono_principal_e164` | Visible | Teléfono principal |
| `telefono_principal_tipo_linea` | Visible | Selector `movil` o `fijo` |
| `telefono_principal_extension` | Visible | Aparece si la línea es fija, sin bloquear guardado |
| `telefono_secundario_e164` | Visible | Teléfono 2 |
| `telefono_secundario_tipo_linea` | Visible | Selector `movil` o `fijo` |
| `telefono_secundario_extension` | Visible | Aparece si la línea es fija, sin bloquear guardado |
| `direccion` | Avanzado | Compatibilidad temporal / fallback fiscal legacy |
| `propietario_usuario_id` | Oculto | Relación interna |
| `metadata` | Oculto | Datos técnicos o extensión |
| `creado_en` | Solo lectura | Auditoría |
| `actualizado_en` | Solo lectura | Auditoría |
| `codigo_cuenta` | Visible | Código de cuenta |
| `razon_social` | Visible | Razón social |
| `rfc` | Visible | RFC |
| `uso_cfdi` | Visible | Dato fiscal |
| `metodo_pago` | Visible | Dato fiscal |
| `forma_pago` | Visible | Dato fiscal |
| `email_facturacion` | Visible | Correo de facturación |
| `tipo_industria` | Visible | Clasificación de negocio |
| `notas` | Visible | Notas libres |
| `necesidad_proposito` | Visible | Intención o motivo |
| `tipo_vialidad` | Visible | Dirección legacy temporal |
| `nombre_vialidad` | Visible | Dirección legacy temporal |
| `numero_exterior` | Visible | Dirección legacy temporal |
| `letra_exterior` | Visible | Dirección legacy temporal |
| `edificio` | Visible | Dirección legacy temporal |
| `edificio_piso` | Visible | Dirección legacy temporal |
| `numero_interior` | Visible | Dirección legacy temporal |
| `letra_interior` | Visible | Dirección legacy temporal |
| `tipo_asentamiento` | Visible | Dirección legacy temporal |
| `nombre_asentamiento` | Visible | Dirección legacy temporal |
| `tipo_centro_comercial` | Visible | Dirección legacy temporal |
| `corredor_industrial` | Visible | Dirección legacy temporal |
| `numero_local` | Visible | Dirección legacy temporal |
| `codigo_postal` | Visible | Dirección legacy temporal |
| `clave_entidad` | Visible | Dirección legacy temporal |
| `entidad` | Visible | Dirección legacy temporal |
| `clave_municipio` | Visible | Dirección legacy temporal |
| `municipio` | Visible | Dirección legacy temporal |
| `clave_localidad` | Visible | Dirección legacy temporal |
| `localidad` | Visible | Dirección legacy temporal |
| `pais` | Visible | Dirección legacy temporal |
| `email` | Oculto | Compatibilidad |
| `website` | Oculto | Compatibilidad |
| `tipo_establecimiento` | Visible | Dirección / sucursal |
| `latitud` | Visible | Ubicación |
| `longitud` | Visible | Ubicación |
| `fecha_incorporacion` | Visible | Fecha de alta |

## `public.direcciones`

| Campo | Estado | Notas |
|---|---|---|
| `organizacion_id` | Oculto | ID de tenant |
| `tipo` | Visible | `fiscal`, `operativa`, `facturacion`, `envio`, `personal`, `otro` |
| `pais` | Visible | País |
| `clave_entidad` | Visible | Estado / entidad |
| `entidad` | Visible | Estado / entidad |
| `clave_municipio` | Visible | Municipio |
| `municipio` | Visible | Municipio |
| `clave_localidad` | Visible | Localidad |
| `localidad` | Visible | Localidad |
| `tipo_vialidad` | Visible | Calle / vialidad |
| `nombre_vialidad` | Visible | Calle / vialidad |
| `numero_exterior` | Visible | Exterior |
| `letra_exterior` | Visible | Exterior |
| `edificio` | Visible | Edificio |
| `edificio_piso` | Visible | Piso |
| `numero_interior` | Visible | Interior |
| `letra_interior` | Visible | Interior |
| `tipo_asentamiento` | Visible | Colonia / asentamiento |
| `nombre_asentamiento` | Visible | Colonia / asentamiento |
| `tipo_centro_comercial` | Visible | Centro comercial |
| `corredor_industrial` | Visible | Corredor industrial |
| `numero_local` | Visible | Local |
| `codigo_postal` | Visible | C.P. |
| `latitud` | Visible | Coordenada |
| `longitud` | Visible | Coordenada |
| `metadata` | Oculto | Extensión |
| `creado_en` | Solo lectura | Auditoría |
| `actualizado_en` | Solo lectura | Auditoría |

## `public.cuenta_personas`

| Campo | Estado | Notas |
|---|---|---|
| `organizacion_id` | Oculto | ID de tenant |
| `cuenta_id` | Oculto | Relación interna |
| `persona_id` | Oculto | Relación interna |
| `rol_en_cuenta` | Visible | Rol en la empresa |
| `rol_catalogo_id` | Oculto | Catálogo opcional |
| `puesto` | Visible | Puesto en esa cuenta |
| `es_contacto_principal` | Visible | Checkbox |
| `es_contacto_facturacion` | Visible | Checkbox |
| `es_representante_legal` | Visible | Checkbox |
| `activo` | Visible | Estado de la relación |
| `fecha_inicio` | Visible | Inicio |
| `fecha_fin` | Visible | Fin |
| `notas` | Visible | Notas de la relación |
| `metadata` | Oculto | Extensión |
| `creado_en` | Solo lectura | Auditoría |
| `actualizado_en` | Solo lectura | Auditoría |

## `public.cuenta_direcciones`

| Campo | Estado | Notas |
|---|---|---|
| `organizacion_id` | Oculto | ID de tenant |
| `cuenta_id` | Oculto | Relación interna |
| `direccion_id` | Oculto | Relación interna |
| `tipo_relacion` | Visible | Tipo de vínculo |
| `es_principal` | Visible | Checkbox |
| `activo` | Visible | Estado |
| `notas` | Visible | Notas |
| `metadata` | Oculto | Extensión |
| `creado_en` | Solo lectura | Auditoría |
| `actualizado_en` | Solo lectura | Auditoría |

## `public.contactos` legacy

Esta tabla sigue existiendo como compatibilidad y referencia histórica, pero ya no es la base del flujo nuevo.

| Campo | Estado | Notas |
|---|---|---|
| `nombre_completo` | Visible | Referencia legacy |
| `correo` | Visible | Referencia legacy |
| `telefono_e164` | Visible | Referencia legacy |
| `origen` | Visible | Referencia legacy |
| `propietario_usuario_id` | Oculto | Relación interna |
| `estado` | Visible | Estado legacy |
| `contacto_datos` | Avanzado | JSON legacy |
| `company_name` | Visible | Referencia legacy |
| `notes` | Visible | Notas legacy |
| `necesidad_proposito` | Visible | Referencia legacy |
| `captura_estado` | Visible | Estado de captura |
| `organizacion_id` | Oculto | Tenant |
| `cuenta_id` | Oculto | Relación interna |
| `codigo_contacto` | Visible | Código legacy |
| `nombre_nombres` | Visible | Nombre |
| `apellido_paterno` | Visible | Apellido |
| `apellido_materno` | Visible | Apellido |
| `persona_fisica_moral` | Visible | Tipo legacy |
| `razon_social` | Visible | Razón social |
| `rfc` | Visible | RFC |
| `uso_cfdi` | Visible | Fiscal |
| `metodo_pago` | Visible | Fiscal |
| `forma_pago` | Visible | Fiscal |
| `email_facturacion` | Visible | Fiscal |
| `tipo_industria` | Visible | Industria |
| `tamano` | Visible | Tamaño |
| `puesto` | Visible | Puesto |
| `area` | Visible | Área |
| `rol_decision` | Visible | Rol |
| `notas` | Visible | Notas |
| `tipo_vialidad` | Visible | Dirección |
| `nombre_vialidad` | Visible | Dirección |
| `numero_exterior` | Visible | Dirección |
| `letra_exterior` | Visible | Dirección |
| `edificio` | Visible | Dirección |
| `edificio_piso` | Visible | Dirección |
| `numero_interior` | Visible | Dirección |
| `letra_interior` | Visible | Dirección |
| `tipo_asentamiento` | Visible | Dirección |
| `nombre_asentamiento` | Visible | Dirección |
| `tipo_centro_comercial` | Visible | Dirección |
| `corredor_industrial` | Visible | Dirección |
| `numero_local` | Visible | Dirección |
| `codigo_postal` | Visible | Dirección |
| `clave_entidad` | Visible | Dirección |
| `entidad` | Visible | Dirección |
| `clave_municipio` | Visible | Dirección |
| `municipio` | Visible | Dirección |
| `clave_localidad` | Visible | Dirección |
| `localidad` | Visible | Dirección |
| `pais` | Visible | Dirección |
| `telefono` | Visible | Contacto |
| `email` | Visible | Contacto |
| `website` | Visible | Web |
| `tipo_establecimiento` | Visible | Dirección / sucursal |
| `latitud` | Visible | Ubicación |
| `longitud` | Visible | Ubicación |
| `fecha_incorporacion` | Visible | Fecha de alta |

## Tareas de implementación

1. Ajustar `contact-create-flow.tsx` para que cubra todos los campos visibles por entidad.
2. Ajustar `contact-edit-flow.tsx` con el mismo mapa.
3. Mantener ocultos solo los `id`.
4. Dejar los timestamps como solo lectura o bloque de auditoría.
5. Si un campo existe en la DB y tiene sentido de negocio, debe tener representación en UI.
