// Daily attendance: take register, class report, parent/student view
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, esc = S.esc, msg = S.msg, friendly = S.friendly, confirmBox = S.confirmBox, mountTable = S.mountTable;
  const $ = (s) => document.querySelector(s);
  const sb = () => S.sb(), sid = () => S.schoolId(), views = S.views;
  const clsLabel = (c) => c.name + (c.arm ? " " + c.arm : "");
  const fullName = (x) => [x.first_name, x.last_name].filter(Boolean).join(" ");
  const STAT = { present: "P", absent: "A", late: "L", excused: "E" };
  const LABEL = { present: "Present", absent: "Absent", late: "Late", excused: "Excused" };
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const pct = (a, d) => (d > 0 ? Math.round((a / d) * 1000) / 10 : null);

  (window.SSMS_NAV = window.SSMS_NAV || []).push((items, state, isManager) => {
    if (!state.ctx || !state.ctx.school) return;
    const r = state.ctx.role;
    if (isManager() || r === "teacher") items.push(["attendance", "📋", "Take attendance"], ["attreport", "📈", "Attendance report"]);
    if (r === "parent" || r === "student") items.push(["myattendance", "🗓️", "Attendance"]);
  });

  async function myClasses() {
    if (S.isManager()) { const { data, error } = await sb().from("classes").select("*").eq("school_id", sid()).order("name"); if (error) throw error; return data; }
    const me = await sb().from("staff").select("id").eq("user_id", st.user.id).eq("school_id", sid()).maybeSingle();
    if (!me.data) return [];
    const { data, error } = await sb().from("classes").select("*").eq("school_id", sid()).eq("form_teacher_id", me.data.id).order("name"); if (error) throw error; return data;
  }
  function download(name, header, rows) {
    const cell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const body = [header.join(",")].concat(rows.map((r) => r.map(cell).join(","))).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Take attendance ----------
  views.attendance = async function () {
    const v = $("#view"), classes = await myClasses();
    if (!classes.length) { v.innerHTML = `<h1>Take attendance</h1><div class="panel"><div class="empty">${S.isManager() ? "Add a class first." : "You are not set as form teacher of any class. Ask the administrator to assign you under Form teachers."}</div></div>`; return; }
    v.innerHTML = `<h1>Take attendance</h1><div class="panel"><div class="row"><div><label for="cl">Class</label><select id="cl">${classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div><div><label for="dt">Date</label><input id="dt" type="date" value="${today()}" max="${today()}"></div></div><p class="muted" style="margin-bottom:0">P = present · A = absent · L = late · E = excused</p></div><div class="panel"><div id="m"></div><div id="roster"></div></div>`;
    let students = [], marks = {};
    async function load() {
      const cid = $("#cl").value, d = $("#dt").value, r = $("#roster"); msg($("#m"), "");
      if (!d) { r.innerHTML = ""; return; }
      r.innerHTML = `<p><span class="spin"></span> Loading…</p>`;
      const [stu, att] = await Promise.all([
        sb().from("students").select("id, first_name, last_name, admission_no").eq("school_id", sid()).eq("current_class_id", cid).eq("status", "active").is("deleted_at", null).order("last_name"),
        sb().from("attendance").select("student_id, status").eq("class_id", cid).eq("att_date", d),
      ]);
      if (stu.error) return msg($("#m"), friendly(stu.error)); if (att.error) return msg($("#m"), friendly(att.error));
      students = stu.data; const ex = Object.fromEntries(att.data.map((x) => [x.student_id, x.status])); const taken = att.data.length > 0;
      marks = {}; students.forEach((s) => (marks[s.id] = ex[s.id] || "present"));
      if (!students.length) { r.innerHTML = `<div class="empty">No active students in this class.</div>`; return; }
      r.innerHTML = `<p class="muted">${taken ? "Register already taken for this date. Changes will update it." : "Register not yet taken for this date. Everyone starts as present; change the exceptions, then save."}</p><div class="row" style="margin-bottom:.6rem"><div><button class="btn ghost" id="allp">Mark all present</button></div><div id="tally" class="muted"></div></div>${students.map((s) => `<div class="card" style="margin-bottom:.5rem;display:flex;align-items:center;justify-content:space-between;gap:.6rem;flex-wrap:wrap" data-s="${s.id}"><div><strong>${esc(fullName(s))}</strong><br><small class="muted">${esc(s.admission_no)}</small></div><div class="segs" style="display:flex;gap:.3rem">${Object.keys(STAT).map((k) => `<button class="btn ${marks[s.id] === k ? "" : "ghost"}" data-k="${k}" aria-label="${LABEL[k]}" aria-pressed="${marks[s.id] === k}" style="min-width:44px">${STAT[k]}</button>`).join("")}</div></div>`).join("")}<button class="btn" id="save" style="margin-top:.6rem;width:100%">Save attendance</button>`;
      tally();
    }
    function tally() { const c = { present: 0, absent: 0, late: 0, excused: 0 }; Object.values(marks).forEach((k) => c[k]++); const t = $("#tally"); if (t) t.textContent = `Present ${c.present} · Absent ${c.absent} · Late ${c.late} · Excused ${c.excused}`; }
    function paint() { document.querySelectorAll("#roster [data-s]").forEach((card) => card.querySelectorAll("[data-k]").forEach((b) => { const on = marks[card.dataset.s] === b.dataset.k; b.classList.toggle("ghost", !on); b.setAttribute("aria-pressed", on); })); tally(); }
    v.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.k) { marks[b.closest("[data-s]").dataset.s] = b.dataset.k; paint(); }
      if (b.id === "allp") { students.forEach((s) => (marks[s.id] = "present")); paint(); }
      if (b.id === "save") {
        const d = $("#dt").value, day = new Date(d + "T12:00:00").getDay();
        if ((day === 0 || day === 6) && !(await confirmBox("This date is a weekend. Save attendance anyway?"))) return;
        const rows = students.map((s) => ({ school_id: sid(), student_id: s.id, class_id: $("#cl").value, att_date: d, status: marks[s.id] }));
        b.disabled = true; const { error } = await sb().from("attendance").upsert(rows, { onConflict: "student_id,att_date" }); b.disabled = false;
        msg($("#m"), error ? friendly(error) : `Attendance saved for ${rows.length} students.`, error ? "err" : "ok"); $("#m").scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    $("#cl").onchange = load; $("#dt").onchange = load; await load();
  };

  // ---------- Class report ----------
  views.attreport = async function () {
    const v = $("#view"), classes = await myClasses();
    if (!classes.length) { v.innerHTML = `<h1>Attendance report</h1><div class="panel"><div class="empty">No classes available.</div></div>`; return; }
    const tm = st.terms.find((t) => t.id === st.termId); const from0 = tm ? tm.start_date : today(), to0 = tm && tm.end_date < today() ? tm.end_date : today();
    v.innerHTML = `<h1>Attendance report</h1><div class="panel"><div class="row"><div><label for="cl">Class</label><select id="cl">${classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div><div><label for="fd">From</label><input id="fd" type="date" value="${from0}"></div><div><label for="td">To</label><input id="td" type="date" value="${to0}"></div></div><div id="m"></div><div id="info" class="muted" style="margin-top:.6rem"></div><div id="list" style="margin-top:.8rem"></div><button class="btn ghost hidden" id="exp" style="margin-top:.6rem">Export CSV</button><p class="muted">Attendance % counts present and late days out of the days a register was taken.</p></div>`;
    let table = [];
    async function load() {
      const cid = $("#cl").value, f = $("#fd").value, t = $("#td").value; msg($("#m"), "");
      if (!f || !t || t < f) { $("#list").innerHTML = ""; return msg($("#m"), "Choose a valid date range."); }
      $("#list").innerHTML = `<p><span class="spin"></span> Loading…</p>`;
      const [rep, stu] = await Promise.all([sb().rpc("attendance_report", { p_class: cid, p_from: f, p_to: t }), sb().from("students").select("id, first_name, last_name, admission_no").eq("current_class_id", cid).eq("status", "active").is("deleted_at", null).order("last_name")]);
      if (rep.error) { $("#list").innerHTML = ""; return msg($("#m"), friendly(rep.error)); } if (stu.error) return msg($("#m"), friendly(stu.error));
      const by = Object.fromEntries(rep.data.map((r) => [r.student_id, r])); const days = rep.data.length ? rep.data[0].days_open : 0;
      table = stu.data.map((s) => { const r = by[s.id] || { present: 0, late: 0, absent: 0, excused: 0 }; return { name: fullName(s), adm: s.admission_no, present: r.present, late: r.late, absent: r.absent, excused: r.excused, days, p: pct(r.present + r.late, days) }; });
      const valid = table.filter((x) => x.p !== null), avg = valid.length ? Math.round((valid.reduce((a, b) => a + b.p, 0) / valid.length) * 10) / 10 : null;
      $("#info").textContent = days ? `${days} school day${days === 1 ? "" : "s"} with a register · class average attendance ${avg}%` : "No attendance has been recorded in this range.";
      mountTable($("#list"), [{ k: "name", label: "Student" }, { k: "present", label: "Present" }, { k: "late", label: "Late" }, { k: "absent", label: "Absent" }, { k: "excused", label: "Excused" }, { k: "days", label: "Days" }, { k: "p", label: "Attendance %", text: (x) => (x.p === null ? "—" : x.p + "%") }], table, "No active students in this class.");
      $("#exp").classList.toggle("hidden", !table.length);
    }
    $("#exp").onclick = () => download("attendance_report.csv", ["name", "admission_no", "present", "late", "absent", "excused", "days_open", "attendance_percent"], table.map((x) => [x.name, x.adm, x.present, x.late, x.absent, x.excused, x.days, x.p === null ? "" : x.p]));
    $("#cl").onchange = load; $("#fd").onchange = load; $("#td").onchange = load; await load();
  };

  // ---------- Parent / student view ----------
  views.myattendance = async function () {
    const v = $("#view"); const stu = await sb().from("students").select("id, first_name, last_name").eq("school_id", sid()); if (stu.error) throw stu.error;
    if (!stu.data.length) { v.innerHTML = `<h1>Attendance</h1><div class="panel"><div class="empty">No student is linked to your account yet.</div></div>`; return; }
    v.innerHTML = `<h1>Attendance</h1><div class="panel"><label for="sx">Student</label><select id="sx">${stu.data.map((s) => `<option value="${s.id}">${esc(fullName(s))}</option>`).join("")}</select><div id="sum" style="margin-top:.8rem"></div></div><div class="panel"><h2>Recent days</h2><div id="list"></div></div>`;
    async function load() {
      const id = $("#sx").value; $("#sum").innerHTML = `<span class="spin"></span>`;
      const [sm, rec] = await Promise.all([st.termId ? sb().rpc("attendance_summary", { p_student: id, p_term: st.termId }) : Promise.resolve({ data: null }), sb().from("attendance").select("att_date, status, note").eq("student_id", id).order("att_date", { ascending: false }).limit(60)]);
      const a = sm.data && sm.data[0];
      $("#sum").innerHTML = a && a.days_open > 0 ? `<div class="cards"><div class="card"><div class="muted">Attendance this term</div><div class="n">${pct(a.present + a.late, a.days_open)}%</div><div class="muted">${a.present + a.late} of ${a.days_open} days</div></div><div class="card"><div class="muted">Absent</div><div class="n">${a.absent}</div></div><div class="card"><div class="muted">Late</div><div class="n">${a.late}</div></div><div class="card"><div class="muted">Excused</div><div class="n">${a.excused}</div></div></div>` : `<div class="empty">No attendance recorded for this term yet.</div>`;
      if (rec.error) return msg($("#list"), friendly(rec.error));
      mountTable($("#list"), [{ k: "att_date", label: "Date", text: (x) => S.fmtDate(x.att_date) }, { k: "status", label: "Status", text: (x) => LABEL[x.status] }], rec.data, "No records yet.");
    }
    $("#sx").onchange = load; await load();
  };
})();
