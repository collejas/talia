-- Contexto empresarial e identidad visual explícitos para generación de plantillas IA.
-- Se agregan a organizaciones porque son atributos propios del tenant y ya existe
-- un flujo protegido de settings.manage para administrarlos.

ALTER TABLE public.organizaciones
  ADD COLUMN IF NOT EXISTS ia_descripcion_empresa text,
  ADD COLUMN IF NOT EXISTS ia_productos_servicios text,
  ADD COLUMN IF NOT EXISTS ia_publico_objetivo text,
  ADD COLUMN IF NOT EXISTS ia_propuesta_valor text,
  ADD COLUMN IF NOT EXISTS ia_diferenciadores text,
  ADD COLUMN IF NOT EXISTS ia_restricciones_comerciales text,
  ADD COLUMN IF NOT EXISTS ia_color_primario text,
  ADD COLUMN IF NOT EXISTS ia_color_secundario text,
  ADD COLUMN IF NOT EXISTS ia_color_acento text,
  ADD COLUMN IF NOT EXISTS ia_color_fondo text,
  ADD COLUMN IF NOT EXISTS ia_estilo_visual text,
  ADD COLUMN IF NOT EXISTS ia_radio_bordes text;

ALTER TABLE public.organizaciones
  DROP CONSTRAINT IF EXISTS organizaciones_ia_color_primario_hex_ck,
  DROP CONSTRAINT IF EXISTS organizaciones_ia_color_secundario_hex_ck,
  DROP CONSTRAINT IF EXISTS organizaciones_ia_color_acento_hex_ck,
  DROP CONSTRAINT IF EXISTS organizaciones_ia_color_fondo_hex_ck,
  DROP CONSTRAINT IF EXISTS organizaciones_ia_radio_bordes_ck;

ALTER TABLE public.organizaciones
  ADD CONSTRAINT organizaciones_ia_color_primario_hex_ck
    CHECK (ia_color_primario IS NULL OR ia_color_primario ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT organizaciones_ia_color_secundario_hex_ck
    CHECK (ia_color_secundario IS NULL OR ia_color_secundario ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT organizaciones_ia_color_acento_hex_ck
    CHECK (ia_color_acento IS NULL OR ia_color_acento ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT organizaciones_ia_color_fondo_hex_ck
    CHECK (ia_color_fondo IS NULL OR ia_color_fondo ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT organizaciones_ia_radio_bordes_ck
    CHECK (ia_radio_bordes IS NULL OR ia_radio_bordes ~ '^(0|[1-9][0-9]{0,2})(px|rem|em|%)$');

COMMENT ON COLUMN public.organizaciones.ia_descripcion_empresa IS 'Descripción autorizada del tenant para asistentes IA.';
COMMENT ON COLUMN public.organizaciones.ia_productos_servicios IS 'Productos y servicios que la IA puede comunicar.';
COMMENT ON COLUMN public.organizaciones.ia_publico_objetivo IS 'Público objetivo autorizado para contenido IA.';
COMMENT ON COLUMN public.organizaciones.ia_propuesta_valor IS 'Propuesta de valor autorizada para contenido IA.';
COMMENT ON COLUMN public.organizaciones.ia_diferenciadores IS 'Diferenciadores comerciales autorizados para contenido IA.';
COMMENT ON COLUMN public.organizaciones.ia_restricciones_comerciales IS 'Afirmaciones, temas o promesas que la IA debe evitar.';
COMMENT ON COLUMN public.organizaciones.ia_color_primario IS 'Color de marca principal en hexadecimal de seis dígitos.';
COMMENT ON COLUMN public.organizaciones.ia_color_secundario IS 'Color de marca secundario en hexadecimal de seis dígitos.';
COMMENT ON COLUMN public.organizaciones.ia_color_acento IS 'Color de acento en hexadecimal de seis dígitos.';
COMMENT ON COLUMN public.organizaciones.ia_color_fondo IS 'Color de fondo de marca en hexadecimal de seis dígitos.';
COMMENT ON COLUMN public.organizaciones.ia_estilo_visual IS 'Descripción breve del estilo visual de la marca.';
COMMENT ON COLUMN public.organizaciones.ia_radio_bordes IS 'Radio visual preferido, por ejemplo 12px.';
