# Funciones · Prospección IMLUX WhatsApp

Estas definiciones deben mantenerse alineadas con las funciones realmente habilitadas para el tenant. Todas las funciones que incluyan `conversacion_id` deben recibir el valor proporcionado por el backend.

```json
{
  "name": "set_full_name",
  "description": "Guardar o actualizar el nombre completo real del contacto de esta conversación.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": { "type": "string", "description": "ID de la conversación actual." },
      "full_name": { "type": "string", "description": "Nombre y apellido escritos explícitamente por el prospecto." }
    },
    "required": ["conversacion_id", "full_name"],
    "additionalProperties": false
  }
}
```

---

```json
{
  "name": "set_email",
  "description": "Guardar o actualizar el correo electrónico confirmado del lead.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": { "type": "string", "description": "ID de la conversación actual." },
      "email": { "type": "string", "description": "Correo válido proporcionado por el prospecto." }
    },
    "required": ["conversacion_id", "email"],
    "additionalProperties": false
  }
}
```

---

```json
{
  "name": "set_phone_number",
  "description": "Guardar o actualizar otro número proporcionado explícitamente por el lead.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": { "type": "string", "description": "ID de la conversación actual." },
      "phone_number": { "type": "string", "description": "Número preferentemente en formato E.164; si es mexicano sin prefijo, usar +52." }
    },
    "required": ["conversacion_id", "phone_number"],
    "additionalProperties": false
  }
}
```

---

```json
{
  "name": "set_company_name",
  "description": "Guardar el nombre de empresa, negocio, institución o proyecto cuando el prospecto lo proporcione espontáneamente.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": { "type": "string", "description": "ID de la conversación actual." },
      "company_name": { "type": "string", "description": "Nombre comercial o razón social confirmado." }
    },
    "required": ["conversacion_id", "company_name"],
    "additionalProperties": false
  }
}
```

---

```json
{
  "name": "close_lead",
  "description": "Cerrar y consolidar el lead con la necesidad comercial confirmada; no requiere cita ni correo.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": { "type": "string", "description": "ID de la conversación actual." },
      "notes": { "type": "string", "description": "Resumen breve de la necesidad confirmada del prospecto." },
      "necesidad_proposito": { "type": "string", "description": "Intención principal en una sola frase clara." }
    },
    "required": ["conversacion_id", "notes", "necesidad_proposito"],
    "additionalProperties": false
  }
}
```

---

```json
{
  "name": "fetch_catalog_item_details",
  "description": "Consultar productos, luminarias, modelos, familias o servicios reales de IMLUX.",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {
      "organizacion_id": { "type": "string", "description": "Organización actual proporcionada por el sistema; nunca inventarla." },
      "conversacion_id": { "type": "string", "description": "Conversación activa si el sistema la proporciona." },
      "query": { "type": "string", "description": "Producto, código, familia, modelo o servicio que desea consultar." },
      "detail_level": { "type": "string", "enum": ["overview", "metadata"], "description": "Nivel de detalle solicitado." },
      "limit": { "type": "integer", "minimum": 1, "maximum": 5, "description": "Máximo de coincidencias." }
    },
    "required": ["query", "detail_level"],
    "additionalProperties": false
  }
}
```

---

```json
{
  "name": "list_assistant_documents",
  "description": "Listar documentos reales disponibles del tenant para elegir qué información enviar.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": { "type": "string", "description": "ID de la conversación actual." },
      "channel_scope": { "type": "string", "enum": ["email", "whatsapp"], "description": "Canal de entrega solicitado." }
    },
    "required": ["conversacion_id", "channel_scope"],
    "additionalProperties": false
  }
}
```

---

```json
{
  "name": "send_information_email",
  "description": "Enviar información solicitada por correo usando documentos reales del tenant.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": { "type": "string" },
      "email": { "type": "string" },
      "full_name": { "type": ["string", "null"] },
      "company_name": { "type": ["string", "null"] },
      "summary": { "type": ["string", "null"] },
      "highlights": { "type": "array", "items": { "type": "string" } },
      "resources": { "type": "array", "items": { "type": "object", "properties": { "label": { "type": "string" }, "url": { "type": "string" } }, "required": ["label", "url"], "additionalProperties": false } },
      "assistant_document_ids": { "type": "array", "items": { "type": "string" } },
      "assistant_document_category": { "type": ["string", "null"] },
      "assistant_document_limit": { "type": ["integer", "null"] }
    },
    "required": ["conversacion_id", "email", "full_name", "company_name", "summary", "highlights", "resources", "assistant_document_ids", "assistant_document_category", "assistant_document_limit"],
    "additionalProperties": false
  }
}
```

---

```json
{
  "name": "send_information_package",
  "description": "Enviar información solicitada por WhatsApp, correo o ambos usando documentos reales del tenant.",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": { "type": "string" },
      "delivery_channels": { "type": "array", "items": { "type": "string", "enum": ["email", "whatsapp"] } },
      "email": { "type": ["string", "null"] },
      "full_name": { "type": ["string", "null"] },
      "company_name": { "type": ["string", "null"] },
      "summary": { "type": ["string", "null"] },
      "highlights": { "type": "array", "items": { "type": "string" } },
      "resources": { "type": "array", "items": { "type": "object", "properties": { "label": { "type": "string" }, "url": { "type": "string" } }, "required": ["label", "url"], "additionalProperties": false } },
      "assistant_document_ids": { "type": "array", "items": { "type": "string" } },
      "assistant_document_category": { "type": ["string", "null"] },
      "assistant_document_limit": { "type": ["integer", "null"] }
    },
    "required": ["conversacion_id", "delivery_channels", "email", "full_name", "company_name", "summary", "highlights", "resources", "assistant_document_ids", "assistant_document_category", "assistant_document_limit"],
    "additionalProperties": false
  }
}
```

---

```json
{
  "name": "mark_lost_negacion",
  "description": "Marcar la oportunidad como perdida cuando el prospecto expresa rechazo definitivo o escribe BAJA.",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {
      "conversacion_id": { "type": "string" },
      "reason": { "type": "string" }
    },
    "required": ["conversacion_id"],
    "additionalProperties": false
  }
}
```

## Funciones no permitidas

No agregar funciones de agenda, horarios, transferencia, instalación, recomendación técnica automática ni seguimiento autónomo. El cierre de prospección se realiza con `close_lead`.

