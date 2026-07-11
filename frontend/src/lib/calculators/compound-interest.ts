/** Compound interest / investment calculator. */

export interface CompoundInput {
  principal: number;
  /** Annual interest rate in percent. */
  ratePct: number;
  /** Number of years. */
  years: number;
  /** Monthly contribution. */
  monthlyAdd: number;
  /** Compounding frequency per year. */
  compounds: 1 | 2 | 4 | 12 | 365;
}

export interface CompoundResult {
  principal: number;
  totalContributions: number;
  totalInterest: number;
  futureValue: number;
  yearByYear: { year: number; balance: number; interest: number; contributions: number }[];
}

export function computeCompound(input: CompoundInput): CompoundResult {
  const P = Math.max(0, input.principal || 0);
  const r = Math.max(0, (input.ratePct || 0)) / 100;
  const t = Math.max(0, input.years || 0);
  const n = input.compounds || 12;
  const m = Math.max(0, input.monthlyAdd || 0);

  let balance = P;
  let totalContributions = P;
  let totalInterest = 0;
  const yearByYear: CompoundResult["yearByYear"] = [];

  for (let yr = 1; yr <= t; yr++) {
    const startBalance = balance;
    // Compound each period in the year
    const periodsPerYear = n;
    const monthlyPeriods = 12 / periodsPerYear;

    for (let p = 0; p < periodsPerYear; p++) {
      const interest = balance * (r / periodsPerYear);
      balance += interest;
      totalInterest += interest;
      // Add monthly contributions for each month in this period
      const monthsInPeriod = monthlyPeriods;
      balance += m * monthsInPeriod;
      totalContributions += m * monthsInPeriod;
    }

    yearByYear.push({
      year: yr,
      balance,
      interest: totalInterest,
      contributions: totalContributions,
    });
  }

  return {
    principal: P,
    totalContributions,
    totalInterest,
    futureValue: balance,
    yearByYear,
  };
}
