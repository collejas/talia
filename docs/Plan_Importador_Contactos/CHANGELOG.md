# Change log - Plan importador de contactos

Este archivo registra el avance, las decisiones y las validaciones del plan documentado en `PLAN_IMPORTADOR_CONTACTOS.md`.

## Estado actual

- Estado: `Propuesta documentada`
- Última actualización: 2026-09-10 (UTC)
- Código implementado: no
- Migraciones aplicadas: no
- Despliegue realizado: no
- Prueba funcional autenticada: pendiente

## 2026-09-10 - Diagnóstico y documentación inicial

### Agregado

- Idea de negocio para importar contactos desde CSV/XLSX.
- Restricción de acceso para roles `vendedor`, `agente` y `supervisor`, además de usuarios `owner` y `admin`.
- Regla de ownership: el contacto queda asignado al usuario que sube el archivo.
- Inventario de componentes actuales de Contactos.
- Inventario del importador existente de prospectos.
- Propuesta de endpoint `POST /crm/personas/importar`.
- Plan por fases: confirmación funcional, seguridad/contrato, backend, frontend y validación real.
- Riesgos y controles de seguridad.
- Criterios de terminado.

### Encontrado

- La vista usa `contacts-data-table.tsx` como barra de acciones y ya consulta el contexto de permisos.
- El frontend ya reconoce los roles comerciales `vendedor` y `agente`; `supervisor`, `owner` y `admin` deberán incorporarse a la condición final.
- El modelo canónico de contactos usa `personas` y tiene `propietario_usuario_id`.
- El alta individual existente usa `POST /crm/personas/alta`.
- El importador existente corresponde a prospectos y no debe conectarse directamente al flujo de Contactos.
- Existe una migración con lógica de autoasignación de contactos creados por vendedores, pero el nuevo importador debe forzar explícitamente el propietario desde la sesión en backend.

### No realizado

- No se modificó código.
- No se modificó el esquema ni se ejecutaron migraciones.
- No se modificaron datos.
- No se hizo deploy.
- No se declaró ownership funcionalmente probado.

### Pendientes inmediatos

- Confirmar el identificador exacto del rol `supervisor` en cada tenant (`supervisor`, código interno u otro alias).

## 2026-09-10 - Ampliación de perfiles autorizados

### Decisión

- Se amplió el acceso propuesto para incluir `supervisor`, `owner` y `admin`, además de `vendedor` y `agente`.
- La regla de asignación no cambia: cada contacto queda asignado al usuario autenticado que realiza la importación.
- Estos perfiles no podrán indicar desde el archivo que el contacto pertenece a otro vendedor.

### Pendiente

- Verificar el nombre o código real del rol `supervisor` en la matriz de permisos de cada tenant.
- Confirmar columnas mínimas y formato oficial del archivo.
- Definir tratamiento de duplicados existentes.
- Definir límite inicial de filas y tamaño de archivo.

## Formato para futuras entradas

Cada cambio debe registrar:

```text
## YYYY-MM-DD - Título

### Cambiado
- ...

### Validado
- ...

### Pendiente
- ...

### Riesgos
- ...
```
