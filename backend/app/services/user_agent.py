"""Utilidades simples para interpretar user-agent."""

from __future__ import annotations


def infer_device_type(user_agent: str | None) -> str | None:
    """Devuelve una categoría aproximada (`desktop`, `mobile`, `tablet`)."""

    if not user_agent:
        return None

    ua = user_agent.lower()

    tablet_keywords = ["ipad", "tablet", "sm-t", "tab", "kindle", "silk"]
    for keyword in tablet_keywords:
        if keyword in ua:
            return "tablet"

    mobile_keywords = [
        "mobile",
        "iphone",
        "android",
        "blackberry",
        "opera mini",
        "iemobile",
        "wpdesktop",
    ]
    for keyword in mobile_keywords:
        if keyword in ua:
            return "mobile"

    desktop_keywords = [
        "windows nt",
        "macintosh",
        "x11",
        "linux",
        "cros",
    ]
    for keyword in desktop_keywords:
        if keyword in ua:
            return "desktop"

    return None
