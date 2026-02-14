from uuid import uuid4

import pytest

from app.services import storage, tenant_runtime


@pytest.mark.asyncio
async def test_get_lead_scoring_runtime_settings_from_tenant_config(monkeypatch):
    org_id = uuid4()

    async def fake_get_org_config(*, organizacion_id):
        assert organizacion_id == org_id
        return {
            "scoring_bienes_raices": {
                "enabled": True,
                "weights": {
                    "capacidad_financiera": 25,
                    "urgencia": 25,
                    "nivel_decision": 20,
                    "autoridad": 10,
                    "interaccion_compromiso": 20,
                },
                "thresholds": {"explorando_max": 45, "interesado_max": 70, "listo_min": 71},
                "confidence_thresholds": {"high_min": 85, "medium_min": 55},
            }
        }

    monkeypatch.setattr(tenant_runtime, "get_org_config", fake_get_org_config)
    settings = await tenant_runtime.get_lead_scoring_runtime_settings(organizacion_id=org_id)

    assert settings.enabled is True
    assert settings.capacidad_financiera_weight == 25
    assert settings.urgencia_weight == 25
    assert settings.nivel_decision_weight == 20
    assert settings.autoridad_weight == 10
    assert settings.interaccion_compromiso_weight == 20
    assert settings.explorando_max == 45
    assert settings.interesado_max == 70
    assert settings.listo_min == 71
    assert settings.confidence_high_min == 0.85
    assert settings.confidence_medium_min == 0.55


@pytest.mark.asyncio
async def test_get_lead_scoring_runtime_settings_invalid_weight_sum_falls_back(monkeypatch):
    org_id = uuid4()

    async def fake_get_org_config(*, organizacion_id):
        assert organizacion_id == org_id
        return {
            "scoring_bienes_raices": {
                "weights": {
                    "capacidad_financiera": 50,
                    "urgencia": 50,
                    "nivel_decision": 50,
                    "autoridad": 0,
                    "interaccion_compromiso": 0,
                }
            }
        }

    monkeypatch.setattr(tenant_runtime, "get_org_config", fake_get_org_config)
    settings = await tenant_runtime.get_lead_scoring_runtime_settings(organizacion_id=org_id)
    defaults = tenant_runtime.LeadScoringRuntimeSettings.from_defaults()

    assert settings.capacidad_financiera_weight == defaults.capacidad_financiera_weight
    assert settings.urgencia_weight == defaults.urgencia_weight
    assert settings.nivel_decision_weight == defaults.nivel_decision_weight
    assert settings.autoridad_weight == defaults.autoridad_weight
    assert settings.interaccion_compromiso_weight == defaults.interaccion_compromiso_weight


def test_compute_lead_scoring_uses_dynamic_weights_and_thresholds():
    answers = {
        "financing_type": "contado",
        "credit_preapproved": "si",
        "down_payment_ready": "si",
        "budget_range": "3m-5m",
        "purchase_timeline": "0_3_meses",
        "hard_deadline": "si",
        "requirements_defined": "definidos",
        "comparison_mode": "shortlist",
        "visited_properties": "si",
        "decision_authority": "decisor_principal",
        "buyer_type": "particular",
    }
    events = {
        "accepted_answering_questions": True,
        "answered_fields_ratio": 1,
        "appointment_requested": True,
        "appointment_scheduled": True,
        "appointment_confirmed": True,
        "appointment_attended": False,
        "evasive_answers_count": 0,
        "response_time_bucket": "fast",
    }

    custom = tenant_runtime.LeadScoringRuntimeSettings(
        enabled=True,
        capacidad_financiera_weight=100,
        urgencia_weight=0,
        nivel_decision_weight=0,
        autoridad_weight=0,
        interaccion_compromiso_weight=0,
        explorando_max=10,
        interesado_max=20,
        listo_min=21,
        confidence_high_min=0.40,
        confidence_medium_min=0.20,
    )

    scoring = storage._compute_lead_scoring(answers, events, custom)

    assert scoring["score_total"] == scoring["factors"]["capacidad_financiera"]
    assert scoring["grade"] == "listo"
    assert scoring["confidence"] == "high"
