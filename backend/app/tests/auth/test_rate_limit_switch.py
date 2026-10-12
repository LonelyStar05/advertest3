from datetime import UTC, datetime

import pytest

from backend.app.auth import rate_limit


def test_enabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LOGIN_RATE_LIMIT", raising=False)
    assert rate_limit.enabled()


@pytest.mark.parametrize("value", ["false", "0", "no", " FALSE "])
def test_switch_off_never_limits(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("LOGIN_RATE_LIMIT", value)
    # Tắt thì không cần đọc DB: session None không được chạm tới.
    assert not rate_limit.is_limited(None, email="a@b.c", ip="1.2.3.4", now=datetime.now(UTC))  # type: ignore[arg-type]
