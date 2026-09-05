# Plan: recuperación de oportunidades frías y dormidas

## Resumen

Las oportunidades que pasan mucho tiempo sin actividad no deben permanecer indefinidamente en el embudo comercial activo. Eso distorsiona los indicadores, dificulta priorizar el trabajo del vendedor y oculta las oportunidades que realmente requieren atención.

Tal-IA debe conservar esas oportunidades y su historial, pero moverlas a un flujo de seguimiento y recuperación que permita reactivarlas cuando vuelvan a mostrar interés.

La regla principal es no confundir tres conceptos distintos:

- **Etapa comercial:** dónde se encuentra la oportunidad dentro del proceso de venta.
- **Estado de seguimiento:** qué tan recientemente se ha trabajado la oportunidad.
- **Temperatura:** qué tan activa o prometedora parece la oportunidad.

Una oportunidad puede estar en etapa **Propuesta enviada**, tener estado **Dormida** y temperatura **Fría** al mismo tiempo.

## Objetivos

- Mantener limpio el embudo comercial activo.
- Detectar oportunidades sin seguimiento oportuno.
- Evitar marcar como perdida una oportunidad únicamente por falta de actividad.
- Crear una vista específica para recuperar oportunidades dormidas.
- Priorizar el trabajo de los vendedores con reglas y recomendaciones claras.
- Permitir que cada tenant configure sus propios ciclos comerciales.
- Preparar la base para campañas de nutrición y reactivación asistidas por Tal-IA.

## Modelo funcional propuesto

### Etapa comercial

La etapa debe continuar representando el avance real de la venta:

```text
Nuevo → Contactado → Calificado → Propuesta → Negociación → Ganado / Perdido
```

El estado **Dormido** no debe convertirse en una etapa adicional del embudo, porque no describe un avance comercial. Describe falta de actividad.

### Estado de seguimiento

Se propone un estado independiente, calculado principalmente con la última actividad y la próxima actividad programada:

| Estado | Significado | Comportamiento |
|---|---|---|
| Activo | Existe actividad reciente o una siguiente acción vigente | Permanece en el embudo principal |
| En riesgo | Está por exceder el tiempo esperado de seguimiento | Alerta al vendedor |
| Estancado | Superó el tiempo recomendado sin avance | Crea una tarea de revisión |
| Dormido | Lleva demasiado tiempo sin interacción | Sale visualmente del embudo activo |
| Reactivado | Volvió a mostrar interés después de estar dormido | Regresa al flujo activo |
| Perdido | Existe una razón comercial confirmada | Sale del flujo activo de forma definitiva |

El estado **Perdido** no debe asignarse automáticamente solo por antigüedad o inactividad.

### Temperatura

La temperatura es una señal de prioridad y puede calcularse automáticamente. Tanto sus niveles como la forma de calcularla deben ser configurables por tenant, porque no todos los negocios consideran las mismas señales de intención ni tienen el mismo ciclo comercial.

- Caliente
- Tibio
- Frío
- Dormido

Cada tenant debe poder configurar:

- Los niveles que utiliza y sus nombres visibles.
- Los rangos del score asociados a cada nivel.
- Las señales que aumentan o disminuyen la temperatura.
- El peso de cada señal.
- El tiempo de decaimiento por falta de actividad.
- Las etapas o canales que deben tener mayor relevancia.

Tal-IA debe proporcionar una configuración inicial recomendada, pero no imponer una única fórmula para todos los tenants. La plataforma sí debe mantener límites técnicos y de seguridad comunes, por ejemplo respetar exclusiones, consentimiento y solicitudes de no contacto.

Debe mostrarse como información complementaria, no reemplazar la etapa ni el estado de seguimiento.

## Reglas iniciales de inactividad

Los valores deben ser configurables por tenant. Como configuración inicial sugerida:

| Tiempo sin actividad | Estado sugerido | Acción |
|---:|---|---|
| 0 a 7 días | Activo | Seguimiento normal |
| 8 a 15 días | En riesgo | Notificar al vendedor |
| 16 a 30 días | Estancado | Crear tarea de revisión |
| 31 a 60 días | Dormido | Ocultar del embudo activo y enviar a recuperación |
| Más de 60 días | Reciclaje | Considerar nutrición o campaña periódica |

Estos rangos no deben estar hardcodeados en la lógica de negocio. Cada tenant debe poder definirlos según su ciclo comercial.

## Qué se considera actividad

La fecha de última actividad debe actualizarse únicamente con eventos relevantes. Puede incluir:

- Respuesta del contacto.
- Mensaje enviado por WhatsApp o correo.
- Llamada registrada.
- Cita creada, confirmada o realizada.
- Nota o actividad registrada por el vendedor.
- Cambio relevante en la oportunidad.
- Cotización enviada o actualizada.
- Visita o interacción digital identificable, cuando exista evidencia suficiente.

Las consultas internas o cambios que no representen interacción comercial no deberían reactivar una oportunidad por sí solos.

## Vista de oportunidades dormidas

Se propone una vista llamada **Oportunidades dormidas** o **Recuperación de oportunidades**.

Debe incluir:

- Oportunidad y contacto.
- Empresa.
- Etapa comercial actual.
- Vendedor asignado.
- Valor estimado.
- Última actividad.
- Días sin actividad.
- Temperatura.
- Score o prioridad de recuperación.
- Motivo de la recomendación.
- Próxima acción sugerida.

Filtros iniciales:

- Más de 7 días sin actividad.
- Más de 15 días.
- Más de 30 días.
- Más de 60 días.
- Más de 90 días.
- Vendedor.
- Etapa.
- Temperatura.
- Valor de oportunidad.

Indicadores recomendados:

- Total de oportunidades dormidas.
- Valor total detenido.
- Oportunidades con alta probabilidad de reactivación.
- Oportunidades sin próxima actividad.
- Oportunidades reactivadas en el periodo.
- Tasa de reactivación.

## Recuperación asistida por Tal-IA

Antes de automatizar envíos, Tal-IA debe ayudar al vendedor a decidir qué hacer:

```text
Oportunidad: Constructora ABC
Etapa: Propuesta enviada
Estado: Dormida
Sin actividad: 38 días
Valor: $250,000
Prioridad: Alta
Recomendación: contactar por WhatsApp
```

Acciones posibles:

- Crear tarea de reactivación.
- Proponer un mensaje personalizado.
- Enviar mensaje después de confirmación del vendedor.
- Incluir en una campaña de nutrición autorizada.
- Marcar como no contactar.
- Marcar como perdida con una razón explícita.

Si el contacto responde, realiza una acción comercial o vuelve a mostrar interés, el sistema debe:

1. Registrar el evento de reactivación.
2. Actualizar la última actividad.
3. Cambiar el estado a **Reactivado** o **Activo**.
4. Regresar la oportunidad al embudo principal.
5. Crear una siguiente actividad.
6. Notificar al vendedor asignado.

Las comunicaciones automáticas deben respetar consentimiento, preferencias de contacto, exclusiones y límites configurados por tenant.

## Lead score y prioridad

En una segunda etapa, Tal-IA puede calcular un score de 0 a 100 usando señales positivas y negativas.

Ejemplo de señales:

- Responder por WhatsApp: incremento alto.
- Solicitar información o cotización: incremento alto.
- Confirmar una cita: incremento alto.
- Abrir o hacer clic en un correo: incremento bajo o medio.
- No responder durante varios días: decremento gradual.
- Cancelar una cita o pedir no ser contactado: decremento alto o exclusión.

El score debe complementar, no sustituir, la decisión comercial del vendedor. La razón de la recomendación debe ser visible y entendible.

## Datos y arquitectura sugeridos

La información central debe almacenarse en columnas explícitas y no dentro de `metadata` o `jsonb`.

Campos funcionales sugeridos para la oportunidad:

- `ultima_actividad_en`
- `proxima_actividad_en`
- `estado_seguimiento`
- `temperatura`
- `dias_sin_actividad` o cálculo equivalente en consulta
- `reactivada_en`
- `ultimo_intento_reactivacion_en`
- `intentos_reactivacion`
- `prioridad_reactivacion`
- `razon_perdida_id`, cuando corresponda

La configuración por tenant debe definir explícitamente los umbrales de días, las reglas de transición del estado de seguimiento, los niveles y fórmula de temperatura, los límites de intentos, los canales autorizados y las reglas de exclusión.

El sistema debe registrar un historial de cambios de estado para poder responder:

- Cuándo se volvió dormida una oportunidad.
- Qué regla la cambió.
- Qué intentos de recuperación se hicieron.
- Qué evento produjo la reactivación.
- Qué usuario o automatización realizó cada acción.

## Implementación por fases

### Fase 1: visibilidad y clasificación

- Agregar el estado de seguimiento independiente de la etapa.
- Calcular días sin actividad.
- Crear reglas configurables por tenant.
- Incorporar filtros y vista de oportunidades dormidas.
- Mostrar alertas y tareas de seguimiento.
- Mantener el cambio reversible y auditable.

### Fase 2: priorización

- Agregar temperatura calculada.
- Implementar score de prioridad.
- Mostrar el valor económico detenido.
- Recomendar canal y siguiente acción.
- Incorporar métricas de reactivación.

### Fase 3: automatización controlada

- Generar mensajes sugeridos por Tal-IA.
- Permitir aprobación del vendedor.
- Ejecutar campañas de nutrición con consentimiento.
- Detectar respuestas e interacciones.
- Reactivar automáticamente oportunidades con evidencia suficiente.

### Fase 4: optimización por tenant

- Ajustar umbrales con base en resultados históricos.
- Comparar tasas de reactivación por canal.
- Identificar etapas con mayor estancamiento.
- Recomendar cambios en cadencias y reglas de seguimiento.

## Criterios de aceptación

- Una oportunidad no cambia a **Perdida** solamente por permanecer inactiva.
- La etapa comercial no cambia cuando cambia el estado de seguimiento.
- Una oportunidad dormida deja de ocupar visualmente el embudo activo.
- El vendedor puede consultar, filtrar y recuperar oportunidades dormidas.
- Una respuesta o interacción válida reactiva la oportunidad y conserva su historial.
- Cada cambio automático registra fecha, regla y origen.
- Los umbrales pueden configurarse por tenant.
- La fórmula de temperatura, sus señales, pesos y rangos pueden configurarse por tenant.
- Se respetan las preferencias de contacto y las exclusiones.
- Los indicadores distinguen oportunidades activas, dormidas, reactivadas y perdidas.

## Decisión recomendada

Implementar primero la separación entre **etapa comercial** y **estado de seguimiento**, junto con la vista de oportunidades dormidas y las tareas de recuperación.

La temperatura, el score y las campañas automáticas deben construirse sobre esa base. Esto permite limpiar el embudo sin perder oportunidades y evita automatizar mensajes antes de contar con reglas, historial y controles suficientes.
