"""Re-export of the shared workbench fixtures (they live in the package so the
eval runner works on the VM without the tests tree)."""
from litchai.evals.fixtures import (  # noqa: F401
    BANK,
    CATEGORY_RULES,
    GOLDEN,
    LEDGER,
    OPENING,
    ledger_bank_xlsx,
    payroll_xlsx,
    scripted_categoriser,
    trial_balance_xlsx,
)
