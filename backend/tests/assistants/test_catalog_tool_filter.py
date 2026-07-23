from app.assistants.runtime import (
    CATALOG_INMOBILIARIO_TOOL_NAMES,
    filter_assistant_tools,
)


def test_filter_assistant_tools_removes_inmobiliario_functions_when_disabled() -> None:
    tools = [
        {"type": "function", "function": {"name": "set_full_name"}},
        {"type": "function", "function": {"name": "list_catalog_modelos"}},
        {"type": "function", "function": {"name": "fetch_catalog_item_details"}},
        {"type": "function", "function": {"name": "close_lead"}},
        {"type": "file_search"},
    ]

    filtered = filter_assistant_tools(
        tools,
        catalog_inmobiliario_enabled=False,
        catalog_no_inmobiliario_enabled=True,
    )

    names = [tool.get("function", {}).get("name") for tool in filtered if isinstance(tool.get("function"), dict)]
    assert "set_full_name" in names
    assert "close_lead" in names
    assert "list_catalog_modelos" not in names
    assert "fetch_catalog_item_details" in names
    assert all(name not in CATALOG_INMOBILIARIO_TOOL_NAMES for name in names if isinstance(name, str))


def test_filter_assistant_tools_removes_products_and_services_functions_when_disabled() -> None:
    tools = [{"type": "function", "function": {"name": "fetch_catalog_item_details"}}]

    filtered = filter_assistant_tools(
        tools,
        catalog_inmobiliario_enabled=True,
        catalog_no_inmobiliario_enabled=False,
    )

    assert filtered == []


def test_filter_assistant_tools_keeps_tools_when_enabled() -> None:
    tools = [{"type": "function", "function": {"name": "list_catalog_fraccionamientos"}}]

    filtered = filter_assistant_tools(
        tools,
        catalog_inmobiliario_enabled=True,
        catalog_no_inmobiliario_enabled=True,
    )

    assert filtered == tools


def test_filter_assistant_tools_removes_agenda_functions_when_disabled() -> None:
    tools = [
        {"type": "function", "function": {"name": "list_demo_slots"}},
        {"type": "function", "function": {"name": "schedule_demo"}},
        {"type": "function", "function": {"name": "close_lead"}},
    ]

    filtered = filter_assistant_tools(
        tools,
        catalog_inmobiliario_enabled=True,
        catalog_no_inmobiliario_enabled=True,
        agenda_enabled=False,
    )

    names = [tool.get("function", {}).get("name") for tool in filtered]
    assert names == ["close_lead"]
