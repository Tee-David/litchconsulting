"use client";

import { signOut } from "@/lib/auth-client";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        void signOut().then(() => {
          window.location.href = "/login";
        })
      }
      className={
        className ??
        "rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
      }
    >
      Sign out
    </button>
  );
}
