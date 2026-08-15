# Cómo instalar el Webchat en un nuevo tenant

> Para la propuesta de seguimiento de sitios web, instalación del script universal, UTM, referrers, dominios autorizados y reglas de modelado sin `metadata`/`json`/`jsonb`, consultar [Plan de tracking de sitios web por tenant](./plan_tracking_web_tenants.md).

Esta guía general lista los archivos y fragmentos que hay que copiar desde el dominio principal (geoactiv.mx) hacia cualquier nuevo tenant para que el widget Webchat funcione. Incluye: qué HTML/JS insertar, qué CSS aplicar, qué variables del backend ajustar y qué pasos de diagnóstico seguir.

## 1. Archivos del dominio

### 1.1 Contenedor HTML / PHP
Añadí el siguiente bloque al final del `<body>` de la landing (puede ser `front-page.php`, `index.html`, etc.). No depende de WordPress: es un div con el widget y el botón flotante.

```html
<div id="talia-webchat-root">
  <div id="talia-webchat-widget" class="talia-webchat-container is-collapsed">
    <div id="chat-log" class="talia-webchat-log"></div>
    <form id="chat-form" class="talia-webchat-form">
      <input id="chat-input" placeholder="Escribe tu mensaje…" autocomplete="off" />
      <button type="submit">Enviar</button>
    </form>
    <button type="button" id="chat-attachment-button">Adjuntar</button>
    <input type="file" id="chat-file-input" hidden />
    <div id="chat-attachments" class="composer-attachments"></div>
  </div>
  <button id="talia-webchat-toggle" class="talia-webchat-toggle" type="button" aria-expanded="false">
    Chatea con nosotros
  </button>
</div>
```

### 1.2 Script de inicialización
Publicá la versión del widget que ya está en `/wp-content/themes/twentyseventeen/webchat-widget.js` (u otra carpeta pública) y cargalo así:

```html
<script type="module">
  const TENANT_ALIAS = "lia"; // reemplazá según el alias del tenant
  const API_BASE = "https://talia.mx/api/webchat";
  const loadWebchat = async () => {
    const widgetModule = await import("/ruta/del/widget/webchat-widget.js");
    widgetModule.initialiseChat({
      tenantAlias: TENANT_ALIAS,
      apiBaseUrl: API_BASE,
      chatLog: document.getElementById("chat-log"),
      chatForm: document.getElementById("chat-form"),
      chatInput: document.getElementById("chat-input"),
      chatAttachmentButton: document.getElementById("chat-attachment-button"),
      chatFileInput: document.getElementById("chat-file-input"),
      chatAttachments: document.getElementById("chat-attachments"),
      getScrollContainer: () => document.getElementById("talia-webchat-widget"),
    });
  };
  loadWebchat().catch((error) => console.error("Error cargando webchat:", error));
</script>
```

### 1.3 Toggle JS
Este script se asegura de que el panel arranque cerrado y abra/cierre al click.

```html
<script>
  (function () {
    const widget = document.getElementById("talia-webchat-widget");
    const toggle = document.getElementById("talia-webchat-toggle");
    if (!widget || !toggle) return;

    const setState = (open) => {
      widget.classList.toggle("is-open", open);
      widget.classList.toggle("is-collapsed", !open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "Cerrar chat" : "Chatea con nosotros";
    };

    toggle.addEventListener("click", () => setState(!widget.classList.contains("is-open")));
    window.addEventListener("load", () => setState(false));
  })();
</script>
```

## 2. CSS (puede ir en `style.css` o en "CSS adicional")

```css
#talia-webchat-root {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10005;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
}

#talia-webchat-root > * {
  pointer-events: auto;
}

#talia-webchat-toggle {
  background: #0b6ad9;
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 12px 20px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.25);
}

#talia-webchat-toggle:hover {
  background: #064da4;
}

#talia-webchat-widget {
  width: min(360px, 92vw);
  max-height: 80vh;
  height: min(80vh, 540px);
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(0, 0, 0, 0.08);
  overflow: hidden;
  padding: 0;
  transform: translateY(100%);
  opacity: 0;
  visibility: hidden;
  transition: transform 0.3s ease, opacity 0.2s ease;
}

#talia-webchat-widget.is-open {
  transform: translateY(0);
  opacity: 1;
  visibility: visible;
}

#talia-webchat-widget form {
  display: flex;
  align-items: center;
  padding: 12px;
  gap: 10px;
  position: sticky;
  bottom: 0;
  background: #fff;
}

#talia-webchat-widget #chat-input {
  flex: 1;
  padding: 10px 12px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: #f8f8f8;
}

#talia-webchat-widget button {
  background: #0b6ad9;
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 10px 16px;
  cursor: pointer;
}

#talia-webchat-widget button:hover {
  background: #064da4;
}

#talia-webchat-widget .talia-webchat-log {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  max-height: calc(100% - 120px);
}
```

## 3. Backend (.env + configuración)

- `TALIA_CORS_ALLOWED_ORIGINS`: lista todos los dominios donde se mostrará el widget.
- `WEBCHAT_TENANT_ALIAS_MAP`: mapea alias públicos (`lia`) a `organizacion_id`. Ejemplo: `{"lia":"00000000-0000-0000-0000-000000000001"}`.
- `WEBCHAT_DEFAULT_TENANT_ALIAS` y `WEBCHAT_DEFAULT_ORGANIZACION_ID` fijan el tenant maestro.
- Si cada tenant tiene su propio assistant: define `TALIA_OPENAI_WEBCHAT_ASSISTANT_ID` / `TALIA_OPENAI_PROMPT_WEBCHAT_VERSION` específicos.

> Reiniciá el backend (`systemctl restart talia-api`) después de tocar el `.env` para que recargue los nuevos valores.

## 4. Tenant / base de datos

1. Creá el alias del tenant en la tabla correspondiente (`tenants`, `webchat_alias`, etc.). Debe coincidir exactamente con el `TENANT_ALIAS` que inyectás en el frontend (minúsculas). 
2. Fijá `webchat.enabled = true` y confirmá que `organizacion_id` existe y tiene configurado el asistente.
3. Cada alias debe mapearse en `WEBCHAT_TENANT_ALIAS_MAP` para que el backend pueda resolver la organización.

## 5. Validación

1. Usa DevTools y el monitor de `fetch` para observar las llamadas `POST /api/webchat/visit` y `/messages`.
2. Corre este `curl` desde el dominio del tenant para verificar CORS y sesión:

```bash
curl -H "Origin: https://nuevo-tenant.com" -H "Content-Type: application/json" \
  -X POST -d '{"session_id":"sess-123","tenant_alias":"lia"}' https://talia.mx/api/webchat/visit -i
```

3. Revisa `logs/webchat.log` y asegurate de que no haya errores `prompt_variable_unknown` ni `CORS`.

## 6. Checklist general

- [ ] El HTML/JS del widget está insertado en la landing (HTML, PHP o plantilla del CMS).
- [ ] `webchat-widget.js` está disponible y accesible desde el dominio.
- [ ] CSS adicional flota el chat y mantiene el toggle visible.
- [ ] `.env` incluye todos los dominios (`TALIA_CORS_ALLOWED_ORIGINS`) y el mapa de aliases.
- [ ] El tenant alias existe en la base de datos y tiene `webchat.enabled`.
- [ ] Las peticiones al backend (`/visit`, `/messages`) devuelven 200 sin errores.

Si querés automatizar la inserción de HTML/CSS (por ejemplo, con un fragmento de `functions.php` o un plugin), decime y preparo un template reutilizable.
