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

  window.toast = function (message, kind = "info") {
    const item = document.createElement("div");
    item.className = `toast ${kind}`;
    item.textContent = message;
    toastHost.appendChild(item);
    requestAnimationFrame(() => item.classList.add("show"));
    setTimeout(() => {
      item.classList.remove("show");
      setTimeout(() => item.remove(), 400);
    }, 5200);
  };

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

    const file = window.location.pathname.split("/").pop() || "index.html";
    const homeCurrent = file === "index.html" ? ' aria-current="page"' : "";
    const calendarCurrent = file === "calendar.html" ? ' aria-current="page"' : "";
    const loginCurrent = file === "login.html" ? ' aria-current="page"' : "";
    const signupCurrent = file === "signup.html" ? ' aria-current="page"' : "";
    const authMarkup = currentUser
      ? `<span class="nav-user">${escapeHtml(currentUser.name)} <em>${escapeHtml(currentUser.role)}</em></span>
         <button class="nav-icon-button" type="button" data-open-settings data-tour="nav-settings" aria-label="Settings" data-tooltip="Settings"><iconify-icon icon="pixelarticons:settings-cog" aria-hidden="true"></iconify-icon></button>
         <button class="nav-icon-button" type="button" data-logout aria-label="Log out" data-tooltip="Log out"><iconify-icon icon="pixelarticons:logout" aria-hidden="true"></iconify-icon></button>`
      : `<button class="nav-icon-button" type="button" data-open-settings data-tour="nav-settings" aria-label="Settings" data-tooltip="Settings"><iconify-icon icon="pixelarticons:settings-cog" aria-hidden="true"></iconify-icon></button>
         <a class="nav-icon-link" href="login.html" aria-label="Log in" data-tooltip="Log in"${loginCurrent}><iconify-icon icon="pixelarticons:login" aria-hidden="true"></iconify-icon></a>
         <a class="btn btn-beak btn-sm nav-join" href="signup.html"${signupCurrent}><iconify-icon icon="pixelarticons:user-plus" aria-hidden="true"></iconify-icon>Join us</a>`;

    nav.innerHTML = `
      <a class="brand" href="index.html"><span class="brand-beak"></span>Toucan Music</a>
      <div class="nav-links">
        <a class="nav-icon-link" href="index.html" aria-label="Home" data-tooltip="Home"${homeCurrent}><iconify-icon icon="pixelarticons:home" aria-hidden="true"></iconify-icon></a>
        <a class="nav-icon-link" href="calendar.html?v=2" aria-label="Calendar" data-tooltip="Calendar"${calendarCurrent}><iconify-icon icon="pixelarticons:calendar" aria-hidden="true"></iconify-icon></a>
        <span class="nav-auth" data-nav-auth>${authMarkup}</span>
      </div>`;

    nav.querySelector("[data-logout]")?.addEventListener("click", async () => {
      await api.logout();
      window.location.href = "index.html";
    });
    document.body.dataset.role = currentUser ? currentUser.role : "guest";
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
            <a class="brand" href="index.html"><span class="brand-beak"></span>Toucan Music</a>
            <span class="pixel-bird-perch" data-pixel-bird role="img" aria-label="Blue-and-yellow pixel bird mascot"><span class="pixel-bird"></span></span>
          </div>
          <p>Free neighborhood music education, instruments, and performance space.</p>
        </div>
        <div class="footer-links" aria-label="Organization">
          <strong>Organization</strong>
          <a href="mission.html">Our mission</a>
          <a href="mission.html#about">About us</a>
        </div>
        <div class="footer-links" aria-label="Contact">
          <strong>Contact</strong>
          <a href="mailto:hello@toucanmusic.org">hello@toucanmusic.org</a>
          <button type="button" data-open-settings>Notification settings</button>
        </div>
      </div>
      <div class="footer-base">
        <span>&copy; 2026 Toucan Music, a 501(c)(3) nonprofit</span>
        <span class="footer-credits">
          <a href="https://www.pexels.com" target="_blank" rel="noreferrer">Photography: Pexels</a>
          <a href="https://opengameart.org/content/bird-2" target="_blank" rel="noreferrer">CC0 pixel bird: rmazanek</a>
        </span>
      </div>`;
  }

  function initPixelBird() {
    const perch = document.querySelector("[data-pixel-bird]");
    const sprite = perch?.querySelector(".pixel-bird");
    if (!perch || !sprite || perch.dataset.birdReady) return;
    perch.dataset.birdReady = "true";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frameWidth = 96;
    const frameHeight = 64;
    const idleAnimations = [
      { row: 1, frames: 9, frameTime: 120 },
      { row: 3, frames: 8, frameTime: 135 },
    ];

    const showFrame = (row, frame) => {
      sprite.style.backgroundPosition = `${-frame * frameWidth}px ${-row * frameHeight}px`;
    };
    const schedule = () => {
      const delay = 6500 + Math.random() * 7000;
      window.setTimeout(playIdle, delay);
    };
    const playIdle = () => {
      const animation = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
      let frame = 0;
      perch.classList.add("is-animating");
      showFrame(animation.row, frame);
      const timer = window.setInterval(() => {
        frame += 1;
        if (frame >= animation.frames) {
          window.clearInterval(timer);
          perch.classList.remove("is-animating");
          showFrame(2, 0);
          schedule();
          return;
        }
        showFrame(animation.row, frame);
      }, animation.frameTime);
    };

    showFrame(2, 0);
    schedule();
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
          <a class="btn btn-beak" href="login.html">Log in</a>
          <a class="btn btn-quiet" href="signup.html">Create an account</a>
        </div>`;
      return;
    }

    content.innerHTML = `
      <p class="settings-who"></p>
      <form id="settings-form">
        <section class="settings-group" aria-labelledby="notification-title">
          <div class="settings-group-head">
            <span class="settings-icon" aria-hidden="true"><iconify-icon icon="pixelarticons:bell"></iconify-icon></span>
            <div><h3 id="notification-title">Notifications</h3><p>Choose how upcoming classes reach you.</p></div>
          </div>
          <label class="toggle-row" for="drawer-pref-digest">
            <span class="settings-row-icon" aria-hidden="true"><iconify-icon icon="pixelarticons:mail"></iconify-icon></span>
            <span class="setting-copy"><strong>Weekly schedule email</strong><p>One Monday email with the week ahead.</p></span>
            <span class="switch"><input type="checkbox" id="drawer-pref-digest" aria-label="Weekly schedule email"><span class="track"></span></span>
          </label>
          <label class="toggle-row" for="drawer-pref-reminders">
            <span class="settings-row-icon" aria-hidden="true"><iconify-icon icon="pixelarticons:bell-ring"></iconify-icon></span>
            <span class="setting-copy"><strong>Class reminders</strong><p>Email and on-screen nudges before class.</p></span>
            <span class="switch"><input type="checkbox" id="drawer-pref-reminders" aria-label="Class reminders"><span class="track"></span></span>
          </label>
          <label class="toggle-row" for="drawer-pref-texts">
            <span class="settings-row-icon" aria-hidden="true"><iconify-icon icon="pixelarticons:message-text"></iconify-icon></span>
            <span class="setting-copy"><strong>Text notifications</strong><p>Receive short class reminders by SMS.</p></span>
            <span class="switch"><input type="checkbox" id="drawer-pref-texts" aria-label="Text notifications"><span class="track"></span></span>
          </label>
          <div class="field phone-field" data-phone-field>
            <label for="drawer-phone">Mobile number</label>
            <input type="tel" id="drawer-phone" autocomplete="tel" placeholder="+1 555 123 4567">
            <p class="hint">Include the country code. Message and data rates may apply.</p>
            <button class="btn btn-sm btn-quiet save-phone" type="submit" name="save-target" value="phone">Save your number</button>
          </div>
        </section>
        <div class="drawer-actions">
          <button class="btn btn-beak" type="submit">Save settings</button>
          <button class="btn btn-quiet" type="button" data-start-tutorial><iconify-icon icon="pixelarticons:play" aria-hidden="true"></iconify-icon>Site guide</button>
        </div>
        <p class="settings-save-status" data-settings-status role="status" aria-live="polite"></p>
      </form>`;

    content.querySelector(".settings-who").textContent = `Notification preferences for ${currentUser.name}.`;
    const digest = content.querySelector("#drawer-pref-digest");
    const reminders = content.querySelector("#drawer-pref-reminders");
    const texts = content.querySelector("#drawer-pref-texts");
    const phone = content.querySelector("#drawer-phone");
    const phoneField = content.querySelector("[data-phone-field]");
    digest.checked = currentUser.weekly_digest !== false;
    reminders.checked = currentUser.class_reminders !== false;
    texts.checked = currentUser.text_notifications === true;
    phone.value = currentUser.phone_number || "";

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
      const digits = phone.value.replace(/\D/g, "");
      if (texts.checked && (!phone.value.trim().startsWith("+") || digits.length < 10 || digits.length > 15)) {
        toast("Enter a valid mobile number beginning with + and its country code.", "error");
        phone.focus();
        return;
      }
      const submit = event.submitter || form.querySelector('.drawer-actions button[type="submit"]');
      submit.disabled = true;
      saveStatus.textContent = "Saving...";
      try {
        currentUser = await api.updatePrefs({
          weekly_digest: digest.checked,
          class_reminders: reminders.checked,
          text_notifications: texts.checked,
          phone_number: texts.checked ? `+${digits}` : null,
        });
        phone.value = currentUser.phone_number || "";
        saveStatus.textContent = submit.value === "phone"
          ? "Your mobile number is saved."
          : "Your settings are saved.";
        toast(saveStatus.textContent, "beak");
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
    if (new URLSearchParams(window.location.search).get("settings") === "open") openSettings();
  }

  function initFloatFollow(root = document) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.querySelectorAll(".tilt, .float-follow").forEach((item) => {
      if (item.dataset.floatReady) return;
      item.dataset.floatReady = "true";
      let x = 0;
      let y = 0;
      let targetX = 0;
      let targetY = 0;
      let frame = null;

      const animate = () => {
        x += (targetX - x) * 0.1;
        y += (targetY - y) * 0.1;
        item.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
        if (Math.abs(targetX - x) > 0.03 || Math.abs(targetY - y) > 0.03) {
          frame = requestAnimationFrame(animate);
        } else {
          frame = null;
        }
      };
      const queue = () => {
        if (!frame) frame = requestAnimationFrame(animate);
      };
      item.addEventListener("pointermove", (event) => {
        const rect = item.getBoundingClientRect();
        targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 6;
        targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 4;
        queue();
      });
      item.addEventListener("pointerleave", () => {
        targetX = 0;
        targetY = 0;
        queue();
      });
    });
  }

  const galleryImages = [
    { src: "assets/events/music-room.jpg", alt: "Young musicians exploring records and guitar in a music room" },
    { src: "assets/events/percussion.jpg", alt: "Young musicians singing and playing drums" },
    { src: "assets/events/ensemble.jpg", alt: "A community music teacher leading a group instrument lesson" },
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
        link.className = "event-gallery-card float-follow";
        link.href = "calendar.html?v=2";
        link.innerHTML = `
          <img src="${image.src}" alt="${image.alt}" ${index ? 'loading="lazy"' : ""}>
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
      initFloatFollow(gallery);
    }

    if (notificationList) {
      notificationList.innerHTML = "";
      upcoming.slice(0, 1).forEach((event) => {
        const date = new Date(event.starts_at);
        const row = document.createElement("a");
        row.className = "notification-item";
        row.href = "calendar.html?v=2";
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

  async function initHomeSchedule() {
    if (!document.querySelector("#upcoming-gallery, #upcoming-notification-list")) return;
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
            "beak"
          );
          break;
        }
      }
    }
    sessionStorage.setItem(REMINDED_KEY, JSON.stringify(reminded));
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = await renderNav();
    renderFooter();
    initPixelBird();
    initSettings();
    initFloatFollow();
    document.body.classList.add("ready");
    initHomeSchedule();
    window.ToucanTour?.maybeAutoStart(user);
    checkReminders(user);
    setInterval(() => checkReminders(user), 5 * 60 * 1000);

    if (api.demoMode && !sessionStorage.getItem("toucan_demo_notice")) {
      sessionStorage.setItem("toucan_demo_notice", "1");
      toast("Demo mode: data lives in this browser. Connect Supabase in js/config.js to go live.");
    }
  });
})();
