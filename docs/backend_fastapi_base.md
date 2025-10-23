# Base del backend FastAPI · TalIA

## Objetivo
Definir la estructura inicial del backend para facilitar la implementación en Fase 1, con separación modular por canal (WhatsApp, webchat y voz) y sin hardcodear prompts ni scripts conversacionales.

> Estado: el esquema operativo en Supabase (contactos, conversaciones, mensajes, eventos) ya fue creado y protegido con RLS mediante la migración `supabase/migrations/20251023_160500_rls_policies.sql`. Las siguientes fases deben consumir ese modelo desde los repositorios FastAPI.

## Estructura propuesta
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                       # Instancia FastAPI, middlewares, registro de routers
│   ├── core/
│   │   ├── config.py                 # Configuración (pydantic Settings)
│   │   ├── logging.py                # Logging estructurado
│   │   └── security.py               # Helpers de firmas/validaciones comunes
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes/
│   │       └── health.py             # Endpoint `/health`
│   ├── channels/
│   │   ├── __init__.py
│   │   ├── whatsapp/
│   │   │   ├── __init__.py
│   │   │   ├── router.py             # Webhooks Twilio WhatsApp
│   │   │   ├── schemas.py            # Pydantic (mensajes, callbacks)
│   │   │   ├── service.py            # Orquestación con Twilio/OpenAI
│   │   │   └── deps.py               # Dependencias específicas (validación firma)
│   │   ├── webchat/
│   │   │   ├── __init__.py
│   │   │   ├── router.py             # REST/WebSocket para widget web
│   │   │   ├── schemas.py
│   │   │   ├── service.py
│   │   │   └── deps.py
│   │   └── voice/
│   │       ├── __init__.py
│   │       ├── router.py             # Twilio Voice `<Connect><Stream>`
│   │       ├── schemas.py
│   │       ├── service.py
│   │       └── deps.py
│   ├── assistants/
│   │   ├── __init__.py
│   │   ├── manager.py                # Obtiene IDs/config de asistentes desde entorno o BD
│   │   └── registry.py               # Mapping dinámico (sin prompts embebidos)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── openai.py                 # Cliente OpenAI centralizado (requiere ASSISTANT_ID)
│   │   ├── twilio.py                 # Cliente Twilio genérico
│   │   └── storage.py                # Conexión a Supabase/Postgres
│   ├── models/
│   │   ├── __init__.py
│   │   └── conversation.py           # Placeholders ORM/Pydantic
│   └── repositories/
│       ├── __init__.py
│       └── leads.py                  # Acceso a datos (conversaciones/leads)
├── tests/
│   ├── __init__.py
│   ├── conftest.py                   # Fixtures comunes (cliente FastAPI, settings)
│   ├── test_health.py
│   ├── channels/
│   │   ├── test_whatsapp_webhook.py
│   │   ├── test_webchat_api.py
│   │   └── test_voice_stream.py
│   └── assistants/test_registry.py
├── pyproject.toml                    # Poetry + herramientas
├── README.md                         # Instrucciones backend
├── .env.example                      # Variables requeridas (sin valores reales)
├── .pre-commit-config.yaml
└── Dockerfile
```

### Organización por canal
- Cada carpeta bajo `app/channels/` contiene **router**, **schemas**, **service** y dependencias propias.
- `app/main.py` importa los routers de cada canal y los monta con prefijos (`/api/whatsapp`, `/api/webchat`, `/api/voice`).
- Lógica compartida (clientes Twilio, validación de firmas, acceso a OpenAI/Supabase) vive en `app/services/` y `app/core/security.py`. El módulo `app/services/storage.py` llama a la RPC `registrar_mensaje_webchat` para persistir interacciones.
- La interacción con OpenAI usa únicamente `ASSISTANT_ID`/`THREAD_ID` almacenados en variables de entorno o base de datos; no se incluye el prompt en código.
- Tests espejan la estructura para mantener cobertura independiente por canal.

## Dependencias iniciales
- `fastapi`
- `uvicorn[standard]`
- `pydantic-settings`
- `httpx` (tests async)
- `pytest`, `pytest-asyncio`
- `ruff` (lint + formato)
- `mypy` (opcional en Fase 1)

## Configuración recomendada
- `app/core/config.py`: leer variables (como `OPENAI_ASSISTANT_ID`, `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `SUPABASE_URL`, etc.) desde `.env` mediante `BaseSettings`.
- Middlewares iniciales en `main.py`:
  - `CORSMiddleware` (orígenes configurables por ambiente).
  - Middleware de logging centralizado (`app/core/logging.py`).
- Registrar `health_router` con `/health` → `{ "status": "ok" }`.
- En cada router de canal, utilizar dependencias (`Depends`) para validar firmas o preparar clientes específicos.

## Dockerfile base
```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN adduser --disabled-password --gecos "" appuser
COPY pyproject.toml poetry.lock* ./
RUN pip install --no-cache-dir poetry && \
    poetry config virtualenvs.create false && \
    poetry install --only main --no-root
COPY app ./app
USER appuser
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Script `docker-compose.yml` (infra/)
```yaml
aPI: # alias en docker compose
  services:
    api:
      build: ../backend
      env_file:
        - ../backend/.env.example # reemplazar por .env en servidor
      ports:
        - "8004:8000"
      restart: unless-stopped
      networks:
        - proxy
  networks:
    proxy:
      external: true
```

## Linters y hooks
- `ruff`: formateo (`ruff format`) y lint (`ruff check`).
- `pre-commit`: hooks `ruff`, `pytest --maxfail=1 --disable-warnings -q` (opcional en Fase 1).

## Pruebas iniciales
`tests/test_health.py`
```python
from httpx import AsyncClient
from app.main import app

async def test_health_returns_ok():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```

## Checklist para creación
- [ ] Inicializar carpeta `backend/` con estructura modular anterior.
- [ ] Añadir `pyproject.toml` configurando `tool.poetry` y `tool.ruff`.
- [ ] Generar `.env.example` con llaves definidas en `docs/credenciales.md` (incluye `OPENAI_ASSISTANT_ID`).
- [ ] Configurar `pre-commit` y documentar instalación (`pre-commit install`).
- [ ] Añadir workflows a `infra/` conforme a `docs/despliegue_ci_cd.md`.
- [ ] Crear archivos base vacíos (`router.py`, `schemas.py`, etc.) para cada canal y sus pruebas placeholder.
- [ ] Implementar `assistants/manager.py` para leer IDs desde configuración y exponer helpers sin incluir prompts.

## Próximos pasos
1. Scaffold del proyecto usando `poetry new backend` y adaptar carpetas según diagrama modular.
2. Implementar endpoint `/health` y pruebas mínimas junto con routers vacíos para cada canal.
3. Integrar `ruff` y `pytest` al pipeline CI.
4. Documentar comandos (`make`, `taskipy` o scripts Poetry) para `run`, `test` y `lint`.
5. Definir contratos iniciales por canal (payloads esperados) en `schemas.py` antes de Fase 2.
6. Conectar el backend o landing al `ASSISTANT_ID` configurado en OpenAI, manteniendo el prompt fuera del repositorio.
