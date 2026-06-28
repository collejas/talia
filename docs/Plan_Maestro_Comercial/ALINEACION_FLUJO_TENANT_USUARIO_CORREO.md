# Alineacion de flujo de tenant, usuario y correo

## Proposito

Este documento define el bloque previo que debe cerrarse antes de continuar con el proceso de Stripe.

El objetivo es alinear tres cosas que hoy estan parcialmente separadas:

- la creacion del tenant;
- la creacion del usuario administrador;
- el correo inicial de acceso o activacion.

Si estos tres elementos no quedan alineados, el flujo comercial termina dejando tenants a medias, con roles corregidos manualmente y con correos que no representan bien el estado real del alta.

---

## Problema actual

Hoy existen dos caminos relacionados con el alta:

- alta interna desde `settings/tenants`;
- alta comercial ligada a Stripe.

En la practica, ambos caminos no comparten una misma semantica completa:

- el tenant puede nacer sin el usuario final listo;
- el rol `owner` puede quedar para una correccion posterior;
- el correo que llega al usuario puede parecer de recuperacion de contrasena en lugar de una activacion o invitacion;
- el flujo comercial queda partido entre varias pantallas y acciones manuales.

Esto genera deuda operativa y rompe la consistencia del modelo comercial.

---

## Objetivo de alineacion

Antes de seguir avanzando con Stripe, el sistema debe dejar resuelto este bloque:

- un unico criterio para crear el tenant;
- un unico criterio para crear el usuario admin;
- un unico criterio para asignar el rol `owner`;
- un unico criterio para enviar el correo inicial;
- un unico flujo de provisioning reutilizable por alta manual y alta comercial.

La regla es simple:

- Stripe define la activacion comercial.
- El backend define el provisioning.
- El correo acompana el estado real del alta.

---

## Los 5 puntos que deben cerrarse primero

### 1. Unificar el modelo de estados del alta

El tenant no debe depender de un flujo distinto segun venga de la UI interna o de Stripe.

Debe existir una semantica comun para:

- tenant creado;
- tenant pendiente;
- billing creado;
- acceso manual review;
- tenant activo;
- tenant bloqueado;
- tenant en gracia.

La UI solo debe disparar el caso correcto, no redefinir el modelo.

### 2. Hacer que el rol `owner` nazca con el provisioning

El usuario administrador inicial no debe requerir una correccion manual posterior para llegar a `owner`.

El rol debe quedar asignado en el mismo proceso que:

- crea el tenant;
- crea o registra el usuario;
- crea la cuenta comercial;
- aplica permisos base.

Si el tenant necesita un owner, debe salir asi desde el inicio.

### 3. Separar la creacion del tenant de la creacion del usuario admin

Hoy ambos conceptos se mezclan demasiado en la operacion manual.

La arquitectura debe tratarlos como pasos distintos:

- el tenant existe como entidad de negocio;
- el usuario admin es el primer actor autorizado;
- el correo es el puente de acceso entre ambos.

Esto permite que Stripe, la consola interna y futuros flujos automaticos usen la misma base.

### 4. Centralizar el provisioning en un solo servicio

No debe haber una logica especial para cada camino que termine duplicando reglas.

Debe existir una capa central que se encargue de:

- crear estructura base;
- crear roles;
- asignar permisos;
- activar estructuras necesarias;
- marcar el estado de provisioning;
- dejar evidencia operativa.

Esa capa debe poder ser llamada por:

- alta interna;
- webhook de Stripe;
- futuras automatizaciones.

### 5. Correo inicial alineado al tipo real de acceso

El correo debe representar el estado correcto del onboarding.

No debe parecer un cambio de contrasena si en realidad es un alta inicial.

La decision debe quedar clara:

- si el usuario aun no puede entrar, se manda invitacion o activacion;
- si el usuario ya existe pero necesita definir credenciales, se usa recovery solo cuando aplique;
- si el flujo es manual interno, el mensaje debe decir exactamente que esta ocurriendo.

Esto evita confusiones y reduce soporte operativo.

---

## Regla de prioridad

Antes de seguir con el proceso de Stripe, este bloque debe quedar resuelto.

La prioridad es:

1. alinear alta interna;
2. alinear rol `owner`;
3. alinear correo;
4. unificar provisioning;
5. continuar con Stripe sobre una base consistente.

---

## Regla de correo correcta

Para el flujo B2B de tenant + owner, lo correcto es usar **un solo correo de invitacion o activacion**.

Ese correo debe:

- llevar al alta de contrasena o acceso inicial;
- permitir que el usuario entre despues al sistema;
- dejar que el onboarding continue ya con acceso valido.

### Criterio por tipo de flujo

- **Alta administrada por el sistema interno:** invitacion directa.
- **Autoregistro publico:** primero confirmacion de correo electronico; si el usuario confirma, entonces se detona el correo de invitacion o activacion.
- **Alta por Stripe o por otra plataforma de cobro:** primero se confirma el pago, luego se verifica el correo, y solo despues se envia la invitacion o activacion.

### Regla operativa

No se debe mezclar el correo de activacion inicial con un correo de recuperacion de contrasena.

El correo de recuperacion solo debe usarse cuando el usuario ya existe y necesita restablecer acceso.

### Secuencia exacta

Para evitar dudas, la secuencia queda asi:

1. En autoregistro publico, el sistema envia primero el correo de confirmacion de correo electronico.
2. Si el usuario confirma ese correo, entonces el sistema envia el correo de invitacion o activacion.
3. En alta comercial por Stripe o por otra plataforma de cobro, el pago confirma la compra pero no confirma la propiedad del correo.
4. Si el alta comercial usa un correo para crear acceso, primero se envia el correo de confirmacion de correo electronico.
5. Si ese correo se confirma, entonces se envia el correo de invitacion para crear el usuario con rol `owner`.
6. Solo despues de esa confirmacion se debe otorgar acceso inicial.

### Regla de seguridad

Stripe no debe considerarse una fuente de verificacion de propiedad de correo electronico.

El pago puede probar intencion comercial, pero no identidad del destinatario del acceso.

---

## Criterios de aceptacion

Este bloque se considera cerrado cuando:

- el tenant nace con el estado correcto;
- el admin nace con rol `owner` sin correccion manual;
- el correo inicial corresponde al tipo correcto de acceso;
- el provisioning esta centralizado;
- el flujo manual y el flujo Stripe comparten las mismas reglas de negocio.

---

## Relacion con Stripe

Stripe no se pausa como idea comercial.

Lo que se pausa es avanzar sobre una base inconsistente.

Una vez cerrado este bloque, el flujo Stripe puede continuar con menos riesgo porque ya no tendra que corregir:

- roles;
- acceso inicial;
- mensajes de onboarding;
- duplicidad de provisioning.

---

## Resultado esperado

Al terminar esta etapa, el sistema debe quedar preparado para que:

- crear un tenant manualmente o desde Stripe siga el mismo modelo;
- crear el usuario admin no requiera operaciones de ajuste;
- el correo de onboarding sea consistente con el estado real;
- el provisioning comercial sea reutilizable y auditable.
