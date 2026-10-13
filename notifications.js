// In-app notifications (bell) and announcements
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, esc = S.esc, msg = S.msg, friendly = S.friendly, confirmBox = S.confirmBox, views = S.views;
  const $ = (s) => document.querySelector(s);
  const sb = () => S.sb(), sid = () => S.schoolId();
  const ago = (d) => { const s = (Date.now() - new Date(d)) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago"; if (s < 86400) return Math.floor(s / 3600) + " h ago"; return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }); };
  const ICON = { absence: "🚫", payment: "💳", invoice: "🧾", report: "📄", announcement: "📣", general: "🔔" };
  let unread = 0, busy = false;

  const scoped = (q) => (sid() ? q.eq("school_id", sid()) : q);
  async function refreshCount() {
    if (busy || !st.user || !sb()) return; busy = true;
    try { const { count, error } = await scoped(sb().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)); if (!error) { unread = count || 0; badge(); } } catch (e) {} busy = false;
  }
  function badge() { const b = $("#bellBtn"); if (b) b.textContent = unread > 0 ? "🔔 " + (unread > 99 ? "99+" : unread) : "🔔"; }

  (window.SSMS_NAV = window.SSMS_NAV || []).push((items, state) => {
    if (!state.ctx || !state.ctx.school) return;
    items.push(["announcements", "📣", "Announcements"], ["notifications", "🔔", "Notifications"]);
    refreshCount();
  });
  setInterval(refreshCount, 45000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshCount(); });

  async function open(n) {
    if (!n.read_at) { await sb().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id); }
    await refreshCount(); S.go(n.link_view && views[n.link_view] ? n.link_view : "notifications");
  }
  async function markAll() { const { error } = await scoped(sb().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null)); if (error) return friendly(error); await refreshCount(); }

  // bell dropdown
  const bell = $("#bellBtn"), menu = $("#bellMenu"); let latest = [];
  if (bell && menu) {
    menu.style.width = "min(92vw, 360px)"; menu.style.maxHeight = "70vh"; menu.style.overflowY = "auto";
    bell.addEventListener("click", async () => {
      if (menu.classList.contains("hidden")) return;
      menu.innerHTML = `<strong>Notifications</strong><p><span class="spin"></span></p>`;
      const { data, error } = await scoped(sb().from("notifications").select("*").order("created_at", { ascending: false }).limit(8));
      if (error) { menu.innerHTML = `<strong>Notifications</strong><p class="muted">${esc(friendly(error))}</p>`; return; }
      latest = data;
      menu.innerHTML = `<strong>Notifications</strong>${data.length ? data.map((n, i) => `<button class="btn ghost" data-i="${i}" style="display:block;width:100%;text-align:left;margin-top:.4rem;${n.read_at ? "opacity:.7" : ""}"><span aria-hidden="true">${ICON[n.kind] || "🔔"}</span> <strong>${esc(n.title)}</strong>${n.read_at ? "" : " •"}<br><small class="muted">${esc(n.body || "")}</small><br><small class="muted">${esc(ago(n.created_at))}</small></button>`).join("") : `<p class="muted">Nothing here yet.</p>`}<div style="display:flex;gap:.4rem;margin-top:.6rem"><button class="btn ghost" id="nAll" style="flex:1">See all</button>${data.length ? `<button class="btn ghost" id="nRead" style="flex:1">Mark all read</button>` : ""}</div>`;
    });
    menu.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.i !== undefined) { menu.classList.add("hidden"); open(latest[+b.dataset.i]); }
      if (b.id === "nAll") { menu.classList.add("hidden"); S.go("notifications"); }
      if (b.id === "nRead") { await markAll(); bell.click(); bell.click(); }
    });
  }

  // all notifications page
  views.notifications = async function () {
    const v = $("#view"); const { data, error } = await scoped(sb().from("notifications").select("*").order("created_at", { ascending: false }).limit(100)); if (error) throw error;
    v.innerHTML = `<h1>Notifications</h1><div class="panel">${data.length ? `<button class="btn ghost" id="all" style="margin-bottom:.6rem">Mark all as read</button>${data.map((n, i) => `<div class="card" style="margin-bottom:.5rem;${n.read_at ? "opacity:.75" : "border-color:var(--teal)"}"><strong>${ICON[n.kind] || "🔔"} ${esc(n.title)}</strong>${n.read_at ? "" : ` <span class="badge">New</span>`}<div>${esc(n.body || "")}</div><small class="muted">${esc(ago(n.created_at))}</small>${n.link_view && views[n.link_view] ? `<div style="margin-top:.4rem"><button class="btn ghost" data-i="${i}">Open</button></div>` : ""}</div>`).join("")}` : `<div class="empty">No notifications yet. You will see absence alerts, payment receipts, new invoices, published report cards and school announcements here.</div>`}</div>`;
    v.onclick = async (e) => { const b = e.target.closest("button"); if (!b) return; if (b.id === "all") { await markAll(); S.go("notifications"); } if (b.dataset.i !== undefined) open(data[+b.dataset.i]); };
  };

  // announcements
  views.announcements = async function () {
    const v = $("#view"), mgr = S.isManager();
    const { data, error } = await sb().from("announcements").select("*").eq("school_id", sid()).order("created_at", { ascending: false }).limit(50); if (error) throw error;
    const who = { parent: "Parents", student: "Students", staff: "Staff" };
    v.innerHTML = `<h1>Announcements</h1>${mgr ? `<div class="panel"><h2>Post an announcement</h2><form id="f"><label for="t">Title</label><input id="t" required maxlength="120"><label for="b">Message</label><textarea id="b" rows="4" required maxlength="2000" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:.6rem;background:var(--surface);color:var(--text)"></textarea><p style="margin:.8rem 0 .2rem"><strong>Send to</strong></p>${Object.entries(who).map(([k, l]) => `<label style="display:flex;gap:.5rem;align-items:center;font-weight:400"><input type="checkbox" data-a="${k}" ${k === "parent" ? "checked" : ""} style="width:auto;min-height:0"> ${l}</label>`).join("")}<label style="display:flex;gap:.5rem;align-items:center;font-weight:400;margin-top:.6rem"><input type="checkbox" id="u" style="width:auto;min-height:0"> Mark as urgent</label><div id="m"></div><button class="btn" style="margin-top:.6rem">Post and notify</button></form></div>` : ""}
    <div class="panel" id="list">${data.length ? data.map((a) => `<div class="card" style="margin-bottom:.6rem">${a.is_urgent ? `<span class="badge" style="color:var(--danger)">URGENT</span> ` : ""}<strong>${esc(a.title)}</strong><div style="white-space:pre-wrap;margin:.3rem 0">${esc(a.body)}</div><small class="muted">${esc(ago(a.created_at))}${mgr ? " · for " + a.audience.map((k) => who[k]).join(", ") : ""}</small>${mgr ? `<div style="margin-top:.4rem"><button class="btn ghost" data-del="${a.id}">Delete</button></div>` : ""}</div>`).join("") : `<div class="empty">No announcements yet.</div>`}</div>`;
    if (!mgr) return;
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const aud = [...document.querySelectorAll("[data-a]:checked")].map((c) => c.dataset.a);
      if (!aud.length) return msg($("#m"), "Choose who should receive this.");
      if (!(await confirmBox("Post this announcement and notify the people selected?"))) return;
      const r = await sb().rpc("post_announcement", { p_school: sid(), p_title: $("#t").value, p_body: $("#b").value, p_audience: aud, p_urgent: $("#u").checked });
      if (r.error) return msg($("#m"), friendly(r.error)); await S.go("announcements"); msg($("#m"), `Posted. ${r.data} ${r.data === 1 ? "person has" : "people have"} been notified in the app.`, "ok");
    };
    $("#list").onclick = async (e) => { const d = e.target.closest("[data-del]"); if (!d || !(await confirmBox("Delete this announcement? Notifications already sent will remain."))) return; const r = await sb().from("announcements").delete().eq("id", d.dataset.del); if (r.error) return msg($("#m"), friendly(r.error)); S.go("announcements"); };
  };
})();
