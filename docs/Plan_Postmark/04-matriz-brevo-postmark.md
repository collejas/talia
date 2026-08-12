# Matriz de sustitución Brevo/Postmark

Esta matriz describe qué comportamiento debe reemplazarse; no implica reutilizar la implementación de Brevo. Los servicios, tablas y contratos Postmark se crearán de forma independiente.

| Área actual | Evidencia en Talia | Sustituto objetivo | Criterio de retiro |
|---|---|---|---|
| Envío común | `backend/app/services/email.py` | Servicio Postmark nuevo y aislado | Los flujos migrados no pasan por el módulo Brevo actual |
| Envío de prospección | `prospeccion_contact_sender.py` | Postmark Broadcast/batch + worker | Todos los envíos guardan MessageID Postmark |
| API Brevo | `brevo.py`, `brevo_quota.py`, `brevo_templates.py` | `postmark.py`, servicio de cuota local, servicio de dominios/plantillas | Módulos Brevo eliminados |
| Catálogo remoto de plantillas | `/templates/brevo-catalog` | Tablas nuevas de plantillas propias y renderer de Talia | UI no llama Brevo |
| Importación de plantilla | `/templates/import-brevo` | Creación propia de plantillas y variables | No existe importador ni sincronizador Brevo |
| Cuota | `/prospeccion/contacto/brevo-quota` | `/prospeccion/contacto/email-quota` | Cuota calculada por Talia |
| Eventos | `/prospeccion/contacto/brevo/webhook` | Webhooks transaccional/broadcast Postmark | Cero webhook Brevo productivo |
| Inbound | lector IMAP y parseo Brevo | Postmark Inbound Stream/webhook | IMAP Brevo retirado |
| Métricas | `brevo_aperturas`, `brevo_clicks` | `aperturas`, `clics`, `email_eventos` | SQL y panel sin nombres de proveedor |
| Dominio remitente | configuración dispersa de remitente/SMTP | `tenant_email_domains` + Domains API | Tenant solo usa dominio propio verificado |
| Identidad del mensaje | Brevo Message-ID/metadata | Postmark `MessageID` + metadata local | Correlación end-to-end probada |
| Supresiones | eventos y lógica Brevo | tabla/servicio local + Postmark suppression | Bajas y rebotes respetados en ambos niveles |
| Plantillas locales | `prospeccion_contacto_templates` | conservar catálogo local, adaptar renderer | Variables y snapshots validados |

## Flujos que requieren revisión adicional

Aunque no todos usan Brevo directamente, deben quedar bajo la política de correo central:

- invitación de tenant;
- confirmación de cuenta;
- agenda y confirmaciones `.ics`;
- cotizaciones y propuestas;
- portal de clientes;
- herramientas de WhatsApp/webchat que fuerzan SMTP;
- lectores de buzón y respuestas entrantes.

La definición final debe indicar para cada flujo si usará Postmark transaccional, buzón SMTP del usuario o un canal no relacionado. Para cumplir “cero Brevo”, todos deben eliminar únicamente Brevo; no es obligatorio eliminar SMTP personal si el producto todavía lo necesita, pero no debe mezclarse con el servicio central sin decisión explícita.
