# Pais
Se mostrara dibujado para que al pasar el curson por el se muestra informcion general de todos los desarrollos que estan dentro del pais.
Al dar clic al pais se mostraran los estados dibujados donde hay desarrollos.

## Estado
Se mostraran los estados dibujados que tengan informacion y al pasar el curson por ellos se muestra informcion general de todos los desarrollos que estan dentro del estado or el cual pasa el cursor.
Al dar clic al estado se mostraran los municipios dibujados donde hay desarrollos.

### Municipio
Se mostraran los municipios dibujados que tengan informacion, y al pasar el cursor por ellos se muestra informcion general de todos los desarrollos que estan dentro del municipio.
Al dar clic al municipio se mostraran los desarrollos dibujados donde hay desarrollos.

#### Desarrollos
Se mostraran los desarrollos dibujados que tengan informacion.

Estos desarrollos pueden ser:

* Horizontal			
    - Desarrollos de Vivienda y comercio Horizontal (sera el marcador)			
      - 1. Plano del poligono de lotificación general	(y que a su vez que contiene los dos que estan abajo)	
        - 2. Plano del poligono de manzanas de la lotificacion general	(y que a su vez contiene el que esta abajo)
          - 3. Plano del poligono del lote o casa dentro de una manzana

          
          
* Vertical			
    - Desarrollos de Vivienda y comercio vertical  (sera el marcador)			
      - 1. Plano de planta del poligono general (y que a su vez que contiene los dos que estan abajo)	
        - 2. Plano de planta de Niveles (una copia del poligono general con `min_height` y `height` propios por nivel, para controlar la extrusión 3D), (y que a su vez contiene el que esta abajo)
          - 3. Planoo de planta del poligono de cada departamento (ubicada dentro del plano del poligono general de niveles)



plano 1 tabla: propiedad_desarrollos
plano 2 tabla: propiedad_capas
plano 3 tabla: propiedad_unidades
