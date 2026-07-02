import { cn } from "@/lib/utils";

/**
 * Litch brand marks — vectorised from the official logo (plans/logo.png) and
 * recoloured to brand blue. Rendered via CSS mask + `currentColor` so the mark
 * adapts to context:
 *   tone "dark"  → brand blue on light surfaces, white in dark theme
 *   tone "light" → white (over the hero image / dark bands)
 *
 * `Logo`     = full lockup (emblem + "LITCH / CONSULTING" wordmark)
 * `LogoMark` = emblem only (ring + L + keyhole)
 */
type Tone = "dark" | "light";

function Mask({
  src,
  ratio,
  label,
  tone,
  className,
}: {
  src: string;
  ratio: number;
  label: string;
  tone: Tone;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-block shrink-0 bg-current align-middle",
        tone === "light" ? "text-white" : "text-brand dark:text-white",
        className,
      )}
      style={{
        aspectRatio: String(ratio),
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

export function Logo({ className, tone = "dark" }: { className?: string; tone?: Tone }) {
  return (
    <Mask
      src="/brand/litch-logo.svg"
      ratio={575 / 281}
      label="Litch Consulting"
      tone={tone}
      className={cn("h-8", className)}
    />
  );
}

export function LogoMark({ className, tone = "dark" }: { className?: string; tone?: Tone }) {
  return (
    <Mask
      src="/brand/litch-mark.svg"
      ratio={235 / 234}
      label="Litch Consulting"
      tone={tone}
      className={cn("size-8", className)}
    />
  );
}
