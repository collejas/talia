from app.services.denue import DenueClient


def test_build_activity_segments_preserves_higher_specificity_levels() -> None:
    assert DenueClient._build_activity_segments(None) == ("0", "0", "0", "0")
    assert DenueClient._build_activity_segments("46") == ("46", "0", "0", "0")
    assert DenueClient._build_activity_segments("464") == ("46", "464", "0", "0")
    assert DenueClient._build_activity_segments("4641") == ("46", "464", "4641", "0")
    assert DenueClient._build_activity_segments("46411") == ("46", "464", "4641", "46411")
    assert DenueClient._build_activity_segments("464112") == ("46", "464", "4641", "464112")


def test_build_activity_segments_ignores_non_digits() -> None:
    assert DenueClient._build_activity_segments(" 46-41.12 ") == ("46", "464", "4641", "464112")
