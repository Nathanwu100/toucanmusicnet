// First-visit calendar walkthrough and reusable music-note celebration.
//
// The walkthrough is replayed from Settings. For a student it is a guide to
// signing up: pick a day, open the class, pick a time, and what comes after.

(function () {
  const PENDING_KEY = "toucan_tour_pending_v1";
  const seenKey = (user) => `toucan_tour_seen_v1:${user.id}`;

  function queueFirstVisit(user) {
    if (!user || localStorage.getItem(seenKey(user))) return;
    sessionStorage.setItem(PENDING_KEY, user.id);
  }

  function replay(user) {
    if (!user) return;
    sessionStorage.setItem(PENDING_KEY, user.id);
    window.location.href = "calendar.html?v=3";
  }

  // driver.js is a walkthrough library most visits never need, and it used to
  // load on every calendar page anyway -- about 200ms of script and a
  // stylesheet, for a tour that runs once per account. It is fetched the
  // first time somebody actually starts the tour instead.
  const DRIVER_VERSION = "1.7.0";
  let driverLoading = null;

  function loadDriver() {
    if (window.driver?.js?.driver) return Promise.resolve(true);
    if (driverLoading) return driverLoading;
    driverLoading = new Promise((resolve) => {
      const styles = document.createElement("link");
      styles.rel = "stylesheet";
      styles.href = `https://cdn.jsdelivr.net/npm/driver.js@${DRIVER_VERSION}/dist/driver.css`;
      document.head.appendChild(styles);

      const script = document.createElement("script");
      script.src = `https://cdn.jsdelivr.net/npm/driver.js@${DRIVER_VERSION}/dist/driver.js.iife.js`;
      script.onload = () => resolve(Boolean(window.driver?.js?.driver));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
    return driverLoading;
  }

  function waitForCalendar(attempt = 0) {
    const grid = document.querySelector("#cal-grid .cal-cell");
    if (grid || attempt > 40) return Promise.resolve(Boolean(grid));
    return new Promise((resolve) => {
      setTimeout(() => resolve(waitForCalendar(attempt + 1)), 100);
    });
  }

  async function maybeAutoStart(user) {
    if (!user || sessionStorage.getItem(PENDING_KEY) !== user.id) return;
    // driver.js comes from a CDN. If it did not arrive the walkthrough cannot
    // run, and silently doing nothing reads as a broken button -- say so and
    // leave it queued so the next load can try again.
    if (!(await loadDriver())) {
      window.toast?.("The guided tour could not load. Check your connection and try Settings again.", "error");
      return;
    }
    if (!(await waitForCalendar())) return;

    const safeName = String(user.name).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
    function markComplete() {
      localStorage.setItem(seenKey(user), "1");
      sessionStorage.removeItem(PENDING_KEY);
    }

    // A student's tour walks through signing up for a class. It opens the
    // next real class first, so the day, the class, and its timetable are
    // on screen to point at; an example slot column is drawn in the popover
    // for the step about picking a time, so it reads the same whether the
    // class is split into slots or not.
    const isStudent = user.role === "student";
    if (isStudent) await window.ToucanCalendar?.showNextClass();
    const timetableOrList = () => {
      const timetable = document.querySelector("#class-timetable");
      return timetable && !timetable.hidden ? timetable : document.querySelector("#day-event-list");
    };
    const exampleTimetable = `
      <div class="tour-example" aria-hidden="true">
        <span class="tour-example-head">Violin</span>
        <span class="tour-example-slot">4:00 – 4:30<em>2 places open</em></span>
        <span class="tour-example-slot is-mine">4:30 – 5:00<em>Your slot</em></span>
        <span class="tour-example-slot is-full">5:00 – 5:30<em>Full</em></span>
      </div>`;

    const studentSteps = [
      {
        popover: {
          title: `Welcome, ${safeName}`,
          description: "Here is how to find a class and sign up for it, step by step.",
        },
      },
      {
        element: ".nav-icon-link[aria-label='Calendar']",
        popover: {
          title: "Your schedule",
          description: "The calendar icon brings you back to classes and events from anywhere on the site.",
          side: "bottom",
        },
      },
      {
        element: ".cal-head",
        popover: {
          title: "Move between months",
          description: "Use the arrows to browse upcoming and past schedules.",
          side: "bottom",
        },
      },
      {
        element: "#cal-grid",
        popover: {
          title: "1. Pick a day",
          description: "A day with a class shows its time and name. Press the day and it opens beside the calendar, or underneath on a phone.",
          side: "top",
        },
      },
      {
        element: "#day-event-list",
        popover: {
          title: "2. Open the class",
          description: "Press a class to see its instrument, time and place. A class with one place for everyone has a Join class button. A class split into time slots shows its timetable underneath.",
          side: "left",
        },
      },
      {
        element: timetableOrList,
        popover: {
          title: "3. Pick your time",
          description: "The timetable shows the columns for your instruments. Press the slot you want. A full slot is greyed out. See the other instruments shows every column, and the button under it brings yours back." + exampleTimetable,
          side: "left",
        },
      },
      {
        popover: {
          title: "4. You are booked",
          description: "A screen confirms your slot. Change slot moves you to another one, and Leave class gives the place back. We remind you before it starts.",
        },
      },
      {
        element: ".cal-legend",
        popover: {
          title: "Classes and events",
          description: "The legend shows which calendar items are recurring classes and which are special events.",
          side: "top",
        },
      },
      {
        element: "[data-tour='nav-settings']",
        popover: {
          title: "Preferences and help",
          description: "The settings drawer controls your instruments, weekly email, class reminders, text notifications and language. You can also replay this guide there.",
          side: "bottom",
        },
      },
    ];

    const roleCopy = user.role === "volunteer"
      ? "Open a class to see volunteer availability and claim a spot."
      : "Open an item to review it. Admin controls also let you create and edit events.";
    const otherSteps = [
      {
        popover: {
          title: `Welcome, ${safeName}`,
          description: "Here is the quickest way to find classes, events, and the tools available to your account.",
        },
      },
      {
        element: ".nav-icon-link[aria-label='Calendar']",
        popover: {
          title: "Your schedule",
          description: "The calendar icon brings you back to classes and events from anywhere on the site.",
          side: "bottom",
        },
      },
      {
        element: ".cal-head",
        popover: {
          title: "Move between months",
          description: "Use the arrows to browse upcoming and past schedules.",
          side: "bottom",
        },
      },
      {
        element: "#cal-grid",
        popover: {
          title: "Open a calendar item",
          description: roleCopy,
          side: "top",
        },
      },
      {
        element: ".cal-legend",
        popover: {
          title: "Classes and events",
          description: "The legend shows which calendar items are recurring classes and which are special events.",
          side: "top",
        },
      },
      {
        element: "[data-tour='nav-settings']",
        popover: {
          title: "Preferences and help",
          description: "The settings drawer controls weekly email, class reminders, text notifications and language. You can also replay this guide there.",
          side: "bottom",
        },
      },
    ];

    const tour = window.driver.js.driver({
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      smoothScroll: true,
      overlayColor: "#1c3135",
      overlayOpacity: 0.56,
      stagePadding: 8,
      stageRadius: 6,
      popoverClass: "toucan-tour",
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
      skipMissingElement: true,
      steps: isStudent ? studentSteps : otherSteps,
      onDoneClick: () => { markComplete(); tour.destroy(); },
      onCloseClick: () => { markComplete(); tour.destroy(); },
      onDestroyed: markComplete,
    });
    tour.drive();
  }

  window.ToucanTour = { queueFirstVisit, replay, maybeAutoStart };

  window.musicNoteConfetti = async function (origin) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const icons = ["note", "music", "keyboard-music"];
    const IconComponent = window.customElements.get("iconify-icon");
    let iconData = [];
    if (IconComponent?.loadIcon) {
      try {
        iconData = await Promise.all(
          icons.map((name) => IconComponent.loadIcon(`pixelarticons:${name}`))
        );
      } catch (error) {
        // The account flow should continue even if the icon API is unavailable.
      }
    }
    if (!iconData.length) return;

    const host = document.createElement("div");
    const rect = origin.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    host.className = "music-confetti";
    host.setAttribute("aria-hidden", "true");

    const colors = ["#b9654e", "#668b7c", "#d29a57", "#506c77"];
    const particles = [];
    for (let i = 0; i < 28; i += 1) {
      const particle = document.createElement("span");
      const data = iconData[i % iconData.length];
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const angle = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.22;
      const distance = 90 + Math.random() * 150;
      particle.className = "music-confetti-note";
      particle.style.left = `${originX - 11}px`;
      particle.style.top = `${originY - 11}px`;
      icon.setAttribute("viewBox", `${data.left || 0} ${data.top || 0} ${data.width} ${data.height}`);
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = data.body;
      particle.style.setProperty("--particle", colors[i % colors.length]);
      particle.appendChild(icon);
      host.appendChild(particle);
      particles.push({
        element: particle,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance - 58,
        delay: Math.random() * 90,
      });
    }
    document.body.appendChild(host);

    return new Promise((resolve) => {
      const startedAt = performance.now();
      const duration = 1050;

      function animate(now) {
        let active = false;
        particles.forEach(({ element, dx, dy, delay }) => {
          const progress = Math.max(0, Math.min(1, (now - startedAt - delay) / (duration - delay)));
          if (progress < 1) active = true;
          const eased = 1 - Math.pow(1 - progress, 3);
          const fade = progress < 0.12
            ? progress / 0.12
            : progress > 0.72
              ? (1 - progress) / 0.28
              : 1;
          element.style.left = `${originX - 11 + dx * eased}px`;
          element.style.top = `${originY - 11 + dy * eased + 34 * progress * progress}px`;
          element.style.opacity = String(Math.max(0, fade));
        });

        if (active) {
          requestAnimationFrame(animate);
        } else {
          host.remove();
          resolve();
        }
      }
      requestAnimationFrame(animate);
    });
  };
})();
