// About us, presented as a team overlay rather than a separate page.
//
// Anything with [data-open-team] opens it — the nav tab, the footer link —
// and the page underneath stays put, dimmed and blurred behind the panel.
//
// -------------------------------------------------------------------------
// PLACEHOLDER ROSTER: the names and blurbs below are stand-ins so the layout
// can be seen with real content in it. Replace them with the actual people
// before this goes in front of families. Drop a `photo` path on any member to
// use a real portrait; without one the card falls back to a monogram in the
// member's accent colour.
// -------------------------------------------------------------------------

(function () {
  "use strict";

  const TEAM = [
    {
      name: "Maya Ellison",
      role: "Founder & Program Director",
      accent: "coral",
      blurb: "Started Toucan with a borrowed keyboard and one room on loan. Still teaches the Tuesday piano class.",
    },
    {
      name: "Daniel Okafor",
      role: "Lead Piano Teacher",
      accent: "beak",
      blurb: "Believes a student should make sound in the first ten minutes of the first lesson, every time.",
    },
    {
      name: "Priya Raman",
      role: "Strings Lead — Violin & Viola",
      accent: "sky",
      blurb: "Runs the violin and viola tracks, and tunes roughly forty instruments a week without complaint.",
    },
    {
      name: "Sofia Marchetti",
      role: "Volunteer Coordinator",
      accent: "leaf",
      blurb: "Matches volunteers to classes and makes sure nobody's first evening is a confusing one.",
    },
    {
      name: "James Whitfield",
      role: "Performance & Showcase Lead",
      accent: "coral",
      blurb: "Books the halls, moves the pianos, and gets every student onto a real stage at least twice a year.",
    },
    {
      name: "Aiko Tanaka",
      role: "Family Liaison",
      accent: "sky",
      blurb: "First point of contact for families, and the reason the waiting list actually moves.",
    },
  ];

  const INTRO = {
    kicker: "About us",
    title: "Taught by your neighbors.",
    body: "Toucan Music is a community nonprofit teaching piano, violin, and viola to children who have had the least access to music education. Volunteer teachers, a fixed weekly schedule, and no tuition at any point.",
  };

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));

  const initials = (name) => name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  let overlay = null;
  let panel = null;
  let opener = null;
  let closeTimer = null;

  function avatarMarkup(member) {
    if (member.photo) {
      return `<img class="team-avatar-photo" src="${escape(member.photo)}" alt="" loading="lazy" decoding="async" />`;
    }
    return `<span class="team-avatar-monogram" aria-hidden="true">${escape(initials(member.name))}</span>`;
  }

  function cardMarkup(member, index) {
    return `
      <article class="team-card" style="--card-index: ${index}">
        <span class="team-avatar team-avatar-${escape(member.accent || "leaf")}">${avatarMarkup(member)}</span>
        <h3>${escape(member.name)}</h3>
        <p class="team-role">${escape(member.role)}</p>
        ${member.blurb ? `<p class="team-blurb">${escape(member.blurb)}</p>` : ""}
      </article>`;
  }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "team-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="team-scrim" data-close-team></div>
      <div class="team-panel" role="dialog" aria-modal="true" aria-labelledby="team-overlay-title">
        <button class="icon-btn team-close" type="button" data-close-team aria-label="Close about us" data-tooltip="Close">
          <iconify-icon icon="pixelarticons:close" aria-hidden="true"></iconify-icon>
        </button>
        <header class="team-intro">
          <p class="eyebrow">${escape(INTRO.kicker)}</p>
          <h2 id="team-overlay-title">${escape(INTRO.title)}</h2>
          <p class="team-intro-body">${escape(INTRO.body)}</p>
        </header>
        <div class="team-grid">${TEAM.map(cardMarkup).join("")}</div>
        <footer class="team-outro">
          <p>Every class and event lists its open volunteer spots. Musical training helps for teaching, and is entirely optional for everything else.</p>
          <div class="team-outro-actions">
            <a class="btn btn-beak" href="signup.html">Join Toucan Music</a>
            <a class="btn" href="mission.html">Read our mission</a>
          </div>
        </footer>
      </div>`;

    panel = overlay.querySelector(".team-panel");
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-team]")) close();
    });
  }

  function focusables() {
    return Array.from(panel.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.offsetParent !== null);
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    // Keeps tabbing inside the dialog while it owns the screen.
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function open(trigger) {
    if (!overlay) build();
    if (overlay.classList.contains("open")) return;
    window.clearTimeout(closeTimer);
    opener = trigger || document.activeElement;

    overlay.hidden = false;
    document.body.classList.add("team-open");
    // One frame between unhiding and the open class so the entrance
    // transition has a start value to animate from.
    requestAnimationFrame(() => overlay.classList.add("open"));
    panel.scrollTop = 0;
    overlay.querySelector(".team-close").focus();
    document.addEventListener("keydown", onKeydown);
  }

  function close() {
    if (!overlay || !overlay.classList.contains("open")) return;
    overlay.classList.remove("open");
    document.body.classList.remove("team-open");
    document.removeEventListener("keydown", onKeydown);
    closeTimer = window.setTimeout(() => {
      overlay.hidden = true;
      opener?.focus?.();
    }, 420);
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-team]");
    if (!trigger) return;
    event.preventDefault();
    open(trigger);
  });

  window.ToucanTeam = { open, close, members: TEAM };
})();
