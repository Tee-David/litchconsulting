"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface OrbitingCirclesProps {
  children: ReactNode;
  /** Reverse the spin direction. */
  reverse?: boolean;
  /** Seconds for one full revolution. */
  duration?: number;
  /** Orbit radius in px. */
  radius?: number;
  /** Icon box size in px. */
  iconSize?: number;
  /** Draw the faint orbit ring. */
  path?: boolean;
  className?: string;
}

/**
 * Icons are placed statically around a circle (so they never collapse to the
 * centre, even with reduced motion); the whole ring then spins, while each icon
 * counter-spins to stay upright. Wrap in a `relative` square container.
 */
export function OrbitingCircles({
  children,
  reverse = false,
  duration = 40,
  radius = 160,
  iconSize = 40,
  path = true,
  className,
}: OrbitingCirclesProps) {
  const items = Array.isArray(children) ? children : [children];
  const count = items.length || 1;

  return (
    <div
      className={cn("absolute inset-0", reverse ? "animate-orbit-reverse" : "animate-orbit-spin", className)}
      style={{ "--orbit-duration": `${duration}s` } as CSSProperties}
    >
      {path && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10"
          style={{ width: radius * 2, height: radius * 2 }}
        />
      )}
      {items.map((child, i) => {
        const angle = (360 / count) * i;
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{
              width: iconSize,
              height: iconSize,
              // place at angle around the circle, then keep the box upright
              transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px) rotate(${-angle}deg)`,
            }}
          >
            {/* counter-spin so the icon stays upright while the ring rotates */}
            <div className={cn("size-full", reverse ? "animate-orbit-spin" : "animate-orbit-reverse")}>
              {child}
            </div>
          </div>
        );
      })}
    </div>
  );
}
