/**
 * Stamp Duty calculator — Nigeria.
 * Rates per Stamp Duties Act / FIRS guidelines:
 * - Bank receipts ≥ ₦10,000: flat ₦50 per transaction
 * - Property/deed of assignment: 1.5% of consideration
 * - Lease/tenancy agreements: various flat rates
 * - Insurance policies: varies by type
 *
 * This calculator covers the two most common scenarios:
 * property transfers and electronic transfers.
 */

export type StampDutyType = "property" | "transfer" | "lease" | "insurance";

export const STAMP_DUTY_INFO: Record<StampDutyType, { label: string; description: string }> = {
  property:  { label: "Property / deed transfer", description: "1.5% of the property value or consideration" },
  transfer:  { label: "Electronic bank transfer",  description: "₦50 flat charge on transfers ≥ ₦10,000" },
  lease:     { label: "Lease / tenancy agreement",  description: "Rate depends on lease duration" },
  insurance: { label: "Insurance policy",           description: "Varies by policy type and premium" },
};

export interface StampDutyInput {
  amount: number;
  type: StampDutyType;
  /** Lease years (only for lease type). */
  leaseYears?: number;
}

export interface StampDutyResult {
  amount: number;
  duty: number;
  netPayable: number;
  typeLabel: string;
  rateDescription: string;
}

export function computeStampDuty(input: StampDutyInput): StampDutyResult {
  const amount = Math.max(0, input.amount || 0);
  const info = STAMP_DUTY_INFO[input.type];
  let duty: number;

  switch (input.type) {
    case "property":
      duty = amount * 0.015;
      break;
    case "transfer":
      duty = amount >= 10_000 ? 50 : 0;
      break;
    case "lease": {
      const years = input.leaseYears ?? 1;
      if (years <= 7) duty = amount * 0.0075;
      else if (years <= 21) duty = amount * 0.01;
      else duty = amount * 0.015;
      break;
    }
    case "insurance":
      duty = amount * 0.005; // 0.5% of premium
      break;
    default:
      duty = 0;
  }

  return {
    amount,
    duty,
    netPayable: amount + duty,
    typeLabel: info.label,
    rateDescription: info.description,
  };
}
