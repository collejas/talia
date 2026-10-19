# Plan de visibilidad por modalidad del tenant

## Objetivo

Asegurar que cada tenant vea y pueda utilizar únicamente las vistas, botones,
acciones y APIs correspondientes a su forma de trabajo:

- Propiedades inmobiliarias.
- Productos y servicios.
- Ambas modalidades.
- Ninguna modalidad comercial específica.

La regla debe aplicarse de forma consistente en frontend, backend y base de
datos, sin depender únicamente de ocultar elementos del menú.

## Documentos relacionados

- [`docs/multi_tenant/tenant_config_schema.md`](../multi_tenant/tenant_config_schema.md)
- [`docs/multi_tenant/tenant_variables_catalog.md`](../multi_tenant/tenant_variables_catalog.md)
- [`docs/ventas_productos_propiedades_unidades/separacion_productos_productosinmobiliarios/PLAN_SEPARACION_PRODUCTOS_INMOBILIARIOS.md`](../ventas_productos_propiedades_unidades/separacion_productos_productosinmobiliarios/PLAN_SEPARACION_PRODUCTOS_INMOBILIARIOS.md)
- [`docs/ventas_productos_propiedades_unidades/flujo_integrado.md`](../ventas_productos_propiedades_unidades/flujo_integrado.md)

## Diferencia entre módulos y catálogos de asistentes

La configuración actual contiene dos grupos de flags que no deben mezclarse.

### Módulos del panel

Estos flags controlan la experiencia operativa del usuario:

```json
{
  "features": {
    "productos": { "enabled": true },
    "propiedades": { "enabled": false }
  }
}
```

- `features.productos.enabled`: habilita productos, servicios, compras,
  almacenes, inventario y transformaciones.
- `features.propiedades.enabled`: habilita propiedades, desarrollos, unidades,
  mapa 3D, reservas, apartados y contratos inmobiliarios.

### Catálogos de asistentes

Estos flags controlan qué información puede consultar la IA:

```json
{
  "features": {
    "catalog_inmobiliario": { "enabled": true },
    "catalog_no_inmobiliario": { "enabled": false }
  }
}
```

Pueden permanecer independientes de los módulos visibles del panel. Por
ejemplo, un tenant puede tener propiedades desactivadas para sus usuarios
pero mantener un catálogo inmobiliario habilitado para un asistente específico,
si esa decisión es intencional y está documentada.

## Matriz funcional

| Modalidad | Propiedades | Productos | Operación logística |
|---|---:|---:|---:|
| Solo propiedades | Visible | Oculto | Oculta |
| Solo productos | Oculta | Visible | Visible |
| Ambas | Visible | Visible | Visible |
| Ninguna | Oculta | Oculto | Oculta |

### Módulo de propiedades

Debe incluir, cuando `features.propiedades.enabled = true`:

- Propiedades 3D.
- Desarrollos, capas, manzanas y unidades.
- Estados inmobiliarios.
- Reservas y apartados.
- Cambio de comprador.
- Contratos inmobiliarios.
- Acciones inmobiliarias del mapa, como vender, apartar y reservar.
- Reportes o vistas exclusivamente inmobiliarias.

Debe ocultarse y bloquearse cuando el flag esté desactivado.

### Módulo de productos

Debe incluir, cuando `features.productos.enabled = true`:

- Productos y servicios.
- Líneas, familias, modelos y unidades de medida.
- Catálogo general.
- Listas de precios generales.
- Compras y proveedores.
- Almacenes.
- Inventario operativo.
- Surtidos y entregas.
- Transformaciones.
- Órdenes de compra y recepciones.

Debe ocultarse y bloquearse cuando el flag esté desactivado.

### Funcionalidad compartida

Estas áreas no deben clasificarse automáticamente como productos o
propiedades sin revisar el caso de uso:

- CRM.
- Contactos, empresas y clientes.
- Oportunidades.
- Inbox y conversaciones.
- Agenda.
- Prospección.
- Cotizaciones y propuestas.
- Ventas generales.
- Dashboard y reportes compartidos.

Cuando una vista compartida mezcle datos de ambos dominios, debe mostrar solo
las secciones, filtros y acciones correspondientes a los módulos habilitados.

## Estado actual detectado

### Frontend

Ya existe un helper en:

```text
frontend/panel/src/lib/settings/module-flags.ts
```

También existen guardas en las rutas principales de propiedades y productos.
Sin embargo, todavía deben revisarse o protegerse explícitamente:

- `/compras`
- `/operacion/inventario`
- `/operacion/transformaciones`
- `/inventario/surtidos`
- `/ventas`
- `/ventas/pedidos`
- `/crm/catalogo-precios`
- `/crm/propiedades`
- Acciones y componentes compartidos que cargan catálogo.

El menú lateral tampoco filtra todas las opciones relacionadas con compras,
inventario, ventas y catálogo de precios.

### Backend

El backend ya utiliza `require_tenant_module_enabled()` en varias rutas de
productos y propiedades.

Debe revisarse la cobertura de esa dependencia en:

- Catálogo general.
- Listas de precios.
- Compras.
- Inventario operativo.
- Surtidos.
- Transformaciones.
- Ventas y formalización.
- APIs utilizadas por vistas compartidas.

Las validaciones de módulo deben permanecer en backend aunque el frontend
oculte el botón o la ruta.

### Base de datos

La configuración vive en `public.organizaciones.config`.

La separación de los datos de catálogo utiliza principalmente:

- `catalog_items.propiedad_id`.
- `catalog_items.unidad_id`.
- `catalog_items.maneja_inventario`.
- `catalog_items.organizacion_id`.

Las propiedades utilizan tablas independientes como `propiedad_desarrollos` y
`propiedad_unidades`. No deben entrar al flujo de almacenes, recepciones ni
movimientos cuantitativos de inventario.

No se propone crear una nueva columna o tabla para los flags en esta fase.
Primero debe consolidarse el contrato existente de `organizaciones.config` y
validarse su provisión para nuevos tenants.

## Plan de implementación

### Fase 1: contrato y helper común

- Confirmar los nombres oficiales de los flags.
- Mantener `productos` y `propiedades` como flags de módulos del panel.
- Mantener `catalog_inmobiliario` y `catalog_no_inmobiliario` como flags de IA.
- Crear una resolución común de modalidad para frontend y backend.
- Definir el comportamiento cuando un flag no existe.
- Evitar defaults silenciosos que habiliten una modalidad no configurada.

### Fase 2: navegación y rutas frontend

- Filtrar el menú lateral por modalidad.
- Proteger las rutas mediante layouts o guardas server-side.
- Redirigir accesos directos a módulos desactivados.
- Revisar páginas que cargan datos de ambos dominios.
- Ocultar botones específicos de propiedades en tenants de productos.
- Ocultar botones específicos de inventario en tenants de propiedades.
- Mantener estados de carga y error sin mostrar temporalmente acciones inválidas.

### Fase 3: backend y APIs

- Aplicar la guarda del módulo a cada grupo de endpoints.
- Responder `403` con códigos consistentes, por ejemplo:
  - `feature_productos_disabled`
  - `feature_propiedades_disabled`
- Validar el módulo antes de ejecutar operaciones o consultar datos.
- Evitar confiar en permisos frontend o en la URL solicitada.
- Mantener ownership y aislamiento por `organizacion_id`.

### Fase 4: filtros de datos

- Separar consultas generales de catálogo y consultas inmobiliarias.
- No devolver unidades inmobiliarias en vistas de productos generales.
- No devolver existencias de almacén en vistas inmobiliarias.
- Revisar cotizaciones, listas de precios, ventas y reportes compartidos.
- Mantener relaciones explícitas y evitar resolver el dominio solo mediante
  `metadata` o `jsonb`.

### Fase 5: provisión y configuración

- Revisar los defaults de creación de tenant.
- Confirmar que todo tenant nuevo reciba una configuración explícita.
- Definir si el producto comercial contratado activa productos, propiedades o
  ambos.
- Evitar que un tenant quede bloqueado por ausencia accidental de flags.
- Revisar la configuración existente antes de modificar datos productivos.

### Fase 6: pruebas

Probar cada combinación:

1. Solo propiedades.
2. Solo productos.
3. Ambos módulos.
4. Ningún módulo.

Para cada combinación se debe verificar:

- Menú lateral.
- Acceso directo a URL.
- Render inicial de la vista.
- Botones y acciones internas.
- APIs frontend.
- APIs backend directas.
- Respuestas `403`.
- No exposición de datos del dominio desactivado.
- Conservación de funcionalidades compartidas.

## Criterios de aceptación

- Un tenant de propiedades no ve compras, almacenes, inventario operativo ni
  transformaciones.
- Un tenant de productos no ve mapa 3D, reservas, apartados ni contratos
  inmobiliarios.
- Un tenant con ambos módulos ve ambos flujos completos.
- Un tenant sin módulos no ve ninguna entrada comercial específica.
- Una URL directa a un módulo desactivado no permite utilizarlo.
- Una llamada directa a una API de módulo desactivado devuelve `403`.
- Las vistas compartidas no mezclan datos inmobiliarios con inventario de
  almacén de forma incorrecta.
- Los flags de asistentes continúan funcionando de manera independiente.
- La configuración de nuevos tenants queda documentada y validada.

## Riesgos y decisiones pendientes

### Riesgos

- Ocultar un botón sin proteger el endpoint dejaría un acceso funcional.
- Aplicar `productos` y `propiedades` a los flags de asistentes podría apagar
  flujos de IA intencionalmente configurados.
- Un default incorrecto puede habilitar módulos que el tenant no contrató.
- Las vistas compartidas pueden seguir mezclando dominios aunque el menú esté
  correctamente filtrado.

### Decisiones pendientes

- Si `ventas` debe aparecer para ambos tipos de tenant o dividirse en ventas
  inmobiliarias y ventas generales.
- Si `cotizaciones` y `listas de precios` deben mostrar ambos dominios o usar
  vistas separadas.
- Si la modalidad debe derivarse únicamente de flags o también del plan
  comercial contratado.
- Qué roles internos pueden administrar los flags.

## Regla de mantenimiento

Toda nueva vista, botón o endpoint relacionado con propiedades, productos,
compras o inventario debe declarar explícitamente:

1. Qué modalidad requiere.
2. Qué flag la controla.
3. Qué permiso necesita.
4. Qué datos puede devolver.
5. Qué debe ocurrir si la modalidad está desactivada.

No se considera suficiente agregar una opción al menú. La protección debe
existir también en la ruta server-side y en el backend.

## Implementación inicial aplicada

Fecha: 2026-10-19

- Se consolidó la lectura backend de `features.productos` y
  `features.propiedades`.
- Se agregó acceso backend para exigir al menos un módulo comercial activo.
- Compras, operación e inventario operativo quedan bloqueados para tenants sin
  productos, incluso mediante acceso directo a la API.
- Las rutas frontend de compras, surtidos, inventario y transformaciones exigen
  el módulo de productos.
- El catálogo de precios exige al menos una modalidad activa y solo carga la
  jerarquía inmobiliaria cuando propiedades está habilitado.
- El menú lateral oculta compras y operación cuando productos está desactivado.
- `catalog_items` se filtra por dominio usando `propiedad_id` y `unidad_id`
  cuando el tenant tiene una sola modalidad activa.

Pendiente para una siguiente iteración:

- Validación visual autenticada por tenant en el panel desplegado.
- Revisión de ventas, cotizaciones y reportes compartidos.
- Pruebas automatizadas específicas para las cuatro combinaciones de módulos.
- Resolver el comportamiento de tenants nuevos cuyos flags no existan todavía.

