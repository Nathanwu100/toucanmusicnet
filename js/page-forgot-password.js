// Page script for forgot-password.html.
//
// Lifted out of the page so the Content-Security-Policy in _headers can
// refuse inline script entirely. A module, because it was one inline and
// still has to run after the deferred scripts it depends on.

const form = document.getElementById("forgot-form");
const err = document.getElementById("error");
const sent = document.getElementById("sent-note");
const demoNote = document.getElementById("demo-note");
const btn = document.getElementById("submit");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  err.classList.remove("show");
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    const result = await ToucanAPI.requestPasswordReset(document.getElementById("email").value);
    form.hidden = true;
    sent.hidden = false;
    // Demo mode has no mailbox, so it hands the link back directly.
    if (result.demoLink) {
      demoNote.innerHTML = "";
      demoNote.append(document.createTextNode("Demo mode, so no email was sent. "));
      const link = document.createElement("a");
      link.href = result.demoLink;
      link.textContent = "Open the reset link";
      demoNote.append(link, document.createTextNode("."));
    } else if (ToucanAPI.demoMode) {
      demoNote.textContent = "Demo mode: no account matches that address.";
    }
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.add("show");
    btn.disabled = false;
    btn.textContent = "Send the reset link";
  }
});
