# Changelog · Exportaciones de vistas

Fecha de inicio: 2026-06-19
Plan base: `plan_exportaciones_vistas.md`

## 2026-06-19

- Se definió el plan general de exportaciones para vistas del panel.
- Se estableció que la exportación debe respetar filtros activos, columnas visibles, indicadores, gráficas y tablas.
- Se acordó que `HTML` puede servir como base para `PDF`, mientras que `XLSX` debe generarse desde el mismo payload estructurado.
- Se creó el backlog inicial para registrar avance por fases.
- Se priorizó como primer frente la implementación del plan para `mapa-de-conversion`.
- Se implementó la exportación XLSX de `mapa-de-conversion`.
- El archivo exportado ya incluye indicadores, gráficos derivados del resumen y las dos tablas de la vista: `Visitas web` y `Conversaciones`.
