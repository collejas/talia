from pathlib import Path
from uuid import UUID

import pytest

from app.api.routes import crm as crm_routes


class _PropertyTypesRepo:
    def __init__(self) -> None:
        self.created_payload = None

    async def list_propiedad_tipos(self, *, organizacion_id: UUID):
        return []

    async def create_propiedad_tipo(self, *, organizacion_id: UUID, payload: dict):
        self.created_payload = (organizacion_id, payload)
        return {"id": "tipo-lote-residencial", **payload}


@pytest.mark.asyncio
async def test_import_creates_custom_tipo_for_new_tenant() -> None:
    repo = _PropertyTypesRepo()
    organizacion_id = UUID("7608c713-a9fb-460e-8b00-5878591b90d7")

    lookup = await crm_routes._build_tipo_lookup(repo, organizacion_id)
    tipo_id = await crm_routes._resolve_tipo_id(
        repo,
        organizacion_id,
        None,
        "Lote residencial",
        lookup,
    )

    assert tipo_id == "tipo-lote-residencial"
    assert repo.created_payload == (
        organizacion_id,
        {
            "nombre": "Lote residencial",
            "descripcion": "Creado desde importación de propiedades.",
            "color": "#0F766E",
        },
    )


def test_csv_resolves_horizontal_capas_by_identifier() -> None:
    csv_text = """entidad,grupo,nombre,identificador,status,nivel,capa_nivel,unidad,tipo_desarrollo,tipo_unidad_nombre,descripcion,poligono
desarrollo,Gran Peñón Residencial,Gran Peñón Residencial,GPR,disponible,,,,horizontal,,Desarrollo,
capa,Gran Peñón Residencial,M-8,GPR / M-8,disponible,0,,,,,,
capa,Gran Peñón Residencial,Plateros,GPR / Plateros,disponible,0,,,,,,
unidad,Gran Peñón Residencial,Lote 1,GPR / M-8 / Lote 1,disponible,,0,1,,Lote,,
unidad,Gran Peñón Residencial,Lote 2,GPR / Plateros / Lote 2,disponible,,0,2,,Lote,,
"""

    request = crm_routes._csv_to_import_request(csv_text)
    capas = request.desarrollos[0].capas

    assert [(capa.nombre, len(capa.unidades or [])) for capa in capas] == [
        ("M-8", 1),
        ("Plateros", 1),
    ]
    assert capas[1].unidades[0].unidad == "2"


def test_csv_supports_manzana_between_macrolote_and_unidad() -> None:
    csv_text = """entidad,grupo,nombre,identificador,status,nivel,capa_nivel,unidad,tipo_desarrollo,tipo_unidad_nombre,descripcion,poligono
desarrollo,Fraccionamiento,Fraccionamiento,FR,disponible,,,,horizontal,,,
capa,Fraccionamiento,Macrolote Norte,FR / Macrolote Norte,disponible,0,,,,,,
manzana,Fraccionamiento,Manzana A,FR / Macrolote Norte / Manzana A,disponible,,0,,,,,
unidad,Fraccionamiento,Lote 1,FR / Macrolote Norte / Manzana A / Lote 1,disponible,,0,1,,Lote,,
"""

    request = crm_routes._csv_to_import_request(csv_text)
    capa = request.desarrollos[0].capas[0]

    assert capa.manzanas[0].nombre == "Manzana A"
    assert capa.manzanas[0].unidades[0].unidad == "1"


def test_csv_normalizes_2d_template_polygons_to_multipolygon_z() -> None:
    normalized = crm_routes._normalize_geometry_input(
        "POLYGON((-109.7383 23.0022, -109.7381 23.0023, -109.7383 23.0022))"
    )

    assert normalized.startswith("SRID=4326;MULTIPOLYGON Z")
    assert "-109.7383 23.0022 0" in normalized


def test_uploaded_plateros_csv_preserves_expected_distribution() -> None:
    csv_path = Path("/var/www/talia/plateros3.csv")
    if not csv_path.exists():
        pytest.skip("No está disponible el CSV operativo plateros3.csv")

    request = crm_routes._csv_to_import_request(csv_path.read_text(encoding="utf-8-sig"))
    capas = {capa.nombre: len(capa.unidades or []) for capa in request.desarrollos[0].capas}

    assert capas == {
        "M-8 Sección Arco de la Cañada": 8,
        "M-9 Sección Arco de la Cañada II": 11,
        "CERRADA DE LA CAÑADA": 16,
        "MANZANA 2-B": 16,
        "MANZANA 2-A": 9,
        "Plateros": 217,
    }
