# CREAR PLANTILLA
curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -X POST https://content.twilio.com/v1/Content \
  -H "Content-Type: application/json" \
  -d '{
    "friendly_name": "cita_vendedor",
    "language": "es",
    "types": {
      "twilio/quick-reply": {
        "actions": [{"id": "Confirmar", "title": "Confirmar"}],
        "body": "Hola {{1}}, tu cliente {{2}} tiene cita agendada:\n\n📅 Fecha: {{3}}\n🕒 Hora: {{4}}\n🏡 Modelo: {{5}}\n📍 Ubicación: {{6}}\n☎️ Contacto: {{7}}\n\nConfirma si todo está listo y, si necesitas apoyo, responde aquí.",
        "variables": {
          "1": "Nombre vendedor",
          "2": "Nombre cliente",
          "3": "Fecha",
          "4": "Hora",
          "5": "Modelo",
          "6": "Ubicación",
          "7": "Teléfono"
        }
      }
    }
  }'


# solicitar la revisión a WhatsApp
curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -X POST https://content.twilio.com/v1/Content/HHXd394ce0f5e307ad7c4a22738024b8b03/ApprovalRequests/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cita_vendedor",
    "category": "UTILITY"
  }'

# Ver aprobacion
curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -X GET https://content.twilio.com/v1/Content/HXb050f4e2816ecec00df08076b49aa4cd/ApprovalRequests

# Ver como quedo la plantilla:
curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -X GET https://content.twilio.com/v1/Content/HX1fc4edc5da0a682c6e72798a86194dd0


