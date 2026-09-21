// The photo mosaic on about.html, and the viewer it opens into.
//
// The photos live in assets/art/gallery as two sizes each: the -sm file
// fills the tile, the full one is what the viewer shows. Adding a photo is
// one entry here plus the two files; the mosaic shapes are assigned by
// position in CSS, so a tenth photo lands in the next free cell.
//
// `shape` is the crop the tile makes: "landscape" tiles are wider than tall,
// "portrait" tiles taller than wide, and "hero" is the one big landscape
// tile at the top. The viewer never crops -- it letterboxes the full image.

(function () {
  "use strict";

  const PHOTOS = [
    { file: "quartet-outside", shape: "hero", alt: "Four violinists rehearsing outdoors around a single music stand." },
    { file: "first-lesson", shape: "portrait", alt: "A tutor guiding a young student's hands on a violin while a parent looks on." },
    { file: "piano-lesson", shape: "landscape", alt: "Two tutors pointing out a passage in the score for a student at a keyboard." },
    { file: "thumbs-up", shape: "portrait", alt: "A tutor holding a violin and giving a thumbs up." },
    { file: "whiteboard", shape: "portrait", alt: "A tutor and a young student writing note names on a whiteboard." },
    { file: "playing-together", shape: "portrait", alt: "A tutor and a student playing violin side by side from the same stand." },
    { file: "taking-turns", shape: "portrait", alt: "Students playing violin at the front while others wait their turn." },
    { file: "at-the-window", shape: "landscape", alt: "Three violinists playing beside a large window." },
    { file: "classroom", shape: "landscape", alt: "A classroom mid-lesson, with instrument cases open and a whiteboard in use." },
  ];

  const CAPTIONS = [
    "Warming up outside before class.",
    "A first lesson: where the fingers go.",
    "Working through a new piece at the keyboard.",
    "Ready for the next lesson.",
    "Note names on the board, then onto the staff.",
    "Playing a passage together, side by side.",
    "Taking turns on a piece while the tutor listens.",
    "Three violins at the window, one stand.",
    "A full classroom, between one lesson and the next.",
  ];

  const mosaic = document.querySelector("[data-gallery]");
  if (!mosaic) return;

  const src = (photo, size) => `assets/art/gallery/${photo.file}${size === "sm" ? "-sm" : ""}.webp`;

  mosaic.innerHTML = PHOTOS.map((photo, i) => `
    <li class="gallery-tile gallery-tile-${photo.shape}">
      <button type="button" class="gallery-open" data-index="${i}" aria-label="Open photo ${i + 1} of ${PHOTOS.length}">
        <img src="${src(photo, "sm")}" alt="${photo.alt}" loading="${i < 2 ? "eager" : "lazy"}" decoding="async" />
      </button>
    </li>`).join("");

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
    caption.textContent = CAPTIONS[current];
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

  mosaic.addEventListener("click", (event) => {
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
