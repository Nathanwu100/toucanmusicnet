// The photo strip under the home page headline.
//
// It drifts slowly on its own, curved round the viewer like a wrapped
// screen, and loops without end. The strip itself is decorative and hidden
// from assistive tech; the dots and arrows under it are the way to a
// particular photo, and using them holds the drift for a while.
//
// The photos live in assets/art/gallery as -sm WebP files. Adding one is an
// entry here plus the file. `shape` sets the tile's proportions: every tile
// stands at the same height, so a landscape photo is wider than a portrait
// one and nothing is cropped. The order alternates the two for rhythm.
//
// Everything moves by transform on an animation frame: no scrolling, no
// snapping, no scroll events, which is what lets it run the same on a phone
// as on a desktop.

(function () {
  "use strict";

  const PHOTOS = [
    { file: "quartet-outside", shape: "landscape" },
    { file: "first-lesson", shape: "portrait" },
    { file: "piano-lesson", shape: "landscape" },
    { file: "whiteboard", shape: "portrait" },
    { file: "at-the-window", shape: "landscape" },
    { file: "playing-together", shape: "portrait" },
    { file: "thumbs-up", shape: "portrait" },
    { file: "classroom", shape: "landscape" },
    { file: "taking-turns", shape: "portrait" },
  ];

  const strip = document.querySelector("[data-gallery]");
  if (!strip) return;
  const host = strip.parentElement;

  // The set is laid three times over so that wherever the loop is, there
  // are photos either side of the screen. The drift runs through the middle
  // copy and wraps back by exactly one set's width, and the copies are
  // pixel-identical, so the wrap is invisible.
  const COPIES = 3;
  const N = PHOTOS.length;
  strip.innerHTML = Array.from({ length: COPIES }, () => PHOTOS.map((photo) => `
    <li class="gallery-tile gallery-tile-${photo.shape}">
      <img src="assets/art/gallery/${photo.file}-sm.webp" alt="" decoding="async" draggable="false" />
    </li>`).join("")).join("");
  const tiles = Array.from(strip.children);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SPEED = 24;      // px per second of drift
  const MAX_TURN = 30;   // degrees a tile turns at the edge of the screen
  const MAX_LIFT = 130;  // px a tile comes toward the viewer at the edge
  const GLIDE_MS = 650;  // how long a step to a chosen photo takes
  const HOLD_MS = 6000;  // how long the drift waits after somebody chooses

  let setWidth = 0;
  let viewWidth = 0;
  let startOffset = 0;   // the offset that centres the middle copy's first photo
  let centres = [];      // each tile's centre, in the strip's own coordinates

  function measure() {
    viewWidth = host.clientWidth;
    setWidth = tiles[N].offsetLeft - tiles[0].offsetLeft;
    centres = tiles.map((tile) => tile.offsetLeft + tile.offsetWidth / 2);
    startOffset = centres[N] - viewWidth / 2;
  }

  // Positions are distances travelled from startOffset, kept within one
  // set's width. `travelled` is where the strip is now.
  const wrap = (x) => ((x % setWidth) + setWidth) % setWidth;
  const positionOf = (photo) => wrap(centres[N + photo] - viewWidth / 2 - startOffset);
  function photoAt(position) {
    const middle = startOffset + position + viewWidth / 2;
    let best = 0;
    for (let i = 0; i < tiles.length; i++) {
      if (Math.abs(centres[i] - middle) < Math.abs(centres[best] - middle)) best = i;
    }
    return best % N;
  }

  // The curve. Each tile turns on its vertical axis by how far it sits from
  // the centre of the screen, its outer edge coming toward the viewer, and
  // comes forward besides, so the row wraps round the viewer. A tile at the
  // centre is flat.
  function paint(offset) {
    strip.style.transform = `translate3d(${-offset}px, 0, 0)`;
    const half = viewWidth / 2;
    const middle = offset + half;
    for (let i = 0; i < tiles.length; i++) {
      const t = (centres[i] - middle) / half;
      if (Math.abs(t) > 1.6 || reducedMotion.matches) { tiles[i].style.transform = ""; continue; }
      const eased = Math.sign(t) * Math.min(1, Math.abs(t)) ** 1.35;
      tiles[i].style.transform = `translateZ(${Math.abs(eased) * MAX_LIFT}px) rotateY(${-eased * MAX_TURN}deg)`;
    }
  }

  // ---------------------------------------------------------- the dots
  const dots = document.querySelector("[data-gallery-dots]");
  const dotButtons = [];
  if (dots) {
    dots.innerHTML = PHOTOS.map((_, i) =>
      `<button type="button" class="gallery-dot" data-photo="${i}" aria-label="Show photo ${i + 1} of ${N}"></button>`).join("");
    dotButtons.push(...dots.querySelectorAll(".gallery-dot"));
  }
  let shown = -1;
  function markShown(photo) {
    if (photo === shown) return;
    shown = photo;
    dotButtons.forEach((dot, i) => {
      if (i === photo) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  }

  // ---------------------------------------------------------- the loop
  // The drift only runs while the hero is on screen and the tab is visible;
  // off screen it would be work nobody sees. Progress is kept as distance,
  // so a pause does not make it jump on resume. A glide -- somebody chose a
  // photo -- eases the strip to that photo by the shorter way round, then
  // holds there before the drift picks up again.
  let travelled = 0;
  let last = 0;
  let frame = 0;
  let onScreen = true;
  let glide = null;      // { from, to, start }
  let holdUntil = 0;

  const easeOut = (x) => 1 - (1 - x) ** 3;

  function tick(now) {
    frame = 0;
    if (!last) last = now;
    if (glide) {
      const k = Math.min(1, (now - glide.start) / GLIDE_MS);
      travelled = wrap(glide.from + glide.delta * easeOut(k));
      if (k === 1) glide = null;
    } else if (now >= holdUntil && !reducedMotion.matches) {
      travelled = wrap(travelled + (now - last) / 1000 * SPEED);
    }
    last = now;
    paint(startOffset + travelled);
    markShown(photoAt(travelled));
    const moving = glide || (now < holdUntil) || !reducedMotion.matches;
    if (onScreen && !document.hidden && moving) frame = requestAnimationFrame(tick);
  }
  function run() {
    if (frame) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  }

  let chosen = 0; // the photo a glide is heading for; two quick presses step from it
  function goTo(photo) {
    chosen = ((photo % N) + N) % N;
    const to = positionOf(chosen);
    // The shorter way round the loop, so "next" from the last photo steps
    // forward to the first rather than winding all the way back.
    let delta = wrap(to - travelled);
    if (delta > setWidth / 2) delta -= setWidth;
    glide = { from: travelled, delta, start: performance.now() };
    holdUntil = performance.now() + GLIDE_MS + HOLD_MS;
    run();
  }

  const prev = document.querySelector("[data-gallery-prev]");
  const next = document.querySelector("[data-gallery-next]");
  const current = () => (glide ? chosen : shown);
  if (prev) prev.addEventListener("click", () => goTo(current() - 1));
  if (next) next.addEventListener("click", () => goTo(current() + 1));
  if (dots) dots.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-photo]");
    if (dot) goTo(Number(dot.dataset.photo));
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) run();
    }).observe(host);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) run(); });
  reducedMotion.addEventListener("change", () => { measure(); run(); });
  window.addEventListener("resize", () => { measure(); paint(startOffset + travelled); });
  window.addEventListener("load", () => { measure(); paint(startOffset + travelled); });

  measure();
  paint(startOffset);
  markShown(0);
  run();
})();
