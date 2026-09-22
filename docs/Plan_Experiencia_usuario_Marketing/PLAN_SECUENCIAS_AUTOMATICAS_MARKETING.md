# Plan de secuencias automáticas de Marketing

**Proyecto:** Tal-IA  
**Estado:** Propuesta funcional pendiente de implementación  
**Fecha:** 2026-09-22  
**Plan relacionado:** [`../Plan_Experiencia_usuario/PLAN_ARQUITECTURA_Y_REFACTOR_PROSPECCION_MARKETING.md`](../Plan_Experiencia_usuario/PLAN_ARQUITECTURA_Y_REFACTOR_PROSPECCION_MARKETING.md)  
**Changelog relacionado:** [`../Plan_Experiencia_usuario/CHANGELOG.md`](../Plan_Experiencia_usuario/CHANGELOG.md)

## 1. Propósito

Definir una capacidad de seguimiento automático para que una campaña pueda enviar varios contenidos en distintos momentos, únicamente cuando la persona no haya respondido ni avanzado en el proceso comercial.

Ejemplo:

```text
Campaña: Inmobiliarias
│
├── Paso 1 · Primer contacto
├── Paso 2 · Seguimiento
└── Paso 3 · Oferta
```

La secuencia debe ayudar a dar seguimiento sin repetir mensajes innecesariamente y sin continuar contactando a una persona que ya respondió, avanzó en el embudo, pidió una baja o dejó de ser elegible.

Esta capacidad amplía la experiencia definida en el plan principal:

```text
Lista para contactar → Campaña → Contenido → Revisar → Envío → Resultados
```

La secuencia agrega una decisión posterior controlada:

```text
Resultado del paso anterior
        ↓
¿La persona sigue sin avanzar?
        ↓ sí
Programar el siguiente paso
```

## 2. Relación con la experiencia aprobada

El plan principal define los objetos visibles:

| Concepto | Responsabilidad |
|---|---|
| Lista para contactar | Define a quién puede contactarse mediante reglas dinámicas. |
| Campaña | Define el objetivo comercial. |
| Correo, mensaje o guion | Define el contenido de un contacto. |
| Envío | Representa una ejecución concreta. |
| Resultados | Muestra qué ocurrió. |
| Secuencia | Ordena varios envíos con tiempos y condiciones. |

La secuencia no reemplaza los objetos existentes. Los coordina.

```text
Lista para contactar
        ↓
Campaña
        ↓
Secuencia
  ├── Paso 1 + Contenido + tiempo + condición
  ├── Paso 2 + Contenido + tiempo + condición
  └── Paso 3 + Contenido + tiempo + condición
        ↓
Envíos independientes
        ↓
Resultados por paso y de la secuencia completa
```

## 3. Alcance

### Incluido

- Crear una secuencia dentro de una campaña.
- Definir el orden de los pasos.
- Asociar un correo, mensaje o guion a cada paso.
- Definir cuánto tiempo esperar antes del siguiente paso.
- Definir qué debe ocurrir para continuar o detenerse.
- Revisar cuántas personas podrían recibir cada paso.
- Crear envíos independientes por cada paso.
- Detener automáticamente una secuencia cuando la persona avance.
- Consultar resultados por campaña, paso, contenido, lista y envío.
- Mantener historial y trazabilidad de cada decisión.

### No incluido en este plan

- Cambiar los proveedores actuales.
- Cambiar los workers de Correo o WhatsApp.
- Cambiar la separación, cuotas, límites o métodos de envío existentes.
- Crear una nueva forma de enviar fuera del flujo actual.
- Permitir una mezcla automática de canales dentro de una misma secuencia.
- Reemplazar las campañas actuales por un modelo nuevo.

Correo continúa regido por `docs/Plan_Postmark`. WhatsApp y Voz continúan utilizando sus métodos, workers y proveedores actuales.

## 4. Modelo de usuario

La interfaz no debe mostrar términos como `step`, `workflow`, `batch`, `trigger`, `delay` o `condition`.

El usuario debe ver:

```text
Seguimiento automático

Después del primer contacto, Tal-IA esperará el tiempo indicado.
Si la persona no responde ni avanza, enviará el siguiente contenido.
```

Nombre visible recomendado:

```text
Secuencia de seguimiento
```

## 5. Creación de una secuencia

La entrada recomendada es:

```text
Marketing → Canal → Campaña → Seguimiento automático
```

También puede iniciarse después de crear un envío:

```text
Crear envío → Enviar ahora o programar seguimiento
```

La campaña y el canal ya están definidos. Tal-IA no debe volver a preguntarlos.

### Paso inicial

```text
SEGUIMIENTO AUTOMÁTICO

Campaña: Inmobiliarias
Canal: WhatsApp
Lista inicial: Inmobiliarias nuevas

[ + Agregar paso ]
```

### Cada paso debe definir

- Nombre visible del paso.
- Contenido compatible con el canal.
- Tiempo después del contacto anterior.
- Condición para continuar.
- Límite de personas para esa ejecución, si aplica.
- Estado activo o pausado.

Ejemplo:

```text
Paso 1 · Primer contacto
Contenido: Presentación Tal-IA
Cuándo: Ahora

Paso 2 · Seguimiento
Contenido: Beneficios para inmobiliarias
Cuándo: 3 días después
Continuar solo si: no respondió y no avanzó

Paso 3 · Último intento
Contenido: Oferta de demostración
Cuándo: 5 días después del paso 2
Continuar solo si: no respondió y no avanzó
```

## 6. Reglas para continuar o detenerse

Antes de crear cada nuevo envío, Tal-IA debe volver a consultar la situación actual de la persona.

### Puede continuar si

- La persona sigue perteneciendo a la Lista para contactar.
- No respondió desde el paso anterior.
- No tiene una oportunidad activa o ganada.
- No se convirtió en cliente.
- No pidió dejar de recibir contactos.
- El canal sigue siendo válido.
- No alcanzó el límite de contactos configurado.
- No recibió previamente el mismo paso.
- La campaña y la secuencia siguen activas.

### Debe detenerse si

- Respondió.
- Se creó una oportunidad.
- La oportunidad avanzó al estado configurado como conversión.
- Se convirtió en cliente.
- Pidió una baja.
- Fue bloqueada para el canal.
- El medio dejó de ser válido.
- Alcanzó el máximo de intentos.
- La campaña fue pausada o cancelada.
- La persona dejó de cumplir las reglas de la lista.

La regla visible debe ser comprensible:

```text
Continuar solo con personas que no hayan respondido ni avanzado.
```

Los operadores técnicos `AND`, `OR`, `IN` y códigos internos no deben aparecer en la interfaz normal.

## 7. Calendario de seguimiento

El tiempo debe contar desde un evento claro, preferentemente desde el contacto anterior procesado, no desde la fecha en que se diseñó la secuencia.

Ejemplo:

```text
Paso 1 enviado: lunes 10:00
Espera: 3 días
Paso 2 elegible: jueves 10:00
```

Si el paso anterior falló y no hubo contacto real, la secuencia no debe asumir automáticamente que la persona fue contactada. El comportamiento debe depender del estado final del envío y de la política del canal.

La programación debe respetar:

- Horarios permitidos de contacto.
- Zona horaria de la organización.
- Límites diarios existentes.
- Reglas del proveedor.
- Pausas de la campaña.
- Bajas y bloqueos registrados después del paso anterior.

## 8. Envíos generados

Cada paso genera un envío independiente:

```text
Campaña: Inmobiliarias

Envío 1 · Primer contacto
Envío 2 · Seguimiento
Envío 3 · Oferta
```

Esto permite medir correctamente:

- Personas alcanzadas por paso.
- Entregas por paso.
- Respuestas por paso.
- Oportunidades por paso.
- Conversiones por paso.
- Personas que abandonaron la secuencia.
- Personas que completaron todos los pasos sin responder.

Una secuencia nunca debe enviar directamente. Debe solicitar la creación de un envío usando el flujo actual y sus validaciones de elegibilidad.

## 9. Protección contra duplicados

Antes de programar un paso, el backend debe comprobar de forma atómica:

- Que no exista otro envío activo del mismo paso para la misma persona.
- Que la persona no haya recibido ya el paso.
- Que no exista una respuesta posterior al paso anterior.
- Que no exista una oportunidad o conversión posterior.
- Que no se haya registrado una baja o bloqueo.

La revalidación debe ocurrir nuevamente antes de crear los destinatarios reales.

No se debe confiar únicamente en la lista de personas guardada cuando se programó el paso anterior.

## 10. Estados visibles

### Secuencia

| Estado interno conceptual | Texto visible |
|---|---|
| draft | Borrador |
| active | Activa |
| paused | Pausada |
| completed | Terminada |
| canceled | Cancelada |
| failed | Requiere atención |

### Persona dentro de la secuencia

| Estado conceptual | Texto visible |
|---|---|
| pending | Esperando el siguiente paso |
| scheduled | Programada |
| sent | Contactada |
| responded | Respondió |
| advanced | Avanzó |
| converted | Convertida |
| stopped_opt_out | Pidió no ser contactada |
| stopped_invalid | Medio no válido |
| completed_without_response | Terminó la secuencia sin respuesta |

## 11. Resultados

La vista de Resultados debe permitir consultar:

```text
Campaña
  → Secuencia
    → Paso
      → Contenido
        → Lista para contactar
          → Envío
            → Persona
```

El resumen de una secuencia debe mostrar:

- Personas que iniciaron.
- Personas que recibieron el primer contacto.
- Personas que llegaron al segundo paso.
- Personas que llegaron al tercer paso.
- Respuestas.
- Oportunidades.
- Conversiones.
- Detenciones por respuesta, baja, bloqueo o avance.
- Personas que terminaron sin responder.

No se deben sumar personas de todos los pasos como si fueran personas únicas. La interfaz debe distinguir:

- Contactos realizados.
- Personas únicas contactadas.
- Personas activas en la secuencia.
- Personas que avanzaron.

## 12. Modelo técnico conceptual

La secuencia representa una configuración. El envío sigue siendo la unidad de ejecución.

```text
Campaña
  ├── Configuración de secuencia
  │     ├── Paso 1
  │     ├── Paso 2
  │     └── Paso 3
  └── Envíos generados
```

Los conceptos deben mapearse primero contra tablas, columnas, jobs y endpoints existentes. Este documento no obliga a crear tablas nuevas ni a renombrar estructuras actuales.

Regla de implementación:

```text
Si la capacidad existe: reutilizarla.
Si existe con otro nombre: mapearla.
Si realmente no existe: crear solo lo necesario.
```

Si falta una estructura para conservar el paso, la condición, la programación o la relación con el envío, se debe diseñar una migración explícita, reversible y tenant-safe.

No se debe guardar la estructura principal de la secuencia únicamente en `metadata` o `jsonb` si se va a consultar, filtrar, ordenar, auditar o usar en la lógica de ejecución.

## 13. Relación con los planes existentes

### Plan de Experiencia de Usuario

Este documento amplía el flujo aprobado en:

- Fase F3: Contenido por canal.
- Fase F4: Creación y ejecución de envíos.
- Fase F5: Resultados, historial y navegación por campaña/envío.

No modifica la arquitectura principal:

```text
Búsqueda → Prospección → Lista para contactar → Marketing → Resultados → CRM
```

Solo agrega una capacidad posterior dentro de Marketing:

```text
Campaña → Secuencia de seguimiento → Envíos condicionados
```

### Plan de Correo

La secuencia no cambia Postmark, Brevo, sus cuotas, separación, workers ni webhooks. Cada paso debe usar el mismo contrato de envío de Correo ya aprobado.

### WhatsApp y Voz

La secuencia tampoco cambia los métodos actuales. Solo decide si corresponde solicitar un nuevo envío o llamada después de volver a validar elegibilidad.

## 14. Fases propuestas

### S0 — Baseline

- Confirmar cómo se registra actualmente el avance del prospecto.
- Confirmar eventos de respuesta, oportunidad, cliente, baja y bloqueo.
- Confirmar programación existente.
- Confirmar jobs o workers disponibles.
- Definir si una campaña puede tener una sola secuencia activa o varias.

**Salida:** matriz de capacidades existentes y faltantes.

### S1 — Diseño de secuencia

- Crear, editar, duplicar, activar y pausar una secuencia.
- Agregar y ordenar pasos.
- Seleccionar contenido compatible.
- Definir esperas y reglas visibles.
- Validar que todos los pasos pertenezcan al canal de la campaña.

**Salida:** el usuario puede construir una secuencia sin ejecutar envíos.

### S2 — Programación condicionada

- Detectar personas elegibles para el siguiente paso.
- Volver a evaluar las reglas de la lista.
- Detener personas que respondieron o avanzaron.
- Evitar pasos duplicados.
- Crear envíos independientes.

**Salida:** el siguiente paso se programa únicamente para personas elegibles.

### S3 — Resultados

- Mostrar avance por paso.
- Mostrar detenciones y motivos.
- Diferenciar personas únicas de contactos realizados.
- Integrar campaña, lista, contenido, envío y destinatario.

**Salida:** el usuario puede medir la secuencia completa.

### S4 — Activación progresiva

- Activar primero por organización.
- Probar con una campaña controlada.
- Permitir pausa inmediata.
- Registrar auditoría.
- Ampliar gradualmente.

**Salida:** la automatización se libera sin afectar envíos manuales existentes.

## 15. Criterios de aceptación

- Una secuencia pertenece a una campaña y respeta su canal.
- Cada paso utiliza un solo contenido compatible.
- Cada paso puede tener un tiempo de espera configurable.
- Cada paso vuelve a validar la Lista para contactar.
- Una respuesta detiene la secuencia para esa persona.
- Un avance en el embudo detiene la secuencia para esa persona.
- Una baja o bloqueo detiene la secuencia para esa persona.
- No se crean dos envíos del mismo paso para la misma persona.
- Cada paso genera un envío auditable e independiente.
- Los métodos actuales de Correo, WhatsApp y Voz no cambian.
- Se pueden pausar campañas y secuencias.
- Los resultados distinguen personas únicas y contactos realizados.
- Se puede navegar desde la campaña hasta el destinatario y su estado.
- La automatización puede activarse progresivamente por organización.
- Un error de un paso no ejecuta silenciosamente los siguientes pasos.

## 16. Decisiones pendientes

1. Definir si una campaña tendrá una sola secuencia activa o varias.
2. Definir el evento exacto que significa “avanzó en el embudo”.
3. Definir si la espera se cuenta desde envío aceptado, entrega o contacto realizado.
4. Definir horarios permitidos y zona horaria.
5. Definir máximos diarios por secuencia.
6. Definir qué ocurre después de un fallo temporal.
7. Definir si el último paso puede repetirse o si la secuencia siempre termina.
8. Definir permisos para crear, editar, pausar y activar secuencias.
9. Confirmar la fuente canónica de respuestas y oportunidades.
10. Definir retención de auditoría de decisiones automáticas.

## 17. Definición de terminado

La primera versión se considerará terminada cuando:

- Se pueda crear una secuencia de tres pasos.
- Cada paso tenga contenido, espera y condición.
- Se pueda activar y pausar.
- El sistema revalide elegibilidad antes de cada paso.
- Las personas que respondan o avancen sean excluidas automáticamente.
- Cada paso cree un envío independiente y auditable.
- Se puedan consultar resultados por paso.
- Existan pruebas de no duplicación, bajas, respuestas, oportunidades y pausas.
- La activación esté protegida por una feature flag o equivalente.
- El flujo manual actual continúe funcionando sin cambios.
