# Proyecto TalIA

Este repositorio contiene los activos iniciales de TalIA, incluyendo el landing page público y la futura API alojada en DigitalOcean.

## Landing page (talia.mx)

El sitio está inspirado en la experiencia conversacional de OpenAI. Incluye:
- Sección hero con propuesta de valor y vista previa de una conversación.
- Desglose de capacidades, casos de uso y planes de servicio.
- Chat interactivo donde TalIA explica qué puede y qué no puede hacer en la versión demo.
- Formulario de contacto deshabilitado hasta el lanzamiento.

### Estructura

```
landing/
└── src/
    ├── index.html           # Página principal con la estructura de la landing.
    ├── assets/
    │   ├── css/styles.css   # Estilos base, layout y variantes responsivas.
    │   └── js/main.js       # Lógica del chat simulado y utilidades de UI.
    └── data/chat-responses.js # Respuestas y textos reutilizables para el chat.
```

Puedes añadir carpetas hermanas dentro de `assets/` (por ejemplo `img/` o `fonts/`) manteniendo la separación de responsabilidades.

### Cómo previsualizar

1. Abre el archivo `landing/src/index.html` directamente en tu navegador **o** levanta un servidor local:
   ```bash
   cd landing/src
   python3 -m http.server 5173
   ```
2. Visita `http://localhost:5173` para navegar el landing y probar el chat.

Si necesitas adaptar el contenido a otro stack (por ejemplo, Next.js o un generador estático), puedes usar estos archivos como punto de partida.

### Temas de color

Desde el encabezado puedes alternar entre tres combinaciones preconfiguradas:
- `Aurora violeta`: tema oscuro original con un acento violeta añadido.
- `Espectro vibrante`: tema claro con acentos fuertes en naranja, verde y violeta/morado.
- `Nocturno`: esquema negro al estilo OpenAI con acento verde.

La preferencia se guarda en `localStorage`, por lo que la página recuerda el tema elegido en visitas futuras.

