"""The compilers must read the same rates the site calculators use."""
from litchai.taxconfig import load_tax_config


def test_shared_config_loads_from_repo():
    cfg = load_tax_config()
    assert cfg["version"]
    assert cfg["effectiveFrom"] == "2026-01-01"


def test_nta_2025_cit_rates():
    cit = load_tax_config()["cit"]
    assert cit["standardRatePct"] == 30
    assert cit["smallCompany"]["ratePct"] == 0
    assert cit["smallCompany"]["maxTurnover"] == 100_000_000
    assert cit["smallCompany"]["maxFixedAssets"] == 250_000_000
    assert cit["developmentLevy"]["ratePct"] == 4


def test_paye_2026_bands():
    paye = load_tax_config()["paye"]
    assert len(paye["bands"]) == 6
    assert paye["bands"][0] == {"width": 800_000, "ratePct": 0, "label": "First ₦800,000"}
    assert paye["bands"][-1]["width"] is None  # open-ended top band
    assert paye["rentRelief"] == {"ratePct": 20, "cap": 500_000}
