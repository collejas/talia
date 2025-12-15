# Diseño de agente local para procesar búsquedas web en el tenant

## Objetivo
Descongestionar el servidor central moviendo el procesamiento intensivo (el crawler del buscador) al hardware del tenant, sin exponer el código fuente, y asegurando autenticación, entrega de resultados y actualizaciones automáticas.

## Arquitectura propuesta

1. **Agente chasquido** (binario empaquetado en Go/Rust/Node binarizado)
   - Lee configuración mínima (token del tenant, URL del backend, parámetros opcionales).
   - Consulta un endpoint: `GET /crm/prospeccion/buscador/agent/jobs?limit=1` para obtener job asignado.
   - Ejecuta el crawler local usando los mismos parámetros del backend (`run_buscador` empaquetado dentro del binario).
   - Envía resultados vía `POST /crm/prospeccion/buscador/jobs/{jobId}/results-proxy` (puedes reutilizar el endpoint actual renombrado).
   - Reporta estado (started/completed/failed) para que el backend pueda marcar `prospeccion_buscador_jobs`.

2. **Backend de coordinación**
   - Exporta endpoints nuevos para agentes: enlistar jobs pendientes, aceptar resultados, actualizar status parcial. Estos endpoints usan la misma tabla `prospeccion_buscador_jobs` pero con flag `agent_id`.
   - Mantiene tokens de agente en `prospeccion_agents` (creando registro al instalarse).
   - Ofrece endpoint `POST /crm/prospeccion/buscador/agent/{agentId}/update` indicando versión y URL del binario firmado.

3. **Instalación/autoarranque**
   - Se entrega un instalador (zip/tar) que coloca el binario y un servicio (systemd, Windows service) que arranca automáticamente.
   - El servicio crea un token en backend (usuario técnico) y lo guarda cifrado localmente.
   - El agente se registra automáticamente y entra en modo `polling` para recibir jobs.

4. **Actualizaciones seguras**
   - Cada ejecución, el agente consulta `GET /crm/prospeccion/buscador/agent/{agentId}/version`.
   - Si detecta nueva versión (hash firmada) la descarga desde CDN y verifica firma antes de sustituir binario.
   - Puede programar reinicio suave solo si no hay job en curso.

## Plan de implementación (lista con estado)

- [ ] Definir estructuras de identidad/registro de agentes en Supabase (`prospeccion_agents` con `token`, `last_seen`, `version`).
- [ ] Crear endpoints seguros para: enlistar jobs pendientes, reportar resultados y obtener instrucciones de actualización (ej. `/agent/jobs`, `/agent/results`, `/agent/version`).
- [ ] Empaquetar el motor del buscador en un agente autoejecutable que:
  - consume los endpoints anteriores,
  - ejecuta localmente `run_buscador`,
  - almacena resultados parciales en disco hasta confirmación,
  - verifica firma/versión antes de cada job.
- [ ] Diseñar flujo de instalación: instalador crea servicio, obtiene token y configura el agente para que arranque automáticamente.
- [ ] Implementar mecanismo de actualizaciones: backend publica versión/URL + hash, agente la descarga y la aplica sin revelar código.
- [ ] Documentar en el panel cómo el tenant habilita su agente, cómo ver logs y cómo reportar problemas de conectividad.

## Consideraciones de seguridad y operaciones

- La comunicación usa HTTPS y tokens confidenciales por tenant.
- Los binarios deben firmarse y validar el hash antes de ejecutar.
- El backend valida `agent_id` y `token` antes de aceptar resultados para evitar datos falsificados.
- Se debe incluir monitoreo de latencia/errores en los endpoints de agentes para detectar desconexiones y reintentos automáticos.

## Siguientes pasos

1. Validar que la infraestructura del tenant permite instalar servicios externos y tiene red saliente.
2. Prototipar el agente con un job de prueba y verificar que los resultados se registran en `prospeccion_buscador_resultados`.
3. Planificar una versión Beta con uno o dos tenants para ajustar el flujo de actualización/seguridad.

## Prototipo del agente

1. Crear un binario mínimo que:
   - Reciba parámetros del job vía archivo local o consulta a un endpoint de prueba.
   - Llama a `run_buscador` empaquetado y escribe la salida en JSON.
   - Envía el JSON al backend de pruebas a través del endpoint `/crm/prospeccion/buscador/jobs/{jobId}/results` (se puede usar un proxy temporal).
2. Instrumentar logs/errores para confirmar que el crawler se ejecuta de forma idéntica a como lo hace el server actual.
3. Simular una actualización sencilla (por ejemplo, con versión 0.1 vs 0.2) para probar descarga y reemplazo antes de automatizar la firma.
4. Recoger métricas de rendimiento (CPU/memoria) del tenant durante la ejecución para dimensionar mejor los requisitos.
