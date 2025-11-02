• Dónde estamos

  - El panel hoy es HTML+JS plano servido como archivos estáticos desde backend/app/public/panel. Cada vista (ej. visitas.html) carga sus
    scripts modulares en ES6 y se apoya en Supabase auth/manual fetch.
  - No hay toolchain de frontend: sin npm/node, sin bundler, sin Tailwind. Los estilos salen de CSS propio (assets/css/base.css) +
    variables de tema cambiados vía theme.js.
  - El backend FastAPI simplemente monta esa carpeta (app.main:create_app) y expone APIs en /api/.... El Dockerfile sólo instala Poetry;
    no considera un build de frontend.

  Qué implica adoptar shadcn/ui
  shadcn/ui asume React + Tailwind + Radix (componentes accesibles) y un bundler moderno (Vite, Next, Turbopack, etc.). El “kit” es un CLI
  que copia componentes a tu repo; tú los mantienes y personalizas. Para integrarlo en esta codebase necesitamos:

  1. Introducir un proyecto frontend
      - Crear, p.ej., frontend/panel con Vite + React + TypeScript.
      - Definir package.json + gestor (pnpm/npm/yarn). Añadir scripts dev, build, lint, etc.
      - Instalar Tailwind, autoprefixer, postcss, radix-ui, clsx, lucide-react (lo que shadcn usa).
  2. Configurar Tailwind con tu branding
      - Mapear la paleta actual (--bg, --primary, etc.) a tokens Tailwind (--background, --foreground) o usar CSS variables dentro del
        theme provider de shadcn.
      - Replicar los tres temas (theme-aurora, theme-ice, theme-void) como variantes Tailwind (clases .theme-aurora :root { ... } + data-
        theme). De ser necesario, escribir un ThemeProvider que sincronice con Supabase session/localStorage igual que theme.js.
  3. Migrar la lógica de las vistas
      - Reimplementar visitas, panel, etc. como páginas React consumiendo los mismos endpoints /api/visitas/webchat, etc.
      - Portar utilidades (fetchJSONWithAuth, ensureSession, supabase client) a hooks/servicios React.
      - Replicar features: filtros, paginación, guard de sesión, cambio de tema, menús. Aprovechar componentes shadcn (DataTable, Input,
        Button, Select, Dropdown, Toast).
      - Mantener la autenticación con Supabase: crear hook useSupabaseSession, proteger rutas (React Router o file-based con Vite +
        @tanstack/router), manejar refresh tokens.
  4. Empaquetar salida para FastAPI
      - Configurar el build (npm run build) para salir a ../backend/app/public/panel o similar (outDir).
      - Ajustar app/main.py solo si cambia la ruta (dist/index.html etc.). Evitar servir doble: probablemente convenga servir React app
        desde /panel con SPA fallback y tener API separada.
      - Actualizar Dockerfile a multi-stage (etapa Node para build del frontend, copiar dist a la imagen Python). Algo como:

        FROM node:20 AS frontend
        WORKDIR /app/frontend/panel
        COPY frontend/panel .
        RUN npm ci && npm run build

        FROM python:3.11-slim AS backend
        ...
        COPY --from=frontend /app/frontend/panel/dist /app/app/public/panel
      - Añadir caché para node_modules o pnpm store si usas CI.
  5. Ajustar autenticación & navegación
      - Reemplazar el header HTML por un componente React (menú, theme switcher, logout).
      - Si quieres conservar rutas HTML directas para Legacy, deja la vieja carpeta hasta migrar todas las páginas, o monta React en
        paralelo (ej. /panel-react) y migra gradualmente.
  6. Testing & linting
      - Integrar herramientas (eslint, prettier, vitest/react-testing-library).
      - Opcional: Storybook automático para documentar componentes shadcn personalizados.
  7. Despliegue y variables
      - Extender .env y scripts para inyectar SUPABASE_URL, SUPABASE_ANON_KEY, etc. en tiempo de build o runtime (uso de env.d.ts +
        import.meta.env).
      - Si mantienes env.js, quizá generarlo durante el build.

  Resumen de cambios necesarios

  - Añadir toolchain Node (Vite + Tailwind + shadcn CLI).
  - Migrar vistas del panel a React, replicando funcionalidad actual.
  - Adaptar temas a CSS variables existentes para conservar branding (o migrar a tokens shadcn).
  - Configurar build y Docker multi-stage.
  - Asegurar SPA fallback y autenticación con Supabase en React.
  - Revisar CI/CD (scripts de build/test) y documentación (README, docs/despliegue).

  Si quieres avanzar, lo lógico es arrancar con una ruta piloto (p.ej. visitas) para validar stack y luego portarlo todo. Puedo ayudarte a
  montar la base Vite + shadcn y migrar la primera pantalla cuando lo indiques.
