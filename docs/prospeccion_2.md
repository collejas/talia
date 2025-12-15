# Prospección · Flujo y mejoras propuestas

Referencia principal: `docs/prospeccion.md`. Aquí se explica en lenguaje operativo cómo se usa hoy el módulo de prospección y qué ajustes UX recomendamos para que sea más claro.

---

## 1. Flujo actual (Descubre → Enriquecer → Preparar → Lanzar → Evaluar)

1. **Descubre**  
   - Ejecuta búsquedas Google/DENUE/Web en `/prospeccion/buscador`.  
   - Cada job se guarda con sus resultados y se pueden convertir en prospectos directamente.
2. **Enriquecer**  
   - En `/prospeccion/prospectos` validas teléfonos, ejecutas el scraper y completas datos manuales.  
   - Todo queda auditado y se muestran badges del canal permitido.
3. **Preparar**  
   - Siguiendo en la misma vista, filtras/segmentas, conviertes prospectos a contactos y (cuando esté listo) reutilizas listas inteligentes guardadas en `prospeccion_contacto_batch.filtros`.  
   - Aquí se seleccionan los prospectos que entrarán a la campaña.
4. **Lanzar**  
   - Con los prospectos marcados tienes dos acciones:
     - **Programar contacto**: crea un batch rápido sin nombre de campaña; pides canal/plantilla/fecha y listo. Ideal para ejecutar algo inmediato sin salir de la tabla.  
     - **Lanzar campaña**: abre el wizard completo (propósito, nombre, filtros, canales, programación) y genera un batch con `campana_id`. Es la forma oficial de “nombrar” campañas y deja registro en `/prospeccion/campanas`.
   - En ambos casos el backend crea registros en `prospeccion_contacto_batch` y `prospeccion_contacto_envio`.
5. **Evaluar**  
   - `/prospeccion/contactos` lista todos los batches (estado, totales, cancelar/reintentar) y expone el stream SSE.  
   - `/prospeccion/campanas` reagrupa por campaña, muestra KPIs por canal y permite duplicar configuraciones.  
   - Métricas adicionales salen de `/prospeccion/contacto/metrics` y `/prospeccion/stage-resumen`.

---

## 2. Qué ofrece cada vista

| Vista | Propósito | Datos clave |
| --- | --- | --- |
| `/prospeccion/buscador` | Correr búsquedas, revisar jobs previos y convertir resultados en prospectos. | `prospeccion_buscador_jobs`, `prospeccion_buscador_resultados`. |
| `/prospeccion/prospectos` | Pipeline maestro: checklist, filtros, acciones individuales, programación y lanzamiento. | `prospeccion_prospectos`, `prospeccion_contacto_batch` (al crear). |
| `/prospeccion/campanas` | Dashboard de campañas nombradas; duplicar presets. | Batches con `campana_id` + métricas por canal. |
| `/prospeccion/contactos` | Monitor vivo de todos los batches (con o sin campaña). | Estado por canal, cancelaciones y reintentos. |
| `/prospeccion/contactos/{id}` + stream | Detalle por lote con SSE para soporte/ops. | `prospeccion_contacto_envio`, `prospeccion_contactos_log`. |

---

## 3. Dolor principal detectado

1. **Doble CTA poco explicado** (“Programar contacto” vs “Lanzar campaña”). Los usuarios no ven dónde nombrar la campaña ni qué diferencia hay entre ambas rutas.  
2. **Contexto disperso**: hay que salir de `/prospeccion/prospectos` para saber qué lote se creó recién o cómo va.  
3. **Falta de onboarding visual**: no se muestra el flujo de cinco etapas dentro de la UI, así que es fácil perderse entre vistas.  
4. **Terminología distinta** (batch vs campaña vs programación) según la pantalla, lo que confunde al momento de reportar.  
5. **KPIs sin atajos**: la tabla principal no muestra qué campaña tocó a cada prospecto por última vez ni deja saltar al detalle.

---

## 4. Sugerencias UX inmediatas

1. **Unificar entrada al lanzamiento**  
   - Reemplazar los dos botones por un modal inicial que pregunte: “¿Quieres scheduling rápido o campaña con nombre?”.  
   - Mostrar qué campos se solicitarán en cada opción y dónde se verá luego (contactos vs campanas).

2. **Drawer de preparación con naming**  
   - Al seleccionar prospectos, abrir un panel lateral donde:  
     - Se muestra el conteo y los filtros activos.  
     - Se permite escribir el nombre de campaña (opcional).  
     - Si no se nombra, se etiqueta explícitamente como “Programado rápido”.  
   - El botón final decide si se va al wizard completo o si se graba la programación en ese mismo drawer.

3. **Mini tour permanente**  
   - Encabezado en `/prospeccion/prospectos` con los pasos “Descubre · Enriquecer · Preparar · Lanzar · Evaluar”, cada uno enlazando a la vista correspondiente y resaltando si hay datos pendientes (ej. “0 campañas activas → ir a Campañas”).

4. **Resumen de lotes recientes dentro de la tabla**  
   - Añadir un panel o columna “Última campaña/batch” mostrando: nombre, estado y un link directo al detalle.  
   - Así el usuario entiende qué acción generó qué seguimiento sin navegar a otra vista.

5. **CTA “Crear campaña” global**  
   - En `/prospeccion/campanas`, colocar un botón visible que abra el wizard aunque llegues directo desde el menú. Hoy la acción depende del botón de la tabla de prospectos.  
   - Permitir que este CTA reciba un set de filtros predefinidos (listas inteligentes) para lanzar campañas recurrentes sin re-seleccionar prospectos manualmente.

Implementar estos ajustes debería reducir la confusión actual, alinear el flujo real con el plan documentado y dar señales claras de dónde nombrar campañas y dónde monitorearlas.
