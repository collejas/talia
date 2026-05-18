# Vistas propuestas para la app PUI de Geoactiv  
## Modelo SaaS multi-tenant para sujeto obligado + operador de plataforma

## 1. Objetivo

Este documento propone las vistas que debería tener la app PUI construida por Geoactiv, considerando dos perfiles claramente distintos:

- **Geoactiv S.A. de C.V.** como **propietario, operador y tenant maestro** de la plataforma.
- **Empresas clientes** como **tenants rentados**, que usan la misma app para cumplir con su integración y operación frente a la Plataforma Única de Identidad (PUI).

La propuesta parte de la lógica normativa y operativa contenida en:

- el **Manual Técnico de la solución tecnológica para instituciones diversas**;
- la **Guía del Sitio de Inscripción para Instituciones Diversas**;
- y la **reforma legal** que da fundamento a la obligación de interconexión.

La idea central es que la app no sea solo un “webhook”, sino una **plataforma operativa de integración, trazabilidad, monitoreo y cumplimiento PUI**.

---

## 2. Principio base de diseño

La app debe cubrir, como mínimo, estas capas:

1. **Identidad institucional y configuración de integración**  
   Razón social, RFC, IP pública, URL base, webhook, credenciales, folio, sandbox y producción.

2. **Recepción y operación técnica de endpoints**  
   `/login`, `/activar-reporte`, `/activar-reporte-prueba`, `/desactivar-reporte`.

3. **Trazabilidad y auditoría**  
   Registro de solicitudes, respuestas, búsquedas, coincidencias y errores.

4. **Cumplimiento y seguridad**  
   Evidencia documental, SAST, DAST, SCA, checklist de conectividad y expediente regulatorio.

---

## 3. Vistas para Geoactiv como propietario y operador de la app

Geoactiv requiere una capa administrativa superior. No solo administra su propia integración, sino toda la operación SaaS multi-tenant.

---

### 3.1. Panel maestro
**Ruta sugerida:** `/admin`

### Objetivo
Ser la torre de control general de toda la plataforma.

### Qué debe mostrar
- total de tenants
- tenants en sandbox
- tenants en productivo
- tenants suspendidos
- última prueba webhook por tenant
- errores recientes por tenant
- reportes activos por tenant
- coincidencias enviadas hoy
- tenants con expediente incompleto
- tenants con credenciales pendientes o rotación vencida
- alertas de conectividad
- alertas de seguridad y cumplimiento

### Valor
Esta vista permite detectar de inmediato si toda la plataforma opera correctamente y qué cliente requiere atención.

---

### 3.2. Gestión de tenants
**Ruta sugerida:** `/admin/tenants`

### Objetivo
Listar y administrar todos los clientes que rentan la app.

### Qué debe mostrar
- razón social
- RFC
- slug
- estatus general
- ambiente activo
- URL base QA
- URL base productiva
- IP pública reportada
- última prueba de conexión
- último login recibido desde PUI
- último reporte activado
- último error relevante
- si tiene expediente completo
- si tiene autorización de producción

### Acciones sugeridas
- ver detalle
- editar configuración
- activar/suspender tenant
- regenerar expediente
- abrir auditoría
- abrir reportes
- abrir cumplimiento

---

### 3.3. Detalle del tenant
**Ruta sugerida:** `/admin/tenants/:id`

### Objetivo
Tener la ficha completa del tenant.

### Qué debe mostrar
- razón social
- RFC
- nombre comercial
- estatus
- tipo de tenant
- si es tenant maestro o rentado
- slug
- URL base sandbox
- URL base productiva
- IP registrada
- fecha de alta
- fecha de autorización
- credencial técnica activa
- versiones de secreto
- historial de cambios
- notas internas
- responsables operativos
- historial de pruebas
- carpeta/expediente asociado

### Módulos internos sugeridos
- resumen
- integración
- seguridad
- auditoría
- reportes
- expediente
- soporte

---

### 3.4. Integraciones
**Ruta sugerida:** `/admin/integraciones`

### Objetivo
Ver el estado técnico de todas las integraciones.

### Qué debe mostrar
- tenant
- ambiente
- URL base
- usuario PUI
- si tiene secreto activo
- si el login funciona
- si el webhook de prueba funciona
- última emisión de token
- última desactivación de reporte
- estatus operativo
- errores recientes

### Valor
Esta vista sirve para detectar problemas técnicos antes de que el cliente los note.

---

### 3.5. Auditoría central
**Ruta sugerida:** `/admin/auditoria`

### Objetivo
Centralizar la trazabilidad de todas las interacciones.

### Qué debe mostrar
- tenant
- endpoint
- método
- fecha/hora
- IP remota
- request identifier
- search id
- JWT válido o inválido
- estatus HTTP
- duración
- error resumido
- ambiente

### Filtros sugeridos
- por tenant
- por endpoint
- por rango de fechas
- por código HTTP
- por ambiente
- por request id o search id

---

### 3.6. Reportes PUI
**Ruta sugerida:** `/admin/reportes`

### Objetivo
Monitorear todos los reportes de búsqueda en la plataforma.

### Qué debe mostrar
- tenant
- id de búsqueda
- CURP
- fecha de activación
- fecha de desaparición
- estatus
- fase actual
- si hubo coincidencias
- si se notificó finalización
- si ya fue desactivado
- última actividad

### Valor
Te permite ver el volumen real de operación y validar que el motor funciona por tenant.

---

### 3.7. Cumplimiento
**Ruta sugerida:** `/admin/compliance`

### Objetivo
Administrar el expediente técnico-regulatorio.

### Qué debe mostrar
- expediente maestro Geoactiv
- expediente por tenant
- fecha de ejecución SAST
- fecha de ejecución DAST
- fecha de ejecución SCA
- URLs evaluadas
- ambiente evaluado
- hallazgos
- checklist de autorización
- evidencia descargable
- estado: completo / incompleto / en revisión

### Submódulos sugeridos
- expediente maestro
- expediente por tenant
- checklist
- evidencias
- historial documental

---

### 3.8. Monitoreo de búsqueda continua
**Ruta sugerida:** `/admin/monitoreo`

### Objetivo
Supervisar los procesos automáticos de búsqueda continua.

### Qué debe mostrar
- tenant
- reportes en fase 3
- última corrida
- próxima corrida
- errores de scheduler
- reintentos
- resincronización pendiente
- coincidencias generadas
- reportes detenidos por desactivación

---

### 3.9. Soporte
**Ruta sugerida:** `/admin/soporte`

### Objetivo
Gestionar incidencias de tenants.

### Qué debe mostrar
- tickets abiertos
- errores recientes
- tenants con prueba fallida
- tenants con credenciales faltantes
- tenants con bloqueo operativo
- observaciones regulatorias
- solicitudes de ayuda

---

### 3.10. Demo / Sandbox / QA
**Ruta sugerida:** `/admin/demo`

### Objetivo
Tener un espacio controlado para pruebas, simulaciones y onboarding interno.

### Qué debe mostrar
- payload ejemplo
- respuesta esperada
- simulación de `/activar-reporte-prueba`
- simulación de errores
- pruebas manuales de integración
- entorno controlado para validación

---

## 4. Vistas para los clientes que rentan la app

Estas vistas deben ser más simples, claras y ejecutivas. El cliente no necesita ver todo el poder interno de Geoactiv; necesita ver **qué tan listo está para cumplir y operar**.

---

### 4.1. Inicio / Resumen
**Ruta sugerida:** `/dashboard`

### Objetivo
Dar una visión ejecutiva inmediata del estado del tenant.

### Qué debe mostrar
- estatus de inscripción
- estatus de sandbox
- estatus de producción
- última prueba webhook
- URL base configurada
- IP pública reportada
- reportes activos
- coincidencias enviadas
- últimas alertas
- cumplimiento general

### Mensaje ideal
“Tu integración está operando / pendiente / en revisión.”

---

### 4.2. Mi institución
**Ruta sugerida:** `/dashboard/institucion`

### Objetivo
Mostrar los datos institucionales del sujeto obligado.

### Qué debe mostrar
- razón social
- RFC
- nombre comercial
- giro
- responsable legal
- responsable técnico
- correo de contacto
- teléfono
- estatus de la cuenta
- notas de inscripción
- historial institucional

---

### 4.3. Inscripción PUI
**Ruta sugerida:** `/dashboard/inscripcion`

### Objetivo
Acompañar al cliente en el proceso administrativo previo a producción.

### Qué debe mostrar
- checklist de Llave MX
- perfil Persona Moral
- e.Firma
- captura de IP pública
- captura de webhook
- credenciales registradas
- prueba de webhook
- folio
- estatus de revisión
- aprobado / rechazado
- observaciones
- pasos siguientes

### Valor
Convierte una guía externa del gobierno en una experiencia clara y accionable dentro de la app.

---

### 4.4. Integración
**Ruta sugerida:** `/dashboard/integracion`

### Objetivo
Mostrar la configuración técnica del tenant.

### Qué debe mostrar
- URL base del tenant
- endpoints expuestos
- ambiente actual
- IP pública registrada
- webhook
- usuario PUI
- fecha de última prueba
- estatus del login
- estatus del webhook de prueba
- botón para copiar endpoints
- resumen técnico descargable

---

### 4.5. Reportes de búsqueda
**Ruta sugerida:** `/dashboard/reportes`

### Objetivo
Listar los reportes activos y el trabajo operativo que la app realiza.

### Qué debe mostrar
- id de búsqueda
- CURP
- fecha de activación
- fecha de desaparición
- estatus
- fase actual
- si hubo coincidencias
- si ya se notificó finalización
- si ya fue desactivado
- fecha de última actividad

### Filtros sugeridos
- activos
- cerrados
- con coincidencias
- fase 1
- fase 2
- fase 3

---

### 4.6. Detalle del reporte
**Ruta sugerida:** `/dashboard/reportes/:id`

### Objetivo
Ver el expediente operativo del reporte.

### Qué debe mostrar
- id de búsqueda
- CURP
- nombre
- datos básicos recibidos
- fecha de desaparición
- fases 1, 2 y 3
- historial de consultas
- coincidencias encontradas
- notificaciones realizadas
- finalización histórica
- desactivación
- bitácora de actividad

---

### 4.7. Auditoría
**Ruta sugerida:** `/dashboard/auditoria`

### Objetivo
Dar trazabilidad al cliente sin exponerle datos globales de la plataforma.

### Qué debe mostrar
- endpoint
- fecha/hora
- request id
- search id
- estatus
- duración
- ambiente
- observaciones de error

### Filtros sugeridos
- por endpoint
- por rango de fechas
- por estatus
- por search id

---

### 4.8. Compliance / Seguridad
**Ruta sugerida:** `/dashboard/compliance`

### Objetivo
Mostrar al cliente la parte de cumplimiento aplicable a su institución.

### Qué debe mostrar
- expediente del tenant
- fecha de última validación
- evidencias disponibles
- alcance de pruebas
- URLs evaluadas
- ambiente evaluado
- checklist para autorización
- documentos descargables
- estado de cumplimiento

---

### 4.9. Credenciales
**Ruta sugerida:** `/dashboard/credenciales`

### Objetivo
Gestionar el estado de las credenciales técnicas del tenant.

### Qué debe mostrar
- usuario
- credencial activa
- versión
- fecha de alta
- historial de rotación
- advertencias
- notas de uso
- estado del secreto

---

### 4.10. Monitoreo
**Ruta sugerida:** `/dashboard/monitoreo`

### Objetivo
Permitir al cliente ver si la búsqueda continua está funcionando.

### Qué debe mostrar
- procesos activos
- última corrida
- próxima corrida
- coincidencias nuevas
- errores recientes
- reportes pendientes
- resincronización pendiente

### 4.11. Onboarding
**Ruta sugerida:** `/dashboard/onboarding`

### Objetivo
Dar al tenant una vista simple de alta técnica y documental antes de operar en producción.

### Qué debe mostrar
- folio de alta o registro
- URLs asignadas por ambiente
- IP/webhook autorizados
- estado de Llave MX/e.Firma
- checklist de compliance por ambiente
- estado "listo para prod"

---

## 5. Backlog operativo por vista

La propuesta anterior es amplia; para llevarla a ejecución conviene priorizar por valor regulatorio y por impacto en operación.

Estado actual:
- `/dashboard/institucion`, `/dashboard/inscripcion` y `/dashboard/credenciales` ya quedaron materializadas en el frontend como la primera oleada de vistas self-service del tenant normal.
- `/dashboard/onboarding` también quedó materializada como resumen de alta técnica y documental.
- `/dashboard/monitoreo` también quedó materializada como resumen operativo simple del tenant normal.
- `/dashboard/usuarios` y `/dashboard/roles` también quedaron materializadas como vistas de consulta simple del tenant normal.
- El resto del backlog conserva el orden de evolución recomendado.

### Prioridad 1. Vistas esenciales para tenant rentado
1. `/dashboard/institucion`
2. `/dashboard/onboarding`
3. `/dashboard/inscripcion`
4. `/dashboard/integracion`
5. `/dashboard/credenciales`

Objetivo:
- dejar al cliente ver y editar su identidad institucional;
- completar onboarding PUI;
- exhibir configuración técnica sin exponer secretos;
- administrar credenciales y su estado.

### Prioridad 2. Vistas de operación cotidiana
1. `/dashboard/reportes`
2. `/dashboard/reportes/:id`
3. `/dashboard/auditoria`

Objetivo:
- operar casos;
- ver trazabilidad;
- filtrar y revisar eventos sin saturar al usuario.

### Prioridad 3. Vistas de seguimiento y control
1. `/dashboard/monitoreo`
2. `/dashboard/compliance`
3. `/dashboard/usuarios`
4. `/dashboard/roles`

Objetivo:
- ver salud de procesos;
- revisar cumplimiento;
- administrar acceso con roles claros.

### Prioridad 4. Vistas de operador Geoactiv
1. `/admin`
2. `/admin/tenants`
3. `/admin/soporte`
4. `/admin/demo`

Objetivo:
- administrar toda la plataforma;
- dar soporte;
- validar demo/sandbox;
- mantener el control maestro sin mezclarlo con la experiencia del tenant rentado.

---

### 4.11. Soporte
**Ruta sugerida:** `/dashboard/soporte`

### Objetivo
Dar acceso a ayuda operativa y documentación útil.

### Qué debe mostrar
- errores comunes
- guía de inscripción
- glosario
- preguntas frecuentes
- contacto de soporte
- tickets
- estatus de atención

---

## 5. Vistas mínimas recomendadas para la primera versión

Si se quiere lanzar una primera versión útil, comercializable y aterrizada, estas serían las prioritarias.

---

### 5.1. Para Geoactiv
- `/admin`
- `/admin/tenants`
- `/admin/tenants/:id`
- `/admin/auditoria`
- `/admin/compliance`

---

### 5.2. Para el cliente
- `/dashboard`
- `/dashboard/inscripcion`
- `/dashboard/integracion`
- `/dashboard/reportes`
- `/dashboard/reportes/:id`

---

## 6. Recomendación de producto

La plataforma no debe venderse como “una app técnica con endpoints”.

Debe venderse como:

**Plataforma de integración, trazabilidad y cumplimiento PUI para sujetos obligados.**

Eso eleva el valor del producto, porque no solo resuelve la conexión, sino también:

- la operación;
- la evidencia;
- la trazabilidad;
- el expediente;
- y la administración regulatoria por tenant.

---

## 7. Sitemap propuesto

## Lado Geoactiv
- `/admin`
- `/admin/tenants`
- `/admin/tenants/:id`
- `/admin/integraciones`
- `/admin/auditoria`
- `/admin/reportes`
- `/admin/compliance`
- `/admin/monitoreo`
- `/admin/soporte`
- `/admin/demo`

## Lado cliente
- `/dashboard`
- `/dashboard/institucion`
- `/dashboard/inscripcion`
- `/dashboard/integracion`
- `/dashboard/reportes`
- `/dashboard/reportes/:id`
- `/dashboard/auditoria`
- `/dashboard/compliance`
- `/dashboard/credenciales`
- `/dashboard/monitoreo`
- `/dashboard/soporte`

---

## 8. Frase final de diseño

**La app del sujeto obligado no debe limitarse a recibir endpoints; debe convertirse en una plataforma completa de integración, operación, auditoría y cumplimiento PUI, con una capa maestra para Geoactiv y una capa clara y accionable para cada tenant que rente la misma app.**
