# Reporte de cumplimiento del Manual Técnico PUI
## Matriz de auditoría para instituciones diversas

> Documento de trabajo orientado a auditoría interna y expediente de cumplimiento.

## 1. Resumen ejecutivo

El **Manual Técnico de la Plataforma Única de Identidad (PUI)** exige a las instituciones diversas una combinación de requisitos **legales, operativos, técnicos y de ciberseguridad** previos a la autorización de conectividad e inicio de operación productiva.

En términos prácticos, el cumplimiento integral exige:

1. **Acreditación institucional válida** en Llave MX y e.Firma vigente.  
2. **Backend propio de integración** accesible de forma segura desde Internet.  
3. **Endpoints obligatorios** implementados conforme al manual.  
4. **Consulta por CURP** y respuesta en estructuras válidas.  
5. **Bitácoras y trazabilidad** de todas las interacciones relevantes.  
6. **Pruebas SAST, DAST y SCA** con resultados libres de vulnerabilidades críticas, altas, medias y bajas.  
7. **Pruebas de conectividad, funcionalidad y seguridad** superadas en sandbox antes de producción.

### Estado real (corte 2026-04-20)

- **Cumple** (evidenciado): **SAST/DAST/SCA** por ambiente (`qa` y `productivo`) con artefactos y registro en Compliance.
- **Cumple** (implementado): endpoints inbound institucionales bajo `URL_BASE` (`/login`, `/activar-reporte`, `/activar-reporte-prueba`, `/desactivar-reporte`).
- **Parcial / No demostrado** (para “cumplimiento total” del Manual): cifrado biométrico AES-256-GCM, allowlist IP/ACL, hardening completo (headers/rate limit), tokens no reutilizables y validaciones estrictas por catálogo. La resincronización formal de reportes ya existe y el scheduler base de fase 2/3 ya corre con comparación CURP, notificación outbound y cierre de búsqueda (`/busqueda-finalizada`) en fase 2; sigue pendiente cerrar la cobertura funcional completa y las fuentes reales de prueba.

> Nota operativa: este estado se interpreta por `tenant`. El tenant maestro de Geoactiv puede tener evidencia base, pero cada tenant rentado debe conservar su propio estado y anexo regulatorio.

Roadmap para cierre: `Docs/Plan_Cierre_Manual_Tecnico_PUI.md`.

---

## 2. Criterio general de evaluación

### Escala sugerida
- **Cumple**
- **Parcial**
- **No cumple**
- **No evaluado**

### Tipos de requisito
- **Obligatorio**
- **Referencial / deseable**

---

## 3. Matriz de cumplimiento

| ID | Requisito | Tipo | Qué exige el manual | Evidencia esperada | Estatus | Notas / acción correctiva |
|---|---|---|---|---|---|---|
| 1 | Persona Moral validada en Llave MX | Obligatorio | La institución debe estar reconocida como Persona Moral para operar administrativamente con la PUI | Capturas del perfil institucional en Llave MX, constancia interna, expediente administrativo | No evaluado | Verificar alta completa y datos coincidentes |
| 2 | e.Firma vigente | Obligatorio | La e.Firma institucional debe mantenerse vigente; su pérdida puede afectar tokens y acceso | Vigencia SAT, acuse, control interno de expiración | No evaluado | Definir monitoreo preventivo de vencimiento |
| 3 | RFC con homoclave como identificador institucional | Obligatorio | Debe usarse como identificador institucional en estructuras e integración | Evidencia de payloads, documentación técnica y configuración | No evaluado | Confirmar formato uniforme en todos los flujos |
| 4 | Backend propio de integración | Obligatorio | La institución debe desarrollar un servicio backend propio como punto de integración con la PUI | Arquitectura, repositorio, documentación técnica, evidencia de despliegue | Parcial | Backend inbound está operativo; la resincronización formal de reportes ya existe y el scheduler base de fase 2/3 ya corre con comparación CURP, notificación outbound y cierre de búsqueda en fase 2, pero faltan componentes del manual (cifrado biométrico, hardening completo y cobertura funcional de pruebas). Ver `Docs/Plan_Cierre_Manual_Tecnico_PUI.md`. |
| 5 | Servicio accesible desde Internet de forma segura | Obligatorio | El backend debe estar disponible y accesible de forma segura | URL pública, pruebas HTTPS/TLS, validación externa | Parcial | TLS está activo; hardening completo (ACL/rate limit/headers) queda como pendiente de cierre. |
| 6 | Implementación de endpoints obligatorios | Obligatorio | Deben desarrollarse los endpoints definidos en la Sección 8 del manual | Swagger/OpenAPI, rutas activas, evidencias de pruebas | Parcial | Endpoints inbound implementados; faltan evidencias/implementación de componentes operativos y salientes del flujo por fases. |
| 7 | Autenticación JWT | Obligatorio | Debe implementarse conforme a las especificaciones de integración | Código, pruebas, evidencia de tokens y validación | Parcial | JWT operativo; pendiente definir/enforce “no reutilizable” y permisos finos por endpoint/acción según manual. |
| 8 | Recepción de solicitudes oficiales | Obligatorio | El sistema debe recibir solicitudes oficiales de búsqueda y eventos relacionados | Logs, pruebas funcionales, bitácoras de entrada | No evaluado | Revisar manejo de errores y reintentos |
| 9 | Consulta interna por CURP | Obligatorio | El backend debe consultar sistemas internos con base en CURP | Evidencia funcional, consultas, bitácoras y pruebas | No evaluado | Confirmar tiempos de respuesta y consistencia |
| 10 | Respuesta conforme al formato del manual | Obligatorio | Debe responderse conforme a las estructuras definidas | Payloads de ejemplo, validaciones, pruebas contractuales | No evaluado | Revisar obligatoriedad de campos y serialización |
| 11 | Inclusión de CURP e identificador de búsqueda | Obligatorio | La respuesta debe incluir al menos CURP e identificador de búsqueda según corresponda | Payloads, contratos API, pruebas unitarias | No evaluado | Verificar todos los escenarios |
| 12 | Envío de respuestas solo en escenarios permitidos | Obligatorio | No deben enviarse respuestas fuera de los supuestos definidos por la PUI | Reglas de negocio, logs, validaciones | No evaluado | Implementar guardas y auditoría |
| 13 | Bitácoras estructuradas | Obligatorio | Deben registrarse solicitudes, consultas internas y respuestas enviadas | Logs centralizados, retención, estructura JSON o equivalente | Parcial | Existe auditoría y bitácora base; ya se registran resincronizaciones, jobs de fase 2/3 y notificaciones outbound intentadas, falta cerrar correlación extremo a extremo para casos de prueba completos. |
| 14 | Trazabilidad auditable | Obligatorio | Debe poder reconstruirse el flujo de tratamiento de datos | Evidencia de correlación entre eventos, request_id, search_id | Parcial | Hay trazabilidad básica; cerrar correlación completa + evidencias en ejecución real de búsqueda histórica/continua y notificaciones outbound. |
| 15 | Prueba SAST | Obligatorio | Debe presentarse reporte SAST | Reporte oficial con fecha, alcance, URLs, herramienta, metodología | Cumple | Evidencia vigente registrada en Compliance + artefacto SARIF (CodeQL). Ver `Archivos_cumplimiento/expediente_2026-04-20_012002/`. |
| 16 | Prueba DAST | Obligatorio | Debe presentarse reporte DAST | Reporte oficial con fecha, alcance, URLs, herramienta, metodología | Cumple | Evidencia vigente de **DAST API-scan** (OpenAPI + JWT) en QA y Productivo, sin High/Medium/Low. Ver `Archivos_cumplimiento/expediente_2026-04-20_012002/`. |
| 17 | Prueba SCA | Obligatorio | Debe presentarse reporte SCA | Reporte oficial con dependencias, vulnerabilidades y versión | Cumple | Evidencia vigente pip-audit (0 vulnerabilidades) en QA y Productivo. Ver `Archivos_cumplimiento/expediente_2026-04-20_012002/`. |
| 18 | Reportes con ambiente Productivo | Obligatorio | El manual pide que se identifique el ambiente de ejecución | Reportes indicando “Productivo” | Cumple | En Compliance se registra `environment=productivo` y se adjunta artefacto por ambiente. |
| 19 | Reportes con fecha de ejecución | Obligatorio | Debe identificarse fecha exacta de ejecución | Fecha visible dentro del reporte | Cumple | En Compliance se registra `executed_at` (ISO8601) y el expediente conserva el corte. |
| 20 | Reportes con alcance, metodología y herramientas | Obligatorio | Debe detallarse cómo, con qué y sobre qué se ejecutaron las pruebas | Informe completo, portada, anexos | Cumple | En Compliance se registran `tool_name`, `tool_version`, `urls` + artefacto (SARIF/JSON/TGZ con OpenAPI). |
| 21 | URL base y endpoints libres de vulnerabilidades críticas | Obligatorio | Deben estar libres de hallazgos críticos | Reporte final limpio | Cumple | DAST API-scan: 0 High/Medium/Low; SAST/SCA sin hallazgos/vulnerabilidades reportadas en el corte. |
| 22 | URL base y endpoints libres de vulnerabilidades altas | Obligatorio | Deben estar libres de hallazgos altos | Reporte final limpio | Cumple | DAST API-scan: 0 High; SAST/SCA sin hallazgos/vulnerabilidades reportadas en el corte. |
| 23 | URL base y endpoints libres de vulnerabilidades medias | Obligatorio | Deben estar libres de hallazgos medios | Reporte final limpio | Cumple | DAST API-scan: 0 Medium; SAST/SCA sin hallazgos/vulnerabilidades reportadas en el corte. |
| 24 | URL base y endpoints libres de vulnerabilidades bajas | Obligatorio | Deben estar libres de hallazgos bajos | Reporte final limpio | Cumple | DAST API-scan: 0 Low; SAST/SCA sin hallazgos/vulnerabilidades reportadas en el corte. |
| 25 | Validaciones de seguridad aprobadas | Obligatorio | Sin validaciones de seguridad aprobadas no debe autorizarse conectividad | Acuse o validación interna/documental | No evaluado | Consolidar expediente |
| 26 | Pruebas de conectividad aprobadas | Obligatorio | Deben superarse antes de operar en producción | Evidencia de conexión exitosa y validación | No evaluado | Ejecutar en sandbox primero |
| 27 | Pruebas funcionales aprobadas | Obligatorio | Deben superarse antes de operar en producción | Casos de prueba firmados, resultados, logs | No evaluado | Formalizar set de pruebas |
| 28 | Sandbox aprobado antes de producción | Obligatorio | La transición a producción exige aprobación previa en sandbox | Evidencia de sandbox, reportes de prueba, autorización | No evaluado | No brincar directamente a productivo |
| 29 | Inicio de operación productiva solo tras validaciones | Obligatorio | El manual condiciona la operación productiva a validaciones previas superadas | Acta interna, autorización, evidencia de paso de ambiente | No evaluado | Definir criterio de go-live |
| 30 | Controles contra XSS / CSP | Obligatorio en resultado | El manual exige mitigación de vulnerabilidades comunes como XSS y CSP | Configuración de headers, pruebas y reporte limpio | No evaluado | Revisar CSP y sanitización |
| 31 | Consultas preparadas contra SQLi | Obligatorio en resultado | Debe mitigarse SQL Injection | Revisión de código, ORM seguro, pruebas | No evaluado | Auditar repositorio |
| 32 | Validación de rutas contra LFI/RFI | Obligatorio en resultado | Debe mitigarse acceso indebido por rutas | Revisión de código y pruebas | No evaluado | Validar parámetros y archivos |
| 33 | No exposición de headers o banners sensibles | Obligatorio en resultado | Debe evitarse fuga de información por headers/versiones | Headers HTTP corregidos, reporte limpio | No evaluado | Ocultar header Server y similares |
| 34 | Infraestructura mínima (IP fija, TLS 1.2+, etc.) | Referencial / deseable | El anexo la presenta como deseable y referencial, no como stack obligatorio único | Infraestructura desplegada y evidencia técnica | No evaluado | Cumplir resultado aunque cambie la tecnología |
| 35 | Stack tecnológico sugerido | Referencial / deseable | Linux, Java, .NET, Node.js, Python/FastAPI/Flask/Django como opciones referenciales | Documento técnico / arquitectura | No evaluado | La tecnología exacta puede variar |

---

## 4. Evidencia mínima que debería integrar el expediente

### Administrativa
- Constancia o evidencia de **Persona Moral** en Llave MX  
- Evidencia de **e.Firma vigente**  
- RFC con homoclave claramente documentado como identificador institucional  

### Técnica
- Documento de arquitectura del backend de integración  
- OpenAPI / Swagger o especificación de endpoints  
- Evidencia de ambiente sandbox y productivo  
- Payloads de ejemplo alineados al manual  

### Seguridad
- Reporte **SAST**
- Reporte **DAST**
- Reporte **SCA**
- Todos con:
  - fecha,
  - alcance,
  - URLs,
  - ambiente productivo,
  - herramienta,
  - metodología,
  - resultado limpio sin críticas/altas/medias/bajas

### Operación
- Logs / bitácoras de:
  - recepción de solicitudes,
  - consultas internas,
  - respuestas a la PUI
- Evidencia de correlación por identificador
- Resultados de pruebas de conectividad y funcionalidad

---

## 5. Hallazgos comunes que suelen romper el cumplimiento

- Falta de **CSP**
- Falta de **HSTS**
- Falta de **X-Content-Type-Options**
- Falta de **X-Frame-Options** o `frame-ancestors`
- Exposición del header **Server**
- Reportes DAST con hallazgos bajos o medios todavía abiertos
- Tener solo DAST y no contar con **SAST** ni **SCA**
- No documentar claramente el ambiente como **Productivo**
- No contar con trazabilidad completa entre solicitud, consulta interna y respuesta

---

## 6. Dictamen práctico de cumplimiento

### Se puede considerar “cumple” solo si:
- la institución acreditó identidad y vigencias,
- implementó backend y endpoints obligatorios,
- opera consultas por CURP y respuestas correctas,
- tiene trazabilidad suficiente,
- aprobó sandbox,
- y cuenta con **SAST + DAST + SCA limpios** y documentados.

### Se debe considerar “parcial” si:
- ya existe backend,
- ya existen endpoints,
- ya hay DAST,
- pero faltan remediaciones, SAST, SCA o validaciones formales.

### Se debe considerar “no cumple” si:
- no existe backend propio,
- no existen endpoints obligatorios,
- no hay reportes de seguridad,
- o el sistema sigue con vulnerabilidades abiertas.

---

## 7. Checklist final de auditoría

- [ ] Persona Moral validada en Llave MX  
- [ ] e.Firma vigente  
- [ ] RFC con homoclave documentado  
- [ ] Backend propio de integración desplegado  
- [ ] Endpoints obligatorios implementados  
- [ ] JWT implementado  
- [ ] Consultas por CURP operando  
- [ ] Formatos de respuesta alineados al manual  
- [ ] Respuestas solo en escenarios permitidos  
- [ ] Logs estructurados implementados  
- [ ] Trazabilidad completa  
- [ ] Reporte SAST disponible  
- [ ] Reporte DAST disponible  
- [ ] Reporte SCA disponible  
- [ ] Reportes con fecha, alcance, URLs, ambiente, herramienta y metodología  
- [ ] Cero vulnerabilidades críticas  
- [ ] Cero vulnerabilidades altas  
- [ ] Cero vulnerabilidades medias  
- [ ] Cero vulnerabilidades bajas  
- [ ] Pruebas de conectividad aprobadas  
- [ ] Pruebas funcionales aprobadas  
- [ ] Validaciones de seguridad aprobadas  
- [ ] Sandbox aprobado  
- [ ] Autorización interna para paso a producción  

---

## 8. Conclusión

El Manual Técnico PUI no pide solamente “tener una API”.  
Pide una **integración formal, auditable y segura**, con evidencia documental suficiente para demostrar:

- identidad institucional válida,
- operación correcta,
- seguridad comprobada,
- trazabilidad integral,
- y paso controlado de sandbox a producción.

El punto más duro del manual es que el expediente de seguridad debe mostrar la **URL base y los endpoints libres de vulnerabilidades críticas, altas, medias y bajas**, y que **sin esa evidencia no debería autorizarse la conectividad productiva**.

---

## 9. Uso sugerido de este archivo

Este archivo puede usarse como base para:

- auditoría interna,
- checklist de preconectividad,
- expediente de cumplimiento,
- control de pendientes técnicos,
- y seguimiento entre desarrollo, infraestructura y cumplimiento.
