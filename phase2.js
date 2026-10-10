// Phase 2: students, staff, subjects & teaching assignments, admissions
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, esc = S.esc, msg = S.msg, friendly = S.friendly, confirmBox = S.confirmBox, mountTable = S.mountTable, fmtDate = S.fmtDate;
  const $ = (s) => document.querySelector(s);
  const sb = () => S.sb(), sid = () => S.schoolId();
  const views = S.views;
  const STATUS = { active: "Active", transferred: "Transferred", withdrawn: "Withdrawn", graduated: "Graduated" };
  const APP_STATUS = { submitted: "Submitted", under_review: "Under review", approved: "Approved", rejected: "Rejected", enrolled: "Enrolled" };

  // sidebar entries by role
  (window.SSMS_NAV = window.SSMS_NAV || []).push((items, state, isManager) => {
    if (!state.ctx || !state.ctx.school) return;
    const r = state.ctx.role;
    if (isManager() || r === "teacher") items.push(["students", "🧒", isManager() ? "Students" : "My students"]);
    if (r === "parent") items.push(["students", "🧒", "My children"]);
    if (r === "student") items.push(["students", "🧒", "My record"]);
    if (isManager()) items.push(["staff", "🧑‍🏫", "Staff"], ["subjects", "📚", "Subjects & teaching"], ["admissions", "📝", "Admissions"]);
  });

  // ---------- CSV helpers ----------
  const safeCell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  function downloadCSV(name, header, rows) {
    const body = [header.join(",")].concat(rows.map((r) => r.map(safeCell).join(","))).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function parseCSV(text) {
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ""));
  }
  async function getClasses() { const { data, error } = await sb().from("classes").select("*").eq("school_id", sid()).order("name"); if (error) throw error; return data; }
  const clsLabel = (c) => c.name + (c.arm ? " " + c.arm : "");
  const fullName = (x) => [x.first_name, x.last_name].filter(Boolean).join(" ");

  // ---------- Students list ----------
  views.students = async function () {
    const v = $("#view"), mgr = S.isManager(); const classes = await getClasses();
    const cmap = Object.fromEntries(classes.map((c) => [c.id, clsLabel(c)]));
    v.innerHTML = `<h1>${mgr ? "Students" : "Students you can access"}</h1>
    ${mgr ? `<div class="panel"><h2>Add a student</h2><form id="f"><div class="row">
      <div><label for="fn">First name</label><input id="fn" required maxlength="80"></div>
      <div><label for="ln">Last name</label><input id="ln" required maxlength="80"></div>
      <div><label for="on">Other names</label><input id="on" maxlength="80"></div>
      <div><label for="gd">Gender</label><select id="gd"><option value="">Not stated</option><option value="male">Male</option><option value="female">Female</option></select></div>
      <div><label for="dob">Date of birth</label><input id="dob" type="date"></div>
      <div><label for="cl">Class</label><select id="cl"><option value="">No class yet</option>${classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div></div>
      <div class="row"><div><label for="gn">Parent/guardian name</label><input id="gn" maxlength="120"></div>
      <div><label for="gp">Guardian phone</label><input id="gp" inputmode="tel"></div>
      <div><label for="ge">Guardian email</label><input id="ge" type="email"></div>
      <div><label for="en">Emergency contact name</label><input id="en"></div>
      <div><label for="ep">Emergency phone</label><input id="ep" inputmode="tel"></div></div>
      <div id="m"></div><button class="btn" style="margin-top:.7rem">Add student</button></form>
      <p class="muted">Admission numbers are generated automatically (e.g. 2026/0001). ${S.st.sessions.length ? "" : "Add an academic session first so class enrolments can be recorded."}</p></div>
    <div class="panel"><h2>Import or export</h2><div class="row"><div><label for="csvf">Import from CSV</label><input id="csvf" type="file" accept=".csv,text/csv"></div><div><button class="btn ghost" id="tpl">Download CSV template</button> <button class="btn ghost" id="exp">Export list</button></div></div><div id="im"></div></div>` : ""}
    <div class="panel"><div class="row"><div><label for="fcl">Filter by class</label><select id="fcl"><option value="">All classes</option>${classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div><div><label for="fst">Status</label><select id="fst"><option value="">All</option>${Object.entries(STATUS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div></div><div id="list" style="margin-top:.8rem"></div></div>`;
    let all = [], tbl;
    async function load() {
      const { data, error } = await sb().from("students").select("*").eq("school_id", sid()).is("deleted_at", null).order("last_name"); if (error) throw error; all = data; draw();
    }
    function draw() {
      const c = $("#fcl").value, s = $("#fst").value;
      const rows = all.filter((x) => (!c || x.current_class_id === c) && (!s || x.status === s));
      tbl = mountTable($("#list"), [
        { k: "admission_no", label: "Admission no." }, { k: "name", label: "Name", text: fullName },
        { k: "cls", label: "Class", text: (x) => cmap[x.current_class_id] || "—" }, { k: "gender", label: "Gender", text: (x) => x.gender || "" },
        { k: "status", label: "Status", text: (x) => STATUS[x.status] },
      ], rows, mgr ? "No students yet. Add the first one above." : "No students are linked to your account yet.", (x) => `<button class="btn ghost" data-open="${x.id}">Open</button>`);
    }
    await load();
    $("#fcl").onchange = draw; $("#fst").onchange = draw;
    $("#list").onclick = (e) => { const b = e.target.closest("[data-open]"); if (b) { st.studentId = b.dataset.open; S.go("student"); } };
    if (!mgr) return;
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const btn = e.submitter; btn.disabled = true;
      const p = { first_name: $("#fn").value, last_name: $("#ln").value, other_names: $("#on").value, gender: $("#gd").value, date_of_birth: $("#dob").value, class_id: $("#cl").value, guardian_name: $("#gn").value, guardian_phone: $("#gp").value, guardian_email: $("#ge").value, emergency_name: $("#en").value, emergency_phone: $("#ep").value };
      const { error } = await sb().rpc("create_student", { p_school: sid(), p });
      btn.disabled = false;
      if (error) return msg($("#m"), error.code === "23505" ? "A student with the same name and date of birth already exists." : friendly(error));
      $("#f").reset(); msg($("#m"), "Student added.", "ok"); load();
    };
    $("#tpl").onclick = () => downloadCSV("students_template.csv", ["first_name", "last_name", "other_names", "gender", "date_of_birth", "class", "guardian_name", "guardian_phone", "guardian_email"], [["Ada", "Okafor", "", "female", "2014-03-12", classes[0] ? clsLabel(classes[0]) : "JSS1", "Mrs Okafor", "08000000000", ""]]);
    $("#exp").onclick = () => downloadCSV("students.csv", ["admission_no", "first_name", "last_name", "gender", "date_of_birth", "class", "status"], all.map((x) => [x.admission_no, x.first_name, x.last_name, x.gender || "", x.date_of_birth || "", cmap[x.current_class_id] || "", x.status]));
    $("#csvf").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return; const out = $("#im");
      if (f.size > 1024 * 1024) return msg(out, "File too large. Keep it under 1 MB (about 2,000 rows).");
      const rows = parseCSV(await f.text()); if (rows.length < 2) return msg(out, "The file has no data rows.");
      const head = rows[0].map((h) => h.trim().toLowerCase()); const idx = (n) => head.indexOf(n);
      if (idx("first_name") < 0 || idx("last_name") < 0) return msg(out, "The first row must include first_name and last_name columns.");
      const byName = {}; classes.forEach((c) => (byName[clsLabel(c).toLowerCase()] = c.id));
      const data = rows.slice(1); if (data.length > 500) return msg(out, "Import up to 500 rows at a time.");
      if (!(await confirmBox(`Import ${data.length} student(s)?`))) return;
      let ok = 0; const errs = [];
      for (let i = 0; i < data.length; i++) {
        const g = (n) => (idx(n) >= 0 ? (data[i][idx(n)] || "").trim() : "");
        out.innerHTML = `<p><span class="spin"></span> Importing ${i + 1} of ${data.length}…</p>`;
        const cid = byName[g("class").toLowerCase()] || "";
        const { error } = await sb().rpc("create_student", { p_school: sid(), p: { first_name: g("first_name"), last_name: g("last_name"), other_names: g("other_names"), gender: g("gender").toLowerCase(), date_of_birth: g("date_of_birth"), class_id: cid, guardian_name: g("guardian_name"), guardian_phone: g("guardian_phone"), guardian_email: g("guardian_email") } });
        if (error) errs.push(`Row ${i + 2}: ${error.code === "23505" ? "duplicate student" : error.message}`); else ok++;
      }
      out.innerHTML = `<div class="msg ${errs.length ? "err" : "ok"}">${ok} imported, ${errs.length} skipped.${errs.length ? "<br>" + errs.slice(0, 10).map(esc).join("<br>") : ""}</div>`;
      e.target.value = ""; load();
    };
  };

  // ---------- Student detail ----------
  views.student = async function () {
    const v = $("#view"), mgr = S.isManager(), id = st.studentId; if (!id) return S.go("students");
    const [stu, gs, en, classes] = await Promise.all([
      sb().from("students").select("*").eq("id", id).single(),
      sb().from("student_guardians").select("id, relationship, is_primary, guardians(id, full_name, phone, email, user_id)").eq("student_id", id),
      sb().from("enrollments").select("id, class_id, session_id").eq("student_id", id),
      getClasses(),
    ]);
    if (stu.error) throw stu.error; const x = stu.data; const cmap = Object.fromEntries(classes.map((c) => [c.id, clsLabel(c)])); const smap = Object.fromEntries(st.sessions.map((s) => [s.id, s.name]));
    let sens = null; if (mgr) { const r = await sb().from("student_sensitive").select("*").eq("student_id", id).maybeSingle(); sens = r.data; }
    v.innerHTML = `<p><button class="linkbtn" id="back">← All students</button></p><h1>${esc(fullName(x))} ${x.other_names ? `<span class="muted">(${esc(x.other_names)})</span>` : ""}</h1>
    <div class="panel"><div class="cards">
      <div class="card"><div class="muted">Admission no.</div><div class="n" style="font-size:1.2rem">${esc(x.admission_no)}</div></div>
      <div class="card"><div class="muted">Class</div><div class="n" style="font-size:1.2rem">${esc(cmap[x.current_class_id] || "—")}</div></div>
      <div class="card"><div class="muted">Status</div><div class="n" style="font-size:1.2rem">${esc(STATUS[x.status])}</div></div></div>
      <p>Gender: ${esc(x.gender || "not stated")} · Born: ${esc(x.date_of_birth ? fmtDate(x.date_of_birth) : "not stated")} · Admitted: ${esc(fmtDate(x.admission_date))}<br>Address: ${esc(x.address || "—")}<br>Emergency contact: ${esc(x.emergency_name || "—")} ${esc(x.emergency_phone || "")}</p>
      <div id="m"></div>
      ${mgr ? `<div class="row"><div><label for="ncl">Move to class</label><select id="ncl">${classes.map((c) => `<option value="${c.id}" ${c.id === x.current_class_id ? "selected" : ""}>${esc(clsLabel(c))}</option>`).join("")}</select></div><div><button class="btn" id="mv">Save class</button></div>
      <div><label for="nst">Status</label><select id="nst">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${k === x.status ? "selected" : ""}>${l}</option>`).join("")}</select></div><div><button class="btn ghost" id="sts">Update status</button></div></div>
      <div class="row"><div><label for="lnk">Student login email</label><input id="lnk" type="email" placeholder="${x.user_id ? "Already linked" : "student@example.com"}"></div><div><button class="btn ghost" id="lk">Link student login</button></div></div>` : ""}</div>
    <div class="panel"><h2>Parents and guardians</h2>${gs.data && gs.data.length ? `<div class="tablewrap"><table><thead><tr><th>Name</th><th>Relationship</th><th>Phone</th><th>Email</th><th>Portal login</th>${mgr ? "<th>Actions</th>" : ""}</tr></thead><tbody>${gs.data.map((r) => `<tr><td>${esc(r.guardians.full_name)}</td><td>${esc(r.relationship)}</td><td>${esc(r.guardians.phone || "")}</td><td>${esc(r.guardians.email || "")}</td><td>${r.guardians.user_id ? "Linked" : "Not linked"}</td>${mgr ? `<td><button class="btn ghost" data-lg="${r.guardians.id}">Link login</button> <button class="btn ghost" data-ug="${r.id}">Unlink</button></td>` : ""}</tr>`).join("")}</tbody></table></div>` : `<div class="empty">No guardian recorded.</div>`}
      ${mgr ? `<form id="gf" class="row" style="margin-top:.8rem"><div><label for="gname">Name</label><input id="gname" required></div><div><label for="grel">Relationship</label><select id="grel"><option>Parent</option><option>Guardian</option><option>Sibling</option><option>Other</option></select></div><div><label for="gph">Phone</label><input id="gph" inputmode="tel"></div><div><label for="gem">Email</label><input id="gem" type="email"></div><div><button class="btn">Add guardian</button></div></form>` : ""}</div>
    <div class="panel"><h2>Class history</h2>${en.data && en.data.length ? `<ul>${en.data.map((r) => `<li>${esc(smap[r.session_id] || "Session")}: ${esc(cmap[r.class_id] || "")}</li>`).join("")}</ul>` : `<div class="empty">No enrolment recorded yet.</div>`}</div>
    ${mgr ? `<div class="panel"><h2>Medical or special-needs notes</h2><p class="muted">Visible to school administrators and the proprietor only. Record only what the school genuinely needs.</p><textarea id="med" rows="3" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:.6rem;background:var(--surface);color:var(--text)">${esc(sens ? sens.medical_notes : "")}</textarea><div id="mm"></div><button class="btn" id="msave" style="margin-top:.5rem">Save notes</button></div>` : ""}`;
    $("#back").onclick = () => S.go("students");
    if (!mgr) return;
    const reload = () => S.go("student");
    $("#mv").onclick = async () => {
      const cid = $("#ncl").value; let r = await sb().from("students").update({ current_class_id: cid }).eq("id", id); if (r.error) return msg($("#m"), friendly(r.error));
      const sess = st.sessions.find((s) => s.is_current);
      if (sess) { r = await sb().from("enrollments").upsert({ school_id: sid(), student_id: id, class_id: cid, session_id: sess.id }, { onConflict: "student_id,session_id" }); if (r.error) return msg($("#m"), friendly(r.error)); }
      reload();
    };
    $("#sts").onclick = async () => { const s = $("#nst").value; if (s !== "active" && !(await confirmBox("Change this student's status to " + STATUS[s] + "?"))) return; const r = await sb().from("students").update({ status: s }).eq("id", id); if (r.error) return msg($("#m"), friendly(r.error)); reload(); };
    $("#lk").onclick = async () => { const r = await sb().rpc("link_account", { p_kind: "student", p_id: id, p_email: $("#lnk").value }); if (r.error) return msg($("#m"), friendly(r.error)); msg($("#m"), "Student login linked.", "ok"); };
    $("#gf").onsubmit = async (e) => {
      e.preventDefault(); let r = await sb().from("guardians").insert({ school_id: sid(), full_name: $("#gname").value.trim(), phone: $("#gph").value.trim() || null, email: $("#gem").value.trim() || null }).select("id").single();
      if (r.error) return msg($("#m"), friendly(r.error));
      r = await sb().from("student_guardians").insert({ school_id: sid(), student_id: id, guardian_id: r.data.id, relationship: $("#grel").value }); if (r.error) return msg($("#m"), friendly(r.error)); reload();
    };
    v.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.lg) { const em = prompt("Parent's account email (they must have signed up):"); if (!em) return; const r = await sb().rpc("link_account", { p_kind: "guardian", p_id: b.dataset.lg, p_email: em }); if (r.error) return msg($("#m"), friendly(r.error)); msg($("#m"), "Parent login linked.", "ok"); }
      if (b.dataset.ug && (await confirmBox("Remove this guardian from the student?"))) { const r = await sb().from("student_guardians").delete().eq("id", b.dataset.ug); if (r.error) return msg($("#m"), friendly(r.error)); reload(); }
    };
    $("#msave").onclick = async () => { const r = await sb().from("student_sensitive").upsert({ student_id: id, school_id: sid(), medical_notes: $("#med").value.trim() || null, updated_at: new Date().toISOString() }); msg($("#mm"), r.error ? friendly(r.error) : "Notes saved.", r.error ? "err" : "ok"); };
  };

  // ---------- Staff ----------
  views.staff = async function () {
    const v = $("#view");
    v.innerHTML = `<h1>Staff</h1><div class="panel"><h2>Add a staff member</h2><form id="f" class="row"><div><label for="sn">Full name</label><input id="sn" required maxlength="120"></div><div><label for="sj">Job title</label><input id="sj" placeholder="Mathematics teacher"></div><div><label for="sp">Phone</label><input id="sp" inputmode="tel"></div><div><label for="se">Email</label><input id="se" type="email"></div><div><label for="sq">Qualification</label><input id="sq"></div><div><label for="sh">Hire date</label><input id="sh" type="date"></div><div><button class="btn">Add staff</button></div></form><div id="m"></div></div><div class="panel" id="list"></div>`;
    async function draw() {
      const { data, error } = await sb().from("staff").select("*").eq("school_id", sid()).order("full_name"); if (error) throw error;
      mountTable($("#list"), [{ k: "staff_no", label: "Staff no." }, { k: "full_name", label: "Name" }, { k: "job_title", label: "Job title" }, { k: "phone", label: "Phone" }, { k: "status", label: "Status" }, { k: "user_id", label: "Login", text: (x) => (x.user_id ? "Linked" : "Not linked") }], data, "No staff yet. Add your first staff member above.", (x) => `<button class="btn ghost" data-lk="${x.id}">Link login</button> <button class="btn ghost" data-lv="${x.id}" data-s="${x.status}">${x.status === "left" ? "Mark active" : "Mark as left"}</button>`);
    }
    await draw();
    v.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.lk) {
        const em = prompt("Staff member's account email (they must have signed up):"); if (!em) return;
        const role = prompt("Role: teacher, bursar, librarian, transport_manager or school_admin", "teacher"); if (!role) return;
        const r = await sb().rpc("link_account", { p_kind: "staff", p_id: b.dataset.lk, p_email: em, p_role: role.trim() }); msg($("#m"), r.error ? friendly(r.error) : "Login linked.", r.error ? "err" : "ok"); if (!r.error) draw();
      }
      if (b.dataset.lv) { const left = b.dataset.s !== "left"; if (left && !(await confirmBox("Mark this staff member as left? Their teaching access will stop."))) return; const r = await sb().from("staff").update({ status: left ? "left" : "active" }).eq("id", b.dataset.lv); if (r.error) return msg($("#m"), friendly(r.error)); draw(); }
    };
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const row = { school_id: sid(), full_name: $("#sn").value.trim(), job_title: $("#sj").value.trim() || null, phone: $("#sp").value.trim() || null, email: $("#se").value.trim() || null, qualification: $("#sq").value.trim() || null, hire_date: $("#sh").value || null };
      const { error } = await sb().from("staff").insert(row); if (error) return msg($("#m"), friendly(error)); $("#f").reset(); msg($("#m"), "Staff member added.", "ok"); draw();
    };
  };

  // ---------- Subjects & teaching assignments ----------
  views.subjects = async function () {
    const v = $("#view");
    const [subj, staff, classes] = await Promise.all([sb().from("subjects").select("*").eq("school_id", sid()).order("name"), sb().from("staff").select("id, full_name").eq("school_id", sid()).neq("status", "left").order("full_name"), getClasses()]);
    if (subj.error) throw subj.error; if (staff.error) throw staff.error;
    const cur = st.sessions.find((s) => s.id === st.sessId);
    v.innerHTML = `<h1>Subjects &amp; teaching</h1>
    <div class="panel"><h2>Add a subject</h2><form id="sf" class="row"><div><label for="sbn">Subject</label><input id="sbn" required></div><div><label for="sbc">Code (optional)</label><input id="sbc" maxlength="12"></div><div><button class="btn">Add subject</button></div></form><div id="sm"></div><div id="sl" style="margin-top:.8rem"></div></div>
    <div class="panel"><h2>Assign a teacher${cur ? " for " + esc(cur.name) : ""}</h2>${cur ? `<form id="af" class="row"><div><label for="at">Teacher</label><select id="at">${staff.data.map((s) => `<option value="${s.id}">${esc(s.full_name)}</option>`).join("")}</select></div><div><label for="ac">Class</label><select id="ac">${classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div><div><label for="as">Subject</label><select id="as">${subj.data.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></div><div><button class="btn">Assign</button></div></form>` : `<div class="empty">Add an academic session first (Sessions &amp; terms).</div>`}<div id="am"></div><div id="al" style="margin-top:.8rem"></div></div>`;
    const sm = Object.fromEntries(subj.data.map((s) => [s.id, s.name])), tm = Object.fromEntries(staff.data.map((s) => [s.id, s.full_name])), cm = Object.fromEntries(classes.map((c) => [c.id, clsLabel(c)]));
    const sT = mountTable($("#sl"), [{ k: "name", label: "Subject" }, { k: "code", label: "Code" }], subj.data, "No subjects yet.", (x) => `<button class="btn ghost" data-ds="${x.id}">Delete</button>`);
    let aT; async function drawA() {
      if (!cur) return; const { data, error } = await sb().from("teacher_assignments").select("*").eq("school_id", sid()).eq("session_id", cur.id); if (error) throw error;
      aT = mountTable($("#al"), [{ k: "t", label: "Teacher", text: (x) => tm[x.staff_id] || "Former staff" }, { k: "c", label: "Class", text: (x) => cm[x.class_id] }, { k: "s", label: "Subject", text: (x) => sm[x.subject_id] }], data, "No assignments yet.", (x) => `<button class="btn ghost" data-da="${x.id}">Remove</button>`);
      st.rerender = () => { sT.draw(); aT.draw(); };
    }
    await drawA(); st.rerender = () => { sT.draw(); if (aT) aT.draw(); };
    v.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.ds && (await confirmBox("Delete this subject and its teaching assignments?"))) { const r = await sb().from("subjects").delete().eq("id", b.dataset.ds); if (r.error) return msg($("#sm"), friendly(r.error)); S.go("subjects"); }
      if (b.dataset.da) { const r = await sb().from("teacher_assignments").delete().eq("id", b.dataset.da); if (r.error) return msg($("#am"), friendly(r.error)); drawA(); }
    };
    $("#sf").onsubmit = async (e) => { e.preventDefault(); const r = await sb().from("subjects").insert({ school_id: sid(), name: $("#sbn").value.trim(), code: $("#sbc").value.trim() || null }); if (r.error) return msg($("#sm"), r.error.code === "23505" ? "That subject already exists." : friendly(r.error)); S.go("subjects"); };
    if (cur) $("#af").onsubmit = async (e) => { e.preventDefault(); const r = await sb().from("teacher_assignments").insert({ school_id: sid(), staff_id: $("#at").value, class_id: $("#ac").value, subject_id: $("#as").value, session_id: cur.id }); if (r.error) return msg($("#am"), r.error.code === "23505" ? "That assignment already exists." : friendly(r.error)); msg($("#am"), ""); drawA(); };
  };

  // ---------- Admissions ----------
  views.admissions = async function () {
    const v = $("#view"); const classes = await getClasses();
    const link = location.origin + location.pathname.replace(/[^/]*$/, "") + "apply.html?school=" + encodeURIComponent(st.ctx.school.slug);
    v.innerHTML = `<h1>Admissions</h1><div class="panel"><h2>Public application link</h2><p>Share this link with parents:</p><p><input readonly value="${esc(link)}" onclick="this.select()" aria-label="Application link"></p></div><div class="panel"><div class="row"><div><label for="fs">Status</label><select id="fs"><option value="">All</option>${Object.entries(APP_STATUS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div><div><label for="ecl">Class to enrol into</label><select id="ecl"><option value="">No class yet</option>${classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div></div><div id="m"></div><div id="list" style="margin-top:.8rem"></div></div>`;
    let all = [];
    async function load() { const { data, error } = await sb().from("admission_applications").select("*").eq("school_id", sid()).order("created_at", { ascending: false }); if (error) throw error; all = data; draw(); }
    function draw() {
      const f = $("#fs").value; mountTable($("#list"), [{ k: "reference_no", label: "Reference" }, { k: "n", label: "Applicant", text: fullName }, { k: "class_applied", label: "Class applied" }, { k: "guardian_name", label: "Guardian" }, { k: "guardian_phone", label: "Phone" }, { k: "created_at", label: "Date", text: (x) => fmtDate(x.created_at) }, { k: "status", label: "Status", text: (x) => APP_STATUS[x.status] }], all.filter((x) => !f || x.status === f), "No applications yet. Share the link above.",
        (x) => x.status === "enrolled" || x.status === "rejected" ? "" : `${x.status === "submitted" ? `<button class="btn ghost" data-st="under_review" data-id="${x.id}">Start review</button> ` : ""}<button class="btn" data-en="${x.id}">Approve &amp; enrol</button> <button class="btn ghost" data-st="rejected" data-id="${x.id}">Reject</button>`);
    }
    await load(); $("#fs").onchange = draw;
    v.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.en) { if (!(await confirmBox("Create a student record from this application?"))) return; const r = await sb().rpc("enrol_application", { p_app: b.dataset.en, p_class: $("#ecl").value || null }); if (r.error) return msg($("#m"), r.error.code === "23505" ? "A student with the same name and date of birth already exists." : friendly(r.error)); msg($("#m"), "Student enrolled. Find them under Students.", "ok"); load(); }
      if (b.dataset.st) { if (b.dataset.st === "rejected" && !(await confirmBox("Reject this application?"))) return; const r = await sb().from("admission_applications").update({ status: b.dataset.st, reviewed_by: st.user.id }).eq("id", b.dataset.id); if (r.error) return msg($("#m"), friendly(r.error)); load(); }
    };
  };
})();
