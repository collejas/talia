---
name: geoactiv-feature-builder
description: Use this skill when creating or modifying a complete GEOACTIV feature that may touch backend, frontend, database, APIs, services, dashboard, landing pages, automations, or external integrations.
license: Proprietary
metadata:
  author: GEOACTIV
  version: "1.0.0"
  organization: GEOACTIV
  stack: FastAPI, Next.js, React, TypeScript, PostgreSQL, Supabase
  date: June 2026
  abstract: Guides Codex to build complete GEOACTIV features with clean architecture, explicit database design, secure APIs, practical UI/UX, and maintainable implementation across backend, frontend, database, services, and integrations.
---

# GEOACTIV Feature Builder

Este skill guía la creación de funcionalidades completas para GEOACTIV.

## Objetivo

Construir features claras, seguras, mantenibles y coherentes con la arquitectura del proyecto.

## Antes de modificar código

1. Revisar la estructura existente del repo.
2. Identificar backend, frontend, base de datos, scripts o servicios relacionados.
3. Buscar patrones ya existentes.
4. Revisar si existe algún componente, servicio, endpoint o tabla similar.
5. Proponer un plan corto cuando la tarea toque varias capas.

## Backend

* Usar FastAPI de forma clara.
* Separar rutas, servicios, schemas y lógica de negocio.
* Usar Pydantic para validaciones.
* Evitar lógica compleja dentro de endpoints.
* Manejar errores de forma explícita.
* No exponer información sensible.
* Validar permisos y ownership cuando aplique.

## Frontend

* Usar Next.js, React y TypeScript.
* Crear componentes claros y reutilizables.
* Usar Tailwind, shadcn/ui y Radix UI de forma consistente.
* Manejar estados de carga, vacío, error y éxito.
* Evitar componentes gigantes.
* Evitar `any` salvo justificación.

## Base de datos

* Usar columnas explícitas.
* Evitar metadata/jsonb para datos importantes.
* Crear relaciones reales.
* Agregar índices necesarios.
* Pensar en reportes, permisos, dashboards y auditoría.

## Integraciones

Cuando la feature use IA, Twilio, OpenAI, mapas, PDFs o servicios externos:

* Separar configuración, lógica e integración.
* No hardcodear secretos.
* No imprimir tokens en logs.
* Validar entradas.
* Manejar errores externos.
* Registrar eventos importantes sin guardar datos sensibles innecesarios.

## Antes de terminar

1. Revisar diff.
2. Revisar migraciones.
3. Revisar tipos.
4. Revisar seguridad.
5. Revisar consistencia UI/UX.
6. Mencionar archivos modificados.
7. Explicar decisiones.
8. Mencionar riesgos o pendientes.
