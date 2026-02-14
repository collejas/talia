from app.api.routes.crm import _build_scoring_kpis


def test_build_scoring_kpis_includes_event_and_latest_views() -> None:
    rows = [
        {
            "oportunidad_id": "opp-1",
            "score_total": 40,
            "grade": "explorando",
            "confidence": "low",
            "events": {"appointment_scheduled": False, "evasive_answers_count": 2},
            "created_at": "2026-02-14T10:02:00+00:00",
        },
        {
            "oportunidad_id": "opp-1",
            "score_total": 80,
            "grade": "listo",
            "confidence": "high",
            "events": {"appointment_scheduled": True, "evasive_answers_count": 0},
            "created_at": "2026-02-14T10:01:00+00:00",
        },
        {
            "oportunidad_id": "opp-2",
            "score_total": 60,
            "grade": "interesado",
            "confidence": "medium",
            "events": {"appointment_scheduled": True, "evasive_answers_count": 1},
            "created_at": "2026-02-14T10:00:00+00:00",
        },
    ]

    payload = _build_scoring_kpis(rows=rows, window_days=7)

    assert payload.total_eventos == 3
    assert payload.oportunidades_unicas == 2

    assert payload.event_based is not None
    assert payload.opportunity_latest_based is not None

    assert payload.event_based["total_eventos"] == 3
    assert payload.event_based["oportunidades_unicas"] == 2

    # latest por oportunidad toma solo el primer evento por oportunidad (rows vienen DESC)
    assert payload.opportunity_latest_based["total_eventos"] == 2
    assert payload.opportunity_latest_based["oportunidades_unicas"] == 2
    assert payload.opportunity_latest_based["distribucion_grade"] == {
        "explorando": 1,
        "interesado": 1,
    }
