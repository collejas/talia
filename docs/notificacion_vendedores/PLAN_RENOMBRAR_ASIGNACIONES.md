# Plan para renombrar la tabla de asignaciones de vendedores

- [x] Auditar todas las referencias actuales a `asignaciones_vendedores_whatsapp` (migraciones, repositorios, vistas, helpers de notificación) para entender el alcance del cambio.
- [x] Crear una migración que renombre la tabla a `asignaciones_vendedores`, añada la columna `canal text NOT NULL DEFAULT 'whatsapp'` y actualice las vistas/índices existentes.
- [x] Refactorizar los repositorios y servicios del backend para que usen el nuevo nombre y guarden el canal correspondiente en el registro (WhatsApp, Webchat, etc.).
- [x] Ajustar pruebas, documentación y cualquier SQL adicional (vistas/materializados) para que apunten a `asignaciones_vendedores` y revisar manualmente que el canal se registra correctamente.
