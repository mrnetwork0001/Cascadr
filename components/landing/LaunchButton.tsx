import Link from "next/link";
import { Chevron } from "@/components/landing/sections/ui";

/**
 * Primary call to action, in the template's CTA form: a dark navy pill with a
 * white label and a round knob holding a chevron. The glass variant is the
 * secondary form (frosted pill, navy knob). Lifts 2px on hover unless the
 * visitor asked for reduced motion.
 */
export function LaunchButton({
  children = "Launch terminal",
  size = "md",
  variant = "primary",
  href = "/terminal",
  className = "",
}: {
  children?: React.ReactNode;
  size?: "sm" | "md";
  variant?: "primary" | "glass";
  href?: string;
  className?: string;
}) {
  const box =
    size === "sm"
      ? "h-12 gap-4 pl-[22px] pr-[6px] text-[15px]"
      : "h-[60px] gap-6 pl-[30px] pr-[7px] text-[16.5px] md:h-[64px] md:pl-8 md:pr-[8px] md:text-[17.5px]";
  const knob = size === "sm" ? "h-9 w-9" : "h-[46px] w-[46px] md:h-[48px] md:w-[48px]";
  const primary = variant === "primary";

  return (
    <Link
      href={href}
      className={`group inline-flex shrink-0 select-none items-center justify-between whitespace-nowrap rounded-full font-[400] leading-none tracking-[-0.035em] motion-safe:transition-[transform,box-shadow] motion-safe:duration-[350ms] motion-safe:ease-[cubic-bezier(.2,.7,.3,1)] motion-safe:hover:-translate-y-0.5 ${box} ${
        primary
          ? "bg-cta text-white shadow-[0_10px_24px_rgba(11,26,50,0.18)] hover:shadow-[0_14px_30px_rgba(11,26,50,0.22)]"
          : "border border-white/60 bg-white/[0.36] text-[#1B2A44] shadow-[0_0_0_1.2px_rgba(120,145,180,0.14),inset_1px_1px_0_rgba(255,255,255,0.5),0_8px_22px_rgba(28,52,92,0.05)]"
      } ${className}`}
      style={primary ? undefined : { WebkitBackdropFilter: "blur(40px)", backdropFilter: "blur(40px)" }}
    >
      <span>{children}</span>
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-full ${knob} ${primary ? "bg-cta-knob" : "bg-[#1A2B45]"}`}
      >
        <span className="flex motion-safe:transition-transform motion-safe:duration-[350ms] motion-safe:ease-[cubic-bezier(.16,1,.3,1)] motion-safe:group-hover:translate-x-[2px]">
          <Chevron size={size === "sm" ? 14 : 17} />
        </span>
      </span>
    </Link>
  );
}
