from app.assistants.runtime import CATALOG_BACKEND_TOOL_NAMES, filter_assistant_tools


def test_filter_assistant_tools_removes_catalog_backend_functions_when_disabled() -> None:
    tools = [
        {"type": "function", "function": {"name": "set_full_name"}},
        {"type": "function", "function": {"name": "list_catalog_modelos"}},
        {"type": "function", "function": {"name": "fetch_catalog_item_details"}},
        {"type": "function", "function": {"name": "close_lead"}},
        {"type": "file_search"},
    ]

    filtered = filter_assistant_tools(tools, enabled=False)

    names = [tool.get("function", {}).get("name") for tool in filtered if isinstance(tool.get("function"), dict)]
    assert "set_full_name" in names
    assert "close_lead" in names
    assert "list_catalog_modelos" not in names
    assert "fetch_catalog_item_details" not in names
    assert all(name not in CATALOG_BACKEND_TOOL_NAMES for name in names if isinstance(name, str))


def test_filter_assistant_tools_keeps_tools_when_enabled() -> None:
    tools = [{"type": "function", "function": {"name": "list_catalog_fraccionamientos"}}]

    filtered = filter_assistant_tools(tools, enabled=True)

    assert filtered == tools
