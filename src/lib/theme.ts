// Theme preference: dark (default), light, or follow the OS. Persisted in
// localStorage and applied as data-theme on <html> so CSS variables switch.

export type ThemePref = "dark" | "light" | "system";

const KEY = "aeromro.theme";
const media = window.matchMedia("(prefers-color-scheme: light)");

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "system" ? v : "dark";
}

function resolve(pref: ThemePref): "dark" | "light" {
  return pref === "system" ? (media.matches ? "light" : "dark") : pref;
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  document.documentElement.dataset.theme = resolve(pref);
}

export function setThemePref(pref: ThemePref): void {
  localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

// Follow OS changes while in "system" mode.
media.addEventListener("change", () => {
  if (getThemePref() === "system") applyTheme();
});
