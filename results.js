// Phase 3 (brought forward): score entry, class results, grading scale, report cards
// Scheme: CA1 /20 + CA2 /20 + Exam /60 = 100
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, esc = S.esc, msg = S.msg, friendly = S.friendly, confirmBox = S.confirmBox, mountTable = S.mountTable;
  const $ = (s) => document.querySelector(s);
  const sb = () => S.sb(), sid = () => S.schoolId(), views = S.views;
  const MAX = { ca1: 20, ca2: 20, exam: 60 };
  const clsLabel = (c) => c.name + (c.arm ? " " + c.arm : "");
  const fullName = (x) => [x.first_name, x.last_name].filter(Boolean).join(" ");
  const ord = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const fmt = (v) => (v === null || v === undefined ? "" : Number(v).toString());

  (window.SSMS_NAV = window.SSMS_NAV || []).push((items, state, isManager) => {
    if (!state.ctx || !state.ctx.school) return;
    const r = state.ctx.role;
    if (isManager() || r === "teacher") items.push(["scoreentry", "✏️", "Score entry"], ["results", "📊", "Results"]);
    if (isManager()) items.push(["grading", "🏅", "Grading scale"]);
    if (r === "parent" || r === "student") items.push(["myreports", "📄", "Report cards"]);
  });

  async function loadScale() {
    if (S.isManager()) { const r = await sb().rpc("ensure_grading_scale", { p_school: sid() }); if (r.error) throw r.error; }
    const { data, error } = await sb().from("grading_scales").select("*").eq("school_id", sid()).order("min_score", { ascending: false });
    if (error) throw error; return data;
  }
  function gradeFor(total, scale) {
    if (total === null || total === undefined) return { grade: "", remark: "" };
    const b = scale.find((x) => total >= Number(x.min_score) && total < Number(x.max_score) + 1);
    return b ? { grade: b.grade, remark: b.remark || "" } : { grade: "?", remark: "No grade band" };
  }
  const needTerm = () => { if (!st.sessId || !st.termId) { $("#view").innerHTML = `<div class="panel"><h1>Pick a session and term</h1><p>Add a session and term under <strong>Sessions &amp; terms</strong>, then choose them in the top bar.</p></div>`; return true; } return false; };
  const termName = (id) => { const t = st.terms.find((x) => x.id === id); const s = t && st.sessions.find((x) => x.id === t.session_id); return t ? `${t.name}${s ? ", " + s.name : ""}` : ""; };

  // which classes/subjects can this user work with?
  async function myScope() {
    const { data: classes, error: ce } = await sb().from("classes").select("*").eq("school_id", sid()).order("name"); if (ce) throw ce;
    const { data: subjects, error: se } = await sb().from("subjects").select("*").eq("school_id", sid()).order("name"); if (se) throw se;
    if (S.isManager()) return { classes, subjects, pairs: null };
    const { data: ta, error } = await sb().from("teacher_assignments").select("class_id, subject_id").eq("school_id", sid()).eq("session_id", st.sessId); if (error) throw error;
    const cids = new Set(ta.map((x) => x.class_id));
    return { classes: classes.filter((c) => cids.has(c.id)), subjects, pairs: ta };
  }

  // ---------- Score entry ----------
  views.scoreentry = async function () {
    if (needTerm()) return;
    const v = $("#view"), scope = await myScope(), scale = await loadScale();
    if (!scope.classes.length) { v.innerHTML = `<h1>Score entry</h1><div class="panel"><div class="empty">${S.isManager() ? "Add a class first." : "You have no classes assigned for this session. Ask the administrator to assign you under Subjects &amp; teaching."}</div></div>`; return; }
    v.innerHTML = `<h1>Score entry</h1><p class="muted">${esc(termName(st.termId))} · CA1 out of 20, CA2 out of 20, Exam out of 60</p>
    <div class="panel"><div class="row"><div><label for="cl">Class</label><select id="cl">${scope.classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div><div><label for="sj">Subject</label><select id="sj"></select></div></div></div>
    <div class="panel"><div id="m"></div><div id="grid"></div></div>`;
    function fillSubjects() {
      const cid = $("#cl").value; const ids = scope.pairs ? new Set(scope.pairs.filter((p) => p.class_id === cid).map((p) => p.subject_id)) : null;
      const subs = scope.subjects.filter((s) => !ids || ids.has(s.id));
      $("#sj").innerHTML = subs.length ? subs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("") : `<option value="">No subjects</option>`;
    }
    async function loadGrid() {
      const cid = $("#cl").value, subj = $("#sj").value, g = $("#grid"); msg($("#m"), "");
      if (!subj) { g.innerHTML = `<div class="empty">No subject available for this class. Add subjects and teaching assignments first.</div>`; return; }
      g.innerHTML = `<p><span class="spin"></span> Loading…</p>`;
      const [stu, sc] = await Promise.all([
        sb().from("students").select("id, first_name, last_name, admission_no").eq("school_id", sid()).eq("current_class_id", cid).eq("status", "active").is("deleted_at", null).order("last_name"),
        sb().from("scores").select("*").eq("class_id", cid).eq("subject_id", subj).eq("term_id", st.termId),
      ]);
      if (stu.error) return msg($("#m"), friendly(stu.error)); if (sc.error) return msg($("#m"), friendly(sc.error));
      if (!stu.data.length) { g.innerHTML = `<div class="empty">No active students in this class yet.</div>`; return; }
      const by = Object.fromEntries(sc.data.map((x) => [x.student_id, x]));
      g.innerHTML = `<div class="tablewrap"><table><thead><tr><th>Student</th><th>CA1<br><small>/20</small></th><th>CA2<br><small>/20</small></th><th>Exam<br><small>/60</small></th><th>Total</th><th>Grade</th></tr></thead><tbody>${stu.data.map((s) => { const x = by[s.id] || {}; return `<tr data-s="${s.id}"><td>${esc(fullName(s))}<br><small class="muted">${esc(s.admission_no)}</small></td>${["ca1", "ca2", "exam"].map((k) => `<td><input type="number" inputmode="decimal" step="0.5" min="0" max="${MAX[k]}" data-k="${k}" value="${esc(fmt(x[k]))}" style="width:78px" aria-label="${k} for ${esc(fullName(s))}"></td>`).join("")}<td class="tot"></td><td class="gr"></td></tr>`; }).join("")}</tbody></table></div><p class="muted">Leave a box empty if the score is not available yet. Scores are saved only when you tap Save.</p><button class="btn" id="save">Save scores</button>`;
      function calc(tr) {
        const vals = [...tr.querySelectorAll("input")].map((i) => num(i.value)); const any = vals.some((x) => x !== null);
        const t = any ? vals.reduce((a, b) => a + (b || 0), 0) : null; tr.querySelector(".tot").textContent = any ? t : ""; tr.querySelector(".gr").textContent = any ? gradeFor(t, scale).grade : "";
      }
      g.querySelectorAll("tbody tr").forEach(calc); g.oninput = (e) => { const tr = e.target.closest("tr"); if (tr) calc(tr); };
      $("#save").onclick = async () => {
        const rows = []; let bad = null;
        g.querySelectorAll("tbody tr").forEach((tr) => {
          const o = { school_id: sid(), student_id: tr.dataset.s, class_id: cid, subject_id: subj, session_id: st.sessId, term_id: st.termId }; let any = false;
          tr.querySelectorAll("input").forEach((i) => { const k = i.dataset.k, val = num(i.value); o[k] = val; if (val !== null) { any = true; if (isNaN(val) || val < 0 || val > MAX[k]) bad = `${k.toUpperCase()} must be between 0 and ${MAX[k]}.`; } });
          if (any) rows.push(o);
        });
        if (bad) return msg($("#m"), bad); if (!rows.length) return msg($("#m"), "Nothing to save yet. Enter at least one score.");
        const btn = $("#save"); btn.disabled = true;
        const { error } = await sb().from("scores").upsert(rows, { onConflict: "student_id,subject_id,term_id" }); btn.disabled = false;
        msg($("#m"), error ? (error.code === "42501" || /row-level/.test(error.message) ? "You can't change these scores. They may be published, or this subject isn't assigned to you." : friendly(error)) : `${rows.length} score${rows.length === 1 ? "" : "s"} saved.`, error ? "err" : "ok");
      };
    }
    $("#cl").onchange = () => { fillSubjects(); loadGrid(); }; $("#sj").onchange = loadGrid; fillSubjects(); await loadGrid();
  };

  // ---------- Class results ----------
  views.results = async function () {
    if (needTerm()) return;
    const v = $("#view"), mgr = S.isManager(), scope = await myScope(), scale = await loadScale();
    if (!scope.classes.length) { v.innerHTML = `<h1>Results</h1><div class="panel"><div class="empty">No classes available.</div></div>`; return; }
    v.innerHTML = `<h1>Results</h1><p class="muted">${esc(termName(st.termId))}</p><div class="panel"><div class="row"><div><label for="cl">Class</label><select id="cl">${scope.classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div></div><div id="m"></div><div id="info" class="muted" style="margin-top:.6rem"></div><div id="list" style="margin-top:.8rem"></div></div>`;
    async function load() {
      const cid = $("#cl").value; $("#list").innerHTML = `<p><span class="spin"></span> Loading…</p>`;
      const [res, stu, rc] = await Promise.all([sb().rpc("class_results", { p_class: cid, p_term: st.termId }), sb().from("students").select("id, first_name, last_name, admission_no").eq("current_class_id", cid).is("deleted_at", null), sb().from("report_cards").select("student_id, status").eq("class_id", cid).eq("term_id", st.termId)]);
      if (res.error) return ($("#list").innerHTML = ""), msg($("#m"), friendly(res.error)); if (stu.error) return msg($("#m"), friendly(stu.error));
      const nm = Object.fromEntries(stu.data.map((s) => [s.id, s])), status = Object.fromEntries((rc.data || []).map((r) => [r.student_id, r.status]));
      const rows = res.data.map((r) => ({ ...r, name: nm[r.student_id] ? fullName(nm[r.student_id]) : "Former student", adm: nm[r.student_id] ? nm[r.student_id].admission_no : "", status: status[r.student_id] || "draft" }));
      const pub = rows.filter((r) => r.status === "published").length;
      $("#info").innerHTML = `${rows.length} student${rows.length === 1 ? "" : "s"} with scores · ${pub} published` + (mgr && rows.length ? `<div class="row" style="margin-top:.6rem"><div><button class="btn" id="pubAll">Publish all to parents &amp; students</button></div><div><button class="btn ghost" id="unpubAll">Unpublish all</button></div></div>` : "");
      mountTable($("#list"), [{ k: "rank_pos", label: "Position", text: (x) => ord(x.rank_pos) }, { k: "name", label: "Student" }, { k: "subjects", label: "Subjects" }, { k: "total", label: "Total" }, { k: "average", label: "Average" }, { k: "g", label: "Grade", text: (x) => gradeFor(Number(x.average), scale).grade }, { k: "status", label: "Status", text: (x) => (x.status === "published" ? "Published" : "Draft") }], rows, "No scores entered for this class and term yet.", (x) => `<button class="btn ghost" data-rc="${x.student_id}">Report card</button>`);
      $("#list")._rows = rows;
      if (mgr && rows.length) {
        $("#pubAll").onclick = async () => { if (!(await confirmBox("Publish this class's results? Parents and students will be able to see them."))) return; const r = await sb().rpc("set_report_status", { p_class: cid, p_term: st.termId, p_status: "published" }); if (r.error) return msg($("#m"), friendly(r.error)); msg($("#m"), "Results published.", "ok"); load(); };
        $("#unpubAll").onclick = async () => { if (!(await confirmBox("Hide this class's results from parents and students?"))) return; const r = await sb().rpc("set_report_status", { p_class: cid, p_term: st.termId, p_status: "draft" }); if (r.error) return msg($("#m"), friendly(r.error)); msg($("#m"), "Results hidden.", "ok"); load(); };
      }
    }
    $("#cl").onchange = load; await load();
    v.onclick = (e) => { const b = e.target.closest("[data-rc]"); if (b) { st.rc = { student: b.dataset.rc, term: st.termId, back: "results" }; S.go("reportcard"); } };
  };

  // ---------- Grading scale ----------
  views.grading = async function () {
    const v = $("#view"); let scale = await loadScale();
    function draw() {
      v.innerHTML = `<h1>Grading scale</h1><p class="muted">Each band covers whole marks, e.g. A = 70 to 100, B = 60 to 69. Bands must not overlap.</p><div class="panel"><div class="tablewrap"><table><thead><tr><th>Grade</th><th>From</th><th>To</th><th>Remark</th><th></th></tr></thead><tbody id="rows">${scale.map((b, i) => `<tr data-i="${i}"><td><input data-f="grade" value="${esc(b.grade)}" maxlength="4" style="width:70px"></td><td><input data-f="min_score" type="number" min="0" max="100" value="${esc(b.min_score)}" style="width:80px"></td><td><input data-f="max_score" type="number" min="0" max="100" value="${esc(b.max_score)}" style="width:80px"></td><td><input data-f="remark" value="${esc(b.remark || "")}" maxlength="40"></td><td><button class="btn ghost" data-del="${i}">Remove</button></td></tr>`).join("")}</tbody></table></div><div id="m"></div><div class="row" style="margin-top:.7rem"><div><button class="btn ghost" id="add">Add a band</button></div><div><button class="btn" id="save">Save grading scale</button></div></div></div>`;
      $("#add").onclick = () => { grab(); scale.push({ grade: "", min_score: 0, max_score: 0, remark: "" }); draw(); };
      v.onclick = (e) => { const b = e.target.closest("[data-del]"); if (b) { grab(); scale.splice(+b.dataset.del, 1); draw(); } };
      $("#save").onclick = save;
    }
    function grab() { scale = [...document.querySelectorAll("#rows tr")].map((tr) => { const g = (f) => tr.querySelector(`[data-f=${f}]`).value; return { id: scale[+tr.dataset.i] && scale[+tr.dataset.i].id, grade: g("grade").trim().toUpperCase(), min_score: Number(g("min_score")), max_score: Number(g("max_score")), remark: g("remark").trim() }; }); }
    async function save() {
      grab(); const out = $("#m");
      if (!scale.length) return msg(out, "Keep at least one grade band.");
      for (const b of scale) if (!b.grade || isNaN(b.min_score) || isNaN(b.max_score) || b.max_score < b.min_score || b.min_score < 0 || b.max_score > 100) return msg(out, "Each band needs a grade and valid marks between 0 and 100 (From must not be above To).");
      if (new Set(scale.map((b) => b.grade)).size !== scale.length) return msg(out, "Each grade letter can appear only once.");
      const s = [...scale].sort((a, b) => a.min_score - b.min_score); for (let i = 1; i < s.length; i++) if (s[i].min_score <= s[i - 1].max_score) return msg(out, `The ${s[i - 1].grade} and ${s[i].grade} bands overlap.`);
      if (!(await confirmBox("Save this grading scale? It will apply to all report cards."))) return;
      const del = await sb().from("grading_scales").delete().eq("school_id", sid()); if (del.error) return msg(out, friendly(del.error));
      const ins = await sb().from("grading_scales").insert(scale.map((b) => ({ school_id: sid(), grade: b.grade, min_score: b.min_score, max_score: b.max_score, remark: b.remark || null })));
      if (ins.error) { await sb().rpc("ensure_grading_scale", { p_school: sid() }); return msg(out, friendly(ins.error)); }
      scale = await loadScale(); draw(); msg($("#m"), "Grading scale saved.", "ok");
    }
    draw();
  };

  // ---------- Report card ----------
  views.reportcard = async function () {
    const v = $("#view"), rc = st.rc; if (!rc) return S.go("dashboard");
    const mgr = S.isManager(), canComment = mgr || st.ctx.role === "teacher";
    const [stu, sc, subj, card, stand, scale] = await Promise.all([
      sb().from("students").select("*").eq("id", rc.student).single(),
      sb().from("scores").select("*").eq("student_id", rc.student).eq("term_id", rc.term),
      sb().from("subjects").select("id, name").eq("school_id", sid()),
      sb().from("report_cards").select("*").eq("student_id", rc.student).eq("term_id", rc.term).maybeSingle(),
      sb().rpc("student_standing", { p_student: rc.student, p_term: rc.term }),
      loadScale(),
    ]);
    if (stu.error) throw stu.error; if (sc.error) throw sc.error;
    const s = stu.data, sn = Object.fromEntries((subj.data || []).map((x) => [x.id, x.name])), c = card.data || {}, sd = (stand.data && stand.data[0]) || null;
    const cls = await sb().from("classes").select("*").eq("id", s.current_class_id || (sc.data[0] && sc.data[0].class_id)).maybeSingle();
    const rows = [...sc.data].sort((a, b) => (sn[a.subject_id] || "").localeCompare(sn[b.subject_id] || ""));
    const ga = sd ? gradeFor(Number(sd.average), scale) : { grade: "", remark: "" };
    const published = c.status === "published";
    v.innerHTML = `<p class="no-print"><button class="linkbtn" id="back">← Back</button></p>
    <div class="panel" id="card"><div style="text-align:center"><h1 style="margin-bottom:0">${esc(st.ctx.school.name)}</h1><h2 style="margin:.2rem 0">Terminal report card</h2><div class="muted">${esc(termName(rc.term))}</div></div>
    <p style="margin-top:1rem"><strong>${esc(fullName(s))}</strong> · Admission no. ${esc(s.admission_no)}<br>Class: ${esc(cls.data ? clsLabel(cls.data) : "—")}${sd ? ` · Position: ${esc(ord(sd.rank_pos))} of ${esc(sd.class_size)}` : ""}</p>
    ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Subject</th><th>CA1<br><small>20</small></th><th>CA2<br><small>20</small></th><th>Exam<br><small>60</small></th><th>Total<br><small>100</small></th><th>Grade</th><th>Remark</th></tr></thead><tbody>${rows.map((r) => { const g = gradeFor(Number(r.total), scale); return `<tr><td>${esc(sn[r.subject_id] || "Subject")}</td><td>${esc(fmt(r.ca1))}</td><td>${esc(fmt(r.ca2))}</td><td>${esc(fmt(r.exam))}</td><td><strong>${esc(fmt(r.total))}</strong></td><td>${esc(g.grade)}</td><td>${esc(g.remark)}</td></tr>`; }).join("")}</tbody></table></div>
    ${sd ? `<p style="margin-top:.8rem">Subjects: <strong>${sd.subjects}</strong> · Total: <strong>${esc(fmt(sd.total))}</strong> · Average: <strong>${esc(fmt(sd.average))}</strong> · Overall grade: <strong>${esc(ga.grade)}</strong> (${esc(ga.remark)})</p>` : ""}` : `<div class="empty">No scores recorded for this term.</div>`}
    <p><strong>Class teacher's comment:</strong> ${esc(c.teacher_comment || "—")}</p><p><strong>Principal's comment:</strong> ${esc(c.principal_comment || "—")}</p>
    <p class="muted">Status: ${published ? "Published" : "Draft (not yet visible to parents or students)"}. Attendance summary will appear here once the attendance module is added.</p></div>
    <div class="panel no-print"><button class="btn" id="print">Print / save as PDF</button></div>
    ${canComment ? `<div class="panel no-print"><h2>Comments</h2><label for="tc">Class teacher's comment</label><textarea id="tc" rows="2" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:.6rem;background:var(--surface);color:var(--text)" ${!mgr && published ? "disabled" : ""}>${esc(c.teacher_comment || "")}</textarea>${mgr ? `<label for="pc">Principal's comment</label><textarea id="pc" rows="2" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:.6rem;background:var(--surface);color:var(--text)">${esc(c.principal_comment || "")}</textarea>` : ""}<div id="m"></div><button class="btn" id="cs" style="margin-top:.6rem">Save comments</button></div>` : ""}`;
    $("#back").onclick = () => S.go(rc.back || "dashboard");
    $("#print").onclick = () => window.print();
    if (canComment) $("#cs").onclick = async () => { const r = await sb().rpc("save_comment", { p_student: rc.student, p_term: rc.term, p_teacher: $("#tc").value, p_principal: mgr ? $("#pc").value : null }); msg($("#m"), r.error ? friendly(r.error) : "Comments saved.", r.error ? "err" : "ok"); };
  };

  // ---------- Parent / student: published report cards ----------
  views.myreports = async function () {
    const v = $("#view");
    const [stu, rcs] = await Promise.all([sb().from("students").select("id, first_name, last_name, admission_no").eq("school_id", sid()), sb().from("report_cards").select("student_id, term_id, published_at").eq("school_id", sid()).eq("status", "published")]);
    if (stu.error) throw stu.error; if (rcs.error) throw rcs.error;
    v.innerHTML = `<h1>Report cards</h1><div class="panel" id="list"></div>`;
    const nm = Object.fromEntries(stu.data.map((s) => [s.id, fullName(s)]));
    mountTable($("#list"), [{ k: "n", label: "Student", text: (x) => nm[x.student_id] || "" }, { k: "t", label: "Term", text: (x) => termName(x.term_id) }], rcs.data, "No report cards have been published yet.", (x) => `<button class="btn ghost" data-v="${x.student_id}|${x.term_id}">View</button>`);
    v.onclick = (e) => { const b = e.target.closest("[data-v]"); if (!b) return; const [a, t] = b.dataset.v.split("|"); st.rc = { student: a, term: t, back: "myreports" }; S.go("reportcard"); };
  };
})();
