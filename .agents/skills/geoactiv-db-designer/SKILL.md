---
name: geoactiv-db-designer
description: Use this skill when designing or modifying GEOACTIV tables, migrations, columns, relationships, foreign keys, indexes, constraints, SQL queries, or PostgreSQL/Supabase database structure.
license: Proprietary
metadata:
  author: GEOACTIV
  version: "1.0.0"
  organization: GEOACTIV
  stack: PostgreSQL, Supabase, SQL
  date: June 2026
  abstract: Guides Codex to design explicit, normalized, queryable, and scalable database structures for GEOACTIV, avoiding metadata/jsonb for important business data unless explicitly justified.
---

# GEOACTIV DB Designer

Este skill guía el diseño de base de datos para GEOACTIV.

## Objetivo

Diseñar estructuras de datos claras, explícitas, escalables y fáciles de consultar en PostgreSQL/Supabase.

## Reglas principales

* Toda información importante del negocio debe modelarse como columnas explícitas.
* Evitar `metadata`, `json`, `jsonb`, `extras`, `data`, `payload`, `settings` o similares para información estructural del negocio.
* No esconder reglas de negocio dentro de JSON.
* Si un dato se consulta, filtra, ordena, valida, relaciona, reporta, audita o muestra frecuentemente, debe ser una columna real.
* Usar foreign keys reales.
* Agregar índices a foreign keys.
* Agregar índices compuestos cuando ayuden a consultas frecuentes.
* Usar constraints para proteger integridad.
* Pensar en reportes, dashboards, auditoría, permisos y rendimiento desde el diseño inicial.

## Cuándo sí usar JSONB o metadata

Solo usar JSONB o metadata cuando:

* La información sea realmente variable.
* No sea parte central del negocio.
* No se consulte frecuentemente.
* No se use para permisos, reportes, filtros o relaciones.
* Se justifique explícitamente antes de implementarlo.

## Proceso antes de crear tablas

1. Entender el objetivo de negocio.
2. Identificar entidades principales.
3. Separar entidades, catálogos y relaciones.
4. Definir columnas explícitas.
5. Definir primary keys y foreign keys.
6. Definir índices.
7. Definir constraints.
8. Revisar si habrá auditoría o trazabilidad.
9. Revisar impacto en reportes y dashboards.
10. Revisar si aplica seguridad por tenant, cliente, organización o usuario.

## Al entregar

Explicar:

* Tablas creadas o modificadas.
* Columnas importantes.
* Relaciones.
* Índices.
* Constraints.
* Decisiones tomadas.
* Riesgos o pendientes.
