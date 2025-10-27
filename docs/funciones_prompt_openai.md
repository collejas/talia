{
  "name": "register_lead",
  "description": "Registra en TalIA los datos del prospecto cuando ya confirmaste nombre, correo, teléfono y empresa.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "full_name": {
        "type": "string",
        "description": "Nombre completo del cliente potencial."
      },
      "email": {
        "type": "string",
        "description": "Correo electrónico validado."
      },
      "phone_number": {
        "type": "string",
        "description": "Teléfono en formato internacional."
      },
      "company_name": {
        "type": "string",
        "description": "Nombre de la empresa del prospecto."
      },
      "notes": {
        "type": "string",
        "description": "Resumen breve generado por la asistente con los puntos clave de la conversación."
      },
      "necesidad_proposito": {
        "type": "string",
        "description": "Necesidad o propósito inferido por la asistente a partir del contexto conversado."
      }
    },
    "required": [
      "full_name",
      "email",
      "phone_number",
      "company_name",
      "notes"
      "necesidad_proposito"
    ],
    "additionalProperties": false
  }
}
