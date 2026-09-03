// Page script for reset-password.html.
//
// Lifted out of the page so the Content-Security-Policy in _headers can
// refuse inline script entirely. A module, because it was one inline and
// still has to run after the deferred scripts it depends on.

const form = document.getElementById("reset-form");
const intro = document.getElementById("intro");
const err = document.getElementById("error");
const expiredHelp = document.getElementById("expired-help");
const demoToken = new URLSearchParams(window.location.search).get("demo_token");

function refuse(message) {
  intro.textContent = message;
  form.hidden = true;
  expiredHelp.hidden = false;
}

// Supabase puts the recovery token in the URL fragment and swaps it for a
// session on load. Give that a moment before deciding the link is dead.
async function ready() {
  if (ToucanAPI.demoMode) return ToucanAPI.hasValidRecovery(demoToken);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await ToucanAPI.hasValidRecovery()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

if (await ready()) {
  intro.textContent = "Pick something you have not used here before.";
  form.hidden = false;
} else {
  refuse("This reset link has expired or has already been used.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  err.classList.remove("show");
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;
  if (password !== confirm) {
    err.textContent = "Those two passwords do not match.";
    err.classList.add("show");
    return;
  }
  const btn = document.getElementById("submit");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await ToucanAPI.completePasswordReset(password, demoToken);
    window.location.href = "calendar.html?v=3";
  } catch (ex) {
    if (ex.code === "recovery_expired") {
      refuse(ex.message);
      return;
    }
    err.textContent = ex.message;
    err.classList.add("show");
    btn.disabled = false;
    btn.textContent = "Save the new password";
  }
});
