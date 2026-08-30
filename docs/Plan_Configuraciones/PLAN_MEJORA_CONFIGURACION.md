# Plan de mejora de configuración por organización

## 1. Objetivo

Simplificar la configuración que cada organización realiza desde
`/settings/variables`, eliminando duplicidades, reduciendo el número de decisiones
técnicas y guiando al usuario para dejar cada módulo listo para operar.

La pantalla debe permitir que una persona administradora entienda rápidamente:

1. Qué está configurando.
2. Qué necesita completar.
3. Qué módulos ya están listos.
4. Qué configuración falta para operar.
5. Dónde debe realizar la siguiente acción.

El usuario final no debe tener que conocer nombres internos de variables, rutas de
configuración, niveles de seguridad, nombres de tablas, claves técnicas ni nombres
de proveedores internos.

## 2. Problema actual

La vista actual mezcla en una misma experiencia:

- Datos generales de la organización.
- Activación de módulos.
- Configuración de canales.
- Credenciales y secretos.
- Parámetros de asistentes.
- Automatizaciones.
- Integraciones externas.
- Variables históricas y nombres internos.

Actualmente existen duplicidades reales. En particular:

- Webchat solicita una clave de conexión de OpenAI.
- La pestaña OpenAI solicita otra clave para la misma dependencia.
- El backend mantiene ambas claves como candidatos y usa una como fallback.
- Voz tiene una clave adicional que normalmente puede utilizar la misma conexión
  general.
- La pestaña genérica `Secretos` permite capturar nombres internos arbitrarios,
  aumentando el riesgo de configuración incorrecta.

La vista también presenta demasiadas pestañas independientes para un proceso que,
desde la perspectiva del tenant, debería ser una configuración guiada por módulos y
capacidades.

## 3. Evidencia técnica actual

La situación actual se encuentra en:

- `frontend/panel/src/app/settings/variables/page.tsx`
- `frontend/panel/src/app/settings/tenants/[tenantId]/tenant-forms.tsx`
- `frontend/panel/src/app/settings/variables/actions.ts`
- `backend/app/services/tenant_runtime.py`

El runtime actualmente busca la conexión de OpenAI en este orden conceptual:

1. Conexión específica de voz, cuando aplica.
2. Conexión histórica de Webchat.
3. Conexión general.
4. Configuración global del backend.

Ese comportamiento debe conservarse temporalmente para no romper organizaciones
existentes, pero la interfaz nueva debe tener una sola fuente de captura para el
usuario.

## 4. Principios de diseño

### 4.1 Lenguaje de usuario

No mostrar en la interfaz tenant-facing:

- `openai.api_key`.
- `openai.general.api_key`.
- `project_id`.
- `assistant_id`.
- `prompt_version`.
- `tier A` o `tier B`.
- `organizaciones.config`.
- `routing`.
- Nombres de tablas, endpoints o rutas internas.

Usar conceptos comprensibles:

- `Conexión de inteligencia artificial`.
- `Clave de conexión`.
- `Proyecto de inteligencia artificial`.
- `Asistente del canal`.
- `Versión del asistente`.
- `Alias del canal`.
- `Tiempo de espera`.
- `Reintentos`.
- `Escalamiento a una persona`.

Los nombres internos pueden conservarse únicamente en código, logs restringidos,
documentación técnica interna y contratos que no sean visibles al tenant.

### 4.2 Una responsabilidad, un lugar

Cada dato se captura una sola vez en el lugar que corresponde:

- La conexión de inteligencia artificial se configura en una sección central.
- Webchat configura exclusivamente el comportamiento de Webchat.
- WhatsApp configura exclusivamente el comportamiento y conexión de WhatsApp.
- Correo configura el servicio de correo, dominio y remitente.
- Las listas de precios se administran en `settings/account`.
- Personas, empresas y relaciones se administran en el módulo de Personas.

### 4.3 Dependencias visibles, campos no duplicados

Un módulo puede informar que depende de otra configuración, pero no debe volver a
pedir el mismo dato.

Ejemplo:

> Webchat necesita una conexión de inteligencia artificial. Configúrala en
> “Inteligencia artificial”.

El aviso debe incluir un enlace directo a la sección correspondiente y un estado
claro: `Listo`, `Pendiente` o `Revisar`.

### 4.4 Verificación de conexiones y enlaces

Cada API, token, clave, URL, dominio, ruta o enlace relevante debe poder verificarse
desde la propia pantalla mediante acciones como `Verificar conexión`, `Probar enlace`
o `Comprobar dominio`.

La verificación se ejecutará desde backend y comprobará, según corresponda:

- Validez de la credencial.
- Respuesta del servicio.
- Permisos disponibles.
- Accesibilidad y destino correcto de la URL.
- Estado del dominio o registro requerido.
- Suficiencia de la configuración completa.

El resultado será claro y accionable: `Conexión correcta`, `Conexión incorrecta`,
`Sin permisos suficientes`, `Dato incompleto`, `Enlace no disponible` o `Dominio
pendiente de verificación`.

Cuando sea seguro, la comprobación podrá ejecutarse antes de guardar. En otros casos
se realizará después del guardado. Nunca se mostrarán claves, tokens, contraseñas,
encabezados de autorización ni respuestas crudas del proveedor.

Las pruebas no deben modificar datos ni ejecutar acciones irreversibles. Solo se
registrarán resultado, fecha, organización, integración y código normalizado cuando
sea necesario para soporte.

### 4.5 La seguridad no depende de ocultar campos

La UI debe ser sencilla, pero la autorización debe continuar en backend. El backend
debe validar tenant, permisos, ownership y formato de cada operación.

## 5. Experiencia objetivo

### 5.0 Relación entre onboarding y configuración completa

El onboarding y `settings/variables` no serán dos sistemas independientes. Ambos
utilizarán la misma fuente de datos, servicios, validaciones y componentes de
formulario.

La diferencia será el modo de presentación:

- **Onboarding:** flujo guiado, paso a paso, con porcentaje, pendientes, subpasos,
  validaciones y botón para continuar.
- **Configuración completa:** vista abierta para revisar o editar cualquier sección
  cuando el tenant termine el onboarding o necesite corregir algo después.

El onboarding guardará directamente la configuración normal de la organización.
Cuando un usuario complete un paso durante el onboarding, el resultado deberá
aparecer inmediatamente en `settings/variables`. No habrá una copia intermedia ni
un segundo conjunto de datos.

La implementación podrá reutilizar los formularios actuales mediante un modo de
vista. La ruta, el layout y el orden pueden ser distintos, pero la fuente de verdad
debe ser única.

#### Lenguaje obligatorio en ambas vistas

Tanto onboarding como `settings/variables` deben cumplir exactamente las mismas
reglas:

- No mostrar nombres técnicos de variables, campos, tablas, endpoints o rutas.
- No mostrar nombres internos de claves, tokens o secretos.
- No mostrar nombres de proveedores externos cuando no sean necesarios para el
  usuario.
- No mostrar códigos internos de error ni respuestas crudas de servicios.
- Usar títulos, ayudas, estados y acciones escritos en lenguaje funcional.

Esto también aplica a estados, validaciones, mensajes de error, placeholders,
tooltips, confirmaciones, enlaces de ayuda y pantallas vacías. Los nombres técnicos
y de proveedores podrán permanecer únicamente en código, observabilidad interna,
documentación técnica restringida y soporte administrativo autorizado.

### 5.1 Resumen inicial

Agregar una franja de estado al inicio de la vista con:

- Estado general de configuración.
- Módulos activos.
- Configuraciones pendientes.
- Acción recomendada.

Ejemplo:

> Tu organización está parcialmente configurada. Falta completar la conexión de
> inteligencia artificial y el dominio de correo.

Esta franja no sustituye las pestañas; funciona como orientación inicial. Cada
sección debe mostrar, cuando aplique, el estado de sus conexiones y una acción de
verificación cercana al dato configurado.

### 5.2 Organización propuesta de secciones

La organización objetivo será:

1. **Organización**
   - Datos generales.
   - Datos fiscales.
   - Contacto principal.
   - Ubicación, idioma, moneda y zona horaria.

2. **Imagen empresarial**
   - Información de la empresa para asistentes y plantillas.
   - Colores y estilo visual.
   - Diseños guardados.

3. **Canales**
   - Webchat.
   - WhatsApp.
   - Messenger.
   - Voz.

4. **Inteligencia artificial**
   - Una sola conexión de inteligencia artificial.
   - Proyecto, si la organización lo necesita.
   - Configuración avanzada de asistentes.
   - Configuración avanzada de voz.

5. **Correo**
   - Dominio de envío.
   - Remitente.
   - Estado de activación.
   - Configuración operativa necesaria.

6. **Agenda y automatizaciones**
   - Agenda.
   - Cierre de conversaciones.
   - Horarios y reenganches.

7. **Página web y seguimiento**
   - Sitios registrados.
   - Dominios.
   - Seguimiento y atribución.

8. **Búsqueda**
   - Servicios de búsqueda autorizados.
   - Estado de conexión.
   - Límites operativos.

9. **Configuración avanzada**
   - Solo para administradores autorizados.
   - Sin mostrarla como parte del flujo normal.
   - No debe permitir introducir claves internas arbitrarias desde el tenant.

La primera fase puede conservar las pestañas actuales y mejorar su contenido. La
agrupación visual completa se realizará después de consolidar las credenciales y
validar el nuevo flujo.

### 5.3 Estructura del onboarding

El onboarding mostrará una pantalla de avance con:

- Porcentaje general.
- Pasos completados.
- Paso actual.
- Pasos pendientes.
- Errores que requieren atención.
- Botón para continuar.
- Botón para revisar un paso terminado.

Ejemplo de presentación:

```text
Configuración de tu organización
60% completado

✓ Datos de la organización
✓ Conexión de inteligencia artificial
✓ Webchat
◐ WhatsApp — falta validar el número
○ Correo — falta verificar el dominio
○ Usuarios y permisos

[Continuar configuración]
```

El onboarding debe permitir regresar a un paso completado sin perder el avance de
los demás. Si una configuración ya fue completada desde `settings/variables`, el
onboarding debe reflejarla como completada.

Cada paso se presentará en su propia vista numerada. La vista inicial conservará
el resumen general, pero el trabajo de configuración se realizará dentro del paso
correspondiente. El tenant podrá avanzar, regresar a pasos anteriores, guardar y
salir, o ir al dashboard por ahora sin que el sistema marque el onboarding como
terminado.

### 5.4 Redirección y acceso

La decisión de enviar al usuario al onboarding o al dashboard debe hacerse con base
en el estado real calculado por backend:

- Tenant nuevo o incompleto: abrir onboarding.
- Tenant en proceso: abrir onboarding en el primer paso pendiente.
- Tenant completo: abrir dashboard.
- Tenant completo que desea revisar: permitir acceso a configuración completa.
- Tenant maestro: conservar su flujo administrativo propio y no bloquearlo por el
  onboarding de un tenant cliente.

El usuario no debe poder marcar manualmente el proceso como terminado para saltarse
validaciones obligatorias.

### 5.5 Guardado parcial y reanudación

El onboarding debe permitir guardar cambios aunque el proceso no esté completo al
100%.

El tenant podrá:

- Completar un paso y guardarlo.
- Completar solo algunos subpasos y guardar el avance.
- Corregir un dato y continuar después.
- Salir de la aplicación sin perder lo guardado.
- Regresar al onboarding en el primer paso pendiente.
- Revisar pasos ya completados.
- Guardar cambios desde onboarding o desde `settings/variables`.

La acción visible debe comunicarlo claramente:

- `Guardar y continuar después`.
- `Guardar avance`.
- `Continuar`.

El sistema no debe exigir llegar al 100% para guardar un cambio válido. Cada campo o
subpaso debe validar su propio formato y mostrar errores puntuales, pero un error en
un paso no debe borrar ni impedir guardar los avances válidos de otros pasos.

El 100% tendrá una función distinta: confirmar que todas las configuraciones
obligatorias fueron guardadas y verificadas. Solo después de alcanzar ese estado el
onboarding se considerará terminado y el acceso normal podrá dirigir al dashboard.

### 5.6 Funciones opcionales: Webchat y Voz

Webchat y Voz no deben bloquear el onboarding cuando una organización no desea
utilizarlos.

En cada paso el tenant podrá elegir mediante una opción sencilla:

- `Quiero usar Webchat` / `No quiero usar Webchat`.
- `Quiero usar Voz` / `No quiero usar Voz`.

Si el tenant selecciona que no desea usar una función:

- El paso quedará como `No se utilizará`.
- No se solicitarán sus credenciales, enlaces ni parámetros operativos.
- No se ejecutarán validaciones de conexión para ese canal.
- El módulo deberá permanecer desactivado para esa organización.
- La decisión podrá cambiarse posteriormente desde configuración completa.
- La decisión quedará registrada para que el avance sea consistente.

Si el tenant decide utilizarla, entonces el paso deberá mostrar sus subpasos
normales y exigir las validaciones correspondientes antes de marcarlo como
completado.

`No se utilizará` es un estado resuelto del onboarding, pero no significa que el
canal esté configurado o conectado. Esta diferencia debe reflejarse claramente en
la interfaz.

## 6. Consolidación de inteligencia artificial

### 6.1 Decisión funcional

La organización capturará una sola clave de conexión de inteligencia artificial.

Esta conexión será utilizada por los módulos que tengan habilitada la inteligencia
artificial: Webchat, WhatsApp, Messenger, Voz y las funciones de plantillas que
correspondan.

Webchat dejará de mostrar un campo para esa clave. Voz también dejará de mostrar un
campo separado en el flujo normal.

### 6.2 Campos visibles

La sección central debe mostrar únicamente:

- **Clave de conexión**.
- **Proyecto**, cuando sea necesario para la cuenta.
- Estado de conexión.
- Fecha o indicación de última actualización, sin exponer el valor secreto.
- Acción `Actualizar conexión`.

La clave nunca debe mostrarse después de guardarse. Para cambiarla, el usuario debe
capturar una nueva.

### 6.3 Configuración avanzada de voz

La voz puede conservar parámetros específicos como modelo, asistente y límites,
pero debe utilizar la conexión central por defecto.

Una conexión distinta para voz solo podrá existir como opción avanzada si se
confirma una necesidad real de producto. No debe formar parte del alta normal de un
tenant.

### 6.4 Migración compatible

La migración de configuración debe seguir este orden:

1. Si existe la conexión histórica de Webchat y no existe la conexión general,
   copiarla de forma controlada a la conexión general.
2. Si ambas existen, conservar la conexión general como fuente visible y registrar
   la existencia de la histórica para revisión administrativa.
3. Mantener temporalmente el fallback del runtime.
4. Cambiar la UI y las acciones para escribir únicamente la conexión general.
5. Revisar tenants con ambas claves y confirmar cuál es efectiva.
6. Retirar el fallback histórico únicamente después de una ventana de observación y
   validación en producción.

No se deben eliminar secretos automáticamente sin respaldo, alcance de tenant y
confirmación operativa.

## 7. Cambios por sección

### Webchat

Debe contener:

- Activar o desactivar Webchat.
- Alias del canal.
- Asistente.
- Versión del asistente.
- Tiempo de inactividad.
- Mantener sesión.
- Recontacto automático.
- Escalamiento a una persona.
- Estado de la conexión de inteligencia artificial.

Debe eliminarse el campo de clave de conexión de esta sección.

### Inteligencia artificial

Debe contener:

- Conexión central.
- Proyecto.
- Configuración avanzada de voz.
- Estado de uso por módulos.

Debe evitar nombres de entorno, nombres de variables y nombres internos.

### WhatsApp

Debe separar visualmente:

- Conexión del canal.
- Asistente y automatizaciones.
- Plantillas.
- Horarios.

La conexión de inteligencia artificial se muestra como dependencia con estado, no
como otro campo de captura.

### Correo

El tenant debe ver únicamente conceptos del producto:

- Servicio de correo.
- Dominio de envío.
- Remitente.
- Estado de verificación.
- Cuota y estado operativo, cuando aplique.

No mostrar nombres de Postmark, Brevo ni tokens del proveedor. Las credenciales
centrales del proveedor permanecen en backend, conforme al plan de correo.

### Personas, empresas y contactos

No deben incorporarse a `settings/variables`. Su flujo debe permanecer en el módulo
de Personas, con el modelo guiado de persona, cuenta y relación.

### Listas de precios

No deben incorporarse a `settings/variables`. Deben continuar en `settings/account`,
donde se administran listas, precios, permisos y límites de descuento.

## 8. Secretos y configuración avanzada

La pestaña genérica `Secretos` debe retirarse de la experiencia normal del tenant.

Opciones recomendadas:

1. Ocultarla completamente para administradores de organización.
2. Mantenerla únicamente en una vista de plataforma protegida.
3. Si se conserva para soporte, usar un catálogo cerrado de conexiones válidas, sin
   permitir nombres libres.

La eliminación visual no elimina la validación del backend. Las operaciones deben
seguir usando permisos tenant-scoped y cifrado existente.

## 9. Plan de implementación

### Fase 0. Inventario y contrato

- Confirmar todos los campos visibles actuales.
- Clasificar cada campo como dato de organización, canal, integración,
  automatización o compatibilidad.
- Definir el catálogo de textos de usuario.
- Documentar la fuente efectiva de cada configuración.
- Identificar tenants con claves duplicadas.
- Definir el contrato común entre onboarding y configuración completa.
- Clasificar Webchat y Voz como funciones opcionales.

### Fase 1. Consolidar inteligencia artificial

- Retirar la captura de clave de Webchat.
- Retirar la captura normal de clave de Voz.
- Mantener una sola captura en Inteligencia artificial.
- Cambiar mensajes y estados a lenguaje de usuario.
- Mantener compatibilidad de lectura en backend.

### Fase 2. Estado de dependencias

- Crear estados reutilizables `Listo`, `Pendiente` y `Revisar`.
- Mostrar dependencias en Webchat, WhatsApp, Messenger, Voz y Correo.
- Agregar enlaces directos a la configuración pendiente.
- Evitar formularios duplicados.

### Fase 2.1. Verificaciones por integración

- Definir un verificador por tipo de integración.
- Comprobar credenciales, respuesta, permisos, enlaces y dominios según corresponda.
- Permitir probar antes de guardar cuando sea seguro.
- Devolver mensajes claros sobre la corrección necesaria.
- Ejecutar la prueba con autorización y alcance de la organización actual.
- No registrar claves, tokens, contraseñas ni respuestas completas.

### Fase 2.2. Onboarding guiado

- Crear la vista guiada de onboarding.
- Reutilizar los formularios y acciones de configuración existentes.
- Mostrar porcentaje y avance real.
- Resolver el primer paso pendiente desde backend.
- Permitir revisar pasos anteriores.
- Reflejar en onboarding los cambios hechos desde `settings/variables`.
- Evitar que onboarding cree una fuente de datos separada.
- Permitir guardado parcial de pasos y subpasos.
- Reanudar desde el primer pendiente sin perder avances anteriores.
- Diferenciar entre `guardado`, `validado` y `completado`.
- Permitir marcar Webchat y Voz como funciones que no se utilizarán.
- No pedir configuración ni ejecutar pruebas de canales omitidos.
- Contabilizar una función omitida como resuelta, no como configurada.

### Fase 3. Reorganización visual

- Agrupar pestañas por intención.
- Reducir la exposición inicial de configuraciones avanzadas.
- Mantener URLs con compatibilidad durante la transición.
- Revisar responsive y navegación con teclado.
- Aplicar el mismo lenguaje no técnico y sin proveedores en onboarding y en la vista
  completa.

### Fase 3.1. Redirección del primer acceso

- Consultar el estado calculado del onboarding después de autenticar al usuario.
- Enviar tenants incompletos a onboarding.
- Enviar tenants completos al dashboard.
- Permitir volver a configuración completa desde el panel.
- Mantener libres las rutas de autenticación, billing, soporte y recuperación de
  acceso.

### Fase 4. Limpieza de lenguaje

- Sustituir etiquetas técnicas.
- Sustituir mensajes de éxito y error.
- Revisar placeholders y textos de ayuda.
- Revisar nombres visibles en validaciones.
- Revisar documentación tenant-facing.

### Fase 5. Retiro progresivo del legado

- Medir uso de claves históricas.
- Resolver tenants con más de una conexión.
- Mantener respaldo y trazabilidad.
- Retirar escrituras antiguas.
- Retirar fallback solo después de validación viva.

## 10. Seguridad y autorización

- Ninguna clave debe llegar al navegador después de guardarse.
- Los estados deben indicar existencia, nunca el valor secreto.
- El backend debe resolver la organización desde la sesión autenticada.
- El frontend no debe ser la capa definitiva de autorización.
- Las acciones de configuración deben validar permisos de administración.
- No aceptar nombres de secretos arbitrarios en la experiencia tenant-facing.
- No imprimir claves, tokens ni contraseñas en logs o errores.
- La configuración central del proveedor de correo permanece fuera del tenant.

## 11. Pruebas de aceptación

### OpenAI / inteligencia artificial

- Una clave capturada aparece como una sola conexión disponible.
- Webchat no muestra otro campo de clave.
- Voz no muestra otro campo de clave en el flujo normal.
- Webchat, WhatsApp, Messenger y Voz pueden usar la conexión central.
- Una organización existente con solo la clave histórica sigue funcionando durante
  la transición.
- Una organización con ambas claves queda identificada para revisión.
- Ninguna respuesta o bundle contiene el valor secreto.

### Experiencia

- Un administrador entiende qué falta sin conocer nombres técnicos.
- Cada dependencia ofrece un enlace a su lugar de configuración.
- Los estados de carga, error, vacío y éxito son claros.
- Las acciones principales se distinguen de las avanzadas.
- Cada integración permite comprobar su conexión, respuesta o enlace.
- El resultado de cada comprobación indica claramente qué debe corregirse.
- La configuración puede realizarse sin consultar documentación técnica.
- Onboarding y `settings/variables` muestran la misma información configurada.
- Completar un paso en una vista se refleja en la otra.
- El primer acceso de un tenant incompleto abre onboarding.
- Un tenant al 100% entra directamente al dashboard.
- Un tenant puede guardar avances antes de llegar al 100%.
- Un tenant puede salir y reanudar después sin perder cambios.
- Un error puntual no borra avances válidos de otros pasos.
- Ninguna de las dos vistas muestra nombres técnicos ni nombres de proveedores.

### Seguridad

- Un tenant no puede leer ni modificar configuración de otro tenant.
- El backend mantiene sus validaciones aunque se oculten controles en UI.
- La pestaña avanzada no permite crear secretos libres desde tenant.
- No se exponen nombres ni credenciales de proveedores internos innecesariamente.
- Las pruebas de conexión respetan el tenant autenticado y no realizan cambios
  irreversibles.
- El progreso no puede completarse manualmente sin pasar las validaciones requeridas.
- Guardar cambios no requiere completar el onboarding al 100%.
- El sistema conserva los pasos y subpasos guardados aunque sigan pendientes de
  validación.
- Webchat y Voz pueden resolverse como `No se utilizará` sin configurar sus
  conexiones.
- Una función marcada como no utilizada no puede quedar activa por accidente.
- El tenant maestro no queda bloqueado por el onboarding de tenants clientes.

## 12. Fuera de alcance de la primera implementación

- Rediseñar todos los módulos funcionales de la aplicación.
- Cambiar el modelo de personas, empresas o relaciones.
- Mover listas de precios a Variables.
- Cambiar el modelo de datos de Postmark.
- Eliminar inmediatamente secretos históricos.
- Cambiar permisos existentes sin una revisión independiente.

## 13. Criterio de terminado

La mejora se considerará terminada cuando:

- Exista una sola captura visible para la conexión de inteligencia artificial.
- Los módulos no repitan credenciales.
- No se muestren nombres técnicos al tenant.
- La configuración pendiente sea accionable y comprensible.
- Cada API, token, clave o enlace relevante tenga una comprobación adecuada.
- Los resultados de las comprobaciones sean claros, seguros y trazables.
- Onboarding y configuración completa compartan fuente de verdad y reglas.
- El tenant pueda guardar, salir y continuar posteriormente sin perder avances.
- Se mantenga compatibilidad con organizaciones existentes durante la migración.
- El backend y las pruebas confirmen aislamiento por tenant.
- Se valide el flujo con usuarios representativos y una prueba viva desplegada.

## 14. Documentación relacionada

- `docs/multi_tenant/tenant_variables_catalog.md`
- `docs/multi_tenant/tenant_config_schema.md`
- `docs/Plan_Postmark/03-seguridad-y-operacion.md`
- `docs/Plan_Postmark/02-arquitectura-postmark.md`
- `docs/Plan_lista_precios/PLAN_LISTAS_PRECIOS.md`
- `docs/Plan_personas_empresa_contactos/plan_personas_empresa_contactos.md`
- `docs/Plan_personas_empresa_contactos/frontend_alta_persona_cuenta_relacion.md`
- `docs/Plan_IA_Plantillas/PLAN_ASISTENTE_IA_PLANTILLAS_PROSPECCION.md`
