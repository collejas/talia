"""Errores controlados del adaptador de correo."""


class PostmarkError(RuntimeError):
    """Error base de la integración."""


class PostmarkRequestError(PostmarkError):
    """La API externa rechazó o no pudo procesar una solicitud."""

    def __init__(
        self,
        code: str,
        *,
        status_code: int | None = None,
        provider_code: int | None = None,
        provider_message: str | None = None,
    ) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code
        self.provider_code = provider_code
        self.provider_message = provider_message
