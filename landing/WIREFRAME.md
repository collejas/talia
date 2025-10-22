# Wireframe · Landing Conversacional TalIA

## Vista general
- **Background**: degradado `theme-aurora` (oscuro) con ligera textura; versión alternativa clara reutilizando `theme-ice` si se expone selector en el futuro.
- **Anchura máxima**: 760px centrada vertical/horizontalmente; márgenes `clamp(1.5rem, 4vw, 3rem)`.
- **Tipografía**: Inter (ya cargada). Tamaños base 16px, encabezados 28–32px.

## Encabezado
- Barra fija con logo "TalIA", selector de tema y CTA `Únete a la lista`.

## Contenedor principal
```
┌─────────────────────────────────────────────┐
│ Hola, soy TalIA 👋                            │
│ Estoy aquí para conocer tu negocio...        │
│                                             │
│                                             │
│                                             │
│ ┌──── Mensaje TalIA (bubble) ────────────┐  │
│ │ …                                     │  │
│ └───────────────────────────────────────┘  │
│ ┌──── Mensaje usuario ──────────────────┐  │
│ │ …                                     │  │
│ └───────────────────────────────────────┘  │
│ (estado typing opcional)                    │
└─────────────────────────────────────────────┘
```
- **Saludo inicial**: heading `h1` con emoji (puede ser parte del primer mensaje de chat).
- **Descripción breve**: párrafo 2–3 líneas con propuesta de valor.
- **Sugerencias**: se eliminan los chips para enfatizar la conversación guiada por el prompt.
- **Área de mensajes** (`div.chat-log`): flex column, gap 0.75rem, burbujas con bordes redondeados (8–12px). Mensajes de TalIA en color acento, usuario gris.
- **Estados**:
  - `typing`: burbuja con puntos animados.
  - `error`: banner pequeño rojo con posibilidad de reintentar.

## Input / compositor
```
┌─────────────────────────────────────────────┐
│ [icon info] TalIA responde a modo demo...   │
│ ┌──────────────────────────────┬─────────┐ │
│ │ Escribe tu pregunta…         │ Enviar  │ │
│ └──────────────────────────────┴─────────┘ │
└─────────────────────────────────────────────┘
```
- En estado inicial el compositor se muestra centrado dentro del layout.
- Después del primer mensaje enviado por el usuario, el compositor baja a la parte inferior y queda fijo (`position: fixed`).
- Campo `input` redondeado, botón primario degradado violeta.
- Mensaje legal/disclaimer encima del input (letra 12px) recordando que es demo, datos reales vía prompt.

## Estados responsivos
- <768px: full altura; encabezado y copy se apilan; el compositor ocupa ancho completo.
- >768px: contenedor centrado con sombra.

## Variantes
1. **Onload**: Chat vacío, se muestra el saludo/primer mensaje; compositor centrado.
2. **Primer envío**: el compositor se desplaza al pie (`body.chat-active`).
3. **Conversación**: Se intercalan burbujas; siempre se mantiene scroll al final.
4. **Captura de lead**: en la secuencia del prompt, TalIA solicita nombre, correo, teléfono; cuando se obtienen, mostrar confirmación y CTA "Agendar demo".

## CTA secundarios
- En el pie (debajo del disclaimer) un link `mailto` o botón "Agendar demo" que abre correo.
- Opcional: footer minimal con © y links a privacidad/términos.

## Referencias de color
- TalIA bubble background: `var(--bubble-assistant)` con texto contrastante.
- Usuario bubble background: `var(--bubble-user)`.
- Input background: `rgba(15,23,42,0.9)` (para tema oscuro).

## Interacciones clave
- Estado typing aparece durante la llamada al backend.
- Si falta dato obligatorio, TalIA responde con mensaje solicitando nuevamente.

## Entregables UI
- Actualizar `index.html` con nueva estructura (header mínimo, contenedor principal, chat log, compositor).
- Refactor `styles.css` para soportar el compositor centrado/fijo y estados `body.chat-active`.
- Ajustar `main.js` para mover el compositor tras el primer envío y mantener el indicador typing (integración real a futuro).
