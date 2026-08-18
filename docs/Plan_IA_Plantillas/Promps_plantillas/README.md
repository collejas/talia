# Prompts de plantillas de prospección

Esta carpeta contiene los dos prompts que se crearán en el proyecto de OpenAI del dueño de la plataforma:

- `prospeccion_plantilla_whatsapp.md`
- `prospeccion_plantilla_correo.md`

## Cómo utilizarlos

1. Crear un prompt independiente en el dashboard de OpenAI para cada canal.
2. Copiar la sección `INSTRUCCIONES DEL PROMPT` del archivo correspondiente.
3. Crear las variables de entrada con los nombres indicados en cada archivo.
   Cada prompt debe declarar también `contexto_empresa` y `sistema_diseno_empresa`; el prompt de correo debe declarar además `estilo_diseno` y `layouts_permitidos`. Estas variables contienen únicamente estilos creados, editados y habilitados por el tenant autenticado, y son resueltas y validadas por el backend.
4. Configurar una salida estructurada equivalente al JSON Schema documentado.
5. Probar los casos incluidos antes de publicar una versión.
6. Capturar el `prompt_id` y la versión publicada en `/settings/variables` del tenant maestro.

Después de agregar o cambiar variables en OpenAI, es necesario guardar y publicar
una nueva versión de cada prompt. La aplicación envía las variables de negocio
resueltas desde el tenant autenticado; no deben capturarse desde el navegador.

## Funciones / tools

Estos prompts no requieren funciones ejecutables en su primera versión. Su responsabilidad es interpretar la instrucción y devolver un borrador estructurado.

La aplicación hará fuera del modelo lo siguiente:

- Resolver el tenant autenticado.
- Cargar el catálogo oficial de variables y sus reglas de canal.
- Validar que las variables usadas fueron seleccionadas.
- Validar placeholders y límites del canal.
- Sanitizar el HTML de correo.
- Persistir la auditoría, tokens y costos.
- Guardar o publicar la plantilla únicamente después de la revisión del usuario.

No se deben agregar tools de guardado, publicación, envío, acceso a otros tenants ni consulta de secretos al prompt.

## Nota de integración

El backend debe usar salida estructurada con JSON Schema estricto cuando el modelo seleccionado lo soporte. El JSON generado por el modelo nunca sustituye las validaciones del backend.

Referencia: [Structured Outputs — OpenAI Platform](https://platform.openai.com/docs/api-reference/responses/create#responses-create-text).
