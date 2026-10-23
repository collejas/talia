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
  "name": "set_prospect_context",
  "description": "Guardar el contexto comercial confirmado de la consulta.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"giro":{"type":"string","description":"Perfil del contacto, por ejemplo propietario de vehículo."},"necesidad_principal":{"type":"string","description":"Servicio, tipo y año del vehículo, estado y municipio si fueron confirmados."},"volumen_mensajes_aprox":{"type":["string","null"],"description":"Dato adicional confirmado o null."},"herramienta_actual":{"type":["string","null"],"description":"Proveedor o situación actual si fue indicada, o null."}},"required":["conversacion_id","giro","necesidad_principal","volumen_mensajes_aprox","herramienta_actual"],"additionalProperties":false}
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
