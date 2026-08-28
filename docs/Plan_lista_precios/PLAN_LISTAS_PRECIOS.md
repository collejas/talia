# Plan: listas de precios por tenant

## 1. Objetivo

Ampliar el catálogo actual de productos para que cada tenant pueda definir varias listas de precios y asignar un precio distinto a cada producto en cada lista.

El flujo existente del modal de cotización ya permite seleccionar productos. La ampliación consiste en permitir que el usuario autorizado seleccione la lista de precios que se aplicará a cada línea de la cotización.

La consolidación de métricas del CRM se documenta por separado en
`../Plan_metricas/PLAN_CONSOLIDACION_METRICAS.md`. Las listas de precios,
cotizaciones y sus snapshots no deben incorporar lógica de métricas de correo,
campañas o mapa de conversión.

Ejemplos de listas:

- Precio distribuidor.
- Precio de oferta.
- Precio especial.
- Cualquier otra lista definida por el tenant.

## 1.1 Estado de implementación

La fundación de base de datos de esta funcionalidad ya fue aplicada en Supabase mediante la migración:

`supabase/migrations/20280821_120000_listas_precios_foundation.sql`

Implementado y verificado:

- Catálogo tenant-aware de `listas_precios`.
- Asignaciones explícitas por rol, usuario y empleado.
- Relación de precio vigente por item y lista.
- Historial explícito para `Precio base` y precios de listas.
- Triggers para registrar creación y cambios de precios.
- RLS, foreign keys, constraints e índices multi-tenant.
- Snapshot inicial de 1,702 precios base existentes.
- Prueba reversible de trigger para creación de precio de lista y actualización de `Precio base`.

La migración no recupera cambios ocurridos antes de su aplicación; el historial completo comienza a partir de este punto.

### 1.2 Incidente de compatibilidad documentado

El 2026-08-21 se corrigió una regresión introducida durante el trabajo local de esta funcionalidad. Un bloque de mantenimiento de precios fue insertado accidentalmente en `list_contact_envios_by_ids`, una función de lectura del CRM que no pertenece al dominio de listas de precios.

La corrección fue deliberadamente mínima:

- se eliminó únicamente el bloque accidental de `backend/app/repositories/crm.py`;
- no se cambiaron migraciones, tablas, contratos de precios, permisos, snapshots ni componentes de cotización;
- no se ejecutaron eliminaciones de datos en Supabase;
- se verificó que el endpoint de visitas web y sus exportaciones pudieran volver a ejecutarse después de reiniciar el API.

Regla de compatibilidad para las siguientes fases: la lógica de listas de precios debe permanecer en sus endpoints, servicios, repositorios y migraciones propios. Las funciones de lectura de tráfico, conversaciones y conversiones no deben contener sincronizaciones ni limpiezas del catálogo.

En progreso local:

- Endpoints protegidos para administrar listas, permisos, precios por item e historial.
- CRUD visual de nombres de listas en `settings/account`.
- Asignación visual de una lista a roles, usuarios y empleados.
- Selector de lista de precios por línea en el modal de cotización del flujo de Embudo/Inbox.
- Validación backend de autorización y precio vigente antes de crear, previsualizar o enviar.
- Snapshot explícito de lista, nombre y moneda aplicada en `cotizacion_items`.

Implementado localmente y migrado a Supabase:

- Límites de descuento configurables por tipo de precio (`Precio base` o lista), rol,
  usuario y empleado.

Aún falta la validación viva con usuarios representativos, el despliegue del backend/panel y la revisión de la representación PDF para mostrar el nombre de la lista cuando el negocio lo requiera.

## 2. Alcance funcional

### 2.1 Administración en `settings/account`

Agregar una sección para administrar las listas de precios del tenant:

- Crear una lista.
- Editar el nombre de una lista.
- Activar o desactivar una lista, si el producto requiere conservar historial.
- Eliminar una lista únicamente cuando no tenga precios históricos o cotizaciones que dependan de ella; en caso contrario, usar desactivación.
- Ordenar o definir una lista predeterminada, si el flujo actual lo necesita.
- Administrar quién puede utilizar cada lista.

El nombre de la lista debe ser obligatorio, pertenecer al tenant y ser único dentro de ese tenant, sin depender de `metadata`, `json` o `jsonb`.

### 2.2 Permisos de listas de precios

El tenant debe poder controlar el uso de cada lista mediante permisos asignables a:

- Roles.
- Usuarios.
- Empleados, conforme al modelo de identidad existente.

Debe distinguirse entre:

- Permiso para administrar listas.
- Permiso para capturar o editar precios de productos.
- Permiso para utilizar una lista al cotizar.

La interfaz puede ocultar acciones no permitidas, pero la autorización definitiva debe ejecutarse en backend y en la base de datos cuando aplique.

### 2.3 Límites de descuento por tipo de precio

Además del permiso para utilizar una lista, el tenant podrá establecer el porcentaje
máximo de descuento que puede aplicar cada rol, usuario o empleado. Esta regla será
independiente del permiso de uso de la lista: tener acceso a una lista no implica poder
aplicar cualquier descuento.

El límite se configurará por tipo de precio:

- `Precio base`, usando `catalog_items.precio_base` como precio de referencia.
- Cada lista de precios activa del tenant.

El descuento siempre se calculará sobre el precio vigente de la lista seleccionada en
la línea de la cotización. Cuando la selección sea `Precio base`, se calculará sobre el
precio base vigente del producto.

La configuración debe permitir reglas para:

- Un rol.
- Un usuario específico.
- Un empleado específico, conforme al modelo de identidad existente.

La interfaz deberá mostrar el límite configurado, permitir crearlo o modificarlo y
distinguir entre una regla inexistente y un límite de descuento de `0%`. La autorización
definitiva y el límite efectivo deben validarse en backend; no se debe confiar en el
porcentaje enviado por el frontend.

La prioridad implementada para resolver una regla efectiva es: usuario específico,
empleado y finalmente rol. La regla seleccionada debe ser determinista, auditable y
aplicarse igual desde Embudo e Inbox.

### 2.4 CRUD de productos en `settings/productos/items`

En el formulario de creación y edición de cada producto:

- Mostrar las listas activas del tenant.
- Mostrar un campo de precio por cada lista.
- Permitir capturar, editar o limpiar el precio según los permisos del usuario.
- Validar formato, moneda, precisión, valores negativos y límites definidos por el negocio.
- Mostrar un estado claro cuando el producto no tenga precio para una lista.
- No borrar silenciosamente precios usados en cotizaciones históricas.

La sección de precios debe ser dinámica: al crear una nueva lista en `settings/account`, debe aparecer para los productos sin tener que crear columnas nuevas ni modificar código por cada lista.

### 2.4.1 Carga y respaldo masivo del catálogo

Las acciones `Importar productos` y `Descargar productos existentes` deben trabajar
con las listas de precios activas configuradas por el tenant:

- La descarga de productos incluye una columna por cada lista activa.
- La plantilla incluye las mismas columnas, listas para capturar precios.
- El encabezado usa el nombre legible de la lista y su UUID, por ejemplo
  `precio_lista_distribuidor__<uuid>`. El UUID mantiene la referencia aunque el nombre
  visible de la lista cambie.
- Una celda vacía conserva el precio existente; un valor numérico, incluido `0`, lo
  crea o actualiza.
- Las columnas de listas solo pueden importarse por `admin` o `admin_operativo`; el
  permiso se valida en backend.
- Las listas inactivas no se incluyen en nuevas plantillas o descargas y no pueden
  recibir precios mediante importación.

### 2.5 Modal de cotización desde Embudo e Inbox

Conservar el comportamiento actual de selección de productos y agregar por cada línea:

- Producto obligatorio del catálogo; no se permitirán líneas manuales sin `catalog_item_id`.
- Selector de lista de precios autorizada.
- Precio obtenido de la combinación producto + lista.
- Campo de descuento, limitado por la regla autorizada para el tipo de precio seleccionado.
- Precio final después del descuento.
- Cantidad.
- Subtotal calculado con el precio seleccionado.
- Indicador cuando no existe precio para esa combinación.

El usuario podrá usar listas diferentes en líneas diferentes de la misma cotización, siempre que tenga permiso para todas ellas.

El precio unitario será de solo lectura en el módulo de cotizaciones. No se aceptará
un precio manual enviado por el cliente ni se permitirá modificarlo desde Embudo o
Inbox. El único lugar para cambiar el precio de un producto será su ficha en
`settings/productos/items`; la cotización solo resolverá el precio base o de la lista
seleccionada y aplicará el descuento autorizado.

Al guardar o enviar la cotización, se debe conservar una instantánea de la lista y del precio aplicados en cada línea. Los cambios futuros del catálogo no deben alterar una cotización histórica.

El flujo debe funcionar de forma equivalente cuando la oportunidad se abre desde:

- Vista de Embudo.
- Inbox.

### 2.6 Generación y envío de la cotización

Revisar el flujo completo posterior al modal:

- Guardado de la cotización.
- Generación de PDF o representación utilizada actualmente.
- Envío por correo, WhatsApp u otros canales existentes.
- Visualización de la lista aplicada y del precio final por línea cuando corresponda.
- Visualización del precio de lista, descuento aplicado y precio final cuando corresponda.
- Reenvío y consulta de cotizaciones anteriores.

La cotización enviada debe mostrar el precio aplicado, no recalcularlo desde el precio vigente del producto.

## 3. Modelo de datos propuesto

Antes de crear la migración se debe inspeccionar el esquema actual de productos, precios, cotizaciones, líneas, tenants, roles, usuarios y empleados. Los nombres siguientes son conceptuales y deben adaptarse a las tablas existentes.

### 3.1 Catálogo de listas

Entidad conceptual: `listas_precios`.

Columnas explícitas esperadas:

- `id` UUID, primary key.
- `organizacion_id` o identificador real del tenant, foreign key.
- `nombre`.
- `codigo` o slug estable, si el sistema necesita referencias técnicas.
- `activo`.
- `creado_por_usuario_id`, si existe auditoría equivalente.
- `created_at`.
- `updated_at`.

Constraints e índices:

- Unicidad de nombre por tenant, considerando la regla de mayúsculas/minúsculas definida por el producto.
- Índice por tenant y estado activo.
- Foreign key real al tenant.
- No permitir que un cliente envíe otro `organizacion_id` y evada el tenant autenticado.

### 3.2 Precio de producto por lista

Entidad conceptual: `producto_lista_precios`.

Columnas explícitas esperadas:

- `id` UUID, primary key.
- `producto_id`, foreign key al producto/item existente.
- `lista_precio_id`, foreign key a la lista.
- `precio` en tipo numérico monetario adecuado para PostgreSQL, no `float`.
- `moneda`, si el catálogo actual soporta monedas.
- `activo`, si se requiere conservar relaciones históricas.
- `created_at`.
- `updated_at`.

Constraints e índices:

- Unicidad de `producto_id + lista_precio_id`.
- Precio no negativo, salvo que el negocio defina explícitamente otra regla.
- Foreign keys a producto y lista.
- Índices para consultar todos los precios de un producto y todos los productos de una lista.

### 3.3 Permisos

Reutilizar primero el modelo de permisos existente. Si no existe una relación específica para listas, diseñar relaciones explícitas, por ejemplo:

- Lista ↔ rol.
- Lista ↔ usuario.
- Lista ↔ empleado, únicamente si es una entidad distinta en el modelo actual.

No guardar asignaciones de autorización dentro de JSON. Deben poder consultarse, auditarse y filtrarse con columnas y relaciones reales.

### 3.4 Límites de descuento

Se debe agregar una relación explícita para conservar los límites de descuento por
tenant y por sujeto autorizado. El nombre final debe adaptarse al esquema existente,
por ejemplo `listas_precios_limites_descuento`.

Columnas conceptuales esperadas:

- `id` UUID, primary key.
- `organizacion_id`, foreign key al tenant.
- `tipo_precio`, con valores explícitos `base` o `lista`.
- `lista_precio_id`, foreign key nullable; debe ser nulo para `base` y obligatorio para `lista`.
- `rol_id`, `usuario_id` y `empleado_id`, todos nullable según el sujeto de la regla.
- `descuento_maximo_porcentaje`, tipo numérico adecuado para porcentaje.
- `activo`.
- `creado_por_usuario_id`, si existe auditoría equivalente.
- `created_at` y `updated_at`.

Constraints e índices:

- El porcentaje debe estar entre `0` y `100`.
- `tipo_precio = base` exige `lista_precio_id IS NULL`.
- `tipo_precio = lista` exige `lista_precio_id IS NOT NULL`.
- Exactamente uno de `rol_id`, `usuario_id` o `empleado_id` debe estar informado.
- La lista, el rol, el usuario y el empleado deben pertenecer al tenant autenticado.
- Unicidad por tenant, tipo de precio, lista y sujeto autorizado.
- Índices para resolver rápidamente el límite por tenant, tipo de precio, lista y sujeto.

La regla no debe guardarse en `metadata`, `json` o `jsonb`. Debe poder consultarse,
filtrarse, auditarse y validarse mediante columnas y relaciones reales.

### 3.5 Historial de cotización

Revisar si las líneas actuales ya guardan una instantánea del nombre y precio. Si no la guardan, agregar campos explícitos en la línea de cotización, como:

- `lista_precio_id`, nullable para compatibilidad histórica cuando aplique.
- `lista_precio_nombre` o equivalente histórico.
- `precio_unitario_aplicado`.
- `precio_lista_unitario`, es decir, el precio antes del descuento.
- `descuento_porcentaje_aplicado`.
- `limite_descuento_autorizado`.
- `precio_unitario_final`.
- `moneda_aplicada`, si aplica.
- `cantidad` y `subtotal` según el modelo existente.

La línea debe conservar el valor utilizado al momento de guardar la cotización. La foreign key a la lista no debe ser la única fuente histórica, porque la lista puede cambiar de nombre o desactivarse.

### 3.6 Historial de cambios de precios

Agregar una auditoría explícita para conservar cada cambio de precio, incluyendo:

- El `Precio base` actual del producto (`catalog_items.precio_base`).
- Cada precio del producto dentro de las nuevas listas de precios.
- Cambios de moneda cuando afecten la interpretación del precio.
- Creación, modificación y eventual eliminación lógica o desactivación del precio.

La auditoría no debe depender de `metadata`, `json` o `jsonb`.

Entidad conceptual: `catalog_item_price_history` o el nombre equivalente que se defina después de inspeccionar el esquema final.

Columnas esperadas:

- `id` UUID, primary key.
- `organizacion_id`, foreign key al tenant.
- `producto_id`, foreign key al producto/item.
- `lista_precio_id`, foreign key nullable para identificar el origen. Será nulo cuando el cambio corresponda al `Precio base`.
- `tipo_precio`, con un valor explícito como `base` o `lista`, para distinguir el `Precio base` de los precios por lista.
- `precio_anterior`.
- `precio_nuevo`.
- `moneda`, si aplica.
- `cambiado_por_usuario_id`, foreign key al usuario que realizó el cambio.
- `cambiado_en`.
- `origen_cambio`, por ejemplo `panel`, `importacion`, `api` o `sistema`.
- `accion`, por ejemplo `creado`, `actualizado`, `desactivado` o `eliminado`.
- `motivo`, solo si el negocio requiere capturarlo.

Reglas:

- Registrar un evento únicamente cuando el precio realmente cambie.
- Registrar también la creación del primer `Precio base` o precio de lista, usando `precio_anterior` nulo cuando corresponda.
- Registrar los cambios del `Precio base` aunque no exista una lista de precios asociada.
- Registrar los cambios de precios por lista con su `lista_precio_id` correspondiente.
- Registrar quién hizo el cambio. Si el cambio es automático, conservar el usuario iniciador cuando exista y marcar explícitamente el origen automático.
- No actualizar ni borrar los registros históricos desde el CRUD normal.
- Mantener el precio vigente en `catalog_items.precio_base` o en la relación actual producto-lista; el historial es una bitácora adicional.
- Mostrar el historial únicamente a usuarios con permiso de consulta administrativa o auditoría.
- Permitir filtrar por producto, tipo de precio, lista, usuario, origen, acción y rango de fechas.
- Agregar índices por tenant/producto/fecha, tenant/lista/fecha y tenant/usuario/fecha, según el esquema final.

El historial permitirá responder quién cambió cualquier precio, cuándo lo hizo, cuál era el valor anterior, cuál es el nuevo valor, si era `Precio base` o una lista específica y desde dónde se realizó el cambio. No debe modificar el precio guardado en cotizaciones anteriores, que conservarán su propio snapshot.

## 4. APIs y backend

Inspeccionar primero las rutas y repositorios existentes para evitar duplicar contratos.

### 4.1 Listas de precios

Contrato conceptual:

```text
GET    /api/.../listas-precios
POST   /api/.../listas-precios
PATCH  /api/.../listas-precios/{id}
DELETE /api/.../listas-precios/{id}
```

Separar schemas de entrada y salida:

- `ListaPrecioCreate`.
- `ListaPrecioUpdate`.
- `ListaPrecioRead`.
- `ListaPrecioPermissionUpdate`, si el proyecto usa un endpoint separado.

Las respuestas deben filtrar por tenant autenticado y devolver errores consistentes cuando el nombre esté duplicado, la lista no exista o no pueda eliminarse por referencias históricas.

### 4.2 Precios de productos

El contrato de productos debe incluir la colección de precios autorizada para la vista, sin exponer precios de listas que el usuario no pueda administrar o consultar.

Puede utilizarse un endpoint específico para guardar precios si es más compatible con el CRUD actual:

```text
PUT /api/.../productos/{producto_id}/precios
```

El backend debe:

- Validar que el producto y la lista pertenezcan al tenant.
- Validar que el usuario pueda editar precios.
- Validar la lista y el valor monetario.
- Evitar duplicados mediante constraint y operación transaccional.

### 4.3 Cotización

El request de cada línea debe incluir explícitamente el `lista_precio_id` elegido. El backend no debe aceptar únicamente un precio enviado por el frontend.

Al guardar la cotización, el servicio debe:

1. Validar acceso del usuario a la oportunidad.
2. Validar acceso del usuario a la lista seleccionada.
3. Consultar el precio vigente del producto para esa lista.
4. Validar que exista y que el producto esté disponible.
5. Resolver el límite de descuento efectivo para el tipo de precio seleccionado y el
   rol, usuario o empleado autenticado.
6. Validar que el descuento solicitado no supere el límite autorizado.
7. Calcular en servidor el descuento, precio final, cantidad, subtotal y total sobre el
   precio de la lista seleccionada.
8. Persistir la instantánea histórica de la línea, incluyendo precio antes del
   descuento, descuento y precio final.

Si una lista deja de estar permitida entre la carga del modal y el envío, la operación debe rechazarse con un error claro y no guardar una cotización parcialmente autorizada.

El backend debe rechazar también la operación cuando el descuento exceda el límite
vigente, aunque el frontend haya mostrado un valor permitido al cargar el modal.

### 4.4 Límites de descuento

Contrato conceptual para consultar y administrar límites:

```text
GET    /api/.../listas-precios/{id}/limites-descuento
PUT    /api/.../listas-precios/{id}/limites-descuento
GET    /api/.../precios-base/limites-descuento
PUT    /api/.../precios-base/limites-descuento
```

Los schemas deben representar explícitamente el sujeto (`rol`, `usuario` o
`empleado`), el tipo de precio y `descuento_maximo_porcentaje`. El backend debe:

- Validar tenant y ownership de todas las relaciones.
- Separar el permiso para administrar límites del permiso para utilizar precios.
- Resolver una única regla efectiva según la prioridad definida para usuario,
  empleado y rol.
- Rechazar porcentajes fuera de `0` a `100`.
- No aceptar como autoridad el límite ni el precio enviados por el cliente.
- Registrar auditoría de creación, modificación, activación y desactivación de límites.

## 5. UI/UX propuesta

### `settings/account`

Agregar una sección titulada **Listas de precios** con:

- Tabla de nombre, estado, cantidad de productos con precio y acciones.
- Crear y editar mediante formulario simple.
- Confirmación para eliminar o desactivar.
- Acceso claro a permisos.
- Configuración visible de límites de descuento por lista y para `Precio base`.
- Estados de carga, vacío, error y éxito.
- Advertencia cuando una lista tenga productos o cotizaciones relacionadas.

### `settings/productos/items`

En el formulario del item, agregar una sección **Precios por lista**:

- Una fila por lista activa.
- Nombre de lista visible y no editable desde el producto.
- Campo monetario para el precio.
- Indicador de precio faltante.
- Mensaje cuando el usuario solo tenga permiso de lectura.
- No mostrar listas que el usuario no pueda consultar, según el contrato de seguridad definido.

### Modal de cotización

En cada línea seleccionada:

- Producto.
- Lista de precios.
- Precio unitario de la lista.
- Descuento permitido y descuento aplicado.
- Precio unitario final.
- Cantidad.
- Subtotal.
- Acción para eliminar la línea.

La lista debe seleccionarse antes de confirmar la línea. Si solo existe una lista permitida, puede seleccionarse automáticamente, pero debe seguir siendo visible.

Debe existir un estado vacío útil cuando:

- El usuario no tiene listas autorizadas.
- El producto no tiene precio en ninguna lista autorizada.
- La lista seleccionada no tiene precio para el producto.

## 6. Seguridad y autorización

- Todas las operaciones deben estar limitadas al tenant autenticado.
- El frontend no es una capa de autorización.
- No confiar en `organizacion_id`, precios, roles o permisos enviados por el cliente.
- Validar permiso de administración de listas para crear, editar, desactivar o eliminar.
- Validar permiso de edición de precios para modificar precios de productos.
- Validar permiso de uso de lista al crear, actualizar, enviar o reenviar una cotización.
- Validar el límite de descuento para el tipo de precio seleccionado al crear,
  actualizar, enviar o reenviar una cotización.
- Calcular el descuento exclusivamente sobre el precio vigente de la lista seleccionada;
  para `Precio base`, usar `catalog_items.precio_base`.
- No permitir que el cliente altere el precio de lista, el límite autorizado ni el
  precio final calculado por el servidor.
- Revisar RLS y cualquier RPC `SECURITY DEFINER` existente.
- Aplicar autorización dentro de la consulta o servicio que materializa la cotización; no depender de filtros visuales.
- Evitar que un usuario obtenga precios de otra lista cambiando un UUID en la petición.
- No permitir líneas manuales ni aceptar un precio unitario distinto al precio vigente
  del producto o de la lista seleccionada.
- Registrar auditoría de cambios relevantes sin guardar tokens ni payloads sensibles.

## 7. Compatibilidad y migración

Antes de migrar:

1. Identificar cómo se almacenan actualmente los productos y precios.
2. Identificar si las cotizaciones existentes guardan precio histórico.
3. Identificar si ya existe un catálogo de listas o descuentos reutilizable.
4. Contabilizar productos, cotizaciones y líneas existentes.
5. Definir la compatibilidad de productos sin precio en una nueva lista.

La migración debe ser reversible cuando sea posible y no debe modificar precios históricos sin una decisión explícita. Si existe un precio único actual, debe definirse si se convierte en una lista inicial, por ejemplo **Precio general**, o si permanece como precio base compatible.

## 8. Plan de implementación por fases

### Fase 1: descubrimiento

- Revisar las páginas de settings/account y settings/productos/items.
- Localizar el modal de cotización y sus entradas desde Embudo e Inbox.
- Trazar frontend, BFF, FastAPI, repositorios, tablas, RPC/RLS y generación/envío.
- Confirmar el modelo actual de roles, permisos, usuarios y empleados.
- Definir la prioridad entre reglas de descuento de usuario, empleado y rol.
- Revisar compatibilidad con cotizaciones existentes.

### Fase 2: base de datos

- Crear catálogo tenant-aware de listas de precios.
- Crear relación producto-lista-precio.
- Crear o ajustar relaciones de permisos.
- Crear la relación explícita de límites de descuento por tipo de precio y sujeto.
- Agregar constraints, foreign keys e índices.
- Agregar columnas de snapshot de precio, descuento y precio final en líneas de
  cotización si faltan.
- Crear pruebas de aislamiento entre tenants.

### Fase 3: backend y APIs

- Implementar CRUD de listas.
- Implementar asignación y lectura de permisos.
- Extender productos con precios por lista.
- Extender cotización para aceptar lista por línea.
- Calcular y validar precios en servidor.
- Implementar consulta y administración de límites de descuento.
- Resolver y validar el límite efectivo sobre el precio de la lista seleccionada.
- Persistir snapshot histórico.
- Agregar errores consistentes y autorización en cada operación.

### Fase 4: panel

- Implementar sección de listas en `settings/account`.
- Implementar permisos de listas.
- Implementar configuración de límites por lista, `Precio base`, rol, usuario y
  empleado.
- Implementar sección de precios por lista en items.
- Extender el modal de cotización existente.
- Mantener el flujo de Embudo e Inbox.
- Cubrir estados de carga, vacío, error y éxito.

### Fase 5: cotización, PDF y envío

- Verificar que PDF, correo, WhatsApp y reenvío usen los snapshots.
- Confirmar que el nombre de la lista y el precio aplicado se muestran correctamente cuando el producto lo requiera.
- Evitar recalcular cotizaciones ya guardadas con precios actuales.

### Fase 6: validación y despliegue

- Ejecutar pruebas backend y frontend.
- Ejecutar pruebas con usuarios de distintos roles.
- Probar aislamiento entre tenants.
- Probar cambios simultáneos de permisos y precios.
- Revisar logs y errores sin información sensible.
- Aplicar migración con respaldo verificado.
- Desplegar y comprobar servicio, rutas y UI en producción.

## 9. Casos de prueba mínimos

### Listas

- Crear, editar, desactivar y eliminar una lista.
- Rechazar nombres duplicados dentro del mismo tenant.
- Permitir el mismo nombre en tenants distintos.
- Impedir eliminación cuando existan referencias históricas no compatibles.

### Productos

- Crear un producto con una lista.
- Crear un producto con varias listas.
- Editar un precio sin alterar otros.
- Verificar que un usuario sin permiso no pueda modificar precios.
- Verificar producto sin precio para una lista.

### Permisos

- Usuario con permiso de administración.
- Usuario con permiso de captura de precios.
- Usuario con permiso de uso de una sola lista.
- Usuario con varias listas autorizadas.
- Usuario sin listas autorizadas.
- Revocación de permiso antes de enviar la cotización.
- Mostrar el precio unitario como solo lectura en Embudo e Inbox.
- Rechazar una línea sin producto del catálogo.
- Rechazar un precio unitario manipulado en la petición.

### Límites de descuento

- Configurar un límite distinto para `Precio base` y para una lista específica.
- Permitir límites independientes para rol, usuario y empleado.
- Diferenciar una regla inexistente de una regla explícita de `0%`.
- Rechazar descuentos superiores al límite autorizado.
- Calcular el descuento sobre el precio de la lista seleccionada.
- Calcular el descuento sobre `catalog_items.precio_base` cuando se seleccione
  `Precio base`.
- Verificar que el precio final y el descuento guardados coincidan con el cálculo del
  servidor.
- Probar la prioridad definida cuando existan reglas para usuario, empleado y rol.
- Revocar o cambiar un límite antes de enviar una cotización y verificar la nueva
  validación.

### Cotización

- Seleccionar productos desde Embudo.
- Seleccionar productos desde Inbox.
- Usar una lista diferente por línea.
- Rechazar precio enviado manualmente que no coincida con servidor.
- Rechazar producto sin precio en la lista elegida.
- Guardar y enviar cotización con snapshot correcto.
- Cambiar después el precio del catálogo y comprobar que la cotización anterior no cambia.
- Intentar usar un ID de lista de otro tenant.

### Historial de precios

- Registrar creación del primer `Precio base`.
- Registrar modificación del `Precio base` con valor anterior, valor nuevo, usuario y fecha.
- Registrar creación y modificación de cada precio de lista con valor anterior, valor nuevo, usuario y fecha.
- Diferenciar en el historial `Precio base` y precio de una lista.
- Identificar el origen cuando el cambio provenga de panel, importación, API o proceso automático.
- No registrar un cambio cuando se guarda el mismo valor.
- Consultar el historial completo filtrando por producto, tipo de precio, lista, usuario y fechas.
- Impedir que un usuario sin permiso consulte o altere la auditoría.
- Confirmar que la eliminación o desactivación de una lista no borre el historial requerido.

## 10. Criterio de terminado

La funcionalidad estará terminada cuando:

- El tenant pueda administrar nombres de listas desde `settings/account`.
- Los permisos controlen administración, edición y uso de forma independiente.
- El tenant pueda configurar límites de descuento por lista y para `Precio base`.
- El límite efectivo se resuelva por rol, usuario o empleado y se valide en backend.
- Los usuarios autorizados puedan capturar precios por lista desde `settings/productos/items`.
- El modal existente conserve la selección de productos y permita escoger una lista por línea.
- El precio del producto sea solo lectura en cotizaciones y solo pueda cambiarse desde
  `settings/productos/items`.
- Embudo e Inbox utilicen el mismo contrato seguro de cotización.
- El backend valide tenant, permisos, producto, lista y precio.
- Las cotizaciones guarden el precio y la lista aplicados históricamente.
- Cada cambio de `Precio base` y de precios por lista quede registrado con valor anterior, valor nuevo, usuario, fecha, tipo de precio y origen.
- PDF, correo, WhatsApp y reenvío respeten esos valores.
- Existan pruebas de autorización, aislamiento multi-tenant y regresión del flujo actual.
- La migración, el despliegue y la verificación de producción estén documentados.

## 11. Decisiones pendientes antes de implementar

- Nombre técnico real de las tablas actuales de productos, cotizaciones y líneas.
- Si se manejarán monedas por tenant, producto o lista.
- Si una lista se desactiva en lugar de eliminarse cuando tiene historial.
- Si se requiere una lista predeterminada por tenant o por usuario.
- Si los permisos de empleados usan la misma identidad que usuarios o una entidad separada.
- Si la cotización debe mostrar siempre el nombre de la lista al cliente final.
- Si se permitirá editar manualmente el precio por línea con un permiso adicional.
- Si el límite se manejará únicamente como porcentaje o si en el futuro también se
  requerirá un límite monetario.

Estas decisiones deben resolverse durante la fase de descubrimiento antes de crear la migración definitiva.
