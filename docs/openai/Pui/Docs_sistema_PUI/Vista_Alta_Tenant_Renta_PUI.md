# Vista de alta de tenant de renta para PUI

## Objetivo

Definir cómo debe construirse la pantalla de alta de un nuevo tenant de renta dentro del dashboard PUI, de forma que:

- sea simple para operación;
- capture lo mínimo necesario para funcionar;
- permita cumplir el Manual Técnico y la Guía de Inscripción;
- mantenga la separación entre tenant maestro y tenants de renta.

## Quién puede usarla

La vista debe estar disponible solo para:

- la cuenta maestra de Geoactiv;
- soporte interno autorizado;
- eventualmente un rol operativo con permiso explícito de alta de tenants.

Los tenants normales no deben ver esta vista ni poder crear tenants nuevos.

## Formulario por pasos

La creación debe sentirse como un alta guiada, no como una pantalla técnica con todos los campos de una vez.

### Paso 1. Datos del tenant

Campos:
- razón social;
- nombre comercial;
- RFC;
- tenant_slug;
- tipo de tenant (`renta`).

Resultado esperado:
- el sistema valida unicidad del slug y formato del RFC;
- el sistema prepara el contexto base del tenant.

### Paso 2. Contacto y legal

Campos:
- contacto legal / responsable;
- correo de contacto;
- teléfono de contacto;
- folio Llave MX, si existe;
- estatus e.Firma.

Resultado esperado:
- el tenant queda listo para documentación y seguimiento;
- si faltan datos, el alta puede quedar en estado `pendiente`.

### Paso 3. Habilitación para PUI

Campos:
- IP pública o CIDR autorizado;
- webhook o callback, si aplica;
- credenciales PUI del tenant.

Resultado esperado:
- el sistema deja listo el tenant para generar o asignar URLs base;
- el tenant puede quedar en estado `en revisión` hasta completar validaciones.

### Paso 4. Revisión final

La UI debe mostrar:
- resumen de datos;
- campos faltantes;
- URLs derivadas por el sistema;
- estado final a crear (`pendiente`, `en revisión`, `activo`).

### Paso 5. Confirmación

La acción final debe:
- crear el registro;
- generar la configuración base;
- registrar auditoría;
- dejar preparado el contexto del tenant para usuarios permitidos.

## Ruta sugerida

- `/dashboard/tenants`
- `/dashboard/tenants/nuevo`
- `/dashboard/tenants/<id>`

La ruta de creación debe ser accesible desde el listado de tenants o desde un botón primario de “Nuevo tenant”.

## Principios de UX

- Pocos campos por pantalla.
- Agrupación por pasos.
- Mensajes claros de validación.
- Separar campos obligatorios de campos opcionales.
- No mezclar datos legales con secretos operativos sin una marca visual clara.

## Flujo recomendado de creación

### Paso 1. Identidad del tenant

Capturar lo mínimo para identificar al cliente:

- nombre de la razón social;
- nombre comercial;
- RFC;
- slug o código interno del tenant;
- estatus inicial;
- tipo de tenant: `renta`.

### Paso 2. Datos legales y de inscripción

Capturar la información base exigida por la Guía de Inscripción:

- Persona Moral;
- contacto legal o responsable de la cuenta;
- correo de notificación;
- teléfono de contacto;
- folio de Llave MX, si ya existe;
- estatus de e.Firma;
- estatus de inscripción PUI.

### Paso 3. Integración PUI

Capturar la configuración mínima para conectar con la PUI:

- endpoint de webhook o callback, si aplica;
- IP pública o rangos IP permitidos;
- credenciales PUI del tenant;
- notas de ambiente.

> Nota: en el modelo SaaS de Geoactiv, las URLs base por tenant normalmente se **derivan o provisionan después de crear el tenant**.  
> El usuario no debería capturarlas manualmente como requisito previo si el producto las genera a partir del `tenant_slug`, subdominio o ruta.  
> En ese caso, la vista debe mostrar una **vista previa** de las URLs generadas y permitir ajustar solo la configuración de dominio/slug cuando aplique.

### Paso 4. Seguridad y compliance

Capturar o enlazar la configuración que permita cumplir con el Manual Técnico:

- allowlist CIDR/IP;
- estado de SAST;
- estado de DAST;
- estado de SCA;
- fecha de última validación;
- vigencia de evidencias;
- observaciones de hardening;
- referencia a expediente o anexo.

### Paso 5. Revisión y alta

Antes de guardar:

- mostrar resumen legible;
- resaltar campos faltantes;
- confirmar si el tenant se crea como `pendiente`, `activo` o `en revisión`;
- generar el identificador interno del tenant.

## Campos mínimos de alta

Estos campos se separan en dos momentos:

### A) Campos obligatorios para crear el tenant

| Campo | Requerido | Fuente |
| --- | --- | --- |
| `tenant_slug` / código interno | Sí | Producto |
| razón social | Sí | Manual / Guía |
| nombre comercial | Sí | Producto |
| RFC | Sí | Guía |
| responsable o contacto legal | Sí | Guía |
| correo de contacto | Sí | Operación |
| teléfono de contacto | Sí | Operación |
| tipo de tenant (`renta`) | Sí | Producto |

### B) Campos obligatorios para habilitar la conexión PUI

| Campo | Requerido para activar | Fuente |
| --- | --- | --- |
| IP pública o CIDR autorizado | Sí | Guía / Seguridad |
| webhook o URL de prueba, si aplica | Sí | Guía / Operación |
| credenciales PUI del tenant | Sí | Manual |
| folio Llave MX | Recomendado / según proceso | Guía |
| estatus e.Firma | Recomendado / según proceso | Guía |

### C) Campos opcionales de operación

| Campo | Opcional | Comentario |
| --- | --- | --- |
| dirección fiscal | Sí | Operación/comercial |
| representante legal | Sí | Operación/comercial |
| correo de facturación | Sí | Operación/comercial |
| observaciones | Sí | Notas internas |
| nota de onboarding | Sí | Notas internas |
| fecha de activación | Sí | Derivada por sistema |
| fecha de baja o suspensión | Sí | Derivada por sistema |
| expediente documental | Sí | Referencia a documentos externos |

### D) Campos automáticos generados por el sistema

| Campo | Automático | Comentario |
| --- | --- | --- |
| UUID interno del tenant | Sí | Identificador primario |
| URL base QA | Sí | Derivada por `tenant_slug` / dominio / ruta |
| URL base Productivo | Sí | Derivada por `tenant_slug` / dominio / ruta |
| endpoints `/pui/*` del tenant | Sí | Derivados por la regla de ruteo |
| estatus inicial | Sí | Normalmente `pendiente` |
| registro de compliance vacío | Sí | Se crea al alta |
| marcas de auditoría (`created_at`, `updated_at`) | Sí | Sistema |
| secretos o placeholders de integración | Sí | Si el backend los provisiona |

## Campos opcionales o de soporte

Si la app actual captura más datos, está bien. Estos campos pueden añadirse sin romper el modelo mínimo:

- allowlist detallada por ambiente;
- llaves o referencias de secretos;
- referencia a compliance vigente;
- metadatos adicionales de inscripción;
- cualquier campo de soporte que no bloquee la creación ni la activación.

## Validaciones recomendadas

- RFC no vacío y con formato válido.
- Slug único.
- URLs HTTPS obligatorias.
- IP/CIDR válidos.
- Campos secretos nunca visibles en texto plano.
- No permitir activar `productivo` si falta evidencia mínima de seguridad.
- No permitir que un tenant normal cambie su propio tenant.

## Resultado esperado en backend

Al guardar el alta:

- se crea el registro del tenant;
- se guarda su configuración base;
- se generan o calculan las URLs base por ambiente a partir del `tenant_slug`, dominio o regla de ruteo definida;
- se generan o enlazan credenciales/secretos;
- se deja trazabilidad de quién creó el tenant y cuándo;
- se habilita la navegación y el contexto de ese tenant solo para usuarios permitidos.

## Esquema de API / BD propuesto

> Este contrato es la propuesta para implementar la vista. No existe todavía como endpoint de alta en el backend actual.

### Endpoints propuestos

- `GET /admin/tenants`
  - listado de tenants.
- `POST /admin/tenants`
  - crea un nuevo tenant de renta.
- `GET /admin/tenants/{tenant_id}`
  - detalle del tenant.
- `PATCH /admin/tenants/{tenant_id}`
  - actualiza datos del tenant.
- `POST /admin/tenants/{tenant_id}/activate`
  - activa el tenant.
- `POST /admin/tenants/{tenant_id}/suspend`
  - suspende el tenant.

### Payload propuesto para creación

```json
{
  "tenant_slug": "empresa-x",
  "tenant_type": "renta",
  "business_name": "Empresa X S.A. de C.V.",
  "trade_name": "Empresa X",
  "rfc": "XXX010101XXX",
  "legal_contact": {
    "name": "Nombre Apellido",
    "email": "contacto@empresa-x.mx",
    "phone": "5555555555"
  },
  "llave_mx_folio": "opcional",
  "efirma_status": "vigente",
  "pui_status": "pendiente",
  "security": {
    "allowed_ips": ["200.10.10.0/24"],
    "webhook_url": "https://tenant-ejemplo.mx/webhook"
  },
  "notes": "Alta inicial"
}
```

### Campos automáticos del backend

- `id` del tenant;
- `created_at` / `updated_at`;
- URLs base QA/Productivo;
- endpoints derivados por ruteo;
- estado inicial;
- marcas de auditoría;
- compliance inicial;
- secretos o placeholders de integración, si el sistema los provisiona.

### Tablas lógicas esperadas

- `tenants`
  - identidad institucional;
  - estado del tenant;
  - tenant maestro vs renta.
- `tenant_contacts`
  - contacto legal y operativo.
- `tenant_integrations`
  - URLs, webhook, credenciales y allowlist.
- `tenant_compliance`
  - SAST/DAST/SCA, vigencias y anexo documental.
- `tenant_audit_log`
  - trazabilidad de alta, cambios, activación y suspensión.

### Regla de seguridad del contrato

- solo la cuenta maestra o soporte autorizado puede crear tenants;
- los tenants normales no pueden enumerar ni modificar otros tenants;
- el backend debe generar las URLs derivadas, no aceptar valores arbitrarios si la regla de ruteo ya está definida.

## Relación con el Manual Técnico y la Guía

Esta vista no inventa requisitos nuevos. Solo organiza en UI lo que ya piden los documentos base:

- identidad institucional;
- datos para inscripción;
- URLs e IPs;
- credenciales;
- compliance;
- expediente por institución.

La diferencia entre `tenant maestro` y `tenant de renta` es de operación del producto, no de cambio del requisito regulatorio.
