{
  "name": "set_full_name",
  "description": "Guardar o actualizar el nombre confirmado del contacto.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"full_name":{"type":"string"}},"required":["conversacion_id","full_name"],"additionalProperties":false}
}

---

{
  "name": "set_phone_number",
  "description": "Guardar o actualizar el teléfono confirmado del contacto.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"phone_number":{"type":"string","description":"Teléfono; si no incluye prefijo, usar +52."}},"required":["conversacion_id","phone_number"],"additionalProperties":false}
}

---

{
  "name": "set_email",
  "description": "Guardar o actualizar el correo confirmado del contacto.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"email":{"type":"string"}},"required":["conversacion_id","email"],"additionalProperties":false}
}

---

{
  "name": "set_company_name",
  "description": "Guardar o actualizar la empresa confirmada del contacto, si aplica.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"company_name":{"type":"string"}},"required":["conversacion_id","company_name"],"additionalProperties":false}
}

---

{
  "name": "close_lead",
  "description": "Cerrar y consolidar un interesado cuando existe intención real y contexto suficiente.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"notes":{"type":"string","description":"Resumen breve de vehículo, servicio y siguiente paso."},"necesidad_proposito":{"type":"string","description":"Necesidad principal en una frase."}},"required":["conversacion_id","notes","necesidad_proposito"],"additionalProperties":false}
}

---

{
  "name": "mark_lost_negacion",
  "description": "Marcar como perdida la oportunidad ante una negación definitiva.",
  "strict": false,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"reason":{"type":"string"}},"required":["conversacion_id"],"additionalProperties":false}
}

---

{
  "name": "create_followup_task",
  "description": "Crear seguimiento humano cuando el contacto pide ayuda de un asesor.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"title":{"type":"string"},"details":{"type":"string"},"priority":{"type":"string","description":"baja, media o alta"},"due_at":{"type":["string","null"]}},"required":["conversacion_id","title","details","priority","due_at"],"additionalProperties":false}
}
---

{
  "name": "send_information_email",
  "description": "Enviar por correo la información solicitada de ANAPROMEX cuando el contacto lo pide.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {"type": "string", "description": "ID de la conversación actual."},
      "email": {"type": "string", "description": "Correo confirmado del contacto."},
      "full_name": {"type": ["string", "null"], "description": "Nombre confirmado o null."},
      "company_name": {"type": ["string", "null"], "description": "Empresa o null si no aplica."},
      "summary": {"type": ["string", "null"], "description": "Resumen breve del servicio o necesidad."},
      "highlights": {"type": ["array", "null"], "items": {"type": "string"}, "description": "Puntos concretos a incluir o null."},
      "resources": {"type": ["array", "null"], "items": {"type": "object", "properties": {"label": {"type": "string"}, "url": {"type": "string"}}, "required": ["label", "url"], "additionalProperties": false}, "description": "Enlaces autorizados o null."}
    },
    "required": ["conversacion_id", "email", "full_name", "company_name", "summary", "highlights", "resources"],
    "additionalProperties": false
  }
}
---

{
  "name": "restart_conversation_cycle",
  "description": "Registrar que el contacto inició un tema o trámite distinto y requiere una nueva oportunidad de seguimiento.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": {"type": "string", "description": "ID de la conversación actual."},
      "reason": {"type": "string", "description": "Motivo breve, por ejemplo: quiere cotizar un seguro después de consultar afiliación."}
    },
    "required": ["conversacion_id", "reason"],
    "additionalProperties": false
  }
}

