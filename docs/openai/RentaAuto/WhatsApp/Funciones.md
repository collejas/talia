# Funciones · Atención WhatsApp RentaAuto

**Vector store asociada:** `Vector_store_Atencion_RentaAuto`.

Usa el `conversacion_id` proporcionado por el backend. No pidas ni inventes ese valor.

```json
{"name":"set_full_name","description":"Guardar o actualizar el nombre completo del contacto.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"full_name":{"type":"string"}},"required":["conversacion_id","full_name"],"additionalProperties":false}}
```

---

```json
{"name":"set_email","description":"Guardar o actualizar el correo del contacto.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"email":{"type":"string"}},"required":["conversacion_id","email"],"additionalProperties":false}}
```

---

```json
{"name":"set_phone_number","description":"Guardar o actualizar un número proporcionado explícitamente por el contacto.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"phone_number":{"type":"string","description":"Número preferentemente en formato E.164."}},"required":["conversacion_id","phone_number"],"additionalProperties":false}}
```

---

```json
{"name":"set_company_name","description":"Guardar la empresa o razón social proporcionada por el contacto.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"company_name":{"type":"string"}},"required":["conversacion_id","company_name"],"additionalProperties":false}}
```

---

```json
{"name":"close_lead","description":"Consolidar un lead cuando existe una necesidad comercial real. No confirma reserva ni cotización.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"notes":{"type":"string"},"necesidad_proposito":{"type":"string"}},"required":["conversacion_id","notes","necesidad_proposito"],"additionalProperties":false}}
```

---

```json
{"name":"mark_lost_negacion","description":"Marcar como perdida la oportunidad ante rechazo definitivo o baja.","strict":false,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"reason":{"type":"string"}},"required":["conversacion_id"],"additionalProperties":false}}
```

---

```json
{"name":"send_information_email","description":"Enviar por correo información aprobada y disponible para RentaAuto.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"email":{"type":"string"},"full_name":{"type":["string","null"]},"company_name":{"type":["string","null"]},"summary":{"type":["string","null"]},"highlights":{"type":["array","null"],"items":{"type":"string"}},"resources":{"type":["array","null"],"items":{"type":"object","properties":{"label":{"type":"string"},"url":{"type":"string"}},"required":["label","url"],"additionalProperties":false}}},"required":["conversacion_id","email","full_name","company_name","summary","highlights","resources"],"additionalProperties":false}}
```

---

```json
{"name":"list_demo_slots","description":"Consultar disponibilidad de agenda para una demo o conversación comercial, solo si el usuario acepta agendar.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"timezone":{"type":"string"},"start_date":{"type":"string"},"window_days":{"type":"integer","minimum":1,"maximum":60}},"required":["conversacion_id","timezone","start_date","window_days"],"additionalProperties":false}}
```

---

```json
{"name":"schedule_demo","description":"Agendar una demo virtual únicamente con un horario devuelto por list_demo_slots y elegido por el usuario.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"slot_id":{"type":"string"},"start_at":{"type":"string"},"notes":{"type":"string"}},"required":["conversacion_id","slot_id","start_at","notes"],"additionalProperties":false}}
```

---

```json
{"name":"reschedule_demo","description":"Reprogramar una demo previamente confirmada cuando el usuario solicita un cambio.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"booking_id":{"type":"string"},"start_at":{"type":"string","description":"Nuevo horario ISO 8601."},"notes":{"type":"string"}},"required":["conversacion_id","booking_id","start_at","notes"],"additionalProperties":false}}
```

---

```json
{"name":"cancel_demo","description":"Cancelar una demo confirmada cuando el usuario lo solicita.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"booking_id":{"type":"string"},"reason":{"type":"string"}},"required":["conversacion_id","booking_id","reason"],"additionalProperties":false}}
```

---

```json
{"name":"restart_conversation_cycle","description":"Registrar que el contacto abrió un nuevo tema para crear una oportunidad separada y notificar al vendedor.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"reason":{"type":"string"}},"required":["conversacion_id","reason"],"additionalProperties":false}}
```

Las funciones de agenda y reinicio solo deben publicarse si el backend de RentaAuto las tiene habilitadas. Estas definiciones documentan el contrato; no crean endpoints.
