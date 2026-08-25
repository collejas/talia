from datetime import datetime, time, timezone

from app.services.tenant_runtime import (
    WhatsAppAssistantSchedule,
    is_within_human_schedule,
    next_whatsapp_assistant_time,
    should_run_whatsapp_assistant,
)


def _schedule(*, monday: tuple[time, time] | None = None, sunday: tuple[time, time] | None = None) -> WhatsAppAssistantSchedule:
    windows = [(False, None, None) for _ in range(7)]
    if monday:
        windows[0] = (True, monday[0], monday[1])
    if sunday:
        windows[6] = (True, sunday[0], sunday[1])
    return WhatsAppAssistantSchedule(
        activo=True,
        zona_horaria="America/Mexico_City",
        aplica_a_normal=True,
        aplica_a_prospeccion=True,
        windows=tuple(windows),
    )


def test_schedule_uses_tenant_timezone_for_human_hours() -> None:
    schedule = _schedule(monday=(time(9), time(18)))

    # 15:00 UTC = 09:00 in America/Mexico_City during standard time.
    assert is_within_human_schedule(
        schedule=schedule,
        now=datetime(2026, 1, 5, 15, 0, tzinfo=timezone.utc),
    )
    assert not is_within_human_schedule(
        schedule=schedule,
        now=datetime(2026, 1, 6, 1, 0, tzinfo=timezone.utc),
    )


def test_schedule_supports_overnight_windows() -> None:
    schedule = _schedule(sunday=(time(20), time(8)))

    assert is_within_human_schedule(
        schedule=schedule,
        now=datetime(2026, 1, 5, 5, 0, tzinfo=timezone.utc),
    )


def test_should_run_assistant_respects_manual_override_and_flow() -> None:
    schedule = _schedule(monday=(time(9), time(18)))
    now = datetime(2026, 1, 5, 16, 0, tzinfo=timezone.utc)

    assert should_run_whatsapp_assistant(
        schedule=schedule,
        now=now,
        flow="normal",
        manual_override=True,
    ) == (False, "manual_override")

    assert should_run_whatsapp_assistant(
        schedule=schedule,
        now=now,
        flow="prospeccion",
    ) == (False, "human_hours")


def test_next_assistant_time_moves_after_human_window() -> None:
    schedule = _schedule(monday=(time(9), time(18)))
    now = datetime(2026, 1, 5, 16, 0, tzinfo=timezone.utc)

    next_time = next_whatsapp_assistant_time(schedule=schedule, now=now)

    assert next_time > now
    assert not is_within_human_schedule(schedule=schedule, now=next_time)
