// The photo strip on about.html, and the viewer it opens into.
//
// The photos live in assets/art/gallery as two sizes each: the -sm file
// fills the tile, the full one is what the viewer shows. Adding a photo is
// one entry here plus the two files.
//
// `shape` sets the tile's proportions: every tile stands at the same height,
// so a "landscape" photo is wider than a "portrait" one and nothing is
// cropped. The order alternates the two so the strip has a rhythm.

(function () {
  "use strict";

  const PHOTOS = [
    { file: "quartet-outside", shape: "landscape", alt: "Four violinists rehearsing outdoors around a single music stand.", caption: "Warming up outside before class." },
    { file: "first-lesson", shape: "portrait", alt: "A tutor guiding a young student's hands on a violin while a parent looks on.", caption: "A first lesson: where the fingers go." },
    { file: "piano-lesson", shape: "landscape", alt: "Two tutors pointing out a passage in the score for a student at a keyboard.", caption: "Working through a new piece at the keyboard." },
    { file: "whiteboard", shape: "portrait", alt: "A tutor and a young student writing note names on a whiteboard.", caption: "Note names on the board, then onto the staff." },
    { file: "at-the-window", shape: "landscape", alt: "Three violinists playing beside a large window.", caption: "Three violins at the window, one stand." },
    { file: "playing-together", shape: "portrait", alt: "A tutor and a student playing violin side by side from the same stand.", caption: "Playing a passage together, side by side." },
    { file: "thumbs-up", shape: "portrait", alt: "A tutor holding a violin and giving a thumbs up.", caption: "Ready for the next lesson." },
    { file: "classroom", shape: "landscape", alt: "A classroom mid-lesson, with instrument cases open and a whiteboard in use.", caption: "A full classroom, between one lesson and the next." },
    { file: "taking-turns", shape: "portrait", alt: "Students playing violin at the front while others wait their turn.", caption: "Taking turns on a piece while the tutor listens." },
  ];

  const strip = document.querySelector("[data-gallery]");
  if (!strip) return;

  const src = (photo, size) => `assets/art/gallery/${photo.file}${size === "sm" ? "-sm" : ""}.webp`;

  strip.innerHTML = PHOTOS.map((photo, i) => `
    <li class="gallery-tile gallery-tile-${photo.shape}">
      <button type="button" class="gallery-open" data-index="${i}" aria-label="Open photo ${i + 1} of ${PHOTOS.length}">
        <img src="${src(photo, "sm")}" alt="${photo.alt}" loading="${i < 3 ? "eager" : "lazy"}" decoding="async" draggable="false" />
      </button>
    </li>`).join("");

  const tiles = Array.from(strip.children);

  // ------------------------------------------------------------- strip
  // The strip's scrollbar is hidden, so the controls row underneath stands
  // in for it: a bar showing how much is in view and where, the number of
  // the photo at the left edge, and arrows that page by one tile.
  const thumb = document.querySelector("[data-gallery-thumb]");
  const count = document.querySelector("[data-gallery-count]");
  const prev = document.querySelector("[data-gallery-prev]");
  const next = document.querySelector("[data-gallery-next]");

  // The strip's left padding is where a tile "starts" -- it is what
  // scroll-padding snaps to, so it is what the count and arrows measure by.
  const gutter = () => parseFloat(getComputedStyle(strip).paddingLeft) || 0;
  const tileStart = (tile) => tile.offsetLeft - gutter();

  function leadingIndex() {
    const max = strip.scrollWidth - strip.clientWidth;
    if (strip.scrollLeft >= max - 1) return tiles.length - 1; // the end, whatever is at the left edge
    const x = strip.scrollLeft + 2;
    let index = 0;
    tiles.forEach((tile, i) => { if (tileStart(tile) <= x) index = i; });
    return index;
  }

  function sync() {
    const max = strip.scrollWidth - strip.clientWidth;
    const fraction = max > 0 ? strip.scrollLeft / max : 0;
    const visible = max > 0 ? strip.clientWidth / strip.scrollWidth : 1;
    if (thumb) {
      thumb.style.width = `${visible * 100}%`;
      thumb.style.transform = `translateX(${fraction * (1 / visible - 1) * 100}%)`;
    }
    if (count) count.textContent = `${leadingIndex() + 1} / ${PHOTOS.length}`;
    if (prev) prev.disabled = strip.scrollLeft <= 1;
    if (next) next.disabled = strip.scrollLeft >= max - 1;
  }

  let pending = false;
  strip.addEventListener("scroll", () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; sync(); });
  }, { passive: true });
  window.addEventListener("resize", sync);
  window.addEventListener("load", sync);
  sync();

  function scrollToTile(i) {
    const tile = tiles[Math.max(0, Math.min(tiles.length - 1, i))];
    strip.scrollTo({ left: tileStart(tile), behavior: "smooth" });
  }
  if (prev) prev.addEventListener("click", () => scrollToTile(leadingIndex() - 1));
  if (next) next.addEventListener("click", () => {
    // Step to the first tile whose start is beyond the current one, so a
    // strip already sitting exactly on a tile moves by one.
    const x = strip.scrollLeft + 2;
    const target = tiles.findIndex((tile) => tileStart(tile) > x);
    scrollToTile(target === -1 ? tiles.length - 1 : target);
  });

  // Mouse drag scrolls the strip; touch already does. Snapping is off while
  // the pointer is down so the strip follows the hand, then the nearest
  // tile start is settled on when it lifts. A drag of any real distance
  // swallows the click that would otherwise open the viewer.
  let drag = null;
  let swallowClick = false;
  strip.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    swallowClick = false;
    drag = { x: event.clientX, left: strip.scrollLeft, moved: false };
    strip.classList.add("is-dragging");
  });
  strip.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    strip.scrollLeft = drag.left - dx;
  });
  function endDrag() {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    const x = strip.scrollLeft;
    const nearest = tiles.reduce((best, tile) =>
      Math.abs(tileStart(tile) - x) < Math.abs(tileStart(best) - x) ? tile : best, tiles[0]);
    strip.scrollTo({ left: tileStart(nearest), behavior: "smooth" });
    // Snapping comes back once the settle has finished, or it would fight it.
    setTimeout(() => strip.classList.remove("is-dragging"), 400);
    swallowClick = moved;
  }
  strip.addEventListener("pointerup", endDrag);
  strip.addEventListener("pointercancel", endDrag);
  strip.addEventListener("pointerleave", endDrag);

  // ------------------------------------------------------------ viewer
  const viewer = document.querySelector("[data-gallery-viewer]");
  if (!viewer || typeof viewer.showModal !== "function") return;

  const image = viewer.querySelector("[data-viewer-image]");
  const caption = viewer.querySelector("[data-viewer-caption]");
  const counter = viewer.querySelector("[data-viewer-counter]");
  const stage = viewer.querySelector("[data-viewer-stage]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let current = -1;
  let opener = null;
  const loaded = new Set();

  function preload(i) {
    const photo = PHOTOS[(i + PHOTOS.length) % PHOTOS.length];
    if (loaded.has(photo.file)) return;
    loaded.add(photo.file);
    const img = new Image();
    img.src = src(photo);
  }

  function show(i, direction) {
    current = (i + PHOTOS.length) % PHOTOS.length;
    const photo = PHOTOS[current];

    // The swap is a short cross-fade in the direction of travel. Setting
    // the class before the source means the incoming frame animates in
    // once decoded, rather than the old one flashing out.
    if (direction && !reducedMotion.matches) {
      stage.dataset.direction = direction;
      stage.classList.remove("is-entering");
      void stage.offsetWidth;
      stage.classList.add("is-entering");
    }

    image.src = src(photo);
    image.alt = photo.alt;
    caption.textContent = photo.caption;
    counter.textContent = `${current + 1} / ${PHOTOS.length}`;
    preload(current + 1);
    preload(current - 1);
  }

  function open(i, from) {
    opener = from || null;
    show(i);
    viewer.showModal();
    document.documentElement.classList.add("has-viewer");
  }

  function close() {
    viewer.close();
  }

  viewer.addEventListener("close", () => {
    document.documentElement.classList.remove("has-viewer");
    stage.classList.remove("is-entering");
    if (opener) opener.focus();
    opener = null;
  });

  strip.addEventListener("click", (event) => {
    if (swallowClick) { swallowClick = false; return; }
    const button = event.target.closest(".gallery-open");
    if (!button) return;
    open(Number(button.dataset.index), button);
  });

  viewer.querySelector("[data-viewer-prev]").addEventListener("click", () => show(current - 1, "prev"));
  viewer.querySelector("[data-viewer-next]").addEventListener("click", () => show(current + 1, "next"));
  viewer.querySelector("[data-viewer-close]").addEventListener("click", close);

  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") { event.preventDefault(); show(current + 1, "next"); }
    if (event.key === "ArrowLeft") { event.preventDefault(); show(current - 1, "prev"); }
    if (event.key === "Home") { event.preventDefault(); show(0, "prev"); }
    if (event.key === "End") { event.preventDefault(); show(PHOTOS.length - 1, "next"); }
  });

  // A click on the dark surround closes; a click on the photo, the caption
  // strip, or the controls does not.
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer || event.target === stage) close();
  });

  // Swipe on touch screens. Horizontal travel past the threshold turns the
  // page; anything mostly vertical is left alone so the gesture does not
  // fight the browser.
  let touchStart = null;
  viewer.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  viewer.addEventListener("touchend", (event) => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    show(dx < 0 ? current + 1 : current - 1, dx < 0 ? "next" : "prev");
  }, { passive: true });
})();
