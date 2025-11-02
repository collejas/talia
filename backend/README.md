# TalIA Backend

Backend modular basado en FastAPI para centralizar WhatsApp, webchat y voz.

## Requisitos
- Python 3.11+
- Poetry 1.7+

## Configuración rápida
```bash
poetry install
poetry run pre-commit install
cp .env.example .env  # editar valores reales
```

## Comandos útiles
```bash
poetry run uvicorn app.main:app --reload
poetry run pytest
poetry run ruff check
poetry run ruff format
```

### Frontend del panel (React)
El nuevo panel basado en React + shadcn/ui se encuentra en `frontend/panel`.

```bash
# Desarrollo
cd frontend/panel
npm install        # primera vez
npm run dev        # http://localhost:5173

# Build de producción (genera backend/app/public/panel-react)
npm run build
```

El backend monta automáticamente el resultado en `/panel-react` y `/api/panel-react` para consumir la SPA desde FastAPI.

## Estructura destacada
- `app/channels/`: manejo independiente por canal (WhatsApp, webchat, voz).
- `app/assistants/`: resolución de asistentes configurados en OpenAI (sin prompt hardcodeado).
- `app/services/`: clientes compartidos para OpenAI, Twilio y almacenamiento.

## Próximos pasos
1. Completar la implementación de cada canal con lógica real.
2. Conectar el `ASSISTANT_ID` configurado en OpenAI.
3. Añadir persistencia en Supabase/Postgres mediante `repositories/`.
