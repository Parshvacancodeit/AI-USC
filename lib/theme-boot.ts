// Server-safe: inline <head> script that applies the saved theme before first paint.
/** Inline script for <head>: applies the saved theme before first paint (no flash). */
export const THEME_BOOT = `try{if(localStorage.getItem("ripple-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;
