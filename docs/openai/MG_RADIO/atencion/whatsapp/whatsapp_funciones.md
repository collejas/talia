{
  "name": "set_full_name",
  "description": "Guardar o actualizar el nombre completo del contacto asociado a esta conversación de atención comercial de MG Radio.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual."
      },
      "full_name": {
        "type": "string",
        "description": "Nombre completo del prospecto."
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
  "description": "Guardar o actualizar el correo electrónico del lead de atención comercial.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual."
      },
      "email": {
        "type": "string",
        "description": "Correo del prospecto."
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
  "name": "set_company_name",
  "description": "Guardar o actualizar la empresa o razón social del lead.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual."
      },
      "company_name": {
        "type": "string",
        "description": "Nombre comercial o razón social de la empresa."
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
  "name": "set_prospect_context",
  "description": "Guardar contexto comercial de la atención para MG Radio.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual."
      },
      "giro": {
        "type": "string",
        "description": "Industria, giro o segmento del prospecto."
      },
      "necesidad_principal": {
        "type": "string",
        "description": "Necesidad principal que desea resolver."
      },
      "volumen_mensajes_aprox": {
        "type": [
          "string",
          "null"
        ],
        "description": "Volumen aproximado de campañas, piezas o solicitudes si el prospecto lo menciona."
      },
      "herramienta_actual": {
        "type": [
          "string",
          "null"
        ],
        "description": "Medio, agencia o proceso actual que usa para anunciarse."
      }
    },
    "required": [
      "conversacion_id",
      "giro",
      "necesidad_principal",
      "volumen_mensajes_aprox",
      "herramienta_actual"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "close_lead",
  "description": "Cerrar y consolidar el lead cuando ya existe suficiente contexto comercial.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID único de la conversación actual."
      },
      "notes": {
        "type": "string",
        "description": "Resumen comercial breve del caso."
      },
      "necesidad_proposito": {
        "type": "string",
        "description": "Intención principal del lead."
      },
      "source": {
        "type": [
          "string",
          "null"
        ],
        "description": "Origen conversacional. Valor esperado: 'atencion_whatsapp'."
      },
      "campana_id": {
        "type": [
          "string",
          "null"
        ],
        "description": "Campaña origen si aplica."
      },
      "batch_id": {
        "type": [
          "string",
          "null"
        ],
        "description": "Lote si aplica."
      }
    },
    "required": [
      "conversacion_id",
      "notes",
      "necesidad_proposito",
      "source",
      "campana_id",
      "batch_id"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "mark_lost_negacion",
  "description": "Marca la oportunidad como perdida cuando el prospecto expresa una negación definitiva o escribe BAJA.",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "Conversación activa que se debe cerrar."
      },
      "reason": {
        "type": "string",
        "description": "Motivo breve, por ejemplo 'BAJA' o 'no me interesa'."
      }
    },
    "required": [
      "conversacion_id"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "list_demo_slots",
  "description": "Consultar disponibilidad para ofrecer horarios de cita comercial o seguimiento.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "Conversación activa."
      },
      "timezone": {
        "type": "string",
        "description": "Zona horaria del prospecto."
      },
      "start_date": {
        "type": "string",
        "description": "Fecha inicial YYYY-MM-DD."
      },
      "window_days": {
        "type": "integer",
        "description": "Ventana de días a consultar.",
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
  "description": "Confirmar la cita comercial cuando ya se eligió horario.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "Conversación activa."
      },
      "slot_id": {
        "type": "string",
        "description": "ID de slot regresado por list_demo_slots."
      },
      "start_at": {
        "type": "string",
        "description": "Fecha y hora ISO 8601."
      },
      "notes": {
        "type": "string",
        "description": "Notas de confirmación."
      },
      "source": {
        "type": [
          "string",
          "null"
        ],
        "description": "Origen. Valor sugerido: 'atencion'."
      },
      "canal": {
        "type": [
          "string",
          "null"
        ],
        "description": "Canal. Valor sugerido: 'whatsapp'."
      }
    },
    "required": [
      "conversacion_id",
      "slot_id",
      "start_at",
      "notes",
      "source",
      "canal"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "reschedule_demo",
  "description": "Reprogramar una cita ya confirmada cuando el cliente solicita un cambio.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "Conversación activa."
      },
      "booking_id": {
        "type": "string",
        "description": "ID de cita existente."
      },
      "start_at": {
        "type": "string",
        "description": "Nueva fecha y hora ISO 8601."
      },
      "notes": {
        "type": "string",
        "description": "Motivo o comentario de cambio."
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
  "description": "Cancelar una cita ya confirmada cuando el prospecto lo solicite.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "Conversación activa."
      },
      "booking_id": {
        "type": "string",
        "description": "ID de la cita a cancelar."
      },
      "reason": {
        "type": "string",
        "description": "Motivo de cancelación."
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
