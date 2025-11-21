# qr_pro.py (logo más grande, padding reducido alrededor del logo)
import os
from urllib.parse import quote_plus

import qrcode
from PIL import Image, ImageDraw, ImageFont


def load_font(size, bold=False):
    try:
        if bold:
            return ImageFont.truetype("DejaVuSans-Bold.ttf", size)
        return ImageFont.truetype("DejaVuSans.ttf", size)
    except Exception:
        return ImageFont.load_default()


def fit_font(draw, text, max_width, start_size=52, min_size=16, bold=True):
    size = start_size
    while size >= min_size:
        f = load_font(size, bold=bold)
        bbox = draw.multiline_textbbox((0, 0), text, font=f, spacing=8)
        text_w = bbox[2] - bbox[0]
        if text_w <= max_width:
            return f
        size -= 2
    return load_font(min_size, bold=bold)


def centered_multiline_text(draw, text, y, img_w, font, fill=(0, 0, 0)):
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=8)
    text_w = bbox[2] - bbox[0]
    x = (img_w - text_w) // 2
    draw.multiline_text((x, y), text, font=font, fill=fill, align="center", spacing=8)


def make_qr_with_logo(
    numero: str,
    mensaje: str,
    logo_path: str = "logo_geo_cuadrado.png",
    out_path: str = "whatsapp_qr_logo_label.png",
    titulo: str = "",
    telefono_label: str = None,
    box_size: int = 10,
    border: int = 4,
    logo_scale: float = 0.30,
    logo_inner_scale: float = 0.75,
    logo_shape: str = "rounded",  # "rounded" | "circle"
):
    # Generar URL WhatsApp
    url = f"https://wa.me/{numero}"
    if mensaje:
        url += f"?text={quote_plus(mensaje)}"

    # Generar QR
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=box_size,
        border=border,
    )
    qr.add_data(url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    qr_w, qr_h = qr_img.size

    # Insertar logo (controlado por logo_scale)
    if logo_path and not os.path.isabs(logo_path):
        script_dir = os.path.dirname(__file__)
        candidate_path = os.path.join(script_dir, logo_path)
        if os.path.exists(candidate_path):
            logo_path = candidate_path

    if logo_path and os.path.exists(logo_path):
        logo = Image.open(logo_path).convert("RGBA")

        # Tamaño del contenedor (círculo/cuadro) proporcional al QR
        holder_target_w = max(1, int(qr_w * logo_scale))
        holder_ratio = holder_target_w / logo.width
        holder_target_h = int(logo.height * holder_ratio)

        # Logo interno más pequeño para que no toque el borde del contenedor
        inner_scale = max(0.1, min(logo_inner_scale, 1.0))
        logo_target_w = max(1, int(holder_target_w * inner_scale))
        ratio = logo_target_w / logo.width
        logo_target_h = int(logo.height * ratio)
        logo = logo.resize((logo_target_w, logo_target_h), Image.LANCZOS)

        # Padding reducido (solo un 5% extra en vez de mucho)
        pad = int(holder_target_w * 0.05)
        box_w = holder_target_w + pad * 2
        box_h = holder_target_h + pad * 2

        # Caja blanca pequeña
        holder = Image.new("RGBA", (box_w, box_h), (255, 255, 255, 0))
        mask = Image.new("L", (box_w, box_h), 0)
        draw_mask = ImageDraw.Draw(mask)
        radius = max(6, box_w // 15)
        if logo_shape.lower() == "circle":
            draw_mask.ellipse([0, 0, box_w, box_h], fill=255)
        else:
            draw_mask.rounded_rectangle([0, 0, box_w, box_h], radius=radius, fill=255)
        holder.putalpha(mask)

        # Fondo blanco
        draw_holder = ImageDraw.Draw(holder)
        if logo_shape.lower() == "circle":
            draw_holder.ellipse([0, 0, box_w, box_h], fill=(255, 255, 255, 255))
        else:
            draw_holder.rounded_rectangle(
                [0, 0, box_w, box_h], radius=radius, fill=(255, 255, 255, 255)
            )

        # Logo centrado en la caja blanca
        lx = (box_w - logo_target_w) // 2
        ly = (box_h - logo_target_h) // 2
        holder.alpha_composite(logo, (lx, ly))

        # Pegar en el centro del QR
        px = (qr_w - box_w) // 2
        py = (qr_h - box_h) // 2
        qr_img.alpha_composite(holder, (px, py))

    # Márgenes generales
    side_pad = 40

    canvas_w = qr_w + side_pad * 2
    top_h = 0
    titulo_font = None
    has_title = bool(titulo.strip())
    if has_title:
        tmp = Image.new("RGB", (canvas_w, 400), "white")
        tmp_draw = ImageDraw.Draw(tmp)
        max_title_width = canvas_w - 30
        titulo_font = fit_font(
            tmp_draw, titulo, max_title_width, start_size=56, min_size=20, bold=True
        )
        title_bbox = tmp_draw.multiline_textbbox((0, 0), titulo, font=titulo_font, spacing=8)
        title_h = title_bbox[3] - title_bbox[1]
        top_h = title_h + 30

    # Canvas final
    if telefono_label is None:
        telefono_label = numero
    has_phone_text = bool(telefono_label.strip())
    bottom_h = 80 if has_phone_text else 0

    canvas_h = top_h + qr_h + bottom_h
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (255, 255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    # Texto título
    if has_title and titulo_font:
        title_bbox = draw.multiline_textbbox((0, 0), titulo, font=titulo_font, spacing=8)
        title_h = title_bbox[3] - title_bbox[1]
        title_y = (top_h - title_h) // 2
        centered_multiline_text(
            draw, titulo, y=title_y, img_w=canvas_w, font=titulo_font, fill=(0, 0, 0)
        )

    # QR
    qr_x = (canvas_w - qr_w) // 2
    qr_y = top_h
    canvas.alpha_composite(qr_img, (qr_x, qr_y))

    # Teléfono
    if has_phone_text:
        subt_font = load_font(36, bold=False)
        centered_multiline_text(
            draw,
            telefono_label,
            y=top_h + qr_h + 20,
            img_w=canvas_w,
            font=subt_font,
            fill=(0, 0, 0),
        )

    # Guardar
    canvas = canvas.convert("RGB")
    canvas.save(out_path, format="PNG", optimize=True)
    print(f"✅ Generado: {out_path}")
    print(f"   URL: {url}")


if __name__ == "__main__":
    make_qr_with_logo(
        numero="524443354450",
        mensaje="Hola, Que puede hacer L-IA por mi negocio?",
        logo_path="logo_geo_cuadrado.png",
        out_path="whatsapp_qr_logo_label.png",
        titulo="",
        telefono_label="",
        box_size=10,
        border=4,
        logo_scale=0.30,
        logo_shape="circle",
    )
