{
  "name": "set_full_name",
  "description": "Guardar o actualizar el nombre completo del contacto asociado a esta conversación.",
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
  "description": "Guardar o actualizar el correo electrónico del lead.",
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
  "description": "Guardar o actualizar empresa o razón social del lead.",
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
        "description": "Nombre comercial o razón social."
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
  "description": "Guardar contexto de calificación comercial de prospección.",
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
        "description": "Industria o giro del prospecto."
      },
      "necesidad_principal": {
        "type": "string",
        "description": "Problema principal que desea resolver."
      },
      "volumen_mensajes_aprox": {
        "type": [
          "string",
          "null"
        ],
        "description": "Volumen aproximado de conversaciones/mensajes."
      },
      "herramienta_actual": {
        "type": [
          "string",
          "null"
        ],
        "description": "Sistema o proceso actual que usa para atención/ventas."
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
  "description": "Cerrar y consolidar el lead cuando ya existe calificación suficiente.",
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
        "description": "Origen conversacional. Valor esperado: 'prospeccion_whatsapp'."
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
        "description": "Lote de envío si aplica."
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
  "description": "Marca la oportunidad actual como cerrada (perdida) cuando el prospecto expresa una negación definitiva desde prospección.",
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
        "description": "Motivo breve, por ejemplo 'la plantilla fue ignorada y el usuario dijo no me interesa.'"
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
  "description": "Consultar disponibilidad para ofrecer horarios de demo.",
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
  "description": "Confirmar demo agendada.",
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
        "description": "Fecha/hora ISO 8601."
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
        "description": "Origen. Valor sugerido: 'prospeccion'."
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
  "description": "Reprogramar demo existente.",
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
        "description": "Nueva fecha/hora ISO 8601."
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
  "description": "Cancelar demo cuando el prospecto lo solicite.",
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

---

{
  "name": "send_information_email",
  "description": "Enviar resumen por correo cuando el prospecto lo prefiera antes de agendar.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID de conversación."
      },
      "email": {
        "type": "string",
        "description": "Correo destino."
      },
      "full_name": {
        "type": "string",
        "description": "Nombre del prospecto."
      },
      "company_name": {
        "type": "string",
        "description": "Empresa del prospecto."
      },
      "summary": {
        "type": "string",
        "description": "Resumen comercial corto."
      },
      "highlights": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Beneficios clave a remarcar."
      },
      "resources": {
        "type": "array",
        "description": "Recursos o enlaces adicionales.",
        "items": {
          "type": "object",
          "properties": {
            "label": { "type": "string" },
            "url": { "type": "string" }
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
  "name": "set_opt_out",
  "description": "Registrar exclusión comercial cuando el prospecto pide no recibir mensajes.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID de conversación."
      },
      "canal": {
        "type": "string",
        "description": "Canal a excluir (ej. whatsapp)."
      },
      "reason": {
        "type": "string",
        "description": "Motivo informado por el prospecto."
      }
    },
    "required": [
      "conversacion_id",
      "canal",
      "reason"
    ],
    "additionalProperties": false
  }
}

---

{
  "name": "create_followup_task",
  "description": "Crear tarea para seguimiento humano cuando hay interés sin agenda inmediata.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {
        "type": "string",
        "description": "ID de conversación."
      },
      "title": {
        "type": "string",
        "description": "Título de la tarea."
      },
      "details": {
        "type": "string",
        "description": "Contexto para el vendedor."
      },
      "priority": {
        "type": "string",
        "description": "Prioridad sugerida: baja, media o alta."
      },
      "due_at": {
        "type": [
          "string",
          "null"
        ],
        "description": "Fecha/hora objetivo en ISO 8601."
      }
    },
    "required": [
      "conversacion_id",
      "title",
      "details",
      "priority",
      "due_at"
    ],
    "additionalProperties": false
  }
}
