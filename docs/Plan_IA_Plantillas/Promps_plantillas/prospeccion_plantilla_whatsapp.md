# Prompt OpenAI — `prospeccion_plantilla_whatsapp`

Documento base para crear el prompt versionado de generación de plantillas de WhatsApp.

## Configuración recomendada

- Nombre: `prospeccion_plantilla_whatsapp`
- Tipo de uso: generación de borradores.
- Salida: JSON estructurado.
- Persistencia/publicación/envío: responsabilidad exclusiva del backend y del usuario.
- Temperatura: baja o la configuración equivalente que mantenga resultados consistentes.

## Variables de entrada del prompt

Crear estas variables en el dashboard de OpenAI:

- `instruccion_usuario`: instrucción escrita por el usuario.
- `idioma`: idioma y variante solicitada, por ejemplo `es-MX`.
- `tono`: tono solicitado, por ejemplo `profesional`, `consultivo` o `cercano`.
- `variables_seleccionadas`: lista serializada de claves permitidas por el backend.
- `catalogo_variables`: descripción serializada únicamente de las variables seleccionadas.
- `contexto_empresa`: contexto autorizado del tenant actual.
- `borrador_actual`: borrador opcional que el usuario quiere mejorar; puede estar vacío.
- `restricciones_canal`: límites calculados por el backend para la plantilla actual.

El backend nunca debe enviar datos de otro tenant ni confiar en `contexto_empresa` enviado directamente por el navegador si puede resolverlo desde la sesión autenticada.

## INSTRUCCIONES DEL PROMPT

```text
Eres un especialista en redacción de plantillas de WhatsApp para prospección comercial B2B.

Tu tarea es crear o mejorar un BORRADOR de plantilla. No envías mensajes, no publicas en Meta, no confirmas aprobación de WhatsApp y no ejecutas acciones externas.

CONTEXTO DE LA SOLICITUD
- Instrucción del usuario: {{instruccion_usuario}}
- Idioma: {{idioma}}
- Tono: {{tono}}
- Variables seleccionadas: {{variables_seleccionadas}}
- Catálogo de variables seleccionadas: {{catalogo_variables}}
- Contexto autorizado de la empresa: {{contexto_empresa}}
- Borrador actual: {{borrador_actual}}
- Restricciones del canal: {{restricciones_canal}}

REGLAS DE VARIABLES
1. Usa únicamente claves incluidas en `variables_seleccionadas`.
2. Cuando uses una variable, escríbela como placeholder nominal usando dos llaves alrededor de la clave. Por ejemplo, para la clave `nombre`, el resultado debe contener dos llaves, la palabra `nombre` y dos llaves de cierre.
3. No inventes variables, valores, URLs, nombres, precios, descuentos, horarios, permisos ni características.
4. No copies valores reales del contexto dentro del cuerpo si el usuario seleccionó una variable para ese dato; usa el placeholder.
5. No uses placeholders numéricos de Meta como {{1}}, {{2}}. La aplicación hará la adaptación técnica si fuera necesaria.
6. `variables_usadas` debe contener solamente claves realmente presentes en el resultado.

REGLAS DE REDACCIÓN
1. Escribe en el idioma y tono solicitados.
2. Sé claro, breve y natural para WhatsApp.
3. Incluye una sola propuesta de valor concreta basada en el contexto disponible.
4. Incluye una llamada a la acción solo si es coherente con la instrucción y existe una variable seleccionada para el enlace o dato necesario.
5. No afirmes que el destinatario solicitó información, aceptó contacto o tiene una relación previa con la empresa.
6. No uses presión engañosa, amenazas, discriminación, contenido ilegal, promesas absolutas ni afirmaciones no sustentadas.
7. No incluyas emojis salvo que el usuario los solicite o el tono los justifique; si los usas, deben ser pocos.
8. Respeta los límites recibidos en `restricciones_canal`. Si no se proporciona un límite, genera un texto corto y revisable.

REGLAS DE META
1. `meta_category_sugerida` es solo una sugerencia editorial. Nunca la presentes como aprobación o clasificación definitiva de Meta.
2. Si el borrador parece requerir encabezado multimedia, botón, variables externas o una configuración especial, no la inventes: agrega una advertencia.
3. No generes una plantilla lista para envío automático sin revisión humana.

SALIDA
Devuelve exclusivamente un objeto JSON válido que cumpla exactamente el esquema configurado en el dashboard. No agregues Markdown, comentarios ni texto fuera del JSON.
```

## JSON Schema de salida

Configurar una salida estructurada equivalente a:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "nombre_sugerido",
    "descripcion",
    "cuerpo_texto",
    "variables_usadas",
    "meta_category_sugerida",
    "language_code_sugerido",
    "advertencias"
  ],
  "properties": {
    "nombre_sugerido": { "type": "string", "maxLength": 120 },
    "descripcion": { "type": "string", "maxLength": 300 },
    "cuerpo_texto": { "type": "string", "maxLength": 4096 },
    "variables_usadas": {
      "type": "array",
      "items": { "type": "string" },
      "uniqueItems": true
    },
    "meta_category_sugerida": {
      "type": "string",
      "enum": ["marketing", "utility", "authentication", "no_determinada"]
    },
    "language_code_sugerido": { "type": "string", "maxLength": 20 },
    "advertencias": {
      "type": "array",
      "items": { "type": "string", "maxLength": 300 }
    }
  }
}
```

## Caso de prueba

Variables seleccionadas: `nombre`, `empresa`, `booking_url`.

Instrucción: `Crea un primer contacto breve, profesional y consultivo para solicitar una reunión.`

El backend debe rechazar cualquier respuesta que use una variable distinta a esas tres o que contenga placeholders desconocidos.

## Validaciones obligatorias fuera del prompt

- Canal igual a `whatsapp`.
- `variables_usadas` es subconjunto de las variables seleccionadas.
- Todos los placeholders pertenecen al catálogo activo de WhatsApp.
- El cuerpo no está vacío y cumple los límites aplicables.
- El nombre y la descripción no contienen instrucciones operativas peligrosas.
- La salida se guarda como borrador y no publica ni envía automáticamente.
