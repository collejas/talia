from uuid import UUID

import pytest

from app.assistants.tool_runtime import ToolRuntimeContext
from app.assistants.tools import lead as lead_tools
from app.services import tenant_runtime


ORG_ID = UUID("39e32c05-bfc2-4794-8aab-225873f2bf19")


@pytest.mark.asyncio
async def test_close_lead_policy_loads_explicit_tenant_fields(monkeypatch):
    tenant_runtime.invalidate_runtime_cache(organizacion_id=ORG_ID)

    async def fake_get(*_, **__):
        return [{
            "activo": True,
            "nombre_requerido": True,
            "telefono_requerido": True,
            "necesidad_proposito_requerido": True,
            "notes_requerido": True,
            "correo_requerido": False,
            "company_name_requerido": False,
        }]

    monkeypatch.setattr(tenant_runtime, "_supabase_get", fake_get)
    policy = await tenant_runtime.get_close_lead_policy(
        organizacion_id=ORG_ID,
        channel="whatsapp",
        force_refresh=True,
    )

    assert policy.required_fields() == ("nombre_completo", "telefono", "necesidad_proposito", "notes")
    prompt = policy.developer_instruction()
    assert "correo: opcional" in prompt
    assert "empresa: opcional" in prompt


@pytest.mark.asyncio
async def test_close_lead_validation_allows_optional_email_and_company(monkeypatch):
    async def fake_policy(*_, **__):
        return tenant_runtime.CloseLeadPolicy()

    monkeypatch.setattr(lead_tools, "get_close_lead_policy", fake_policy)
    context = ToolRuntimeContext(
        conversation_id="conversation-1",
        persona_id="persona-1",
        channel="whatsapp",
        organizacion_id=str(ORG_ID),
    )

    await lead_tools.validate_close_lead_requirements(
        context=context,
        persona={"nombre_completo": "Pedro Martinez", "telefono_principal_e164": "+5214441302811"},
        notes="Interesado en terreno de 500 m2.",
        necesidad="Cotización de terreno de 500 m2.",
    )


def test_auto_close_required_fields_include_assistant_notes_and_need():
    policy = tenant_runtime.CloseLeadPolicy()
    persona = {
        "nombre_completo": "Pedro Martinez",
        "telefono_principal_e164": "+5214441302811",
    }

    assert not lead_tools._has_required_close_lead_fields(persona, policy)

    persona.update(
        {
            "notes": "Interesado en terreno de 500 m2.",
            "necesidad_proposito": "Cotización de terreno de 500 m2.",
        }
    )
    assert lead_tools._has_required_close_lead_fields(persona, policy)
