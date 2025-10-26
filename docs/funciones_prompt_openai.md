{
  "name": "register_lead",
  "description": "Registra en TalIA los datos del prospecto cuando ya confirmaste nombre, correo, teléfono y empresa.",
  "strict": false,
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
        "description": "Notas adicionales relevantes."
      }
    },
    "required": [
      "full_name",
      "email",
      "phone_number",
      "company_name"
    ]
  }
}

---

{
  "name": "register_lead",
  "description": "Registrar los datos del prospecto cuando ya cuentas con correo o teléfono.",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {
      "full_name": {
        "type": "string"
      },
      "email": {
        "type": "string"
      },
      "phone_number": {
        "type": "string"
      },
      "company_name": {
        "type": "string"
      },
      "notes": {
        "type": "string"
      }
    },
    "required": []
  }
}