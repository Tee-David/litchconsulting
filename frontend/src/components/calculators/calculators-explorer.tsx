"use client";

import { useState } from "react";
import { CalculatorHub } from "./calculator-hub";
import { CalculatorShell } from "./calculator-shell";

/** Full-page hub → calculator (used by the public /calculators route). */
export function CalculatorsExplorer() {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className="rounded-2xl border border-hairline bg-cloud p-5 md:p-7">
      {active ? (
        <CalculatorShell calcKey={active} onBack={() => setActive(null)} />
      ) : (
        <CalculatorHub onSelect={setActive} />
      )}
    </div>
  );
}
