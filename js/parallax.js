// Shared layered-parallax engine.
//
// One rAF loop, one pointer listener and one scroll listener drive every
// depth layer on the site — the silk backdrop, the hero's sponsor planes and
// the hero stage itself all register here rather than each running their own
// animation loop.
//
// A layer is any element that should sit on its own plane. Declare one in
// markup with data-parallax plus the knobs below, or call
// ToucanParallax.register(el, config) from script:
//
//   data-px / data-py   pointer travel in px at full deflection
//   data-z              resting translateZ, in px (needs a perspective parent)
//   data-scroll         px moved per px of page scroll; positive lags behind
//                       the page (reads as far away), negative outruns it
//   data-rx / data-ry   max 3D rotation from the pointer, in degrees
//   data-rz             max in-plane rotation from the pointer, in degrees
//   data-scale          constant scale applied after the transform
//   data-reveal-z       extra depth held at load and eased away on settle
//   data-reveal-fade    "true" to fade the layer in with that settle
//
// Nothing here writes to layout properties: every frame is a transform (and
// occasionally an opacity), both of which the compositor can handle without
// a reflow.
//
// Pointer response is interpolated toward its target rather than pinned to
// the cursor, so layers carry a little weight instead of snapping. Scroll is
// applied directly — easing it makes the page feel like it is lagging.

(function () {
  "use strict";

  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarseQuery = window.matchMedia("(pointer: coarse)");

  const INTRO_MS = 950;
  const EASE = 0.085;
  const EPSILON = 0.0006;

  const layers = [];
  let pointerTargetX = 0, pointerTargetY = 0;
  let pointerX = 0, pointerY = 0;
  let scrollY = window.scrollY || 0;
  let introStart = 0;
  let introEase = 0;
  let raf = null;

  let reduced = reduceQuery.matches;
  let pointerDriven = !reduced && !coarseQuery.matches;

  // Smaller screens get the same composition at a shorter throw: the same
  // pixel offsets that read as depth at 1440px read as drift at 380px.
  let range = 1;
  function computeRange() {
    const w = window.innerWidth;
    range = w < 700 ? 0.38 : w < 1080 ? 0.66 : 1;
  }
  computeRange();

  const clamp = (n) => (n < -1 ? -1 : n > 1 ? 1 : n);

  function num(el, key, fallback) {
    const raw = el.dataset[key];
    if (raw === undefined || raw === "") return fallback;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function register(el, config) {
    if (!el || el.dataset.parallaxBound === "true") return null;
    el.dataset.parallaxBound = "true";
    const layer = Object.assign({
      el, px: 0, py: 0, z: 0, scroll: 0, rx: 0, ry: 0, rz: 0,
      scale: 1, revealZ: 0, revealFade: false,
    }, config || {});
    layers.push(layer);
    if (layer.revealFade && !reduced) el.style.opacity = "0";
    queue();
    return layer;
  }

  function collect(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-parallax]").forEach((el) => {
      register(el, {
        px: num(el, "px", 0),
        py: num(el, "py", 0),
        z: num(el, "z", 0),
        scroll: num(el, "scroll", 0),
        rx: num(el, "rx", 0),
        ry: num(el, "ry", 0),
        rz: num(el, "rz", 0),
        scale: num(el, "scale", 1),
        revealZ: num(el, "revealZ", 0),
        revealFade: el.dataset.revealFade === "true",
      });
    });
  }

  function transformFor(layer) {
    // The reveal offset is held at load and eased to zero, so every plane
    // arrives from its own distance instead of the page snapping into place.
    const depth = layer.z + (1 - introEase) * layer.revealZ;
    const x = pointerX * layer.px * range;
    const y = pointerY * layer.py * range + scrollY * layer.scroll * range;

    let out = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${depth.toFixed(2)}px)`;
    if (layer.rx) out += ` rotateX(${(-pointerY * layer.rx * range).toFixed(3)}deg)`;
    if (layer.ry) out += ` rotateY(${(pointerX * layer.ry * range).toFixed(3)}deg)`;
    if (layer.rz) out += ` rotate(${(pointerX * layer.rz * range).toFixed(3)}deg)`;
    if (layer.scale !== 1) out += ` scale(${layer.scale})`;
    return out;
  }

  function frame(now) {
    raf = null;
    const stamp = now || performance.now();
    if (!introStart) introStart = stamp;

    const t = reduced ? 1 : Math.min(1, (stamp - introStart) / INTRO_MS);
    introEase = 1 - Math.pow(1 - t, 3);

    if (pointerDriven) {
      pointerX += (pointerTargetX - pointerX) * EASE;
      pointerY += (pointerTargetY - pointerY) * EASE;
    } else {
      pointerX = 0;
      pointerY = 0;
    }

    for (const layer of layers) {
      layer.el.style.transform = transformFor(layer);
      if (layer.revealFade) {
        // Handing opacity back to the stylesheet once settled keeps the
        // resting value in CSS, where the rest of the design lives.
        layer.el.style.opacity = t < 1 ? introEase.toFixed(3) : "";
      }
    }

    const chasing = pointerDriven &&
      (Math.abs(pointerTargetX - pointerX) > EPSILON || Math.abs(pointerTargetY - pointerY) > EPSILON);
    if (chasing || t < 1) queue();
  }

  function queue() {
    if (raf === null) raf = requestAnimationFrame(frame);
  }

  function rest() {
    pointerTargetX = 0;
    pointerTargetY = 0;
    queue();
  }

  window.addEventListener("pointermove", (event) => {
    if (!pointerDriven || event.pointerType === "touch") return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;
    // Viewport-relative and normalised to -1..1, so a fixed backdrop and an
    // in-flow hero layer answer to the same cursor position.
    pointerTargetX = clamp((event.clientX / w) * 2 - 1);
    pointerTargetY = clamp((event.clientY / h) * 2 - 1);
    queue();
  }, { passive: true });

  document.addEventListener("pointerleave", rest);
  window.addEventListener("blur", rest);

  window.addEventListener("scroll", () => {
    scrollY = window.scrollY || 0;
    queue();
  }, { passive: true });

  window.addEventListener("resize", () => {
    computeRange();
    queue();
  }, { passive: true });

  const onMotionChange = () => {
    reduced = reduceQuery.matches;
    pointerDriven = !reduced && !coarseQuery.matches;
    if (reduced) {
      introStart = 0;
      introEase = 1;
      layers.forEach((layer) => { layer.el.style.opacity = ""; });
    }
    queue();
  };
  reduceQuery.addEventListener("change", onMotionChange);
  coarseQuery.addEventListener("change", onMotionChange);

  window.ToucanParallax = { register, collect, refresh: queue };

  collect();
})();
