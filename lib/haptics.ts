// P1. Haptic taps. Android: Vibration API. iOS 18+: toggling a hidden <input switch> triggers the Taptic Engine.
let label: HTMLLabelElement | null = null;

function iosTap() {
  if (!label) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.id = "haptic-switch";
    input.style.display = "none";
    label = document.createElement("label");
    label.htmlFor = input.id;
    label.style.display = "none";
    document.body.append(input, label);
  }
  label.click();
}

export function haptic(kind: "light" | "medium" | "success" | "warning" = "light") {
  if (typeof window === "undefined") return;
  const pattern = { light: 8, medium: 16, success: [12, 60, 18], warning: [20, 40, 20] }[kind];
  if (navigator.vibrate) navigator.vibrate(pattern);
  else {
    iosTap();
    if (kind === "success" || kind === "warning") setTimeout(iosTap, 90);
  }
}
