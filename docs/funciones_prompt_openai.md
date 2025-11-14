{
  "name": "set_full_name",
  "description": "Guardar o actualizar el nombre completo del contacto asociado a esta conversación.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual. Úsalo para ligar todos los datos de este lead."
      },
      "full_name": {
        "type": "string",
        "description": "Nombre completo de la persona con quien estamos hablando. Ej: 'Jorge Torre'."
      }
    },
    "required": [
      "conversacion_id",
      "full_name"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "set_email",
  "description": "Guardar o actualizar el correo electrónico del lead.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual, mismo que en las otras funciones."
      },
      "email": {
        "type": "string",
        "description": "Correo electrónico válido del contacto. Ej: 'nombre@empresa.com'."
      }
    },
    "required": [
      "conversacion_id",
      "email"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "set_phone_number",
  "description": "Guardar o actualizar el número de teléfono del lead.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual, mismo que en las otras funciones."
      },
      "phone_number": {
        "type": "string",
        "description": "Teléfono del contacto. Idealmente en formato E.164 con código de país, ej: '+52 4441302811'. Si el usuario da el número sin prefijo, asume +52 (México) y guárdalo así."
      }
    },
    "required": [
      "conversacion_id",
      "phone_number"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "set_company_name",
  "description": "Guardar o actualizar el nombre de la empresa / razón social del lead.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual, mismo que en las otras funciones."
      },
      "company_name": {
        "type": "string",
        "description": "Nombre comercial o razón social. Ej: 'DECONDOMINIOS, S.C.'."
      }
    },
    "required": [
      "conversacion_id",
      "company_name"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "close_lead",
  "description": "Cerrar y consolidar el lead al final de la calificación. Se usa cuando ya tenemos nombre, correo, teléfono y empresa confirmados. También incluye el resumen de la necesidad para el equipo comercial.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual. Sirve para asociar todo lo que se capturó antes (nombre, correo, etc.)."
      },
      "notes": {
        "type": "string",
        "description": "Resumen corto en lenguaje humano. Incluye qué hace la empresa, problema que tiene y qué espera de Tal-IA. Ej: 'Administra condominios y plazas comerciales; quiere automatizar atención a residentes y coordinación de incidencias vía WhatsApp sin saturar al personal.'"
      },
      "necesidad_proposito": {
        "type": "string",
        "description": "Intención principal del lead en una sola frase clara tipo titular. Ej: 'Automatizar gestión de incidencias y comunicación con residentes usando WhatsApp y panel centralizado.'"
      }
    },
    "required": [
      "conversacion_id",
      "notes",
      "necesidad_proposito"
    ],
    "additionalProperties": false
  }
}


> **Nota:** No existen herramientas de agenda ni de consulta de horarios disponibles; Tal-IA sólo puede recopilar datos del lead y, si aplica, enviar información por correo.


{
  "name": "send_information_email",
  "description": "Enviar al prospecto la información solicitada sobre Tal-IA cuando prefiere recibirla por correo en lugar de agendar demo.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual para registrar el seguimiento."
      },
      "email": {
        "type": "string",
        "description": "Correo de destino confirmado con el prospecto."
      },
      "full_name": {
        "type": "string",
        "description": "Nombre de la persona a quien va dirigido el correo. Opcional si ya se registró."
      },
      "company_name": {
        "type": "string",
        "description": "Nombre de la empresa o marca del prospecto para personalizar el asunto."
      },
      "summary": {
        "type": "string",
        "description": "Resumen breve (1-2 frases) sobre la necesidad u objetivo principal del lead."
      },
      "highlights": {
        "type": "array",
        "description": "Lista de beneficios concretos que quieres remarcar en el correo.",
        "items": {
          "type": "string"
        }
      },
      "resources": {
        "type": "array",
        "description": "Enlaces adicionales que quieras compartir (ej. video, ficha técnica).",
        "items": {
          "type": "object",
          "properties": {
            "label": {
              "type": "string",
              "description": "Texto que describe el recurso."
            },
            "url": {
              "type": "string",
              "description": "Enlace completo al recurso."
            }
          },
          "required": [
            "label",
            "url"
          ],
          "additionalProperties": false
        }
      }
    },
    "required": [
      "conversacion_id",
      "email",
      "full_name",
      "company_name",
      "summary",
      "highlights",
      "resources"
    ],
    "additionalProperties": false
  }
}
