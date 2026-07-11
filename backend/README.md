# LitchAI backend

Deterministic financial-template compiler pipeline. The spec is
[plans/prd.md](../plans/prd.md); progress is tracked in
[plans/checklist.md](../plans/checklist.md).

Core rule (PRD §3): **no generative step ever touches a formula.** Compilers
are hand-written Python producing .xlsx files whose every computed cell is an
Excel formula; a headless-LibreOffice recompute plus golden fixtures gate every
file before human review.

Nigerian tax rates come from the shared config at
`frontend/src/lib/tax/nigeria-tax-config.json` — the same file the site
calculators use. Never hardcode a rate here.

## Setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

## Tests

```bash
.venv/bin/pytest
```

The recompute tests require LibreOffice (`soffice`) on PATH.

## Layout

- `src/litchai/taxconfig.py` — loads the shared tax config from the repo checkout
- `src/litchai/contracts/` — fixed structured-input schemas, one per template (PRD step 5)
- `src/litchai/compilers/` — hand-written template compilers (PRD step 6)
- `src/litchai/validation/` — LibreOffice recompute gate (PRD step 7)
- `fixtures/synthetic/` — golden fixtures for automated tests
- `fixtures/real/` — anonymized client samples (gitignored, never committed)
