// The roster shown on about.html.
//
// Kept in script rather than hand-written into the page so the cards stay
// consistent and adding a person is a one-line change here.
//
// Each card shows the portrait with the name and role along the bottom; the
// bio is revealed by hovering or focusing the card. Order is by role: the
// founder, then co-founders, then tutors.

(function () {
  "use strict";

  const TEAM = [
    {
      name: "Nathan",
      photo: "assets/team/nathan.webp",
      role: "Founder · Piano Tutor",
      bio: "9 years of piano and 3 years of viola. Outside music: art, long-distance running, and basketball.",
    },
    {
      name: "Sean",
      photo: "assets/team/sean.webp",
      role: "Co-Founder · Head of Technology · Viola Tutor",
      bio: "8 years of viola and violin. Outside music: programming and hockey.",
    },
    {
      name: "Sameer",
      photo: "assets/team/sameer.webp",
      role: "Co-Founder · Head of Math · Graphic Designer",
      bio: "AIME qualifier and USACO Gold division participant. Outside school: saxophone, basketball, track, 3D modeling, and guitar.",
    },
    {
      name: "Bryan",
      photo: "assets/team/bryan.webp",
      role: "Co-Founder · Violin & Cello Tutor",
      bio: "8 years of violin and 3 years of cello. Outside music: swimming.",
    },
    {
      name: "Aiden",
      photo: "assets/team/aiden.webp",
      role: "Co-Founder · Co-Head of Technology · Violin Tutor",
      bio: "4 years of violin. Outside music: robotics, 3D printing, and tennis.",
    },
    {
      name: "Carrie",
      photo: "assets/team/carrie.jpg",
      role: "Violin Tutor",
      bio: "7 years of violin and 4 years in advanced orchestras. Outside music: volleyball, taekwondo, and painting.",
    },
    {
      name: "Luke",
      photo: "assets/team/luke.webp",
      role: "Piano Tutor",
      bio: "6 years of piano. Outside music: basketball, track and field, and games.",
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
    // tabindex makes the card focusable, so the bio opens on keyboard focus
    // as well as hover. Without it the reveal would be pointer-only.
    return `
      <li class="team-member">
        <article class="team-card" tabindex="0">
          <span class="team-photo">${photoMarkup(member)}</span>
          <div class="team-card-body">
            <h2 class="team-card-name">${name}</h2>
            ${role ? `<p class="team-role">${role}</p>` : ""}
            ${bio ? `<div class="team-bio-reveal"><p class="team-bio">${bio}</p></div>` : ""}
          </div>
        </article>
      </li>`;
  }

  const list = document.querySelector("[data-team-list]");
  if (list) list.innerHTML = TEAM.map(memberMarkup).join("");

  window.ToucanTeam = { members: TEAM };
})();
