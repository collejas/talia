# Notas de implementación en Talia

Este archivo es la guía original de la API DENUE (INEGI). Para el estado actual de la implementación en Talia (panel/backend/supabase), ver:
- `docs/Busqueda_denue/PLAN_DESARROLLO_DENUE.md`

Notas rápidas:
- En Talia, **“Búsqueda avanzada” no fuerza** el texto `"todos"`; si no se captura texto, la búsqueda se construye con filtros (actividad/estrato/geo) según el modo.
- Para evitar explosión de combinaciones (múltiples actividades × múltiples geos × múltiples estratos), se aplica un **límite de 20 combinaciones** por búsqueda avanzada.
- Los filtros de resultados (incl. Estado/Municipio) se aplican **server-side** sobre el total almacenado para que lista, totales, bounds y mapa sean consistentes.

# Guía para desarrolladores
    • Introducción. 
    • Audiencia. 
    • Métodos para obtener información a través de la API 
        ◦ Buscar 
        ◦ Ficha 
        ◦ Nombre 
        ◦ BuscarEntidad 
        ◦ BuscarAreaAct 
        ◦ BuscarAreaActEstr 
        ◦ Cuantificar 
    • Cómo utilizar la API. 
    • Preguntas 

## Introducción
Bienvenido a la documentación para desarrolladores de la API del DENUE. El INEGI se une a la iniciativa de datos de libre acceso con el objetivo de ampliar la disponibilidad de la información para los usuarios.

## Audiencia
Esta documentación está dirigida a los desarrolladores familiarizados con la programación JavaScript y con conocimientos de programación orientada a objetos.

* Métodos para obtener información a través de la API


### Buscar

Realiza una consulta de todos los establecimientos que cumplan las condiciones definidas.

* Parámetros de entrada:
    • Condición: Palabra(s) a buscar en el nombre del establecimiento, razón social, calle, colonia, clase de la actividad económica, entidad federativa, municipio y localidad. Para buscar más de una palabra se deberán separar con una coma. Para buscar todos los establecimientos se deberá ingresar la palabra "todos". 
    • Coordenadas: Par de coordenadas que definen el punto en el mapa a partir del cual se hará la consulta alrededor. El formato de las coordenadas es latitud y longitud. 
    • Distancia: Cantidad de metros a partir de las coordenadas que definen el radio de búsqueda. La distancia máxima es de 5,000 metros. 
    • Token: Número único que permite hacer consultas, el cual se puede obtener al registrarse aquí. 

### Ficha

Obtiene la información de un establecimiento en específico.

* Parámetros de entrada:
    • Id: Clave única del establecimiento. 
    • Token: Número único que permite hacer consultas, el cual se puede obtener al registrarse aquí 

### Nombre

Realiza una consulta de todos los establecimientos por nombre o razón social y puede ser acotado por entidad federativa.

* Parámetros de entrada:
    • Nombre del establecimiento ó razón social: Palabra(s) a buscar que se encuentran en el nombre del establecimiento o la razón social. 
    • Entidad federativa: Clave de dos dígitos de la entidad federativa (01 a 32). Para incluir todas las entidades se especifica 00. 
    • Registro inicial: Número de registro a partir del cuál se mostrarán los resultados de la búsqueda. 
    • Registro final: Número de registro final que se mostrará en los resultados de la búsqueda. 
    • Token: Número único que permite hacer consultas, el cual se puede obtener al registrarse aquí 

### BuscarEntidad

Realiza una consulta de todos los establecimientos y puede ser acotada por entidad federativa.

* Parámetros de entrada:
    • Condición: Palabra(s) a buscar dentro del nombre del establecimiento, razón social, calle, colonia, clase de la actividad económica, entidad federativa, municipio y localidad. Para buscar más de una palabra se deberán separar con una coma. Para buscar todos los establecimientos se deberá ingresar la palabra "todos". 
    • Entidad federativa: Clave de dos dígitos de la entidad federativa (01 a 32). Para incluir todas las entidades se especifica 00. 
    • Registro inicial: Número de registro a partir del cuál se mostrarán los resultados de la búsqueda. 
    • Registro final: Número de registro final que se mostrará en los resultados de la búsqueda. 
    • Token: Número único que permite hacer consultas, el cual se puede obtener al registrarse aquí 

### BuscarAreaAct

Realiza una consulta de todos los establecimientos con la opción de acotar la búsqueda por área geográfica, actividad económica, nombre y clave del establecimiento.

* Parámetros de entrada:
    • Entidad federativa: Clave de dos dígitos de la entidad federativa (01 a 32). Para incluir todas las entidades se especifica 00. 
    • Municipio: Clave de tres dígitos del municipio (ej. 001). Para incluir todos los municipios se especifica 0. 
    • Localidad: Clave de cuatro dígitos de la localidad (ej. 0001 ). Para incluir todas las localidades se especifica 0. 
    • AGEB: Clave de cuatro dígitos AGEB(ej. 2000 ).Para incluir todas las AGEBS se especifica 0 
    • Manzana: Clave de tres dígitos de la manzana (ej. 043 ). Para incluir todas las manzanas se especifica 0. 
    • Sector: Clave de dos dígitos del sector de la actividad económica (ej. 46 ). Para incluir todos los sectores se especifica 0. 
    • Subsector: Clave de tres dígitos del subsector de la actividad económica ( ej. 464 ). Para incluir todos los subsectores se especifica 0. 
    • Rama: Clave de cuatro dígitos de la rama de la actividad económica (ej. 4641 ). Para incluir todas las ramas se especifica 0. 
    • Clase: Clave de seis dígitos de la clase (ej. 464112 ). Para incluir todas las actividades se especifica 0. 
    • Nombre del establecimiento: Nombre del establecimiento a buscar. Para incluir todos los establecimientos se especifica 0. 
    • Registro inicial: Número de registro a partir del cuál se mostrarán los resultados de la búsqueda. 
    • Registro final: Número de registro final que se mostrará en resultados de la búsqueda. 
    • Id: Clave única del establecimiento. Para incluir todos los establecimientos se especifica 0. 
    • Token: Número único que permite hacer consultas, el cual se puede obtener al registrarse aquí 


### BuscarAreaActEstr

Realiza una consulta de todos los establecimientos con la opción de acotar la búsqueda por área geográfica, actividad económica, nombre,clave del establecimiento y estrato.

* Parámetros de entrada:
    • Entidad federativa: Clave de dos dígitos de la entidad federativa (01 a 32). Para incluir todas las entidades se especifica 00. 
    • Municipio: Clave de tres dígitos del municipio (ej. 001). Para incluir todos los municipios se especifica 0. 
    • Localidad: Clave de cuatro dígitos de la localidad (ej. 0001 ). Para incluir todas las localidades se especifica 0. 
    • AGEB: Clave de cuatro dígitos AGEB(ej. 2000 ).Para incluir todas las AGEBS se especifica 0 
    • Manzana: Clave de tres dígitos de la manzana (ej. 043 ). Para incluir todas las manzanas se especifica 0. 
    • Sector: Clave de dos dígitos del sector de la actividad económica (ej. 46 ). Para incluir todos los sectores se especifica 0. 
    • Subsector: Clave de tres dígitos del subsector de la actividad económica ( ej. 464 ). Para incluir todos los subsectores se especifica 0. 
    • Rama: Clave de cuatro dígitos de la rama de la actividad económica (ej. 4641 ). Para incluir todas las ramas se especifica 0. 
    • Clase: Clave de seis dígitos de la clase (ej. 464112 ). Para incluir todas las actividades se especifica 0. 
    • Nombre del establecimiento: Nombre del establecimiento a buscar. Para incluir todos los establecimientos se especifica 0. 
    • Registro inicial: Número de registro a partir del cuál se mostrarán los resultados de la búsqueda. 
    • Registro final: Número de registro final que se mostrará en resultados de la búsqueda. 
    • Id: Clave única del establecimiento. Para incluir todos los establecimientos se especifica 0. 
    • Estrato: 
    • Clave de un dígito del estrato. Para incluir todos los tamaños se especifica 0. 
      1. Para incluir de 0 a 5 personas. 
      2. Para incluir de 6 a 10 personas. 
      3. Para incluir de 11 a 30 personas. 
      4. Para incluir de 31 a 50 personas. 
      5. Para incluir de 51 a 100 personas. 
      6. Para incluir de 101 a 250 personas. 
      7. Para incluir de 251 y más personas. 
    • Token: Número único que permite hacer consultas, el cual se puede obtener al registrarse aquí 

### Cuantificar

Realiza un conteo de todos los establecimientos con la opción de acotar la búsqueda por área geográfica, actividad económica y estrato.

* Parámetros de entrada:
    • Actividad económica: 
        Clave de dos a cinco dígitos de la actividad económica. Para considerar más de una clave deberás separarlas con coma. Para incluir todas las actividades se especifica 0. 
        Dos dígitos para incluir nivel sector (ej.46). 
        Tres dígitos para incluir nivel subsector (ej. 464). 
        Cuatro dígitos para incluir nivel rama (ej. 4641). 
        Cinco dígitos para incluir nivel subrama (ej. 46411). 
        Seis dígitos para incluir nivel clase (ej. 464111). 
    • Área geográfica: 
        Clave de dos a nueve dígitos del área geográfica. Para considerar más de una clave deberás separarlas con coma. Para incluir todo el país se especifica 0. 
        Dos dígitos para incluir nivel estatal (ej.01 a 32). 
        Cinco dígitos dígitos para incluir nivel municipal (ej. 01001). 
        Nueve dígitos para incluir nivel localidad (ej. 010010001). 
    • Estrato: 
    • Clave de un dígito del estrato. Para incluir todos los tamaños se especifica 0. 
      1. Para incluir de 0 a 5 personas. 
      2. Para incluir de 6 a 10 personas. 
      3. Para incluir de 11 a 30 personas. 
      4. Para incluir de 31 a 50 personas. 
      5. Para incluir de 51 a 100 personas. 
      6. Para incluir de 101 a 250 personas. 
      7. Para incluir de 251 y más personas. 
    • Token: Número único que permite hacer consultas, el cual se puede obtener al registrarse aquí


### Cómo utilizar la API

#### Buscar

* Para consultar la API se envían los parámetros directamente en la URL, por ejemplo para el método de Buscar se hace de la siguiente manera: 
https://www.inegi.org.mx/app/api/denue/v1/consulta/Buscar/camiones/21.85717833,-102.28487238/250/[aquí va tu Token] 

* Estos son los datos que regresa la URL anterior:
[
  {
    "CLEE": "01001811192001641",
    "Id": "34183",
    "Nombre": "AUTOLAVADO OSWALDO",
    "Razon_social": "",
    "Clase_actividad": "Lavado y lubricado de automóviles y camiones",
    "Estrato": "0 a 5 personas",
    "Tipo_vialidad": "CALLE",
    "Calle": "INEGI",
    "Num_Exterior": "",
    "Num_Interior": "",
    "Colonia": "JARDIN DE LAS BUGAMBILIAS",
    "CP": "20280",
    "Ubicacion": "AGUASCALIENTES, Aguascalientes, AGUASCALIENTES",
    "Telefono": "4491158537",
    "Correo_e": "",
    "Sitio_internet": "",
    "Tipo": "Fijo",
    "Longitud": "-102.28325928",
    "Latitud": "21.85828412",
    "CentroComercial": "",
    "TipoCentroComercial": "",
    "NumLocal": ""
  }
] 

A continuación se explica el orden de los valores devueltos: 

Campo 1: Clave CLEE 
Campo 2: Id de establecimiento 
Campo 3: Nombre del establecimiento 
Campo 4: Razón social 
Campo 5: Clase de la actividad 
Campo 6: Estrato (Personal ocupado) 
Campo 7: Tipo de la vialidad 
Campo 8: Calle 
Campo 9: Número exterior 
Campo 10: Número interior 
Campo 11: Colonia 
Campo 12: Código postal 
Campo 13: Localidad, municipio y entidad federativa 
Campo 14: Teléfono 
Campo 15: Correo electrónico 
Campo 16: Página de internet 
Campo 17: Tipo de establecimiento 
Campo 18 Longitud 
Campo 19: Latitud 
Campo 20: Centro comercial 
Campo 21: Tipo de centro comercial 
Campo 22: Número de local 

#### Ficha

* Para el método de Ficha se hace de la siguiente manera:
https://www.inegi.org.mx/app/api/denue/v1/consulta/Ficha/34185/[aquí va tu Token] 

* Estos son los datos que regresa la URL anterior:
[
  {
    "CLEE": "01001722514004531",
    "Id": "34185",
    "Nombre": "LONCHERÍA LOS CUATES",
    "Razon_social": "",
    "Clase_actividad": "Restaurantes con servicio de preparación de tacos y tortas",
    "Estrato": "0 a 5 personas",
    "Tipo_vialidad": "CALLE",
    "Calle": "INEGI",
    "Num_Exterior": "201",
    "Num_Interior": "",
    "Colonia": "JARDIN DE LAS BUGAMBILIAS",
    "CP": "20280",
    "Ubicacion": "AGUASCALIENTES, Aguascalientes, AGUASCALIENTES",
    "Telefono": "4492214831",
    "Correo_e": "",
    "Sitio_internet": "",
    "Tipo": "Fijo",
    "Longitud": "-102.28485913",
    "Latitud": "21.85796749",
    "CentroComercial": "",
    "TipoCentroComercial": "",
    "NumLocal": ""
  }
] 

A continuación se explica el orden de los valores devueltos: 

Campo 1: Clave CLEE 
Campo 2: Id de establecimiento 
Campo 3: Nombre del establecimiento 
Campo 4: Razón social 
Campo 5: Clase de la actividad económica 
Campo 6: Estrato (Personal ocupado) 
Campo 7: Tipo de la vialidad 
Campo 8: Calle 
Campo 9: Número exterior 
Campo 10: Número interior 
Campo 11: Colonia 
Campo 12: Código postal 
Campo 13: Localidad, municipio y entidad federativa 
Campo 14: Teléfono 
Campo 15: Correo electrónico 
Campo 16: Página de internet 
Campo 17: Tipo de establecimiento 
Campo 18: Longitud 
Campo 19: Latitud 
Campo 20: Centro comercial 
Campo 21: Tipo de centro comercial 
Campo 22: Número de local 

#### Nombre

* Para el método de Nombre se hace de la siguiente manera:
https://www.inegi.org.mx/app/api/denue/v1/consulta/Nombre/MARRIOTT/1/1/10/[aquí va tu Token] 

* Estos son los datos que regresa la URL anterior:
[
  {
    "CLEE": "01001721112000684",
    "Id": "9321560",
    "Nombre": "HOTEL FAIRFIELD INN SUITES MARRIOT",
    "Razon_social": "OPERADORA HOTELERA AGS DTL S. DE R.L. DE C.V. SC DE RL DE CV",
    "Clase_actividad": "Hoteles con otros servicios integrados",
    "Estrato": "31 a 50 personas",
    "Tipo_vialidad": "CALLE",
    "Calle": "GENERAL IGNACIO ZARAGOZA",
    "Num_Exterior": "103",
    "Num_Interior": "",
    "Colonia": "LOS ARELLANO",
    "CP": "20290",
    "Ubicacion": "AGUASCALIENTES, Aguascalientes, AGUASCALIENTES",
    "Telefono": "",
    "Correo_e": "",
    "Sitio_internet": "",
    "Tipo": "Fijo",
    "Longitud": "-102.28521368",
    "Latitud": "21.81024256",
    "tipo_corredor_industrial": "",
    "nom_corredor_industrial": "",
    "numero_local": ""
  }
]
 
A continuación se explica el orden de los valores devueltos: 

Campo 1: Clave CLEE 
Campo 2: Id de establecimiento 
Campo 3: Nombre del establecimiento 
Campo 4: Razón social 
Campo 5: Clase de la actividad económica 
Campo 6: Estrato (Personal ocupado) 
Campo 7: Tipo de la vialidad 
Campo 8: Calle 
Campo 9: Número exterior 
Campo 10: Número interior 
Campo 11: Colonia 
Campo 12: Código postal 
Campo 13: Localidad, municipio y entidad federativa 
Campo 14: Teléfono 
Campo 15: Correo electrónico 
Campo 16: Página de internet 
Campo 17: Tipo de establecimiento 
Campo 18: Longitud 
Campo 19: Latitud 
Campo 20: Tipo de corredor industrial 
Campo 21: Nombre del corredor industrial 
Campo 22: Número de local 

#### BuscarEntidad

* Para el método de BuscarEntidad se hace de la siguiente manera:
https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarEntidad/restaurantes/14/1/10/[Aquí va tu token]

* Estos son los datos que regresa la URL anterior:
[
  {
    "CLEE": "01001462112003932",
    "Id": "6846393",
    "Nombre": "50PJ1 RANCHO SANTA MONICA AGU",
    "Razon_social": "CADENA COMERCIAL OXXO SA DE CV",
    "Clase_actividad": "Comercio al por menor en minisupers",
    "Estrato": "6 a 10 personas",
    "Tipo_vialidad": "AVENIDA",
    "Calle": "SAN ANTONIO",
    "Num_Exterior": "3",
    "Num_Interior": "",
    "Colonia": "SANTA MONICA",
    "CP": "20342",
    "Ubicacion": "AGUASCALIENTES, Aguascalientes, AGUASCALIENTES",
    "Telefono": "",
    "Correo_e": "ATENCIONCLIENTES@OXXO.COM",
    "Sitio_internet": "WWW.OXXO.COM",
    "Tipo": "Fijo",
    "Longitud": "-102.31627040",
    "Latitud": "21.83731462",
    "tipo_corredor_industrial": "",
    "nom_corredor_industrial": "",
    "numero_local": ""
  }
] 
A continuación se explica el orden de los valores devueltos: 

Campo 1: Clave CLEE 
Campo 2: Id de establecimiento 
Campo 3: Nombre del establecimiento 
Campo 4: Razón social 
Campo 5: Clase de la actividad 
Campo 6: Estrato (Personal ocupado) 
Campo 7: Tipo de la vialidad 
Campo 8: Calle 
Campo 9: Número exterior 
Campo 10: Número interior 
Campo 11: Colonia 
Campo 12: Código postal 
Campo 13: Localidad, municipio y entidad federativa 
Campo 14: Teléfono 
Campo 15: Correo electrónico 
Campo 16: Página de internet 
Campo 17: Tipo de establecimiento 
Campo 18: Longitud 
Campo 19: Latitud 

#### BuscarAreaAct

* Para el método de BuscarAreaAct se hace de la siguiente manera:
https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarAreaAct/01/0/0/0/0/0/0/0/0/oxxo/1/15/0/[Aquí va tu token] 

* Estos son los datos que regresa la URL anterior:
{
  "CLEE": "01001462112003932",
  "Id": "6846393",
  "Nombre": "50PJ1 RANCHO SANTA MONICA AGU",
  "Razon_social": "CADENA COMERCIAL OXXO SA DE CV",
  "Clase_actividad": "Comercio al por menor en minisupers",
  "Estrato": "6 a 10 personas",
  "Tipo_vialidad": "AVENIDA",
  "Calle": "SAN ANTONIO",
  "Num_Exterior": "3",
  "Num_Interior": "",
  "Colonia": "SANTA MONICA",
  "CP": "20342",
  "Ubicacion": "AGUASCALIENTES, Aguascalientes, AGUASCALIENTES",
  "Telefono": "",
  "Correo_e": "ATENCIONCLIENTES@OXXO.COM",
  "Sitio_internet": "WWW.OXXO.COM",
  "Tipo": "Fijo",
  "Longitud": "-102.31627040",
  "Latitud": "21.83731462",
  "tipo_corredor_industrial": "",
  "nom_corredor_industrial": "",
  "numero_local": "",
  "AGEB": "401A",
  "Manzana": "009",
  "CLASE_ACTIVIDAD_ID": "462112",
  "EDIFICIO_PISO": "",
  "SECTOR_ACTIVIDAD_ID": "46",
  "SUBSECTOR_ACTIVIDAD_ID": "462",
  "RAMA_ACTIVIDAD_ID": "4621",
  "SUBRAMA_ACTIVIDAD_ID": "46211",
  "EDIFICIO": "",
  "Tipo_Asentamiento": "COLONIA",
  "Fecha_Alta": "2018-03",
  "AreaGeo": "010010001"
}
 
A continuación se lista el orden de los valores devueltos: 

Campo 1: Clave CLEE 
Campo 2: Id de establecimiento 
Campo 3: Nombre del establecimiento 
Campo 4: Razón social 
Campo 5: Clase de la actividad económica 
Campo 6: Estrato (Personal ocupado) 
Campo 7: Tipo de la vialidad 
Campo 8: Calle 
Campo 9: Número exterior 
Campo 10: Número interior 
Campo 11: Colonia 
Campo 12: Código postal 
Campo 13: Localidad, municipio y entidad federativa 
Campo 14: Teléfono 
Campo 15: Correo electrónico 
Campo 16: Página de internet 
Campo 17: Tipo de establecimiento 
Campo 18: Longitud 
Campo 19: Latitud 
Campo 20: Tipo de corredor industrial 
Campo 21: Nombre del corredor industrial 
Campo 22: Número de local 
Campo 23: AGEB 
Campo 24: Manzana 
Campo 25: Edificio 
Campo 26: Id clase de la actividad económica 
Campo 27: Id sector de la actividad económica 
Campo 28: Id subsector de la actividad económica 
Campo 29: Id rama de la actividad económica 

#### BuscarAreaActEstr

* Para el método de BuscarAreaAct se hace de la siguiente manera:
https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarAreaActEstr/01/0/0/0/0/0/0/0/0/oxxo/1/15/0/1/[Aquí va tu token] 

* Estos son los datos que regresa la URL anterior:
{
  "CLEE": "01001462112003932",
  "Id": "6846393",
  "Nombre": "50PJ1 RANCHO SANTA MONICA AGU",
  "Razon_social": "CADENA COMERCIAL OXXO SA DE CV",
  "Clase_actividad": "Comercio al por menor en minisupers",
  "Estrato": "6 a 10 personas",
  "Tipo_vialidad": "AVENIDA",
  "Calle": "SAN ANTONIO",
  "Num_Exterior": "3",
  "Num_Interior": "",
  "Colonia": "SANTA MONICA",
  "CP": "20342",
  "Ubicacion": "AGUASCALIENTES, Aguascalientes, AGUASCALIENTES",
  "Telefono": "",
  "Correo_e": "ATENCIONCLIENTES@OXXO.COM",
  "Sitio_internet": "WWW.OXXO.COM",
  "Tipo": "Fijo",
  "Longitud": "-102.31627040",
  "Latitud": "21.83731462",
  "tipo_corredor_industrial": "",
  "nom_corredor_industrial": "",
  "numero_local": "",
  "AGEB": "401A",
  "Manzana": "009",
  "CLASE_ACTIVIDAD_ID": "462112",
  "EDIFICIO_PISO": "",
  "SECTOR_ACTIVIDAD_ID": "46",
  "SUBSECTOR_ACTIVIDAD_ID": "462",
  "RAMA_ACTIVIDAD_ID": "4621",
  "SUBRAMA_ACTIVIDAD_ID": "46211",
  "EDIFICIO": "",
  "Tipo_Asentamiento": "COLONIA",
  "Fecha_Alta": "2018-03",
  "AreaGeo": "010010001"
}
 
A continuación se lista el orden de los valores devueltos: 

Campo 1: Clave CLEE 
Campo 2: Id de establecimiento 
Campo 3: Nombre del establecimiento 
Campo 4: Razón social 
Campo 5: Clase de la actividad económica 
Campo 6: Estrato (Personal ocupado) 
Campo 7: Tipo de la vialidad 
Campo 8: Calle 
Campo 9: Número exterior 
Campo 10: Número interior 
Campo 11: Colonia 
Campo 12: Código postal 
Campo 13: Localidad, municipio y entidad federativa 
Campo 14: Teléfono 
Campo 15: Correo electrónico 
Campo 16: Página de internet 
Campo 17: Tipo de establecimiento 
Campo 18: Longitud 
Campo 19: Latitud 
Campo 20: Tipo de corredor industrial 
Campo 21: Nombre del corredor industrial 
Campo 22: Número de local 
Campo 23: AGEB 
Campo 24: Manzana 
Campo 25: Id clase de la actividad económica 
Campo 26: Número de piso del edificio 
Campo 27: Id sector de la actividad económica 
Campo 28: Id subsector de la actividad económica 
Campo 29: Id rama de la actividad económica 
Campo 30: Id subrama de la actividad económica 
Campo 31: Edificio 
Campo 32: Tipo de asentamiento 
Campo 33: Fecha de alta del establecimiento 
Campo 34: Clave del área geográfica 

#### Cuantificar

* Para el método de Cuantificar se hace de la siguiente manera:
https://www.inegi.org.mx/app/api/denue/v1/consulta/Cuantificar/111,112/01001,01005/0/[Aquí va tu token] 

* Estos son los datos que regresa la URL anterior:
[
  {
    "AE": "111",
    "AG": "01001",
    "Total": "0"
  },
  {
    "AE": "111",
    "AG": "01005",
    "Total": "0"
  },
  {
    "AE": "112",
    "AG": "01001",
    "Total": "4"
  },
  {
    "AE": "112",
    "AG": "01005",
    "Total": "1"
  }
]
 
A continuación se lista el orden de los valores devueltos: 

Campo 1: Id de la actividad económica 
Campo 2: Clave del área geográfica 
Campo 3: Total de establecimientos por área geográfica, actividad económica y estrato especificado 
