# Plan: importador de contactos para usuarios comerciales

Fecha de diagnóstico: 2026-09-10 (UTC)  
Estado: implementación local del permiso configurable; pendiente migración aplicada, despliegue y prueba autenticada.

## 1. Idea de producto

Agregar un botón **Importar contactos** en la vista de Contactos para permitir que los usuarios con rol comercial carguen un archivo CSV o Excel y creen contactos en lote.

El importador debe estar disponible únicamente para usuarios con alguno de estos perfiles:

- `vendedor`
- `agente`
- `supervisor`
- `owner` / dueño
- `admin` / administrador

Cada contacto creado desde este flujo debe quedar asignado automáticamente al usuario autenticado que realizó la carga. El usuario no debe poder elegir otro vendedor desde el archivo ni desde el request.

## 2. Diagnóstico actual

### Lo que ya existe

- La vista de contactos está en `frontend/panel/src/app/contactos`.
- La barra de acciones se construye en `frontend/panel/src/components/contactos/contacts-data-table.tsx`.
- El panel ya consulta `/api/permissions` y recibe roles, permisos, `usuario_id` y organización.
- `contacts-data-table.tsx` ya contiene una función que reconoce `agente` y `vendedor` como roles comerciales.
- El contexto de permisos ya expone `es_owner` y `es_admin`, que pueden utilizarse para mostrar la acción a dueños y administradores.
- El modelo operativo actual usa `personas` como entidad canónica y `cuenta_personas` para relaciones con empresas.
- Los contactos tienen la columna explícita `personas.propietario_usuario_id`.
- El backend cuenta con alta individual mediante `POST /crm/personas/alta`.
- Existe un importador CSV/XLS/XLSX para prospectos en `frontend/panel/src/components/prospeccion/prospectos-importador.tsx`.
- El paquete frontend ya incluye `xlsx`.
- Hay lógica de autoasignación en `supabase/migrations/20280510_092000_contactos_creator_owner.sql` que contempla al creador vendedor, aunque no debe ser la única garantía del nuevo flujo.

### Lo que ya fue implementado

- Existe un botón y componente importador dedicado a `personas`.
- Existe el endpoint batch `POST /crm/personas/importar` y su proxy del panel.
- El backend establece explícitamente el usuario validado de sesión como `propietario_usuario_id`.
- La visibilidad y autorización del importador usan el permiso `contacts.import`.
- El importador de prospectos sigue separado y no se reutiliza para contactos.

### Administración desde Settings/RH

- El permiso `contacts.import` se muestra en el catálogo de permisos de la organización.
- La matriz de roles de `settings/usuarios/roles` permite asignarlo o quitarlo de cualquier rol.
- La edición de usuarios de `settings/usuarios` permite asignar o quitar el rol que contiene ese permiso.
- La migración agrega el permiso a organizaciones existentes y lo asigna inicialmente a roles llamados `vendedor`, `agente` y `supervisor` cuando existen.
- Dueños y administradores conservan el acceso automático mediante el contexto de permisos existente.

## 3. Decisión técnica recomendada

Crear un flujo específico de contactos, separado del importador de prospectos:

```text
Vista Contactos
  -> Importador CSV/XLSX
  -> Preview y validación en frontend
  -> POST /api/personas/importar
  -> POST /crm/personas/importar
  -> servicio de importación
  -> personas + cuentas + cuenta_personas
```

La autorización debe existir en dos capas:

1. Frontend: no renderizar el botón si el usuario no tiene `contacts.import`, ni es `owner` o `admin`.
2. Backend: volver a resolver el contexto de permisos desde la sesión/JWT y rechazar cualquier llamada sin `contacts.import`, salvo owner/admin.

La autorización ya no depende de nombres hardcodeados de roles. Por eso un supervisor puede recibir o perder el permiso desde la matriz de `Settings/RH`, sin modificar código.

Los roles `admin`, `owner` y `supervisor` quedan incluidos en esta propuesta. La asignación seguirá siendo al usuario que realiza la carga; ser administrador, dueño o supervisor no debe permitir seleccionar arbitrariamente a otro propietario dentro del importador.

## 4. Contrato propuesto

### Endpoint

```text
POST /crm/personas/importar
```

El proxy del panel sería:

```text
POST /api/personas/importar
```

### Request

El request debe aceptar únicamente campos importables. No debe aceptar `propietario_usuario_id`, `organizacion_id` ni un usuario objetivo controlado por el cliente.

Ejemplo conceptual:

```json
{
  "items": [
    {
      "nombre": "Ana",
      "apellido_paterno": "López",
      "apellido_materno": "García",
      "correo_principal": "ana@example.com",
      "telefono_principal_e164": "+525500000000",
      "company_name": "Empresa Demo",
      "puesto": "Directora",
      "origen": "importacion_contactos"
    }
  ]
}
```

El backend debe obtener de la sesión:

```text
organizacion_id = organización de la sesión
usuario_id = usuario autenticado
```

Y debe escribir en cada alta:

```text
propietario_usuario_id = usuario_id de la sesión
```

## 5. Reglas funcionales

- Formatos iniciales: CSV y XLSX. El soporte XLS puede dejarse para una fase posterior si el backend no lo procesa de forma segura y consistente.
- Mostrar plantilla descargable con nombres de columnas aceptados.
- Mostrar vista previa antes de guardar.
- Normalizar nombres, correos y teléfonos.
- Detectar duplicados dentro del archivo.
- Detectar coincidencias existentes por correo y teléfono.
- Reportar filas creadas, omitidas y con error.
- Mantener la organización tomada de la sesión, nunca del archivo.
- No permitir asignar contactos a otro vendedor desde este flujo.
- Considerar idempotencia para evitar duplicados si el usuario repite la misma solicitud.
- Definir un máximo de filas por lote y un límite de tamaño de archivo.
- Si el alta crea una empresa, crear o reutilizar la cuenta respetando las reglas actuales de `personas`, `cuentas` y `cuenta_personas`.

## 6. Archivos y áreas que probablemente cambiarán

### Frontend

- `frontend/panel/src/components/contactos/contacts-data-table.tsx`
- Nuevo componente `frontend/panel/src/components/contactos/contactos-importador.tsx`
- Nuevo proxy `frontend/panel/src/app/api/personas/importar/route.ts`
- Posibles tipos/helpers en `frontend/panel/src/lib/contactos`

### Backend

- `backend/app/api/routes/crm.py`
- Nuevo servicio o funciones especializadas para parseo, validación y lote
- `backend/app/repositories/crm.py`
- Tests de API, permisos, duplicados y ownership

### Base de datos

En principio no se necesita una nueva tabla para el MVP. Deben revisarse únicamente:

- `personas.propietario_usuario_id`
- integridad de propietario dentro de la organización
- triggers de autoasignación existentes
- RLS y permisos de escritura

Una tabla de lotes/importaciones sería recomendable en una segunda fase si se requiere auditoría detallada, reintentos, cancelación o procesamiento asíncrono.

## 7. Riesgos y controles

| Riesgo | Control requerido |
|---|---|
| Ocultar el botón pero dejar abierto el endpoint | Validación de rol en backend |
| El cliente envía otro vendedor | Ignorar el campo y usar el usuario de sesión |
| Contactos asignados entre organizaciones | Validar organización y FK compuesta |
| Duplicados por reintento | `request_id`/idempotencia y deduplicación por correo/teléfono |
| Archivo demasiado grande | Límite de bytes y filas |
| Importación parcial difícil de explicar | Resumen por fila y errores seguros |
| Creación accidental de empresas duplicadas | Reutilizar las reglas de deduplicación del alta actual |
| Exposición de datos personales en logs | No registrar archivos ni payloads completos |
| Proceso largo dentro de una petición | Evaluar lote asíncrono si el volumen supera el límite operativo |

## 8. Plan de implementación

### Fase 0 - Confirmación funcional

- Confirmar columnas mínimas del archivo.
- Confirmar el identificador exacto del rol `supervisor` en cada tenant (`supervisor`, código interno u otro alias).
- Definir política para duplicados existentes: omitir, actualizar o pedir confirmación.
- Definir límite inicial de filas y tamaño.

### Fase 1 - Contrato y seguridad

- Crear schema Pydantic específico para importación.
- Crear y sembrar el permiso específico `contacts.import`.
- Validar `contacts.import` y tenant en backend.
- Forzar `propietario_usuario_id` desde la sesión.
- Definir respuesta consistente con `created`, `skipped`, `errors` y detalle de filas.

### Fase 2 - Backend

- Implementar normalización y deduplicación.
- Reutilizar la lógica de alta de persona/cuenta sin duplicarla.
- Agregar idempotencia.
- Agregar pruebas de autorización y asignación.

### Fase 3 - Frontend

- Agregar botón condicional junto a `Nuevo contacto`.
- Crear modal o Sheet de importación.
- Agregar descarga de plantilla.
- Agregar selección de archivo, preview, estados de carga/error/éxito y resumen.
- Refrescar la tabla después de una importación exitosa.

### Fase 4 - Validación real

- Probar con `vendedor`.
- Probar con `agente`.
- Probar con `supervisor`.
- Probar con `owner` y `admin`.
- Probar con un rol no autorizado y confirmar que el botón no aparece y el endpoint responde 403.
- Confirmar en base de datos que todos los registros tienen como propietario al usuario que subió el archivo.
- Probar duplicados, errores de formato, reintento y separación entre tenants.
- Validar la experiencia en viewport normal, sin depender de zoom reducido.

## 9. Criterios de terminado

La funcionalidad podrá considerarse terminada cuando:

- El botón solo aparezca para usuarios con `contacts.import`, además de `owner` y `admin`.
- `contacts.import` pueda asignarse o quitarse a un rol desde `Settings/RH`.
- El backend rechace usuarios sin `contacts.import`.
- El propietario se tome de la sesión y no del archivo.
- Los contactos importados se lean nuevamente mostrando al vendedor correcto.
- La importación reporte claramente creados, omitidos y errores.
- Los duplicados y reintentos tengan comportamiento definido y probado.
- No haya datos de otro tenant ni secretos en logs/respuestas.
- Existan pruebas automatizadas y una prueba funcional autenticada con datos controlados.

## 10. Conclusión del diagnóstico

La funcionalidad es viable y puede construirse sin cambiar el modelo principal de contactos. El trabajo principal está en crear el endpoint batch, conectar el importador con el modelo canónico `personas` y garantizar server-side que el propietario sea el usuario autenticado.

La asignación automática existente en base de datos es una ayuda, pero no debe sustituir la validación explícita del nuevo endpoint ni servir como única evidencia de ownership.
