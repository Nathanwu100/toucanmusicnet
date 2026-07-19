// First-visit calendar walkthrough and reusable music-note celebration.

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

  function waitForCalendar(attempt = 0) {
    const grid = document.querySelector("#cal-grid .cal-cell");
    if (grid || attempt > 40) return Promise.resolve(Boolean(grid));
    return new Promise((resolve) => {
      setTimeout(() => resolve(waitForCalendar(attempt + 1)), 100);
    });
  }

  async function maybeAutoStart(user) {
    if (!user || sessionStorage.getItem(PENDING_KEY) !== user.id) return;
    if (!window.driver?.js?.driver || !(await waitForCalendar())) return;

    const safeName = String(user.name).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
    const roleCopy = user.role === "volunteer"
      ? "Open a class to see volunteer availability and claim a spot."
      : user.role === "admin"
        ? "Open an item to review it. Admin controls also let you create and edit events."
        : "Open any class or event to see its time, place, and details.";

    function markComplete() {
      localStorage.setItem(seenKey(user), "1");
      sessionStorage.removeItem(PENDING_KEY);
    }

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
      steps: [
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
            description: "Use the pixel arrow controls to browse upcoming and past schedules.",
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
            description: "The settings drawer controls weekly email, class reminders, and text notifications. You can also replay this guide there.",
            side: "bottom",
          },
        },
      ],
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
