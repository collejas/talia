from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
import pytest

from app.services import google_trends


class FakeTooManyRequestsError(RuntimeError):
    pass


@dataclass
class _CallRecord:
    name: str
    payload: tuple[object, ...]


class _BaseFakeTrendReq:
    instances: list["_BaseFakeTrendReq"] = []
    created_count = 0

    def __init__(self, **kwargs):
        type(self).created_count += 1
        self.instance_number = type(self).created_count
        self.kwargs = kwargs
        self.calls: list[_CallRecord] = []
        type(self).instances.append(self)

    def build_payload(self, keywords, timeframe, geo, gprop):
        self.calls.append(_CallRecord("build_payload", (tuple(keywords), timeframe, geo, gprop)))

    def interest_over_time(self):
        self.calls.append(_CallRecord("interest_over_time", tuple()))
        return pd.DataFrame(
            {
                "IA": [37],
                "isPartial": [False],
            },
            index=pd.to_datetime(["2026-06-24"]),
        )

    def interest_by_region(self, resolution, inc_low_vol, inc_geo_code):
        self.calls.append(_CallRecord("interest_by_region", (resolution, inc_low_vol, inc_geo_code)))
        return pd.DataFrame(
            {"IA": [12]},
            index=pd.Index(["México"], name="geoName"),
        )

    def related_queries(self):
        self.calls.append(_CallRecord("related_queries", tuple()))
        return {
            "IA": {
                "top": pd.DataFrame({"query": ["automatización"], "value": [90]}),
                "rising": pd.DataFrame({"query": ["crm ia"], "value": [40]}),
            }
        }


class _RateLimitedOnceTrendReq(_BaseFakeTrendReq):
    def build_payload(self, keywords, timeframe, geo, gprop):
        super().build_payload(keywords, timeframe, geo, gprop)
        if self.instance_number == 1:
            raise FakeTooManyRequestsError("429")


class _AlwaysRateLimitedTrendReq(_BaseFakeTrendReq):
    def build_payload(self, keywords, timeframe, geo, gprop):
        super().build_payload(keywords, timeframe, geo, gprop)
        raise FakeTooManyRequestsError("429")


def _reset_fake_trend_req(fake_class):
    fake_class.instances = []
    fake_class.created_count = 0


def test_fetch_google_trends_retries_after_initial_rate_limit(monkeypatch):
    _reset_fake_trend_req(_RateLimitedOnceTrendReq)
    monkeypatch.setattr(google_trends, "TrendReq", _RateLimitedOnceTrendReq)
    monkeypatch.setattr(google_trends, "TooManyRequestsError", FakeTooManyRequestsError)
    monkeypatch.setattr(google_trends, "_wait_between_requests", lambda *args, **kwargs: None)

    result = google_trends.fetch_google_trends(
        keywords=["IA"],
        timeframe="today 12-m",
        geo="MX",
        source="",
        hl="es-MX",
        tz=360,
        include_region=True,
        region_resolution="REGION",
        inc_low_vol=False,
        inc_geo_code=False,
        min_sleep=0,
        max_sleep=0,
    )

    assert result["latest"] == {"IA": 37}
    assert result["by_region"] == [{"region": "México", "IA": 12}]
    assert result["related_queries"]["IA"]["top"] == [{"query": "automatización", "value": 90}]
    assert len(_RateLimitedOnceTrendReq.instances) == 2
    assert _RateLimitedOnceTrendReq.instances[0].calls[0].name == "build_payload"
    assert _RateLimitedOnceTrendReq.instances[1].calls[0].name == "build_payload"


def test_fetch_google_trends_raises_rate_limited_after_exhausting_retries(monkeypatch):
    _reset_fake_trend_req(_AlwaysRateLimitedTrendReq)
    monkeypatch.setattr(google_trends, "TrendReq", _AlwaysRateLimitedTrendReq)
    monkeypatch.setattr(google_trends, "TooManyRequestsError", FakeTooManyRequestsError)
    monkeypatch.setattr(google_trends, "_wait_between_requests", lambda *args, **kwargs: None)

    with pytest.raises(google_trends.GoogleTrendsServiceError) as excinfo:
        google_trends.fetch_google_trends(
            keywords=["IA"],
            timeframe="today 12-m",
            geo="MX",
            source="",
            hl="es-MX",
            tz=360,
            include_region=False,
            region_resolution="REGION",
            inc_low_vol=False,
            inc_geo_code=False,
            min_sleep=0,
            max_sleep=0,
        )

    assert excinfo.value.status_code == 429
    assert str(excinfo.value) == "google_trends_rate_limited"
    assert len(_AlwaysRateLimitedTrendReq.instances) == 2
