"""Daily DeepSeek spending cap from the real balance; the balance is never shown."""
from __future__ import annotations

from litchai.ai.budget import MemorySettings, SpendCap
from litchai.ai.router import ProviderRouter, default_specs


def _cap(balances):
    it = iter(balances)
    return SpendCap(base_url="https://x/v1", api_key="k", settings=MemorySettings(),
                    fetch=lambda *_: next(it), clock=iter(range(0, 10_000, 100)).__next__)


def test_spend_is_start_of_day_minus_now_and_the_cap_skips_deepseek():
    cap = _cap([20.0, 19.5, 18.9])
    assert cap.status()["spent_today"] == 0
    assert cap.status()["spent_today"] == 0.5
    r = ProviderRouter(default_specs({"GROQ_API_KEY": "g", "DEEPSEEK_API_KEY": "d"}))
    r.spend_cap = cap  # third reading: 1.1 spent, over the 1.00 default
    assert r._available(next(s for s in r.specs if s.name == "deepseek")) == (False, "budget")
    assert r._available(next(s for s in r.specs if s.name == "groq"))[0]


def test_top_up_resets_the_start_and_the_app_never_sees_the_balance():
    cap = _cap([5.0, 25.0, 24.8])
    cap.status()
    assert cap.status()["spent_today"] == 0  # a top-up is not negative spend
    pub = cap.public()
    assert "balance" not in pub and pub["spent_today"] == 0.2 and pub["cap"] == 1.0
    assert pub["credit_used_pct"] == 0.8  # 0.2 of the 25.00 after the top-up
    cap.set_cap(3)
    assert cap.cap() == 3.0
