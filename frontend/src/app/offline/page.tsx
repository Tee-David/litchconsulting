import type { Metadata } from "next";
import { FinanceOffline } from "@/components/not-found/finance-offline";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return <FinanceOffline />;
}
