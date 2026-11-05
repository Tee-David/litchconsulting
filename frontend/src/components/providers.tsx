"use client";

import { useEffect, type PropsWithChildren } from "react";
import { ThemeProvider } from "next-themes";
import { PagePreloader } from "@/components/ui/page-preloader";
import { RouteProgress } from "@/components/ui/route-progress";
import { Toaster } from "@/components/admin/ui/toaster";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { ConsentBanner } from "@/components/consent/consent-banner";

export function Providers({ children }: PropsWithChildren) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Toaster>
        <ConfirmProvider>
          <RouteProgress />
          <PagePreloader />
          {children}
          <ConsentBanner />
        </ConfirmProvider>
      </Toaster>
    </ThemeProvider>
  );
}
