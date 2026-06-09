---
name: geoactiv-api-designer
description: Use this skill when designing, creating, or refactoring GEOACTIV APIs, endpoints, FastAPI routes, Pydantic schemas, JSON contracts, validations, pagination, filters, errors, or frontend-backend integration.
license: Proprietary
metadata:
  author: GEOACTIV
  version: "1.0.0"
  organization: GEOACTIV
  stack: FastAPI, Pydantic, HTTPX, Next.js, TypeScript
  date: June 2026
  abstract: Guides Codex to design clear, consistent, secure, predictable, and frontend-friendly APIs for GEOACTIV using FastAPI, Pydantic schemas, explicit validation, clean errors, pagination, filters, and service separation.
---

# GEOACTIV API Designer

Este skill guía el diseño de APIs para GEOACTIV.

## Objetivo

Crear APIs claras, consistentes, seguras, mantenibles y fáciles de consumir desde el panel Next.js, integraciones externas o servicios internos.

La API debe ser predecible, explícita y fácil de depurar.

## Principios

* Contratos claros.
* Endpoints con responsabilidad única.
* Validación fuerte con Pydantic.
* Respuestas consistentes.
* Errores claros.
* Seguridad desde el diseño.
* Paginación, filtros y ordenamiento cuando aplique.
* Separación entre rutas, schemas, servicios y acceso a datos.
* No mezclar lógica de negocio compleja dentro del endpoint.
* No devolver datos innecesarios.

## Estructura recomendada

Cuando aplique, separar en:

```txt
backend/
  app/
    api/
      routes/
    schemas/
    services/
    repositories/
    models/
    core/
```

Ajustarse a la estructura real del repo si ya existe otro patrón.

## Diseño de endpoints

Preferir rutas claras:

```txt
GET    /api/recursos
GET    /api/recursos/{id}
POST   /api/recursos
PATCH  /api/recursos/{id}
DELETE /api/recursos/{id}
```

Para acciones especiales:

```txt
POST /api/recursos/{id}/aprobar
POST /api/recursos/{id}/cancelar
POST /api/recursos/{id}/reenviar
```

Evitar rutas ambiguas como:

```txt
POST /api/do-action
POST /api/update-data
GET  /api/info
```

## Schemas Pydantic

Separar schemas por intención:

```txt
RecursoCreate
RecursoUpdate
RecursoRead
RecursoListItem
RecursoFilters
```

Reglas:

* No usar el mismo schema para crear, actualizar y responder si tienen campos distintos.
* No aceptar campos que el cliente no debe controlar.
* No devolver campos internos.
* Validar tipos, longitudes, enums y campos requeridos.
* Usar nombres claros.

## Respuestas

Mantener respuestas consistentes.

Para un recurso:

```json
{
  "id": "uuid",
  "nombre": "Ejemplo",
  "activo": true,
  "creado_en": "2026-06-09T12:00:00Z"
}
```

Para listados:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 20
}
```

Para errores:

```json
{
  "error": {
    "code": "recurso_no_encontrado",
    "message": "No se encontró el recurso solicitado."
  }
}
```

## Paginación

En listados, usar paginación cuando el resultado pueda crecer.

Parámetros recomendados:

```txt
page
page_size
search
sort
direction
```

Reglas:

* Definir `page_size` máximo.
* Evitar devolver miles de registros sin control.
* Agregar filtros útiles.
* Agregar índices en base de datos cuando los filtros sean frecuentes.

## Filtros

Los filtros deben corresponder a columnas reales cuando sea información estructural.

Evitar filtros sobre metadata/jsonb para datos importantes del negocio.

Ejemplos:

```txt
GET /api/cotizaciones?estado=borrador&cliente_id=uuid&page=1&page_size=20
GET /api/activos?servicio_id=uuid&municipio_id=uuid
```

## Seguridad

Cada endpoint debe responder:

1. ¿Requiere autenticación?
2. ¿Qué roles pueden usarlo?
3. ¿Qué tenant, organización o cliente puede ver estos datos?
4. ¿El usuario puede modificar este recurso?
5. ¿Qué campos puede controlar el cliente?
6. ¿Qué campos no deben exponerse?

Reglas:

* Validar permisos en backend.
* No confiar solo en el frontend.
* No devolver datos de otro tenant.
* No aceptar IDs de organización/cliente sin validar ownership.
* No exponer secretos.
* No incluir información sensible en errores.

## Servicios

Mover lógica de negocio a services.

El endpoint debe hacer principalmente:

1. Recibir request.
2. Validar entrada.
3. Validar usuario/permisos.
4. Llamar servicio.
5. Devolver respuesta.

Evitar endpoints con lógica extensa.

## Integraciones

Para APIs que llamen OpenAI, Twilio, Supabase, Mapbox u otros servicios:

* Validar entrada antes de llamar proveedor externo.
* Manejar timeouts.
* Manejar errores del proveedor.
* No exponer respuestas internas completas.
* No guardar datos sensibles innecesarios.
* Registrar eventos importantes.
* Evitar duplicados en webhooks.
* Diseñar idempotencia cuando aplique.

## Versionado

Si el cambio rompe contratos existentes, considerar versionado o compatibilidad temporal.

Ejemplos:

```txt
/api/v1/...
/api/v2/...
```

No versionar innecesariamente si el sistema aún es interno o está controlado, pero documentar cambios importantes.

## Documentación

Cuando se cree o modifique una API importante, documentar:

* Ruta.
* Método.
* Auth requerida.
* Parámetros.
* Body.
* Respuesta.
* Errores.
* Ejemplo de uso.

## Checklist antes de entregar

1. ¿La ruta es clara?
2. ¿El método HTTP es correcto?
3. ¿Los schemas están separados por intención?
4. ¿La respuesta es consistente?
5. ¿Los errores son claros?
6. ¿Hay paginación si puede crecer?
7. ¿Hay filtros útiles?
8. ¿Los filtros tienen soporte en base de datos?
9. ¿La lógica está fuera del endpoint si es compleja?
10. ¿Los permisos están validados?
11. ¿No se exponen datos sensibles?
12. ¿El frontend puede consumirlo fácilmente?
13. ¿Hay documentación mínima?

## Al entregar

Explicar:

* Endpoints creados o modificados.
* Schemas creados o modificados.
* Servicios involucrados.
* Validaciones.
* Permisos.
* Formato de respuesta.
* Riesgos o pendientes.

## Formato de salida recomendado

```txt
Diseño/API:
- Endpoint:
- Método:
- Propósito:
- Auth:
- Request:
- Response:
- Errores:
- Archivos modificados:
- Pendientes:
```
