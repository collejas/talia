# AGENTS.md

## Proyecto

Este repositorio pertenece a GEOACTIV, una plataforma que crea software para sector gobierno y privado, integrando inteligencia artificial de visión y agentic AI.

GEOACTIV desarrolla soluciones para automatización, gestión operativa, análisis de datos, visión computacional, agentes inteligentes, reportes, paneles administrativos, mapas, flujos internos y servicios digitales.

El objetivo del proyecto es construir software claro, escalable, seguro, moderno y fácil de operar.

## Stack actual

### Lenguajes

* Python para el backend.
* TypeScript para el panel.
* JavaScript en scripts y partes del frontend.
* HTML/CSS para landing y páginas estáticas.
* SQL para base de datos y migraciones.

### Backend

* FastAPI.
* Uvicorn.
* Poetry para dependencias y entorno.
* OpenAI SDK.
* Twilio.
* Pydantic.
* HTTPX.
* WeasyPrint.
* Pandas.
* Requests.

### Frontend

* Next.js 16.
* React 19.
* Node.js + npm.
* Tailwind CSS 4.
* shadcn/ui.
* Radix UI.
* Leaflet, Mapbox GL y Recharts para mapas y gráficas.

### Base de datos

* PostgreSQL vía Supabase.
* Usar SQL claro, mantenible y seguro.
* Diseñar pensando en integridad, rendimiento y escalabilidad.

### Infraestructura y despliegue

* Nginx.
* systemd.
* Docker en backend.
* sudoers para deploy controlado.

### Sitio público / landing

* Sitio estático con HTML, CSS y JavaScript.
* Mantenerlo rápido, claro, ligero y fácil de publicar.

---

## Principios generales

* Priorizar claridad, mantenibilidad, seguridad y escalabilidad.
* No implementar soluciones improvisadas si afectan la arquitectura futura.
* Antes de crear algo nuevo, revisar si ya existe una estructura, patrón, componente, servicio, helper, script o módulo similar.
* Mantener el código simple, legible y fácil de modificar.
* Separar responsabilidades entre backend, frontend, base de datos, infraestructura y scripts.
* Evitar duplicidad de lógica.
* Preferir soluciones explícitas sobre soluciones mágicas o difíciles de entender.
* Todo cambio debe tener una intención clara de producto, operación o mantenimiento.

---

## Base de datos

### Regla principal

Toda información importante del negocio debe modelarse como columnas explícitas.

Evitar usar campos como:

* `metadata`
* `json`
* `jsonb`
* `extras`
* `data`
* `payload`
* `config`
* `settings`

para guardar información estructural importante del negocio.

### Cuándo sí se permite metadata/jsonb

Solo usar `metadata`, `jsonb` o estructuras similares cuando:

* La información sea realmente variable.
* No se consulte, filtre, ordene o relacione frecuentemente.
* No represente una regla central del negocio.
* No sea necesaria para reportes, permisos, estados, auditoría o lógica principal.
* Se justifique explícitamente antes de implementarlo.

### Regla fuerte

Si un dato se va a:

* consultar,
* filtrar,
* ordenar,
* validar,
* relacionar,
* mostrar frecuentemente,
* auditar,
* usar en permisos,
* usar en reportes,
* usar en dashboards,
* usar en lógica de negocio,

entonces debe ser una columna real.

### Al crear tablas

* Usar nombres claros y consistentes.
* Usar columnas explícitas.
* Agregar primary keys.
* Agregar foreign keys reales.
* Agregar índices a foreign keys.
* Agregar índices compuestos cuando aplique.
* Usar constraints para proteger integridad.
* Usar timestamps consistentes.
* Evitar columnas ambiguas como `tipo`, `estado`, `datos`, `valor` o `configuracion` sin contexto claro.
* Pensar desde el inicio en reportes, auditoría, permisos y rendimiento.
* No esconder estructura de negocio dentro de JSON.

### PostgreSQL / Supabase

* Diseñar tablas pensando en PostgreSQL real, no solo en comodidad temporal.
* Cuidar índices para consultas frecuentes.
* Cuidar relaciones entre entidades.
* Evitar queries costosas innecesarias.
* Usar migraciones claras y reversibles cuando sea posible.
* Validar que los cambios no rompan datos existentes.

---

## Backend

### FastAPI

* Mantener endpoints claros y con responsabilidad única.
* Usar Pydantic para validación de entrada y salida.
* Separar rutas, servicios, modelos, esquemas y lógica de negocio.
* Evitar lógica compleja directamente dentro de endpoints.
* Preferir services o módulos especializados para procesos de negocio.
* Manejar errores con respuestas claras y consistentes.
* No exponer información sensible en errores.
* Validar permisos y ownership antes de devolver o modificar datos.

### Python

* Código claro y tipado cuando sea posible.
* Funciones pequeñas y con propósito definido.
* Evitar scripts monolíticos.
* Evitar duplicación.
* Manejar excepciones de forma explícita.
* No silenciar errores sin registrar contexto útil.
* Usar nombres descriptivos.
* Mantener imports limpios.

### Integraciones IA

* Separar prompts, herramientas, configuración y lógica de negocio.
* No mezclar prompts importantes directamente dentro de endpoints si pueden modularizarse.
* Versionar o documentar prompts importantes.
* Validar entradas antes de mandarlas a modelos.
* Registrar eventos relevantes sin guardar información sensible innecesaria.
* Diseñar flujos de agentes de manera observable y controlable.

### Twilio/Meta / mensajería

* Separar webhooks, procesamiento, persistencia y respuesta.
* Evitar duplicación de mensajes.
* Validar remitentes y estados.
* Registrar eventos importantes.
* No bloquear webhooks con procesos largos si se pueden desacoplar.

---

## Frontend / panel

### Next.js / React

* Usar componentes claros, reutilizables y bien nombrados.
* Separar UI, lógica de datos y estado.
* Evitar componentes gigantes.
* Mantener formularios ordenados por secciones lógicas.
* Usar TypeScript de forma útil, no decorativa.
* Evitar `any` salvo justificación.
* Manejar estados de carga, error, vacío y éxito.
* Priorizar rendimiento y legibilidad.

### shadcn/ui, Radix UI y Tailwind

* Usar componentes de forma consistente.
* Mantener una jerarquía visual clara.
* Evitar estilos improvisados cuando ya existe un patrón.
* Preferir composición limpia.
* No saturar vistas con adornos innecesarios.
* Mantener espaciados, tamaños y jerarquías consistentes.

### Mapas y gráficas

* Usar Leaflet, Mapbox GL o Recharts según convenga.
* No cargar mapas o gráficas pesadas sin necesidad.
* Mostrar información geográfica de forma clara.
* Usar leyendas, estados vacíos y filtros cuando aplique.
* Evitar visualizaciones bonitas pero poco útiles.

---

## UI / UX

La interfaz debe ser:

* Minimalista.
* Práctica.
* Lógica.
* Funcional.
* Moderna.
* Rápida de usar.
* Clara para usuarios operativos.
* Enfocada en flujos reales de trabajo.

### Evitar

* Pantallas saturadas.
* Formularios enormes sin secciones.
* Botones sin jerarquía visual.
* Acciones importantes escondidas.
* Exceso de modales.
* Componentes decorativos sin función.
* Tablas ilegibles.
* Filtros inútiles.
* Flujos con demasiados pasos.
* Interfaces bonitas pero lentas o confusas.

### Preferir

* Layouts limpios.
* Agrupación por secciones lógicas.
* Acciones principales visibles.
* Acciones secundarias discretas.
* Estados claros: vacío, cargando, error, éxito.
* Formularios divididos por intención.
* Tablas fáciles de leer.
* Filtros realmente útiles.
* Vistas que ayuden a decidir rápido.
* Flujos que reduzcan trabajo operativo.
* Diseño visual sobrio, moderno y profesional.

### Regla de diseño

Cada pantalla debe responder claramente:

1. ¿Qué estoy viendo?
2. ¿Qué debo hacer aquí?
3. ¿Cuál es la acción principal?
4. ¿Qué información es prioritaria?
5. ¿Qué puede quedar como secundario?

---

## Sitio público / landing

* Mantener HTML, CSS y JS simples.
* Priorizar velocidad de carga.
* Mensajes claros y comerciales.
* Diseño limpio y profesional.
* Evitar dependencias innecesarias.
* Mantener llamadas a la acción visibles.
* Cuidar SEO básico, accesibilidad y responsive design.

---

## Infraestructura y deploy

* Respetar configuración existente de Nginx, systemd y Docker.
* No modificar archivos de despliegue sin revisar impacto.
* No asumir permisos de servidor sin validar.
* Mantener scripts de deploy claros y seguros.
* Documentar comandos importantes.
* Cuidar variables de entorno.
* Nunca exponer secretos, tokens, llaves API o credenciales.
* Usar sudoers controlado solo para tareas necesarias.

---

## Seguridad

* No exponer secretos.
* No imprimir tokens en logs.
* No guardar credenciales en el repositorio.
* Validar entradas del usuario.
* Validar permisos antes de acceder a datos.
* Evitar endpoints demasiado abiertos.
* Manejar CORS con intención clara.
* Evitar SQL inseguro.
* Revisar riesgos antes de entregar cambios.

---

## Estilo de trabajo para Codex

Antes de modificar código:

1. Revisar la estructura existente.
2. Identificar patrones ya usados.
3. Ubicar archivos relacionados.
4. Entender el flujo actual.
5. Proponer un plan corto si la tarea toca varias capas.

Al implementar:

1. Hacer cambios pequeños y coherentes.
2. Respetar arquitectura existente.
3. No mezclar refactors grandes con features pequeñas.
4. No crear archivos innecesarios.
5. No duplicar lógica.
6. Mantener nombres claros.
7. Pensar en mantenimiento futuro.

Antes de terminar:

1. Revisar el diff.
2. Verificar migraciones si existen.
3. Revisar riesgos de seguridad.
4. Revisar consistencia UI/UX.
5. Revisar posibles errores de tipos.
6. Mencionar archivos modificados.
7. Explicar decisiones importantes.
8. Mencionar pendientes o riesgos si existen.

---

## Criterio de terminado

Una tarea se considera terminada cuando:

* El cambio cumple el objetivo solicitado.
* El código es claro y mantenible.
* No rompe patrones existentes.
* No introduce datos importantes en metadata/jsonb sin justificación.
* La UI es lógica, limpia y funcional.
* La base de datos está bien modelada.
* Los permisos y seguridad fueron considerados.
* Se explican los cambios realizados.


## Skills disponibles

Este repositorio usa skills especializados dentro de `.agents/skills/`.

Los skills complementan estas instrucciones globales, pero no las sustituyen.
Cuando una tarea coincida con el propósito de un skill, Codex debe considerar usarlo antes de implementar cambios.

### geoactiv-db-designer

Ruta:

```txt
.agents/skills/geoactiv-db-designer/
```

Usar cuando se diseñen o modifiquen:

* Tablas.
* Migraciones.
* Columnas.
* Relaciones.
* Foreign keys.
* Índices.
* Constraints.
* Consultas SQL.
* Estructura de base de datos.

Este skill debe reforzar la regla principal de GEOACTIV:

* Toda información importante del negocio debe modelarse como columnas explícitas.
* Evitar `metadata`, `jsonb`, `payload`, `extras`, `data` o similares para datos estructurales importantes.

### supabase-postgres-best-practices

Ruta:

```txt
.agents/skills/supabase-postgres-best-practices/
```

Usar cuando la tarea involucre:

* PostgreSQL.
* Supabase.
* SQL.
* Diseño de esquemas.
* Índices.
* Optimización de queries.
* Performance.
* Connection pooling.
* Row-Level Security.
* Concurrency.
* Diagnóstico de base de datos.

Este skill es especialista en buenas prácticas de Supabase/Postgres y debe complementar el skill `geoactiv-db-designer`.

### geoactiv-ui-ux

Ruta:

```txt
.agents/skills/geoactiv-ui-ux/
```

Usar cuando se diseñen, creen o refactoricen:

* Pantallas.
* Formularios.
* Dashboards.
* Landings.
* Componentes visuales.
* Flujos de usuario.
* Tablas visuales.
* Mapas.
* Gráficas.

La interfaz debe ser minimalista, práctica, lógica, moderna y funcional.

### geoactiv-feature-builder

Ruta:

```txt
.agents/skills/geoactiv-feature-builder/
```

Usar cuando se cree o modifique una funcionalidad completa que pueda tocar varias capas:

* Backend.
* Frontend.
* Base de datos.
* APIs.
* Servicios.
* Panel.
* Landing.
* Integraciones.
* Automatizaciones.

Este skill debe coordinar los demás skills cuando aplique.

### geoactiv-api-designer

Ruta:

```txt
.agents/skills/geoactiv-api-designer/
```

Usar cuando se diseñen, creen o refactoricen:

* APIs.
* Endpoints.
* Rutas FastAPI.
* Schemas Pydantic.
* Contratos JSON.
* Validaciones.
* Paginación.
* Filtros.
* Errores.
* Integración entre frontend y backend.

Las APIs deben ser claras, consistentes, seguras y fáciles de consumir desde el panel.

### geoactiv-security-review

Ruta:

```txt
.agents/skills/geoactiv-security-review/
```

Usar cuando se revise:

* Seguridad.
* Autenticación.
* Autorización.
* Permisos.
* Exposición de datos.
* Secretos.
* Logs.
* Webhooks.
* CORS.
* SQL.
* Supabase.
* RLS.
* Deploy.
* Nginx.
* systemd.
* Docker.
* sudoers.

Este skill debe usarse especialmente antes de cerrar cambios sensibles o antes de hacer commit en funcionalidades críticas.

## Orden recomendado de uso de skills

Cuando una tarea sea amplia, Codex debe combinar skills según el tipo de trabajo.

Ejemplos:

### Para crear una nueva funcionalidad completa

Usar:

```txt
geoactiv-feature-builder
geoactiv-api-designer
geoactiv-db-designer
geoactiv-ui-ux
geoactiv-security-review
```

### Para diseñar base de datos

Usar:

```txt
geoactiv-db-designer
supabase-postgres-best-practices
```

### Para crear o mejorar una API

Usar:

```txt
geoactiv-api-designer
geoactiv-security-review
```

### Para crear o mejorar una pantalla

Usar:

```txt
geoactiv-ui-ux
geoactiv-feature-builder
```

### Para revisar antes de entregar

Usar:

```txt
geoactiv-security-review
```

## Regla final

Si hay conflicto entre un skill y este `AGENTS.md`, prevalecen las reglas globales del proyecto definidas en este archivo.

Si un skill aporta reglas más específicas sin contradecir este archivo, deben aplicarse ambas.
