# Funciones · Prospección RentaAuto

**Vector store asociada:** `Vector_store_Pros_RentaAuto`.

Todas las funciones reciben el `conversacion_id` entregado por el backend. Nunca debe pedirse ni inventarse. Estas definiciones deben alinearse con las funciones realmente habilitadas para el tenant.

```json
{"name":"set_full_name","description":"Guardar o actualizar el nombre completo proporcionado por el contacto.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"full_name":{"type":"string","description":"Nombre completo confirmado por el contacto."}},"required":["conversacion_id","full_name"],"additionalProperties":false}}
```

---

```json
{"name":"set_email","description":"Guardar o actualizar el correo proporcionado por el contacto.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"email":{"type":"string","description":"Correo válido del contacto."}},"required":["conversacion_id","email"],"additionalProperties":false}}
```

---

```json
{"name":"set_company_name","description":"Guardar la empresa o razón social cuando el contacto la proporciona.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"company_name":{"type":"string","description":"Empresa o razón social confirmada."}},"required":["conversacion_id","company_name"],"additionalProperties":false}}
```

---

```json
{"name":"set_prospect_context","description":"Guardar el contexto comercial de la necesidad de movilidad o transporte.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"giro":{"type":"string","description":"Giro o actividad del prospecto."},"necesidad_principal":{"type":"string","description":"Necesidad principal confirmada."},"volumen_mensajes_aprox":{"type":["string","null"],"description":"Volumen aproximado de vehículos, pasajeros, traslados o envíos, solo si fue proporcionado."},"herramienta_actual":{"type":["string","null"],"description":"Proveedor o proceso actual, si fue proporcionado."}},"required":["conversacion_id","giro","necesidad_principal","volumen_mensajes_aprox","herramienta_actual"],"additionalProperties":false}}
```

---

```json
{"name":"close_lead","description":"Cerrar y consolidar un lead de RentaAuto cuando existe una necesidad comercial clara. No confirma disponibilidad, cotización ni reserva.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"notes":{"type":"string","description":"Resumen breve con datos confirmados y servicio de interés."},"necesidad_proposito":{"type":"string","description":"Intención comercial principal en una frase."},"source":{"type":["string","null"],"description":"Origen, por ejemplo prospeccion_whatsapp."},"campana_id":{"type":["string","null"]},"batch_id":{"type":["string","null"]}},"required":["conversacion_id","notes","necesidad_proposito","source","campana_id","batch_id"],"additionalProperties":false}}
```

---

```json
{"name":"mark_lost_negacion","description":"Marcar la oportunidad como perdida ante una baja o rechazo definitivo.","strict":false,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"reason":{"type":"string","description":"Motivo breve, por ejemplo BAJA o no me interesa."}},"required":["conversacion_id"],"additionalProperties":false}}
```

---

```json
{"name":"list_demo_slots","description":"Consultar disponibilidad para ofrecer horarios de demo virtual, solo si el prospecto acepta avanzar.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"timezone":{"type":"string","description":"Zona horaria del prospecto."},"start_date":{"type":"string","description":"Fecha inicial YYYY-MM-DD."},"window_days":{"type":"integer","description":"Ventana de días a consultar.","minimum":1,"maximum":60}},"required":["conversacion_id","timezone","start_date","window_days"],"additionalProperties":false}}
```

---

```json
{"name":"schedule_demo","description":"Confirmar una demo virtual elegida, reservar el horario y generar la invitación. No usar sin nombre y correo confirmados.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"slot_id":{"type":"string","description":"ID de slot regresado por list_demo_slots."},"start_at":{"type":"string","description":"Fecha y hora ISO 8601 del slot elegido."},"notes":{"type":"string","description":"Notas de confirmación."},"source":{"type":["string","null"],"description":"Origen sugerido: prospeccion."},"canal":{"type":["string","null"],"description":"Canal sugerido: whatsapp."}},"required":["conversacion_id","slot_id","start_at","notes","source","canal"],"additionalProperties":false}}
```

---

```json
{"name":"reschedule_demo","description":"Reprogramar una demo previamente confirmada cuando el prospecto solicita un cambio.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"booking_id":{"type":"string","description":"ID de la cita existente."},"start_at":{"type":"string","description":"Nuevo horario ISO 8601."},"notes":{"type":"string","description":"Motivo o comentario del cambio."}},"required":["conversacion_id","booking_id","start_at","notes"],"additionalProperties":false}}
```

---

```json
{"name":"cancel_demo","description":"Cancelar una demo confirmada cuando el prospecto lo solicita.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"booking_id":{"type":"string","description":"ID de la cita a cancelar."},"reason":{"type":"string","description":"Motivo de cancelación."}},"required":["conversacion_id","booking_id","reason"],"additionalProperties":false}}
```

---

```json
{"name":"send_information_email","description":"Enviar por correo información aprobada y disponible para RentaAuto cuando el prospecto lo solicite.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"email":{"type":"string"},"full_name":{"type":["string","null"]},"company_name":{"type":["string","null"]},"summary":{"type":["string","null"]},"highlights":{"type":["array","null"],"items":{"type":"string"}},"resources":{"type":["array","null"],"items":{"type":"object","properties":{"label":{"type":"string"},"url":{"type":"string"}},"required":["label","url"],"additionalProperties":false}}},"required":["conversacion_id","email","full_name","company_name","summary","highlights","resources"],"additionalProperties":false}}
```

---

```json
{"name":"set_opt_out","description":"Registrar la exclusión comercial cuando el prospecto pide no recibir mensajes.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"canal":{"type":"string","description":"Canal a excluir, por ejemplo whatsapp."},"reason":{"type":"string","description":"Motivo informado por el prospecto."}},"required":["conversacion_id","canal","reason"],"additionalProperties":false}}
```

---

```json
{"name":"create_followup_task","description":"Crear una tarea de seguimiento humano cuando existe interés pero no hay agenda inmediata.","strict":true,"parameters":{"type":"object","properties":{"conversacion_id":{"type":"string"},"title":{"type":"string"},"details":{"type":"string"},"priority":{"type":"string","description":"Prioridad sugerida: baja, media o alta."},"due_at":{"type":["string","null"],"description":"Fecha y hora objetivo ISO 8601, si existe."}},"required":["conversacion_id","title","details","priority","due_at"],"additionalProperties":false}}
```

## Límite de habilitación

Estas son las funciones documentadas del flujo base. Solo deben publicarse en OpenAI si el backend de RentaAuto las tiene habilitadas; documentarlas no crea endpoints. Las funciones no relacionadas con la operación confirmada de RentaAuto no deben usarse para inventar cotizaciones, disponibilidad, rutas o asignación de vehículos.
