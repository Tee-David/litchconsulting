import type { ComponentType } from "react";
import {
  Banknote,
  Building2,
  Calculator,
  Coins,
  HandCoins,
  Home,
  Landmark,
  PiggyBank,
  Receipt,
  Ship,
  Stamp,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { PayeCalculator } from "./calcs/paye-calculator";
import { SalaryCalculator } from "./calcs/salary-calculator";
import { ReverseSalaryCalculator } from "./calcs/reverse-salary-calculator";
import { PensionCalculator } from "./calcs/pension-calculator";
import { VatCalculator } from "./calcs/vat-calculator";
import { WhtCalculator } from "./calcs/wht-calculator";
import { CitCalculator } from "./calcs/cit-calculator";
import { LoanCalculator } from "./calcs/loan-calculator";
import { MortgageCalculator } from "./calcs/mortgage-calculator";
import { ImportDutyCalculator } from "./calcs/import-duty-calculator";
import { CompoundInterestCalculator } from "./calcs/compound-interest-calculator";
import { StampDutyCalculator } from "./calcs/stamp-duty-calculator";

export type CalcCategory = "Tax & Payroll" | "Loans & Property" | "Trade" | "Investment";

export interface CalculatorDef {
  key: string;
  name: string;
  blurb: string;
  category: CalcCategory;
  icon: LucideIcon;
  Component: ComponentType;
}

export const CALCULATORS: CalculatorDef[] = [
  {
    key: "paye",
    name: "Personal Income Tax (PAYE)",
    blurb: "Your 2026 PAYE, reliefs and monthly take-home under the Nigeria Tax Act.",
    category: "Tax & Payroll",
    icon: Calculator,
    Component: PayeCalculator,
  },
  {
    key: "salary",
    name: "Salary Calculator",
    blurb: "Turn a gross salary into net take-home after tax and statutory deductions.",
    category: "Tax & Payroll",
    icon: Banknote,
    Component: SalaryCalculator,
  },
  {
    key: "reverse-salary",
    name: "Reverse Net Salary",
    blurb: "Work backwards from a target take-home to the gross salary you need.",
    category: "Tax & Payroll",
    icon: HandCoins,
    Component: ReverseSalaryCalculator,
  },
  {
    key: "pension",
    name: "Pension Calculator",
    blurb: "Employee & employer contributions plus a retirement-balance projection.",
    category: "Tax & Payroll",
    icon: PiggyBank,
    Component: PensionCalculator,
  },
  {
    key: "vat",
    name: "VAT Calculator",
    blurb: "Add or extract 7.5% VAT from any amount, inclusive or exclusive.",
    category: "Tax & Payroll",
    icon: Receipt,
    Component: VatCalculator,
  },
  {
    key: "wht",
    name: "Withholding Tax (WHT)",
    blurb: "Calculate WHT across 9 transaction types for corporate and individual entities.",
    category: "Tax & Payroll",
    icon: Coins,
    Component: WhtCalculator,
  },
  {
    key: "cit",
    name: "Company Income Tax (CIT)",
    blurb: "2026 CIT under the Nigeria Tax Act: small-company exemption test plus the 4% Development Levy.",
    category: "Tax & Payroll",
    icon: Building2,
    Component: CitCalculator,
  },
  {
    key: "stamp-duty",
    name: "Stamp Duty",
    blurb: "Property transfers, bank transfers, leases and insurance stamp duty.",
    category: "Tax & Payroll",
    icon: Stamp,
    Component: StampDutyCalculator,
  },
  {
    key: "loan",
    name: "Loan / EMI Calculator",
    blurb: "Monthly repayment, total interest and an amortisation preview.",
    category: "Loans & Property",
    icon: Landmark,
    Component: LoanCalculator,
  },
  {
    key: "mortgage",
    name: "Mortgage Calculator",
    blurb: "Repayments from a property price, deposit, rate and term.",
    category: "Loans & Property",
    icon: Home,
    Component: MortgageCalculator,
  },
  {
    key: "compound-interest",
    name: "Investment / Compound Interest",
    blurb: "Project future value with compounding, monthly contributions and different frequencies.",
    category: "Investment",
    icon: TrendingUp,
    Component: CompoundInterestCalculator,
  },
  {
    key: "import-duty",
    name: "Import Duty Calculator",
    blurb: "Nigeria Customs duty, levies, VAT and total landed cost from CIF.",
    category: "Trade",
    icon: Ship,
    Component: ImportDutyCalculator,
  },
];

export const CALC_CATEGORIES: CalcCategory[] = ["Tax & Payroll", "Loans & Property", "Investment", "Trade"];

export const CATEGORY_ICON: Record<CalcCategory, LucideIcon> = {
  "Tax & Payroll": Coins,
  "Loans & Property": Home,
  Investment: TrendingUp,
  Trade: Ship,
};

export function getCalculator(key: string) {
  return CALCULATORS.find((c) => c.key === key);
}
