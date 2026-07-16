# Diseno SQL · Whats-Prosp solo Meta + BD

Fecha: 2026-07-16
Ruta: `docs/Plan_envios_whats_marketing/02_DISENO_SQL_WHATS_PROSP_META_BD.md`

## 1) Objetivo de este documento

Traducir el plan funcional de `Whats-Prosp` a una propuesta SQL concreta sobre la estructura actual de prospeccion.

La pregunta principal es:

- si conviene reutilizar `prospeccion_contacto_templates`,
- o si conviene crear una tabla nueva especializada para `Whats-Prosp`.

## 2) Diagnostico de la estructura actual

Hoy ya existen estas piezas:

- `public.prospeccion_contacto_templates`
- `public.prospeccion_contacto_batch`
- `public.prospeccion_contacto_envio`

### 2.1 Lo bueno

- ya existe un concepto de plantilla reutilizable;
- ya existe ejecucion por batch;
- ya existe persistencia por envio;
- ya existe multitenancy en tablas operativas.

### 2.2 Lo que no alcanza para Whats-Prosp Meta

`prospeccion_contacto_templates` hoy guarda datos importantes de WhatsApp dentro de `metadata`.

Eso choca con el criterio del proyecto porque en este caso esos datos:

- si se consultan,
- si se filtran,
- si se usan en runtime,
- si se van a auditar,
- y si seran parte del negocio.

En particular, para `Whats-Prosp` ya no deberiamos depender de `metadata` para guardar:

- `template_name`
- `language_code`
- `meta_category`

## 3) Decision de modelado

### 3.1 Recomendacion

No crear una tabla totalmente separada nueva para `Whats-Prosp`.

La recomendacion es:

1. reutilizar `public.prospeccion_contacto_templates`,
2. pero normalizarla para que soporte Meta con columnas explicitas,
3. y agregar referencia/snapshot real en `batch` y `envio`.

### 3.2 Por que reutilizarla

Porque conceptualmente sigue siendo una plantilla de contacto de prospeccion.

No conviene duplicar catalogos separados si:

- ya hay una entidad de plantilla,
- ya hay consumo desde campañas/prospectos,
- y el cambio real es normalizar su estructura para WhatsApp Meta.

### 3.3 Cuando si valdria una tabla nueva

Solo si decides que `Whats-Prosp` debe vivir como modulo completamente aparte del resto de plantillas de prospeccion.

Con el estado actual del producto, eso parece innecesario.

## 4) Propuesta principal

### 4.1 Extender `prospeccion_contacto_templates`

Agregar columnas nuevas a `public.prospeccion_contacto_templates`:

- `organizacion_id uuid not null`
- `provider text`
- `usage_scope text`
- `template_name text`
- `language_code text`
- `meta_category text`
- `template_status text`

Notas:

- `provider` aplica sobre todo para `canal = 'whatsapp'`
- `usage_scope` nos permite marcar que la plantilla pertenece a `whats_prosp`
- `template_name`, `language_code`, `meta_category` quedan como columnas oficiales para Meta
- `template_status` evita depender de metadata para estado de aprobacion

### 4.2 Mantener columnas existentes

Se mantienen:

- `id`
- `canal`
- `slug`
- `nombre`
- `descripcion`
- `asunto`
- `cuerpo_texto`
- `cuerpo_html`
- `activo`
- `creado_por`
- `creado_en`
- `actualizado_en`

### 4.3 Tratamiento de `metadata`

`metadata` no se elimina de inmediato.

Pero para `Whats-Prosp` ya no debe ser la fuente de verdad para:

- identidad de plantilla,
- idioma,
- categoria,
- estado funcional.

`metadata` puede quedar solo para extras menores no estructurales.

## 5) DDL propuesto para plantillas

### 5.1 Nuevas columnas

```sql
ALTER TABLE public.prospeccion_contacto_templates
    ADD COLUMN IF NOT EXISTS organizacion_id uuid,
    ADD COLUMN IF NOT EXISTS provider text,
    ADD COLUMN IF NOT EXISTS usage_scope text,
    ADD COLUMN IF NOT EXISTS template_name text,
    ADD COLUMN IF NOT EXISTS language_code text,
    ADD COLUMN IF NOT EXISTS meta_category text,
    ADD COLUMN IF NOT EXISTS template_status text;
```

### 5.2 Backfill inicial de organizacion

Si la tabla ya fue multitenant en otra migracion, esto debe alinearse al estado actual.

Si aun hubiera filas antiguas sin tenant:

```sql
UPDATE public.prospeccion_contacto_templates t
SET organizacion_id = COALESCE(
    t.organizacion_id,
    '00000000-0000-0000-0000-000000000001'::uuid
)
WHERE t.organizacion_id IS NULL;
```

### 5.3 Not null recomendado

```sql
ALTER TABLE public.prospeccion_contacto_templates
    ALTER COLUMN organizacion_id SET NOT NULL;
```

### 5.4 Foreign key de tenant

```sql
ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_organizacion_id_fkey;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_organizacion_id_fkey
    FOREIGN KEY (organizacion_id)
    REFERENCES public.organizaciones(id)
    ON DELETE CASCADE;
```

## 6) Constraints de negocio

### 6.1 Provider

```sql
ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_provider_check;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_provider_check
    CHECK (
        provider IS NULL
        OR provider IN ('meta')
    );
```

En esta fase lo dejamos solo `meta` para `Whats-Prosp`.

### 6.2 Usage scope

```sql
ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_usage_scope_check;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_usage_scope_check
    CHECK (
        usage_scope IS NULL
        OR usage_scope IN ('whats_prosp')
    );
```

### 6.3 Categoria oficial de Meta

```sql
ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_meta_category_check;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_meta_category_check
    CHECK (
        meta_category IS NULL
        OR meta_category IN ('marketing', 'utility', 'authentication')
    );
```

### 6.4 Estado de plantilla

```sql
ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_template_status_check;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_template_status_check
    CHECK (
        template_status IS NULL
        OR template_status IN ('draft', 'approved', 'rejected', 'archived')
    );
```

### 6.5 Integridad para Whats-Prosp Meta

```sql
ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_whats_prosp_meta_check;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_whats_prosp_meta_check
    CHECK (
        canal <> 'whatsapp'
        OR usage_scope IS DISTINCT FROM 'whats_prosp'
        OR (
            provider = 'meta'
            AND template_name IS NOT NULL
            AND btrim(template_name) <> ''
            AND language_code IS NOT NULL
            AND btrim(language_code) <> ''
            AND meta_category IS NOT NULL
            AND btrim(meta_category) <> ''
        )
    );
```

## 7) Unicidad

La llave natural de una plantilla Meta para `Whats-Prosp` debe ser:

- tenant
- canal
- usage_scope
- template_name
- language_code

```sql
CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_contacto_templates_whats_prosp_meta_unique
ON public.prospeccion_contacto_templates (
    organizacion_id,
    canal,
    usage_scope,
    lower(template_name),
    lower(language_code)
)
WHERE canal = 'whatsapp'
  AND usage_scope = 'whats_prosp'
  AND provider = 'meta'
  AND template_name IS NOT NULL
  AND language_code IS NOT NULL;
```

## 8) Indices operativos

```sql
CREATE INDEX IF NOT EXISTS prospeccion_contacto_templates_org_canal_scope_idx
ON public.prospeccion_contacto_templates (organizacion_id, canal, usage_scope, activo);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_templates_org_meta_category_idx
ON public.prospeccion_contacto_templates (organizacion_id, meta_category, activo)
WHERE canal = 'whatsapp' AND usage_scope = 'whats_prosp';

CREATE INDEX IF NOT EXISTS prospeccion_contacto_templates_org_template_status_idx
ON public.prospeccion_contacto_templates (organizacion_id, template_status, activo)
WHERE canal = 'whatsapp' AND usage_scope = 'whats_prosp';
```

## 9) Cambios en `prospeccion_contacto_batch`

### 9.1 Objetivo

El batch debe guardar referencia canonica a la plantilla seleccionada para Whats-Prosp.

### 9.2 Columnas propuestas

```sql
ALTER TABLE public.prospeccion_contacto_batch
    ADD COLUMN IF NOT EXISTS whatsapp_template_id uuid,
    ADD COLUMN IF NOT EXISTS whatsapp_template_name_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_language_code_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_meta_category_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_template_display_name_snapshot text;
```

### 9.3 Foreign key compuesta

```sql
ALTER TABLE public.prospeccion_contacto_batch
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_batch_whatsapp_template_org_fkey;

ALTER TABLE public.prospeccion_contacto_batch
    ADD CONSTRAINT prospeccion_contacto_batch_whatsapp_template_org_fkey
    FOREIGN KEY (organizacion_id, whatsapp_template_id)
    REFERENCES public.prospeccion_contacto_templates (organizacion_id, id)
    ON DELETE SET NULL;
```

Para esto necesitaremos garantizar un indice unico o primary-compatible sobre `(organizacion_id, id)` en `prospeccion_contacto_templates`.

## 10) Cambios en `prospeccion_contacto_envio`

### 10.1 Objetivo

Cada envio debe persistir la plantilla real usada.

### 10.2 Columnas propuestas

```sql
ALTER TABLE public.prospeccion_contacto_envio
    ADD COLUMN IF NOT EXISTS whatsapp_template_id uuid,
    ADD COLUMN IF NOT EXISTS whatsapp_template_name_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_language_code_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_meta_category_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_template_display_name_snapshot text;
```

### 10.3 Foreign key compuesta

```sql
ALTER TABLE public.prospeccion_contacto_envio
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_envio_whatsapp_template_org_fkey;

ALTER TABLE public.prospeccion_contacto_envio
    ADD CONSTRAINT prospeccion_contacto_envio_whatsapp_template_org_fkey
    FOREIGN KEY (organizacion_id, whatsapp_template_id)
    REFERENCES public.prospeccion_contacto_templates (organizacion_id, id)
    ON DELETE SET NULL;
```

### 10.4 Indice operativo

```sql
CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_org_whatsapp_template_idx
ON public.prospeccion_contacto_envio (organizacion_id, whatsapp_template_id, creado_en DESC)
WHERE canal = 'whatsapp';
```

## 11) Ajuste recomendado en la tabla de plantillas

Para soportar FKs compuestas multitenant:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_contacto_templates_org_id_key
ON public.prospeccion_contacto_templates (organizacion_id, id);
```

## 12) RLS

La tabla `prospeccion_contacto_templates` ya debe alinearse a la politica multitenant real.

Si no existe ya una politica fuerte por tenant, se recomienda dejarla equivalente a:

- admin ve todo
- miembro solo ve filas con su `organizacion_id`

No debe quedar `USING (true)` para esta fase si la tabla se vuelve canonica para operacion de tenant.

## 13) Estrategia de migracion

### Fase 1

Agregar columnas nuevas y constraints sin borrar lo viejo.

### Fase 2

Crear API y frontend para `Whats-Prosp` usando:

- `canal = 'whatsapp'`
- `usage_scope = 'whats_prosp'`
- `provider = 'meta'`

### Fase 3

Modificar runtime de `prospeccion/prospectos` para usar `whatsapp_template_id` y snapshot.

### Fase 4

Dejar de leer:

- `whatsapp.templates.prospeccion`
- `twilio_content_sid` en el flujo `Whats-Prosp`

### Fase 5

Limpiar metadata legacy cuando el flujo nuevo este estable.

## 14) Recomendacion final

La mejor ruta no es crear un segundo catalogo paralelo.

La mejor ruta es:

1. normalizar `prospeccion_contacto_templates`,
2. hacer `Whats-Prosp` Meta-only,
3. relacionar batch/envio con `template_id`,
4. y snapshotear columnas reales para trazabilidad.

Con esto:

- no duplicas entidades,
- respetas el modelo actual de prospeccion,
- y corriges el problema real de esconder datos estructurales en `metadata`.
