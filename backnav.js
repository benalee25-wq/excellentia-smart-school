// Adds a "← Back" link at the top of every page, and makes the phone's back button work
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, view = document.getElementById("view");
  if (!view) return;
  const stack = [];
  let last = st.view, busy = false;

  function ensureBar() {
    if (busy) return;
    if (!stack.length) return;                       // nowhere to go back to
    if (view.querySelector("#back")) return;         // report card already has its own back link
    if (view.firstElementChild && view.firstElementChild.classList.contains("backbar")) return;
    busy = true;
    const bar = document.createElement("p");
    bar.className = "backbar no-print";
    bar.innerHTML = `<button type="button" class="linkbtn" aria-label="Go back">← Back</button>`;
    bar.firstChild.onclick = goBack;
    view.insertBefore(bar, view.firstChild);
    busy = false;
  }

  function goBack() { if (stack.length) history.back(); }

  new MutationObserver(() => {
    if (st.view !== last) {                          // moved to a new page
      stack.push(last); if (stack.length > 30) stack.shift();
      last = st.view;
      try { history.pushState({ ssms: 1 }, ""); } catch (e) {}
    }
    ensureBar();
  }).observe(view, { childList: true });

  window.addEventListener("popstate", () => {        // phone back button or our Back link
    if (!stack.length) return;
    const t = stack.pop();
    last = t;
    S.go(t);
  });
})();
