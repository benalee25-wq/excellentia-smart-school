// Fees: fee structure, invoices, payments (cash / transfer / POS), receipts, reports
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, esc = S.esc, msg = S.msg, friendly = S.friendly, confirmBox = S.confirmBox, mountTable = S.mountTable;
  const $ = (s) => document.querySelector(s);
  const sb = () => S.sb(), sid = () => S.schoolId(), views = S.views;
  const clsLabel = (c) => c.name + (c.arm ? " " + c.arm : "");
  const fullName = (x) => [x.first_name, x.last_name].filter(Boolean).join(" ");
  const money = (n) => "₦" + Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const METHOD = { cash: "Cash", bank_transfer: "Bank transfer", pos: "POS", other: "Other" };
  const isFinance = () => S.isManager() || (st.ctx && st.ctx.role === "bursar");
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const termName = (id) => { const t = st.terms.find((x) => x.id === id); const s = t && st.sessions.find((x) => x.id === t.session_id); return t ? `${t.name}${s ? ", " + s.name : ""}` : ""; };
  const needTerm = () => { if (!st.sessId || !st.termId) { $("#view").innerHTML = `<div class="panel"><h1>Pick a session and term</h1><p>Add a session and term under <strong>Sessions &amp; terms</strong>, then choose them in the top bar.</p></div>`; return true; } return false; };

  (window.SSMS_NAV = window.SSMS_NAV || []).push((items, state, isManager) => {
    if (!state.ctx || !state.ctx.school) return;
    const r = state.ctx.role;
    if (isManager() || r === "bursar") items.push(["feesetup", "🧾", "Fee structure"], ["invoices", "💳", "Invoices & payments"], ["feereport", "💰", "Fees report"]);
    if (r === "parent" || r === "student") items.push(["myfees", "💳", "Fees"]);
  });

  async function fetchAll(make) { let out = [], from = 0; for (;;) { const { data, error } = await make().range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000; } return out; }
  async function chunked(ids, fn) { let out = []; for (let i = 0; i < ids.length; i += 150) out = out.concat(await fn(ids.slice(i, i + 150))); return out; }
  async function getClasses() { const { data, error } = await sb().from("classes").select("*").eq("school_id", sid()).order("name"); if (error) throw error; return data; }
  function download(name, header, rows) {
    const cell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const body = [header.join(",")].concat(rows.map((r) => r.map(cell).join(","))).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  // amount in words for receipts
  const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"], TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  function b1000(n) { let s = ""; if (n >= 100) { s += ONES[Math.floor(n / 100)] + " hundred"; n %= 100; if (n) s += " and "; } if (n >= 20) s += TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : ""); else if (n > 0) s += ONES[n]; return s; }
  function words(n) { if (n === 0) return "zero"; let s = ""; for (const [v, l] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]]) if (n >= v) { s += b1000(Math.floor(n / v)) + " " + l + " "; n %= v; } if (n > 0) { if (s && n < 100) s += "and "; s += b1000(n); } return s.trim(); }
  function nairaWords(amt) { const kobo = Math.round(Number(amt) * 100), n = Math.floor(kobo / 100), k = kobo % 100; let s = words(n) + " naira" + (k ? " and " + words(k) + " kobo" : ""); return s.charAt(0).toUpperCase() + s.slice(1) + " only"; }
  const statusOf = (r) => (!r ? "No invoice" : Number(r.balance) <= 0 ? "Paid" : Number(r.paid) > 0 ? "Part paid" : "Unpaid");
  const schoolHead = () => { const s = st.ctx.school; const c = [s.address, s.phone, s.email].filter(Boolean).map(esc).join(" · "); return `<div style="text-align:center"><h1 style="margin-bottom:0">${esc(s.name)}</h1>${c ? `<div class="muted" style="font-size:.85rem">${c}</div>` : ""}</div>`; };

  // ---------- Fee structure ----------
  views.feesetup = async function () {
    if (needTerm()) return;
    const v = $("#view"), classes = await getClasses();
    if (!classes.length) { v.innerHTML = `<h1>Fee structure</h1><div class="panel"><div class="empty">Add classes first.</div></div>`; return; }
    v.innerHTML = `<h1>Fee structure</h1><p class="muted">${esc(termName(st.termId))}. Fees are set per class and term. Invoices already issued keep their original amounts.</p>
    <div class="panel"><label for="cl">Class</label><select id="cl">${classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div>
    <div class="panel"><h2>Add a fee item</h2><form id="f" class="row"><div><label for="fn">Item (e.g. Tuition)</label><input id="fn" required maxlength="80"></div><div><label for="fa">Amount (₦)</label><input id="fa" type="number" inputmode="decimal" min="1" step="0.01" required></div><div><button class="btn">Add item</button></div></form><div id="m"></div></div>
    <div class="panel"><div id="list"></div></div>
    <div class="panel"><h2>Copy these fees to another class</h2><div class="row"><div><select id="to" aria-label="Copy to class">${classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div><div><button class="btn ghost" id="cp">Copy fees</button></div></div></div>`;
    let items = [];
    async function draw() {
      const { data, error } = await sb().from("fee_items").select("*").eq("class_id", $("#cl").value).eq("term_id", st.termId).order("name"); if (error) return msg($("#m"), friendly(error)); items = data;
      const total = items.reduce((a, b) => a + Number(b.amount), 0);
      $("#list").innerHTML = items.length ? `<div class="tablewrap"><table><thead><tr><th>Item</th><th>Amount</th><th></th></tr></thead><tbody>${items.map((x) => `<tr><td>${esc(x.name)}</td><td>${money(x.amount)}</td><td><button class="btn ghost" data-del="${x.id}">Delete</button></td></tr>`).join("")}</tbody><tfoot><tr><th>Total per student</th><th>${money(total)}</th><th></th></tr></tfoot></table></div>` : `<div class="empty">No fees set for this class and term yet.</div>`;
    }
    $("#cl").onchange = draw; await draw();
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); const name = $("#fn").value.trim(), amount = Number($("#fa").value);
      if (name.length < 2 || !(amount > 0)) return msg($("#m"), "Enter an item name and an amount above zero.");
      const { error } = await sb().from("fee_items").insert({ school_id: sid(), session_id: st.sessId, term_id: st.termId, class_id: $("#cl").value, name, amount });
      if (error) return msg($("#m"), error.code === "23505" ? "That item already exists for this class and term." : friendly(error)); $("#f").reset(); msg($("#m"), ""); draw();
    };
    v.onclick = async (e) => {
      const d = e.target.closest("[data-del]"); if (d && (await confirmBox("Delete this fee item? Existing invoices are not changed."))) { const r = await sb().from("fee_items").delete().eq("id", d.dataset.del); if (r.error) return msg($("#m"), friendly(r.error)); draw(); }
      if (e.target.id === "cp") {
        const to = $("#to").value; if (to === $("#cl").value) return msg($("#m"), "Choose a different class to copy to."); if (!items.length) return msg($("#m"), "There are no fees to copy.");
        if (!(await confirmBox(`Copy ${items.length} fee item(s) to the selected class?`))) return;
        const rows = items.map((x) => ({ school_id: sid(), session_id: x.session_id, term_id: x.term_id, class_id: to, name: x.name, amount: x.amount }));
        const r = await sb().from("fee_items").upsert(rows, { onConflict: "term_id,class_id,name", ignoreDuplicates: true }); msg($("#m"), r.error ? friendly(r.error) : "Fees copied. Items that already existed were left unchanged.", r.error ? "err" : "ok");
      }
    };
  };

  // ---------- Invoices & payments (class list) ----------
  views.invoices = async function () {
    if (needTerm()) return;
    const v = $("#view"), classes = await getClasses();
    if (!classes.length) { v.innerHTML = `<h1>Invoices &amp; payments</h1><div class="panel"><div class="empty">Add classes first.</div></div>`; return; }
    v.innerHTML = `<h1>Invoices &amp; payments</h1><p class="muted">${esc(termName(st.termId))}</p><div class="panel"><div class="row"><div><label for="cl">Class</label><select id="cl">${classes.map((c) => `<option value="${c.id}">${esc(clsLabel(c))}</option>`).join("")}</select></div><div><button class="btn" id="gen">Generate invoices for this class</button></div></div><div id="m"></div><div id="info" class="muted" style="margin-top:.6rem"></div><div id="list" style="margin-top:.8rem"></div></div>`;
    async function load() {
      const cid = $("#cl").value; $("#list").innerHTML = `<p><span class="spin"></span> Loading…</p>`;
      const stu = await sb().from("students").select("id, first_name, last_name, admission_no").eq("school_id", sid()).eq("current_class_id", cid).eq("status", "active").is("deleted_at", null).order("last_name"); if (stu.error) return msg($("#m"), friendly(stu.error));
      const ids = stu.data.map((s) => s.id); let inv = [];
      if (ids.length) { const r = await sb().from("invoice_summary").select("*").eq("term_id", st.termId).in("student_id", ids); if (r.error) return msg($("#m"), friendly(r.error)); inv = r.data; }
      const by = Object.fromEntries(inv.map((i) => [i.student_id, i]));
      const rows = stu.data.map((s) => { const i = by[s.id]; return { ...s, name: fullName(s), inv: i, net: i ? Number(i.net) : null, paid: i ? Number(i.paid) : null, balance: i ? Number(i.balance) : null, status: statusOf(i) }; });
      const T = rows.reduce((a, r) => (r.inv ? { n: a.n + r.net, p: a.p + r.paid } : a), { n: 0, p: 0 });
      $("#info").textContent = rows.length ? `Invoiced ${money(T.n)} · Collected ${money(T.p)} · Outstanding ${money(T.n - T.p)}` : "";
      mountTable($("#list"), [{ k: "name", label: "Student" }, { k: "invno", label: "Invoice", text: (x) => (x.inv ? x.inv.invoice_no : "—") }, { k: "net", label: "Total", text: (x) => (x.inv ? money(x.net) : "—") }, { k: "paid", label: "Paid", text: (x) => (x.inv ? money(x.paid) : "—") }, { k: "balance", label: "Balance", text: (x) => (x.inv ? money(x.balance) : "—") }, { k: "status", label: "Status" }], rows, "No active students in this class.", (x) => (x.inv ? `<button class="btn ghost" data-open="${x.inv.id}">Open</button>` : ""));
    }
    $("#cl").onchange = load; await load();
    v.onclick = async (e) => {
      const o = e.target.closest("[data-open]"); if (o) { st.inv = { id: o.dataset.open, back: "invoices" }; return S.go("invoice"); }
      if (e.target.id === "gen") {
        if (!(await confirmBox("Create invoices for every student in this class who does not have one yet?"))) return;
        e.target.disabled = true; const r = await sb().rpc("generate_invoices", { p_class: $("#cl").value, p_term: st.termId }); e.target.disabled = false;
        if (r.error) return msg($("#m"), friendly(r.error)); msg($("#m"), r.data ? `${r.data} invoice${r.data === 1 ? "" : "s"} created.` : "Every student already has an invoice.", "ok"); load();
      }
    };
  };

  // ---------- One invoice (finance and parents) ----------
  views.invoice = async function () {
    const ref = st.inv; if (!ref) return S.go("dashboard");
    const v = $("#view"), fin = isFinance(), mgr = S.isManager();
    const [sm, items, pays, base] = await Promise.all([
      sb().from("invoice_summary").select("*").eq("id", ref.id).single(), sb().from("invoice_items").select("*").eq("invoice_id", ref.id).order("name"),
      sb().from("payments").select("*").eq("invoice_id", ref.id).order("created_at"), sb().from("invoices").select("discount_reason").eq("id", ref.id).single()]);
    if (sm.error) throw sm.error; if (items.error) throw items.error; if (pays.error) throw pays.error;
    const inv = sm.data, [stu, cls] = await Promise.all([sb().from("students").select("first_name, last_name, admission_no").eq("id", inv.student_id).single(), inv.class_id ? sb().from("classes").select("*").eq("id", inv.class_id).maybeSingle() : Promise.resolve({ data: null })]);
    const balance = Number(inv.balance), reason = base.data && base.data.discount_reason;
    v.innerHTML = `<p class="no-print"><button class="linkbtn" id="back">← Back</button></p>
    <div class="panel" id="card">${schoolHead()}<h2 style="text-align:center;margin:.5rem 0">Fee invoice</h2>
      <p><strong>${esc(fullName(stu.data))}</strong> · Admission no. ${esc(stu.data.admission_no)}<br>Class: ${esc(cls.data ? clsLabel(cls.data) : "—")} · ${esc(termName(inv.term_id))}<br>Invoice no. ${esc(inv.invoice_no)}</p>
      <div class="tablewrap"><table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>${items.data.map((x) => `<tr><td>${esc(x.name)}</td><td>${money(x.amount)}</td></tr>`).join("")}</tbody><tfoot>
        <tr><td>Total</td><td>${money(inv.gross)}</td></tr>${Number(inv.discount) > 0 ? `<tr><td>Discount${reason ? " (" + esc(reason) + ")" : ""}</td><td>− ${money(inv.discount)}</td></tr>` : ""}
        <tr><td><strong>Amount due</strong></td><td><strong>${money(inv.net)}</strong></td></tr><tr><td>Paid</td><td>${money(inv.paid)}</td></tr><tr><th>Balance</th><th>${money(balance)}</th></tr></tfoot></table></div>
      <h2 style="margin-top:1rem">Payments</h2>${pays.data.length ? `<div class="tablewrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th><th class="no-print"></th></tr></thead><tbody>${pays.data.map((p) => `<tr style="${p.voided ? "opacity:.55;text-decoration:line-through" : ""}"><td>${esc(p.receipt_no)}</td><td>${esc(S.fmtDate(p.paid_on))}</td><td>${esc(METHOD[p.method])}</td><td>${esc(p.reference || "")}</td><td>${money(p.amount)}</td><td class="no-print">${p.voided ? `<small>Voided: ${esc(p.void_reason || "")}</small>` : `<button class="btn ghost" data-rc="${p.id}">Receipt</button>${mgr ? ` <button class="btn ghost" data-void="${p.id}">Void</button>` : ""}`}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No payments recorded yet.</div>`}</div>
    <div class="panel no-print"><button class="btn" id="print">Print invoice</button></div><div id="m" class="no-print"></div>
    ${fin && balance > 0 ? `<div class="panel no-print"><h2>Record a payment</h2><form id="pf"><div class="row"><div><label for="pa">Amount (₦)</label><input id="pa" type="number" inputmode="decimal" step="0.01" min="0.01" max="${balance}" value="${balance}" required></div><div><label for="pm">Method</label><select id="pm">${Object.entries(METHOD).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div><div><label for="pd">Date paid</label><input id="pd" type="date" value="${today()}" max="${today()}" required></div></div><div class="row"><div id="rw" class="hidden"><label for="pr">Transfer / teller / POS reference</label><input id="pr" maxlength="60"></div><div><label for="pn">Note (optional)</label><input id="pn" maxlength="200"></div></div><button class="btn" style="margin-top:.7rem">Save payment</button></form></div>` : ""}
    ${fin ? `<div class="panel no-print"><h2>Add an extra charge</h2><form id="xf" class="row"><div><label for="xn">Item (e.g. Late fee)</label><input id="xn" required maxlength="80"></div><div><label for="xa">Amount (₦)</label><input id="xa" type="number" step="0.01" min="0.01" required></div><div><button class="btn ghost">Add charge</button></div></form></div>` : ""}
    ${mgr ? `<div class="panel no-print"><h2>Discount or waiver</h2><form id="df" class="row"><div><label for="da">Discount (₦)</label><input id="da" type="number" step="0.01" min="0" value="${Number(inv.discount)}"></div><div><label for="dr">Reason</label><input id="dr" maxlength="120" value="${esc(reason || "")}" placeholder="e.g. Scholarship, staff child"></div><div><button class="btn ghost">Save discount</button></div></form></div>` : ""}`;
    $("#back").onclick = () => S.go(ref.back || "dashboard"); $("#print").onclick = () => window.print();
    const m = (t, k) => { msg($("#m"), t, k); $("#m").scrollIntoView({ block: "center", behavior: "smooth" }); };
    v.onclick = async (e) => {
      const r = e.target.closest("[data-rc]"); if (r) { st.receipt = { id: r.dataset.rc, back: "invoice" }; return S.go("receipt"); }
      const vd = e.target.closest("[data-void]"); if (vd) { const why = prompt("Reason for voiding this payment (it will be recorded):"); if (!why) return; const x = await sb().rpc("void_payment", { p_payment: vd.dataset.void, p_reason: why }); if (x.error) return m(friendly(x.error)); S.go("invoice"); }
    };
    if ($("#pm")) { const sync = () => $("#rw").classList.toggle("hidden", !["bank_transfer", "pos"].includes($("#pm").value)); $("#pm").onchange = sync; sync(); }
    if ($("#pf")) $("#pf").onsubmit = async (e) => {
      e.preventDefault(); const method = $("#pm").value, amount = Number($("#pa").value), reference = $("#pr").value.trim();
      if (!(amount > 0) || amount > balance + 0.001) return m(`Enter an amount above zero and not more than the balance (${money(balance)}).`);
      if (["bank_transfer", "pos"].includes(method) && !reference) return m("Enter the transfer, teller or POS reference.");
      if (!(await confirmBox(`Record ${money(amount)} (${METHOD[method]})?`))) return;
      const x = await sb().from("payments").insert({ school_id: inv.school_id, invoice_id: inv.id, student_id: inv.student_id, amount, method, reference: reference || null, paid_on: $("#pd").value, note: $("#pn").value.trim() || null }).select("id").single();
      if (x.error) return m(x.error.code === "23505" ? "That reference has already been recorded on another payment." : friendly(x.error));
      st.receipt = { id: x.data.id, back: "invoice" }; S.go("receipt");
    };
    if ($("#xf")) $("#xf").onsubmit = async (e) => { e.preventDefault(); const x = await sb().rpc("add_invoice_item", { p_invoice: inv.id, p_name: $("#xn").value, p_amount: Number($("#xa").value) }); if (x.error) return m(friendly(x.error)); S.go("invoice"); };
    if ($("#df")) $("#df").onsubmit = async (e) => { e.preventDefault(); const x = await sb().rpc("set_discount", { p_invoice: inv.id, p_amount: Number($("#da").value || 0), p_reason: $("#dr").value }); if (x.error) return m(friendly(x.error)); S.go("invoice"); };
  };

  // ---------- Receipt ----------
  views.receipt = async function () {
    const ref = st.receipt; if (!ref) return S.go("dashboard"); const v = $("#view");
    const p = await sb().from("payments").select("*").eq("id", ref.id).single(); if (p.error) throw p.error; const pay = p.data;
    const [sm, all, stu] = await Promise.all([sb().from("invoice_summary").select("*").eq("id", pay.invoice_id).single(), sb().from("payments").select("amount, created_at, voided").eq("invoice_id", pay.invoice_id).order("created_at"), sb().from("students").select("first_name, last_name, admission_no").eq("id", pay.student_id).single()]);
    if (sm.error) throw sm.error; const inv = sm.data;
    const upTo = (all.data || []).filter((x) => !x.voided && x.created_at <= pay.created_at).reduce((a, b) => a + Number(b.amount), 0), after = Number(inv.net) - upTo;
    v.innerHTML = `<p class="no-print"><button class="linkbtn" id="back">← Back</button></p><div class="panel" id="card" style="position:relative">${schoolHead()}<h2 style="text-align:center;margin:.5rem 0">Payment receipt</h2>${pay.voided ? `<p style="text-align:center;color:var(--danger);font-weight:700">VOIDED${pay.void_reason ? ": " + esc(pay.void_reason) : ""}</p>` : ""}
      <p>Receipt no. <strong>${esc(pay.receipt_no)}</strong><br>Date: ${esc(S.fmtDate(pay.paid_on))}</p>
      <p>Received from the parent/guardian of <strong>${esc(fullName(stu.data))}</strong> (Admission no. ${esc(stu.data.admission_no)})</p>
      <p style="font-size:1.4rem;margin:.4rem 0"><strong>${money(pay.amount)}</strong></p><p class="muted" style="margin-top:0">${esc(nairaWords(pay.amount))}</p>
      <p>Payment for: ${esc(termName(inv.term_id))} fees (Invoice ${esc(inv.invoice_no)})<br>Method: ${esc(METHOD[pay.method])}${pay.reference ? ` · Reference: ${esc(pay.reference)}` : ""}<br>Balance after this payment: <strong>${money(after)}</strong></p>
      <div style="display:flex;gap:2rem;margin-top:2.4rem"><div style="flex:1;border-top:1px solid currentColor;padding-top:.3rem;text-align:center">Received by (signature)</div><div style="flex:1;border-top:1px solid currentColor;padding-top:.3rem;text-align:center">Date</div></div></div>
    <div class="panel no-print"><button class="btn" id="print">Print receipt</button></div>`;
    $("#back").onclick = () => { if (ref.back === "invoice" && st.inv === undefined) st.inv = { id: pay.invoice_id, back: "invoices" }; if (ref.back === "invoice" && st.inv && st.inv.id !== pay.invoice_id) st.inv = { id: pay.invoice_id, back: "invoices" }; if (!st.inv) st.inv = { id: pay.invoice_id, back: "invoices" }; S.go(ref.back || "dashboard"); };
    $("#print").onclick = () => window.print();
  };

  // ---------- Fees report ----------
  views.feereport = async function () {
    if (needTerm()) return;
    const v = $("#view"), tm = st.terms.find((t) => t.id === st.termId);
    v.innerHTML = `<h1>Fees report</h1><p class="muted">${esc(termName(st.termId))}</p><div id="m"></div><div id="body"><p><span class="spin"></span> Loading…</p></div>`;
    const [classes, sums, pays] = await Promise.all([getClasses(), fetchAll(() => sb().from("invoice_summary").select("*").eq("school_id", sid()).eq("term_id", st.termId)),
      fetchAll(() => sb().from("payments").select("amount, method").eq("school_id", sid()).eq("voided", false).gte("paid_on", tm.start_date).lte("paid_on", tm.end_date))]);
    const cm = Object.fromEntries(classes.map((c) => [c.id, clsLabel(c)])), num = (x) => Number(x);
    const tot = sums.reduce((a, i) => ({ net: a.net + num(i.net), paid: a.paid + num(i.paid), disc: a.disc + num(i.discount) }), { net: 0, paid: 0, disc: 0 });
    const rate = tot.net > 0 ? Math.round((tot.paid / tot.net) * 1000) / 10 : 0, out = tot.net - tot.paid;
    const byClass = {}; sums.forEach((i) => { const k = i.class_id || "none"; (byClass[k] = byClass[k] || { n: 0, net: 0, paid: 0 }); byClass[k].n++; byClass[k].net += num(i.net); byClass[k].paid += num(i.paid); });
    const classRows = Object.entries(byClass).map(([k, x]) => ({ cls: cm[k] || "Unknown", n: x.n, net: x.net, paid: x.paid, out: x.net - x.paid, rate: x.net > 0 ? Math.round((x.paid / x.net) * 1000) / 10 : 0 }));
    const meth = {}; pays.forEach((p) => (meth[p.method] = (meth[p.method] || 0) + num(p.amount)));
    $("#body").innerHTML = `<div class="cards"><div class="card"><div class="muted">Invoiced</div><div class="n" style="font-size:1.3rem">${money(tot.net)}</div></div><div class="card"><div class="muted">Collected</div><div class="n" style="font-size:1.3rem">${money(tot.paid)}</div></div><div class="card"><div class="muted">Outstanding</div><div class="n" style="font-size:1.3rem">${money(out)}</div></div><div class="card"><div class="muted">Collection rate</div><div class="n">${rate}%</div></div></div>
    <p class="muted">${sums.length} invoice${sums.length === 1 ? "" : "s"} · discounts and waivers ${money(tot.disc)}</p>
    <div class="panel"><h2>By class</h2><div id="cl"></div></div>
    <div class="panel"><h2>Payments received during this term's dates, by method</h2>${Object.keys(meth).length ? `<ul>${Object.entries(meth).map(([k, a]) => `<li>${esc(METHOD[k])}: ${money(a)}</li>`).join("")}</ul>` : `<div class="empty">No payments in these dates.</div>`}<p class="muted">Counted by the date the money was paid, so it can differ from "Collected" above if payments were made outside the term dates.</p></div>
    <div class="panel"><h2>Outstanding balances</h2><div id="debt"></div><button class="btn ghost hidden" id="exp" style="margin-top:.6rem">Export CSV</button></div>`;
    mountTable($("#cl"), [{ k: "cls", label: "Class" }, { k: "n", label: "Invoices" }, { k: "net", label: "Invoiced", text: (x) => money(x.net) }, { k: "paid", label: "Collected", text: (x) => money(x.paid) }, { k: "out", label: "Outstanding", text: (x) => money(x.out) }, { k: "rate", label: "Rate", text: (x) => x.rate + "%" }], classRows, "No invoices for this term yet.");
    const debtors = sums.filter((i) => num(i.balance) > 0); let rows = [];
    if (debtors.length) {
      const ids = debtors.map((d) => d.student_id);
      const stu = await chunked(ids, async (c) => { const r = await sb().from("students").select("id, first_name, last_name, admission_no").in("id", c); if (r.error) throw r.error; return r.data; });
      const gs = await chunked(ids, async (c) => { const r = await sb().from("student_guardians").select("student_id, is_primary, guardians(full_name, phone)").in("student_id", c); if (r.error) throw r.error; return r.data; });
      const sm = Object.fromEntries(stu.map((s) => [s.id, s])), gm = {}; gs.forEach((g) => { if (!gm[g.student_id] || g.is_primary) gm[g.student_id] = g.guardians; });
      rows = debtors.map((d) => { const s = sm[d.student_id] || {}, g = gm[d.student_id] || {}; return { name: fullName(s), adm: s.admission_no || "", cls: cm[d.class_id] || "", bal: num(d.balance), guardian: g.full_name || "", phone: g.phone || "" }; }).sort((a, b) => b.bal - a.bal);
    }
    mountTable($("#debt"), [{ k: "name", label: "Student" }, { k: "cls", label: "Class" }, { k: "bal", label: "Balance", text: (x) => money(x.bal) }, { k: "guardian", label: "Guardian" }, { k: "phone", label: "Phone" }], rows, "No outstanding balances for this term.");
    if (rows.length) { $("#exp").classList.remove("hidden"); $("#exp").onclick = () => download("outstanding_fees.csv", ["student", "admission_no", "class", "balance", "guardian", "phone"], rows.map((x) => [x.name, x.adm, x.cls, x.bal, x.guardian, x.phone])); }
  };

  // ---------- Parent / student ----------
  views.myfees = async function () {
    const v = $("#view"); const stu = await sb().from("students").select("id, first_name, last_name").eq("school_id", sid()); if (stu.error) throw stu.error;
    if (!stu.data.length) { v.innerHTML = `<h1>Fees</h1><div class="panel"><div class="empty">No student is linked to your account yet.</div></div>`; return; }
    const r = await sb().from("invoice_summary").select("*").in("student_id", stu.data.map((s) => s.id)); if (r.error) throw r.error;
    const nm = Object.fromEntries(stu.data.map((s) => [s.id, fullName(s)])); const owed = r.data.reduce((a, b) => a + Number(b.balance), 0);
    v.innerHTML = `<h1>Fees</h1><div class="cards"><div class="card"><div class="muted">Total outstanding</div><div class="n">${money(owed)}</div></div></div><div class="panel" id="list"></div><p class="muted">To pay, use the school's bank details or pay at the bursar's office, then ask for a receipt. Payments appear here once the school records them.</p>`;
    mountTable($("#list"), [{ k: "s", label: "Student", text: (x) => nm[x.student_id] }, { k: "t", label: "Term", text: (x) => termName(x.term_id) }, { k: "invoice_no", label: "Invoice" }, { k: "net", label: "Total", text: (x) => money(x.net) }, { k: "paid", label: "Paid", text: (x) => money(x.paid) }, { k: "balance", label: "Balance", text: (x) => money(x.balance) }], r.data, "No invoices yet.", (x) => `<button class="btn ghost" data-open="${x.id}">Open</button>`);
    v.onclick = (e) => { const o = e.target.closest("[data-open]"); if (o) { st.inv = { id: o.dataset.open, back: "myfees" }; S.go("invoice"); } };
  };
})();
