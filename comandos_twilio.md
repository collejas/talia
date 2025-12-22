# CREAR PLANTILLA
curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -X POST https://content.twilio.com/v1/Content \
  -H "Content-Type: application/json" \
  -d '{
    "friendly_name": "nuevo_lead_boton_aceptar",
    "language": "es",
    "types": {
      "twilio/text": {
        "body": "👋 Hola {{1}}, tienes un nuevo lead asignado.\n\n🧑‍💼 Prospecto: {{2}}\n🏢 Empresa: {{3}}\n📝 Resumen: {{4}}\n✅ Próximo paso: {{5}}\n📞 Contacto: {{6}}\n\nSaludos, Tal-IA",
        "actions": [
          {
            "id": "boton_aceptar",
            "title": "Aceptar",
            "type": "URL"
          }
        ]
      }
    }
  }'


# solicitar la revisión a WhatsApp
curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -X POST https://content.twilio.com/v1/Content/HX651f408612e52264a3f12b772461340b/ApprovalRequests/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "name": "nuevo_lead_quick_reply",
    "category": "UTILITY"
  }'

# Ver aprobacion
curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -X GET https://content.twilio.com/v1/Content/HX464b6e47f985053d5933d0d88f8d09a1/ApprovalRequests

# Ver como quedo la plantilla:
curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -X GET https://content.twilio.com/v1/Content/HX464b6e47f985053d5933d0d88f8d09a1

