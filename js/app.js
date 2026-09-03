// Shared site chrome, settings drawer, gentle pointer motion, home schedule,
// toasts, and in-page reminders.

(function () {
  const api = window.ToucanAPI;
  let currentUser = null;
  let settingsDrawer = null;
  let settingsScrim = null;
  let settingsTrigger = null;

  const toastHost = document.createElement("div");
  toastHost.className = "toast-host";
  toastHost.setAttribute("role", "status");
  toastHost.setAttribute("aria-live", "polite");
  document.body.appendChild(toastHost);

  // `link` turns the toast into a link to the thing it is about, so a
  // "starting soon" reminder can be clicked straight through to the event.
  window.toast = function (message, kind = "info", link = null) {
    const item = document.createElement(link ? "a" : "div");
    item.className = `toast ${kind}${link ? " toast-link" : ""}`;
    item.textContent = message;
    if (link) {
      item.href = link.href;
      if (link.label) item.setAttribute("aria-label", link.label);
    }
    toastHost.appendChild(item);
    requestAnimationFrame(() => item.classList.add("show"));
    setTimeout(() => {
      item.classList.remove("show");
      setTimeout(() => item.remove(), 400);
    }, 5200);
  };

  // A styled confirmation, in place of the browser's own. Resolves true or
  // false, so callers read the same way `confirm()` did. Centred, because a
  // question worth interrupting for should not be off in a corner.
  window.confirmDialog = function ({ title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "primary" }) {
    return new Promise((resolve) => {
      const scrim = document.createElement("div");
      scrim.className = "dialog-scrim";
      const panel = document.createElement("div");
      panel.className = "dialog";
      panel.setAttribute("role", "alertdialog");
      panel.setAttribute("aria-modal", "true");

      const heading = document.createElement("h2");
      heading.textContent = title;
      panel.appendChild(heading);
      if (body) {
        const copy = document.createElement("p");
        copy.textContent = body;
        panel.appendChild(copy);
      }

      const actions = document.createElement("div");
      actions.className = "dialog-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn-quiet";
      cancel.textContent = cancelLabel;
      const go = document.createElement("button");
      go.type = "button";
      go.className = `btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`;
      go.textContent = confirmLabel;
      actions.append(cancel, go);
      panel.appendChild(actions);
      scrim.appendChild(panel);
      document.body.appendChild(scrim);

      const previouslyFocused = document.activeElement;
      go.focus();

      const close = (answer) => {
        document.removeEventListener("keydown", onKey, true);
        scrim.remove();
        // Put focus back where it was, or it lands on <body> and the next
        // Tab starts from the top of the page.
        if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
        resolve(answer);
      };
      const onKey = (event) => {
        if (event.key === "Escape") { event.preventDefault(); close(false); }
        // A modal that lets Tab wander behind it is not modal.
        if (event.key === "Tab") {
          const focusable = [cancel, go];
          const index = focusable.indexOf(document.activeElement);
          event.preventDefault();
          focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
        }
      };
      document.addEventListener("keydown", onKey, true);
      cancel.addEventListener("click", () => close(false));
      go.addEventListener("click", () => close(true));
      scrim.addEventListener("click", (event) => {
        if (event.target === scrim) close(false);
      });
    });
  };

  // Cross-document view transitions reject an internal promise with
  // "AbortError: Transition was skipped" when a navigation interrupts one --
  // clicking a second link while the first is still animating, most often.
  // Nothing here started that transition and nothing can await it, so it
  // surfaces as an unhandled rejection and looks like a broken page. Swallow
  // exactly that one and let everything else through.
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const skipped = reason?.name === "AbortError"
      && /transition was skipped/i.test(String(reason?.message || ""));
    if (skipped) event.preventDefault();
  });

  window.escapeHtml = function (value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
  };

  async function renderNav() {
    const nav = document.querySelector("[data-site-nav]");
    if (!nav) return null;
    try {
      currentUser = await api.getSession();
    } catch (error) {
      currentUser = null;
    }

    // Cloudflare serves these files at extensionless URLs, so in production
    // the path is /about, not /about.html. Comparing against the filename
    // matched nothing there except home, which passed only because "/" falls
    // back to the default below -- hence "the tab only highlights on the home
    // page". Strip the extension and any trailing slash and compare bare names.
    const page = (window.location.pathname.replace(/\/+$/, "").split("/").pop() || "index")
      .replace(/\.html$/i, "")
      .toLowerCase() || "index";
    const currentIf = (name) => (page === name ? ' aria-current="page"' : "");
    const homeCurrent = currentIf("index");
    const aboutCurrent = currentIf("about");
    const calendarCurrent = currentIf("calendar");
    const loginCurrent = currentIf("login");
    const signupCurrent = currentIf("signup");
    const authMarkup = currentUser
      ? `<span class="nav-user">${escapeHtml(currentUser.name)} <em>${escapeHtml(currentUser.role)}</em></span>
         <button class="nav-icon-button" type="button" data-open-settings data-tour="nav-settings" aria-label="Settings" data-tooltip="Settings"><iconify-icon icon="pixelarticons:settings-cog" aria-hidden="true"></iconify-icon></button>
         <button class="nav-icon-button" type="button" data-logout aria-label="Log out" data-tooltip="Log out"><iconify-icon icon="pixelarticons:logout" aria-hidden="true"></iconify-icon></button>`
      : `<button class="nav-icon-button" type="button" data-open-settings data-tour="nav-settings" aria-label="Settings" data-tooltip="Settings"><iconify-icon icon="pixelarticons:settings-cog" aria-hidden="true"></iconify-icon></button>
         <a class="nav-icon-link" href="login.html" aria-label="Log in" data-tooltip="Log in"${loginCurrent}><iconify-icon icon="pixelarticons:login" aria-hidden="true"></iconify-icon></a>
         <a class="btn btn-primary btn-sm nav-join" href="signup.html"${signupCurrent}><iconify-icon icon="pixelarticons:user-plus" aria-hidden="true"></iconify-icon>Join us</a>`;

    nav.innerHTML = `
      <a class="brand" href="index.html"><span class="brand-bird" data-brand-bird aria-hidden="true"></span>Toucan Music</a>
      <div class="nav-links">
        <a class="nav-icon-link" href="index.html" aria-label="Home" data-tooltip="Home"${homeCurrent}><iconify-icon icon="pixelarticons:home" aria-hidden="true"></iconify-icon></a>
        <a class="nav-icon-link" href="about.html" aria-label="About us" data-tooltip="About us"${aboutCurrent}><iconify-icon icon="pixelarticons:users" aria-hidden="true"></iconify-icon></a>
        <a class="nav-icon-link" href="calendar.html?v=3" aria-label="Calendar" data-tooltip="Calendar"${calendarCurrent}><iconify-icon icon="pixelarticons:calendar" aria-hidden="true"></iconify-icon></a>
        <span class="nav-auth" data-nav-auth>${authMarkup}</span>
      </div>`;

    nav.querySelector("[data-logout]")?.addEventListener("click", async () => {
      await api.logout();
      window.location.href = "index.html";
    });
    document.body.dataset.role = currentUser ? currentUser.role : "guest";
    document.body.dataset.instrument = currentUser?.instrument || "";
    return currentUser;
  }

  function renderFooter() {
    let footer = document.querySelector("[data-site-footer]");
    if (!footer) {
      footer = document.createElement("footer");
      footer.dataset.siteFooter = "";
      document.body.appendChild(footer);
    }
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-brand">
          <div class="footer-brand-row">
            <a class="brand" href="index.html"><span class="brand-bird" data-brand-bird aria-hidden="true"></span>Toucan Music</a>
          </div>
          <p>Free weekend piano, violin, and viola lessons in Palo Alto.</p>
        </div>
        <div class="footer-links" aria-label="Organization">
          <strong>Organization</strong>
          <a href="mission.html">Our mission</a>
          <a href="about.html">About us</a>
        </div>
        <div class="footer-links" aria-label="Contact">
          <strong>Contact</strong>
          <a href="mailto:toucanexec@gmail.com">toucanexec@gmail.com</a>
          <button type="button" data-open-settings>Notification settings</button>
        </div>
      </div>
      <div class="footer-base">
        <span>&copy; 2026 Toucan Music</span>
        <span class="footer-credits">
          <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">Photography: Pexels</a>
          <a href="https://opengameart.org/content/bird-2" target="_blank" rel="noopener noreferrer">CC0 pixel bird: rmazanek</a>
        </span>
      </div>`;
  }

  // The one piece of motion left outside the notification board: the bird
  // idles on its own short cycle. Kept deliberately frequent -- it is the
  // site's only sign of life now that the ambient animation is gone.
  function initBirdLogos() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const idleAnimations = [
      { row: 1, frames: 9, frameTime: 110 },
      { row: 3, frames: 8, frameTime: 125 },
    ];

    document.querySelectorAll("[data-brand-bird]").forEach((sprite, index) => {
      if (sprite.dataset.birdReady) return;
      sprite.dataset.birdReady = "true";

      const showFrame = (row, frame) => {
        const frameWidth = sprite.getBoundingClientRect().width;
        const frameHeight = sprite.getBoundingClientRect().height;
        sprite.style.backgroundSize = `${frameWidth * 11}px ${frameHeight * 8}px`;
        sprite.style.backgroundPosition = `${-frame * frameWidth}px ${-row * frameHeight}px`;
      };
      showFrame(2, 0);
      if (reducedMotion) return;

      const schedule = () => {
        const delay = 1400 + Math.random() * 2200 + index * 250;
        window.setTimeout(playIdle, delay);
      };
      const playIdle = () => {
        const animation = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
        let frame = 0;
        showFrame(animation.row, frame);
        const timer = window.setInterval(() => {
          frame += 1;
          if (frame >= animation.frames) {
            window.clearInterval(timer);
            showFrame(2, 0);
            schedule();
            return;
          }
          showFrame(animation.row, frame);
        }, animation.frameTime);
      };
      schedule();
    });
  }

  function buildSettingsDrawer() {
    settingsScrim = document.createElement("div");
    settingsScrim.className = "settings-scrim";
    settingsScrim.hidden = true;
    settingsDrawer = document.createElement("aside");
    settingsDrawer.className = "settings-drawer";
    settingsDrawer.setAttribute("role", "dialog");
    settingsDrawer.setAttribute("aria-modal", "true");
    settingsDrawer.setAttribute("aria-labelledby", "settings-drawer-title");
    settingsDrawer.setAttribute("aria-hidden", "true");
    settingsDrawer.inert = true;
    settingsDrawer.innerHTML = `
      <header class="settings-drawer-head">
        <div>
          <p class="drawer-kicker">Your account</p>
          <h2 id="settings-drawer-title">Settings</h2>
        </div>
        <button class="icon-btn drawer-close" type="button" data-close-settings aria-label="Close settings" data-tooltip="Close"><iconify-icon icon="pixelarticons:close" aria-hidden="true"></iconify-icon></button>
      </header>
      <div class="settings-drawer-body" data-settings-content></div>`;
    document.body.append(settingsScrim, settingsDrawer);
    settingsScrim.addEventListener("click", closeSettings);
    settingsDrawer.querySelector("[data-close-settings]").addEventListener("click", closeSettings);
  }

  function renderSettingsContent() {
    const content = settingsDrawer.querySelector("[data-settings-content]");
    if (!currentUser) {
      content.innerHTML = `
        <div class="settings-guest">
          <iconify-icon icon="pixelarticons:bell" aria-hidden="true"></iconify-icon>
          <h3>Keep up with classes</h3>
          <p>Log in to manage weekly email, class reminders, and text notifications.</p>
          <a class="btn btn-primary" href="login.html">Log in</a>
          <a class="btn btn-quiet" href="signup.html">Create an account</a>
        </div>`;
      return;
    }

    const fallbackInstrumentOptions = api.instruments
      .map((instrument) => `<option value="${escapeHtml(instrument.slug)}">${escapeHtml(instrument.name)}</option>`)
      .join("");
    const instrumentSection = currentUser.role === "student" ? `
        <section class="settings-group instrument-settings-group" aria-labelledby="instrument-title">
          <div class="settings-group-head">
            <span class="settings-icon" aria-hidden="true"><iconify-icon icon="pixelarticons:music"></iconify-icon></span>
            <div><h3 id="instrument-title">Instrument</h3><p>This controls which classes and events you can access.</p></div>
          </div>
          <div class="field instrument-setting-field">
            <label for="drawer-instrument">Selected instrument</label>
            <select id="drawer-instrument" required>
              <option value="">Choose an instrument</option>
              ${fallbackInstrumentOptions}
            </select>
            <p class="instrument-change-warning">If you are enrolled in a class, leave or transfer that class before changing instruments. Your enrollment will never be deleted automatically.</p>
          </div>
        </section>` : "";

    content.innerHTML = `
      <p class="settings-who"></p>
      <form id="settings-form">
        ${instrumentSection}
        <section class="settings-group" aria-labelledby="notification-title">
          <div class="settings-group-head">
            <span class="settings-icon" aria-hidden="true"><iconify-icon icon="pixelarticons:bell"></iconify-icon></span>
            <div><h3 id="notification-title">Notifications</h3><p>How we reach you about a class.</p></div>
          </div>
          <label class="toggle-row" for="drawer-pref-digest">
            <span class="settings-row-icon" aria-hidden="true"><iconify-icon icon="pixelarticons:mail"></iconify-icon></span>
            <span class="setting-copy"><strong>Weekly schedule email</strong><p>One email on Monday with the week ahead.</p></span>
            <span class="switch"><input type="checkbox" id="drawer-pref-digest" aria-label="Weekly schedule email"><span class="track"></span></span>
          </label>
          <label class="toggle-row" for="drawer-pref-reminders">
            <span class="settings-row-icon" aria-hidden="true"><iconify-icon icon="pixelarticons:bell-ring"></iconify-icon></span>
            <span class="setting-copy"><strong>Class reminders</strong><p>A nudge here and by email before class.</p></span>
            <span class="switch"><input type="checkbox" id="drawer-pref-reminders" aria-label="Class reminders"><span class="track"></span></span>
          </label>
          <label class="toggle-row" for="drawer-pref-texts">
            <span class="settings-row-icon" aria-hidden="true"><iconify-icon icon="pixelarticons:message-text"></iconify-icon></span>
            <span class="setting-copy"><strong>Text notifications</strong><p>A short text before class starts.</p></span>
            <span class="switch"><input type="checkbox" id="drawer-pref-texts" aria-label="Text notifications"><span class="track"></span></span>
          </label>
          <div class="field phone-field" data-phone-field>
            <label for="drawer-phone">Mobile number</label>
            <div class="phone-input">
              <select id="drawer-phone-country" aria-label="Country calling code"></select>
              <input type="tel" id="drawer-phone" autocomplete="tel" placeholder="555 123 4567">
            </div>
            <p class="hint">Pick your country on the left rather than typing a code. Message and data rates may apply.</p>
            <button class="btn btn-sm btn-quiet save-phone" type="submit" name="save-target" value="phone">Save your number</button>
          </div>
        </section>
        <div class="drawer-actions">
          <button class="btn btn-primary" type="submit">Save settings</button>
          <button class="btn btn-quiet" type="button" data-start-tutorial><iconify-icon icon="pixelarticons:play" aria-hidden="true"></iconify-icon>Site guide</button>
        </div>
        <p class="settings-save-status" data-settings-status role="status" aria-live="polite"></p>
      </form>`;

    content.querySelector(".settings-who").textContent = `Account settings for ${currentUser.name}.`;
    const digest = content.querySelector("#drawer-pref-digest");
    const reminders = content.querySelector("#drawer-pref-reminders");
    const texts = content.querySelector("#drawer-pref-texts");
    const phone = content.querySelector("#drawer-phone");
    const phoneCountry = content.querySelector("#drawer-phone-country");
    const phoneField = content.querySelector("[data-phone-field]");
    const instrument = content.querySelector("#drawer-instrument");
    digest.checked = currentUser.weekly_digest !== false;
    reminders.checked = currentUser.class_reminders !== false;
    texts.checked = currentUser.text_notifications === true;
    const savedPhone = window.ToucanPhone.split(currentUser.phone_number);
    window.ToucanPhone.fillCountrySelect(phoneCountry, savedPhone.iso);
    phone.value = savedPhone.national;
    // Typing a full international number re-points the dropdown at the
    // country it names, so the two controls never disagree.
    phone.addEventListener("blur", () => {
      const parsed = window.ToucanPhone.parse(phoneCountry.value, phone.value);
      if (parsed.valid) {
        phoneCountry.value = parsed.iso;
        phone.value = parsed.national;
      }
    });
    if (instrument) {
      instrument.value = currentUser.instrument || "";
      instrument.dataset.savedValue = currentUser.instrument || "";
      api.listInstruments().then((instruments) => {
        const selected = instrument.value;
        instrument.innerHTML = '<option value="">Choose an instrument</option>';
        instruments.forEach((item) => {
          const option = document.createElement("option");
          option.value = item.slug;
          option.textContent = item.name;
          instrument.appendChild(option);
        });
        instrument.value = selected;
      }).catch(() => {
        toast("The supported instrument list could not be refreshed.", "error");
      });
    }

    const syncPhone = () => {
      phoneField.hidden = !texts.checked;
      phone.required = texts.checked;
    };
    texts.addEventListener("change", syncPhone);
    syncPhone();

    const form = content.querySelector("#settings-form");
    const saveStatus = content.querySelector("[data-settings-status]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const parsedPhone = window.ToucanPhone.parse(phoneCountry.value, phone.value);
      if (instrument && !instrument.value) {
        toast("Choose an instrument before saving student settings.", "error");
        instrument.focus();
        return;
      }
      if (texts.checked && !parsedPhone.valid) {
        toast(window.ToucanPhone.message(parsedPhone.error), "error");
        phone.focus();
        return;
      }
      const submit = event.submitter || form.querySelector('.drawer-actions button[type="submit"]');
      submit.disabled = true;
      saveStatus.textContent = "Saving...";
      try {
        const instrumentChanged = instrument && instrument.value !== instrument.dataset.savedValue;
        if (instrumentChanged) {
          saveStatus.textContent = "Checking your current enrollment...";
          currentUser = await api.updateInstrument(instrument.value);
          instrument.dataset.savedValue = currentUser.instrument;
          document.body.dataset.instrument = currentUser.instrument;
          window.dispatchEvent(new CustomEvent("toucan:instrument-changed", {
            detail: { instrument: currentUser.instrument, user: currentUser },
          }));
        }
        currentUser = await api.updatePrefs({
          weekly_digest: digest.checked,
          class_reminders: reminders.checked,
          text_notifications: texts.checked,
          phone_number: texts.checked ? parsedPhone.e164 : null,
        });
        const stored = window.ToucanPhone.split(currentUser.phone_number);
        phoneCountry.value = stored.iso;
        phone.value = stored.national;
        saveStatus.textContent = instrumentChanged
          ? `Instrument changed to ${currentUser.instrument_name}. Your schedule has been refreshed.`
          : submit.value === "phone"
          ? "Your mobile number is saved."
          : "Your settings are saved.";
        toast(saveStatus.textContent, "success");
      } catch (error) {
        saveStatus.textContent = "Settings were not saved. Please try again.";
        toast(error.message, "error");
      } finally {
        submit.disabled = false;
      }
    });

    content.querySelector("[data-start-tutorial]").addEventListener("click", () => {
      closeSettings();
      window.ToucanTour?.replay(currentUser);
    });
  }

  function openSettings(trigger) {
    settingsTrigger = trigger || document.activeElement;
    renderSettingsContent();
    settingsScrim.hidden = false;
    settingsDrawer.inert = false;
    settingsDrawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("settings-open");
    requestAnimationFrame(() => settingsDrawer.classList.add("open"));
    settingsDrawer.querySelector("[data-close-settings]").focus();
  }

  function closeSettings() {
    if (!settingsDrawer) return;
    settingsDrawer.classList.remove("open");
    settingsDrawer.setAttribute("aria-hidden", "true");
    settingsDrawer.inert = true;
    document.body.classList.remove("settings-open");
    setTimeout(() => {
      settingsScrim.hidden = true;
      settingsTrigger?.focus?.();
    }, 320);
  }

  function initSettings() {
    buildSettingsDrawer();
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-open-settings]");
      if (trigger) openSettings(trigger);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && settingsDrawer.classList.contains("open")) closeSettings();
    });
    const shouldOpen = new URLSearchParams(window.location.search).get("settings") === "open";
    if (shouldOpen || (currentUser?.role === "student" && currentUser.needs_instrument)) {
      openSettings();
      if (currentUser?.needs_instrument) {
        toast("Choose an instrument to unlock your student calendar.", "error");
        settingsDrawer.querySelector("#drawer-instrument")?.focus();
      }
    }
  }

  const galleryImages = [
    { src: "assets/art/sheet-music.svg?v=2", alt: "Illustration of sheet music pages" },
    { src: "assets/art/concert-hall.svg?v=2", alt: "Illustration of a concert hall stage with a grand piano" },
  ];

  function renderHomeSchedule(events) {
    const upcoming = events
      .filter((event) => new Date(event.starts_at).getTime() >= Date.now())
      .slice(0, 3);
    const gallery = document.querySelector("#upcoming-gallery");
    const notificationList = document.querySelector("#upcoming-notification-list");

    if (gallery) {
      gallery.innerHTML = "";
      upcoming.forEach((event, index) => {
        const image = galleryImages[index % galleryImages.length];
        const link = document.createElement("a");
        const date = new Date(event.starts_at);
        link.className = "event-gallery-card";
        link.href = eventLink(event);
        link.innerHTML = `
          <img src="${image.src}" alt="${image.alt}" width="480" height="320" decoding="async" ${index ? 'loading="lazy"' : 'fetchpriority="high"'}>
          <div class="event-gallery-copy">
            <p class="event-gallery-date"></p>
            <h3></h3>
            <p class="event-gallery-place"></p>
          </div>`;
        link.querySelector(".event-gallery-date").textContent = date.toLocaleDateString([], {
          weekday: "short", month: "short", day: "numeric",
        }) + " at " + date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        link.querySelector("h3").textContent = event.title;
        link.querySelector(".event-gallery-place").textContent = event.location || "Location to be announced";
        gallery.appendChild(link);
      });
      if (!upcoming.length) gallery.innerHTML = '<p class="schedule-empty">New classes will be posted soon.</p>';
    }

    if (notificationList) {
      notificationList.innerHTML = "";
      upcoming.slice(0, 1).forEach((event) => {
        const date = new Date(event.starts_at);
        const row = document.createElement("a");
        row.className = "notification-item";
        row.href = eventLink(event);
        const when = document.createElement("span");
        const name = document.createElement("strong");
        when.textContent = date.toLocaleDateString([], { month: "short", day: "numeric" }) +
          " at " + date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        name.textContent = event.title;
        row.append(when, name);
        notificationList.appendChild(row);
      });
      if (!upcoming.length) notificationList.textContent = "No upcoming notifications yet.";
    }
  }

  // A link that opens the calendar on this event's day with the event
  // itself expanded. js/calendar.js reads the id back off the query string.
  function eventLink(event) {
    return `calendar.html?v=3&event=${encodeURIComponent(event.id)}`;
  }

  function showScheduleSkeletons() {
    const gallery = document.querySelector("#upcoming-gallery");
    const notificationList = document.querySelector("#upcoming-notification-list");
    if (gallery) {
      gallery.innerHTML = Array.from({ length: 3 }, () => `
        <div class="skeleton-card" aria-hidden="true">
          <div class="skeleton skeleton-thumb"></div>
          <div class="skeleton-copy">
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line medium"></div>
          </div>
        </div>`).join("");
    }
    if (notificationList) {
      notificationList.innerHTML = `
        <div aria-hidden="true">
          <div class="skeleton skeleton-line short"></div>
          <div class="skeleton skeleton-line medium"></div>
        </div>`;
    }
  }

  async function initHomeSchedule() {
    if (!document.querySelector("#upcoming-gallery, #upcoming-notification-list")) return;
    showScheduleSkeletons();
    try {
      renderHomeSchedule(await api.listEvents());
    } catch (error) {
      document.querySelectorAll("#upcoming-gallery, #upcoming-notification-list").forEach((node) => {
        node.textContent = "The upcoming schedule is temporarily unavailable.";
      });
    }
  }

  const REMINDED_KEY = "toucan_reminded_v1";
  async function checkReminders(user) {
    if (!user || user.class_reminders === false) return;
    let events;
    try {
      events = await api.listEvents();
    } catch (error) {
      return;
    }
    const reminded = JSON.parse(sessionStorage.getItem(REMINDED_KEY) || "{}");
    const now = Date.now();
    for (const event of events) {
      const minutes = (new Date(event.starts_at).getTime() - now) / 60000;
      for (const offset of [60, 30]) {
        const key = `${event.id}:${offset}`;
        if (minutes > 0 && minutes <= offset && !reminded[key]) {
          reminded[key] = true;
          toast(
            `Starting soon: "${event.title}" at ` +
              new Date(event.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            "success",
            { href: eventLink(event), label: `Open ${event.title} on the calendar` }
          );
          break;
        }
      }
    }
    sessionStorage.setItem(REMINDED_KEY, JSON.stringify(reminded));
  }

  function showMisconfiguredBanner() {
    if (document.querySelector("[data-config-banner]")) return;
    const banner = document.createElement("div");
    banner.className = "config-banner";
    banner.setAttribute("data-config-banner", "");
    banner.setAttribute("role", "alert");
    banner.innerHTML = `
      <strong>This site is not talking to its database.</strong>
      <span>The Supabase client script did not load, so accounts, sign-ups and
      email are running on data stored in this browser alone. Nothing saved
      here reaches the server or any other device.</span>
      <a href="diagnostics.html">Run the diagnostics</a>`;
    document.body.prepend(banner);
    document.body.classList.add("has-config-banner");
  }

  // A student whose booking was changed out from under them hears about it
  // the next time they open the site, wherever they land. The notice says
  // what happened and links straight to the class so picking a new time is
  // one click rather than a hunt through the calendar.
  async function showStudentNotices(user) {
    if (!user || user.role !== "student") return;
    let notices = [];
    try {
      notices = await api.listNotices();
    } catch (error) {
      return;
    }
    if (!notices.length) return;

    // Losing a place is news that needs answering, so it interrupts: a
    // centred dialog over a scrim rather than a card in the corner. Being
    // moved is only worth knowing, so that stays out of the way.
    const needsAnswer = notices.some((notice) => notice.kind !== "moved");
    const host = document.createElement("div");
    host.className = needsAnswer ? "notice-stack notice-centred" : "notice-stack";
    host.setAttribute("role", needsAnswer ? "alertdialog" : "alert");
    if (needsAnswer) host.setAttribute("aria-modal", "true");

    for (const notice of notices) {
      const card = document.createElement("div");
      card.className = `notice-card notice-${notice.kind}`;

      const headline = {
        removed: "Your place in a class was cancelled",
        moved: "You were moved to a different time",
        slot_changed: "Your class time changed",
      }[notice.kind] || "Something changed in your schedule";

      const detail = [];
      if (notice.previous_slot) detail.push(`You were in ${notice.previous_slot}.`);
      if (notice.new_slot) detail.push(`You are now in ${notice.new_slot}.`);
      if (notice.note) detail.push(notice.note);

      card.append(
        Object.assign(document.createElement("strong"), { textContent: headline }),
        Object.assign(document.createElement("p"), { textContent: detail.join(" ") })
      );

      const actions = document.createElement("div");
      actions.className = "notice-actions";
      // Nothing to choose when they were only moved -- they still have a place.
      if (notice.class_id && notice.kind !== "moved") {
        const pick = document.createElement("a");
        pick.className = "btn btn-primary btn-sm";
        pick.href = `calendar.html?v=3&event=${encodeURIComponent(notice.class_id)}`;
        pick.textContent = "Pick another time";
        actions.appendChild(pick);
      } else if (notice.class_id) {
        const look = document.createElement("a");
        look.className = "btn btn-quiet btn-sm";
        look.href = `calendar.html?v=3&event=${encodeURIComponent(notice.class_id)}`;
        look.textContent = "See the class";
        actions.appendChild(look);
      }

      const dismiss = document.createElement("button");
      dismiss.className = "btn btn-quiet btn-sm";
      dismiss.type = "button";
      dismiss.textContent = "Got it";
      dismiss.addEventListener("click", async () => {
        dismiss.disabled = true;
        try {
          await api.resolveNotice(notice.id);
          card.remove();
          if (!host.querySelector(".notice-card")) (host.closest(".notice-scrim") || host).remove();
        } catch (error) {
          toast(error.message, "error");
          dismiss.disabled = false;
        }
      });
      actions.appendChild(dismiss);
      card.appendChild(actions);
      host.appendChild(card);
    }

    if (needsAnswer) {
      // Clicking the backdrop does not dismiss it -- the notice is the only
      // place they are told, and a stray click should not lose it.
      const scrim = document.createElement("div");
      scrim.className = "notice-scrim";
      scrim.appendChild(host);
      document.body.appendChild(scrim);
      host.querySelector("a, button")?.focus();
      return;
    }
    document.body.appendChild(host);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = await renderNav();
    renderFooter();
    initBirdLogos();
    initSettings();
    initHomeSchedule();
    window.ToucanTour?.maybeAutoStart(user);
    showStudentNotices(user);
    checkReminders(user);
    setInterval(() => checkReminders(user), 5 * 60 * 1000);

    window.addEventListener("toucan:instrument-changed", () => {
      initHomeSchedule();
    });

    // A site configured for Supabase that is running on browser-local data is
    // broken, not in "demo mode": accounts go nowhere, no email is ever sent,
    // and every account vanishes on another device. That deserves a banner
    // that stays put, not a toast that slides away in five seconds.
    if (api.misconfigured) {
      showMisconfiguredBanner();
    } else if (api.demoMode && !sessionStorage.getItem("toucan_demo_notice")) {
      sessionStorage.setItem("toucan_demo_notice", "1");
      toast("Demo mode: data lives in this browser only.");
    }
  });
})();
