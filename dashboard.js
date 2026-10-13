// Owner dashboard: enrolment, attendance, fees, academics, operations
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, esc = S.esc, views = S.views;
  const $ = (s) => document.querySelector(s);
  const sb = () => S.sb(), sid = () => S.schoolId();
  const clsLabel = (c) => c.name + (c.arm ? " " + c.arm : "");
  const money = (n) => "₦" + Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const compact = (n) => { n = Number(n || 0); return n >= 1e6 ? "₦" + (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? "₦" + Math.round(n / 1e3) + "k" : "₦" + Math.round(n); };
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const daysAgo = (n) => new Date(Date.parse(today() + "T12:00:00Z") - n * 864e5).toISOString().slice(0, 10);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const safe = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
  async function fetchAll(make) { let out = [], from = 0; for (;;) { const { data, error } = await make().range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000; } return out; }
  async function rpc(name, args) { const { data, error } = await sb().rpc(name, args); if (error) throw error; return data; }
  const termName = (id) => { const t = st.terms.find((x) => x.id === id); const s = t && st.sessions.find((x) => x.id === t.session_id); return t ? `${t.name}, ${s ? s.name : ""}` : ""; };
  function download(name, rows) {
    const cell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---- tiny chart helpers (no libraries) ----
  const hbars = (rows, o = {}) => { const m = o.max || Math.max(1, ...rows.map((r) => r.value)); return rows.map((r) => `<div style="margin:.4rem 0"><div style="display:flex;justify-content:space-between;gap:.5rem;font-size:.88rem"><span>${esc(r.label)}</span><strong>${esc((o.fmt || ((x) => x))(r.value))}</strong></div><div style="background:var(--bg);border-radius:6px;height:10px;overflow:hidden"><div style="width:${Math.max(0, Math.min(100, (r.value / m) * 100))}%;height:100%;background:${r.color || "var(--teal)"}"></div></div>${r.note ? `<small class="muted">${esc(r.note)}</small>` : ""}</div>`).join(""); };
  function line(points, label) {
    if (!points.length) return ""; const W = 320, H = 150, L = 30, R = 8, T = 10, B = 24, n = points.length;
    const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1)), y = (v) => T + (1 - v / 100) * (H - T - B);
    const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" style="width:100%;height:auto">${[0, 50, 100].map((g) => `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" style="stroke:var(--line)"/><text x="${L - 4}" y="${y(g) + 4}" text-anchor="end" font-size="9" style="fill:var(--muted)">${g}%</text>`).join("")}<path d="${path}" fill="none" style="stroke:var(--teal)" stroke-width="2"/>${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="2.5" style="fill:var(--teal)"><title>${esc(p.x)}: ${p.y}%</title></circle>`).join("")}<text x="${L}" y="${H - 6}" font-size="9" style="fill:var(--muted)">${esc(points[0].x)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="9" style="fill:var(--muted)">${esc(points[n - 1].x)}</text></svg>`;
  }
  function columns(rows, fmt, label) {
    if (!rows.length) return ""; const W = 320, H = 150, T = 16, B = 22, n = rows.length, bw = Math.min(36, (W - 20) / n - 8), m = Math.max(1, ...rows.map((r) => r.value));
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" style="width:100%;height:auto">${rows.map((r, i) => { const cx = 10 + (i + 0.5) * ((W - 20) / n), h = (r.value / m) * (H - T - B); return `<rect x="${cx - bw / 2}" y="${H - B - h}" width="${bw}" height="${Math.max(h, 1)}" rx="3" style="fill:var(--teal)"><title>${esc(r.label)}: ${esc(fmt(r.value))}</title></rect><text x="${cx}" y="${H - B - h - 3}" text-anchor="middle" font-size="8" style="fill:var(--text)">${esc(fmt(r.value))}</text><text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="9" style="fill:var(--muted)">${esc(r.label)}</text>`; }).join("")}</svg>`;
  }
  const card = (t, v, sub) => `<div class="card"><div class="muted">${esc(t)}</div><div class="n" style="font-size:1.45rem">${v}</div>${sub ? `<div class="muted" style="font-size:.85rem">${sub}</div>` : ""}</div>`;
  const note = (txt) => `<p class="muted" style="font-size:.8rem;margin-bottom:0">${txt}</p>`;
  const fail = (what, e) => `<div class="msg err">Could not load ${esc(what)}. ${/function|does not exist|schema cache/i.test((e && e.message) || "") ? "Run 010_analytics.sql in Supabase." : esc((e && e.message) || "")}</div>`;
  const empty = (t) => `<div class="empty">${esc(t)}</div>`;

  const base = views.dashboard;
  views.dashboard = async function () {
    if (!S.isManager() || !sid()) return base();
    const v = $("#view"), tm = st.terms.find((t) => t.id === st.termId), school = st.ctx.school.name;
    v.innerHTML = `<h1>${esc(school)}</h1><p class="muted">Owner dashboard · ${esc(termName(st.termId) || "no term selected")}</p><div id="dash"><p><span class="spin"></span> Loading…</p></div>`;
    const termFrom = tm ? tm.start_date : daysAgo(90), termTo = tm && tm.end_date < today() ? tm.end_date : today();
    const [classes, stu, staff, ta, apps, attC, fees, fTrend, subj, clsAvg, low] = await Promise.all([
      safe(sb().from("classes").select("*").eq("school_id", sid()).order("name").then((r) => { if (r.error) throw r.error; return r.data; })),
      safe(fetchAll(() => sb().from("students").select("id, gender, status, current_class_id, admission_date").eq("school_id", sid()).is("deleted_at", null))),
      safe(fetchAll(() => sb().from("staff").select("id, full_name, status").eq("school_id", sid()))),
      safe(st.sessId ? fetchAll(() => sb().from("teacher_assignments").select("staff_id, class_id").eq("school_id", sid()).eq("session_id", st.sessId)) : Promise.resolve([])),
      safe(rpc("admission_funnel", { p_school: sid() })),
      safe(rpc("attendance_by_class", { p_school: sid(), p_from: termFrom, p_to: termTo })),
      safe(st.termId ? rpc("fee_summary", { p_school: sid(), p_term: st.termId }) : Promise.resolve(null)),
      safe(rpc("fee_trend", { p_school: sid(), p_from: daysAgo(180).slice(0, 8) + "01" })),
      safe(st.termId ? rpc("subject_averages", { p_school: sid(), p_term: st.termId }) : Promise.resolve([])),
      safe(st.termId ? rpc("class_averages", { p_school: sid(), p_term: st.termId }) : Promise.resolve([])),
      safe(st.termId ? rpc("low_average_students", { p_school: sid(), p_term: st.termId, p_threshold: 40 }) : Promise.resolve([])),
    ]);
    const cm = Object.fromEntries((classes.ok ? classes.v : []).map((c) => [c.id, clsLabel(c)])), out = []; const exp = [["Metric", "Value", "Notes"]];
    const sec = (title, inner, cap) => `<div class="panel"><h2>${esc(title)}</h2>${inner}${cap ? note(cap) : ""}</div>`;

    // enrolment
    let enr = "", active = null, retention = null, newAdm = 0;
    if (!stu.ok) enr = fail("student data", stu.e); else {
      const all = stu.v, act = all.filter((x) => x.status === "active"); active = act.length;
      const by = { active: act.length, transferred: 0, withdrawn: 0, graduated: 0 }; all.forEach((x) => { if (x.status !== "active") by[x.status]++; });
      retention = pct(by.active, by.active + by.withdrawn + by.transferred); newAdm = act.filter((x) => x.admission_date >= daysAgo(30)).length;
      const perClass = {}; act.forEach((x) => { const k = x.current_class_id || "none"; (perClass[k] = perClass[k] || { n: 0, m: 0, f: 0 }); perClass[k].n++; if (x.gender === "male") perClass[k].m++; if (x.gender === "female") perClass[k].f++; });
      const rows = Object.entries(perClass).map(([k, x]) => ({ label: cm[k] || "No class", value: x.n, note: `${x.m} boys · ${x.f} girls${x.n - x.m - x.f ? ` · ${x.n - x.m - x.f} not stated` : ""}` })).sort((a, b) => b.value - a.value);
      const months = []; for (let i = 11; i >= 0; i--) { const d = new Date(Date.parse(today() + "T12:00:00Z")); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); months.push(d.toISOString().slice(0, 7)); }
      const adm = months.map((m) => ({ label: new Date(m + "-15").toLocaleDateString("en-NG", { month: "short" }), value: all.filter((x) => (x.admission_date || "").slice(0, 7) === m).length }));
      enr = `<div class="cards">${card("Active students", active, `${by.graduated} graduated`)}${card("Retention", retention === null ? "—" : retention + "%", `${by.withdrawn} withdrawn · ${by.transferred} transferred`)}${card("New in last 30 days", newAdm)}</div>${rows.length ? `<h3>Students by class</h3>${hbars(rows)}` : empty("No students yet.")}<h3 style="margin-top:1rem">Admissions per month (last 12 months)</h3>${adm.some((a) => a.value) ? columns(adm, (x) => x, "Admissions per month") : empty("No admissions recorded in this period.")}`;
      exp.push(["Active students", active, ""], ["Retention %", retention ?? "", "Active / (active + withdrawn + transferred)"], ["New admissions, last 30 days", newAdm, ""]); rows.forEach((r) => exp.push([`Students in ${r.label}`, r.value, r.note]));
    }
    out.push(sec("Students", enr, "Source: student records (not deleted). Retention = active ÷ (active + withdrawn + transferred). Admissions are counted by admission date."));

    // attendance (trend loaded separately so the period can change)
    let attInner = "";
    if (!attC.ok) attInner = fail("attendance", attC.e); else {
      const rows = attC.v.map((x) => ({ label: cm[x.class_id] || "Class", value: pct(x.attended, x.marks) || 0, note: `${x.attended} of ${x.marks} marks` })).sort((a, b) => a.value - b.value);
      const tot = attC.v.reduce((a, b) => ({ m: a.m + b.marks, a: a.a + b.attended }), { m: 0, a: 0 }), rate = pct(tot.a, tot.m);
      attInner = `<div class="cards">${card("Attendance this term", rate === null ? "—" : rate + "%", `${esc(termFrom)} to ${esc(termTo)}`)}</div><div class="row" style="margin:.4rem 0"><div><label for="rng">Daily trend</label><select id="rng"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select></div></div><div id="trend"><span class="spin"></span></div><h3 style="margin-top:1rem">By class (lowest first)</h3>${rows.length ? hbars(rows, { max: 100, fmt: (x) => x + "%", color: "var(--teal)" }) : empty("No attendance recorded in this term yet.")}`;
      exp.push(["Attendance % (term to date)", rate ?? "", `${termFrom} to ${termTo}`]); rows.forEach((r) => exp.push([`Attendance % ${r.label}`, r.value, r.note]));
    }
    out.push(sec("Attendance", attInner, "Source: attendance registers. Attendance % = (present + late) ÷ marks recorded. Days with no register are not counted."));

    // fees
    let feeInner = "";
    if (!fees.ok) feeInner = fail("fees", fees.e); else if (!fees.v || !fees.v[0] || !fees.v[0].invoices) feeInner = empty("No invoices for this term yet. Generate them under Invoices & payments.");
    else {
      const f = fees.v[0], rate = pct(Number(f.collected), Number(f.invoiced));
      feeInner = `<div class="cards">${card("Invoiced", money(f.invoiced), `${f.invoices} invoices`)}${card("Collected", money(f.collected), `${f.fully_paid} fully paid`)}${card("Outstanding", money(f.outstanding))}${card("Collection rate", rate === null ? "—" : rate + "%")}</div>${Number(f.discounts) > 0 ? `<p class="muted">Discounts and waivers approved: ${money(f.discounts)}</p>` : ""}`;
      exp.push(["Invoiced (term)", f.invoiced, ""], ["Collected (term)", f.collected, ""], ["Outstanding (term)", f.outstanding, ""], ["Collection rate %", rate ?? "", "Collected / invoiced"]);
    }
    if (fTrend.ok && fTrend.v.length) feeInner += `<h3 style="margin-top:1rem">Money received per month</h3>${columns(fTrend.v.map((x) => ({ label: new Date(x.month + "T12:00:00").toLocaleDateString("en-NG", { month: "short" }), value: Number(x.amount) })), compact, "Payments received per month")}`;
    out.push(sec("Fees", feeInner, "Source: invoices and recorded payments for the selected term; voided payments excluded. Collection rate = collected ÷ invoiced. Monthly chart uses the date each payment was made."));

    // academics
    let acad = "";
    if (!subj.ok) acad = fail("results", subj.e); else if (!subj.v.length) acad = empty("No scores for this term yet.");
    else {
      const sr = subj.v.map((x) => ({ label: x.subject_name, value: Number(x.average), note: `${x.students} student${x.students === 1 ? "" : "s"}` }));
      const cr = clsAvg.ok ? clsAvg.v.map((x) => ({ label: cm[x.class_id] || "Class", value: Number(x.average), note: `${x.students} students` })).sort((a, b) => b.value - a.value) : [];
      const lw = low.ok ? low.v : [];
      acad = `<h3>Average score by subject (out of 100)</h3>${hbars(sr, { max: 100, fmt: (x) => x })}<p class="muted" style="font-size:.85rem">Strongest: ${esc(sr[0].label)} · Weakest: ${esc(sr[sr.length - 1].label)}</p>${cr.length ? `<h3 style="margin-top:1rem">Average score by class</h3>${hbars(cr, { max: 100 })}` : ""}<h3 style="margin-top:1rem">Students who may need extra support</h3>${lw.length ? `<div class="tablewrap"><table><thead><tr><th>Student</th><th>Class</th><th>Average</th><th></th></tr></thead><tbody>${lw.map((x) => `<tr><td>${esc(x.first_name + " " + x.last_name)}</td><td>${esc(cm[x.class_id] || "")}</td><td>${esc(x.average)}</td><td><button class="btn ghost" data-stu="${x.student_id}">Open</button></td></tr>`).join("")}</tbody></table></div>` : `<p>No student has an average below 40 this term.</p>`}`;
      sr.forEach((r) => exp.push([`Average ${r.label}`, r.value, r.note]));
    }
    out.push(sec("Academic performance", acad, "Source: entered scores for the selected term. Averages are the mean of subject totals (CA1 + CA2 + Exam). The support list shows term averages below 40 and is a prompt for teachers to follow up. It does not decide anything about a student."));

    // operations
    let ops = "";
    const staffAct = staff.ok ? staff.v.filter((x) => x.status === "active").length : null;
    if (staff.ok && ta.ok) {
      const nm = Object.fromEntries(staff.v.map((x) => [x.id, x.full_name])), w = {}; ta.v.forEach((x) => { (w[x.staff_id] = w[x.staff_id] || { n: 0, c: new Set() }); w[x.staff_id].n++; w[x.staff_id].c.add(x.class_id); });
      const rows = Object.entries(w).map(([k, x]) => ({ label: nm[k] || "Former staff", value: x.n, note: `${x.c.size} class${x.c.size === 1 ? "" : "es"}` })).sort((a, b) => b.value - a.value);
      ops += `<div class="cards">${card("Active staff", staffAct)}</div>${rows.length ? `<h3>Teaching load (class-subject assignments this session)</h3>${hbars(rows)}` : empty("No teaching assignments yet.")}`;
      exp.push(["Active staff", staffAct, ""]);
    } else ops += fail("staff data", (staff.e || ta.e));
    if (apps.ok) { const m = Object.fromEntries(apps.v.map((x) => [x.status, x.n])), total = apps.v.reduce((a, b) => a + b.n, 0), conv = pct(m.enrolled || 0, total);
      ops += `<h3 style="margin-top:1rem">Admissions pipeline</h3>${total ? hbars(["submitted", "under_review", "approved", "enrolled", "rejected"].map((k) => ({ label: { submitted: "Submitted", under_review: "Under review", approved: "Approved", enrolled: "Enrolled", rejected: "Rejected" }[k], value: m[k] || 0 })), { max: Math.max(1, total) }) + `<p class="muted">Conversion to enrolment: <strong>${conv}%</strong> of ${total} applications.</p>` : empty("No applications yet. Share your application link from Admissions.")}`;
      exp.push(["Admission applications", total, ""], ["Admission conversion %", conv ?? "", "Enrolled / all applications"]);
    } else ops += fail("admissions", apps.e);
    out.push(sec("Operations", ops, "Source: staff list, teaching assignments for the current session, and online admission applications."));

    $("#dash").innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:1rem;align-items:start">${out.join("")}</div><div class="panel"><button class="btn ghost" id="exp">Download summary (CSV)</button> <button class="btn ghost" id="prn">Print</button><p class="muted" style="margin-bottom:0">Figures come from your live records. Nothing here is sample data.</p></div>`;

    $("#exp").onclick = () => download("dashboard_summary.csv", exp); $("#prn").onclick = () => window.print();
    $("#dash").onclick = (e) => { const b = e.target.closest("[data-stu]"); if (b) { st.studentId = b.dataset.stu; S.go("student"); } };
    async function trend(days) {
      const el = $("#trend"); if (!el) return; el.innerHTML = `<span class="spin"></span>`;
      try { const d = await rpc("attendance_trend", { p_school: sid(), p_from: daysAgo(days), p_to: today() });
        el.innerHTML = d.length ? line(d.map((x) => ({ x: new Date(x.att_date + "T12:00:00").toLocaleDateString("en-NG", { day: "numeric", month: "short" }), y: pct(x.attended, x.marks) || 0 })), "Daily attendance percentage") : empty("No attendance recorded in this period.");
      } catch (e) { el.innerHTML = fail("the attendance trend", e); }
    }
    if ($("#rng")) { $("#rng").onchange = (e) => trend(+e.target.value); trend(30); }
  };
})();
