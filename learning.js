// Learning materials and assignments
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, esc = S.esc, msg = S.msg, friendly = S.friendly, confirmBox = S.confirmBox, mountTable = S.mountTable, views = S.views;
  const $ = (s) => document.querySelector(s);
  const sb = () => S.sb(), sid = () => S.schoolId();
  const BUCKET = "learning-files", MAXMB = 5;
  const clsLabel = (c) => c.name + (c.arm ? " " + c.arm : "");
  const fullName = (x) => [x.first_name, x.last_name].filter(Boolean).join(" ");
  const when = (d) => new Date(d).toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const day = (d) => new Date(d).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const safeName = (n) => String(n).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
  const role = () => st.ctx && st.ctx.role;
  const isStaffSide = () => S.isManager() || role() === "teacher";
  const isFamily = () => role() === "parent" || role() === "student";
  const textArea = (id, rows, val, extra) => `<textarea id="${id}" rows="${rows || 3}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:.6rem;background:var(--surface);color:var(--text)" ${extra || ""}>${esc(val || "")}</textarea>`;

  (window.SSMS_NAV = window.SSMS_NAV || []).push((items, state, isManager) => {
    if (!state.ctx || !state.ctx.school) return; const r = state.ctx.role;
    if (isManager() || r === "teacher") items.push(["materials", "📚", "Materials"], ["assignments", "📝", "Assignments"]);
    if (r === "parent" || r === "student") items.push(["studymaterials", "📚", "Learning materials"], ["classwork", "📝", "Assignments"]);
  });

  // ---- files ----
  async function upload(path, file) {
    if (file.size > MAXMB * 1024 * 1024) throw new Error(`That file is larger than ${MAXMB} MB. Please send a smaller one.`);
    const r = await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" }); if (r.error) throw r.error;
  }
  async function openFile(path) {
    const w = window.open("", "_blank"); const r = await sb().storage.from(BUCKET).createSignedUrl(path, 600);
    if (r.error) { if (w) w.close(); throw r.error; } if (w) w.location = r.data.signedUrl; else location.href = r.data.signedUrl;
  }
  const rm = (paths) => paths.length && sb().storage.from(BUCKET).remove(paths);

  // ---- who and what can I work with ----
  async function scope() {
    const [c, s] = await Promise.all([sb().from("classes").select("*").eq("school_id", sid()).order("name"), sb().from("subjects").select("*").eq("school_id", sid()).order("name")]);
    if (c.error) throw c.error; if (s.error) throw s.error;
    if (S.isManager()) return { classes: c.data, subjects: s.data, pairs: null };
    const ta = await sb().from("teacher_assignments").select("class_id, subject_id").eq("school_id", sid()).eq("session_id", st.sessId); if (ta.error) throw ta.error;
    const ids = new Set(ta.data.map((x) => x.class_id)); return { classes: c.data.filter((x) => ids.has(x.id)), subjects: s.data, pairs: ta.data };
  }
  function pickers(sc) {
    const cl = $("#cl"), sj = $("#sj");
    cl.innerHTML = sc.classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("");
    const fill = () => { const ok = sc.pairs ? new Set(sc.pairs.filter((p) => p.class_id === cl.value).map((p) => p.subject_id)) : null; const subs = sc.subjects.filter((s) => !ok || ok.has(s.id)); sj.innerHTML = subs.length ? subs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("") : `<option value="">No subjects</option>`; };
    fill(); return fill;
  }
  const filterHtml = `<div class="panel"><div class="row"><div><label for="cl">Class</label><select id="cl"></select></div><div><label for="sj">Subject</label><select id="sj"></select></div></div></div>`;
  const needSession = () => { if (!st.sessId) { $("#view").innerHTML = `<div class="panel"><h1>Pick a session</h1><p>Add a session under <strong>Sessions &amp; terms</strong> first.</p></div>`; return true; } return false; };
  const noScope = (title) => { $("#view").innerHTML = `<h1>${title}</h1><div class="panel"><div class="empty">${S.isManager() ? "Add classes and subjects first." : "No classes are assigned to you for this session. Ask the administrator to assign you under Subjects &amp; teaching."}</div></div>`; };

  // ================= Teacher: materials =================
  views.materials = async function () {
    if (needSession()) return; const v = $("#view"), sc = await scope(); if (!sc.classes.length) return noScope("Materials");
    v.innerHTML = `<h1>Learning materials</h1>${filterHtml}
    <div class="panel"><h2>Add material</h2><form id="f"><label for="t">Title</label><input id="t" required maxlength="120"><label for="tp">Topic (optional)</label><input id="tp" maxlength="80" placeholder="e.g. Fractions"><label for="k">Type</label><select id="k"><option value="file">File (PDF, document, image, audio)</option><option value="link">Link (video or website)</option><option value="note">Written note</option></select>
      <div id="kf"><label for="fl">File (max ${MAXMB} MB)</label><input id="fl" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.mp3,image/*"></div>
      <div id="kl" class="hidden"><label for="lk">Link (https://…)</label><input id="lk" type="url"></div><div id="kn" class="hidden"><label for="nb">Note</label>${textArea("nb", 5)}</div>
      <label for="d">Description (optional)</label><input id="d" maxlength="300"><label style="display:flex;gap:.5rem;align-items:center;font-weight:400;margin-top:.7rem"><input id="pub" type="checkbox" checked style="width:auto;min-height:0"> Visible to students and parents</label><div id="m"></div><button class="btn" style="margin-top:.6rem">Add material</button></form></div>
    <div class="panel"><h2>Materials for this class and subject</h2><div id="list"></div></div>`;
    const fill = pickers(sc); let rows = [];
    async function load() {
      const cid = $("#cl").value, sj = $("#sj").value; if (!sj) { $("#list").innerHTML = `<div class="empty">No subject available.</div>`; return; }
      const { data, error } = await sb().from("resources").select("*").eq("class_id", cid).eq("subject_id", sj).eq("session_id", st.sessId).order("created_at", { ascending: false }); if (error) return msg($("#list"), friendly(error)); rows = data;
      mountTable($("#list"), [{ k: "title", label: "Title" }, { k: "topic", label: "Topic" }, { k: "kind", label: "Type", text: (x) => ({ file: "File", link: "Link", note: "Note" }[x.kind]) }, { k: "created_at", label: "Added", text: (x) => day(x.created_at) }, { k: "published", label: "Visible", text: (x) => (x.published ? "Yes" : "Hidden") }], rows, "No materials yet. Add the first one above.", (x) => `<button class="btn ghost" data-o="${x.id}">Open</button> <button class="btn ghost" data-h="${x.id}">${x.published ? "Hide" : "Show"}</button> <button class="btn ghost" data-x="${x.id}">Delete</button>`);
    }
    $("#cl").onchange = () => { fill(); load(); }; $("#sj").onchange = load;
    $("#k").onchange = () => { const k = $("#k").value; $("#kf").classList.toggle("hidden", k !== "file"); $("#kl").classList.toggle("hidden", k !== "link"); $("#kn").classList.toggle("hidden", k !== "note"); };
    v.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return; const r = rows.find((x) => x.id === (b.dataset.o || b.dataset.h || b.dataset.x));
      try {
        if (b.dataset.o && r) { if (r.kind === "file") await openFile(r.file_path); else if (r.kind === "link") window.open(r.link_url, "_blank", "noopener"); else alert(r.body); }
        if (b.dataset.h && r) { const x = await sb().from("resources").update({ published: !r.published }).eq("id", r.id); if (x.error) throw x.error; load(); }
        if (b.dataset.x && r && (await confirmBox("Delete this material?"))) { const x = await sb().from("resources").delete().eq("id", r.id); if (x.error) throw x.error; if (r.file_path) await rm([r.file_path]); load(); }
      } catch (err) { msg($("#m"), friendly(err)); }
    };
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const k = $("#k").value, cid = $("#cl").value, sj = $("#sj").value, out = $("#m"), btn = e.submitter; if (!sj) return msg(out, "Choose a subject.");
      const row = { school_id: sid(), class_id: cid, subject_id: sj, session_id: st.sessId, term_id: st.termId || null, title: $("#t").value.trim(), topic: $("#tp").value.trim() || null, description: $("#d").value.trim() || null, kind: k, published: $("#pub").checked };
      btn.disabled = true;
      try {
        if (k === "file") { const f = $("#fl").files[0]; if (!f) throw new Error("Choose a file."); const path = `m/${sid()}/${cid}/${uid()}-${safeName(f.name)}`; await upload(path, f); row.file_path = path; row.file_name = f.name; }
        else if (k === "link") { const u = $("#lk").value.trim(); if (!/^https?:\/\//i.test(u)) throw new Error("Enter a link starting with https://"); row.link_url = u; }
        else { const n = $("#nb").value.trim(); if (!n) throw new Error("Write the note."); row.body = n; }
        const r = await sb().from("resources").insert(row); if (r.error) { if (row.file_path) await rm([row.file_path]); throw r.error; }
        $("#f").reset(); $("#k").onchange(); msg(out, "Material added.", "ok"); load();
      } catch (err) { msg(out, /bucket|not found/i.test(err.message) ? "Storage is not set up yet. Run 012_learning.sql in Supabase, then try again." : friendly(err)); }
      btn.disabled = false;
    };
    await load();
  };

  // ================= Teacher: assignments =================
  views.assignments = async function () {
    if (needSession()) return; const v = $("#view"), sc = await scope(); if (!sc.classes.length) return noScope("Assignments");
    v.innerHTML = `<h1>Assignments</h1>${filterHtml}
    <div class="panel"><h2>Set an assignment</h2><form id="f"><label for="t">Title</label><input id="t" required maxlength="120"><label for="ins">Instructions</label>${textArea("ins", 4)}<div class="row"><div><label for="due">Due (Nigeria time)</label><input id="due" type="datetime-local"></div><div><label for="mx">Marks available</label><input id="mx" type="number" min="1" max="100" step="0.5" value="10" required></div></div>
      <p style="margin:.7rem 0 .2rem"><strong>Students can answer by</strong></p><label style="display:flex;gap:.5rem;align-items:center;font-weight:400"><input id="at" type="checkbox" checked style="width:auto;min-height:0"> Typing an answer</label><label style="display:flex;gap:.5rem;align-items:center;font-weight:400"><input id="af" type="checkbox" checked style="width:auto;min-height:0"> Uploading a file</label>
      <label for="att">Attach a file for students (optional, max ${MAXMB} MB)</label><input id="att" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,image/*"><div id="m"></div><button class="btn" style="margin-top:.6rem">Publish assignment</button></form></div>
    <div class="panel"><h2>Assignments for this class and subject</h2><div id="list"></div></div>`;
    const fill = pickers(sc); let rows = [];
    async function load() {
      const cid = $("#cl").value, sj = $("#sj").value; if (!sj) { $("#list").innerHTML = `<div class="empty">No subject available.</div>`; return; }
      const { data, error } = await sb().from("assignments").select("*").eq("class_id", cid).eq("subject_id", sj).eq("session_id", st.sessId).order("created_at", { ascending: false }); if (error) return msg($("#list"), friendly(error)); rows = data;
      let subs = [], size = 0;
      if (rows.length) { const [s, c] = await Promise.all([sb().from("submissions").select("assignment_id, graded_at").in("assignment_id", rows.map((x) => x.id)), sb().from("students").select("id", { count: "exact", head: true }).eq("current_class_id", cid).eq("status", "active").is("deleted_at", null)]); subs = s.data || []; size = c.count || 0; }
      rows.forEach((r) => { const m = subs.filter((x) => x.assignment_id === r.id); r.n = m.length; r.g = m.filter((x) => x.graded_at).length; r.size = size; });
      mountTable($("#list"), [{ k: "title", label: "Title" }, { k: "due_at", label: "Due", text: (x) => (x.due_at ? when(x.due_at) : "No deadline") }, { k: "n", label: "Submitted", text: (x) => `${x.n} of ${x.size}` }, { k: "g", label: "Marked", text: (x) => `${x.g} of ${x.n}` }, { k: "closed", label: "Status", text: (x) => (x.closed ? "Closed" : "Open") }], rows, "No assignments yet. Set the first one above.", (x) => `<button class="btn ghost" data-o="${x.id}">Open</button> <button class="btn ghost" data-c="${x.id}">${x.closed ? "Reopen" : "Close"}</button> <button class="btn ghost" data-x="${x.id}">Delete</button>`);
    }
    $("#cl").onchange = () => { fill(); load(); }; $("#sj").onchange = load;
    v.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return; const r = rows.find((x) => x.id === (b.dataset.o || b.dataset.c || b.dataset.x));
      try {
        if (b.dataset.o && r) { st.asg = r.id; S.go("assignment"); }
        if (b.dataset.c && r) { const x = await sb().from("assignments").update({ closed: !r.closed }).eq("id", r.id); if (x.error) throw x.error; load(); }
        if (b.dataset.x && r && (await confirmBox("Delete this assignment and every student submission for it? This cannot be undone."))) {
          const s = await sb().from("submissions").select("file_path").eq("assignment_id", r.id); const paths = (s.data || []).map((x) => x.file_path).filter(Boolean).concat(r.attachment_path ? [r.attachment_path] : []);
          const x = await sb().from("assignments").delete().eq("id", r.id); if (x.error) throw x.error; await rm(paths); load();
        }
      } catch (err) { msg($("#m"), friendly(err)); }
    };
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const cid = $("#cl").value, sj = $("#sj").value, out = $("#m"), btn = e.submitter; if (!sj) return msg(out, "Choose a subject.");
      if (!$("#at").checked && !$("#af").checked) return msg(out, "Let students answer by typing, by uploading a file, or both.");
      const dv = $("#due").value; const row = { school_id: sid(), class_id: cid, subject_id: sj, session_id: st.sessId, term_id: st.termId || null, title: $("#t").value.trim(), instructions: $("#ins").value.trim() || null, due_at: dv ? new Date(dv + ":00+01:00").toISOString() : null, max_score: Number($("#mx").value), allow_text: $("#at").checked, allow_file: $("#af").checked };
      btn.disabled = true;
      try {
        const f = $("#att").files[0]; if (f) { const path = `a/${sid()}/${cid}/${uid()}-${safeName(f.name)}`; await upload(path, f); row.attachment_path = path; row.attachment_name = f.name; }
        const r = await sb().from("assignments").insert(row); if (r.error) { if (row.attachment_path) await rm([row.attachment_path]); throw r.error; }
        $("#f").reset(); msg(out, "Assignment published. Students and parents have been notified in the app.", "ok"); load();
      } catch (err) { msg(out, /bucket|not found/i.test(err.message) ? "Storage is not set up yet. Run 012_learning.sql in Supabase, then try again." : friendly(err)); }
      btn.disabled = false;
    };
    await load();
  };

  // ================= Teacher: one assignment, marking =================
  views.assignment = async function () {
    const id = st.asg; if (!id) return S.go("assignments"); const v = $("#view");
    const a = await sb().from("assignments").select("*").eq("id", id).single(); if (a.error) throw a.error; const as = a.data;
    const [stu, subs, sj] = await Promise.all([sb().from("students").select("id, first_name, last_name, admission_no").eq("current_class_id", as.class_id).eq("status", "active").is("deleted_at", null).order("last_name"), sb().from("submissions").select("*").eq("assignment_id", id), sb().from("subjects").select("name").eq("id", as.subject_id).single()]);
    if (stu.error) throw stu.error; if (subs.error) throw subs.error; const by = Object.fromEntries(subs.data.map((x) => [x.student_id, x]));
    const stat = (s) => (!s ? "Not submitted" : s.graded_at ? `Marked ${s.score}/${as.max_score}` : s.is_late ? "Submitted late" : "Submitted");
    v.innerHTML = `<p><button class="linkbtn" id="back">← Assignments</button></p><h1>${esc(as.title)}</h1><p class="muted">${esc(sj.data.name)} · ${as.due_at ? "Due " + esc(when(as.due_at)) : "No deadline"} · ${as.max_score} marks · ${as.closed ? "Closed" : "Open"}</p>
    <div class="panel"><div style="white-space:pre-wrap">${esc(as.instructions || "No instructions.")}</div>${as.attachment_path ? `<p><button class="btn ghost" id="att">Open attached file</button></p>` : ""}</div><div id="m"></div>
    ${stu.data.map((s) => { const x = by[s.id]; return `<div class="panel" data-s="${s.id}"><strong>${esc(fullName(s))}</strong> <span class="badge">${esc(stat(x))}</span>${x ? `<div style="margin:.5rem 0">${x.text_answer ? `<div style="white-space:pre-wrap;border:1px solid var(--line);border-radius:8px;padding:.6rem">${esc(x.text_answer)}</div>` : ""}${x.file_path ? `<p><button class="btn ghost" data-f="${esc(x.file_path)}">Open ${esc(x.file_name || "file")}</button></p>` : ""}<small class="muted">Submitted ${esc(when(x.resubmitted_at || x.submitted_at))}</small></div><div class="row"><div><label>Score (out of ${as.max_score})</label><input type="number" data-sc min="0" max="${as.max_score}" step="0.5" value="${x.score ?? ""}"></div><div><label>Feedback</label><input data-fb maxlength="500" value="${esc(x.feedback || "")}"></div><div><button class="btn" data-g="${x.id}">${x.graded_at ? "Update mark" : "Save mark"}</button></div></div>` : ""}</div>`; }).join("") || `<div class="panel"><div class="empty">No active students in this class.</div></div>`}`;
    $("#back").onclick = () => S.go("assignments");
    v.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      try {
        if (b.id === "att") await openFile(as.attachment_path);
        if (b.dataset.f) await openFile(b.dataset.f);
        if (b.dataset.g) { const p = b.closest(".panel"), r = await sb().rpc("grade_submission", { p_submission: b.dataset.g, p_score: Number(p.querySelector("[data-sc]").value), p_feedback: p.querySelector("[data-fb]").value }); if (r.error) throw r.error; msg($("#m"), "Mark saved. The student and parents have been notified.", "ok"); b.textContent = "Update mark"; p.querySelector(".badge").textContent = "Marked " + p.querySelector("[data-sc]").value + "/" + as.max_score; $("#m").scrollIntoView({ block: "center", behavior: "smooth" }); }
      } catch (err) { msg($("#m"), friendly(err)); $("#m").scrollIntoView({ block: "center", behavior: "smooth" }); }
    };
  };

  // ---- parent / student: choose the child ----
  async function myKids() { const r = await sb().from("students").select("id, first_name, last_name, current_class_id").eq("school_id", sid()); if (r.error) throw r.error; return r.data.filter((s) => s.current_class_id); }
  const kidPicker = (kids) => (kids.length > 1 ? `<div class="panel"><label for="kid">Student</label><select id="kid">${kids.map((s) => `<option value="${s.id}">${esc(fullName(s))}</option>`).join("")}</select></div>` : "");
  const curKid = (kids) => kids.find((k) => k.id === (($("#kid") || {}).value || kids[0].id)) || kids[0];

  // ================= Student / parent: materials =================
  views.studymaterials = async function () {
    const v = $("#view"), kids = await myKids(); if (!kids.length) { v.innerHTML = `<h1>Learning materials</h1><div class="panel"><div class="empty">No student with a class is linked to your account yet.</div></div>`; return; }
    v.innerHTML = `<h1>Learning materials</h1>${kidPicker(kids)}<div id="list"></div>`;
    const sj = await sb().from("subjects").select("id, name").eq("school_id", sid());
    async function load() {
      const k = curKid(kids), r = await sb().from("resources").select("*").eq("class_id", k.current_class_id).order("created_at", { ascending: false }); if (r.error) return msg($("#list"), friendly(r.error));
      const names = Object.fromEntries((sj.data || []).map((s) => [s.id, s.name])), g = {}; r.data.forEach((x) => (g[x.subject_id] = g[x.subject_id] || []).push(x));
      $("#list").innerHTML = r.data.length ? Object.entries(g).map(([k2, list]) => `<div class="panel"><h2>${esc(names[k2] || "Subject")}</h2>${list.map((x) => `<div class="card" style="margin-bottom:.5rem"><strong>${esc(x.title)}</strong>${x.topic ? ` <span class="badge">${esc(x.topic)}</span>` : ""}<div class="muted" style="font-size:.85rem">${esc(x.description || "")}</div><small class="muted">${esc(x.created_by_name || "Teacher")} · ${esc(day(x.created_at))}</small><div style="margin-top:.4rem"><button class="btn ghost" data-o="${x.id}">${x.kind === "note" ? "Read" : "Open"}</button></div></div>`).join("")}</div>`).join("") : `<div class="panel"><div class="empty">No materials have been shared yet.</div></div>`;
      $("#list")._rows = r.data;
    }
    if ($("#kid")) $("#kid").onchange = load;
    v.onclick = async (e) => { const b = e.target.closest("[data-o]"); if (!b) return; const x = ($("#list")._rows || []).find((r) => r.id === b.dataset.o); if (!x) return; try { if (x.kind === "file") await openFile(x.file_path); else if (x.kind === "link") window.open(x.link_url, "_blank", "noopener"); else alert(x.body); } catch (err) { msg($("#list"), friendly(err)); } };
    await load();
  };

  // ================= Student / parent: assignments =================
  views.classwork = async function () {
    const v = $("#view"), kids = await myKids(); if (!kids.length) { v.innerHTML = `<h1>Assignments</h1><div class="panel"><div class="empty">No student with a class is linked to your account yet.</div></div>`; return; }
    v.innerHTML = `<h1>Assignments</h1>${kidPicker(kids)}<div class="panel" id="list"></div>`;
    const sj = await sb().from("subjects").select("id, name").eq("school_id", sid()), names = Object.fromEntries((sj.data || []).map((s) => [s.id, s.name]));
    async function load() {
      const k = curKid(kids), a = await sb().from("assignments").select("*").eq("class_id", k.current_class_id).order("due_at", { ascending: true, nullsFirst: false }); if (a.error) return msg($("#list"), friendly(a.error));
      const s = await sb().from("submissions").select("*").eq("student_id", k.id), by = Object.fromEntries((s.data || []).map((x) => [x.assignment_id, x]));
      const now = Date.now(), status = (x) => { const m = by[x.id]; return m ? (m.graded_at ? `Marked ${m.score}/${x.max_score}` : m.is_late ? "Submitted late" : "Submitted") : x.closed ? "Closed" : x.due_at && now > new Date(x.due_at) ? "Overdue" : "To do"; };
      const rows = a.data.map((x) => ({ ...x, subject: names[x.subject_id] || "", status: status(x) }));
      mountTable($("#list"), [{ k: "title", label: "Assignment" }, { k: "subject", label: "Subject" }, { k: "due_at", label: "Due", text: (x) => (x.due_at ? when(x.due_at) : "No deadline") }, { k: "status", label: "Status" }], rows, "No assignments yet.", (x) => `<button class="btn ghost" data-o="${x.id}">Open</button>`);
      $("#list")._kid = k;
    }
    if ($("#kid")) $("#kid").onchange = load;
    v.onclick = (e) => { const b = e.target.closest("[data-o]"); if (b) { st.work = { id: b.dataset.o, kid: $("#list")._kid.id }; S.go("work"); } };
    await load();
  };

  views.work = async function () {
    const w = st.work; if (!w) return S.go("classwork"); const v = $("#view"), student = role() === "student";
    const [a, s] = await Promise.all([sb().from("assignments").select("*").eq("id", w.id).single(), sb().from("submissions").select("*").eq("assignment_id", w.id).eq("student_id", w.kid).maybeSingle()]);
    if (a.error) throw a.error; const as = a.data, sub = s.data, sj = await sb().from("subjects").select("name").eq("id", as.subject_id).single();
    const overdue = as.due_at && Date.now() > new Date(as.due_at), canSubmit = student && !as.closed && !(sub && sub.graded_at);
    v.innerHTML = `<p><button class="linkbtn" id="back">← Assignments</button></p><h1>${esc(as.title)}</h1><p class="muted">${esc(sj.data ? sj.data.name : "")} · ${as.due_at ? "Due " + esc(when(as.due_at)) : "No deadline"}${overdue && !sub ? " (overdue; late work is still accepted until the teacher closes it)" : ""} · ${as.max_score} marks</p>
    <div class="panel"><div style="white-space:pre-wrap">${esc(as.instructions || "No instructions.")}</div>${as.attachment_path ? `<p><button class="btn ghost" id="att">Open attached file</button></p>` : ""}</div>
    ${sub ? `<div class="panel"><h2>${sub.graded_at ? "Marked" : "Submitted"}</h2>${sub.graded_at ? `<p style="font-size:1.3rem"><strong>${esc(sub.score)}</strong> out of ${esc(as.max_score)}</p>${sub.feedback ? `<p><strong>Teacher's feedback:</strong> ${esc(sub.feedback)}</p>` : ""}` : `<p class="muted">Waiting to be marked.</p>`}${sub.text_answer ? `<div style="white-space:pre-wrap;border:1px solid var(--line);border-radius:8px;padding:.6rem">${esc(sub.text_answer)}</div>` : ""}${sub.file_path ? `<p><button class="btn ghost" data-f="${esc(sub.file_path)}">Open ${esc(sub.file_name || "file")}</button></p>` : ""}<small class="muted">Submitted ${esc(when(sub.resubmitted_at || sub.submitted_at))}${sub.is_late ? " (late)" : ""}</small></div>` : ""}
    <div id="m"></div>
    ${canSubmit ? `<div class="panel"><h2>${sub ? "Change your answer" : "Your answer"}</h2><form id="f">${as.allow_text ? `<label for="tx">Type your answer</label>${textArea("tx", 6, sub ? sub.text_answer : "")}` : ""}${as.allow_file ? `<label for="fl">Or upload a file (max ${MAXMB} MB)</label><input id="fl" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.mp3,image/*">${sub && sub.file_name ? `<small class="muted">Current file: ${esc(sub.file_name)}. Choose a new file to replace it.</small>` : ""}` : ""}<button class="btn" style="margin-top:.7rem">${sub ? "Resubmit" : "Submit"}</button></form></div>` : !student && !sub ? `<div class="panel"><p class="muted">Not submitted yet. Only the student can submit work.</p></div>` : ""}`;
    $("#back").onclick = () => S.go("classwork");
    v.onclick = async (e) => { const b = e.target.closest("button"); if (!b) return; try { if (b.id === "att") await openFile(as.attachment_path); if (b.dataset.f) await openFile(b.dataset.f); } catch (err) { msg($("#m"), friendly(err)); } };
    if ($("#f")) $("#f").onsubmit = async (e) => {
      e.preventDefault(); const btn = e.submitter, out = $("#m"), txt = $("#tx") ? $("#tx").value.trim() : "", f = $("#fl") ? $("#fl").files[0] : null; let path = sub ? sub.file_path : null, name = sub ? sub.file_name : null, fresh = null;
      if (!txt && !f && !path) return msg(out, "Type an answer or choose a file.");
      btn.disabled = true;
      try {
        if (f) { fresh = `s/${sid()}/${w.kid}/${as.id}/${uid()}-${safeName(f.name)}`; await upload(fresh, f); path = fresh; name = f.name; }
        const r = await sb().rpc("submit_assignment", { p_assignment: as.id, p_text: txt, p_file_path: as.allow_file ? path : null, p_file_name: as.allow_file ? name : null });
        if (r.error) { if (fresh) await rm([fresh]); throw r.error; }
        if (fresh && sub && sub.file_path && sub.file_path !== fresh) await rm([sub.file_path]);
        await S.go("work"); msg($("#m"), "Your work has been submitted.", "ok");
      } catch (err) { msg(out, /bucket|not found/i.test(err.message) ? "Storage is not set up yet. Ask your school to run the latest update." : friendly(err)); }
      btn.disabled = false;
    };
    if (as.attachment_path === undefined) return;
  };
})();
