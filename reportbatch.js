// Print a whole class's report cards at once (one card per page)
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, esc = S.esc, msg = S.msg, friendly = S.friendly;
  const $ = (q) => document.querySelector(q);
  const sb = () => S.sb(), sid = () => S.schoolId(), views = S.views;
  const clsLabel = (c) => c.name + (c.arm ? " " + c.arm : "");
  const fullName = (x) => [x.first_name, x.last_name].filter(Boolean).join(" ");
  const ord = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const fmt = (v) => (v === null || v === undefined ? "" : Number(v).toString());
  const termName = (id) => { const t = st.terms.find((x) => x.id === id); const s = t && st.sessions.find((x) => x.id === t.session_id); return t ? `${t.name}${s ? ", " + s.name : ""}` : ""; };
  function gradeFor(total, scale) {
    if (total === null || total === undefined || isNaN(total)) return { grade: "", remark: "" };
    const b = scale.find((x) => total >= Number(x.min_score) && total < Number(x.max_score) + 1);
    return b ? { grade: b.grade, remark: b.remark || "" } : { grade: "?", remark: "" };
  }
  async function fetchAll(make) { let out = [], from = 0; for (;;) { const { data, error } = await make().range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000; } return out; }

  (window.SSMS_NAV = window.SSMS_NAV || []).push((items, state, isManager) => {
    if (!state.ctx || !state.ctx.school) return;
    if (isManager()) items.push(["classcards", "🖨️", "Print class cards"]);
  });

  views.classcards = async function () {
    const v = $("#view");
    if (!S.isManager()) { v.innerHTML = `<div class="panel"><h1>Print class cards</h1><p>Only school administrators can print report cards for a whole class.</p></div>`; return; }
    if (!st.sessId || !st.termId) { v.innerHTML = `<div class="panel"><h1>Pick a session and term</h1><p>Choose them in the top bar first.</p></div>`; return; }
    const cl = await sb().from("classes").select("*").eq("school_id", sid()).order("name"); if (cl.error) throw cl.error;
    if (!cl.data.length) { v.innerHTML = `<h1>Print class cards</h1><div class="panel"><div class="empty">Add classes first.</div></div>`; return; }
    v.innerHTML = `<style>@media print{.rcard{break-after:page;page-break-after:always;border:0!important;padding:0!important;margin:0!important}.rcard:last-child{break-after:auto;page-break-after:auto}.rcard table{font-size:.85rem}}</style>
      <div class="no-print"><h1>Print class cards</h1><p class="muted">${esc(termName(st.termId))}. Prints one report card per page for every student in the class who has scores.</p>
      <div class="panel"><div class="row"><div><label for="cl">Class</label><select id="cl">${cl.data.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div><div><label for="pm">Include</label><select id="pm"><option value="all">All students with scores</option><option value="pub">Published cards only</option></select></div><div><button class="btn" id="pr" disabled>Print all</button></div></div><div id="m"></div><div id="info" class="muted" style="margin-top:.6rem"></div></div></div>
      <div id="cards"></div>`;
    let token = 0;
    async function load() {
      const my = ++token, cid = $("#cl").value, cls = cl.data.find((c) => c.id === cid), onlyPub = $("#pm").value === "pub";
      $("#pr").disabled = true; $("#cards").innerHTML = ""; msg($("#m"), ""); $("#info").innerHTML = `<span class="spin"></span> Preparing cards…`;
      try {
        const [stu, sc, subj, rcs, res, scaleR, ft] = await Promise.all([
          sb().from("students").select("id, first_name, last_name, admission_no").eq("school_id", sid()).eq("current_class_id", cid).eq("status", "active").is("deleted_at", null).order("last_name"),
          fetchAll(() => sb().from("scores").select("*").eq("class_id", cid).eq("term_id", st.termId)),
          sb().from("subjects").select("id, name").eq("school_id", sid()),
          sb().from("report_cards").select("*").eq("class_id", cid).eq("term_id", st.termId),
          sb().rpc("class_results", { p_class: cid, p_term: st.termId }),
          sb().from("grading_scales").select("*").eq("school_id", sid()).order("min_score", { ascending: false }),
          sb().rpc("class_form_teacher", { p_class: cid }),
        ]);
        for (const r of [stu, subj, rcs, res, scaleR]) if (r.error) throw r.error;
        if (my !== token) return;
        const scale = scaleR.data, sn = Object.fromEntries(subj.data.map((x) => [x.id, x.name])), cardOf = Object.fromEntries(rcs.data.map((x) => [x.student_id, x]));
        const stand = Object.fromEntries(res.data.map((x) => [x.student_id, x])), size = res.data.length;
        const bySub = {}; sc.forEach((x) => { (bySub[x.subject_id] = bySub[x.subject_id] || []).push(Number(x.total)); });
        const classAvg = (id) => { const a = (bySub[id] || []).filter((n) => !isNaN(n)); return a.length ? Math.round((a.reduce((p, q) => p + q, 0) / a.length) * 10) / 10 : null; };
        const scoresOf = {}; sc.forEach((x) => { (scoresOf[x.student_id] = scoresOf[x.student_id] || []).push(x); });
        let list = stu.data.filter((s) => (scoresOf[s.id] || []).length);
        if (onlyPub) list = list.filter((s) => cardOf[s.id] && cardOf[s.id].status === "published");
        // attendance (optional), a few students at a time
        const att = {};
        for (let i = 0; i < list.length; i += 8) {
          await Promise.all(list.slice(i, i + 8).map(async (s) => { try { const a = await sb().rpc("attendance_summary", { p_student: s.id, p_term: st.termId }); if (!a.error && a.data && a.data[0]) att[s.id] = a.data[0]; } catch (e) {} }));
        }
        if (my !== token) return;
        const sch = st.ctx.school, tm = st.terms.find((x) => x.id === st.termId), ftName = ft.data || "";
        const contact = [sch.address, sch.phone, sch.email].filter(Boolean).map(esc).join(" · ");
        const sig = (label) => `<div style="flex:1;border-top:1px solid currentColor;padding-top:.3rem;text-align:center">${label}</div>`;
        const card = (s) => {
          const rows = [...scoresOf[s.id]].sort((a, b) => (sn[a.subject_id] || "").localeCompare(sn[b.subject_id] || "")), sd = stand[s.id], c = cardOf[s.id] || {}, a = att[s.id];
          const ga = sd ? gradeFor(Number(sd.average), scale) : { grade: "", remark: "" };
          return `<div class="panel rcard"><div style="text-align:center">${sch.logo_url ? `<img src="${esc(sch.logo_url)}" alt="" style="height:64px;max-width:160px;object-fit:contain;margin-bottom:.3rem">` : ""}<h1 style="margin-bottom:0">${esc(sch.name)}</h1>${sch.motto ? `<div class="muted"><em>${esc(sch.motto)}</em></div>` : ""}${contact ? `<div class="muted" style="font-size:.85rem">${contact}</div>` : ""}<h2 style="margin:.6rem 0 .2rem">Terminal report card</h2><div class="muted">${esc(termName(st.termId))}${tm ? ` · ${esc(S.fmtDate(tm.start_date))} to ${esc(S.fmtDate(tm.end_date))}` : ""}</div></div>
          <p style="margin-top:1rem"><strong>${esc(fullName(s))}</strong> · Admission no. ${esc(s.admission_no)}<br>Class: ${esc(clsLabel(cls))}${sd ? ` · Position: ${esc(ord(sd.rank_pos))} of ${esc(size)}` : ""}</p>
          <div class="tablewrap"><table><thead><tr><th>Subject</th><th>CA1<br><small>20</small></th><th>CA2<br><small>20</small></th><th>Exam<br><small>60</small></th><th>Total<br><small>100</small></th><th>Class avg</th><th>Grade</th><th>Remark</th></tr></thead><tbody>${rows.map((r) => { const g = gradeFor(Number(r.total), scale); return `<tr><td>${esc(sn[r.subject_id] || "Subject")}</td><td>${esc(fmt(r.ca1))}</td><td>${esc(fmt(r.ca2))}</td><td>${esc(fmt(r.exam))}</td><td><strong>${esc(fmt(r.total))}</strong></td><td>${esc(fmt(classAvg(r.subject_id)))}</td><td>${esc(g.grade)}</td><td>${esc(g.remark)}</td></tr>`; }).join("")}</tbody></table></div>
          ${sd ? `<p style="margin-top:.8rem">Subjects: <strong>${esc(sd.subjects)}</strong> · Total: <strong>${esc(fmt(sd.total))}</strong> · Average: <strong>${esc(fmt(sd.average))}</strong> · Overall grade: <strong>${esc(ga.grade)}</strong> (${esc(ga.remark)})</p>` : ""}
          ${a && a.days_open > 0 ? `<p>Attendance: present <strong>${a.present + a.late}</strong> of <strong>${a.days_open}</strong> school days (${Math.round(((a.present + a.late) / a.days_open) * 100)}%)${a.late ? `, including ${a.late} late` : ""}.</p>` : ""}
          <p><strong>Class teacher's comment:</strong> ${esc(c.teacher_comment || "—")}</p><p><strong>Principal's comment:</strong> ${esc(c.principal_comment || "—")}</p>
          <p class="muted" style="font-size:.8rem">Grading key: ${scale.map((b) => `${esc(b.grade)} ${esc(b.min_score)}–${esc(b.max_score)}`).join(" · ")}</p>
          <div style="display:flex;gap:2rem;margin-top:2.4rem">${sig("Class teacher" + (ftName ? ": " + esc(ftName) : ""))}${sig("Principal")}${sig("Date")}</div></div>`;
        };
        const noScores = stu.data.length - stu.data.filter((s) => (scoresOf[s.id] || []).length).length;
        $("#cards").innerHTML = list.map(card).join("");
        const noC = list.filter((s) => !(cardOf[s.id] && cardOf[s.id].teacher_comment && cardOf[s.id].principal_comment)).length;
        $("#info").innerHTML = list.length ? `${list.length} report card${list.length === 1 ? "" : "s"} ready.${noScores ? ` ${noScores} student${noScores === 1 ? " has" : "s have"} no scores and ${noScores === 1 ? "is" : "are"} left out.` : ""}${noC ? ` ${noC} card${noC === 1 ? " is" : "s are"} missing a teacher or principal comment.` : ""} In the print window, choose "Save as PDF" or your printer.` : "No report cards to print for this class and term.";
        $("#pr").disabled = !list.length;
      } catch (e) { if (my === token) { $("#info").innerHTML = ""; msg($("#m"), friendly(e)); } }
    }
    $("#cl").onchange = load; $("#pm").onchange = load; $("#pr").onclick = () => window.print(); await load();
  };
})();
