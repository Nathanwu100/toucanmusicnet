// No rubber-banding past the ends of the page.
//
// The stylesheet says overscroll-behavior: none, and every browser but one
// honours it. iOS Safari still bounces the document itself, so on a touch
// screen the page also refuses the first move of a swipe that would carry
// it past the top or the bottom. A swipe that a scrolling box inside the
// page can take (the timetable, the settings drawer) is left to that box,
// and a sideways swipe (the photo strip) is not the page's business.

(function () {
  "use strict";

  let startX = 0;
  let startY = 0;

  // Whether some scrolling box under `el` can still move in this direction:
  // dy > 0 is a finger moving down, which scrolls toward the top.
  function boxTakesIt(el, dy) {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (!(node instanceof Element)) return false;
      const { overflowY } = getComputedStyle(node);
      if (overflowY !== "auto" && overflowY !== "scroll") continue;
      if (node.scrollHeight <= node.clientHeight) continue;
      if (dy > 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
    }
    return false;
  }

  document.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }, { passive: true });

  document.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 1 || !event.cancelable) return;
    const dx = event.touches[0].clientX - startX;
    const dy = event.touches[0].clientY - startY;
    if (Math.abs(dy) <= Math.abs(dx)) return;
    if (boxTakesIt(event.target, dy)) return;
    const root = document.documentElement;
    const atTop = window.scrollY <= 0;
    const atBottom = window.scrollY + window.innerHeight >= root.scrollHeight - 1;
    if ((dy > 0 && atTop) || (dy < 0 && atBottom)) event.preventDefault();
  }, { passive: false });
})();
