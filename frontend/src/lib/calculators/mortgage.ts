/** Mortgage engine — wraps the loan engine with property price + down payment. */
import { computeLoan, type LoanResult } from "./loan";

export interface MortgageInput {
  price: number;
  downPaymentPct: number;
  annualRatePct: number;
  years: number;
}

export interface MortgageResult extends LoanResult {
  price: number;
  downPayment: number;
  loanAmount: number;
}

export function computeMortgage(input: MortgageInput): MortgageResult {
  const price = Math.max(0, input.price || 0);
  const downPayment = price * Math.min(1, Math.max(0, (input.downPaymentPct || 0) / 100));
  const loanAmount = Math.max(0, price - downPayment);
  const loan = computeLoan({
    principal: loanAmount,
    annualRatePct: input.annualRatePct,
    months: Math.max(1, Math.round((input.years || 0) * 12)),
  });
  return { ...loan, price, downPayment, loanAmount };
}
