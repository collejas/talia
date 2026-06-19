# Plan general de exportaciones de vistas

Fecha: 2026-06-19

## 1. Objetivo

Definir una estrategia reutilizable para exportar vistas del panel a formatos descargables, partiendo de la vista filtrada que el usuario ya construyó en pantalla.

La idea es que el usuario pueda aplicar filtros, configurar columnas o secciones visibles, y luego descargar un reporte que refleje exactamente ese estado.

Este plan aplica primero para `mapa-de-conversion`, pero debe servir como base para otras vistas del panel.

## 2. Alcance funcional

La exportación debe incluir:

- filtros activos
- indicadores principales
- gráficas
- tablas
- configuración de columnas visibles
- metadatos del reporte

La exportación no debe incluir:

- la UI de filtrado como componente interactivo
- controles de edición
- acciones de navegación innecesarias

## 3. Principio principal

La exportación no debe reconstruir la vista manualmente desde cero.

Debe partir de un mismo conjunto de datos ya calculado por el backend o por una capa intermedia de agregación, de modo que:

- la pantalla y la exportación usen la misma lógica
- los totales coincidan
- los filtros se respeten
- las columnas configuradas por el usuario se conserven

## 4. Flujo recomendado

### 4.1 Entrada

El usuario define:

- rango de fechas
- canales
- segmentos
- filtros de atribución
- columnas visibles
- cualquier otro filtro de la vista

### 4.2 Construcción del dataset

El sistema construye un payload único de exportación con:

- filtros aplicados
- resumen ejecutivo
- series de gráficas
- tablas detalladas
- configuración de columnas
- totales y porcentajes
- timestamps de generación

### 4.3 Salidas

Desde ese mismo payload se generan distintas salidas:

- `HTML` para reporte visual
- `PDF` para descarga formal
- `XLSX` para análisis tabular

Opcionalmente:

- `DOCX` solo si existe un requerimiento formal muy claro

## 5. Qué formato usar para cada caso

### 5.1 PDF

Recomendado cuando se necesita:

- una versión ejecutiva
- una pieza visual compartible
- tablas y gráficas con formato fijo
- impresión o envío por correo

### 5.2 Excel

Recomendado cuando se necesita:

- manipular datos
- filtrar columnas
- hacer análisis posterior
- entregar tablas con detalle

### 5.3 HTML

Recomendado como capa base cuando se quiere:

- reutilizar la misma estructura visual
- mantener una plantilla única de reporte
- servir como fuente para PDF

### 5.4 Word

No es la opción prioritaria.

Solo conviene si un proceso formal lo exige, porque complica el control visual y la consistencia entre vistas.

## 6. Contrato de exportación

Se propone un contrato único de exportación por vista, con esta estructura general:

```ts
type ReportExportPayload = {
  view: string;
  title: string;
  generatedAt: string;
  timezone?: string | null;
  filters: Record<string, unknown>;
  summary: Record<string, unknown>;
  charts: Array<{
    key: string;
    title: string;
    type: string;
    data: unknown;
  }>;
  tables: Array<{
    key: string;
    title: string;
    columns: Array<{
      key: string;
      label: string;
      visible: boolean;
    }>;
    rows: unknown[];
  }>;
  notes?: string[];
};
```

La forma exacta puede variar por vista, pero la idea central debe mantenerse:

- un solo payload base
- varios formatos de salida
- misma lógica de filtros y agregados

## 7. Reglas de diseño

### 7.1 Reutilización

Si una métrica ya existe en la vista, la exportación debe reutilizarla.

No se deben duplicar reglas de negocio solo para exportar.

### 7.2 Trazabilidad

La exportación debe dejar claro:

- qué filtros se usaron
- qué fecha/hora se generó
- qué versión o vista la produjo

### 7.3 Consistencia

Los números de la exportación deben coincidir con los números de la pantalla.

Si hay diferencia, el problema está en el contrato de datos, no en el formato final.

### 7.4 Independencia de UI

La exportación no debe depender de que el usuario vea una tarjeta, un gráfico o un panel específico.

Debe depender de la data ya calculada.

## 8. Aplicación en `mapa-de-conversion`

Para esta vista, la exportación debería incluir:

- KPIs superiores
- resumen geográfico
- tarjetas de adquisición
- tabla de ubicaciones
- tablas de sesiones y conversaciones
- configuración de columnas seleccionadas
- filtros de atribución y fechas usados

Debe excluir:

- la sección de `Filtros de demografía`
- controles interactivos
- menús o botones de UI

## 9. Evolución futura

Este enfoque debe poder repetirse en otras vistas del panel, por ejemplo:

- dashboards
- prospección
- visitas
- leads
- mapas
- tablas operativas

Cada vista debería exponer su propio payload de exportación, pero seguir el mismo patrón general.

## 10. Decisión recomendada

La implementación ideal es:

1. construir un payload de exportación único por vista,
2. generar `HTML` desde ese payload,
3. generar `PDF` desde ese `HTML`,
4. generar `XLSX` desde el mismo payload estructurado.

Esto mantiene:

- una sola fuente de verdad
- consistencia entre formatos
- facilidad para extender a nuevas pantallas

