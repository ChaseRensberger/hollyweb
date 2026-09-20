export type ThemeID = "default";
export type ColorMode = "light" | "dark" | "system";
export type ResolvedColorMode = Exclude<ColorMode, "system">;
export type Theme = {
  id: ThemeID;
  label: string;
  modes: readonly ResolvedColorMode[];
  shiki: Partial<Record<ResolvedColorMode, string>>;
};
export const themes: readonly Theme[] = [
  {
    id: "default",
    label: "Holly",
    modes: ["light", "dark"],
    shiki: { light: "github-light", dark: "github-dark" },
  },
];
export function getTheme(_id?: string | null): Theme {
  return themes[0]!;
}
export function supportsColorMode(theme: Theme, mode: ColorMode) {
  return mode === "system" || theme.modes.includes(mode);
}
export function normalizeColorMode(_theme: Theme, mode: ColorMode): ColorMode {
  return ["light", "dark", "system"].includes(mode) ? mode : "system";
}
