# Plan para notificar citas al vendedor

1. [ ] Revisar el flujo actual de webchat: creación de contacto, asignación del lead y agendamiento de citas, incluyendo los datos que llegan al helper `webchat_notifications.notify_sales_rep`.
2. [ ] Extender la configuración y controles para usar la plantilla `cita_vendedor` (`WHATSAPP_SALES_APPOINTMENT_TEMPLATE_SID`) cuando se confirme una cita, conservando los chequeos que registran notificaciones previas.
3. [ ] Ajustar la composición de variables de plantilla para que incluya fecha, hora, modelo y ubicación en el mensaje y asegurar que el envío se registra en `sales_notifications`/logs.
4. [ ] Verificar manualmente (y con pruebas unitarias si es posible) que el envio se dispara al agendar una cita y que el vendedor recibe la plantilla correcta.
