// Server-safe: inline <head> script that applies the saved theme before first paint.
/** Inline script for <head>: applies the saved theme before first paint (no flash). */
export const THEME_BOOT = `try{document.documentElement.dataset.theme=localStorage.getItem("ripple-theme")==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}`;
