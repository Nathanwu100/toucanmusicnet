// Icons, bundled.
//
// These used to come from the Iconify CDN at runtime: a script, then a second
// request asking the API for whichever icons the page happened to use. That
// cost about 800ms of the load and made every icon pop in late.
//
// The 21 icons the site actually uses are inlined here instead, and a small
// custom element renders them. The <iconify-icon icon="..."> markup is
// unchanged, so nothing else had to move.
//
// Adding an icon means adding it to this map. To refresh the set:
//   curl "https://api.iconify.design/pixelarticons.json?icons=home,users,..."
// Pixelarticons is MIT licensed; see assets/sprites/README.md.

(function () {
  "use strict";

  const VIEWBOX = "0 0 24 24";
  const ICONS = {
  "pixelarticons:arrow-right": "<g fill=\"currentColor\"><path d=\"M4 11v2h16v-2zm12 2v2h2v-2zm-2 2v2h2v-2zm-2 2v2h2v-2zm4-6V9h2v2z\"/><path d=\"M14 15V7h2v8zm-2 2V5h2v12z\"/></g>",
  "pixelarticons:bell": "<g fill=\"currentColor\"><path d=\"M9 2h6v2H9zM7 4h2v2H7zm8 0h2v2h-2zM5 6h2v7H5zm12 0h2v7h-2zM3 13h2v4H3zm16 0h2v4h-2z\"/><path d=\"M3 15h18v2H3zm5 3h2v2H8zm6 0h2v2h-2zm-4 2h4v2h-4z\"/></g>",
  "pixelarticons:bell-ring": "<path fill=\"currentColor\" d=\"M14 22h-4v-2h4zm-4-2H8v-2h2zm6 0h-2v-2h2zM5 15h14v-2h2v4H3v-4h2zm2-2H5V6h2zm12 0h-2V6h2zM3 6H1V4h2zm6 0H7V4h2zm8 0h-2V4h2zm6 0h-2V4h2zM5 4H3V2h2zm10 0H9V2h6zm6 0h-2V2h2z\"/>",
  "pixelarticons:calendar": "<path fill=\"currentColor\" d=\"M5 4h14v2H5zm0 16h14v2H5zM3 10h2v10H3zm0-4h2v2H3zm16 0h2v2h-2zm0 4h2v10h-2zM3 8h18v2H3zm12-6h2v2h-2zM7 2h2v2H7z\"/>",
  "pixelarticons:calendar-plus": "<path fill=\"currentColor\" d=\"M15 2h2v2h4v18H3V4h4V2h2v2h6zM9 6H5v2h14V6zm-4 4v10h14V10zm6 2h2v2h2v2h-2v2h-2v-2H9v-2h2z\"/>",
  "pixelarticons:chevron-left": "<path fill=\"currentColor\" d=\"M8 13v-2h2v2zm2-2V9h2v2zm0 4v-2h2v2zm2-6V7h2v2zm0 8v-2h2v2zm2-10V5h2v2zm0 12v-2h2v2z\"/>",
  "pixelarticons:chevron-right": "<path fill=\"currentColor\" d=\"M16 13v-2h-2v2zm-2-2V9h-2v2zm0 4v-2h-2v2zm-2-6V7h-2v2zm0 8v-2h-2v2zM10 7V5H8v2zm0 12v-2H8v2z\"/>",
  "pixelarticons:close": "<path fill=\"currentColor\" d=\"M7 19H5v-2h2zm12 0h-2v-2h2zM9 15v2H7v-2zm8 2h-2v-2h2zm-6-2H9v-2h2zm4 0h-2v-2h2zm-2-2h-2v-2h2zm-2-2H9V9h2zm4 0h-2V9h2zM9 9H7V7h2zm8 0h-2V7h2zM7 7H5V5h2zm12 0h-2V5h2z\"/>",
  "pixelarticons:grid": "<path fill=\"currentColor\" d=\"M2 2h20v20H2zm2 2v4h4V4zm6 0v4h4V4zm6 0v4h4V4zm4 6h-4v4h4zm0 6h-4v4h4zm-6 4v-4h-4v4zm-6 0v-4H4v4zm-4-6h4v-4H4zm6-4v4h4v-4z\"/>",
  "pixelarticons:hand": "<path fill=\"currentColor\" d=\"M21 7h2v5h-2zm-4-2h2v7h-2zm-4-2h2v8h-2zM9 3h2v8H9zM5 5h2v8H5zm14 0h2v2h-2zm-4-2h2v2h-2zm-4-2h2v2h-2zM7 3h2v2H7zm-4 8h2v2H3zm-2 2h2v2H1zm0 2h2v2H1zm2 2h2v2H3zm2 2h2v2H5zm2 2h12v2H7zm12-2h2v2h-2zm2-7h2v7h-2zM5 13h2v2H5zm2 2h2v2H7z\"/>",
  "pixelarticons:home": "<path fill=\"currentColor\" d=\"M4 20h16v2H4zm16-10h2v10h-2zM2 10h2v10H2zm2-2h2v2H4zm2-2h2v2H6zm2-2h2v2H8zm2-2h4v2h-4zm4 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zM8 14h2v6H8zm2-2h4v2h-4zm4 2h2v6h-2z\"/>",
  "pixelarticons:login": "<g fill=\"currentColor\"><path d=\"M2 11h14v2H2zm10-2h2v2h-2z\"/><path d=\"M10 7h2v10h-2zm2 6h2v2h-2zM6 2h12v2H6zm0 18h12v2H6zM4 4h2v5H4zm0 11h2v5H4zM18 4h2v16h-2z\"/></g>",
  "pixelarticons:logout": "<g fill=\"currentColor\"><path d=\"M8 11h12v2H8zm8-2h2v2h-2z\"/><path d=\"M14 7h2v10h-2zm2 6h2v2h-2zM6 2h12v2H6zm0 18h12v2H6zM4 4h2v16H4zm14 0h2v3h-2zm0 13h2v3h-2z\"/></g>",
  "pixelarticons:mail": "<path fill=\"currentColor\" d=\"M6 8h2v2H6zm2 2h2v2H8zm10-2h-2v2h2zm-2 2h-2v2h2zm-6 2h4v2h-4zM2 6h2v12H2zm18 0h2v12h-2zM4 4h16v2H4zm0 14h16v2H4z\"/>",
  "pixelarticons:message-text": "<path fill=\"currentColor\" d=\"M20 2H4v2h16zm0 14H6v2h14zm2-12h-2v12h2zM4 4H2v18h2zm2 14H4v2h2zm0-6h4v2H6zm0-4h8v2H6z\"/>",
  "pixelarticons:music": "<path fill=\"currentColor\" d=\"M4 12h4v2H4zm-2 2h2v4H2zm2 4h4v2H4zM8 6h2v12H8zm10 0h2v12h-2zm-6 8h2v4h-2zm2-2h4v2h-4zm0 6h4v2h-4zM10 4h8v2h-8z\"/>",
  "pixelarticons:play": "<path fill=\"currentColor\" d=\"M15 11h-2V9h2zm0 4h-2v-2h2zm-2 2h-2v-2h2zm0-8h-2V7h2zm-2-2H9V5h2zM9 21H7V3h2zm6-8h2v-2h-2zm-6 4h2v2H9z\"/>",
  "pixelarticons:settings-cog": "<path fill=\"currentColor\" d=\"M4 20h3v-2h4v4h2v-4h4v2h-2v4H9v-4H7v2H2v-5h2zm18 2h-5v-2h3v-3h2zM6 11H2v2h4v4H4v-2H0V9h4V7h2zm14-2h4v6h-4v2h-2v-4h4v-2h-4V7h2zm-6 7h-4v-2h4zm-4-2H8v-4h2zm6 0h-2v-4h2zm-2-4h-4V8h4zM7 4H4v3H2V2h5zm8 0h2V2h5v5h-2V4h-3v2h-4V2h-2v4H7V4h2V0h6z\"/>",
  "pixelarticons:user": "<path fill=\"currentColor\" d=\"M9 2h6v2H9zm0 8h6v2H9zm6-6h2v6h-2zM7 4h2v6H7zM4 18h2v4H4zm14 0h2v4h-2zM8 14h8v2H8zm-2 2h2v2H6zm10 0h2v2h-2z\"/>",
  "pixelarticons:user-plus": "<g fill=\"currentColor\"><path d=\"M9 2h6v2H9zm0 8h6v2H9zm6-6h2v6h-2zM7 4h2v6H7zM4 18h2v4H4zm14 0h2v4h-2zM8 14h8v2H8zm-2 2h2v2H6z\"/><path d=\"M18 16h2v6h-2z\"/><path d=\"M16 18h6v2h-6z\"/></g>",
  "pixelarticons:users": "<path fill=\"currentColor\" d=\"M5 2h6v2H5zm10 0h4v2h-4zM5 10h6v2H5zm10 0h4v2h-4zm4-6h2v6h-2zm-8 0h2v6h-2zM3 4h2v6H3zM0 18h2v4H0zm14 0h2v4h-2zm8 0h2v4h-2zM4 14h8v2H4zm12 0h4v2h-4zM2 16h2v2H2zm10 0h2v2h-2zm8 0h2v2h-2z\"/>"
};

  class ToucanIcon extends HTMLElement {
    static get observedAttributes() { return ["icon"]; }

    connectedCallback() { this.render(); }
    attributeChangedCallback() { this.render(); }

    render() {
      const body = ICONS[this.getAttribute("icon")];
      if (!body) { this.innerHTML = ""; return; }
      // Sized in em so it follows font-size, the way the CDN element did.
      this.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + VIEWBOX + '" ' +
        'width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">' +
        body + "</svg>";
    }
  }

  if (!customElements.get("iconify-icon")) {
    customElements.define("iconify-icon", ToucanIcon);
  }
})();
