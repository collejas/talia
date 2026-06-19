# Backlog · Exportaciones de vistas

Fecha de inicio: 2026-06-19
Plan base: `plan_exportaciones_vistas.md`

## Objetivo

Registrar el avance de la funcionalidad de exportación de vistas del panel, empezando por `mapa-de-conversion` y dejando una base reusable para otras pantallas.

## Estado general

- [x] Definir el plan general de exportaciones
- [ ] Implementar el plan para la vista `mapa-de-conversion`
- [ ] Diseñar el contrato de datos de exportación
- [ ] Definir alcance exacto para `mapa-de-conversion`
- [ ] Implementar exportación HTML
- [ ] Implementar exportación PDF
- [ ] Implementar exportación XLSX
- [ ] Agregar acciones de descarga en el panel
- [ ] Reusar la solución en otras vistas

## Fases

### Fase 1: Definición

- [x] Documento de estrategia general
- [ ] Contrato de payload único por vista
- [ ] Reglas de inclusión y exclusión de secciones
- [ ] Convención para filtros activos en el reporte

### Fase 2: `mapa-de-conversion`

- [ ] Implementar el plan para la vista `mapa-de-conversion`
- [ ] Payload de exportación para esta vista
- [ ] Reporte HTML sin sección de filtros
- [ ] Exportación a PDF
- [ ] Exportación a Excel
- [ ] Respeto de columnas configuradas por el usuario

### Fase 3: Reuso transversal

- [ ] Analizar otras vistas candidatas
- [ ] Crear patrón común de exportación
- [ ] Documentar variantes por vista

## Registro de avances

| Fecha | Avance | Detalle |
| --- | --- | --- |
| 2026-06-19 | Plan base creado | Se definió la idea general de exportar vistas filtradas sin incluir la UI de filtros. |
| 2026-06-19 | Backlog inicial creado | Se creó esta lista para registrar avance por fases. |
| 2026-06-19 | Primera tarea priorizada | Se marcó explícitamente la implementación del plan para `mapa-de-conversion` como primer frente de trabajo. |

## Decisiones abiertas

- Formato principal para usuarios finales:
  - PDF
  - Excel
  - Ambos
- Si el HTML será solo una capa intermedia o también una salida visible.
- Si la exportación se generará solo en backend o con una vista intermedia compartida.
- Cómo versionar el payload de exportación por pantalla.

## Próximos pasos sugeridos

1. Definir el contrato de exportación común.
2. Especificar el payload de `mapa-de-conversion`.
3. Decidir qué secciones se exportan como tablas, KPIs y gráficas.
4. Implementar la primera salida: HTML o PDF.
