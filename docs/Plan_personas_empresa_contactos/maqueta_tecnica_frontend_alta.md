# Maqueta tecnica del frontend de alta

Fecha: 2026-04-12 (UTC)
Estado: Blueprint de implementacion

## 1. Objetivo

Definir la arquitectura tecnica del nuevo frontend de alta para:

- `personas`
- `cuentas`
- `cuenta_personas`

Este documento baja el plan funcional a una maqueta concreta de React:

- componentes
- estado
- reglas de visibilidad
- ensamblado de payload
- estrategia de implementacion

## 2. Alcance inicial

La primera version no debe rehacer toda la seccion de contactos.

Debe enfocarse en:

1. nuevo flujo de alta
2. guardado correcto al backend
3. resumen de confirmacion
4. salida estable hacia la vista de detalle o lista

Queda para una segunda etapa:

- reescribir la edicion completa
- reescribir la vista de detalle rica
- retirar todo el modal legacy

## 3. Ubicacion recomendada

## 3.1 Opcion preferida

Crear un componente nuevo, separado del modal actual:

- `frontend/panel/src/components/contactos/contact-create-flow.tsx`

Y componentes auxiliares en el mismo directorio:

- `contact-create-types.ts`
- `contact-create-utils.ts`
- `contact-create-persona-step.tsx`
- `contact-create-context-step.tsx`
- `contact-create-account-step.tsx`
- `contact-create-relation-step.tsx`
- `contact-create-extras-step.tsx`
- `contact-create-review-step.tsx`

## 3.2 Integracion inicial

El archivo actual:

- `frontend/panel/src/components/contactos/contacts-data-table.tsx`

solo debe abrir el nuevo flujo al presionar `Nuevo contacto`.

La recomendacion es:

- dejar el modal actual de edicion intacto por ahora
- reemplazar solo el alta

## 4. Modo de interfaz recomendado

Implementar una sola pantalla o modal por bloques, no un wizard rigido.

### Estructura visual

- encabezado con titulo y subtitulo
- barra de progreso ligera por bloques
- cuerpo principal con secciones dinamicas
- panel lateral o bloque final de resumen
- footer fijo con acciones

## 5. Arbol de componentes

## 5.1 Componente raiz

`ContactCreateFlow`

Responsabilidades:

- mantener el estado global del alta
- controlar reglas de visibilidad
- ensamblar payload final
- disparar guardado
- manejar estados de loading, success y error

Props sugeridas:

```ts
type ContactCreateFlowProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (result: ContactCreateResult) => void;
};
```

## 5.2 Subcomponentes

### `PersonaSection`

Responsabilidad:

- capturar identidad humana
- validar nombre y medio de contacto

### `CommercialContextSection`

Responsabilidad:

- elegir `solo_persona`, `empresa_existente`, `empresa_nueva` o `persona_fisica_actividad_empresarial`

### `AccountLookupSection`

Responsabilidad:

- buscar cuenta existente
- seleccionar una cuenta de resultados

### `AccountCreateSection`

Responsabilidad:

- capturar datos minimos de cuenta nueva

### `RelationSection`

Responsabilidad:

- capturar rol y flags de la persona dentro de la cuenta

### `ExtrasSection`

Responsabilidad:

- capturar fiscales, direccion y extras comerciales
- quedar colapsable

### `ReviewSection`

Responsabilidad:

- mostrar resumen final
- mostrar entidades a crear

### `CreateFooter`

Responsabilidad:

- acciones primarias y secundarias
- guardar solo persona
- continuar
- guardar final
- cancelar

## 6. Estado global recomendado

Usar un `useReducer`, no una cascada de muchos `useState`.

## 6.1 Tipo de estado

```ts
type CreateMode =
  | "solo_persona"
  | "empresa_existente"
  | "empresa_nueva"
  | "persona_fisica_actividad_empresarial";

type PersonaDraft = {
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  nombre_completo: string;
  correo_principal: string;
  correo_secundario: string;
  telefono_principal_e164: string;
  telefono_principal_tipo_linea: string;
  telefono_principal_extension: string;
  telefono_secundario_e164: string;
  telefono_secundario_tipo_linea: string;
  telefono_secundario_extension: string;
  puesto: string;
  area: string;
  rol_decision: string;
  origen: string;
  notas: string;
  propietario_usuario_id: string;
};

type ContextoDraft = {
  modo: CreateMode;
};

type CuentaDraft = {
  cuenta_id: string;
  nombre_comercial: string;
  razon_social: string;
  tipo_persona: "fisica" | "moral" | "";
  tipo_cuenta: string;
  rfc: string;
  industria: string;
  segmento: string;
  subindustria: string;
  sitio_web: string;
  correo_principal: string;
  correo_secundario: string;
  telefono_principal_e164: string;
  telefono_principal_tipo_linea: string;
  telefono_principal_extension: string;
  telefono_secundario_e164: string;
  telefono_secundario_tipo_linea: string;
  telefono_secundario_extension: string;
  notas: string;
};

type RelacionDraft = {
  rol_en_cuenta: string;
  puesto: string;
  es_contacto_principal: boolean;
  es_contacto_facturacion: boolean;
  es_representante_legal: boolean;
  activo: boolean;
  fecha_inicio: string;
  notas: string;
};

type ExtrasDraft = {
  uso_cfdi: string;
  forma_pago: string;
  metodo_pago: string;
  email_facturacion: string;
  pais: string;
  clave_entidad: string;
  entidad: string;
  clave_municipio: string;
  municipio: string;
  localidad: string;
  tipo_vialidad: string;
  nombre_vialidad: string;
  numero_exterior: string;
  numero_interior: string;
  codigo_postal: string;
  canal_adquisicion: string;
};

type ContactCreateState = {
  persona: PersonaDraft;
  contexto: ContextoDraft;
  cuenta: CuentaDraft;
  relacion: RelacionDraft;
  extras: ExtrasDraft;
  selectedAccountSummary: {
    id: string;
    nombre: string;
    rfc?: string | null;
  } | null;
  accountSearch: {
    query: string;
    loading: boolean;
    items: Array<{ id: string; nombre: string; rfc?: string | null }>;
    error: string | null;
  };
  ui: {
    extrasOpen: boolean;
    reviewOpen: boolean;
    saving: boolean;
    error: string | null;
    success: string | null;
  };
};
```

## 6.2 Acciones del reducer

```ts
type ContactCreateAction =
  | { type: "persona/set"; field: keyof PersonaDraft; value: string }
  | { type: "contexto/set"; modo: CreateMode }
  | { type: "cuenta/set"; field: keyof CuentaDraft; value: string }
  | { type: "relacion/set"; field: keyof RelacionDraft; value: string | boolean }
  | { type: "extras/set"; field: keyof ExtrasDraft; value: string }
  | { type: "account-search/start"; query: string }
  | { type: "account-search/success"; items: Array<{ id: string; nombre: string; rfc?: string | null }> }
  | { type: "account-search/error"; message: string }
  | { type: "account/select"; item: { id: string; nombre: string; rfc?: string | null } | null }
  | { type: "ui/toggle-extras"; value?: boolean }
  | { type: "ui/set-error"; message: string | null }
  | { type: "ui/set-success"; message: string | null }
  | { type: "ui/set-saving"; value: boolean }
  | { type: "reset" };
```

## 7. Reglas de visibilidad

## 7.1 Siempre visible

- `PersonaSection`
- resumen corto de progreso

## 7.2 Visible segun contexto

### Si `modo = solo_persona`

Visible:

- `PersonaSection`
- `ExtrasSection`
- `ReviewSection`

Oculto:

- `AccountLookupSection`
- `AccountCreateSection`
- `RelationSection`

### Si `modo = empresa_existente`

Visible:

- `PersonaSection`
- `CommercialContextSection`
- `AccountLookupSection`
- `RelationSection` solo si ya hay cuenta seleccionada
- `ExtrasSection`
- `ReviewSection`

Oculto:

- `AccountCreateSection`

### Si `modo = empresa_nueva`

Visible:

- `PersonaSection`
- `CommercialContextSection`
- `AccountCreateSection`
- `RelationSection`
- `ExtrasSection`
- `ReviewSection`

Oculto:

- `AccountLookupSection`

### Si `modo = persona_fisica_actividad_empresarial`

Visible:

- `PersonaSection`
- `CommercialContextSection`
- `AccountCreateSection`
- `RelationSection`
- `ExtrasSection`
- `ReviewSection`

Con defaults:

- `cuenta.tipo_persona = fisica`
- `cuenta.tipo_cuenta = persona_fisica_actividad_empresarial`
- `cuenta.razon_social = persona.nombre_completo`
- `relacion.rol_en_cuenta = dueno`
- `relacion.es_contacto_principal = true`
- `relacion.es_representante_legal = true`

## 8. Ensamblado de datos en frontend

## 8.1 Helper principal

Crear un helper tipo:

- `buildCreatePersonaAltaPayload(state: ContactCreateState)`

Retorno:

```ts
type CreatePersonaAltaPayload = {
  persona: Record<string, unknown>;
  contexto_comercial: Record<string, unknown>;
  cuenta: Record<string, unknown> | null;
  relacion: Record<string, unknown> | null;
  extras: Record<string, unknown>;
};
```

## 8.2 Reglas de armado

### Persona

- derivar `nombre_completo` a partir de nombre y apellidos si hace falta
- no permitir que `nombre` lleve apellidos pegados

### Cuenta

- si `modo = empresa_existente`, solo enviar `cuenta_id`
- si `modo = empresa_nueva`, enviar cuenta limpia sin vacios
- si `modo = persona_fisica_actividad_empresarial`, prellenar si faltan campos clave

### Relacion

- si no hay cuenta, enviar `null`
- si hay cuenta, enviar objeto limpio

### Extras

- enviar solo campos no vacios
- permitir subobjetos parciales

## 9. Validaciones en frontend

## 9.1 Validaciones bloque persona

- nombre requerido
- apellido paterno requerido en primera iteracion
- telefono o correo requerido
- correo valido si existe

## 9.2 Validaciones bloque cuenta

### Empresa existente

- cuenta seleccionada obligatoria

### Cuenta nueva

- `nombre_comercial` o `razon_social` requerido
- `tipo_persona` requerido

### PFAE

- `tipo_persona` fijo en `fisica`
- `tipo_cuenta` fijo en `persona_fisica_actividad_empresarial`

## 9.3 Validaciones bloque relacion

- `rol_en_cuenta` requerido si existe cuenta

## 10. Endpoints del panel recomendados

## 10.1 Nuevo endpoint del panel

Crear:

- `frontend/panel/src/app/api/personas/alta/route.ts`

Responsabilidad:

- recibir payload nuevo
- reenviarlo al endpoint backend nuevo
- manejar errores uniformes para la UI

## 10.2 Backend objetivo

- `POST /crm/personas/alta`

Mientras no exista, el endpoint del panel puede traducir temporalmente al backend actual.

## 11. Flujo de guardado

## 11.1 Secuencia

1. validar frontend
2. abrir bloque de review o resumen
3. ejecutar `POST /api/personas/alta`
4. deshabilitar acciones mientras guarda
5. recibir resultado
6. cerrar modal y navegar

## 11.2 Resultado esperado

```ts
type ContactCreateResult = {
  persona: {
    id: string;
    nombre_completo: string;
  };
  cuenta: {
    id: string;
    nombre_comercial?: string | null;
    razon_social?: string | null;
  } | null;
  relacion: {
    id?: string;
    rol_en_cuenta?: string | null;
  } | null;
  resumen: {
    modo: string;
  };
};
```

## 12. Navegacion posterior al alta

## 12.1 Primera iteracion

Opciones viables:

1. cerrar modal y refrescar lista
2. cerrar modal y abrir panel lateral de resumen
3. navegar a detalle del registro creado

## 12.2 Recomendacion

Primera iteracion:

- cerrar modal
- refrescar lista
- mostrar toast con resumen

Segunda iteracion:

- navegar a detalle de persona o cuenta

## 13. Estrategia de migracion desde el modal actual

## 13.1 No reescribir el archivo grande directamente

No conviene seguir cargando complejidad sobre:

- `contacts-data-table.tsx`

## 13.2 Estrategia recomendada

### Paso 1

Crear `ContactCreateFlow` nuevo.

### Paso 2

Conectar el boton `Nuevo contacto` a ese flujo.

### Paso 3

Mantener `Editar persona` en el flujo actual por ahora.

### Paso 4

Cuando el alta ya sea estable, rehacer edicion con las mismas entidades:

- persona
- cuenta
- relacion

## 14. Riesgos tecnicos

### Riesgo 1

Intentar adaptar el modal actual sin separacion por entidades.

Mitigacion:

- crear componente nuevo

### Riesgo 2

Seguir usando nombres de estado ligados a `contacto`.

Mitigacion:

- usar `persona`, `cuenta`, `relacion`, `extras`

### Riesgo 3

Duplicar reglas de negocio entre frontend y backend.

Mitigacion:

- frontend valida UX
- backend valida integridad
- contrato de payload como fuente compartida

## 15. Criterio de exito

La maqueta tecnica se considera lista para implementacion cuando:

- existe un componente raiz claro
- existe un estado global coherente
- las reglas de visibilidad estan definidas
- el payload final se puede construir sin ambiguedad
- el flujo nuevo pudo convivir con el legado durante la transicion historica
