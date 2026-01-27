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
          "string"
        ],
        "description": "Nombre de la persona a quien va dirigido el correo. Opcional si ya se registró."
      },
      "company_name": {
        "type": [
          "string"
        ],
        "description": "Nombre de la empresa o marca del prospecto para personalizar el asunto."
      },
      "summary": {
        "type": [
          "string"
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

---

{
  "name": "list_demo_slots",
  "description": "Consulta la disponibilidad del calendario para preparar opciones que el prospecto verá en el webchat.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "Conversación activa asociada al lead."
      },
      "timezone": {
        "type": "string",
        "description": "Zona horaria preferida del prospecto (ej. 'America/Mexico_City')."
      },
      "start_date": {
        "type": "string",
        "description": "Fecha inicial en formato YYYY-MM-DD. Si se omite, se usa la fecha actual."
      },
      "window_days": {
        "type": "integer",
        "description": "Cantidad de días a mostrar (máximo 60).",
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
  "description": "Confirma una demo en el slot seleccionado; al ejecutarse se envía la invitación por correo y se programa el recordatorio automático.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "Conversación activa donde se registrará la cita."
      },
      "slot_id": {
        "type": "string",
        "description": "Identificador del slot devuelto por list_demo_slots."
      },
      "start_at": {
        "type": "string",
        "description": "Fecha y hora del slot en formato ISO 8601 (ej. '2025-03-18T16:00:00-06:00')."
      },
      "notes": {
        "type": "string",
        "description": "Notas opcionales que el prospecto haya mencionado."
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
  "description": "Mueve una demo confirmada a un nuevo horario; el backend rehace la invitación y actualiza recordatorios automáticamente.",
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
        "description": "Identificador de la cita confirmada."
      },
      "start_at": {
        "type": "string",
        "description": "Nuevo horario en formato ISO 8601."
      },
      "notes": {
        "type": "string",
        "description": "Notas adicionales para el seguimiento."
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
  "description": "Cancela una demo previamente confirmada.",
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
        "description": "Identificador de la cita confirmada."
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

---

{
  "name": "fetch_catalog_item_details",
  "description": "Busca en la vector store interna y retorna el registro completo con metadata de un prototipo o fraccionamiento.",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {
      "organizacion_id": {
        "type": "string",
        "description": "ID de la organización que se usa en el contexto del chat."
      },
      "conversacion_id": {
        "type": "string",
        "description": "ID de la conversación activa relacionada con la consulta."
      },
      "query": {
        "type": "string",
        "description": "Nombre del prototipo o fraccionamiento que desean conocer."
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
        "description": "Cantidad máxima de coincidencias a devolver (1-30).",
        "minimum": 1,
        "maximum": 30
      }
    },
    "required": [
      "organizacion_id",
      "query",
      "detail_level"
    ],
    "additionalProperties": false
  }
}

---

{
 "name": "list_catalog_fraccionamientos",
  "description": "Devuelve el listado de fraccionamientos activos con zona/segmento y algunos prototipos representativos.",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {
      "organizacion_id": {
        "type": "string",
        "description": "ID de la organización cuyo catálogo queremos listar."
      },
      "include_inactive": {
        "type": "boolean",
        "description": "Incluir fraccionamientos inactivos en la lista.",
        "default": false
      },
      "prototipos_limit": {
        "type": "integer",
        "description": "Cuántos prototipos representar por fraccionamiento (1-20).",
        "minimum": 1,
        "maximum": 20
      }
    },
  "required": [
    "organizacion_id"
  ],
  "additionalProperties": false
}

---

{
  "name": "list_catalog_modelos",
  "description": "Entrega la jerarquía completa de líneas, familias y modelos, junto con los tipos de propiedad disponibles.",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {
      "organizacion_id": {
        "type": "string",
        "description": "ID de la organización cuyo catálogo se está consultando."
      },
      "include_inactive": {
        "type": "boolean",
        "description": "Incluir modelos inactivos.",
        "default": false
      },
      "limit": {
        "type": "integer",
        "description": "Máximo de registros de catálogo a revisar (1-500).",
        "minimum": 1,
        "maximum": 500
      }
    },
    "required": [
      "organizacion_id"
    ],
    "additionalProperties": false
  }
}
}
