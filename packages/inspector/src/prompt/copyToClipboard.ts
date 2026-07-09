export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to legacy path
    }
  }
  legacyCopy(text);
}

function legacyCopy(text: string): void {
  const doc = document;
  const textarea = doc.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  doc.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = doc.execCommand("copy");
  } finally {
    doc.body.removeChild(textarea);
  }
  if (!ok) {
    throw new Error("copyToClipboard failed: clipboard API unavailable and execCommand returned false");
  }
}
