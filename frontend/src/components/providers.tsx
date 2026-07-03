"use client";

import type { PropsWithChildren } from "react";
import { ThemeProvider } from "next-themes";
import { PagePreloader } from "@/components/ui/page-preloader";
import { RouteProgress } from "@/components/ui/route-progress";
import { Toaster } from "@/components/admin/ui/toaster";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <Toaster>
        <RouteProgress />
        <PagePreloader />
        {children}
      </Toaster>
    </ThemeProvider>
  );
}
