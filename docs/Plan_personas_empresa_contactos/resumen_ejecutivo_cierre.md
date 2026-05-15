# Resumen ejecutivo de cierre

Fecha: 2026-04-28 (UTC)

## Situacion actual

El runtime activo del CRM ya opera sobre el modelo nuevo:

- `personas`
- `cuentas`
- `cuenta_personas`
- `direcciones`
- `cuenta_direcciones`

La tabla `public.contactos` quedo fuera del flujo operativo principal.

En paralelo, el backend activo se siguio limpiando para reducir vocabulario legacy:

- `storage.py` ya expone aliases de `persona` para captura de oportunidad, scoring,
  busqueda de sesiones webchat y resolucion de oportunidad principal
- `webchat`, `whatsapp` y `assistants` ya consumen varios de esos aliases nuevos
- la cara publica del panel ya habla de `persona`; lo que queda con `contact` es
  compatibilidad interna o historica de otros subsistemas

## Lo que ya se cerro

- Alta estructurada
- Edicion estructurada
- Flujo guiado de CRUD de personas
- Vinculacion independiente persona-empresa
- Exportacion desde backend
- Drawer real de detalle
- Busqueda y toolbar de personas
- Reasignacion compacta
- Retiro del fallback legacy en runtime
- Limpieza semantica mayoritaria del backend activo
- migracion parcial del backend interno hacia aliases `persona_*`

## Lo que sigue usando `contact`

Principalmente subsistemas internos y legacy que todavia no son parte del contrato
publico del panel:

- firmas de helpers compartidos
- parametros de notificacion y scoring
- wrappers entre `webchat`, `whatsapp` y `assistants`

## Lectura practica

La interfaz publica ya quedo alineada a `persona`. Lo pendiente es seguir reduciendo
el vocabulario legacy en capas internas donde no haya riesgo de romper integraciones.

## Conclusiones

- `contactos` ya no es la fuente activa del runtime.
- `contact` en nombres o firmas quedo como semantica heredada o compatibilidad interna,
  no como contrato publico del panel.
- La documentacion de cierre completa vive en la misma carpeta del plan.
