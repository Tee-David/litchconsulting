"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/kit";

/** A Segmented control whose value lives in the URL (`?<param>=`), so the RSC page re-queries. */
export function UrlSegmented<V extends string>({
  param,
  value,
  options,
  label,
}: {
  param: string;
  value: V;
  options: Array<{ value: V; label: string }>;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <div aria-busy={pending} className={pending ? "opacity-70" : undefined}>
      <Segmented
        label={label}
        value={value}
        options={options}
        onChange={(v) => {
          const next = new URLSearchParams(params.toString());
          next.set(param, v);
          start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
        }}
      />
    </div>
  );
}
