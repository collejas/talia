# Plan: Modo “Gobierno Dinámico” para el buscador

## Objetivo
Agregar un nuevo modo de crawling enfocado en sitios de gobierno que cargan su contenido mediante JavaScript (React, Angular, Drupal con componentes dinámicos, etc.), de modo que el buscador pueda renderizar las páginas, seguir enlaces y extraer correos, incluso cuando el HTML inicial está vacío.

## Tareas

1. [ ] **Diseño del fetcher dinámico**
   - Evaluar tecnología (Playwright, Selenium, Splash). Playwright es preferido por soporte headless y control granular.
   - Definir cómo se instalará en el servidor (`apt install chromium`, `pip install playwright`, `playwright install chromium`).
   - Describir parámetros de timeout, user-agent y comportamiento ante bloqueos (esperas, screenshot opcional).

2. [ ] **Implementación de `DynamicHttpFetcher`**
   - Crear una clase en `buscador/core/fetcher_dynamic.py` que exponga el mismo contrato (`get -> HttpResponse`).
   - Manejar la vida útil del navegador (pool o contexto por solicitud) para no saturar recursos.
   - Registrar logs detallados (inicio, fin, errores, tiempos de render).

3. [ ] **Integración con `create_domain_crawler`**
   - Añadir modo `government_dynamic` (nombre provisional) en la fábrica.
   - En `BuscadorParams` y validaciones del backend/frontend permitir el nuevo literal.
   - Ajustar límites por defecto (p.ej. `max_pages` 100, `max_runtime` 120s).

4. [ ] **Actualización del panel**
   - Añadir la opción al selector de modos con un warning (“usa navegador headless, puede tardar más”).
   - Mostrar en la UI cuando el modo dinámico está activo (badge).

5. [ ] **Infraestructura y despliegue**
   - Instalar Playwright/Chromium en el servidor.
   - Ajustar `systemd` o docker para incluir dependencias gráficas/headless necesarias.
   - Añadir pruebas básicas (p.ej. script CLI que visite un sitio JS y confirme que obtiene texto).

6. [ ] **Monitoreo y métricas**
   - Registrar en logs duración por página y errores de render (timeouts/WAF).
   - Exponer en `stats` cuántas páginas se procesaron dinámicamente vs. cuántas fallaron.

7. [ ] **Documentación operativa**
   - Incluir instrucciones en `README`/`docs` sobre cómo habilitar y solucionar problemas (limpieza de cache, reinstalar browser, etc.).
   - Definir políticas de uso (solo usar cuando el modo regular no arroje resultados).

Con este plan tendremos un modo especializado que renderiza sitios dinámicos y mantiene trazabilidad suficiente para operarlo en producción. 
