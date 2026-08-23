// The roster shown on about.html.
//
// Kept in script rather than hand-written into the page so the cards stay
// consistent and adding a person is a one-line change here.
//
// -------------------------------------------------------------------------
// Each card flips on click to show its back. Roles and bios are not written
// yet: leave `role` and `bio` empty and the back shows a quiet placeholder.
// Filling either one in is all it takes -- no markup or CSS changes needed.
// -------------------------------------------------------------------------

(function () {
  "use strict";

  const TEAM = [
    { name: "Aiden",  photo: "assets/team/aiden.webp",  role: "", bio: "" },
    { name: "Bryan",  photo: "assets/team/bryan.webp",  role: "", bio: "" },
    { name: "Carrie", photo: "assets/team/carrie.jpg",  role: "", bio: "" },
    { name: "Luke",   photo: "assets/team/luke.webp",   role: "", bio: "" },
    { name: "Sameer", photo: "assets/team/sameer.webp", role: "", bio: "" },
    { name: "Sean",   photo: "assets/team/sean.webp",   role: "", bio: "" },
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

  function photoMarkup(member) {
    if (member.photo) {
      return `<img src="${escape(member.photo)}" alt="" loading="lazy" decoding="async" />`;
    }
    return `<span class="team-photo-monogram" aria-hidden="true">${escape(initials(member.name))}</span>`;
  }

  function memberMarkup(member) {
    const name = escape(member.name);
    const role = escape(member.role);
    const bio = escape(member.bio);
    return `
      <li class="team-member">
        <button class="team-card" type="button" data-team-card aria-pressed="false"
                aria-label="${name} — flip for bio">
          <span class="team-card-inner">
            <span class="team-card-face team-card-front">
              <span class="team-photo">${photoMarkup(member)}</span>
              <span class="team-card-name">${name}</span>
            </span>
            <span class="team-card-face team-card-back">
              <span class="team-card-name">${name}</span>
              ${role ? `<span class="team-role">${role}</span>` : ""}
              <span class="team-bio${bio ? "" : " team-bio-empty"}">${bio || "Bio coming soon."}</span>
            </span>
          </span>
        </button>
      </li>`;
  }

  const list = document.querySelector("[data-team-list]");
  if (list) {
    list.innerHTML = TEAM.map(memberMarkup).join("");
    list.addEventListener("click", (event) => {
      const card = event.target.closest("[data-team-card]");
      if (!card || !list.contains(card)) return;
      const flipped = card.getAttribute("aria-pressed") === "true";
      card.setAttribute("aria-pressed", flipped ? "false" : "true");
    });
  }

  window.ToucanTeam = { members: TEAM };
})();
