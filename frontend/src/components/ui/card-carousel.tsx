"use client";

import { useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

/** Width classes that show ~3.5 cards on desktop, 2 on tablet, ~1.2 on mobile. */
export const carouselCardClass =
  "shrink-0 snap-start w-[82%] sm:w-[46%] lg:w-[calc(28.571%-0.72rem)]";

/**
 * Horizontal card carousel: native scroll-snap + pointer drag-to-scroll on
 * desktop, with prev/next arrows aligned to the section heading. Pass the
 * heading node and the cards (each should use `carouselCardClass` + data-card).
 */
export function CardCarousel({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  const scrollByCard = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-card]");
    const amount = card ? card.offsetWidth + 16 : 320;
    track.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track || e.pointerType === "touch") return;
    drag.current = { down: true, startX: e.clientX, startScroll: track.scrollLeft, moved: false };
    track.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track || !drag.current.down) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    track.scrollLeft = drag.current.startScroll - dx;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const track = trackRef.current;
    drag.current.down = false;
    track?.releasePointerCapture?.(e.pointerId);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        {heading}
        <div className="flex gap-2">
          <button
            onClick={() => scrollByCard(-1)}
            aria-label="Previous"
            className="grid size-11 place-items-center rounded-full border border-hairline bg-paper text-ink transition-colors hover:border-brand hover:text-brand"
          >
            <ArrowLeft className="size-5" />
          </button>
          <button
            onClick={() => scrollByCard(1)}
            aria-label="Next"
            className="grid size-11 place-items-center rounded-full border border-hairline bg-paper text-ink transition-colors hover:border-brand hover:text-brand"
          >
            <ArrowRight className="size-5" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        className="no-scrollbar mt-10 flex cursor-grab snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 active:cursor-grabbing"
      >
        {children}
      </div>
    </>
  );
}
