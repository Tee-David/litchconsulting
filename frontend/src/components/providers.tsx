"use client";

import type { PropsWithChildren } from "react";
import { ThemeProvider } from "next-themes";
import { PagePreloader } from "@/components/ui/page-preloader";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PagePreloader />
      {children}
    </ThemeProvider>
  );
}
