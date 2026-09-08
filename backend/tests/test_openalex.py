import httpx
import pytest

from app.services import openalex as oa


@pytest.fixture()
def clock(monkeypatch):
    state = {"now": 0.0, "sleeps": []}
    monkeypatch.setattr(oa, "_next_request", 0.0)
    monkeypatch.setattr(oa.time, "monotonic", lambda: state["now"])

    def sleep(seconds):
        state["sleeps"].append(seconds)
        state["now"] += seconds

    monkeypatch.setattr(oa.time, "sleep", sleep)
    monkeypatch.setattr(oa.settings, "request_interval", 0.35)
    return state


def test_lookup_205_ids_uses_three_requests_and_one_client(clock):
    requests = []

    def respond(request):
        requests.append(request)
        values = request.url.params["filter"].split(":", 1)[1].split("|")
        return httpx.Response(200, json={"results": [{"id": f"https://openalex.org/{v}", "title": v} for v in values]})

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        works = oa.fetch_many([f"W{i}" for i in range(205)] + ["W1"], client=client)
        assert not client.is_closed
    assert len(works) == 205
    assert len(requests) == 3
    assert all(r.url.params["per-page"] == "100" for r in requests)
    assert all("abstract_inverted_index" in r.url.params["select"] for r in requests)
    assert sum(clock["sleeps"]) >= 0.7


def test_doi_batch_normalization_and_optional_api_key(clock, monkeypatch):
    requests = []
    monkeypatch.setattr(oa.settings, "openalex_api_key", "test-key")
    with httpx.Client(transport=httpx.MockTransport(lambda request: requests.append(request) or httpx.Response(200, json={"results": []}))) as client:
        oa.fetch_many(["https://doi.org/10.1234/ABC", "doi:10.1234/abc", "10.1234/xyz"], by="doi", client=client)
    assert requests[0].url.params["filter"] == "doi:10.1234/abc|10.1234/xyz"
    assert requests[0].url.params["api_key"] == "test-key"


def test_rate_limit_retries_with_provider_delay_and_progress(clock):
    responses = [httpx.Response(429, headers={"Retry-After": "4"}), httpx.Response(200, json={"results": []})]
    updates = []
    with httpx.Client(transport=httpx.MockTransport(lambda request: responses.pop(0))) as client:
        assert oa.fetch_many(["W1"], client=client, on_retry=updates.append) == []
    assert updates == [4.0]
    assert sum(clock["sleeps"]) >= 4


def test_long_rate_limit_fails_quickly_without_violating_cooldown(clock):
    requests = []
    with httpx.Client(transport=httpx.MockTransport(lambda request: requests.append(request) or httpx.Response(429, headers={"Retry-After": "7200"}))) as client:
        with pytest.raises(oa.OpenAlexUnavailable, match="rate limited"):
            oa.fetch_many(["W1"], client=client)
        with pytest.raises(oa.OpenAlexUnavailable, match="cooling down"):
            oa.fetch_many(["W2"], client=client)
    assert len(requests) == 1
    assert clock["sleeps"] == []


def test_failed_retries_are_bounded_and_public_error_omits_credentials(clock, monkeypatch):
    calls = []
    monkeypatch.setattr(oa.settings, "openalex_api_key", "super-secret")
    with httpx.Client(transport=httpx.MockTransport(lambda request: calls.append(request) or httpx.Response(503))) as client:
        with pytest.raises(oa.OpenAlexUnavailable) as error:
            oa.fetch_many(["W1"], client=client)
    assert len(calls) == 3
    assert "super-secret" not in str(error.value)
    assert "http" not in str(error.value)


def test_page_is_available_before_later_upstream_failure(clock):
    requests = []

    def respond(request):
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(200, json={"results": [{"id": "W1", "title": "One"}], "meta": {"next_cursor": "next"}})
        return httpx.Response(503)

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        pages = oa.iter_search_works("agents", 250, per_page=200, client=client)
        assert next(pages)[0]["id"] == "W1"
        assert len(requests) == 1
        assert requests[0].url.params["per-page"] == "100"
        with pytest.raises(oa.OpenAlexUnavailable):
            next(pages)
    assert len(requests) == 4


def test_retry_after_invalid_header_uses_backoff(clock):
    assert oa._retry_seconds("not-a-date", 2) == 2
    assert oa._retry_seconds("-2", 2) == 0


def test_empty_batch_makes_no_request(clock):
    with httpx.Client(transport=httpx.MockTransport(lambda request: pytest.fail("unexpected request"))) as client:
        assert oa.fetch_many([], client=client) == []
