document.addEventListener("DOMContentLoaded", () => {
  const host = document.querySelector("#runtime-host");
  if (!host) return;

  const button = document.createElement("button");
  button.id = "runtime-action";
  button.type = "button";
  button.className = "action-button runtime-action";
  button.setAttribute("aria-label", "Runtime action");
  button.textContent = "Runtime action";
  host.append(button);
});
