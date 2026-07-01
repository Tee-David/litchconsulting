"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useSpring } from "framer-motion";

interface Position {
  x: number;
  y: number;
}

function CursorSVG() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={40}
      height={44}
      viewBox="0 0 50 54"
      fill="none"
      style={{ scale: 0.7 }}
    >
      <g filter="url(#litch-cursor-shadow)">
        <path
          d="M42.6817 41.1495L27.5103 6.79925C26.7269 5.02557 24.2082 5.02558 23.3927 6.79925L7.59814 41.1495C6.75833 42.9759 8.52712 44.8902 10.4125 44.1954L24.3757 39.0496C24.8829 38.8627 25.4385 38.8627 25.9422 39.0496L39.8121 44.1954C41.6849 44.8902 43.4884 42.9759 42.6817 41.1495Z"
          fill="#0a196d"
        />
        <path
          d="M43.7146 40.6933L28.5431 6.34306C27.3556 3.65428 23.5772 3.69516 22.3668 6.32755L6.57226 40.6778C5.3134 43.4156 7.97238 46.298 10.803 45.2549L24.7662 40.109C25.0221 40.0147 25.2999 40.0156 25.5494 40.1082L39.4193 45.254C42.2261 46.2953 44.9254 43.4347 43.7146 40.6933Z"
          stroke="white"
          strokeWidth={2.25}
        />
      </g>
      <defs>
        <filter
          id="litch-cursor-shadow"
          x="0"
          y="0"
          width="50"
          height="54"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity={0} result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy={2} />
          <feGaussianBlur stdDeviation={2} />
          <feColorMatrix type="matrix" values="0 0 0 0 0.04 0 0 0 0 0.1 0 0 0 0 0.43 0 0 0 0.35 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
      </defs>
    </svg>
  );
}

function isTrackablePointer(pointerType: string) {
  return pointerType !== "touch";
}

export function SmoothCursor({
  springConfig = { damping: 45, stiffness: 400, mass: 1, restDelta: 0.001 },
}: {
  springConfig?: { damping: number; stiffness: number; mass: number; restDelta: number };
} = {}) {
  const lastMousePos = useRef<Position>({ x: 0, y: 0 });
  const velocity = useRef<Position>({ x: 0, y: 0 });
  const lastUpdateTime = useRef(0);
  const previousAngle = useRef(0);
  const accumulatedRotation = useRef(0);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const cursorX = useSpring(0, springConfig);
  const cursorY = useSpring(0, springConfig);
  const rotation = useSpring(0, { ...springConfig, damping: 60, stiffness: 300 });
  const scale = useSpring(1, { ...springConfig, stiffness: 500, damping: 35 });

  useEffect(() => {
    const pointerMQ = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    const reducedMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setIsEnabled(pointerMQ.matches && !reducedMQ.matches);
    update();
    pointerMQ.addEventListener("change", update);
    reducedMQ.addEventListener("change", update);
    return () => {
      pointerMQ.removeEventListener("change", update);
      reducedMQ.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!isEnabled) return;

    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    const updateVelocity = (p: Position) => {
      const now = Date.now();
      const dt = now - lastUpdateTime.current;
      if (dt > 0) {
        velocity.current = {
          x: (p.x - lastMousePos.current.x) / dt,
          y: (p.y - lastMousePos.current.y) / dt,
        };
      }
      lastUpdateTime.current = now;
      lastMousePos.current = p;
    };

    const onMove = (e: PointerEvent) => {
      if (!isTrackablePointer(e.pointerType)) return;
      setIsVisible(true);
      const p = { x: e.clientX, y: e.clientY };
      updateVelocity(p);
      const speed = Math.hypot(velocity.current.x, velocity.current.y);
      cursorX.set(p.x);
      cursorY.set(p.y);
      if (speed > 0.1) {
        const angle = Math.atan2(velocity.current.y, velocity.current.x) * (180 / Math.PI) + 90;
        let diff = angle - previousAngle.current;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        accumulatedRotation.current += diff;
        rotation.set(accumulatedRotation.current);
        previousAngle.current = angle;
        scale.set(0.95);
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => scale.set(1), 150);
      }
    };

    let rafId = 0;
    let latest: PointerEvent | null = null;
    const throttled = (e: PointerEvent) => {
      if (!isTrackablePointer(e.pointerType)) return;
      latest = e;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        if (latest) onMove(latest);
        rafId = 0;
      });
    };

    document.body.classList.add("smooth-cursor");
    window.addEventListener("pointermove", throttled, { passive: true });
    return () => {
      window.removeEventListener("pointermove", throttled);
      document.body.classList.remove("smooth-cursor");
      if (rafId) cancelAnimationFrame(rafId);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [cursorX, cursorY, rotation, scale, isEnabled]);

  if (!isEnabled) return null;

  return (
    <motion.div
      style={{
        position: "fixed",
        left: cursorX,
        top: cursorY,
        translateX: "-50%",
        translateY: "-50%",
        rotate: rotation,
        scale,
        zIndex: 2147483647,
        pointerEvents: "none",
        willChange: "transform",
        opacity: isVisible ? 1 : 0,
      }}
      initial={false}
      animate={{ opacity: isVisible ? 1 : 0 }}
      transition={{ duration: 0.15 }}
    >
      <CursorSVG />
    </motion.div>
  );
}

/** Mounts the smooth cursor on desktop. Touch/reduced-motion devices are unaffected. */
export function SmoothCursorMount() {
  return <SmoothCursor />;
}
