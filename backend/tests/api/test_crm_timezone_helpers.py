from datetime import datetime, timezone

import pytest

from app.api.routes import crm as crm_routes


class FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):  # type: ignore[override]
        base = datetime(2026, 3, 5, 2, 55, 0, tzinfo=timezone.utc)
        if tz is None:
            return base.replace(tzinfo=None)
        return base.astimezone(tz)


def test_convert_date_filter_to_utc_iso_for_kiritimati_day() -> None:
    start_iso = crm_routes._convert_date_filter_to_utc_iso(
        value="2026-03-05",
        timezone_name="Pacific/Kiritimati",
        is_end=False,
    )
    end_iso = crm_routes._convert_date_filter_to_utc_iso(
        value="2026-03-05",
        timezone_name="Pacific/Kiritimati",
        is_end=True,
    )

    assert start_iso == "2026-03-04T10:00:00+00:00"
    assert end_iso == "2026-03-05T09:59:59.999999+00:00"


def test_resolve_inbox_today_range_uses_effective_timezone(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(crm_routes, "datetime", FrozenDateTime)

    date_from, date_to = crm_routes._resolve_inbox_date_filter_range(
        date_filter="today",
        timezone_name="Pacific/Kiritimati",
    )

    assert date_from is not None
    assert date_to is not None
    assert date_from.isoformat() == "2026-03-04T10:00:00+00:00"
    assert date_to.isoformat() == "2026-03-05T09:59:59.999999+00:00"


def test_resolve_date_range_fechas_uses_passed_timezone() -> None:
    date_from, date_to = crm_routes._resolve_date_range(
        rango="fechas",
        desde="2026-03-05",
        hasta="2026-03-05",
        timezone_name="Pacific/Kiritimati",
    )

    assert date_from is not None
    assert date_to is not None
    assert date_from.isoformat() == "2026-03-04T10:00:00+00:00"
    assert date_to.isoformat() == "2026-03-05T09:59:59.999999+00:00"


def test_resolve_recent_days_created_from_utc_anchors_local_midnight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(crm_routes, "datetime", FrozenDateTime)

    created_from = crm_routes._resolve_recent_days_created_from_utc(
        days=7,
        timezone_name="Pacific/Kiritimati",
    )

    assert created_from.isoformat() == "2026-02-26T10:00:00+00:00"
