# Plan: Enriquecer resultados del buscador cuando se encuentren archivos CSV

## Objetivo
Cuando el crawler del buscador descargue archivos CSV (como directorios publicados en portales de transparencia), debe extraer no sólo el correo sino también los campos ricos (nombre, puesto, teléfono, dirección, etc.) que ya vienen en esas columnas. Actualmente el parser trata todos los recursos como HTML y por eso perdemos la información estructurada de los CSV.

## Alcance
- Detectar contenido CSV desde el crawler (`domain_crawler.py`) usando la URL (`.csv`) y/o el `Content-Type` de la respuesta.
- Implementar un parser específico para CSV con mapeos de columnas comunes en directorios públicos.
- Integrar los valores estructurados al objeto `contacto` antes de guardar el resultado.
- Mantener los límites actuales de crawling (máx. páginas, profundidad, etc.) sin cambios.

## Tareas

1. [ ] **Detectar recursos CSV**
   - Después del `fetcher.get`, revisar si la URL termina en `.csv` o si el `Content-Type` (si podemos exponerlo desde `HttpFetcher`) contiene `text/csv` o `application/vnd.ms-excel`.
   - Si se detecta CSV, derivar hacia una función `parse_csv_contacts`.

2. [ ] **Exponer metadatos HTTP en `HttpFetcher`**
   - Hoy `HttpFetcher.get` sólo regresa el texto; para inspeccionar cabeceras necesitamos que retorne `Tuple[str, str | None]` (contenido + content_type) o un objeto `HttpResponse`.
   - Mantener compatibilidad para los scrapers existentes (simple/demo).

3. [ ] **Crear utilitario `parse_csv_contacts`**
   - Ubicarlo en `core/utils.py` o un módulo nuevo `core/csv_parser.py`.
   - Usar `csv.DictReader` con `io.StringIO` respetando UTF-8.
   - Normalizar encabezados (quitar acentos, espacios, mayúsculas).
   - Mapear encabezados conocidos a campos (`name`, `position`, `phone`, `address`, `extension`).
   - Dejar configurable un diccionario de alias, por ejemplo:
     ```python
     COLUMN_ALIASES = {
       "name": {"nombre", "titular", "funcionario", "contacto"},
       "position": {"puesto", "cargo"},
       "phone": {"telefono", "tel", "teléfono", "telefono_contacto"},
       "email": {"correo", "email", "correo_electronico"},
       "address": {"direccion", "domicilio"},
       "extension": {"extension", "ext"},
     }
     ```
   - Devolver una lista de diccionarios con los campos traducidos más el `source_url`.

4. [ ] **Integración en `BaseDomainCrawler.run`**
   - Si la página es CSV:
     - No usar BeautifulSoup (evitar parseo HTML).
     - Llamar a `parse_csv_contacts`.
     - Por cada fila:
       - Validar el correo con `EmailExtractor.is_valid_business_email`.
       - Usar `contact_extractor` sólo si queremos enriquecer aún más (podemos omitirlo, ya que el CSV trae los valores).
       - Agregar el registro a `results` con `email` + campos de contacto y marcarlo en `seen_emails`.
     - Incrementar `pages_without_new_emails` sólo si no se encontraron correos nuevos en ese CSV.
   - Si no es CSV, continuar con el flujo actual basado en HTML.

5. [ ] **Pruebas y validación**
   - Crear un archivo CSV de ejemplo en `tests/fixtures` para validar que se detectan y mapean los encabezados.
   - Añadir tests unitarios para `parse_csv_contacts`.
   - Probar manualmente un job apuntando al directorio CSV real (`Directorio_Funcionarios_ok.csv`) verificando que ahora `prospeccion_buscador_resultados.contacto` esté poblado con nombre/puesto/teléfono.

6. [ ] **Consideraciones futuras**
   - **XLS / XLSX**: muchos directorios oficiales están en Excel; si detectamos `.xls/.xlsx` o los `Content-Type` `application/vnd.ms-excel` / `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, podríamos apoyarnos en `openpyxl` o `pandas` para parsearlos.
   - **ODS (LibreOffice)**: algunos municipios publican `.ods`; vale la pena planear soporte usando `odfpy` si empiezan a aparecer.
   - **JSON / XML**: ciertos portales exponen APIs estructuradas (`application/json`, `application/xml`) donde podríamos mapear nodos directamente a `contacto`.
   - **PDF tabulares**: aunque más costoso, hay directorios en PDF; a futuro podríamos evaluar `pdfplumber` o `camelot` para tablas bien formadas.
   - Evaluar almacenamiento de la fila completa en `metadata` por si necesitamos columnas adicionales.

## Riesgos / Mitigaciones
- **CSV con delimitadores distintos**: usar `csv.Sniffer` para detectar delimitador cuando sea factible; fallback a coma.
- **Codificación distinta a UTF-8**: intentar detectar `charset` desde `Content-Type`; si no existe, probar `latin-1` como respaldo.
- **Campos sin encabezado estándar**: dejar abierto el diccionario de alias para ir agregando términos conforme aparezcan nuevos directorios.

Con este plan deberíamos capturar la información rica que antes se perdía en los directorios CSV sin afectar el scraping de páginas HTML.
