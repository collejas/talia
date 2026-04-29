# Changelog del flujo de contactos

Fecha: 2026-04-29 (UTC)

## Resumen

Se implemento y documente la nueva experiencia de CRUD de contactos en el panel, con foco en lenguaje de negocio y flujo guiado.

## Entregado

- Acciones de primer nivel en la vista de contactos:
  - `Nuevo contacto`
  - `Nueva empresa`
  - `Persona física con actividad empresarial`
  - `Vincular contacto a empresa`
- Flujo de alta guiada para contactos.
- Flujo de edicion alineado al mismo lenguaje de usuario final.
- Flujo independiente para vincular contacto con empresa.
- Resumen lateral en desktop para dar contexto del paso actual.
- Ajustes de layout para que el arranque del dashboard no bloquee el primer paint.
- Documentacion actualizada en planes, maqueta y cierre.

## Impacto

- La UI dejo de hablar en terminos de backend para el flujo principal.
- La experiencia permite distinguir mejor entre persona, empresa y relacion.
- La vinculacion ya no depende de crear un contacto nuevo.

## Pendiente

- Detalle post-alta mas rico.
- Mejor UX para sugerencias de duplicado.
- Refinamiento de mobile y accesibilidad.
- Evaluar si se requieren endpoints nativos adicionales para relaciones.

