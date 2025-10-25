# Instrucciones para implementar el KPI “Leads por estado”

## Objetivo
Construir una visualización geográfica que muestre la concentración de leads por entidad y municipio dentro del dashboard interno. La solución debe respetar los permisos del usuario autenticado y permitir que la interacción sea fluida (carga diferida, zoom, focos por estado, etc.).

## Requisitos funcionales
- Mostrar una tarjeta en el dashboard con un contenedor para el mapa y un marcador de “carga” mientras se inicializa.
- Pintar los estados de la república con una escala de colores basada en la cantidad de leads asociados.
- Al hacer clic sobre un estado, cargar y mostrar los municipios correspondientes con la misma lógica de coloreado.
- Incluir controles para cambiar el modo de escala (cuantiles, intervalos iguales, logarítmica) y la paleta de colores.
- Mostrar leyenda dinámica con los rangos usados y la paleta activa.
- Desplegar la cantidad exacta en un popup al hacer clic o pasar el cursor sobre cada polígono.

## Pasos de implementación
1. Agrega en la vista del dashboard una tarjeta dedicada al KPI con un `div` que funcionará como contenedor del mapa y un indicador visual de carga.
2. Prepara un script del dashboard que:
   - Cargue Leaflet (CSS y JS) solo cuando el contenedor esté visible.
   - Inicialice el mapa centrado en México, con capa base de OpenStreetMap.
   - Obtenga la geometría de estados y municipios desde los catálogos GeoJSON que ya existen en el proyecto carpeta: data Y PONNERLA EN EL LUGAR CORRECTO DE LA ESTRUCTURA DE ESTA APP.
   - Consulte los endpoints que concentran los conteos de leads por estado y municipio.
   - Pintele a cada polígono el color correspondiente, muestre popups con los totales y permita cambiar escalas y paletas.
   - Al dar clic en un estado, cargue los municipios de ese estado y ajuste la vista.
3. Implementa en el backend dos endpoints:
   - Uno que agrupe los contactos de WhatsApp por estado.
   - Otro que lo haga por estado/municipio, reusando las mismas claves LADA y respetando los permisos del usuario que consulta.
4. Asegura que los catálogos de LADA, estados y municipios estén disponibles para la conversión de número telefónico → ubicación.
5. Valida la experiencia:
   - Usuarios con alcance completo deben ver el universo total.
   - Usuarios restringidos solo deben ver sus contactos autorizados.
   - La leyenda y los controles del mapa deben reflejar la escala activa y reaccionar cuando cambian los datos.

## Entregables mínimos
- Vista del dashboard con el contenedor y el script del mapa enlazado.
- Código del mapa que carga Leaflet, pinta estados y municipios, y reutiliza la información de conteos.
- Endpoints que devuelven los totales por estado y por municipio considerando permisos.
- Notas de verificación (manuales o automáticas) que confirmen el correcto funcionamiento para distintos tipos de usuario.
