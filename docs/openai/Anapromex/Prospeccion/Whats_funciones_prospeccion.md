{
  "name": "set_full_name",
  "description": "Guardar el nombre confirmado del prospecto.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"full_name":{"type":"string"}},"required":["conversacion_id","full_name"],"additionalProperties":false}
}

---

{
  "name": "set_company_name",
  "description": "Guardar la empresa o razón social confirmada del prospecto, si aplica.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"company_name":{"type":"string"}},"required":["conversacion_id","company_name"],"additionalProperties":false}
}

---

{
  "name": "set_email",
  "description": "Guardar el correo confirmado del prospecto.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"email":{"type":"string"}},"required":["conversacion_id","email"],"additionalProperties":false}
}

---

{
  "name": "set_phone_number",
  "description": "Guardar el teléfono confirmado del prospecto.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"phone_number":{"type":"string","description":"Teléfono; si no incluye prefijo, usar +52."}},"required":["conversacion_id","phone_number"],"additionalProperties":false}
}

---

{
  "name": "set_prospect_context",
  "description": "Guardar el contexto comercial de prospección confirmado.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"giro":{"type":"string","description":"Perfil del prospecto, por ejemplo propietario de vehículo."},"necesidad_principal":{"type":"string","description":"Servicio, tipo y año del vehículo, estado y municipio si fueron confirmados."},"volumen_mensajes_aprox":{"type":["string","null"],"description":"Dato adicional confirmado o null."},"herramienta_actual":{"type":["string","null"],"description":"Situación o proveedor actual si fue indicado, o null."}},"required":["conversacion_id","giro","necesidad_principal","volumen_mensajes_aprox","herramienta_actual"],"additionalProperties":false}
}

---

{
  "name": "close_lead",
  "description": "Consolidar el prospecto cuando existe interés real.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"notes":{"type":"string"},"necesidad_proposito":{"type":"string"}},"required":["conversacion_id","notes","necesidad_proposito"],"additionalProperties":false}
}

---

{
  "name": "mark_lost_negacion",
  "description": "Marcar como perdida la oportunidad ante rechazo definitivo.",
  "strict": false,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"reason":{"type":"string"}},"required":["conversacion_id"],"additionalProperties":false}
}

---

{
  "name": "create_followup_task",
  "description": "Crear una tarea para un asesor cuando el prospecto pide seguimiento.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"title":{"type":"string"},"details":{"type":"string"},"priority":{"type":"string"},"due_at":{"type":["string","null"]}},"required":["conversacion_id","title","details","priority","due_at"],"additionalProperties":false}
}
