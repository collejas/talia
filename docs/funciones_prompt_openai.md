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
  "name": "list_demo_slots",
  "description": "Recuperar horarios disponibles para demos dentro de las próximas semanas, respetando horarios laborales y días festivos configurados.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual. Permite registrar que la consulta corresponde a este lead."
      },
      "timezone": {
        "type": "string",
        "description": "Zona horaria IANA preferida por el prospecto. Si se omite en la llamada, envía 'America/Mexico_City'."
      }
    },
    "required": ["conversacion_id", "timezone"],
    "additionalProperties": false
  }
}

---

{
  "name": "schedule_demo",
  "description": "Crear una cita de demostración para el lead actual en la agenda.",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID de la conversación en curso. Se usa para trazar la cita con el contexto del lead."
      },
      "tarjeta_id": {
        "type": "string",
        "description": "ID de la tarjeta de lead asociada a la cita."
      },
      "calendario_id": {
        "type": "string",
        "description": "Identificador del calendario donde se reservará el slot. Si no se envía, se asigna el calendario principal disponible."
      },
      "start_at": {
        "type": "string",
        "description": "Fecha y hora de inicio en formato ISO 8601 con zona horaria. Ej: '2025-02-15T16:00:00-06:00'."
      },
      "timezone": {
        "type": "string",
        "description": "Zona horaria IANA para mostrar la cita al usuario. Ej: 'America/Mexico_City'."
      },
      "provider": {
        "type": "string",
        "enum": ["hosting", "google", "caldav"],
        "description": "Proveedor del calendario donde se registrará la demo. 'caldav' representa el calendario interno de Tal-IA."
      },
      "contacto_id": {
        "type": "string",
        "description": "ID del contacto si está disponible. Se puede omitir cuando el backend lo resuelve automáticamente."
      },
      "location": {
        "type": "string",
        "description": "Ubicación física de la demo en caso de ser presencial."
      },
      "meeting_url": {
        "type": "string",
        "description": "Enlace de videollamada si ya está disponible."
      },
      "notes": {
        "type": "string",
        "description": "Notas internas sobre la demo (qué revisar, expectativas del prospecto, etc.)."
      },
      "metadata": {
        "type": "object",
        "description": "Datos adicionales libres (duración, idioma, etc.). Si el lead compartió correo, agrega `\"send_calendar_invite\": true` para que reciba la invitación automáticamente.",
        "additionalProperties": true
      },
      "reminder_status": {
        "type": "string",
        "enum": ["pendiente", "programado", "enviado", "fallido"],
        "description": "Estado inicial del recordatorio automático. Por defecto 'pendiente'."
      },
      "external_join_url": {
        "type": "string",
        "description": "URL externa generada por integraciones (Zoom, Meet) si difiere de meeting_url."
      },
      "scheduled_via": {
        "type": "string",
        "enum": ["humano", "ia", "api"],
        "description": "Canal que origina la cita. Usar 'ia' cuando la agenda la realizó Tal-IA."
      }
    },
    "required": [
      "tarjeta_id",
      "start_at",
      "timezone"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "reschedule_demo",
  "description": "Actualizar una cita existente (fecha, hora, canal, notas u otros campos).",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {
      "cita_id": {
        "type": "string",
        "description": "Identificador de la cita que se va a actualizar."
      },
      "start_at": {
        "type": "string",
        "description": "Nueva fecha y hora de inicio en formato ISO 8601 con zona horaria. Siempre acompaña este valor con `end_at`."
      },
      "end_at": {
        "type": "string",
        "description": "Nuevo fin de la demo en formato ISO 8601. Calcula este valor sumando la duración acordada al nuevo `start_at`."
      },
      "timezone": {
        "type": "string",
        "description": "Zona horaria actualizada (IANA)."
      },
      "estado": {
        "type": "string",
        "enum": ["pendiente", "confirmada", "reprogramada", "cancelada", "realizada"],
        "description": "Estado de la cita tras la actualización."
      },
      "provider": {
        "type": "string",
        "enum": ["hosting", "google", "caldav"],
        "description": "Proveedor de calendario si cambia."
      },
      "provider_event_id": {
        "type": "string",
        "description": "Nuevo identificador del evento en el proveedor externo."
      },
      "meeting_url": {
        "type": "string",
        "description": "URL de reunión actualizada."
      },
      "location": {
        "type": "string",
        "description": "Ubicación física actualizada."
      },
      "notes": {
        "type": "string",
        "description": "Notas internas actualizadas."
      },
      "metadata": {
        "type": "object",
        "description": "Metadatos adicionales. Se fusionan con los existentes por defecto. Para reenviar la invitación al reprogramar, agrega `\"send_calendar_update\": true` junto con el nuevo horario.",
        "additionalProperties": true
      },
      "remove_provider_event": {
        "type": "boolean",
        "description": "Si es true, se limpia el provider_event_id asociado a la cita."
      },
      "reminder_sent_at": {
        "type": "string",
        "description": "Marca de tiempo ISO 8601 del último recordatorio enviado."
      },
      "reminder_status": {
        "type": "string",
        "enum": ["pendiente", "programado", "enviado", "fallido"],
        "description": "Nuevo estado del recordatorio automático."
      },
      "external_join_url": {
        "type": "string",
        "description": "Enlace externo actualizado (Zoom, Meet, etc.)."
      },
      "scheduled_via": {
        "type": "string",
        "enum": ["humano", "ia", "api"],
        "description": "Origen actualizado de la cita."
      },
      "cancel_reason": {
        "type": "string",
        "description": "Motivo de cancelación si el estado cambia a 'cancelada'."
      }
    },
    "required": [
      "cita_id"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "cancel_demo",
  "description": "Cancelar una cita de demostración existente.",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {
      "cita_id": {
        "type": "string",
        "description": "Identificador de la cita que se desea cancelar."
      },
      "reason": {
        "type": "string",
        "description": "Motivo de cancelación proporcionado por el prospecto o el asesor."
      },
      "remove_provider_event": {
        "type": "boolean",
        "description": "Si es true, elimina el evento en el proveedor externo."
      }
    },
    "required": [
      "cita_id"
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
