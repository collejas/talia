# Changelog — mejora de configuración por organización

Este archivo registra el avance del plan de simplificación de
`/settings/variables`.

## [2026-09-02] — Recuperación de WhatsApp durante el onboarding

- El paso de WhatsApp ahora se considera completo únicamente cuando la conexión
  asistida está en estado `conectado`.
- Los tenants con un intento fallido pueden corregir sus identificadores y
  reanudar el proceso sin borrar una conexión operativa confirmada.
- El número productivo no cambia durante la validación ni el registro; solo se
  sincroniza al confirmar la conexión completa.

## [2026-08-31] — Logo empresarial mediante carga de archivo

### Cambio realizado

- Se eliminó la captura manual de `Logo URL` de los datos generales y del
  onboarding.
- La sección “Imagen empresarial” ahora permite cargar directamente el logo de
  la organización.
- El archivo se guarda en la galería de imágenes del tenant y se asocia a su
  organización para reutilizarlo en materiales comerciales.
- Las cotizaciones utilizan el logo empresarial como respaldo cuando no tienen
  un logo específico configurado.

## [2026-08-31] — Imagen empresarial incorporada al onboarding

- Se agregó “Imagen empresarial” como paso independiente del onboarding.
- El tenant puede cargar su logo desde una vista propia del flujo inicial.
- El avance considera completado este paso cuando el logo queda asociado a la
  organización.

## [2026-08-31] — Validación visible y nombres alineados

- Los nombres de los campos de organización ahora coinciden con los datos que
  realmente determinan el avance.
- Se agregó el teléfono de la organización como campo explícito.
- El resumen y cada paso muestran ✓ cuando están completos y ✕ cuando están
  pendientes.
- El paso de Imagen empresarial y el resumen reflejan correctamente su estado.

## [2026-08-30] — Zoom opcional dentro de Agenda

### Cambio realizado

- Agenda y Zoom ahora se configuran como decisiones independientes.
- El tenant puede elegir no utilizar Zoom y completar Agenda sin capturar datos
  de conexión de reuniones virtuales.
- Si elige utilizarlo, el formulario muestra los datos necesarios dentro del
  mismo paso y conserva la validación de Agenda.
- Guardar Agenda sin activar Zoom ya no sobrescribe la configuración existente
  de Zoom.
- La selección se guarda junto con el avance del onboarding y puede cambiarse
  posteriormente.

## [2026-08-30] — Fase 0: inventario del alta, acceso y configuración

### Revisión realizada

- Se revisó el flujo documentado de alta manual y alta comercial.
- Se confirmó que el aprovisionamiento aplica defaults del plan, crea la estructura
  inicial y prepara el usuario propietario.
- Se confirmó que la confirmación de correo, la invitación y el rol inicial ya tienen
  un flujo común.
- Se confirmó que existe un estado general de onboarding en la organización.
- Se revisó el acceso actual después del login.
- Se revisaron las rutas tenant-scoped de configuración, secretos, rutas y
  validaciones.

### Hallazgos

- El acceso posterior al login utiliza el dashboard como destino predeterminado.
- No existe todavía una vista dedicada de onboarding para configuración del tenant.
- El estado general existente no representa por sí solo pasos, subpasos, validaciones
  ni decisiones de funciones opcionales.
- Las configuraciones actuales pueden reutilizarse como fuente de verdad del
  onboarding.
- El tenant maestro debe conservar su flujo administrativo y no quedar sujeto al
  onboarding de tenants clientes.

### Resultado de la fase

- Estado: `completada`.
- No se modificó código, base de datos ni comportamiento de acceso.
- La siguiente fase es definir el contrato de pasos, estados, decisiones opcionales,
  cálculo de avance y guardado parcial.

## [2026-08-30] — Verificación de conexiones y enlaces agregada al plan

### Decisión

- Cada API, token, clave, URL, dominio, ruta o enlace relevante tendrá una acción
  para comprobar su conexión, respuesta, permisos o disponibilidad.
- La comprobación se ejecutará desde backend y con alcance de la organización
  autenticada.
- Los resultados serán claros y orientados a la acción.
- La prueba podrá ejecutarse antes o después de guardar, según el tipo de
  integración.
- No se mostrarán credenciales ni respuestas crudas del proveedor.
- Las pruebas no podrán ejecutar operaciones irreversibles ni modificar datos.
- La auditoría conservará únicamente resultado, fecha, organización, integración
  y código normalizado cuando sea necesario.

## [2026-08-30] — Onboarding como modo guiado de la configuración existente

### Decisión

- El onboarding y `settings/variables` compartirán la misma fuente de datos,
  servicios, validaciones y componentes.
- El onboarding será una presentación guiada de la configuración existente, no un
  segundo sistema ni una copia de los datos.
- Lo configurado en onboarding aparecerá en `settings/variables`, y lo configurado
  en `settings/variables` actualizará el avance del onboarding.
- Tenants incompletos irán al onboarding después del primer acceso.
- Tenants completados irán directamente al dashboard.
- Los tenants completados podrán volver a la configuración completa para revisar o
  corregir datos.
- El progreso se calculará con validaciones reales y no podrá completarse solo con
  un botón.
- Ambas vistas usarán lenguaje funcional y no mostrarán nombres técnicos ni
  nombres de proveedores.

## [2026-08-30] — Guardado parcial y reanudación del onboarding

### Decisión

- El tenant podrá guardar cambios sin llegar al 100% del onboarding.
- Se podrán guardar pasos completos o avances parciales de subpasos.
- El tenant podrá salir de la aplicación y continuar después sin perder lo guardado.
- El siguiente acceso abrirá el primer paso pendiente.
- Los avances válidos de un paso no se perderán por un error en otro paso.
- El sistema distinguirá entre información guardada, información validada y paso
  completado.
- El 100% solo marcará el final del onboarding y habilitará la entrada normal al
  dashboard; no será un requisito para guardar.

### Estados funcionales

- `Guardado`: la información fue almacenada correctamente.
- `Pendiente de validar`: falta ejecutar o aprobar una comprobación.
- `Requiere atención`: existe un error que el tenant debe corregir.
- `Completado`: el paso cumple todos sus requisitos.

### Pendientes generales del onboarding

- Diseñar las acciones `Guardar avance` y `Guardar y continuar después`.
- Persistir el último paso visitado y el primer paso pendiente.
- Validar que los errores parciales no reviertan cambios válidos.

### Pendientes generales del onboarding

- Definir el catálogo de pasos y subpasos.
- Crear el cálculo central del avance.
- Crear la navegación al primer pendiente.
- Integrar las comprobaciones de conexiones en cada paso.
- Conectar el primer acceso con el estado real del onboarding.
- Validar la separación entre tenant maestro y tenants clientes.

## [2026-08-30] — Canales opcionales que el tenant decide no utilizar

### Decisión

- Webchat y Voz serán pasos opcionales del onboarding.
- El tenant podrá marcar cada uno como `No se utilizará` mediante una opción
  sencilla.
- Una función marcada como no utilizada contará como paso resuelto para el avance,
  pero no como función configurada.
- Cuando se elija no utilizarla, no se pedirán credenciales, enlaces ni parámetros,
  y el módulo permanecerá desactivado.
- Cuando se elija utilizarla, sí deberán completarse sus subpasos y validaciones.
- La decisión podrá cambiarse posteriormente desde la configuración completa.
- La interfaz distinguirá claramente entre `Configurado` y `No se utilizará`.

### Pendientes agregados

- Definir los controles de decisión para Webchat y Voz.
- Persistir la decisión de uso de cada canal.
- Impedir que un canal omitido se active accidentalmente.
- Ajustar el cálculo del porcentaje y del 100% final.

## [2026-08-30] — Fase 1: contrato inicial de pasos y estados

### Avance

- Se definió el catálogo inicial de pasos aplicables al tenant.
- Se definieron los estados funcionales de cada paso y subpaso.
- Se definió la diferencia entre guardado, validado, completado y no utilizado.
- Se definió el guardado parcial y la reanudación desde el primer pendiente.
- Se definió el cálculo del porcentaje solo sobre pasos aplicables.
- Se definió que Webchat y Voz pueden resolverse como `No se utilizará`.
- Se definieron las reglas de finalización y redirección al dashboard.
- Se estableció que onboarding y `settings/variables` comparten fuente de verdad.
- Se estableció que ninguna de las dos vistas mostrará nombres técnicos ni
  proveedores.

### Documento creado

- `docs/Plan_Configuraciones/ONBOARDING_PASOS_Y_ESTADOS.md`

### Estado

- Fase 1: `completada`.
- Siguiente fase: implementar la respuesta tenant-scoped del avance y sus
  validaciones en backend.

## [2026-08-30] — Plan inicial aprobado para implementación

### Estado

- Estado: `planificado`.
- No se modificó código ni base de datos en esta fase.
- La primera prioridad es consolidar la conexión de inteligencia artificial y
  eliminar la captura duplicada en Webchat y Voz.

### Hallazgos confirmados

- Webchat solicita una clave de inteligencia artificial.
- La sección OpenAI solicita otra clave para la misma dependencia.
- El runtime conserva compatibilidad con ambas claves mediante fallback.
- La vista expone múltiples pestañas técnicas y una sección genérica de Secretos.
- Correo, listas de precios y personas/contactos tienen planes propios y no deben
  mezclarse dentro de Variables.

### Decisiones

- La interfaz tenant-facing usará lenguaje funcional y no nombres técnicos de
  variables, tablas, rutas, niveles internos ni proveedores.
- Existirá una sola captura visible para la conexión de inteligencia artificial.
- Webchat configurará comportamiento del canal, no credenciales compartidas.
- Voz utilizará la conexión central por defecto.
- Las claves históricas se conservarán temporalmente para compatibilidad y se
  retirarán únicamente después de validar tenants existentes.
- La pestaña genérica de Secretos no formará parte del flujo normal del tenant.
- Listas de precios permanecerán en `settings/account`.
- Personas, empresas y relaciones permanecerán en el módulo de Personas.
- Postmark y las credenciales centrales de correo permanecerán ocultos para el
  tenant.

### Archivos creados

- `docs/Plan_Configuraciones/PLAN_MEJORA_CONFIGURACION.md`
- `docs/Plan_Configuraciones/CHANGELOG.md`

### Pendientes

- Implementar la consolidación de la conexión de inteligencia artificial.
- Diseñar el estado reutilizable de dependencias.
- Cambiar etiquetas, ayudas, placeholders y mensajes a lenguaje de usuario.
- Revisar la pestaña de configuración avanzada.
- Identificar organizaciones con claves históricas y generales simultáneas.
- Ejecutar pruebas de tenant, permisos y no exposición de secretos.
- Validar el flujo en el entorno desplegado con usuarios representativos.

### Criterio para el siguiente avance

No cerrar la primera fase únicamente con compilación local. Debe comprobarse que:

1. La clave se captura una sola vez.
2. Webchat y Voz utilizan la conexión central.
3. Los tenants existentes siguen funcionando durante la transición.
4. La UI no muestra nombres técnicos ni valores secretos.
5. El backend mantiene la autorización y el aislamiento por organización.

## [2026-08-30] — Primer corte funcional de onboarding

### Cambios realizados

- Se añadió una migración para guardar las decisiones opcionales de Webchat y
  Voz, así como el último paso visitado.
- Se añadió un servicio backend que calcula el avance a partir de la
  configuración real del tenant.
- Se añadieron rutas tenant-scoped para consultar y guardar el avance sin
  exponer nombres técnicos ni secretos.
- Se añadió la vista inicial de onboarding con porcentaje, pasos, paso actual,
  guardado de decisiones opcionales y reanudación.
- El dashboard redirige al onboarding mientras existan pasos pendientes.
- Cuando todos los pasos aplicables están resueltos, el tenant continúa al
  dashboard normal.

### Validación local

- TypeScript del panel: correcto.
- ESLint del panel: correcto; permanecen advertencias preexistentes fuera de
  este cambio.
- Compilación de los módulos backend modificados: correcta.
- No se aplicó todavía la migración en Supabase ni se validó el flujo en un
  entorno desplegado.

### Pendientes de la siguiente iteración

- Conectar cada tarjeta de onboarding con el formulario correspondiente de
  `settings/variables` y devolver al onboarding al guardar.
- Completar validaciones reales de conexión, respuesta, dominio y pruebas de
  funcionamiento por subpaso.
- Revisar la definición final de qué pasos son obligatorios según el plan y
  los módulos contratados.
- Aplicar la migración y probar aislamiento entre tenants.

## [2026-08-30] — Eliminación de captura duplicada en Webchat

### Cambios realizados

- Webchat dejó de mostrar un campo propio para la conexión de inteligencia.
- La conexión se administra desde una sola sección central.
- Se conserva la compatibilidad del backend con configuraciones históricas
  mientras se revisan los tenants existentes.
- El mensaje de guardado de Webchat ahora indica que la conexión central se
  configura en un solo lugar.

### Pendiente

- Revisar y actualizar los campos avanzados de la sección Inteligencia para
  que sus etiquetas sean funcionales y no técnicas.
- Validar que todos los módulos utilicen la conexión central antes de retirar
  definitivamente las claves históricas.

## [2026-08-30] — Etiquetas funcionales para inteligencia y voz

### Cambios realizados

- La conexión principal ahora se presenta como “Conexión de inteligencia”.
- Los identificadores internos dejaron de mostrarse como etiquetas del tenant.
- Voz utiliza la conexión principal y ya no solicita una segunda clave.
- Se actualizaron ayudas y mensajes de guardado con lenguaje funcional.

### Compatibilidad

- Las claves específicas históricas permanecen almacenadas para permitir una
  transición segura, pero ya no se solicitan en los formularios nuevos.

## [2026-08-30] — Lenguaje funcional en correo, telefonía y búsqueda

### Cambios realizados

- Se reemplazaron etiquetas de variables internas por nombres comprensibles
  para correo, telefonía y búsqueda.
- Se eliminaron referencias visibles a proveedores en títulos y ayudas.
- Los estados de conexión ahora se muestran como “Conexión registrada”,
  “Servicio conectado” o “Conexión pendiente”.
- Las validaciones de estas secciones ahora se describen como una comprobación
  de funcionamiento.

### Pendiente

- Sustituir los resultados técnicos de validación por mensajes funcionales y
  acciones concretas para el tenant.

## [2026-08-30] — Mensajes funcionales de validación

### Cambios realizados

- La respuesta de validación para tenants ya no devuelve rutas, nombres de
  variables ni nombres de claves internas.
- Los faltantes se presentan como acciones: activar un canal, completar datos
  o completar una conexión segura.
- El panel de validación cambió títulos técnicos por “Canales pendientes”,
  “Datos pendientes” y “Conexiones pendientes”.
- La validación administrativa conserva su detalle interno fuera del flujo
  tenant-facing.

## [2026-08-30] — Comprobación desde el resumen de onboarding

### Cambios realizados

- Cada paso compatible del onboarding ahora incluye el botón “Comprobar”.
- El resultado se muestra en la misma tarjeta del paso.
- El tenant recibe un mensaje funcional cuando el paso está listo o aún tiene
  elementos pendientes.
- La comprobación utiliza las mismas rutas de validación que la configuración
  compartida.

## [2026-08-30] — Migración de avance aplicada

### Cambios realizados

- Se aplicó `20260830_120000_tenant_onboarding_progress.sql` en la base de
  datos conectada.
- La tabla quedó disponible y actualmente no tiene registros, porque se
  crearán cuando cada tenant guarde una decisión o avance del onboarding.
- Se verificó que los 8 tenants existentes pueden consultarse sin exponer
  credenciales.

## [2026-08-30] — Onboarding siempre accesible para revisión

### Corrección

- Se eliminó la redirección que impedía abrir onboarding cuando el tenant ya
  estaba marcado como completado.
- `onboarding` y `settings/variables` continúan usando la misma configuración
  y el mismo avance; solo cambia la forma de presentarlos.
- El tenant puede revisar y modificar pasos terminados sin perder su estado.
- La redirección automática solo ocurre al entrar al Dashboard cuando faltan
  pasos y el tenant requiere onboarding.

## [2026-08-30] — Publicación de ruta de onboarding

### Infraestructura

- Nginx ahora envía `/onboarding` al panel de Next.js en lugar de resolverlo

## [2026-08-30] — Onboarding paso a paso con captura de datos

### Cambios realizados

- Se añadió una vista propia para cada paso de configuración.
- Cada vista muestra numeración, avance, pasos disponibles y navegación anterior
  y siguiente.
- Los formularios existentes se reutilizan dentro del onboarding para guardar los
  datos en la misma configuración de la organización.
- Se añadió la opción de guardar y salir al dashboard sin marcar el proceso como
  terminado.
- El resumen continúa disponible para revisar el avance y volver a cualquier paso.
- El resumen quedó integrado como primer elemento de la navegación lateral.
- “Ir al dashboard por ahora” permite entrar al dashboard sin convertir el avance
  incompleto en un onboarding terminado.
- La navegación no promete guardar formularios que aún no fueron enviados; cada
  formulario conserva su acción visible de guardado y después el tenant puede
  continuar al siguiente paso.

## [2026-08-30] — Corrección del guardado de datos de organización

- Los campos geográficos opcionales ya no se envían como texto vacío, evitando
  errores de relación cuando todavía no se ha seleccionado un estado o municipio.
- Si falta una selección válida, el tenant recibe una indicación clara en español
  y no se muestra el error interno de la base de datos.

## [2026-08-30] — Decisión de uso para Webchat y Voz dentro del onboarding

- Cada uno de estos pasos comienza preguntando si la organización desea utilizar
  la función.
- Al elegir que no se utilizará, el paso queda resuelto sin pedir datos de conexión
  ni mostrar el formulario operativo.
- Al elegir utilizarla, se muestra el formulario y sus comprobaciones normales.

### Pendientes

- Conectar los pasos de usuarios, permisos y catálogos con sus formularios
  específicos dentro del mismo flujo.
- Validar automáticamente el resultado de cada guardado para actualizar el estado
  del paso sin requerir volver al resumen.
  desde la carpeta pública de la landing.
- Se validó la configuración con `nginx -t` y se recargó Nginx sin reinicio
  completo.
- Se publicó el panel actualizado y se reinició únicamente
  `talia-panel.service`.
- La ruta requiere sesión autenticada; sin sesión redirige al flujo de acceso
  del panel.
