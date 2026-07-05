BEGIN;

CREATE TABLE IF NOT EXISTS public.usuarios_correo_config (
    usuario_id uuid PRIMARY KEY,
    organizacion_id uuid NOT NULL,
    mail_habilitado boolean NOT NULL DEFAULT true,
    mail_username text,
    mail_password_nonce text,
    mail_password_ciphertext text,
    mail_incoming_server text,
    mail_incoming_port_imap integer,
    mail_outgoing_server text,
    mail_outgoing_port_smtp integer,
    mail_use_ssl boolean NOT NULL DEFAULT false,
    mail_use_tls boolean NOT NULL DEFAULT true,
    mail_from_name text,
    mail_reply_to text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.usuarios_correo_config IS
    'Configuración de correo por usuario para enviar desde la cuenta personal del vendedor con fallback al correo del sistema.';
COMMENT ON COLUMN public.usuarios_correo_config.mail_habilitado IS
    'Indica si esta cuenta personal debe preferirse para envíos salientes.';
COMMENT ON COLUMN public.usuarios_correo_config.mail_username IS
    'Usuario/correo SMTP del vendedor.';
COMMENT ON COLUMN public.usuarios_correo_config.mail_password_nonce IS
    'Nonce asociado a la contraseña cifrada del usuario.';
COMMENT ON COLUMN public.usuarios_correo_config.mail_password_ciphertext IS
    'Contraseña cifrada del usuario para SMTP/IMAP.';
COMMENT ON COLUMN public.usuarios_correo_config.mail_incoming_server IS
    'Servidor IMAP del usuario, si aplica.';
COMMENT ON COLUMN public.usuarios_correo_config.mail_outgoing_server IS
    'Servidor SMTP del usuario.';
COMMENT ON COLUMN public.usuarios_correo_config.mail_from_name IS
    'Nombre visible del remitente para este usuario.';
COMMENT ON COLUMN public.usuarios_correo_config.mail_reply_to IS
    'Reply-To preferido para respuestas de correo.';

ALTER TABLE public.usuarios_correo_config
    ADD CONSTRAINT usuarios_correo_config_usuario_id_fkey
        FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

ALTER TABLE public.usuarios_correo_config
    ADD CONSTRAINT usuarios_correo_config_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS usuarios_correo_config_organizacion_id_idx
    ON public.usuarios_correo_config (organizacion_id, usuario_id);

ALTER TABLE public.usuarios_correo_config
    ADD CONSTRAINT usuarios_correo_config_mail_incoming_port_imap_check
        CHECK (mail_incoming_port_imap IS NULL OR mail_incoming_port_imap > 0);

ALTER TABLE public.usuarios_correo_config
    ADD CONSTRAINT usuarios_correo_config_mail_outgoing_port_smtp_check
        CHECK (mail_outgoing_port_smtp IS NULL OR mail_outgoing_port_smtp > 0);

DROP TRIGGER IF EXISTS t_usuarios_correo_config_set_org ON public.usuarios_correo_config;
CREATE TRIGGER t_usuarios_correo_config_set_org
    BEFORE INSERT ON public.usuarios_correo_config
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_usuarios_correo_config_touch_updated_at ON public.usuarios_correo_config;
CREATE TRIGGER t_usuarios_correo_config_touch_updated_at
    BEFORE UPDATE ON public.usuarios_correo_config
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

COMMIT;
