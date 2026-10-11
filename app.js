(function () {
  "use strict";
  const cfg = window.SSMS_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MANAGERS = ["super_admin", "proprietor", "school_admin"];
  const ROLE_LABEL = { super_admin: "Super administrator", proprietor: "Proprietor", school_admin: "School administrator", teacher: "Teacher", student: "Student", parent: "Parent", bursar: "Bursar", librarian: "Librarian", transport_manager: "Transport manager" };

  const st = { user: null, profile: null, ctxs: [], ctx: null, sessions: [], terms: [], sessId: null, termId: null, view: "dashboard", rerender: null };
  let sb = null;

  // ---------- helpers ----------
  function msg(el, text, kind) { el.innerHTML = text ? `<div class="msg ${kind || "err"}">${esc(text)}</div>` : ""; }
  function busy(btn, on) { btn.disabled = on; }
  function friendly(e) { return (e && e.message) || "Something went wrong. Check your connection and try again."; }
  function confirmBox(text) {
    return new Promise((res) => {
      const d = $("#confirmDlg"); $("#confirmText").textContent = text;
      d.onclose = () => res(d.returnValue === "yes"); d.showModal();
    });
  }
  const slugify = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const isManager = () => st.ctx && MANAGERS.includes(st.ctx.role);
  const schoolId = () => st.ctx && st.ctx.school && st.ctx.school.id;
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" }) : "");

  // Sortable, searchable, paginated table
  function mountTable(el, cols, rows, emptyText, actions) {
    let key = null, dir = 1, page = 0; const size = 10;
    function draw() {
      const q = ($("#search").value || "").toLowerCase().trim();
      let r = rows.filter((x) => !q || cols.some((c) => String(c.text ? c.text(x) : x[c.k] ?? "").toLowerCase().includes(q)));
      if (key) { const c = cols.find((c) => c.k === key); r = [...r].sort((a, b) => { const av = String(c.text ? c.text(a) : a[key] ?? ""), bv = String(c.text ? c.text(b) : b[key] ?? ""); return av.localeCompare(bv, undefined, { numeric: true }) * dir; }); }
      const pages = Math.max(1, Math.ceil(r.length / size)); if (page >= pages) page = pages - 1;
      if (!r.length) { el.innerHTML = `<div class="empty">${esc(q ? "No results match your search." : emptyText)}</div>`; return; }
      const slice = r.slice(page * size, page * size + size);
      el.innerHTML = `<div class="tablewrap"><table><thead><tr>${cols.map((c) => `<th data-k="${esc(c.k)}" tabindex="0" aria-sort="${key === c.k ? (dir > 0 ? "ascending" : "descending") : "none"}">${esc(c.label)}${key === c.k ? (dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}${actions ? "<th>Actions</th>" : ""}</tr></thead><tbody>${slice.map((x, i) => `<tr>${cols.map((c) => `<td>${esc(c.text ? c.text(x) : x[c.k])}</td>`).join("")}${actions ? `<td>${actions(x, i)}</td>` : ""}</tr>`).join("")}</tbody></table></div><div class="pager"><span class="muted">${r.length} record${r.length === 1 ? "" : "s"} · page ${page + 1} of ${pages}</span><button class="btn ghost" data-p="-1" ${page === 0 ? "disabled" : ""}>Previous</button><button class="btn ghost" data-p="1" ${page >= pages - 1 ? "disabled" : ""}>Next</button></div>`;
      el.querySelectorAll("th[data-k]").forEach((th) => { const go = () => { const k = th.dataset.k; if (key === k) dir = -dir; else { key = k; dir = 1; } draw(); }; th.onclick = go; th.onkeydown = (e) => { if (e.key === "Enter") go(); }; });
      el.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { page += +b.dataset.p; draw(); }));
      if (el._after) el._after(el);
    }
    st.rerender = draw; draw(); return { draw, rows, set after(f) { el._after = f; draw(); } };
  }

  const loading = () => ($("#view").innerHTML = `<p><span class="spin"></span> Loading…</p>`);

  // ---------- auth ----------
  let mode = "signin";
  function setMode(m) {
    mode = m;
    $("#authTitle").textContent = m === "signin" ? "Sign in" : m === "signup" ? "Create your account" : "Reset your password";
    $("#authBtn").textContent = m === "signin" ? "Sign in" : m === "signup" ? "Create account" : "Send reset link";
    $("#nameWrap").classList.toggle("hidden", m !== "signup");
    $("#passWrap").classList.toggle("hidden", m === "forgot");
    $("#toggleMode").textContent = m === "signup" ? "I already have an account" : "Create an account";
    $("#password").autocomplete = m === "signup" ? "new-password" : "current-password";
    msg($("#authMsg"), "");
  }
  function showAuth() { $("#app").classList.add("hidden"); $("#auth").classList.remove("hidden"); }
  function showApp() { $("#auth").classList.add("hidden"); $("#app").classList.remove("hidden"); }

  async function onAuthSubmit(e) {
    e.preventDefault();
    const email = $("#email").value.trim(), password = $("#password").value, out = $("#authMsg"), btn = $("#authBtn");
    if (!/^\S+@\S+\.\S+$/.test(email)) return msg(out, "Enter a valid email address.");
    if (mode !== "forgot" && password.length < 8) return msg(out, "Password must be at least 8 characters.");
    busy(btn, true);
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error;
      } else if (mode === "signup") {
        const full_name = $("#fullName").value.trim(); if (full_name.length < 2) throw new Error("Enter your full name.");
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name } } }); if (error) throw error;
        if (!data.session) msg(out, "Account created. Check your email to confirm it, then sign in.", "ok");
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error;
        msg(out, "If that email has an account, a reset link has been sent.", "ok");
      }
    } catch (err) { msg(out, friendly(err)); } finally { busy(btn, false); }
  }

  async function onNewPass(e) {
    e.preventDefault(); const p = $("#newPass").value, out = $("#newPassMsg");
    if (p.length < 8) return msg(out, "Password must be at least 8 characters.");
    const { error } = await sb.auth.updateUser({ password: p });
    if (error) return msg(out, friendly(error));
    msg(out, "Password updated.", "ok"); $("#newPassForm").classList.add("hidden"); $("#authForm").classList.remove("hidden");
    history.replaceState(null, "", location.pathname); boot();
  }

  // ---------- context ----------
  async function loadContext() {
    const uid = st.user.id;
    const { data: profile, error: pe } = await sb.from("profiles").select("*").eq("id", uid).single();
    if (pe) throw pe; st.profile = profile;
    if (profile.is_active === false) { await sb.auth.signOut(); throw new Error("This account has been deactivated. Contact your school."); }
    const ctxs = [];
    if (profile.is_super_admin) {
      const { data: all, error } = await sb.from("schools").select("*").order("name"); if (error) throw error;
      ctxs.push({ role: "super_admin", school: null, label: "Platform (all schools)" });
      all.forEach((s) => ctxs.push({ role: "super_admin", school: s, label: s.name + " (admin)" }));
    }
    const { data: ms, error: me } = await sb.from("school_memberships").select("role, schools(*)").eq("user_id", uid).eq("is_active", true);
    if (me) throw me;
    (ms || []).forEach((m) => { if (m.schools) ctxs.push({ role: m.role, school: m.schools, label: `${m.schools.name} — ${ROLE_LABEL[m.role]}` }); });
    st.ctxs = ctxs;
    const saved = +sessionStorage.getItem("ssms_ctx");
    st.ctx = ctxs[saved] || ctxs[0] || null;
  }

  async function loadSchoolData() {
    st.sessions = []; st.terms = [];
    if (schoolId()) {
      const [s, t] = await Promise.all([
        sb.from("academic_sessions").select("*").eq("school_id", schoolId()).order("start_date", { ascending: false }),
        sb.from("terms").select("*").eq("school_id", schoolId()).order("start_date"),
      ]);
      if (s.error) throw s.error; if (t.error) throw t.error;
      st.sessions = s.data; st.terms = t.data;
    }
    const cur = st.sessions.find((x) => x.is_current) || st.sessions[0];
    st.sessId = cur ? cur.id : null;
    const ct = st.terms.find((x) => x.is_current && x.session_id === st.sessId) || st.terms.find((x) => x.session_id === st.sessId);
    st.termId = ct ? ct.id : null;
  }

  function drawChrome() {
    const sch = st.ctx && st.ctx.school;
    $("#schoolName").textContent = sch ? sch.name : "Excellentia Smart School";
    $("#schoolLogo").textContent = (sch ? sch.name : "E").trim().charAt(0).toUpperCase();
    $("#ctxSel").innerHTML = st.ctxs.map((c, i) => `<option value="${i}" ${c === st.ctx ? "selected" : ""}>${esc(c.label)}</option>`).join("");
    $("#sessSel").innerHTML = st.sessions.length ? st.sessions.map((s) => `<option value="${s.id}" ${s.id === st.sessId ? "selected" : ""}>${esc(s.name)}</option>`).join("") : `<option>No session</option>`;
    drawTerms();
    $("#userInfo").textContent = `${st.profile.full_name || "User"} · ${st.profile.email}`;
    const items = [["dashboard", "🏠", "Dashboard"]];
    if (st.ctx && st.ctx.role === "super_admin") items.push(["schools", "🏫", "Schools"]);
    if (isManager() && schoolId()) items.push(["sessions", "📅", "Sessions & terms"], ["classes", "🎓", "Classes"], ["members", "👥", "Members"], ["audit", "🧾", "Audit log"]);
    (window.SSMS_NAV || []).forEach((fn) => fn(items, st, isManager));
    items.push(["account", "⚙️", "Account"]);
    $("#nav").innerHTML = items.map(([k, i, l]) => `<button data-v="${k}" class="${st.view === k ? "active" : ""}"><span class="ic" aria-hidden="true">${i}</span><span class="t">${l}</span></button>`).join("");
    $("#nav").querySelectorAll("button").forEach((b) => (b.onclick = () => go(b.dataset.v)));
  }
  function drawTerms() {
    const ts = st.terms.filter((t) => t.session_id === st.sessId);
    $("#termSel").innerHTML = ts.length ? ts.map((t) => `<option value="${t.id}" ${t.id === st.termId ? "selected" : ""}>${esc(t.name)}</option>`).join("") : `<option>No term</option>`;
  }

  let entering = false;
  async function enterApp() {
    if (entering) return; entering = true;
    showApp();
    try {
      await loadContext();
      if (!st.ctx) { drawChrome(); $("#nav").innerHTML = ""; $("#view").innerHTML = `<div class="panel"><h1>No school access yet</h1><p>Your account (<strong>${esc(st.profile.email)}</strong>) is not linked to a school. Ask your school administrator to add you, then sign in again.</p></div>`; return; }
      await loadSchoolData(); drawChrome(); go(st.view);
    } catch (e) { $("#view").innerHTML = `<div class="msg err">${esc(friendly(e))}<br>If this is a new project, make sure migration 001 has been run.</div>`; }
    finally { entering = false; }
  }

  // ---------- views ----------
  const views = {};
  async function go(v) {
    st.view = v; st.rerender = null; $("#view").onclick = null; $("#search").value = ""; drawChrome(); closeMenus();
    $("#app").classList.remove("open"); $("#scrim").classList.add("hidden");
    loading();
    try { await views[v](); } catch (e) { $("#view").innerHTML = `<div class="msg err">${esc(friendly(e))}</div>`; }
    $("#view").focus({ preventScroll: true });
  }
  async function count(table, extra) {
    let q = sb.from(table).select("*", { count: "exact", head: true }).eq("school_id", schoolId()); if (extra) q = extra(q);
    const { count: c, error } = await q; if (error) throw error; return c;
  }

  views.dashboard = async function () {
    const v = $("#view");
    if (!schoolId()) { v.innerHTML = `<h1>Platform overview</h1><div class="panel"><p>Pick a school from the top bar to manage it, or open <strong>Schools</strong> to register a new one.</p></div>`; return; }
    const [classes, sessions] = await Promise.all([count("classes"), count("academic_sessions")]);
    let members = null; if (isManager()) members = await count("school_memberships", (q) => q.eq("is_active", true));
    const sess = st.sessions.find((s) => s.id === st.sessId), term = st.terms.find((t) => t.id === st.termId);
    v.innerHTML = `<h1>${esc(st.ctx.school.name)}</h1><p class="muted">${esc(ROLE_LABEL[st.ctx.role])} dashboard</p>
      <div class="cards">
        <div class="card"><div class="muted">Current session</div><div class="n">${esc(sess ? sess.name : "—")}</div><div class="muted">${esc(term ? term.name : "No term set")}</div></div>
        <div class="card"><div class="muted">Classes</div><div class="n">${classes}</div></div>
        <div class="card"><div class="muted">Academic sessions</div><div class="n">${sessions}</div></div>
        ${members !== null ? `<div class="card"><div class="muted">Active staff &amp; users</div><div class="n">${members}</div></div>` : ""}
      </div>
      <div class="panel"><h2>Getting started</h2>${isManager() ? `<p>1. Add an academic session and its terms. 2. Create classes. 3. Add staff under Members. Student records, attendance and fees arrive in the next phases, so they are not shown here yet.</p>` : `<p>Your portal tools will appear here as your school switches on each module.</p>`}</div>`;
  };

  views.schools = async function () {
    const v = $("#view");
    v.innerHTML = `<h1>Schools</h1><div class="panel"><h2>Register a school</h2><form id="f" class="row"><div><label for="sn">School name</label><input id="sn" required></div><div><label for="ss">Short code (a-z, 0-9, -)</label><input id="ss" required maxlength="60" autocapitalize="none" autocomplete="off" spellcheck="false"></div><div><button class="btn">Create school</button></div></form><div id="m"></div></div><div class="panel" id="list"></div>`;
    const { data, error } = await sb.from("schools").select("*").order("name"); if (error) throw error;
    mountTable($("#list"), [{ k: "name", label: "School" }, { k: "slug", label: "Code" }, { k: "status", label: "Status" }, { k: "created_at", label: "Created", text: (x) => fmtDate(x.created_at) }], data, "No schools yet. Register the first one above.");
    let touched = false;
    $("#ss").oninput = () => { touched = true; };
    $("#ss").onblur = () => { $("#ss").value = slugify($("#ss").value); };
    $("#sn").oninput = () => { if (!touched) $("#ss").value = slugify($("#sn").value); };
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const name = $("#sn").value.trim(), slug = slugify($("#ss").value);
      $("#ss").value = slug;
      if (name.length < 2) return msg($("#m"), "Enter the school name.");
      if (!/^[a-z0-9-]{2,60}$/.test(slug)) return msg($("#m"), "The short code needs at least 2 characters: lowercase letters, numbers or hyphens only.");
      const { error } = await sb.from("schools").insert({ name, slug });
      if (error) return msg($("#m"), error.code === "23505" ? "That short code is already used. Try another." : friendly(error));
      await loadContext(); go("schools");
    };
  };

  views.sessions = async function () {
    const v = $("#view");
    v.innerHTML = `<h1>Sessions &amp; terms</h1>
    <div class="panel"><h2>Add a session</h2><form id="sf" class="row"><div><label for="sname">Name (e.g. 2026/2027)</label><input id="sname" required></div><div><label for="ss1">Starts</label><input id="ss1" type="date" required></div><div><label for="se1">Ends</label><input id="se1" type="date" required></div><div><button class="btn">Add session</button></div></form><div id="sm"></div><div id="sl" style="margin-top:1rem"></div></div>
    <div class="panel"><h2>Add a term</h2><form id="tf" class="row"><div><label for="tsess">Session</label><select id="tsess">${st.sessions.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></div><div><label for="tname">Term</label><select id="tname"><option>First Term</option><option>Second Term</option><option>Third Term</option></select></div><div><label for="ts1">Starts</label><input id="ts1" type="date" required></div><div><label for="te1">Ends</label><input id="te1" type="date" required></div><div><button class="btn" ${st.sessions.length ? "" : "disabled"}>Add term</button></div></form><div id="tm"></div><div id="tl" style="margin-top:1rem"></div></div>`;
    const sname = (id) => (st.sessions.find((s) => s.id === id) || {}).name || "";
    const sT = mountTable($("#sl"), [{ k: "name", label: "Session" }, { k: "start_date", label: "Starts", text: (x) => fmtDate(x.start_date) }, { k: "end_date", label: "Ends", text: (x) => fmtDate(x.end_date) }, { k: "is_current", label: "Current", text: (x) => (x.is_current ? "Yes" : "") }], st.sessions, "No sessions yet. Add your first one above.", (x) => `${x.is_current ? "" : `<button class="btn ghost" data-cur="${x.id}">Make current</button> `}<button class="btn ghost" data-del="${x.id}">Delete</button>`);
    const tT = mountTable($("#tl"), [{ k: "session_id", label: "Session", text: (x) => sname(x.session_id) }, { k: "name", label: "Term" }, { k: "start_date", label: "Starts", text: (x) => fmtDate(x.start_date) }, { k: "end_date", label: "Ends", text: (x) => fmtDate(x.end_date) }, { k: "is_current", label: "Current", text: (x) => (x.is_current ? "Yes" : "") }], st.terms, "No terms yet.", (x) => `${x.is_current ? "" : `<button class="btn ghost" data-tcur="${x.id}">Make current</button> `}<button class="btn ghost" data-tdel="${x.id}">Delete</button>`);
    // both tables share the search box
    st.rerender = () => { sT.draw(); tT.draw(); };
    async function refresh() { await loadSchoolData(); drawChrome(); go("sessions"); }
    v.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      try {
        if (b.dataset.cur) { let r = await sb.from("academic_sessions").update({ is_current: false }).eq("school_id", schoolId()); if (r.error) throw r.error; r = await sb.from("academic_sessions").update({ is_current: true }).eq("id", b.dataset.cur); if (r.error) throw r.error; await refresh(); }
        if (b.dataset.tcur) { let r = await sb.from("terms").update({ is_current: false }).eq("school_id", schoolId()); if (r.error) throw r.error; r = await sb.from("terms").update({ is_current: true }).eq("id", b.dataset.tcur); if (r.error) throw r.error; await refresh(); }
        if (b.dataset.del && (await confirmBox("Delete this session and all its terms? This cannot be undone."))) { const r = await sb.from("academic_sessions").delete().eq("id", b.dataset.del); if (r.error) throw r.error; await refresh(); }
        if (b.dataset.tdel && (await confirmBox("Delete this term? This cannot be undone."))) { const r = await sb.from("terms").delete().eq("id", b.dataset.tdel); if (r.error) throw r.error; await refresh(); }
      } catch (err) { msg($("#sm"), friendly(err)); }
    };
    $("#sf").onsubmit = async (e) => {
      e.preventDefault(); const row = { school_id: schoolId(), name: $("#sname").value.trim(), start_date: $("#ss1").value, end_date: $("#se1").value, is_current: !st.sessions.length };
      if (row.end_date <= row.start_date) return msg($("#sm"), "End date must be after the start date.");
      const { error } = await sb.from("academic_sessions").insert(row);
      if (error) return msg($("#sm"), error.code === "23505" ? "That session already exists." : friendly(error)); await refresh();
    };
    $("#tf").onsubmit = async (e) => {
      e.preventDefault(); const row = { school_id: schoolId(), session_id: $("#tsess").value, name: $("#tname").value, start_date: $("#ts1").value, end_date: $("#te1").value, is_current: !st.terms.length };
      if (row.end_date <= row.start_date) return msg($("#tm"), "End date must be after the start date.");
      const { error } = await sb.from("terms").insert(row);
      if (error) return msg($("#tm"), error.code === "23505" ? "That term already exists in this session." : friendly(error)); await refresh();
    };
  };

  views.classes = async function () {
    const v = $("#view");
    v.innerHTML = `<h1>Classes</h1><div class="panel"><h2>Add a class</h2><form id="f" class="row"><div><label for="cn">Class name (e.g. JSS1)</label><input id="cn" required></div><div><label for="cl">Level</label><select id="cl"><option value="nursery">Nursery</option><option value="primary">Primary</option><option value="jss">Junior secondary</option><option value="sss">Senior secondary</option></select></div><div><label for="ca">Arm (optional)</label><input id="ca" placeholder="A, B, Gold…"></div><div><button class="btn">Add class</button></div></form><div id="m"></div></div><div class="panel" id="list"></div>`;
    async function draw() {
      const { data, error } = await sb.from("classes").select("*").eq("school_id", schoolId()).order("name"); if (error) throw error;
      mountTable($("#list"), [{ k: "name", label: "Class" }, { k: "arm", label: "Arm" }, { k: "level", label: "Level" }], data, "No classes yet. Add your first class above.", (x) => `<button class="btn ghost" data-del="${x.id}">Delete</button>`);
    }
    await draw();
    $("#list").onclick = async (e) => { const b = e.target.closest("[data-del]"); if (!b) return; if (!(await confirmBox("Delete this class?"))) return; const { error } = await sb.from("classes").delete().eq("id", b.dataset.del); if (error) return msg($("#m"), friendly(error)); draw(); };
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const arm = $("#ca").value.trim() || null;
      const { error } = await sb.from("classes").insert({ school_id: schoolId(), name: $("#cn").value.trim(), level: $("#cl").value, arm });
      if (error) return msg($("#m"), error.code === "23505" ? "That class and arm already exist." : friendly(error));
      $("#f").reset(); msg($("#m"), ""); draw();
    };
  };

  views.members = async function () {
    const v = $("#view"); const canProp = st.profile.is_super_admin;
    const roles = Object.keys(ROLE_LABEL).filter((r) => r !== "super_admin" && (canProp || r !== "proprietor"));
    v.innerHTML = `<h1>Members</h1><div class="panel"><h2>Give someone access</h2><p class="muted">The person must create an account on the sign-in page first.</p><form id="f" class="row"><div><label for="me">Their email</label><input id="me" type="email" required></div><div><label for="mr">Role</label><select id="mr">${roles.map((r) => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join("")}</select></div><div><button class="btn">Add member</button></div></form><div id="m"></div></div><div class="panel" id="list"></div>`;
    async function draw() {
      const { data, error } = await sb.from("school_memberships").select("id, role, is_active, profiles(full_name, email)").eq("school_id", schoolId()); if (error) throw error;
      mountTable($("#list"), [{ k: "n", label: "Name", text: (x) => x.profiles && x.profiles.full_name }, { k: "e", label: "Email", text: (x) => x.profiles && x.profiles.email }, { k: "role", label: "Role", text: (x) => ROLE_LABEL[x.role] }, { k: "is_active", label: "Status", text: (x) => (x.is_active ? "Active" : "Deactivated") }], data, "No members yet.", (x) => `<button class="btn ghost" data-tog="${x.id}" data-on="${x.is_active}">${x.is_active ? "Deactivate" : "Reactivate"}</button> ${x.role === "proprietor" && !canProp ? "" : `<button class="btn ghost" data-rm="${x.id}">Remove</button>`}`);
    }
    await draw();
    $("#list").onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      try {
        if (b.dataset.tog) { const r = await sb.from("school_memberships").update({ is_active: b.dataset.on !== "true" }).eq("id", b.dataset.tog); if (r.error) throw r.error; draw(); }
        if (b.dataset.rm && (await confirmBox("Remove this person's access to the school?"))) { const r = await sb.from("school_memberships").delete().eq("id", b.dataset.rm); if (r.error) throw r.error; draw(); }
      } catch (err) { msg($("#m"), friendly(err)); }
    };
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const { error } = await sb.rpc("add_member_by_email", { p_school: schoolId(), p_email: $("#me").value.trim(), p_role: $("#mr").value });
      if (error) return msg($("#m"), friendly(error)); $("#f").reset(); msg($("#m"), "Member added.", "ok"); draw();
    };
  };

  views.audit = async function () {
    const { data, error } = await sb.from("audit_logs").select("*").eq("school_id", schoolId()).order("created_at", { ascending: false }).limit(200); if (error) throw error;
    $("#view").innerHTML = `<h1>Audit log</h1><p class="muted">The latest 200 changes to schools, members, sessions, terms and classes.</p><div class="panel" id="list"></div>`;
    mountTable($("#list"), [{ k: "created_at", label: "When", text: (x) => new Date(x.created_at).toLocaleString("en-NG") }, { k: "action", label: "Action" }, { k: "table_name", label: "Record type" }, { k: "user_id", label: "By (user id)", text: (x) => (x.user_id || "system").slice(0, 8) }], data, "No activity recorded yet.");
  };

  views.account = async function () {
    $("#view").innerHTML = `<h1>Account settings</h1><div class="panel"><form id="f" style="max-width:420px"><label for="an">Full name</label><input id="an" value="${esc(st.profile.full_name)}" required><label for="ap">Phone</label><input id="ap" value="${esc(st.profile.phone)}" inputmode="tel"><label>Email</label><input value="${esc(st.profile.email)}" disabled><div id="m"></div><button class="btn" style="margin-top:.6rem">Save changes</button></form></div>`;
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const full_name = $("#an").value.trim(), phone = $("#ap").value.trim() || null;
      const { error } = await sb.from("profiles").update({ full_name, phone }).eq("id", st.user.id);
      if (error) return msg($("#m"), friendly(error)); st.profile.full_name = full_name; st.profile.phone = phone; drawChrome(); msg($("#m"), "Changes saved.", "ok");
    };
  };

  // ---------- chrome events ----------
  function closeMenus() { $("#bellMenu").classList.add("hidden"); $("#userMenu").classList.add("hidden"); }
  function wire() {
    $("#authForm").onsubmit = onAuthSubmit; $("#newPassForm").onsubmit = onNewPass;
    $("#toggleMode").onclick = () => setMode(mode === "signup" ? "signin" : "signup");
    $("#forgotBtn").onclick = () => setMode("forgot");
    $("#outBtn").onclick = async () => { await sb.auth.signOut(); };
    $("#acctBtn").onclick = () => go("account");
    $("#bellBtn").onclick = () => { const h = $("#bellMenu").classList.contains("hidden"); closeMenus(); if (h) $("#bellMenu").classList.remove("hidden"); };
    $("#userBtn").onclick = () => { const h = $("#userMenu").classList.contains("hidden"); closeMenus(); if (h) $("#userMenu").classList.remove("hidden"); };
    $("#themeBtn").onclick = () => { const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light"); const n = cur === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = n; try { localStorage.setItem("ssms_theme", n); } catch (e) {} };
    $("#menuBtn").onclick = () => { const a = $("#app"); if (matchMedia("(max-width:860px)").matches) { a.classList.toggle("open"); $("#scrim").classList.toggle("hidden", !a.classList.contains("open")); } else a.classList.toggle("collapsed"); };
    $("#scrim").onclick = () => { $("#app").classList.remove("open"); $("#scrim").classList.add("hidden"); };
    $("#search").oninput = () => st.rerender && st.rerender();
    $("#ctxSel").onchange = async (e) => { st.ctx = st.ctxs[+e.target.value]; try { sessionStorage.setItem("ssms_ctx", e.target.value); } catch (x) {} await loadSchoolData(); drawChrome(); go(st.view === "schools" && st.ctx.role !== "super_admin" ? "dashboard" : st.view); };
    $("#sessSel").onchange = (e) => { st.sessId = e.target.value; const ts = st.terms.filter((t) => t.session_id === st.sessId); st.termId = (ts.find((t) => t.is_current) || ts[0] || {}).id || null; drawTerms(); };
    $("#termSel").onchange = (e) => { st.termId = e.target.value; };
  }

  // ---------- boot ----------
  async function boot() {
    const { data } = await sb.auth.getSession();
    st.user = data.session ? data.session.user : null;
    if (st.user) enterApp(); else showAuth();
  }
  function init() {
    try { const t = localStorage.getItem("ssms_theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
    wire(); setMode("signin");
    if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT") || !window.supabase) {
      showAuth(); msg($("#authMsg"), "Setup needed: add your Supabase URL and anon key in assets/js/config.js (see docs/SETUP.md)."); $("#authBtn").disabled = true; return;
    }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { showAuth(); $("#authForm").classList.add("hidden"); $("#newPassForm").classList.remove("hidden"); return; }
      if (event === "SIGNED_OUT") { st.user = null; showAuth(); }
      if (event === "SIGNED_IN" && (!st.user || st.user.id !== session.user.id)) { st.user = session.user; enterApp(); }
    });
    boot();
  }
  window.SSMS = { st, views, esc, msg, friendly, confirmBox, mountTable, go, isManager, schoolId, fmtDate, ROLE_LABEL, sb: () => sb };
  init();
})();
