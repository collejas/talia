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

---

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
  "name": "list_demo_slots",
  "description": "Consulta la disponibilidad del calendario para ofrecer al cliente opciones de demo dentro de WhatsApp.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "La conversación activa donde se debe mostrar la agenda."
      },
      "timezone": {
        "type": "string",
        "description": "Zona horaria del prospecto (ej. 'America/Mexico_City') para ajustar las franjas."
      },
      "start_date": {
        "type": "string",
        "description": "Fecha inicial (YYYY-MM-DD). Si se omite, se usa el día actual."
      },
      "window_days": {
        "type": "integer",
        "description": "Número de días a mostrar (máximo 60).",
        "minimum": 1,
        "maximum": 60
      }
    },
    "required": [
      "conversacion_id",
      "timezone",
      "start_date",
      "window_days"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "schedule_demo",
  "description": "Confirma la demo elegida para que se reserve el slot y se envíe el correo/invitación automáticamente.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "Conversación activa donde se registra la cita."
      },
      "slot_id": {
        "type": "string",
        "description": "Identificador que regresó `list_demo_slots`."
      },
      "start_at": {
        "type": "string",
        "description": "Fecha y hora en formato ISO 8601 del slot elegido."
      },
      "notes": {
        "type": "string",
        "description": "Notas del prospecto que quieras guardar junto a la demo."
      }
    },
    "required": [
      "conversacion_id",
      "slot_id",
      "start_at",
      "notes"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "reschedule_demo",
  "description": "Reprograma una demo ya confirmada cuando el cliente solicita un cambio.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "La conversación vinculada con la demo."
      },
      "booking_id": {
        "type": "string",
        "description": "Identificador de la cita que se moverá."
      },
      "start_at": {
        "type": "string",
        "description": "Nuevo horario propuesto en ISO 8601."
      },
      "notes": {
        "type": "string",
        "description": "Motivo o comentarios para el cambio."
      }
    },
    "required": [
      "conversacion_id",
      "booking_id",
      "start_at",
      "notes"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "cancel_demo",
  "description": "Cancela una demo previamente confirmada cuando el prospecto lo solicita.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "Conversación activa relacionada a la cita."
      },
      "booking_id": {
        "type": "string",
        "description": "Identificador de la demo que se cancela."
      },
      "reason": {
        "type": "string",
        "description": "Motivo opcional compartido por el prospecto."
      }
    },
    "required": [
      "conversacion_id",
      "booking_id",
      "reason"
    ],
    "additionalProperties": false
  }
}
