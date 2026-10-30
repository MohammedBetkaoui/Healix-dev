import Image from "next/image";

import { cn } from "@/lib/utils";

export const HEALIX_LOGO_FULL_SRC = "/HealixDz-logo/logo_avec_titre.svg";
// Same logo with the word "Healix" in a light colour, for the navy dashboard
// chrome (the original title is dark navy and disappears on it).
export const HEALIX_LOGO_FULL_LIGHT_SRC = "/HealixDz-logo/logo_avec_titre_clair.svg";
export const HEALIX_LOGO_MARK_SRC = "/HealixDz-logo/logo.svg";

type HealixLogoProps = {
  className?: string;
  priority?: boolean;
  variant?: "full" | "mark";
  // "light": for a navy background (full variant only; the mark reads on both).
  tone?: "default" | "light";
  alt?: string;
};

/**
 * Logo principal du projet HealixDz.
 * - `full` : logo avec titre (navbar ouverte, login/register)
 * - `mark` : logo sans titre (navbar réduite / favicon)
 */
export function HealixLogo({
  className,
  priority = false,
  variant = "full",
  tone = "default",
  alt = "HealixDz",
}: HealixLogoProps) {
  if (variant === "mark") {
    return (
      <Image
        src={HEALIX_LOGO_MARK_SRC}
        alt={alt}
        width={250}
        height={150}
        priority={priority}
        className={cn("h-11 w-11 shrink-0 object-cover object-center", className)}
      />
    );
  }

  return (
    <Image
      src={tone === "light" ? HEALIX_LOGO_FULL_LIGHT_SRC : HEALIX_LOGO_FULL_SRC}
      alt={alt}
      width={150}
      height={80}
      priority={priority}
      className={cn("h-14 w-auto max-w-[16rem] shrink-0 object-contain", className)}
    />
  );
}
