"""Adaptador interno para el servicio central de correo."""

from .client import PostmarkClient
from .errors import PostmarkError, PostmarkRequestError

__all__ = ["PostmarkClient", "PostmarkError", "PostmarkRequestError"]
