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
- los contratos publicos y varios nombres estructurales siguen conservando `contact`
  por compatibilidad, no por dependencia del modelo viejo

## Lo que ya se cerro

- Alta estructurada
- Edicion estructurada
- Flujo guiado de CRUD de contactos
- Vinculacion independiente contacto-empresa
- Exportacion desde backend
- Drawer real de detalle
- Busqueda y toolbar de contactos
- Reasignacion compacta
- Retiro del fallback legacy en runtime
- Limpieza semantica mayoritaria del backend activo
- migracion parcial del backend interno hacia aliases `persona_*`

## Lo que sigue usando `contact`

No porque siga dependiendo de `public.contactos`, sino por compatibilidad entre capas y contratos ya existentes.

Ejemplos:

- firmas publicas de helpers compartidos
- parametros de notificacion y scoring
- wrappers entre `webchat`, `whatsapp` y `assistants`

## Lectura practica

Hay dos caminos:

1. Dejar los contratos publicos como estan.
2. Hacer una refactorizacion coordinada para renombrar el contrato publico a `persona` en todo el backend.

## Recomendacion

Si la prioridad es estabilidad, dejar los contratos como estan.
Si la prioridad es coherencia semantica total, hacer la refactorizacion coordinada.

En este momento ya se avanzo en la refactorizacion coordinada por bloques, pero sin
renombrar todavia los contratos estructurales ni el esquema legado.

## Conclusiones

- `contactos` ya no es la fuente activa del runtime.
- `contact` en nombres o firmas ya es semantica heredada, no dependencia del modelo viejo.
- La documentacion de cierre completa vive en la misma carpeta del plan.
