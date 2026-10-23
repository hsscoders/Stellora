/**
 * printDocument — prints a fully standalone HTML document through a hidden
 * same-origin iframe.
 *
 * Why an iframe instead of `window.print()` + visibility CSS hacks:
 *  - the printed doc owns its own `@page` size/margins (80 mm thermal rolls,
 *    A4 invoices) instead of inheriting whatever the admin app renders;
 *  - nothing on the page can clip it — no modal `overflow-hidden`, no
 *    `max-h` panels, no fixed overlays (the old receipt hack cut every bill
 *    taller than one screen);
 *  - dark mode, theme variables and admin chrome cannot bleed onto paper;
 *  - no popup blocker issues (window.open based label printing fallback);
 *  - the main tab's scroll position and layout are never disturbed.
 */
/** HTML-escape text that goes into a printed document. */
export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function printDocument(title: string, html: string): void {
  if (typeof document === "undefined") return;

  const frame = document.createElement("iframe");
  frame.id = "stellora-print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  /* parked off-screen but rendered (display:none frames refuse to print) */
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.border = "0";
  frame.style.pointerEvents = "none";

  frame.addEventListener("load", () => {
    try {
      const win = frame.contentWindow;
      const doc = win?.document;
      if (!win || !doc) return;
      /* small delay lets the QR/img decode and fonts settle before the dialog */
      setTimeout(() => {
        try {
          win.focus();
          win.print(); // blocks until the dialog closes in Chrome/Firefox
        } finally {
          setTimeout(() => frame.remove(), 400);
        }
      }, 150);
    } catch {
      frame.remove();
    }
  });

  document.body.appendChild(frame);

  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${html}</body></html>`
  );
  doc.close();
  /* observability: lets support confirm the print doc was actually handed to
     the browser (visible in DevTools and headless test runs) */
  console.info("[stellora-print]", `${title} · ${html.length} bytes`);
}
