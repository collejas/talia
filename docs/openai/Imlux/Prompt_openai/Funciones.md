{
  "name": "set_full_name",
  "description": "Guardar o actualizar el nombre completo real del contacto asociado a esta conversación. Nunca uses el nombre del perfil de WhatsApp ni placeholders como 'Visitante WhatsApp'.",
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
  "description": "Cerrar y consolidar el lead con la información útil capturada durante la conversación. Se usa para guardar avances del contacto, su necesidad y el resumen comercial, sin depender de que ya exista cita confirmada.",
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

---

{
  "name": "send_information_email",
  "description": "Enviar al prospecto la información solicitada sobre Tal-IA cuando prefiere recibirla por correo en lugar de agendar una cita.",
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
        "type": [
          "string",
          "null"
        ],
        "description": "Nombre de la persona a quien va dirigido el correo. Usa null si aún no se registró."
      },
      "company_name": {
        "type": [
          "string",
          "null"
        ],
        "description": "Nombre de la empresa o marca del prospecto para personalizar el asunto."
      },
      "summary": {
        "type": [
          "string",
          "null"
        ],
        "description": "Resumen breve (1-2 frases) sobre la necesidad u objetivo principal del lead."
      },
      "highlights": {
        "type": [
          "array"
        ],
        "description": "Lista de beneficios concretos que quieres remarcar en el correo.",
        "items": {
          "type": "string"
        }
      },
      "resources": {
        "type": [
          "array"
        ],
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
      },
      "assistant_document_ids": {
        "type": [
          "array"
        ],
        "description": "IDs de PDFs cargados en settings/email que se deben adjuntar o enviar.",
        "items": {
          "type": "string"
        }
      },
      "assistant_document_category": {
        "type": [
          "string",
          "null"
        ],
        "description": "Categoría del PDF a usar cuando el asistente no conoce el ID exacto."
      },
      "assistant_document_limit": {
        "type": [
          "integer",
          "null"
        ],
        "description": "Número máximo de PDFs a considerar en la selección."
      }
    },
    "required": [
      "conversacion_id",
      "email",
      "full_name",
      "company_name",
      "summary",
      "highlights",
      "resources",
      "assistant_document_ids",
      "assistant_document_category",
      "assistant_document_limit"
    ],
    "additionalProperties": false
  }
}

---


{
  "name": "list_assistant_documents",
  "description": "Lista los PDFs disponibles del tenant actual para elegir qué documento enviar por correo o WhatsApp.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual."
      },
      "channel_scope": {
        "type": "string",
        "enum": [
          "email",
          "whatsapp"
        ],
        "description": "Filtra los documentos por canal de uso."
      }
    },
    "required": [
      "conversacion_id",
      "channel_scope"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "send_information_package",
  "description": "Enviar un paquete de información al prospecto por uno o varios canales con PDFs reales del tenant, sin escribir ligas en el chat. Usala solo cuando el usuario pida explícitamente WhatsApp o ambos canales; si solo pide correo, usa send_information_email.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual para registrar el seguimiento."
      },
      "delivery_channels": {
        "type": "array",
        "description": "Canales por los que se debe entregar el paquete. Usa email, whatsapp o ambos.",
        "items": {
          "type": "string",
          "enum": [
            "email",
            "whatsapp"
          ]
        }
      },
      "email": {
        "type": [
          "string",
          "null"
        ],
        "description": "Correo de destino confirmado con el prospecto. Usa null si no se enviara por email."
      },
      "full_name": {
        "type": [
          "string",
          "null"
        ],
        "description": "Nombre de la persona a quien va dirigido el envío. Usa null si aún no se registró."
      },
      "company_name": {
        "type": [
          "string",
          "null"
        ],
        "description": "Nombre de la empresa o marca del prospecto para personalizar el mensaje."
      },
      "summary": {
        "type": [
          "string",
          "null"
        ],
        "description": "Resumen breve (1-2 frases) sobre la necesidad u objetivo principal del lead."
      },
      "highlights": {
        "type": [
          "array"
        ],
        "description": "Lista de beneficios concretos que quieres remarcar en el envío.",
        "items": {
          "type": "string"
        }
      },
      "resources": {
        "type": [
          "array"
        ],
        "description": "Enlaces adicionales que quieras compartir por correo; nunca inventes URLs.",
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
      },
      "assistant_document_ids": {
        "type": [
          "array"
        ],
        "description": "IDs de PDFs cargados en settings/email que se deben adjuntar o enviar.",
        "items": {
          "type": "string"
        }
      },
      "assistant_document_category": {
        "type": [
          "string",
          "null"
        ],
        "description": "Categoría del PDF a usar cuando el asistente no conoce el ID exacto."
      },
      "assistant_document_limit": {
        "type": [
          "integer",
          "null"
        ],
        "description": "Número máximo de PDFs a considerar en la selección."
      }
    },
    "required": [
      "conversacion_id",
      "delivery_channels",
      "email",
      "full_name",
      "company_name",
      "summary",
      "highlights",
      "resources",
      "assistant_document_ids",
      "assistant_document_category",
      "assistant_document_limit"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "fetch_catalog_item_details",
  "description": "Consulta productos, luminarias, modelos, familias, servicios o paquetes reales de IMLUX. Prioriza lookup SQL exacto en el catálogo del tenant y usa fallback semántico si no hay una coincidencia clara.",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {
      "organizacion_id": {
        "type": "string",
        "description": "ID de la organización actual. El backend normalmente lo resuelve desde el contexto seguro del tenant; no lo inventes."
      },
      "conversacion_id": {
        "type": "string",
        "description": "ID de la conversación activa, si el sistema lo proporciona."
      },
      "query": {
        "type": "string",
        "description": "Nombre, código, familia, modelo, servicio o descripción del producto de IMLUX que el usuario desea consultar."
      },
      "detail_level": {
        "type": "string",
        "description": "Nivel de detalle solicitado; usa el valor 'metadata' para obtener cada campo del metadata.",
        "enum": [
          "metadata",
          "overview"
        ]
      },
      "limit": {
        "type": "integer",
        "description": "Cantidad máxima de coincidencias a devolver (1-5).",
        "minimum": 1,
        "maximum": 5
      }
    },
    "required": [
      "query",
      "detail_level"
    ],
    "additionalProperties": false
  }
}
