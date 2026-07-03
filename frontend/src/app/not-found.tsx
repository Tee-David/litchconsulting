import type { Metadata } from "next";
import { Finance404 } from "@/components/not-found/finance-404";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <Finance404 />;
}
