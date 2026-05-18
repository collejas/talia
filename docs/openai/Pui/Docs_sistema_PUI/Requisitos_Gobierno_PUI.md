# Requisitos (Gobierno / PUI) para definir estructura, flujo y UI

Fuentes (locales):
- `Ducumentacion_Base/Manual_Tecnico_Plataforma_Unica_de_Identidad_Instituciones_Diversas.pdf`
- `Ducumentacion_Base/Guia_del_Sitio_de_Inscripcion_para_Instituciones_Diversas.pdf`
- `Ducumentacion_Base/LGMDFP_ref06_16jul24.pdf`

## 1) Principios legales (operación, acceso y trazabilidad)

De la reforma/ley:
- La PUI se interconecta con bases/registros públicos y de particulares (servicios financieros, transporte, salud, telecom, educación, paquetería, seguridad social, etc.). La consulta está **limitada** a datos relacionados con la persona desaparecida y requiere Folio Único de Búsqueda (FUB) o carpeta de investigación.
- La operación debe sujetarse a principios de licitud, proporcionalidad, necesidad, finalidad y responsabilidad en el acceso/uso de información.
- Debe existir **gestión y control de accesos y trazabilidad** y se debe **conservar registro de toda búsqueda o consulta**.

Implicación para el dashboard:
- Módulo de auditoría (ya existe) + políticas internas de retención/consulta.
- Roles/permisos claros (quién consulta, quién administra, quién rota credenciales).
- Exportación/consulta de trazas por rango de fechas (para auditoría y evidencia).

## 2) Flujo operativo (qué pasa cuando se activa un reporte)

Del Manual Técnico (flujo resumido):
1. Se registra el reporte (RNPDNO) y llega a la PUI.
2. La PUI notifica a las instituciones integradas a su endpoint `/activar-reporte` (campos “id” y “curp” siempre presentes, UTF‑8).
3. La institución ejecuta búsqueda:
   - Fase 1: completar datos básicos; si aplica, notifica coincidencia (sin campos de evento).
   - Fase 2: búsqueda histórica (máximo 12 años desde fecha de desaparición; si no hay fecha, se omite); cada coincidencia se notifica.
   - Al terminar fase 2, se debe llamar `/busqueda-finalizada` (haya o no coincidencias).
   - Fase 3: búsqueda continua (periodicidad definida por la institución, recomendación “lo más frecuente posible” sin afectar desempeño) y notificar coincidencias; termina hasta baja del reporte.
4. Cuando se localiza persona, se notifica baja y se llama `/desactivar-reporte`.

Implicación para el dashboard:
- Vista “Reportes” debe reflejar estatus, fases y la trazabilidad de “qué se envió/recibió” por fase.
- Necesitamos “evidencia” (auditoría) de:
  - Activación recibida,
  - Notificaciones de coincidencia enviadas,
  - Finalización de búsqueda,
  - Desactivación recibida/procesada.

## 3) Endpoints que debe implementar la institución (integración técnica)

Del Manual Técnico:
- La institución debe definir una **URL base única** y exponer endpoints:
  - `/<URL_BASE>/login`
  - `/<URL_BASE>/activar-reporte`
  - `/<URL_BASE>/activar-reporte-prueba`
  - `/<URL_BASE>/desactivar-reporte`
- Autenticación requerida: JWT (Bearer) con expiración y validación por solicitud.
- Credenciales (usuario fijo “PUI”; clave con reglas de longitud/complexidad).

Recomendación operativa (para facilitar auditoría y evitar confusión de ambientes):
- Separar por subdominio:
  - QA/Sandbox: `https://pui-qa.geoactiv.mx/pui` (URL_BASE)
  - Productivo: `https://pui-prod.geoactiv.mx/pui` (URL_BASE)
- Las pruebas DAST (ZAP) y evidencias de compliance deben referir explícitamente el ambiente y las URLs evaluadas (URL_BASE + endpoints).

Implicación para el dashboard:
- Módulo “Integraciones” debe administrar:
  - URL base,
  - credenciales/estado,
  - pruebas (conectividad/funcional/seguridad),
  - control de IP (allowlist/ACL según aplique).

## 4) Seguridad y ciberseguridad (requisitos obligatorios)

Del Manual Técnico (resumen operativo):
- Cifrado en tránsito: HTTPS/TLS 1.2+.
- JWT con expiración obligatoria; control de acceso por endpoint/método/recurso; 401/403 sin filtrar detalles.
- Validación estricta de entradas; no 500 por payloads malformados; rechazar payload inesperado (400/422).
- Métodos HTTP no usados deshabilitados (405).
- CORS: no `Access-Control-Allow-Origin: *` en APIs autenticadas/sensibles.
- No exponer stacktraces/headers de infra/Server; hardening de headers (HSTS, CSP, etc.) cuando aplique.
- Rate limiting y controles anti‑abuso (429).
- Logs: evitar almacenar datos sensibles.
- **Requisito para conectividad**: entregar reportes SAST/DAST/SCA sobre URL base + endpoints, evidenciando cero vulnerabilidades (según severidades).

Implicación para el dashboard:
- Módulo “Seguridad/Compliance” para:
  - registrar evidencia de SAST/DAST/SCA por ambiente,
  - registrar fecha, URLs evaluadas, herramienta, resultado,
  - bloquear “activar productivo” si no hay evidencias válidas.
- La operación técnica (interconexión por API + fases + búsqueda continua) **no se sustituye** con cargas de archivos tipo Excel/CSV.

## 5) Biométricos (codificación/cifrado)

Del Manual Técnico:
- Biométricos (fotos/huellas) se envían:
  - base64 + cifrado AES‑256‑GCM con clave asignada por institución.
  - Fotos como arreglo; huellas como objeto con etiquetas definidas.
  - Omisión si no hay datos.

Implicación para el dashboard:
- Gestión de claves/rotación y estatus de validación (sin exponer material sensible en UI).
- Auditoría de eventos de “biometrics sent/received” y fallas de descifrado (sin volcar datos).

## 6) Inscripción (portal) y prueba de Webhook

De la Guía de Inscripción:
- Alta administrativa vía Llave MX (Persona Moral) y e.Firma; registro institucional con:
  - IP (IPv4) y URL de Webhook para prueba de conexión,
  - credenciales para autenticación en endpoints,
  - prueba de Webhook (éxito/falla) antes de enviar solicitud.
- Se genera folio; se debe conservar info del folio/credenciales para QA y Productivo.

Implicación para el dashboard:
- Módulo “Onboarding / Inscripción” (si lo construimos dentro de tu plataforma) o, mínimo:
  - campos para capturar/guardar “folio” y metadatos de alta,
  - estado de revisión,
  - historial de pruebas de conexión (fecha/resultado/motivo).
  - URL base y rutas por tenant derivadas automáticamente por la plataforma cuando aplique, no necesariamente capturadas a mano antes del alta.

## 7) Recomendación de estructura de módulos (UI)

Módulos “core” (alineados a los documentos):
1. Inicio (estado de sesión, tenant activo, accesos rápidos).
2. Integraciones (URL base, credenciales, pruebas, allowlist/ACL).
3. Auditoría (requests + fields, filtros, exportación, retención).
4. Reportes (listado, detalle, fases, desactivación, evidencias de notificación).
5. Seguridad/Compliance (SAST/DAST/SCA por ambiente, hardening checklist, evidencias).
6. Usuarios/Roles (gobernanza de acceso, MFA, permisos).
7. Soporte/QA (pantalla `/dashboard/qa` temporal; `/dashboard/soporte` como diagnóstico formal).
8. Sandbox / Presentación (ruta `/dashboard/demo` para walkthrough controlado).
9. Alta de tenants (ruta `/dashboard/tenants` para alta y administración de tenants de renta por la cuenta maestra).

Referencia de arquitectura de vistas:
- `Docs/Arquitectura_Vistas_Dashboard_PUI.md`
- `Docs/Vistas_Propuestas_App_PUI_Geoactiv_MultiTenant.md`

Referencia de alta de tenant:
- `Docs/Vista_Alta_Tenant_Renta_PUI.md`

Referencia de experiencia self-service del tenant normal:
- `Docs/Arquitectura_Vistas_Dashboard_PUI.md` (rutas `/dashboard/perfil` y `/dashboard/onboarding`)

La propuesta extendida además incorpora vistas de negocio/operación que conviene mantener como roadmap:
- `institucion`;
- `onboarding`;
- `inscripcion`;
- `integracion`;
- `credenciales`;
- `monitoreo`;
- `usuarios`;
- `roles`.

## 8) Modelo operativo de tenants

La plataforma se documenta y opera bajo un esquema de:

- `tenant maestro` para Geoactiv S.A. de C.V.;
- `tenants de renta` para cada institución cliente;
- aislamiento de credenciales, URL base, auditoría y compliance por tenant;
- una sola base de código SaaS, pero con expediente y configuración separados por institución.

Puntos de implementación:

- el manual exige identidad regulatoria por institución;
- el path por tenant es una decisión de producto de Geoactiv;
- la UI de administración debe limitar cambios de tenant solo a la cuenta maestra;
- la compliance de la plataforma base no sustituye el anexo documental de cada tenant rentado.
- el alta de nuevos tenants debe capturar el mínimo legal/operativo para conectar a la PUI y cumplir el Manual Técnico y la Guía de Inscripción.
