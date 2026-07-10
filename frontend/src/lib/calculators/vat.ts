/** VAT engine — Nigeria 7.5% (rate is editable). */

export interface VatInput {
  amount: number;
  ratePct: number;
  /** The amount already includes VAT. */
  inclusive?: boolean;
}

export interface VatResult {
  net: number;
  vat: number;
  gross: number;
  ratePct: number;
}

export function computeVat(input: VatInput): VatResult {
  const amount = Math.max(0, input.amount || 0);
  const r = (input.ratePct || 0) / 100;
  const net = input.inclusive ? amount / (1 + r) : amount;
  const vat = net * r;
  return { net, vat, gross: net + vat, ratePct: input.ratePct || 0 };
}
