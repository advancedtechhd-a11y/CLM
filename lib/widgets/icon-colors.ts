import type { IconColor } from "./types";

/**
 * Concrete background + foreground hex pairs per `iconColor` token.
 * Matched against the HTML template's library widget icon palette.
 */
export const ICON_COLOR_STYLES: Record<
  IconColor,
  { bg: string; fg: string }
> = {
  green: { bg: "#EBF5F0", fg: "#0F6E56" },
  blue: { bg: "#E6F1FB", fg: "#185FA5" },
  purple: { bg: "#EEEDFE", fg: "#3C3489" },
  amber: { bg: "#FAEEDA", fg: "#854F0B" },
  red: { bg: "#FCEAEA", fg: "#A32D2D" },
  pink: { bg: "#FBEAF0", fg: "#993556" },
  coral: { bg: "#FAECE7", fg: "#993C1D" },
};
