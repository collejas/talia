# Plan: recuperación de oportunidades frías y dormidas

## Resumen

Las oportunidades que pasan mucho tiempo sin actividad no deben permanecer indefinidamente en el embudo comercial activo. Eso distorsiona los indicadores, dificulta priorizar el trabajo del vendedor y oculta las oportunidades que realmente requieren atención.

Tal-IA debe conservar esas oportunidades y su historial, pero moverlas a un flujo de seguimiento y recuperación que permita reactivarlas cuando vuelvan a mostrar interés.

La regla principal es no confundir cuatro conceptos distintos:

- **Etapa comercial:** dónde se encuentra la oportunidad dentro del proceso de venta.
- **Estado de seguimiento:** qué tan recientemente se ha trabajado la oportunidad.
- **Temperatura:** qué tan activa o prometedora parece la oportunidad.
- **Estrategia:** qué acción o tratamiento corresponde aplicar.

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

Se propone un estado independiente, calculado principalmente con la última interacción del prospecto, la actividad saliente y la próxima actividad programada:

| Estado | Significado | Comportamiento |
|---|---|---|
| Activo | Existe actividad reciente o una siguiente acción vigente | Permanece en el embudo principal |
| En riesgo | Está por exceder el tiempo esperado de seguimiento | Alerta al vendedor |
| Estancado | Superó el tiempo recomendado sin avance | Crea una tarea de revisión |
| Dormido | Lleva demasiado tiempo sin interacción | Sale visualmente del embudo activo |

El resultado comercial **Perdido** pertenece a la resolución de la oportunidad, no al estado de seguimiento. No debe asignarse automáticamente solo por antigüedad o inactividad.

### Temperatura

La temperatura es una señal de prioridad y puede calcularse automáticamente. Tanto sus niveles como la forma de calcularla deben ser configurables por tenant, porque no todos los negocios consideran las mismas señales de intención ni tienen el mismo ciclo comercial.

- Caliente
- Tibio
- Frío

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
| Más de 60 días | Dormido | Aplicar estrategia de reciclaje o nurturing |

Estos rangos no deben estar hardcodeados en la lógica de negocio. Cada tenant debe poder definirlos según su ciclo comercial.

## Estrategia de seguimiento

La estrategia representa qué debe hacer Tal-IA o el vendedor con la oportunidad. No es una etapa ni un estado de seguimiento.

Valores iniciales sugeridos:

- Seguimiento normal.
- Reactivación.
- Nurturing.
- No contactar.

Una oportunidad dormida puede tener estrategia **Reactivación** o **Nurturing** según su valor, temperatura, historial y preferencias de contacto. Una solicitud de no contacto debe tener prioridad sobre cualquier estrategia automática.

## Actividad e interacción del prospecto

El modelo debe separar la actividad interna o saliente de la interacción real del prospecto. Esto evita que un intento del vendedor haga parecer activa una oportunidad que lleva meses sin responder.

Campos conceptuales mínimos:

- `ultima_actividad_en`: última actividad relevante de cualquier tipo.
- `ultima_interaccion_contacto_en`: última respuesta o acción atribuible al prospecto.
- `ultimo_contacto_saliente_en`: último mensaje, llamada o intento realizado por el equipo.
- `proxima_actividad_en`: siguiente acción programada.

La última actividad puede incluir:

- Respuesta del contacto.
- Mensaje enviado por WhatsApp o correo.
- Llamada registrada.
- Cita creada, confirmada o realizada.
- Nota o actividad registrada por el vendedor.
- Cambio relevante en la oportunidad.
- Cotización enviada o actualizada.
- Visita o interacción digital identificable, cuando exista evidencia suficiente.

Las consultas internas o cambios que no representen interacción comercial no deberían reactivar una oportunidad por sí solos.

Un contacto saliente tampoco debe considerarse automáticamente una interacción del prospecto. Por ejemplo, si el vendedor envía un WhatsApp después de 65 días sin respuesta, la oportunidad puede mantener `estado_seguimiento = Dormido` hasta que exista una respuesta o señal válida del prospecto.

## Vista de oportunidades dormidas

Se propone una vista llamada **Oportunidades dormidas** o **Recuperación de oportunidades**.

Debe incluir:

- Oportunidad y contacto.
- Empresa.
- Etapa comercial actual.
- Vendedor asignado.
- Valor estimado.
- Última actividad.
- Última interacción del prospecto.
- Último contacto saliente.
- Días sin actividad.
- Temperatura.
- Estrategia.
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
Sin interacción del prospecto: 38 días
Último intento del vendedor: 5 días
Estrategia: Reactivación
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
2. Actualizar la última interacción del prospecto y la última actividad.
3. Cambiar el estado de **Dormido** a **Activo**.
4. Regresar la oportunidad al embudo principal.
5. Incrementar el contador de reactivaciones.
6. Crear una siguiente actividad.
7. Notificar al vendedor asignado.

**Reactivado** debe ser un evento histórico (`OPORTUNIDAD_REACTIVADA`), no un estado permanente. La interfaz puede mostrar temporalmente “Reactivado hace 2 días”, pero el estado operativo debe ser **Activo**.

Las comunicaciones automáticas deben respetar consentimiento, preferencias de contacto, exclusiones y límites configurados por tenant.

## Motor de recomendación de estrategia

Tal-IA debe recomendar la estrategia combinando varias señales, no tomando una decisión únicamente por temperatura o por días de inactividad.

La lógica debe separar estas preguntas:

- **Seguimiento:** ¿qué tan urgente es intervenir?
- **Temperatura:** ¿qué tanta intención o potencial ha mostrado el prospecto?
- **Etapa:** ¿qué tipo de conversación corresponde?
- **Valor:** ¿qué impacto tiene recuperar esta oportunidad?
- **Historial:** ¿cuántos intentos se hicieron y qué funcionó antes?
- **Preferencias:** ¿qué canales están permitidos y cuáles deben excluirse?

### Reglas de recomendación iniciales

| Condición | Estrategia sugerida | Acción para el vendedor |
|---|---|---|
| Activo + Caliente | Seguimiento normal prioritario | Atender la siguiente actividad pendiente |
| En riesgo + Caliente o Tibio | Seguimiento preventivo | Contactar pronto por el canal con mejor respuesta histórica |
| Estancado + Caliente | Reactivación personalizada | Crear contacto directo y revisar el contexto antes de escribir |
| Dormido + Caliente | Reactivación de alta prioridad | Proponer mensaje personalizado y aprobación del vendedor |
| Dormido + Tibio | Reactivación moderada | Hacer un intento contextual y programar revisión |
| Dormido + Frío | Nurturing | Incluir en contenido o campaña de baja frecuencia |
| Muchos intentos sin respuesta | Nurturing o revisión manual | Reducir frecuencia y evitar mensajes repetitivos |
| Solicitud de no contacto | No contactar | Bloquear comunicaciones automáticas |

Estas reglas son una primera configuración. Cada tenant debe poder ajustar la estrategia, los umbrales, los canales y el número máximo de intentos.

### Qué debe recibir el vendedor

La recomendación debe presentarse como una decisión explicada y accionable:

```text
Estrategia recomendada: Reactivación personalizada
Prioridad: Muy alta

Motivos:
- Propuesta enviada.
- Temperatura actual: Tibia.
- Mostró alta intención en la última reunión.
- Lleva 43 días sin respuesta.
- La oportunidad vale $380,000.

Siguiente acción:
Contactar por WhatsApp hoy y mencionar la propuesta anterior.

Mensaje sugerido:
Hola, Juan. Retomo la propuesta que revisamos para el proyecto de iluminación.
¿Sigue vigente la fecha estimada de inicio o cambió el calendario?

Confianza de la recomendación: Alta
```

La IA debe mostrar siempre el motivo de la recomendación, el momento sugerido, el canal recomendado y si requiere aprobación. El vendedor debe poder aceptar, editar, posponer, cambiar la estrategia o descartarla indicando una razón.

### Prioridad de recuperación

La prioridad puede calcularse con una combinación configurable de:

- Temperatura actual.
- Temperatura o intención histórica relevante.
- Días desde la última interacción del prospecto.
- Valor estimado de la oportunidad.
- Etapa comercial.
- Probabilidad o score.
- Número y resultado de intentos anteriores.
- Canal con mejor respuesta histórica.
- Existencia de una próxima actividad vencida.

La falta de respuesta del prospecto debe pesar más que la fecha del último intento del vendedor. Un mensaje saliente reciente no reinicia por sí solo el contador de inactividad de interacción.

### Límites y control

El motor de recomendación debe ser explicable y auditable. Cada recomendación debe guardar la configuración, señales consideradas, estrategia propuesta, resultado y decisión final del vendedor.

Durante la primera fase, Tal-IA recomienda y el vendedor confirma. La ejecución automática solo debe habilitarse después de validar consentimiento, límites de frecuencia, reglas del tenant y resultados reales de reactivación.

## Arquitectura de vistas y navegación

No se debe crear un segundo Dashboard ni colocar cada informe como una opción independiente del menú lateral. El Dashboard actual ya concentra información de leads, ventas, conversaciones, pipeline, agenda, marketing y catálogo; debe conservarse como el resumen general del negocio y evolucionar progresivamente hacia una vista ejecutiva-operativa.

La navegación recomendada es:

```text
Dashboard
└── Resumen general

CRM
├── Embudo
├── Contactos
├── Oportunidades
├── Actividades
└── Informes
    ├── Salud comercial
    ├── Recuperación
    └── Analítica
```

### Dashboard general

Debe responder:

> ¿Cómo está el negocio y qué necesita atención?

Debe mostrar de forma resumida:

- Valor del pipeline.
- Oportunidades activas, en riesgo, estancadas y dormidas.
- Oportunidades sin próxima actividad.
- Valor detenido.
- Alertas y recomendaciones de Tal-IA.
- Acciones pendientes.

No debe convertirse en una pantalla con todas las tablas históricas y análisis detallados.

### Hub de Informes

**Informes** debe ser una entrada única dentro del CRM, con navegación interna, filtros de periodo, filtros por vendedor o etapa y opciones de exportación cuando aplique.

#### Salud comercial

Vista ejecutiva para conocer la calidad del pipeline:

- Pipeline activo.
- Valor detenido.
- Distribución por estado de seguimiento.
- Aging del pipeline.
- Próximas actividades.
- Tendencia del pipeline.
- Índice de salud comercial, cuando sus factores sean visibles y explicables.

#### Recuperación

Vista operativa para trabajar oportunidades estancadas y dormidas:

- Oportunidades dormidas y estancadas.
- Temperatura.
- Días desde la última interacción del prospecto.
- Valor recuperable.
- Estrategia recomendada por Tal-IA.
- Acciones de contactar, crear tarea, nutrir, posponer o no contactar.

#### Analítica

Vista histórica para estudiar resultados y optimizar reglas:

- Reactivación por canal.
- Reactivación por antigüedad.
- Reactivación por etapa.
- Rendimiento por vendedor.
- Motivos de pérdida.
- Embudo de recuperación.
- Valor reactivado.
- Valor ganado proveniente de reactivación.

### Accesos contextuales

El acceso principal debe ser **CRM → Informes**, pero pueden existir botones contextuales para reducir pasos:

- Dashboard: **Ver informes**.
- Embudo: **Ver oportunidades estancadas**.
- Recuperación: **Ver análisis de reactivación**.

Estos accesos deben conservar los filtros relevantes cuando el usuario navegue entre vistas.

El **Mapa de Conversión** puede permanecer como informe especializado de marketing en su ubicación actual. En una fase posterior se podrá integrar dentro de **Analítica**, pero no es necesario moverlo en el primer refactor.

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
- `ultima_interaccion_contacto_en`
- `ultimo_contacto_saliente_en`
- `proxima_actividad_en`
- `estado_seguimiento`
- `temperatura`
- `estrategia_seguimiento`
- `dias_sin_interaccion` o cálculo equivalente en consulta
- `reactivada_en`
- `numero_reactivaciones`
- `ultimo_intento_reactivacion_en`
- `intentos_reactivacion`
- `prioridad_reactivacion`
- `razon_perdida_id`, cuando corresponda

La configuración por tenant debe definir explícitamente los umbrales de días, las reglas de transición del estado de seguimiento, los niveles y fórmula de temperatura, los límites de intentos, los canales autorizados y las reglas de exclusión.

El sistema debe registrar un historial de cambios y eventos para poder responder:

- Cuándo se volvió dormida una oportunidad.
- Qué regla la cambió.
- Qué intentos de recuperación se hicieron.
- Qué evento produjo la reactivación.
- Cuántas veces fue reactivada.
- Qué usuario o automatización realizó cada acción.

## Implementación por fases

### Fase 1: visibilidad y clasificación

- Agregar el estado de seguimiento independiente de la etapa.
- Separar última actividad, última interacción del prospecto y último contacto saliente.
- Calcular días sin interacción del prospecto.
- Agregar la estrategia de seguimiento.
- Crear reglas configurables por tenant.
- Incorporar filtros y vista de oportunidades dormidas.
- Mostrar alertas y tareas de seguimiento.
- Mantener el cambio reversible y auditable.

### Fase 2: priorización

- Agregar temperatura calculada.
- Implementar score de prioridad.
- Registrar eventos de reactivación y contador histórico.
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
- Un intento saliente del vendedor no se interpreta por sí solo como respuesta del prospecto.
- La reactivación cambia el estado a **Activo** y registra un evento histórico.
- Cada cambio automático registra fecha, regla y origen.
- Los umbrales pueden configurarse por tenant.
- La fórmula de temperatura, sus señales, pesos y rangos pueden configurarse por tenant.
- La estrategia de seguimiento puede configurarse por tenant.
- Se respetan las preferencias de contacto y las exclusiones.
- Los indicadores distinguen oportunidades activas, dormidas, reactivadas y perdidas.

## Decisión recomendada

Implementar primero la separación entre **etapa comercial**, **estado de seguimiento**, **temperatura** y **estrategia**, junto con la distinción entre interacción del prospecto y actividad del vendedor.

La temperatura, el score, los eventos de reactivación y las campañas automáticas deben construirse sobre esa base. Esto permite limpiar el embudo sin perder oportunidades y evita automatizar mensajes antes de contar con reglas, historial y controles suficientes.
