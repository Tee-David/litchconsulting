"""Seeding + eval benchmark + learning reports (Phase 3)."""
import io

from openpyxl import Workbook

from litchai.categorize.eval import LabeledItem, evaluate
from litchai.categorize.memory_store import InMemoryStore, MemoryRecord
from litchai.categorize.reports import fallback_rate, rung_hit_rates
from litchai.embeddings import FakeEmbedder
from litchai.seed import (
    embed_records,
    load_synonyms,
    mine_history_xlsx,
    synonym_records,
    taxonomy_rows,
)
from litchai.taxonomy import SUSPENSE_CODE, load_taxonomy

TAXO = load_taxonomy()


# --- seeding ---------------------------------------------------------------


def test_taxonomy_rows_cover_all_categories():
    rows = taxonomy_rows(TAXO)
    assert len(rows) == len(TAXO.categories)
    assert any(r["code"] == SUSPENSE_CODE and r["postable"] for r in rows)
    assert all(r["taxonomy_version"] == TAXO.version for r in rows)


def test_load_synonyms_skips_comment():
    data = load_synonyms()
    assert "_comment" not in data
    assert "bank.charges" in data


def test_synonym_records_normalizes_and_flags_unknown_codes():
    data = {"bank.charges": ["COT CHARGE 12345"], "not.a.real.code": ["whatever"]}
    records, unknown = synonym_records(data, TAXO)
    assert unknown == ["not.a.real.code"]
    assert all(r.source == "seed_template" for r in records)
    assert all(r.normalized_text and r.normalized_text == r.normalized_text.lower() for r in records)
    assert records[0].category_code == "bank.charges"


def test_full_synonyms_file_all_map():
    records, unknown = synonym_records(load_synonyms(), TAXO)
    assert unknown == []            # every curated code is a real postable leaf
    assert len(records) > 30


def test_mine_history_xlsx_maps_codes_and_labels():
    label, label_code = next(iter(TAXO.template_label_index().items()))
    wb = Workbook()
    ws = wb.active
    ws.append(["Description", "Category"])
    ws.append(["MTN AIRTIME PURCHASE", "admin.it_comm"])   # by code
    ws.append(["SOME LINE", label])                         # by template label
    ws.append(["MYSTERY ROW", "Totally Unknown Label"])     # unmapped
    buf = io.BytesIO()
    wb.save(buf)

    records, unmapped = mine_history_xlsx(buf.getvalue(), TAXO)
    codes = {r.category_code for r in records}
    assert "admin.it_comm" in codes
    assert label_code in codes
    assert unmapped == ["Totally Unknown Label"]
    assert all(r.source == "seed_history" for r in records)


def test_embed_records_attaches_vectors():
    records, _ = synonym_records({"bank.charges": ["COT CHARGE"]}, TAXO)
    embedded = embed_records(records, FakeEmbedder())
    assert embedded[0].embedding is not None
    assert embedded[0].embedding_model == "fake-embed"


# --- eval benchmark --------------------------------------------------------


def test_evaluate_reports_accuracy_and_fallback():
    store = InMemoryStore()
    for text, code in [("cot charge", "bank.charges"), ("salary payment", "admin.staff_salaries")]:
        store.add(MemoryRecord(id=0, normalized_text=text, category_code=code, source="seed_template"))

    items = [
        LabeledItem("cot charge", "bank.charges"),
        LabeledItem("salary payment", "admin.staff_salaries"),
        LabeledItem("mystery vendor xyz", "revenue.goods"),  # unresolved -> suspense (wrong)
    ]
    report = evaluate(items, store=store, taxonomy=TAXO)
    assert report.total == 3
    assert report.correct == 2
    assert abs(report.accuracy - 2 / 3) < 1e-9
    assert report.per_rung[1].correct == 2
    assert abs(report.fallback_rate - 1 / 3) < 1e-9   # one unresolved
    assert ("revenue.goods", SUSPENSE_CODE, 1) in report.confusions


# --- learning reports ------------------------------------------------------


def test_rung_hit_rates_and_fallback():
    events = [
        {"rung": 1, "accepted": True, "line_item_id": 1},
        {"rung": 2, "accepted": False, "line_item_id": 2},
        {"rung": 4, "accepted": True, "line_item_id": 2},
    ]
    rates = {r.rung: r for r in rung_hit_rates(events)}
    assert rates[1].hit_rate == 1.0
    assert rates[2].hit_rate == 0.0
    assert fallback_rate(events) == 0.5   # item 2 reached rung 4
