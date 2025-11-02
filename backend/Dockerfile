# Etapa de build del frontend
FROM node:20-alpine AS frontend
WORKDIR /app/frontend/panel
COPY frontend/panel/package.json frontend/panel/package-lock.json ./
RUN npm ci
COPY frontend/panel .
RUN mkdir -p ../../backend/app/public
RUN npm run build

# Etapa principal de backend
FROM python:3.11-slim

ENV POETRY_HOME=/opt/poetry \
    POETRY_VERSION=1.8.2 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl && \
    curl -sSL https://install.python-poetry.org | python3 - && \
    ln -s ${POETRY_HOME}/bin/poetry /usr/local/bin/poetry && \
    apt-get purge -y --auto-remove curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml poetry.lock* ./
RUN poetry config virtualenvs.create false && \
    poetry install --only main --no-root

COPY app ./app
COPY --from=frontend /app/backend/app/public/panel-react ./app/public/panel-react
RUN adduser --disabled-password --gecos "" appuser
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
