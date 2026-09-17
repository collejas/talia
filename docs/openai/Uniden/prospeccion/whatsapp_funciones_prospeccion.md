{
  "name": "set_full_name",
  "description": "Guardar o actualizar el nombre completo del prospecto asociado a esta conversación.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string","description":"ID de la conversación actual."},"full_name":{"type":"string","description":"Nombre completo del prospecto."}},"required":["conversacion_id","full_name"],"additionalProperties":false}
}

---

{
  "name": "set_company_name",
  "description": "Guardar o actualizar la empresa o razón social del prospecto.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string","description":"ID de la conversación actual."},"company_name":{"type":"string","description":"Nombre comercial o razón social."}},"required":["conversacion_id","company_name"],"additionalProperties":false}
}

---

{
  "name": "set_email",
  "description": "Guardar o actualizar el correo electrónico del prospecto.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string","description":"ID de la conversación actual."},"email":{"type":"string","description":"Correo válido del prospecto."}},"required":["conversacion_id","email"],"additionalProperties":false}
}

---

{
  "name": "set_prospect_context",
  "description": "Guardar el contexto comercial de calificación de prospección.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string","description":"ID de la conversación actual."},"giro":{"type":"string","description":"Industria o giro del prospecto."},"necesidad_principal":{"type":"string","description":"Necesidad principal: prenda, servicio o proyecto que busca."},"volumen_mensajes_aprox":{"type":["string","null"],"description":"Cantidad o volumen aproximado si fue proporcionado."},"herramienta_actual":{"type":["string","null"],"description":"Proveedor, proceso o herramienta actual si fue proporcionado."}},"required":["conversacion_id","giro","necesidad_principal","volumen_mensajes_aprox","herramienta_actual"],"additionalProperties":false}
}

---

{
  "name": "close_lead",
  "description": "Cerrar y consolidar el lead cuando existe intención real y la política activa tiene sus campos obligatorios disponibles.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string","description":"ID de la conversación actual."},"notes":{"type":"string","description":"Resumen comercial breve de giro, necesidad y siguiente paso."},"necesidad_proposito":{"type":"string","description":"Intención principal del prospecto en una frase."}},"required":["conversacion_id","notes","necesidad_proposito"],"additionalProperties":false}
}

---

{
  "name": "mark_lost_negacion",
  "description": "Marcar como perdida la oportunidad activa ante una negación definitiva o baja.",
  "strict": false,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string","description":"Conversación activa."},"reason":{"type":"string","description":"Motivo breve, por ejemplo BAJA o no me interesa."}},"required":["conversacion_id"],"additionalProperties":false}
}

---

{
  "name": "set_opt_out",
  "description": "Registrar que el prospecto no desea recibir mensajes comerciales en el canal indicado.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string","description":"ID de conversación."},"canal":{"type":"string","description":"Canal a excluir, normalmente whatsapp."},"reason":{"type":"string","description":"Motivo informado por el prospecto."}},"required":["conversacion_id","canal","reason"],"additionalProperties":false}
}

---

{
  "name": "send_information_email",
  "description": "Enviar información comercial por correo cuando el prospecto lo solicita.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string","description":"ID de conversación."},"email":{"type":"string","description":"Correo confirmado."},"full_name":{"type":["string","null"],"description":"Nombre o null si no se conoce."},"company_name":{"type":["string","null"],"description":"Empresa o null si no se conoce."},"summary":{"type":["string","null"],"description":"Resumen de la necesidad o null."},"highlights":{"type":["array","null"],"items":{"type":"string"},"description":"Beneficios concretos a remarcar o null."},"resources":{"type":["array","null"],"items":{"type":"object","properties":{"label":{"type":"string"},"url":{"type":"string"}},"required":["label","url"],"additionalProperties":false},"description":"Enlaces adicionales o null."}},"required":["conversacion_id","email","full_name","company_name","summary","highlights","resources"],"additionalProperties":false}
}

---

{
  "name": "list_demo_slots",
  "description": "Consultar disponibilidad para ofrecer horarios de demo virtual.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"timezone":{"type":"string","description":"Zona horaria IANA del prospecto."},"start_date":{"type":"string","description":"Fecha inicial YYYY-MM-DD."},"window_days":{"type":"integer","minimum":1,"maximum":60}},"required":["conversacion_id","timezone","start_date","window_days"],"additionalProperties":false}
}

---

{
  "name": "schedule_demo",
  "description": "Confirmar una demo virtual elegida y generar la invitación. Requiere nombre y correo confirmados.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"slot_id":{"type":"string","description":"ID devuelto por list_demo_slots."},"start_at":{"type":"string","description":"Fecha/hora ISO 8601 devuelta por la agenda."},"notes":{"type":"string"},"source":{"type":["string","null"],"description":"Origen sugerido: prospeccion."},"canal":{"type":["string","null"],"description":"Canal sugerido: whatsapp."}},"required":["conversacion_id","slot_id","start_at","notes","source","canal"],"additionalProperties":false}
}

---

{
  "name": "reschedule_demo",
  "description": "Reprogramar una demo existente cuando el prospecto lo solicita.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"booking_id":{"type":"string"},"start_at":{"type":"string","description":"Nueva fecha/hora ISO 8601."},"notes":{"type":"string"}},"required":["conversacion_id","booking_id","start_at","notes"],"additionalProperties":false}
}

---

{
  "name": "cancel_demo",
  "description": "Cancelar una demo existente cuando el prospecto lo solicita.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"booking_id":{"type":"string"},"reason":{"type":"string"}},"required":["conversacion_id","booking_id","reason"],"additionalProperties":false}
}

---

{
  "name": "create_followup_task",
  "description": "Crear una tarea de seguimiento humano cuando existe interés y no hay agenda inmediata.",
  "strict": true,
  "parameters": {"type":"object","properties":{"conversacion_id":{"type":"string"},"title":{"type":"string"},"details":{"type":"string","description":"Contexto para el vendedor."},"priority":{"type":"string","description":"baja, media o alta."},"due_at":{"type":["string","null"],"description":"Fecha/hora objetivo ISO 8601 o null."}},"required":["conversacion_id","title","details","priority","due_at"],"additionalProperties":false}
}
