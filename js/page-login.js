// Page script for login.html.
//
// Lifted out of the page so the Content-Security-Policy in _headers can
// refuse inline script entirely. A module, because it was one inline and
// still has to run after the deferred scripts it depends on.

const loginForm = document.getElementById("login-form");
const identifier = document.getElementById("identifier");
const recovery = document.getElementById("confirmation-recovery");
const recoveryStatus = document.getElementById("confirmation-status");
const resendButton = document.getElementById("resend-confirmation");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("error");
  const btn = document.getElementById("submit");
  err.classList.remove("show");
  recovery.hidden = true;
  recoveryStatus.textContent = "";
  btn.disabled = true;
  btn.textContent = "Logging in...";
  try {
    const user = await ToucanAPI.login(
      identifier.value,
      document.getElementById("password").value
    );
    ToucanTour.queueFirstVisit(user);
    window.location.href = user.needs_instrument
      ? "calendar.html?v=3&settings=open&instrument=required"
      : "calendar.html?v=3";
  } catch (ex) {
    const needsConfirmation = ex.code === "email_not_confirmed" || ex.message === "Email not confirmed";
    if (needsConfirmation) {
      // Hand the address to the verification page so its resend button works.
      sessionStorage.setItem(
        "toucan_pending_verification_v1",
        JSON.stringify({ email: identifier.value.trim() })
      );
    }
    err.textContent = needsConfirmation
      ? "This account has not confirmed its email address yet, so it cannot log in."
      : ex.message;
    err.classList.add("show");
    recovery.hidden = !needsConfirmation;
    btn.disabled = false;
    btn.textContent = "Log in";
  }
});

resendButton.addEventListener("click", async () => {
  resendButton.disabled = true;
  recoveryStatus.textContent = "Sending...";
  try {
    await ToucanAPI.resendConfirmation(identifier.value);
    recoveryStatus.textContent = "Confirmation sent. Open the email, confirm the account, then log in again.";
  } catch (ex) {
    recoveryStatus.textContent = ex.message;
    resendButton.disabled = false;
  }
});

(async () => {
  if (new URLSearchParams(window.location.search).get("confirmed") !== "1") return;
  try {
    const user = await ToucanAPI.getSession();
    if (user) {
      ToucanTour.queueFirstVisit(user);
      window.location.replace("calendar.html?v=3");
    }
  } catch (ex) {
    const err = document.getElementById("error");
    err.textContent = "The confirmation link opened, but the session could not be completed. Log in again.";
    err.classList.add("show");
  }
})();
