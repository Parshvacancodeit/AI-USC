"use client";
// P1. Light/dark theme stored per device; <html data-theme> drives the CSS tokens.
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "ripple-theme";

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#f2f2f7" : "#0a0a0c");
  try {
    localStorage.setItem(KEY, t);
  } catch {}
  window.dispatchEvent(new CustomEvent("ripple:theme", { detail: t }));
}

export function useTheme(): Theme {
  const [t, setT] = useState<Theme>("dark");
  useEffect(() => {
    setT(currentTheme());
    const on = (e: Event) => setT((e as CustomEvent<Theme>).detail);
    window.addEventListener("ripple:theme", on);
    return () => window.removeEventListener("ripple:theme", on);
  }, []);
  return t;
}
