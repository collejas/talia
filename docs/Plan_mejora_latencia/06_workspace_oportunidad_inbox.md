# Workspace de oportunidad en Inbox

## Objetivo

Permitir que el vendedor opere la oportunidad asociada a una conversación sin abandonar Inbox ni bloquear el chat, reutilizando el mismo drawer de Embudo.

## Contrato aplicado

- Inbox toma `oportunidad_id` de la conversación seleccionada; no crea otra oportunidad al abrir el workspace.
- La tarjeta se obtiene directamente mediante `/crm/pipeline/cards/{oportunidad_id}`.
- Las etapas se consultan con `limit=1`: se necesitan sus definiciones, no las tarjetas completas del tablero.
- El drawer se abre por la izquierda en modo no modal para conservar disponible la conversación y el compositor.
- Guardar reutiliza `updateLeadCard`, por lo que Embudo e Inbox comparten validación y persistencia.

## Datos ampliados en Embudo

El formulario manual ahora separa nombre(s), primer apellido y segundo apellido; además incorpora origen, puesto, área, rol de decisión, uso del teléfono y datos de empresa (tipo de persona, razón social, RFC y régimen de capital). Estos valores viajan como campos explícitos del contrato CRM y no dentro de `metadata` de la oportunidad.

PFEA se presenta como contexto de una persona física, no como un tercer `tipo_persona`, de acuerdo con `Plan_personas_empresa_contactos`.

## Protección contra latencia y pérdida de datos

- No se descarga el tablero de Embudo para localizar una oportunidad.
- No hay polling adicional mientras el drawer permanece abierto.
- En edición, los nuevos campos que todavía no vienen proyectados en la tarjeta solo se envían si el usuario realmente los modificó; abrir y guardar no borra apellidos ni datos fiscales existentes.

## Validación y despliegue

- Ejecutar el build del panel en el entorno de deploy, donde estén instaladas sus dependencias.
- Probar una oportunidad manual desde Embudo y la misma oportunidad desde Inbox.
- Confirmar que pausar/reactivar el asistente y enviar mensajes sigue funcionando con el drawer abierto.
- El despliegue queda a cargo del operador; este cambio no reinicia servicios.
