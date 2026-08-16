// The roster shown on about.html.
//
// Kept in script rather than hand-written into the page so the cards stay
// consistent and adding a person is a one-line change here.
//
// -------------------------------------------------------------------------
// Every name is a placeholder. Replace "Untitled" with the real person, and
// add a `photo` path to any entry to use a portrait; without one the card
// falls back to a monogram in the entry's accent colour. The roles and
// blurbs below are placeholders too.
// -------------------------------------------------------------------------

(function () {
  "use strict";

  const TEAM = [
    {
      name: "Untitled",
      role: "Founder & Program Director",
      accent: "coral",
      blurb: "Started Toucan with a borrowed keyboard and one room on loan. Still teaches the Tuesday piano class.",
    },
    {
      name: "Untitled",
      role: "Lead Piano Teacher",
      accent: "beak",
      blurb: "Believes a student should make sound in the first ten minutes of the first lesson, every time.",
    },
    {
      name: "Untitled",
      role: "Strings Lead — Violin & Viola",
      accent: "sky",
      blurb: "Runs the violin and viola tracks, and tunes roughly forty instruments a week without complaint.",
    },
    {
      name: "Untitled",
      role: "Volunteer Coordinator",
      accent: "leaf",
      blurb: "Matches volunteers to classes and makes sure nobody's first evening is a confusing one.",
    },
    {
      name: "Untitled",
      role: "Performance & Showcase Lead",
      accent: "coral",
      blurb: "Books the halls, moves the pianos, and gets every student onto a real stage at least twice a year.",
    },
    {
      name: "Untitled",
      role: "Family Liaison",
      accent: "sky",
      blurb: "First point of contact for families, and the reason the waiting list actually moves.",
    },
  ];

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));

  const initials = (name) => name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  function avatarMarkup(member) {
    if (member.photo) {
      return `<img class="team-avatar-photo" src="${escape(member.photo)}" alt="" loading="lazy" decoding="async" />`;
    }
    return `<span class="team-avatar-monogram" aria-hidden="true">${escape(initials(member.name))}</span>`;
  }

  function cardMarkup(member) {
    return `
      <article class="team-card">
        <span class="team-avatar team-avatar-${escape(member.accent || "leaf")}">${avatarMarkup(member)}</span>
        <h3>${escape(member.name)}</h3>
        <p class="team-role">${escape(member.role)}</p>
        ${member.blurb ? `<p class="team-blurb">${escape(member.blurb)}</p>` : ""}
      </article>`;
  }

  const grid = document.querySelector("[data-team-grid]");
  if (grid) grid.innerHTML = TEAM.map(cardMarkup).join("");

  window.ToucanTeam = { members: TEAM };
})();
