from app.api.routes.crm import _build_recovery_summary


ORG_ID = "00000000-0000-0000-0000-000000000001"
STAGE_ID = "11111111-1111-1111-1111-111111111111"


def _row(
    *,
    opportunity_id: str,
    state: str,
    amount: int,
    next_activity: str | None,
    last_interaction: str | None,
) -> dict:
    return {
        "id": opportunity_id,
        "organizacion_id": ORG_ID,
        "etapa_id": STAGE_ID,
        "etapa": {"id": STAGE_ID, "nombre": "Propuesta", "codigo": "propuesta"},
        "titulo": "Oportunidad de prueba",
        "monto_estimado": amount,
        "moneda": "MXN",
        "estado": "abierta",
        "estado_seguimiento": state,
        "temperatura": "tibio",
        "estrategia_seguimiento": "seguimiento_normal",
        "proxima_actividad_en": next_activity,
        "ultima_interaccion_contacto_en": last_interaction,
        "etapa_cambiada_en": "2026-09-01T12:00:00+00:00",
    }


def test_build_recovery_summary_calculates_operational_kpis() -> None:
    rows = [
        _row(
            opportunity_id="22222222-2222-2222-2222-222222222222",
            state="activo",
            amount=1000,
            next_activity="2026-09-06T12:00:00+00:00",
            last_interaction="2026-09-05T12:00:00+00:00",
        ),
        _row(
            opportunity_id="33333333-3333-3333-3333-333333333333",
            state="dormido",
            amount=2500,
            next_activity=None,
            last_interaction="2026-07-01T12:00:00+00:00",
        ),
        _row(
            opportunity_id="44444444-4444-4444-4444-444444444444",
            state="en_riesgo",
            amount=500,
            next_activity="2026-09-07T12:00:00+00:00",
            last_interaction=None,
        ),
    ]

    payload = _build_recovery_summary(rows=rows, limit=100, offset=0)

    assert payload.total_abiertas == 3
    assert payload.pipeline_abierto == 4000
    assert payload.pipeline_activo == 1000
    assert payload.valor_detenido == 2500
    assert payload.activas == 1
    assert payload.en_riesgo == 1
    assert payload.estancadas == 0
    assert payload.dormidas == 1
    assert payload.sin_proxima_actividad == 1
    assert payload.cobertura_seguimiento_pct == 66.67
    assert len(payload.items) == 3
    assert payload.items[1].dias_sin_interaccion is not None


def test_build_recovery_summary_excludes_closed_opportunities() -> None:
    row = _row(
        opportunity_id="55555555-5555-5555-5555-555555555555",
        state="dormido",
        amount=9000,
        next_activity=None,
        last_interaction=None,
    )
    row["estado"] = "ganada"

    payload = _build_recovery_summary(rows=[row], limit=100, offset=0)

    assert payload.total_abiertas == 0
    assert payload.pipeline_abierto == 0
    assert payload.valor_detenido == 0
    assert payload.cobertura_seguimiento_pct == 0
