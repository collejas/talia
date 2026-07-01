# Plan de adquisicion del sitio para `Mapa de Conversion`

Fecha: 2026-05-01

Este documento alimenta el backlog maestro:

- `backlog_maestro_mapa_conversion.md`

Y se registra en el changelog maestro:

- `changelog_maestro_mapa_conversion.md`

## 1. Objetivo

Extender la vista `mapa-de-conversion` para que muestre de forma clara el origen del trafico del sitio web, sin mezclar esa lectura con el analisis de campañas de mercadotecnia.

La pregunta que debe responder esta vista es:

- `De donde entra el trafico al sitio y que tan bien convierte cada origen?`

No debe responder solo:

- `Como rindio una campaña especifica?`

## 2. Alcance funcional

La vista debe mostrar, de forma resumida y auditable:

- sesiones por origen de trafico
- conversiones por origen
- tasa de conversion por origen
- top referrers del sitio
- top `utm_source`
- detalle de sesiones recientes para auditar el origen exacto

La lectura debe separar, como minimo:

- `direct`
- `organic_search`
- `organic_social`
- `referral`
- `campaign`
- `ai_referral` o `assistant_referral` como categoria nueva de adquisicion

## 3. Principios del refactor

Este cambio forma parte de un refactor mayor que ya esta en curso, por lo que se debe avanzar por capas y sin romper contratos existentes.

Principios:

- reutilizar primero lo que ya existe
- evitar duplicar agregados que ya vive en el backend
- conservar compatibilidad con la vista actual
- introducir nuevos endpoints solo cuando aporten un agregado realmente nuevo
- documentar cada paso para dejar claro el estado intermedio del sistema

## 4. Estado actual de la vista

La vista `mapa-de-conversion` ya tiene estos bloques:

- KPIs superiores
- mapa geografico de conversion
- resumen general lateral
- tabla de ubicaciones con detalle
- seccion de `sesiones web`
- seccion de `conversaciones`

Ademas, hoy consume dos capas principales:

- `GET /crm/demografia/resumen-v2`
- `GET /crm/demografia/mapa-v2`

Y para el detalle ya reutiliza:

- `GET /crm/visitas/web-sessions`
- `GET /crm/visitas/whatsapp/conversaciones`

## 5. Lo que ya existe y se debe reusar

### 5.1 Resumen geografico

Ya existe el agregado `panel_visitantes_geo_resumen_v2` y su capa backend `fetch_visitantes_resumen_v2`.

Ese agregado ya devuelve:

- `sesiones_web_total`
- `sesiones_webchat_total`
- `sesiones_con_chat_webchat`
- `sesiones_sin_chat_webchat`
- `conversaciones_whatsapp`
- `conversaciones_voz`
- `fuentes_top`
- `utm_top`

Por lo tanto, para el nuevo enfoque de adquisicion no conviene crear un resumen paralelo si el dato ya puede salir de esta capa.

### 5.2 Detalle de sesiones

Ya existe `GET /crm/visitas/web-sessions` como endpoint de detalle.

Ese endpoint ya permite filtrar por:

- `source_class`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `template_id`
- rango de fechas
- estado geografico

Ese endpoint debe seguir siendo la fuente del listado de sesiones web.

### 5.3 Conversaciones

`GET /crm/visitas/whatsapp/conversaciones` ya cubre el detalle conversacional y no debe duplicarse para esta propuesta.

## 6. Huecos detectados

Hay una pieza que hoy falta para auditar mejor el origen real de entrada:

- `referrer_host`

La tabla `web_sessions` ya guarda `referrer`, pero el endpoint de detalle no expone `referrer_host`.

Eso limita la capacidad de mostrar:

- dominio exacto de referencia
- dominios de IA o asistentes
- fuentes externas que no vienen con UTM

## 7. Propuesta tecnica

### 7.1 Cambio minimo recomendado

Extender `GET /crm/visitas/web-sessions` para devolver tambien:

- `referrer_host`

Opcionalmente, mantener expuesto:

- `source_class`

Eso permite construir la nueva lectura de adquisicion sin crear otro flujo de datos.

### 7.2 Nueva capa visual en frontend

Agregar una seccion nueva dentro de `mapa-de-conversion` llamada:

- `Origen de trafico`

o

- `Adquisicion del sitio`

Esa seccion deberia incluir:

- KPI de sesiones por origen
- KPI de conversion por origen
- grafica temporal de origen de trafico
- tabla de top referrers
- tabla de top UTM

### 7.3 Endpoint nuevo solo si hace falta

No se recomienda crear un endpoint nuevo de entrada para todo desde el inicio.

Solo seria necesario un agregado adicional si se quiere una serie temporal precomputada, por ejemplo:

- sesiones por dia
- sesiones por semana
- conversiones por dia
- desglose por `source_class` o `referrer_host`

Si eso se implementa mas adelante, deberia hacerse como un agregado especifico, no como reemplazo del detalle existente.

## 8. Propuesta de UX

### 8.1 KPIs

El bloque de adquisicion deberia mostrar:

- `Sesiones totales`
- `Sesiones por origen`
- `Conversiones por origen`
- `Tasa de conversion`

### 8.2 Grafica

Una grafica de barras apiladas por fecha, separada por:

- `direct`
- `organic_search`
- `organic_social`
- `referral`
- `ai_referral`
- `campaign`

### 8.3 Tabla de detalle

Una tabla de detalle debe permitir ver:

- `source_class`
- `referrer_host`
- `landing_url`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `sesiones`
- `conversiones`
- `tasa de conversion`

## 9. Regla de negocio sugerida

La categoria `campaign` debe seguir existiendo, pero solo como lectura de trafico con UTM.

El trafico desde asistentes de IA no debe quedar mezclado con campañas reales.

Se propone distinguirlo con una categoria propia:

- `ai_referral`

o

- `assistant_referral`

Eso permite medir:

- enlaces compartidos desde herramientas de IA
- trafico de asistentes
- conversion real asociada a ese origen

## 10. Reutilizacion de endpoints

### Reusar

- `GET /crm/demografia/resumen-v2`
- `GET /crm/demografia/mapa-v2`
- `GET /crm/visitas/web-sessions`
- `GET /crm/visitas/whatsapp/conversaciones`

### Ajustar

- `GET /crm/visitas/web-sessions` para exponer `referrer_host`

### Crear solo si es necesario

- un agregado temporal de adquisicion
- un endpoint de series historicas por origen

## 11. Dependencias con el refactor mayor

Este plan debe mantenerse alineado con el refactor mayor que ya esta en progreso, especialmente en:

- compatibilidad de contratos
- avance por pasos
- semantica de negocio frente a semantica tecnica
- documentacion de estado intermedio

No se debe asumir que este cambio redefine todo el mapa de conversion.

La regla correcta es:

- extender el mapa actual
- no reescribirlo de golpe

## 12. Estado esperado al cerrar esta fase

Al cerrar esta fase, `mapa-de-conversion` deberia poder responder:

- de donde entra el trafico al sitio
- cuales son las fuentes principales
- cuales dominios refieren visitas
- que parte entra por UTM
- que parte entra por enlaces externos
- que parte parece venir de IA o asistentes
- como convierte cada origen

## 13. Siguientes pasos

1. Ajustar el endpoint de detalle de sesiones para incluir `referrer_host`.
2. Diseñar la nueva seccion de `Adquisicion del sitio` en el frontend.
3. Reusar los agregados existentes para KPIs y top sources.
4. Definir si hace falta una serie temporal precomputada.
5. Documentar la implementacion final y dejar el avance en esta misma carpeta.
