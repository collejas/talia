# TalIA Panel (React)

Aplicación SPA creada con Vite + React + TypeScript para la nueva interfaz del panel administrativo.
Usa TailwindCSS (v3) como motor de estilos y shadcn/ui como librería de componentes.

## Scripts

```bash
# Instalar dependencias
npm install

# Desarrollo (http://localhost:5173)
npm run dev

# Linter
npm run lint

# Build (genera ../backend/app/public/panel-react)
npm run build
```

## Estructura relevante

- `src/components/ui`: componentes reutilizables de shadcn/ui.
- `src/styles/theme.css`: variables de color compartidas con el panel actual (Aurora, Ice, Void).
- `src/lib/utils.ts`: helper `cn` (clsx + tailwind-merge) generado por shadcn.

El resultado del build queda disponible para FastAPI en `/panel-react` y `/api/panel-react`.
