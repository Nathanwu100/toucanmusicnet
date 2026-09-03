// Page script for signup.html.
//
// Lifted out of the page so the Content-Security-Policy in _headers can
// refuse inline script entirely. A module, because it was one inline and
// still has to run after the deferred scripts it depends on.

const instrumentField = document.getElementById("student-instrument-field");
const instrumentSelect = document.getElementById("instrument");

async function loadSignupInstruments() {
  try {
    const instruments = await ToucanAPI.listInstruments();
    instrumentSelect.innerHTML = '<option value="">Choose an instrument</option>';
    instruments.forEach((instrument) => {
      const option = document.createElement("option");
      option.value = instrument.slug;
      option.textContent = instrument.name;
      instrumentSelect.appendChild(option);
    });
  } catch (error) {
    instrumentSelect.innerHTML = '<option value="">Instruments unavailable</option>';
    const err = document.getElementById("error");
    err.textContent = "We could not load the instrument list. Please refresh and try again.";
    err.classList.add("show");
  }
}

function syncInstrumentField() {
  const role = document.querySelector('input[name="role"]:checked')?.value;
  const isStudent = role === "student";
  instrumentField.hidden = !isStudent;
  instrumentSelect.required = isStudent;
  if (!isStudent) instrumentSelect.value = "";
}

document.querySelectorAll('input[name="role"]').forEach((input) => {
  input.addEventListener("change", syncInstrumentField);
});
loadSignupInstruments();

const phoneInput = document.getElementById("phone");
const phoneCountry = document.getElementById("phone-country");
ToucanPhone.fillCountrySelect(phoneCountry);
phoneInput.addEventListener("blur", () => {
  const parsed = ToucanPhone.parse(phoneCountry.value, phoneInput.value);
  if (parsed.valid) {
    phoneCountry.value = parsed.iso;
    phoneInput.value = parsed.national;
  }
});

document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("error");
  const btn = document.getElementById("submit");
  const role = document.querySelector('input[name="role"]:checked');
  err.classList.remove("show");
  if (!role) {
    err.textContent = "Choose whether you're joining as a student or a volunteer.";
    err.classList.add("show");
    return;
  }
  if (role.value === "student" && !instrumentSelect.value) {
    err.textContent = "Select an instrument to finish creating your student account.";
    err.classList.add("show");
    instrumentSelect.focus();
    return;
  }
  const typedPhone = phoneInput.value.trim();
  const parsedPhone = typedPhone ? ToucanPhone.parse(phoneCountry.value, typedPhone) : null;
  if (parsedPhone && !parsedPhone.valid) {
    err.textContent = ToucanPhone.message(parsedPhone.error);
    err.classList.add("show");
    phoneInput.focus();
    return;
  }
  btn.disabled = true;
  btn.textContent = "Creating account…";
  try {
    const user = await ToucanAPI.signup({
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
      role: role.value,
      instrument: role.value === "student" ? instrumentSelect.value : null,
      // A number given here opts the account into texts; leaving it blank
      // leaves texts off, which is the setting the account starts with.
      phone_number: parsedPhone ? parsedPhone.e164 : null,
    });
    ToucanTour.queueFirstVisit(user);
    btn.textContent = "Account created";
    await musicNoteConfetti(btn);
    // With email confirmation switched on there is no session yet, so
    // sending them to the calendar would drop them on a signed-out page
    // with no clue what to do. Explain the mailbox step instead.
    if (user.needs_verification) {
      sessionStorage.setItem(
        "toucan_pending_verification_v1",
        JSON.stringify({ email: user.email, sent: user.confirmation_sent !== false })
      );
      window.location.href = "verify-email.html";
      return;
    }
    window.location.href = "calendar.html?v=3";
  } catch (ex) {
    // An address that already has an account is the common case, and the
    // useful answer is a way in -- not an error and a dead end.
    if (ex.code === "email_exists") {
      err.innerHTML = "";
      err.append("An account already uses that email address. ");
      const logIn = document.createElement("a");
      logIn.href = "login.html";
      logIn.textContent = "Log in instead";
      err.append(logIn, document.createTextNode("."));
    } else {
      err.textContent = ex.message;
    }
    err.classList.add("show");
    btn.disabled = false;
    btn.textContent = "Create account";
  }
});
