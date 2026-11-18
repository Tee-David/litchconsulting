"""DeepSeek leads once its key is set; any OpenAI-compatible provider joins from env;
a chosen model goes first for its conversation."""
from __future__ import annotations

from litchai.ai.router import ProviderRouter, default_specs


def _names(env):
    return [s.name for s in default_specs(env)]


def test_groq_leads_until_deepseek_has_a_key():
    assert _names({"GROQ_API_KEY": "g"})[0] == "groq"
    assert "deepseek" not in _names({"GROQ_API_KEY": "g"})
    assert _names({"GROQ_API_KEY": "g", "DEEPSEEK_API_KEY": "d"})[:2] == ["deepseek", "groq"]


def test_the_firm_default_and_extra_providers_come_from_env():
    env = {"GROQ_API_KEY": "g", "DEEPSEEK_API_KEY": "d", "LITCHAI_DEFAULT_PROVIDER": "groq",
           "LITCHAI_EXTRA_PROVIDERS": "acme", "LITCHAI_EXTRA_ACME_URL": "https://x.test/v1",
           "LITCHAI_EXTRA_ACME_MODEL": "m1", "LITCHAI_EXTRA_ACME_KEY": "k"}
    names = _names(env)
    assert names[0] == "groq" and "deepseek" in names and "acme" in names


def test_a_chosen_model_goes_first_for_its_conversation():
    r = ProviderRouter(default_specs({"GROQ_API_KEY": "g", "DEEPSEEK_API_KEY": "d"}))
    r.pin("wb-1", "groq")
    assert r.pick("wb-1").name == "groq"
    assert r.pick("wb-2").name == "deepseek"
