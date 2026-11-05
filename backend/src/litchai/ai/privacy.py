"""Privacy masking for cloud model calls (Phase 3.4).

Rule: a cloud model only ever sees the schema, totals and *masked* sample rows.
Names, account numbers, TINs, BVNs, emails and phone numbers become stable
tokens (``[NAME_1]``, ``[ACCT_2]`` …) before a payload leaves the VM, and the
model's answer is unmasked on the way back. The token → original map lives only
in this process (and in the conversation row on the VM) — it is never sent.

Masking is deliberately conservative about numbers: a bare 10-digit run is only
treated as an account number when an account keyword sits just before it, so
amounts like ``1500000000`` survive. Column-aware masking (:meth:`Masker.mask_rows`)
masks a whole column when its header says it holds names / accounts / TINs.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# Order matters: emails before phones (an email can hold digits), TIN before
# account numbers (a TIN "12345678-0001" contains an 8-digit run).
_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE = re.compile(r"(?<![\d.])(?:\+?234[\s-]?|0)[789][01]\d(?:[\s-]?\d){7}(?![\d.])")
_TIN = re.compile(r"\b\d{8}-\d{4}\b|(?i:\bTIN[:\s#]*)(\d{8,14})\b")
_ACCT_CTX = re.compile(
    r"(?i:\b(?:a/c|acct|account|acc(?:ount)?\s*no\.?|nuban|bvn)\b[^\d\n]{0,20})(\d{10,11})\b"
)
_HONORIFIC = re.compile(
    r"\b(?:Mr|Mrs|Ms|Miss|Dr|Chief|Alhaji|Alhaja|Engr|Prof|Barr|Pastor|Hon)\.?\s+"
    r"(?:[A-Z][a-zA-Z'-]+)(?:\s+[A-Z][a-zA-Z'-]+){0,2}"
)
# Bank narrations: "TRF FROM JOHN ADEBAYO OKAFOR/…", "TRANSFER TO ADA NWOSU".
_NARRATION_PARTY = re.compile(
    r"(?i:\b(?:trf|transfer|nip|payment|pymt|pmt)\s+(?:from|to|frm)\s+)"
    r"([A-Z][A-Z'-]+(?:\s+[A-Z][A-Z'-]+){1,3})"
)

_SENSITIVE_HEADERS: dict[str, tuple[str, ...]] = {
    "NAME": ("name", "payee", "beneficiary", "customer", "vendor", "supplier", "employee",
             "staff", "counterparty", "client"),
    "ACCT": ("account no", "account number", "acct", "a/c", "nuban", "bvn", "iban"),
    "TIN": ("tin", "tax id", "tax identification"),
    "EMAIL": ("email", "e-mail"),
    "PHONE": ("phone", "mobile", "tel", "gsm"),
}

TOKEN_RE = re.compile(r"\[(NAME|ACCT|TIN|EMAIL|PHONE)_(\d+)\]")


def header_kind(header: str) -> str | None:
    """Which sensitive kind (if any) a column header announces."""
    h = header.strip().lower()
    if not h:
        return None
    # Account-ish headers first: "account name" is a name, "account no" an account.
    for kind in ("ACCT", "TIN", "EMAIL", "PHONE", "NAME"):
        for hint in _SENSITIVE_HEADERS[kind]:
            if hint == "tin":
                if re.search(r"\btin\b", h):
                    return kind
            elif hint in h:
                if kind == "ACCT" and "name" in h:
                    return "NAME"
                return kind
    return None


@dataclass
class Masker:
    """Reversible, stable tokeniser. One instance per conversation so the same
    name always maps to the same token across turns."""

    known_names: set[str] = field(default_factory=set)
    _forward: dict[tuple[str, str], str] = field(default_factory=dict)
    _reverse: dict[str, str] = field(default_factory=dict)
    _counts: dict[str, int] = field(default_factory=dict)

    # --- tokens ---------------------------------------------------------
    def token_for(self, kind: str, original: str) -> str:
        key = (kind, original.strip())
        tok = self._forward.get(key)
        if tok is None:
            n = self._counts.get(kind, 0) + 1
            self._counts[kind] = n
            tok = f"[{kind}_{n}]"
            self._forward[key] = tok
            self._reverse[tok] = original.strip()
        return tok

    def register_names(self, names: list[str] | set[str]) -> None:
        """Names known up front (client name, counterparties from the ledger)."""
        for n in names:
            n = (n or "").strip()
            if len(n) >= 3:
                self.known_names.add(n)

    @property
    def mapping(self) -> dict[str, str]:
        """token → original. VM-only; never serialise this into a prompt."""
        return dict(self._reverse)

    def to_state(self) -> dict:
        return {"known_names": sorted(self.known_names), "reverse": self._reverse}

    @classmethod
    def from_state(cls, state: dict | None) -> Masker:
        m = cls()
        if not state:
            return m
        m.register_names(state.get("known_names", []))
        for tok, original in (state.get("reverse") or {}).items():
            mt = TOKEN_RE.fullmatch(tok)
            if not mt:
                continue
            kind, n = mt.group(1), int(mt.group(2))
            m._forward[(kind, original)] = tok
            m._reverse[tok] = original
            m._counts[kind] = max(m._counts.get(kind, 0), n)
        return m

    # --- masking ----------------------------------------------------------
    def mask(self, text: str) -> str:
        if not text:
            return text
        out = _EMAIL.sub(lambda m: self.token_for("EMAIL", m.group(0)), text)
        out = _TIN.sub(self._tin_sub, out)
        out = _ACCT_CTX.sub(
            lambda m: m.group(0)[: m.start(1) - m.start(0)] + self.token_for("ACCT", m.group(1)),
            out,
        )
        out = _PHONE.sub(lambda m: self.token_for("PHONE", m.group(0)), out)
        # Known names, longest first so "Ada Nwosu Ltd" wins over "Ada Nwosu".
        for name in sorted(self.known_names, key=len, reverse=True):
            pattern = re.compile(re.escape(name), re.IGNORECASE)
            out = pattern.sub(lambda m, n=name: self.token_for("NAME", n), out)
        out = _HONORIFIC.sub(lambda m: self.token_for("NAME", m.group(0)), out)
        out = _NARRATION_PARTY.sub(
            lambda m: m.group(0)[: m.start(1) - m.start(0)] + self.token_for("NAME", m.group(1)),
            out,
        )
        return out

    def _tin_sub(self, m: re.Match) -> str:
        if m.group(1):  # "TIN: 1234567890" — keep the label, mask the digits
            return m.group(0)[: m.start(1) - m.start(0)] + self.token_for("TIN", m.group(1))
        return self.token_for("TIN", m.group(0))

    def mask_value(self, value: object, kind: str | None) -> object:
        if value is None:
            return None
        if kind is not None and str(value).strip():
            return self.token_for(kind, str(value))
        if isinstance(value, str):
            return self.mask(value)
        return value  # numbers / dates pass through — totals are not personal data

    def mask_rows(self, headers: list[str], rows: list[list[object]]) -> list[list[object]]:
        kinds = [header_kind(str(h or "")) for h in headers]
        return [
            [self.mask_value(v, kinds[i] if i < len(kinds) else None) for i, v in enumerate(row)]
            for row in rows
        ]

    def unmask(self, text: str) -> str:
        if not text or "[" not in text:
            return text
        return TOKEN_RE.sub(lambda m: self._reverse.get(m.group(0), m.group(0)), text)

    def unmask_obj(self, obj: object) -> object:
        """Unmask every string inside a parsed JSON structure."""
        if isinstance(obj, str):
            return self.unmask(obj)
        if isinstance(obj, list):
            return [self.unmask_obj(x) for x in obj]
        if isinstance(obj, dict):
            return {k: self.unmask_obj(v) for k, v in obj.items()}
        return obj


def contains_unmasked_pii(text: str) -> bool:
    """Belt-and-braces check used by tests and the router's cloud gate."""
    return bool(_EMAIL.search(text) or _PHONE.search(text) or _ACCT_CTX.search(text))
