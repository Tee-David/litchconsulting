/** Loan / EMI engine — amortised equal monthly instalments. */

export interface LoanInput {
  principal: number;
  annualRatePct: number;
  months: number;
}

export interface LoanResult {
  principal: number;
  monthlyPayment: number;
  totalPayable: number;
  totalInterest: number;
  months: number;
}

export function computeLoan(input: LoanInput): LoanResult {
  const principal = Math.max(0, input.principal || 0);
  const months = Math.max(1, Math.round(input.months || 1));
  const r = (input.annualRatePct || 0) / 100 / 12;
  const monthlyPayment =
    r === 0 ? principal / months : (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  const totalPayable = monthlyPayment * months;
  return {
    principal,
    monthlyPayment,
    totalPayable,
    totalInterest: totalPayable - principal,
    months,
  };
}

export interface AmortRow {
  month: number;
  interest: number;
  principal: number;
  balance: number;
}

/** First `limit` rows of the amortisation schedule (for a preview table). */
export function amortization(input: LoanInput, limit = 12): AmortRow[] {
  const { monthlyPayment, months } = computeLoan(input);
  const r = (input.annualRatePct || 0) / 100 / 12;
  let balance = Math.max(0, input.principal || 0);
  const rows: AmortRow[] = [];
  for (let m = 1; m <= Math.min(months, limit); m++) {
    const interest = balance * r;
    const principalPaid = monthlyPayment - interest;
    balance = Math.max(0, balance - principalPaid);
    rows.push({ month: m, interest, principal: principalPaid, balance });
  }
  return rows;
}
