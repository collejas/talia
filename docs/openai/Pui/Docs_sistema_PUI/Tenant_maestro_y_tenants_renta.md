# Documento base para la construcción de la app PUI de Geoactiv y su modelo multi-tenant SaaS

## 1. Objetivo del documento

Este documento define la base normativa y técnica para construir la aplicación de integración con la Plataforma Única de Identidad (PUI), tomando como fundamento los documentos del proyecto:

* **Manual Técnico de la solución tecnológica para instituciones diversas**.
* **Guía del Sitio de Inscripción para Instituciones Diversas**.
* **Reforma legal publicada en DOF sobre la Plataforma Única de Identidad y obligaciones de consulta e interconexión**.

Además, propone cómo debe estructurarse la app para operar bajo un modelo **multi-tenant**, donde:

* **Geoactiv S.A. de C.V.** funcione como **tenant maestro** y operador de la plataforma.
* Las empresas clientes obligadas puedan **rentar la misma app**, conservando cada una su propia identidad institucional, expediente, configuración, credenciales y URL base de integración.

---

## 2. Base normativa y de negocio de la app

### 2.1. De dónde sale la necesidad de la app

La necesidad de esta aplicación no nace solo de una decisión comercial, sino de una combinación de **ley + lineamientos técnicos + proceso administrativo de inscripción**.

### 2.2. Ley

La reforma legal en materia de desaparición y fortalecimiento de búsqueda establece que la **Plataforma Única de Identidad** será una fuente primaria de consulta permanente y en tiempo real, interconectada con registros públicos y privados. También establece obligaciones para particulares que administren registros o bases de datos de personas, obligándolos a permitir la consulta inmediata para fines de búsqueda, localización e identificación. Esto da el fundamento jurídico del modelo de interconexión tecnológica con la PUI.

### 2.3. Manual Técnico

El Manual Técnico aterriza cómo debe operar esa obligación en lo técnico. Ahí se establece que la institución diversa debe:

* exponer una **URL base única**;
* implementar los endpoints institucionales estándar;
* protegerlos con **JWT**;
* usar **HTTPS/TLS**;
* mantener **bitácoras y trazabilidad**;
* realizar búsquedas por fases;
* notificar coincidencias a la PUI;
* y presentar documentación de cumplimiento de seguridad (**SAST, DAST y SCA**).

También deja claro que la institución puede usar la tecnología que mejor se adapte a sus necesidades, siempre que cumpla el manual y los requisitos de ciberseguridad.

### 2.4. Guía de inscripción

La Guía del Sitio de Inscripción explica el proceso administrativo previo a la conexión:

* cuenta Llave MX;
* perfil de Persona Moral;
* e.Firma;
* captura de datos de la institución;
* captura de IP pública y webhook;
* carga de credenciales;
* prueba de webhook;
* envío de solicitud;
* revisión por parte del Gobierno.

Esto es clave porque separa dos cosas:

1. **la institución se registra y acredita por sí misma**;
2. **la app solo funge como herramienta tecnológica / bridge**.

---

## 3. Conclusión de diseño regulatorio

De la combinación de ley, manual y guía se concluye lo siguiente:

### 3.1. La app sí puede ser una sola

No existe una obligación de que cada empresa construya software distinto desde cero. El Manual Técnico permite usar la tecnología que mejor se adapte, siempre que se cumplan los endpoints, la seguridad, la trazabilidad y la interoperabilidad.

Por lo tanto, **sí es válido que Geoactiv construya una sola plataforma SaaS** y la rente a múltiples empresas obligadas.

### 3.2. La acreditación ante PUI no es compartida

Aunque la app sea la misma, **la inscripción y la autorización son por institución**. Cada empresa cliente debe:

* registrarse con su propia Llave MX;
* acreditar su propia Persona Moral;
* usar su propio RFC;
* registrar su propia IP/webhook/URL base;
* tener su propio expediente de integración;
* obtener su propia autorización.

### 3.3. Resultado práctico

La conclusión correcta es:

* **mismo motor tecnológico**;
* **misma app base**;
* **misma arquitectura SaaS**;
* pero **una identidad regulatoria por tenant**.

### 3.4. Qué viene del manual y qué es decisión de producto

Para evitar confusiones entre obligación regulatoria y diseño comercial:

* **Obligación del manual / guía**:
  * URL base única por institución;
  * endpoints institucionales;
  * JWT, HTTPS, trazabilidad, fases, compliance;
  * inscripción y autorización por institución;
  * expediente y evidencia por cada integración.
* **Decisión de producto Geoactiv**:
  * operar una sola app SaaS;
  * organizar tenants rentados dentro de la misma plataforma;
  * resolverlos por path o slug;
  * usar un tenant maestro de referencia;
  * separar demo/sandbox, soporte y operación.

En otras palabras: el manual manda el cumplimiento; Geoactiv define cómo empaquetarlo comercial y técnicamente.

---

## 4. Modelo recomendado: tenant maestro + tenants rentados

### 4.1. Tenant maestro

El **tenant maestro** será:

**Geoactiv S.A. de C.V.**

Este tenant sirve para:

* operar la plataforma base;
* probar la integración propia de Geoactiv;
* mantener el expediente técnico maestro;
* administrar el desarrollo, seguridad y despliegue;
* servir como referencia funcional del producto.

### URL base de Geoactiv

Geoactiv puede conservar su integración así:

* `https://pui.geoactiv.mx/pui/login`
* `https://pui.geoactiv.mx/pui/activar-reporte`
* `https://pui.geoactiv.mx/pui/activar-reporte-prueba`
* `https://pui.geoactiv.mx/pui/desactivar-reporte`

En este caso, la **URL base** de Geoactiv sería:

* `https://pui.geoactiv.mx/pui`

---

### 4.2. Tenants rentados

Cada empresa cliente que rente la plataforma debe existir como un **tenant independiente dentro de la misma app**.

### Regla principal

La app es la misma, pero cada tenant debe tener:

* su propia configuración;
* su propia identidad institucional;
* su propio expediente;
* su propio webhook/base URL;
* sus propias credenciales;
* su propio histórico y trazabilidad.

### Estructura recomendada para tenants

Ejemplo:

* `https://pui.geoactiv.mx/i/acme/pui/login`
* `https://pui.geoactiv.mx/i/acme/pui/activar-reporte`
* `https://pui.geoactiv.mx/i/acme/pui/activar-reporte-prueba`
* `https://pui.geoactiv.mx/i/acme/pui/desactivar-reporte`

Otro tenant:

* `https://pui.geoactiv.mx/i/empresa-x/pui/login`
* `https://pui.geoactiv.mx/i/empresa-x/pui/activar-reporte`
* `https://pui.geoactiv.mx/i/empresa-x/pui/activar-reporte-prueba`
* `https://pui.geoactiv.mx/i/empresa-x/pui/desactivar-reporte`

Donde la **URL base** de cada tenant sería algo como:

* `https://pui.geoactiv.mx/i/acme/pui`
* `https://pui.geoactiv.mx/i/empresa-x/pui`

Esta estrategia evita tener que crear miles de subdominios y permite mantener una URL base única por institución.

### 4.3. Campo regulatorio vs implementación SaaS

El uso de rutas como `/i/{tenant_slug}/pui` es una **decisión de arquitectura SaaS** para Geoactiv.

Lo que sí exige el manual es que cada institución tenga una **URL base estable y única** con sus endpoints correspondientes. Por eso:

* el manual se cumple por la identidad del tenant;
* el path por tenant es solo la forma en que la app organiza esa identidad;
* si mañana cambiara la forma de resolver tenants, la obligación regulatoria seguiría siendo la misma.

### 4.4. Relación con la propuesta de vistas

La propuesta de interfaz extendida del producto está documentada en:

* `Docs/Vistas_Propuestas_App_PUI_Geoactiv_MultiTenant.md`

Esa propuesta separa claramente:

* vistas de operador Geoactiv (`/admin/*`);
* vistas self-service del tenant rentado (`/dashboard/perfil`, `/dashboard/institucion`, `/dashboard/inscripcion`, `/dashboard/integracion`, `/dashboard/credenciales`, `/dashboard/monitoreo`);
* vistas transversales de operación (`/dashboard/reportes`, `/dashboard/auditoria`, `/dashboard/compliance`).

La regla de negocio sigue siendo la misma: el tenant rentado solo ve y edita lo que le corresponde; URL, webhook, IP y ruteo los asigna el backend al crear el tenant.

---

## 5. Por qué esta arquitectura sí tiene sentido frente al manual y la guía

### 5.1. El manual exige URL base única, no necesariamente dominio exclusivo

El manual indica que la institución debe definir y mantener una **URL base única** y concatenar los endpoints estándar. No obliga a que cada institución tenga un dominio totalmente separado; obliga a que exista una base identificable y estable para esa institución.

Con un path por tenant, esto se cumple.

### 5.2. La guía amarra la inscripción a datos concretos

En el proceso de inscripción se capturan datos como:

* Razón Social;
* RFC;
* IP pública;
* webhook;
* credenciales.

Eso significa que cada tenant necesita una identidad propia dentro de la plataforma, aunque use el mismo software.

### 5.3. El paquete de cumplimiento no debe ser idéntico para todos

Geoactiv puede tener un **expediente base maestro**, reusable en gran parte, pero cada tenant debe tener un **anexo institucional** con:

* razón social;
* RFC;
* URL base QA;
* URL base productiva;
* IP pública reportada;
* evidencia de prueba de webhook;
* credenciales y folio;
* artefactos y validaciones aplicables a ese tenant.

---

## 6. Cómo debe construirse la app a nivel funcional

### 6.1. Un solo código fuente

Debe existir **una sola base de código** para toda la plataforma.

Eso permite:

* mantenimiento centralizado;
* despliegue más simple;
* seguridad uniforme;
* reutilización del esfuerzo de compliance;
* evolución SaaS real.

### 6.2. Resolución por tenant

La aplicación debe resolver el tenant usando el path.

Ejemplo:

* `/pui/...`  -> tenant maestro Geoactiv
* `/i/{tenant_slug}/pui/...` -> tenant rentado

### Reglas sugeridas

* Si la ruta inicia con `/pui`, se atiende con el tenant maestro.
* Si la ruta inicia con `/i/{slug}/pui`, se busca el tenant correspondiente.
* Si el tenant no existe o no está activo, se devuelve error controlado.

### 6.3. Endpoints funcionales iguales para todos

### 6.4. Alta de nuevos tenants

La vista recomendada para crear tenants de renta se documenta en:

- `Docs/Vista_Alta_Tenant_Renta_PUI.md`

Esa vista debe ser usada solo por la cuenta maestra o por soporte autorizado. Debe capturar la identidad legal, la configuración de integración PUI y la base mínima de seguridad/compliance para que el tenant pueda operar y conectarse de forma aislada.

Las URLs base por ambiente pueden ser derivadas o provisionadas por la plataforma una vez creado el tenant; no es necesario capturarlas manualmente como dato previo si el producto las genera a partir del `tenant_slug`, dominio o ruta definida.

Los endpoints estándar deben ser los mismos para todos:

* `/login`
* `/activar-reporte`
* `/activar-reporte-prueba`
* `/desactivar-reporte`

La variación no está en el nombre del endpoint, sino en la **URL base del tenant**.

---

## 7. Cómo debe construirse la app a nivel de datos

La base de datos debe ser multi-tenant desde el diseño.

### 7.1. Entidad tenant

Debe existir una tabla central de tenants, por ejemplo:

* `tenants`

Campos recomendados:

* `id`
* `slug`
* `legal_name`
* `rfc`
* `status`
* `is_master`
* `qa_base_url`
* `production_base_url`
* `public_ip_reported`
* `created_at`
* `updated_at`

### 7.2. Integración PUI por tenant

Debe existir una tabla de integración por tenant, por ejemplo:

* `tenant_pui_integrations`

Campos recomendados:

* `id`
* `tenant_id`
* `environment` (`sandbox` / `production`)
* `institution_base_url`
* `reported_public_ip`
* `pui_username`
* `institution_identifier` (RFC)
* `active`
* `authorized_at`
* `created_at`
* `updated_at`

### 7.3. Secretos por tenant

Debe mantenerse una tabla como:

* `tenant_secret_versions`

Para guardar por tenant:

* credencial técnica de login;
* claves rotadas;
* modo de cifrado;
* biométricos si después aplica una segregación adicional.

### 7.4. Datos operativos por tenant

Todas las tablas operativas deben estar asociadas al tenant:

* `integration_requests`
* `integration_request_fields`
* `pui_api_token_issuances`
* `pui_reports`
* `pui_report_phase_status`
* `pui_report_deactivations`
* futuras tablas de coincidencias y búsqueda continua

Regla: **todo registro debe poder auditarse por tenant**.

### 7.5. Campos mínimos de alta para un tenant de renta

Estos son los campos mínimos que conviene exigir en la creación de un tenant nuevo. Si la app ya captura más datos, está bien; estos son el piso operativo.

| Campo | Tipo | Obligatorio | Uso |
| --- | --- | --- | --- |
| `slug` | texto | sí | Identificador del tenant en la app |
| `legal_name` | texto | sí | Razón social |
| `rfc` | texto | sí | Identidad fiscal / institucional |
| `status` | catálogo | sí | activo, suspendido, inactivo |
| `is_master` | boolean | sí | distingue tenant maestro de rentado |
| `qa_base_url` | texto | sí | URL base de QA/sandbox |
| `production_base_url` | texto | sí | URL base productiva |
| `public_ip_reported` | texto | recomendado | IP reportada en la inscripción |
| `pui_username` | texto | sí | usuario técnico de integración |
| `integration_secret` | secreto | sí | credencial técnica cifrada |
| `authorized_at` | timestamp | recomendado | fecha de autorización |

### 7.6. Campos opcionales o de soporte

Si la app los tiene o decide capturarlos después, no contradicen el modelo:

* webhook de prueba;
* contacto técnico;
* contacto comercial;
* folio de inscripción;
* observaciones internas;
* archivos adjuntos del expediente;
* llaves o secretos adicionales por ambiente;
* biométricos o claves extra, si el caso de uso lo exige.

La regla práctica es simple: **primero cumplir lo mínimo, luego enriquecer la ficha del tenant**.

Campos útiles pero opcionales:

* folio de inscripción;
* webhook de prueba;
* observaciones internas;
* contacto técnico/comercial;
* archivos de soporte;
* biométricos o llaves adicionales si el caso lo requiere.

---

## 8. Cómo debe construirse la app a nivel de seguridad

### 8.1. Autenticación por tenant

Cada tenant debe tener:

* su propio secreto técnico;
* su propia configuración activa;
* su propio login PUI;
* su propia validación JWT;
* su propio control de acceso.

### 8.2. Aislamiento lógico

Aunque el código sea el mismo, debe existir aislamiento de datos por tenant:

* un tenant no debe ver reportes de otro;
* un token emitido para un tenant no debe operar sobre otro;
* la trazabilidad debe quedar separada;
* la bitácora y la evidencia deben quedar segregadas.

### 8.3. Compliance base + compliance por tenant

La seguridad debe manejarse en dos capas:

#### Capa 1. Plataforma base

Geoactiv mantiene:

* SAST del código común;
* SCA del stack común;
* DAST de la plataforma base;
* hardening común;
* metodología común.

#### Capa 2. Tenant específico

Para cada tenant se genera anexo con:

* URL base evaluada;
* ambiente QA y/o productivo;
* IP reportada;
* resultado de prueba de webhook;
* validaciones del tenant.

---

## 9. Cómo debe construirse la app a nivel de operación SaaS

### 9.1. Alta de un nuevo tenant

Proceso recomendado:

1. Crear tenant en sistema.
2. Generar `slug`.
3. Generar su URL base.
4. Crear integración sandbox.
5. Registrar secretos técnicos.
6. Preparar expediente institucional.
7. Acompañar al cliente en su inscripción Llave MX/PUI.
8. Registrar IP y webhook en portal PUI.
9. Ejecutar prueba de webhook.
10. Guardar evidencia.
11. Activar tenant para producción cuando sea autorizado.

### 9.2. Expedientes

#### Expediente maestro Geoactiv

Debe contener:

* arquitectura base;
* metodología de pruebas;
* reportes SAST/DAST/SCA del núcleo común;
* hardening;
* manual operativo;
* diseño multi-tenant.

#### Expediente por tenant

Debe contener:

* razón social;
* RFC;
* URL base;
* IP pública;
* folio;
* credenciales;
* evidencia de prueba de webhook;
* resultados particulares aplicables.

---

## 10. Recomendación final de arquitectura

### Sí se recomienda

* una sola app SaaS multi-tenant;
* Geoactiv como tenant maestro;
* tenants rentados por path;
* misma especificación de endpoints;
* distinta URL base por institución;
* misma base técnica con expediente maestro;
* anexo regulatorio por tenant.

### No se recomienda

* un único webhook idéntico sin distinguir tenant;
* compartir expediente “tal cual” solo cambiando razón social;
* mezclar trazabilidad entre instituciones;
* depender de subdominios manuales por cliente si el producto va a escalar mucho.

---

## 11. Frase de diseño que resume todo

**La app puente puede ser la misma para todos; la identidad regulatoria, la URL base y el expediente de integración deben ser distintos por tenant.**

---

## 12. Decisión propuesta para Geoactiv

### Tenant maestro

**Geoactiv S.A. de C.V.**

URL base:

* `https://pui.geoactiv.mx/pui`

### Tenants rentados

Ejemplo de formato:

* `https://pui.geoactiv.mx/i/{tenant_slug}/pui`

Ejemplo real:

* `https://pui.geoactiv.mx/i/acme/pui`
* `https://pui.geoactiv.mx/i/cliente-demo/pui`

Con esto:

* se conserva una sola plataforma;
* se escala sin sufrir con DNS;
* se alinea mejor con la lógica del manual y la guía;
* y se puede vender como SaaS regulado listo para integrar.
