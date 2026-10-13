// Weekly timetable: periods & rooms setup, class timetable (editable by admins), teacher and parent views
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, esc = S.esc, msg = S.msg, friendly = S.friendly, confirmBox = S.confirmBox, views = S.views;
  const $ = (s) => document.querySelector(s);
  const sb = () => S.sb(), sid = () => S.schoolId();
  const clsLabel = (c) => c.name + (c.arm ? " " + c.arm : "");
  const fullName = (x) => [x.first_name, x.last_name].filter(Boolean).join(" ");
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const t5 = (t) => String(t || "").slice(0, 5);
  const todayIdx = () => ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 }[new Date().toLocaleDateString("en-US", { timeZone: "Africa/Lagos", weekday: "short" })] || 0);

  (window.SSMS_NAV = window.SSMS_NAV || []).push((items, state, isManager) => {
    if (!state.ctx || !state.ctx.school) return; const r = state.ctx.role;
    if (isManager()) items.push(["timetable", "🗓️", "Timetable"], ["ttsetup", "⏱️", "Periods & rooms"]);
    else if (r === "teacher") items.push(["myschedule", "🗓️", "My timetable"], ["timetable", "📅", "Class timetables"]);
    else if (r === "parent" || r === "student") items.push(["childtt", "🗓️", "Timetable"]);
    else items.push(["timetable", "📅", "Class timetables"]);
  });

  async function getPeriods() { const { data, error } = await sb().from("periods").select("*").eq("school_id", sid()).order("sort_order"); if (error) throw error; return data; }
  async function getClasses() { const { data, error } = await sb().from("classes").select("*").eq("school_id", sid()).order("name"); if (error) throw error; return data; }
  const needSession = () => { if (!st.sessId) { $("#view").innerHTML = `<div class="panel"><h1>Pick a session</h1><p>Add a session under <strong>Sessions &amp; terms</strong> first. Timetables belong to one academic session.</p></div>`; return true; } return false; };

  // shared grid; cellText(entry) -> [main, sub]
  function grid(periods, entries, o) {
    const by = {}; entries.forEach((e) => (by[e.day + "|" + e.period_id] = e)); const today = todayIdx();
    return `<div class="tablewrap"><table style="min-width:560px"><thead><tr><th>Time</th>${DAYS.map((d, i) => `<th style="cursor:default;${i + 1 === today ? "background:var(--bg)" : ""}">${d}</th>`).join("")}</tr></thead><tbody>${periods.map((p) => p.is_break ? `<tr><td><small>${t5(p.start_time)}–${t5(p.end_time)}</small></td><td colspan="5" class="muted" style="text-align:center;background:var(--bg)">${esc(p.name)}</td></tr>` : `<tr><td><strong>${esc(p.name)}</strong><br><small>${t5(p.start_time)}–${t5(p.end_time)}</small></td>${DAYS.map((d, i) => { const e = by[i + 1 + "|" + p.id]; const [a, b] = e ? o.text(e) : ["", ""]; return `<td ${o.edit ? `data-d="${i + 1}" data-p="${p.id}" tabindex="0" role="button" aria-label="${d} ${esc(p.name)}" style="cursor:pointer"` : ""}>${e ? `<strong>${esc(a)}</strong><br><small class="muted">${esc(b)}</small>` : o.edit ? `<span class="muted">+</span>` : ""}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  // ---------- Periods & rooms ----------
  views.ttsetup = async function () {
    const v = $("#view"); const [periods, rooms] = await Promise.all([getPeriods(), sb().from("rooms").select("*").eq("school_id", sid()).order("name")]); if (rooms.error) throw rooms.error;
    v.innerHTML = `<h1>Periods &amp; rooms</h1><p class="muted">Set the school day once. Lessons are placed into these periods.</p>
    <div class="panel"><h2>Periods</h2>${periods.length ? `<div class="tablewrap"><table><thead><tr><th>Name</th><th>Time</th><th>Type</th><th></th></tr></thead><tbody>${periods.map((p) => `<tr><td>${esc(p.name)}</td><td>${t5(p.start_time)}–${t5(p.end_time)}</td><td>${p.is_break ? "Break" : "Lesson"}</td><td><button class="btn ghost" data-dp="${p.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No periods yet.</div><button class="btn" id="seed">Start with a typical school day</button><p class="muted">Adds 8 lesson periods of 40 minutes with a short and a long break. You can edit or delete any of them.</p>`}
      <form id="pf" class="row" style="margin-top:.8rem"><div><label for="pn">Name</label><input id="pn" required maxlength="40" placeholder="Period 1 or Short break"></div><div><label for="ps">Starts</label><input id="ps" type="time" required></div><div><label for="pe">Ends</label><input id="pe" type="time" required></div><div><label style="display:flex;gap:.5rem;align-items:center;font-weight:400"><input id="pb" type="checkbox" style="width:auto;min-height:0"> This is a break</label></div><div><button class="btn">Add period</button></div></form><div id="pm"></div></div>
    <div class="panel"><h2>Classrooms (optional)</h2>${rooms.data.length ? `<ul>${rooms.data.map((r) => `<li>${esc(r.name)} <button class="btn ghost" data-dr="${r.id}">Delete</button></li>`).join("")}</ul>` : `<div class="empty">No rooms yet. Rooms let the app stop two classes using the same room at once.</div>`}<form id="rf" class="row"><div><label for="rn">Room name</label><input id="rn" required maxlength="60" placeholder="e.g. Science lab"></div><div><button class="btn">Add room</button></div></form><div id="rm"></div></div>`;
    v.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.id === "seed") {
        if (!(await confirmBox("Add a typical school day (8 lessons and 2 breaks)?"))) return;
        const rows = [["Period 1", "08:00", "08:40"], ["Period 2", "08:40", "09:20"], ["Period 3", "09:20", "10:00"], ["Short break", "10:00", "10:30", 1], ["Period 4", "10:30", "11:10"], ["Period 5", "11:10", "11:50"], ["Period 6", "11:50", "12:30"], ["Long break", "12:30", "13:00", 1], ["Period 7", "13:00", "13:40"], ["Period 8", "13:40", "14:20"]].map((r, i) => ({ school_id: sid(), name: r[0], start_time: r[1], end_time: r[2], is_break: !!r[3], sort_order: i + 1 }));
        const r = await sb().from("periods").insert(rows); if (r.error) return msg($("#pm"), friendly(r.error)); S.go("ttsetup");
      }
      if (b.dataset.dp && (await confirmBox("Delete this period and every lesson placed in it?"))) { const r = await sb().from("periods").delete().eq("id", b.dataset.dp); if (r.error) return msg($("#pm"), friendly(r.error)); S.go("ttsetup"); }
      if (b.dataset.dr && (await confirmBox("Delete this room?"))) { const r = await sb().from("rooms").delete().eq("id", b.dataset.dr); if (r.error) return msg($("#rm"), friendly(r.error)); S.go("ttsetup"); }
    };
    $("#pf").onsubmit = async (e) => {
      e.preventDefault(); const s = $("#ps").value, en = $("#pe").value; if (en <= s) return msg($("#pm"), "The end time must be after the start time.");
      const next = periods.reduce((a, p) => Math.max(a, p.sort_order), 0) + 1;
      const r = await sb().from("periods").insert({ school_id: sid(), name: $("#pn").value.trim(), start_time: s, end_time: en, is_break: $("#pb").checked, sort_order: next }); if (r.error) return msg($("#pm"), friendly(r.error)); S.go("ttsetup");
    };
    $("#rf").onsubmit = async (e) => { e.preventDefault(); const r = await sb().from("rooms").insert({ school_id: sid(), name: $("#rn").value.trim() }); if (r.error) return msg($("#rm"), r.error.code === "23505" ? "That room already exists." : friendly(r.error)); S.go("ttsetup"); };
  };

  // ---------- Class timetable (editable for admins) ----------
  views.timetable = async function () {
    if (needSession()) return;
    const v = $("#view"), mgr = S.isManager(); const [periods, classes] = await Promise.all([getPeriods(), getClasses()]);
    if (!periods.length) { v.innerHTML = `<h1>Timetable</h1><div class="panel"><div class="empty">${mgr ? "Set up the school day first under Periods & rooms." : "The school has not set up the timetable yet."}</div></div>`; return; }
    if (!classes.length) { v.innerHTML = `<h1>Timetable</h1><div class="panel"><div class="empty">Add classes first.</div></div>`; return; }
    let subjects = [], staff = [], rooms = [], assigns = [];
    if (mgr) { const [a, b, c, d] = await Promise.all([sb().from("subjects").select("*").eq("school_id", sid()).order("name"), sb().from("staff").select("id, full_name").eq("school_id", sid()).neq("status", "left").order("full_name"), sb().from("rooms").select("*").eq("school_id", sid()).order("name"), sb().from("teacher_assignments").select("staff_id, class_id, subject_id").eq("school_id", sid()).eq("session_id", st.sessId)]); subjects = a.data || []; staff = b.data || []; rooms = c.data || []; assigns = d.data || []; }
    v.innerHTML = `<h1>Timetable</h1><div class="panel no-print"><label for="cl">Class</label><select id="cl">${classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div><div id="m" class="no-print"></div><div class="panel" id="tt"></div><div id="ed" class="no-print"></div><div class="panel no-print"><button class="btn ghost" id="prn">Print timetable</button>${mgr ? `<p class="muted" style="margin-bottom:0">Tap a box to add or change a lesson. The app blocks a teacher or room being in two places at once.</p>` : ""}</div>`;
    let entries = [];
    const cur = () => classes.find((c) => c.id === $("#cl").value);
    async function load() {
      $("#ed").innerHTML = ""; $("#tt").innerHTML = `<p><span class="spin"></span> Loading…</p>`;
      const r = await sb().rpc("class_timetable", { p_class: $("#cl").value, p_session: st.sessId }); if (r.error) { $("#tt").innerHTML = ""; return msg($("#m"), friendly(r.error)); }
      entries = r.data; draw();
    }
    function draw() { $("#tt").innerHTML = `<h2 style="margin-top:0">${esc(clsLabel(cur()))}</h2>` + grid(periods, entries, { edit: mgr, text: (e) => [e.subject_name, [e.teacher_name, e.room_name].filter(Boolean).join(" · ")] }); }
    function editor(day, pid) {
      const e = entries.find((x) => x.day === day && x.period_id === pid), p = periods.find((x) => x.id === pid), cid = $("#cl").value;
      $("#ed").innerHTML = `<div class="panel"><h2>${DAYS[day - 1]} · ${esc(p.name)} (${t5(p.start_time)}–${t5(p.end_time)})</h2><label for="es">Subject</label><select id="es">${subjects.length ? subjects.map((s) => `<option value="${s.id}" ${e && e.subject_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("") : `<option value="">Add subjects first</option>`}</select><label for="et">Teacher</label><select id="et"><option value="">Not set</option>${staff.map((s) => `<option value="${s.id}" ${e && e.staff_id === s.id ? "selected" : ""}>${esc(s.full_name)}</option>`).join("")}</select><div id="warn" class="muted" style="font-size:.85rem"></div><label for="er">Room</label><select id="er"><option value="">Not set</option>${rooms.map((r) => `<option value="${r.id}" ${e && e.room_id === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select><div id="em"></div><div class="row" style="margin-top:.7rem"><div><button class="btn" id="sv">Save lesson</button></div>${e ? `<div><button class="btn ghost" id="cl2">Clear</button></div>` : ""}<div><button class="btn ghost" id="cx">Cancel</button></div></div></div>`;
      const hint = () => { const sub = $("#es").value, t = $("#et").value, ok = assigns.filter((a) => a.class_id === cid && a.subject_id === sub).map((a) => a.staff_id);
        if (!e && ok.length === 1 && !t) $("#et").value = ok[0];
        const tt = $("#et").value; $("#warn").textContent = tt && !ok.includes(tt) ? "Note: this teacher is not assigned to this subject for this class under Subjects & teaching. You can still save." : ""; };
      $("#es").onchange = () => { if (!e) $("#et").value = ""; hint(); }; $("#et").onchange = hint; hint(); $("#ed").scrollIntoView({ behavior: "smooth", block: "center" });
      $("#cx").onclick = () => ($("#ed").innerHTML = "");
      if ($("#cl2")) $("#cl2").onclick = async () => { const r = await sb().from("timetable_entries").delete().eq("id", e.entry_id); if (r.error) return msg($("#em"), friendly(r.error)); load(); };
      $("#sv").onclick = async () => {
        const row = { school_id: sid(), session_id: st.sessId, class_id: cid, day, period_id: pid, subject_id: $("#es").value, staff_id: $("#et").value || null, room_id: $("#er").value || null };
        if (!row.subject_id) return msg($("#em"), "Choose a subject.");
        const r = e ? await sb().from("timetable_entries").update(row).eq("id", e.entry_id) : await sb().from("timetable_entries").insert(row);
        if (r.error) return msg($("#em"), r.error.code === "23505" ? "That slot already has a lesson." : friendly(r.error)); load();
      };
    }
    $("#cl").onchange = load; $("#prn").onclick = () => window.print();
    if (mgr) { const open = (t) => { const td = t.closest("td[data-d]"); if (td) editor(+td.dataset.d, td.dataset.p); }; $("#tt").onclick = (e) => open(e.target); $("#tt").onkeydown = (e) => { if (e.key === "Enter") open(e.target); }; }
    await load();
  };

  // ---------- Teacher's own timetable ----------
  views.myschedule = async function () {
    if (needSession()) return; const v = $("#view"), periods = await getPeriods();
    const r = await sb().rpc("my_timetable", { p_session: st.sessId }); if (r.error) throw r.error;
    v.innerHTML = `<h1>My timetable</h1><div class="panel" id="tt">${periods.length && r.data.length ? grid(periods, r.data, { text: (e) => [e.subject_name, [e.class_name, e.room_name].filter(Boolean).join(" · ")] }) : `<div class="empty">No lessons are assigned to you in the timetable yet. Your administrator sets this up.</div>`}</div><div class="panel no-print"><button class="btn ghost" id="prn">Print</button></div>`;
    $("#prn").onclick = () => window.print();
  };

  // ---------- Parent / student ----------
  views.childtt = async function () {
    if (needSession()) return; const v = $("#view"), periods = await getPeriods();
    const stu = await sb().from("students").select("id, first_name, last_name, current_class_id").eq("school_id", sid()); if (stu.error) throw stu.error;
    const kids = stu.data.filter((s) => s.current_class_id);
    if (!kids.length) { v.innerHTML = `<h1>Timetable</h1><div class="panel"><div class="empty">No student with a class is linked to your account yet.</div></div>`; return; }
    v.innerHTML = `<h1>Timetable</h1><div class="panel no-print"><label for="sx">Student</label><select id="sx">${kids.map((s) => `<option value="${s.current_class_id}">${esc(fullName(s))}</option>`).join("")}</select></div><div class="panel" id="tt"></div><div class="panel no-print"><button class="btn ghost" id="prn">Print</button></div>`;
    async function load() { const r = await sb().rpc("class_timetable", { p_class: $("#sx").value, p_session: st.sessId }); if (r.error) return msg($("#tt"), friendly(r.error)); $("#tt").innerHTML = periods.length && r.data.length ? grid(periods, r.data, { text: (e) => [e.subject_name, [e.teacher_name, e.room_name].filter(Boolean).join(" · ")] }) : `<div class="empty">The timetable for this class has not been set yet.</div>`; }
    $("#sx").onchange = load; $("#prn").onclick = () => window.print(); await load();
  };
})();
