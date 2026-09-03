// Page script for verify-email.html.
//
// Lifted out of the page so the Content-Security-Policy in _headers can
// refuse inline script entirely. A module, because it was one inline and
// still has to run after the deferred scripts it depends on.

// The address is handed over in sessionStorage rather than the query
// string: it is the new member's email, and a query string would put it
// in browser history, in the referer header, and in any server log along
// the way. sessionStorage stays in the tab that just signed up.
const PENDING_KEY = "toucan_pending_verification_v1";

const addressEl = document.getElementById("verify-address");
const statusEl = document.getElementById("status");
const resend = document.getElementById("resend");

let pending = null;
try {
  pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
} catch (error) {
  pending = null;
}

if (pending?.email) {
  addressEl.textContent = pending.email;
  // The account was made but Supabase never actually sent the mail. Saying
  // "check your inbox" would send someone to wait for nothing.
  if (pending.sent === false) {
    document.querySelector(".verify-panel h1").textContent = "Your account is made";
    document.querySelector(".verify-panel .sub").innerHTML =
      "It is registered to <strong class=\"verify-address\"></strong>, but the confirmation email did not go out. " +
      "Try sending it again below, and if that keeps failing the site's email settings need fixing.";
    document.querySelector(".verify-panel .sub .verify-address").textContent = pending.email;
    document.querySelector(".verify-steps").hidden = true;
    statusEl.textContent = "No confirmation email was sent yet.";
    statusEl.classList.add("verify-status-warn");
  }
} else {
  // Landing here directly, with nothing to resend to.
  resend.disabled = true;
  statusEl.textContent = "Open this page right after signing up and we can resend the link from here.";
}

// Supabase rate-limits confirmation emails, and hammering the button is
// the surest way to get one rejected. Hold it for a moment after a send.
const COOLDOWN_MS = 30000;
function holdResend(seconds) {
  resend.disabled = true;
  let left = seconds;
  resend.textContent = `Send it again (${left})`;
  const tick = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(tick);
      resend.disabled = false;
      resend.textContent = "Send it again";
      return;
    }
    resend.textContent = `Send it again (${left})`;
  }, 1000);
}

resend.addEventListener("click", async () => {
  if (!pending?.email) return;
  resend.disabled = true;
  statusEl.textContent = "Sending…";
  try {
    await ToucanAPI.resendConfirmation(pending.email);
    statusEl.textContent = `Sent again to ${pending.email}.`;
    holdResend(COOLDOWN_MS / 1000);
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.classList.toggle("verify-status-warn", error.code !== "already_confirmed");
    // Rate limiting is the one failure where retrying immediately makes
    // things worse, so hold the button anyway.
    if (error.code === "email_rate_limited") holdResend(60);
    else resend.disabled = false;
  }
});
