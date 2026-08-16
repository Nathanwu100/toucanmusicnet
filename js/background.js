// Three broad, solid-color ribbons create a softly folded silk backdrop.
// CSS handles the slow breathing motion; the shared parallax engine gives
// each ribbon its own depth so pointer and scroll separate them.
//
// These are the furthest planes in the scene, so their travel is the
// smallest of any layer on the page.

(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const host = document.createElement("div");
  host.className = "silk-bg";
  host.setAttribute("aria-hidden", "true");

  // depth: parallax multiplier (farther layers move less)
  const layers = [
    { depth: 0.12, cls: "silk-layer far" },
    { depth: 0.3, cls: "silk-layer mid" },
    { depth: 0.52, cls: "silk-layer near" },
  ];

  const ribbon = (i) => {
    const paths = [
      "M-120 250 C240 60 470 430 820 235 C1120 68 1380 380 1780 150 L1780 560 C1410 710 1110 410 770 610 C430 810 150 520 -120 720 Z",
      "M-140 560 C170 310 510 700 790 500 C1100 280 1370 680 1800 390 L1800 860 C1420 1040 1130 700 770 900 C420 1090 120 820 -140 1030 Z",
      "M-160 835 C160 610 430 980 760 785 C1110 570 1400 1000 1820 720 L1820 1220 L-160 1220 Z",
    ];
    const folds = [
      "M70 285 C390 180 560 440 830 275 C1100 110 1320 360 1600 220 C1320 440 1090 240 820 420 C540 610 330 310 70 430 Z",
      "M20 610 C320 430 530 730 800 560 C1100 370 1330 700 1660 510 C1320 780 1070 520 790 715 C500 910 280 590 20 760 Z",
      "M-20 875 C260 710 500 1010 770 840 C1060 660 1320 1010 1680 790 C1330 1070 1040 820 760 1000 C470 1180 230 900 -20 1030 Z",
    ];
    return `<svg viewBox="0 0 1680 1200" preserveAspectRatio="none"><path class="silk-ribbon" d="${paths[i]}"/><path class="silk-fold" d="${folds[i]}"/></svg>`;
  };

  const built = layers.map((l, i) => {
    const el = document.createElement("div");
    el.className = l.cls + (reduce ? " still" : "");
    el.innerHTML = ribbon(i);
    host.appendChild(el);
    return { el, depth: l.depth };
  });

  document.body.prepend(host);
  if (reduce || !window.ToucanParallax) return;

  built.forEach(({ el, depth }) => {
    window.ToucanParallax.register(el, {
      px: 24 * depth,
      py: 15 * depth,
      scroll: -0.17 * depth,
    });
  });
})();
