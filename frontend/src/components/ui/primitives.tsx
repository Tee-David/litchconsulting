"use client";

import { motion, useInView, type Variants } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */
type ButtonProps = {
  href?: string;
  children: ReactNode;
  variant?: "primary" | "outline" | "ghost" | "light";
  withArrow?: boolean;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
};

export function Button({
  href,
  children,
  variant = "primary",
  withArrow = false,
  className,
  onClick,
  type = "button",
}: ButtonProps) {
  const base =
    "group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 py-3 text-sm font-medium transition-all duration-300 focus-visible:outline-none active:scale-[0.98]";
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-hover hover:shadow-lg hover:shadow-brand/25",
    outline: "border border-hairline bg-paper text-ink hover:bg-brand hover:text-white hover:border-brand",
    ghost: "text-ink hover:text-brand",
    light: "border border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white hover:text-brand",
  }[variant];

  const content = (
    <>
      {children}
      {withArrow && (
        <ArrowRight className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-1.5" />
      )}
    </>
  );

  if (href) {
    return (
      <a href={href} className={cn(base, styles, className)} onClick={onClick}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} className={cn(base, styles, className)} onClick={onClick}>
      {content}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Eyebrow / Badge                                                            */
/* -------------------------------------------------------------------------- */
export function Eyebrow({
  children,
  className,
  tone = "light",
}: {
  children: ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-semibold uppercase tracking-[0.16em]",
        tone === "light" ? "text-brand dark:text-highlight" : "text-highlight",
        className
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Section heading                                                            */
/* -------------------------------------------------------------------------- */
export function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left",
  tone = "light",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  body?: string;
  align?: "left" | "center";
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center mx-auto max-w-2xl" : "max-w-2xl",
        className
      )}
    >
      {eyebrow && (
        <Reveal>
          <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
        </Reveal>
      )}
      <Reveal delay={0.05}>
        <h2
          className={cn(
            "font-display text-[1.9rem] font-bold leading-[1.12] tracking-tight text-pretty sm:text-4xl sm:text-balance md:text-[2.75rem]",
            tone === "dark" ? "text-white" : "text-ink"
          )}
        >
          {title}
        </h2>
      </Reveal>
      {body && (
        <Reveal delay={0.1}>
          <p className={cn("text-base leading-relaxed text-pretty", tone === "dark" ? "text-white/70" : "text-body")}>
            {body}
          </p>
        </Reveal>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reveal (scroll-in animation, reduced-motion aware via framer)              */
/* -------------------------------------------------------------------------- */
const revealVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={revealVariants}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section wrapper                                                            */
/* -------------------------------------------------------------------------- */
export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("py-20 md:py-28", className)}>
      <div className="container-page">{children}</div>
    </section>
  );
}
