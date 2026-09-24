import Image from "next/image";

import { cn } from "@/lib/utils";

export const HEALIX_LOGO_FULL_SRC = "/HealixDz-logo/logo_avec_titre.svg";
export const HEALIX_LOGO_MARK_SRC = "/HealixDz-logo/logo.svg";

type HealixLogoProps = {
  className?: string;
  priority?: boolean;
  variant?: "full" | "mark";
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
      src={HEALIX_LOGO_FULL_SRC}
      alt={alt}
      width={150}
      height={80}
      priority={priority}
      className={cn("h-14 w-auto max-w-[16rem] shrink-0 object-contain", className)}
    />
  );
}
