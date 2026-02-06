# MVP práctico para TalIA

Este documento describe el producto mínimo viable desde la perspectiva del cliente, sin tecnicismos. Define qué resolver, a quién sirve, qué incluye la primera versión y cómo medir si funciona.

## 1. Problema que resolvemos
- Las empresas pierden leads porque dependen de distintos canales (webchat, WhatsApp, voz) que no están conectados.
- El equipo comercial no sabe qué conversaciones requieren seguimiento ni cuáles ya están listas para vender.
- Agendar demos y recolectar datos clave es manual, toma tiempo y genera errores cuando el prospecto no responde.

## 2. Cliente objetivo
- Empresas de servicios o inmobiliarias con equipos comerciales pequeños que reciben consultas por múltiples canales.
- No tienen tiempo ni recursos para montar sistemas complejos ni contratar más personal de atención.
- Quieren que las conversaciones siempre se registren y que los datos del prospecto estén disponibles sin pedirlos dos veces.

## 3. Qué incluye el MVP
1. **Atención multicanal unificada**  
   - Un asistente que responde automáticamente en el chat de la página, en WhatsApp y por voz (Twilio) sin tener que abrir múltiples apps.
   - Cada mensaje queda almacenado para que el equipo retome la conversación desde el panel.
2. **Captura de datos relevante del cliente**  
   - El asistente identifica nombre, correo, teléfono y necesidad, y los guarda automáticamente en el CRM interno.
   - Si falta algún dato, dispara un recordatorio o reenganchamiento hasta conseguirlo.  
3. **Agenda y notificaciones**  
   - Desde el chat se muestran los horarios disponibles y se confirma una cita sin intervención humana.  
   - Se notifican al cliente y al equipo con confirmación, reprogramación o cancelación.  
4. **Panel de control sencillo**  
   - Métricas visibles: conversaciones abiertas, leads listos, tiempos de respuesta.  
   - Vista por cliente/tenant para mantener la privacidad.  
5. **Seguridad y tranquilidad**  
   - Cada tenant ve solo su información.  
   - Se guardan backups automáticos y registros de quién accedió a qué datos.

## 4. Experiencia clave para el usuario
- El cliente entra al sitio y encuentra un chat tipo asistente; escribe y recibe respuestas rápidas en su lenguaje.  
- Si el prospecto necesita una demo, pulsa “agenda una revisión” y el sistema le muestra horas disponibles.  
- El vendedor abre el panel y ya ve la conversación, los datos capturados y un botón para asignar ese lead a su usuario.

## 5. Éxito del MVP
- Métricas que confirman que el MVP funciona:
  * Aumento en leads capturados (ej. 30% más datos completos por semana).  
  * Tiempo de respuesta promedio inferior a 2 minutos.  
  * Citas agendadas automáticamente sin pedir intervención manual.
  * Feedback positivo de mínimo 2 clientes pilotos que usen el chat.

## 6. Próximos pasos cuando valide el MVP
- Añadir más canales (Instagram, Messenger) y bots específicos por vertical.  
- Extender el panel con automatizaciones (campañas, alertas).  
- Integrar reporting con Google Sheets/BI externo para el equipo comercial.

## 7. MVP específico para una inmobiliaria
1. **Inventario visual 3D y estatus accionable**  
   - El panel permite explorar las propiedades disponibles como un “mapa” 3D sencillo (pisos y unidades), identificar rápidamente qué está libre, reservado o vendido, y acceder con un clic a las opciones de “vender”, “reservar” o “apartado”.  
   - Cada unidad muestra fotos, características clave y documentos adjuntos generados en la conversación con el cliente.  
2. **Niveles de acceso e información por usuario**  
   - Administradores ven todo el inventario, métricas de ventas y campañas; vendedores sólo ven su cartera asignada y la información relevante de cada lead.  
   - Los roles se configuran desde el panel y respetan los datos sensibles (datos financieros, documentos) según permisos.  
3. **Asistente de recolección documental**  
   - TalIA guía al cliente que ya decidió comprar para que cargue todos los documentos necesarios (identificación, comprobantes, contratos) mediante pasos dentro del chat, recordatorios y validaciones básicas.  
   - El asistente marca el progreso y advierte cuando falta algún archivo antes de avanzar a la firma.  
4. **Prospección masiva y campañas**  
   - El sistema envía correos y WhatsApp automáticos para prospectos en frío, usando plantillas personalizables y gestionando bajas.  
   - Se planifican campañas de marketing con mensajes secuenciales, seguimiento de aperturas/clicks y estadísticas de conversión, integrando el inventario disponible.  
5. **Cierre y seguimiento**  
   - La acción de “reservar” o “apartado” dispara tareas al equipo (llamadas, visitas, envíos de contratos) y genera notificaciones para que los agentes sepan qué hacer en cada etapa.  
   - Los leads recorren un embudo visual en el panel, mostrando en qué fase están y qué pasos faltan para cerrar la venta.
