/**
 * Nigeria import duty engine (Nigeria Customs / ECOWAS CET).
 * Charges are computed on the CIF value. The duty rate is HS-code specific and
 * supplied by the user; the levy rates default to current Nigerian practice and
 * are editable in the UI.
 */
import {
  IMPORT_CISS_RATE,
  IMPORT_ETLS_RATE,
  IMPORT_SURCHARGE_RATE,
  IMPORT_VAT_RATE,
} from "./constants";

export interface ImportDutyInput {
  /** Cost, Insurance & Freight value (in NGN). */
  cif: number;
  /** Import duty rate for the HS code (%). */
  dutyRatePct: number;
  surchargeRate?: number;
  etlsRate?: number;
  cissRate?: number;
  vatRate?: number;
}

export interface ImportDutyLine {
  label: string;
  amount: number;
}

export interface ImportDutyResult {
  cif: number;
  lines: ImportDutyLine[];
  totalCharges: number;
  landedCost: number;
}

export function computeImportDuty(input: ImportDutyInput): ImportDutyResult {
  const cif = Math.max(0, input.cif || 0);
  const duty = cif * ((input.dutyRatePct || 0) / 100);
  const surcharge = duty * (input.surchargeRate ?? IMPORT_SURCHARGE_RATE);
  const etls = cif * (input.etlsRate ?? IMPORT_ETLS_RATE);
  const ciss = cif * (input.cissRate ?? IMPORT_CISS_RATE);
  const vat = (cif + duty + surcharge + etls + ciss) * (input.vatRate ?? IMPORT_VAT_RATE);

  const lines: ImportDutyLine[] = [
    { label: "Import duty", amount: duty },
    { label: "Port surcharge (7% of duty)", amount: surcharge },
    { label: "ETLS levy (0.5% of CIF)", amount: etls },
    { label: "CISS levy (1% of CIF)", amount: ciss },
    { label: "Import VAT (7.5%)", amount: vat },
  ];
  const totalCharges = duty + surcharge + etls + ciss + vat;

  return { cif, lines, totalCharges, landedCost: cif + totalCharges };
}
