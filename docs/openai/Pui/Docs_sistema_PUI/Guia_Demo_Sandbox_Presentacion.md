# Guía de Presentación: Modo Demo / Sandbox

## Objetivo

Permitir que un cliente o revisor conozca la plataforma por dentro sin exponer información real de terceros ni alterar el entorno operativo.

## Entradas de acceso

- `https://pui.geoactiv.mx/dashboard/demo`
- `https://pui.geoactiv.mx/dashboard/login`

La ruta `demo` es la entrada única recomendada para presentaciones. La ruta `login` conserva el acceso normal y, cuando el modo demo está habilitado, prellena el contexto sandbox.

## Contexto sandbox recomendado

- Tenant: `geoactiv-pui-sbx`
- Usuario: `qa.local.owner@geoactiv.mx`
- Rol esperado: lectura/presentación
- Datos: sintéticos, sin información de terceros

## Reglas de uso

- No usar credenciales reales de producción para la presentación.
- No ejecutar acciones que modifiquen datos reales.
- Mantener el tenant sandbox fijo durante la demo.
- Mostrar únicamente flujos y datos de prueba.

## Flujo sugerido de presentación

1. Abrir `https://pui.geoactiv.mx/dashboard/demo`.
2. Explicar que la sesión apunta al sandbox.
3. Navegar por:
   - integraciones,
   - auditoría,
   - reportes,
   - compliance.
4. Mostrar evidencias y trazabilidad sin tocar datos productivos.
5. Cerrar la sesión al finalizar.

## Comportamiento esperado

- Banner visible indicando modo demo.
- Selector de tenant bloqueado o fijo al sandbox.
- Acciones de escritura deshabilitadas o protegidas.
- Navegación completa solo en modo de lectura.

## Referencia operativa

- `Docs/Plan_Implementacion_Dashboard_Multitenant.md`
- `Docs/Bitacora_Implementacion_Dashboard.md`
