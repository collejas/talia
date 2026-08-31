# Contrato de pasos y estados del onboarding

## 1. Propósito

Definir el comportamiento común de `/onboarding` y `settings/variables` para que
ambas vistas compartan la misma información, validaciones y criterio de avance.

El onboarding es una experiencia guiada. No es una segunda configuración ni una
copia de los datos de la organización.

## 2. Estados funcionales

Cada paso o subpaso puede tener uno de estos estados:

| Estado | Significado |
| --- | --- |
| No iniciado | Todavía no hay información guardada. |
| Guardado | La información se almacenó correctamente, pero puede faltar una comprobación. |
| Pendiente de validar | La información existe y requiere una prueba o confirmación. |
| Requiere atención | Existe un error que el tenant debe corregir. |
| Completado | Cumple todos los requisitos del paso. |
| No se utilizará | El tenant decidió no activar una función opcional. |

`No se utilizará` solo aplica a funciones opcionales, como Webchat y Voz. No
equivale a una función configurada o conectada.

## 3. Reglas de guardado

- Cualquier cambio válido puede guardarse aunque el onboarding no esté completo.
- Un error en un campo no debe borrar cambios válidos de otros campos.
- Un error en un paso no debe revertir pasos ya guardados.
- El tenant puede salir y continuar posteriormente.
- El último paso visitado puede recordarse para mejorar la reanudación.
- El primer paso pendiente siempre debe calcularse con el estado actual, no confiar
  únicamente en el último paso visitado.
- Guardar no equivale a completar.
- Completar requiere guardar y validar los requisitos del paso.

## 4. Pasos iniciales

El catálogo inicial será:

### Paso 1. Datos de la organización

Obligatorio.

Debe comprobar:

- Nombre de la organización.
- Contacto principal.
- Correo de contacto.
- Teléfono cuando aplique.
- País, ciudad, idioma, moneda y zona horaria.
- Datos fiscales mínimos cuando el plan o el país los requiera.

Resultado posible: `Completado`, `Guardado` o `Requiere atención`.

### Paso 2. Conexión de inteligencia artificial

Obligatorio si el plan incluye funciones de inteligencia artificial activas.

Debe comprobar:

- Conexión capturada.
- Respuesta correcta.
- Permisos suficientes.
- Proyecto válido cuando aplique.

La credencial no se muestra después de guardarse. La interfaz solo muestra el
estado de la conexión.

### Paso 3. Webchat

Opcional.

El tenant debe elegir una de estas opciones:

- Usar Webchat.
- No se utilizará.

Si elige usarlo, debe comprobar:

- Canal activado.
- Alias definido.
- Asistente seleccionado.
- Conexión de inteligencia artificial disponible.
- Prueba básica exitosa.

Si elige no utilizarlo, el paso queda en `No se utilizará` y el canal permanece
desactivado.

### Paso 4. WhatsApp

Opcional según plan.

Debe comprobar, cuando el canal esté habilitado:

- Cuenta conectada.
- Número validado.
- Suscripción confirmada.
- Plantillas necesarias verificadas.
- Prueba de envío o respuesta cuando corresponda.

Si el plan no incluye WhatsApp, el paso no se muestra o queda como `No aplica`.

### Paso 5. Messenger

Opcional según plan.

Debe comprobar:

- Conexión capturada.
- Permisos suficientes.
- Página o cuenta asociada.
- Prueba de respuesta.

### Paso 6. Voz

Opcional.

El tenant debe elegir:

- Usar Voz.
- No se utilizará.

Si elige usarla, debe comprobar:

- Canal activado.
- Parámetros básicos configurados.
- Conexión central de inteligencia artificial disponible.
- Prueba de funcionamiento.

Si elige no utilizarla, el paso queda en `No se utilizará` y el canal permanece
desactivado.

### Paso 2. Imagen empresarial

El tenant carga directamente el logo de su organización. El archivo se guarda
de forma segura y queda disponible para cotizaciones, correos y materiales
comerciales. No se solicita una dirección web del archivo.

### Paso 8. Agenda

Obligatorio solo si el plan o los canales activos utilizan agenda.

Debe comprobar:

- Zona horaria.
- Recurso de agenda.
- Horarios o ventanas disponibles.
- Prueba de disponibilidad.

Si ninguna función activa utiliza agenda, puede marcarse como `No aplica`.

#### Zoom dentro de Agenda

Zoom es opcional y no debe bloquear la configuración de la agenda. El tenant
elige una de estas opciones:

- **Sí, quiero utilizarlo**: se muestran los datos necesarios y se valida la
  conexión antes de considerar terminado este subpaso.
- **No lo utilizaré**: el subpaso queda resuelto, no se solicitan datos de
  conexión y la agenda continúa disponible sin reuniones virtuales.

La decisión puede cambiarse posteriormente desde la configuración. La pantalla
no muestra nombres técnicos ni nombres de proveedores.

### Paso 8. Correo

Obligatorio para funciones que envían correo al cliente o al equipo.

Debe comprobar:

- Dominio registrado.
- Dominio verificado.
- Remitente configurado.
- Prueba de envío exitosa.

No se muestran credenciales ni nombres de proveedores externos.

### Paso 9. Usuarios y permisos

Obligatorio para habilitar la operación normal.

Debe comprobar:

- Usuario propietario activo.
- Rol y permisos base disponibles.
- Estructura inicial de operación creada.
- Al menos un usuario operativo cuando el plan lo requiera.

### Paso 10. Catálogos y operación

Se muestra según el plan y módulos contratados.

Puede incluir:

- Productos y servicios.
- Propiedades.
- Listas de precios.
- Vendedores.
- Configuración comercial.

Las listas de precios seguirán administrándose desde `settings/account`; el
onboarding solo puede llevar al usuario a esa configuración y verificar que esté
lista cuando sea requisito del plan.

## 5. Cálculo del porcentaje

El porcentaje se calculará únicamente sobre los pasos aplicables a la organización.

Reglas:

- Paso obligatorio completado: cuenta como resuelto.
- Paso opcional configurado y validado: cuenta como resuelto.
- Paso opcional marcado `No se utilizará`: cuenta como resuelto.
- Paso no incluido en el plan: no entra en el denominador.
- Paso guardado pero no validado: no cuenta como completado.
- Paso con error: no cuenta como completado.

Fórmula conceptual:

```text
porcentaje = pasos_resueltos / pasos_aplicables * 100
```

El backend debe devolver también cantidades, no solo el porcentaje:

- Total de pasos aplicables.
- Pasos resueltos.
- Pasos completados.
- Pasos marcados como no utilizados.
- Pasos pendientes.
- Pasos que requieren atención.
- Primer paso pendiente.

## 6. Finalización

El onboarding se considera finalizado cuando:

- Todos los pasos obligatorios están completados.
- Cada función opcional está configurada o marcada como no utilizada.
- No existen errores bloqueantes.
- Las comprobaciones necesarias fueron exitosas.

Al finalizar:

- Se actualiza el estado general del onboarding.
- El siguiente acceso dirige al dashboard.
- El tenant conserva acceso a `settings/variables`.
- La finalización queda registrada con fecha y usuario responsable.

## 7. Redirección

La redirección debe resolverla el servidor usando el estado calculado:

- Primer acceso de tenant incompleto: onboarding.
- Tenant en progreso: onboarding en el primer pendiente.
- Tenant completo: dashboard.
- Tenant maestro: flujo administrativo normal.

No se debe confiar en una cookie del navegador ni en un valor enviado por el
frontend para decidir si el onboarding terminó.

## 8. Contrato de respuesta conceptual

La respuesta del estado debe contener información funcional equivalente a:

```json
{
  "porcentaje": 60,
  "estado": "en_progreso",
  "primer_paso_pendiente": "whatsapp",
  "pasos": [
    {
      "clave_interna": "whatsapp",
      "titulo": "WhatsApp",
      "estado": "requiere_atencion",
      "mensaje": "Falta validar el número",
      "obligatorio": false,
      "orden": 4
    }
  ]
}
```

`clave_interna` es exclusivamente para uso técnico interno. El frontend no debe
mostrarla ni mostrar otros nombres internos. Los textos visibles deben venir en
lenguaje funcional.

## 9. Reglas de seguridad

- El cálculo siempre debe estar limitado a la organización autenticada.
- El frontend no decide si un paso está completado.
- Las pruebas de conexión se ejecutan en backend.
- No se devuelven secretos ni respuestas crudas.
- El tenant maestro no puede ser redirigido por el onboarding de un tenant cliente.
- No se permite cambiar de organización enviando únicamente un identificador desde
  el navegador.
