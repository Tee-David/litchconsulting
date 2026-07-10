/**
 * Reverse net salary — find the gross that yields a target take-home.
 * Net is monotonically increasing in gross, so we bisect.
 */
import { computeSalary, type SalaryInput, type SalaryResult } from "./salary";

export interface ReverseSalaryResult {
  targetNetAnnual: number;
  requiredGrossAnnual: number;
  salary: SalaryResult;
}

export function netToGross(
  targetNetAnnual: number,
  opts: Omit<SalaryInput, "grossAnnual"> = {},
): ReverseSalaryResult {
  const target = Math.max(0, targetNetAnnual || 0);
  let lo = target;
  let hi = Math.max(target * 3, target + 1_000_000, 1_000_000);

  // Ensure hi produces net >= target
  for (let i = 0; i < 60 && computeSalary({ ...opts, grossAnnual: hi }).netAnnual < target; i++) {
    hi *= 2;
  }

  let gross = hi;
  for (let i = 0; i < 100; i++) {
    gross = (lo + hi) / 2;
    const net = computeSalary({ ...opts, grossAnnual: gross }).netAnnual;
    if (Math.abs(net - target) < 1) break;
    if (net < target) lo = gross;
    else hi = gross;
  }

  return {
    targetNetAnnual: target,
    requiredGrossAnnual: gross,
    salary: computeSalary({ ...opts, grossAnnual: gross }),
  };
}
