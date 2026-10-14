// Library: catalogue, issue & return, overdue tracking, parent/student view
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, esc = S.esc, msg = S.msg, friendly = S.friendly, confirmBox = S.confirmBox, mountTable = S.mountTable;
  const $ = (s) => document.querySelector(s);
  const sb = () => S.sb(), sid = () => S.schoolId(), views = S.views;
  const canManage = () => S.isManager() || (st.ctx && st.ctx.role === "librarian");
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const addDays = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
  const overdueDays = (l) => (l.returned_on ? 0 : Math.max(0, daysBetween(l.due_on, today())));
  const statusOf = (l) => { if (l.returned_on) return "Returned"; const n = overdueDays(l); return n > 0 ? `Overdue (${n} day${n === 1 ? "" : "s"})` : "On loan"; };
  const nn = (s) => (String(s || "").trim() || null);
  const sum = (a, k) => a.reduce((t, x) => t + Number(x[k] || 0), 0);
  let flash = null;
  const showFlash = () => { if (flash && $("#m")) { msg($("#m"), flash, "ok"); } flash = null; };

  function download(name, header, rows) {
    const cell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const body = [header.join(",")].concat(rows.map((r) => r.map(cell).join(","))).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  (window.SSMS_NAV = window.SSMS_NAV || []).push((items, state, isManager) => {
    if (!state.ctx || !state.ctx.school) return;
    const r = state.ctx.role;
    items.push(["library", "📚", "Library"]);
    if (isManager() || r === "librarian") items.push(["libloans", "🔖", "Issue & return"]);
    if (r === "parent" || r === "student") items.push(["mylibrary", "📖", "My books"]);
  });

  // ---------- Catalogue ----------
  views.library = async function () {
    const v = $("#view"), mgr = canManage();
    const { data, error } = await sb().from("library_stock").select("*").eq("school_id", sid()).order("title"); if (error) throw error;
    let overdue = 0;
    if (mgr) { const r = await sb().from("library_loans").select("id", { count: "exact", head: true }).eq("school_id", sid()).is("returned_on", null).lt("due_on", today()); if (r.error) throw r.error; overdue = r.count || 0; }
    const cats = [...new Set(data.map((b) => b.category).filter(Boolean))].sort();
    v.innerHTML = `<h1>Library</h1>
      <div class="cards">
        <div class="card"><div class="muted">Book titles</div><div class="n">${data.length}</div></div>
        <div class="card"><div class="muted">Total copies</div><div class="n">${sum(data, "copies")}</div></div>
        <div class="card"><div class="muted">On loan</div><div class="n">${sum(data, "on_loan")}</div></div>
        ${mgr ? `<div class="card"><div class="muted">Overdue</div><div class="n">${overdue}</div></div>` : ""}
      </div>
      ${mgr ? `<div class="panel"><h2 id="fh">Add a book</h2>
        <form id="bf" class="row">
          <div><label for="bt">Title</label><input id="bt" required maxlength="200"></div>
          <div><label for="ba">Author</label><input id="ba" maxlength="150"></div>
          <div><label for="bi">ISBN (optional)</label><input id="bi" maxlength="20" inputmode="text" autocomplete="off"></div>
          <div><label for="bc">Category</label><input id="bc" list="catlist" maxlength="60" placeholder="e.g. Mathematics"><datalist id="catlist">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div>
          <div><label for="bs">Shelf / location</label><input id="bs" maxlength="40"></div>
          <div><label for="bn">Copies</label><input id="bn" type="number" min="0" max="9999" value="1" required></div>
          <div><button class="btn" id="bsave">Add book</button> <button type="button" class="btn ghost hidden" id="bcancel">Cancel</button></div>
        </form><div id="m"></div></div>` : `<div id="m"></div>`}
      <div class="panel" id="list"></div>`;
    showFlash();
    mountTable($("#list"), [
      { k: "title", label: "Title" }, { k: "author", label: "Author" }, { k: "category", label: "Category" },
      { k: "shelf", label: "Shelf" }, { k: "isbn", label: "ISBN" },
      { k: "available", label: "Available", text: (x) => `${x.available} of ${x.copies}` },
    ], data, mgr ? "No books yet. Add your first book above." : "The library catalogue is empty.",
      mgr ? (x) => `<button class="btn ghost" data-edit="${x.id}">Edit</button> <button class="btn ghost" data-del="${x.id}">Delete</button>` : null);
    if (!mgr) return;

    let editId = null;
    const form = $("#bf");
    function resetForm() { editId = null; form.reset(); $("#bn").value = 1; $("#fh").textContent = "Add a book"; $("#bsave").textContent = "Add book"; $("#bcancel").classList.add("hidden"); }
    $("#bcancel").onclick = () => { resetForm(); msg($("#m"), ""); };
    v.onclick = async (e) => {
      const ed = e.target.closest("[data-edit]"), dl = e.target.closest("[data-del]");
      if (ed) {
        const b = data.find((x) => x.id === ed.dataset.edit); if (!b) return;
        editId = b.id; $("#bt").value = b.title || ""; $("#ba").value = b.author || ""; $("#bi").value = b.isbn || ""; $("#bc").value = b.category || ""; $("#bs").value = b.shelf || ""; $("#bn").value = b.copies;
        $("#fh").textContent = "Edit book"; $("#bsave").textContent = "Save changes"; $("#bcancel").classList.remove("hidden"); msg($("#m"), "");
        $("#fh").scrollIntoView({ behavior: "smooth", block: "start" }); $("#bt").focus({ preventScroll: true });
      }
      if (dl) {
        if (!(await confirmBox("Delete this book from the catalogue? This cannot be undone."))) return;
        const r = await sb().from("library_books").delete().eq("id", dl.dataset.del);
        if (r.error) return msg($("#m"), r.error.code === "23503" ? "This book has loan history, so it cannot be deleted. Set its copies to 0 to stop lending it." : friendly(r.error));
        flash = "Book deleted."; S.go("library");
      }
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const row = { title: $("#bt").value.trim(), author: nn($("#ba").value), isbn: nn($("#bi").value), category: nn($("#bc").value), shelf: nn($("#bs").value), copies: parseInt($("#bn").value, 10) };
      if (!row.title) return msg($("#m"), "Enter the book title.");
      if (!(row.copies >= 0)) return msg($("#m"), "Enter the number of copies (0 or more).");
      $("#bsave").disabled = true;
      const r = editId ? await sb().from("library_books").update(row).eq("id", editId) : await sb().from("library_books").insert({ ...row, school_id: sid() });
      $("#bsave").disabled = false;
      if (r.error) return msg($("#m"), r.error.code === "23505" ? "A book with that ISBN is already in the catalogue." : friendly(r.error));
      flash = editId ? "Changes saved." : "Book added."; S.go("library");
    };
  };

  // ---------- Issue & return ----------
  views.libloans = async function () {
    const v = $("#view");
    if (!canManage()) { v.innerHTML = `<div class="panel"><h1>Issue &amp; return</h1><p>Only the librarian and school administrators can issue books.</p></div>`; return; }
    const [bk, ln, sd] = await Promise.all([
      sb().from("library_stock").select("id, title, author, available").eq("school_id", sid()).order("title"),
      sb().from("library_loans").select("*, library_books(title, author)").eq("school_id", sid()).order("borrowed_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
      sb().rpc("lib_students", { p_school: sid() }),
    ]);
    if (bk.error) throw bk.error; if (ln.error) throw ln.error; if (sd.error) throw sd.error;
    const avail = bk.data.filter((b) => b.available > 0), loans = ln.data, students = sd.data;
    const label = (s) => `${s.full_name} (${s.admission_no || "no admission no."})${s.class_name ? " — " + s.class_name : ""}`;
    const byLabel = new Map(students.map((s) => [label(s), s]));
    const open = loans.filter((l) => !l.returned_on), late = open.filter((l) => overdueDays(l) > 0);
    v.innerHTML = `<h1>Issue &amp; return</h1>
      <div class="cards">
        <div class="card"><div class="muted">Books on loan</div><div class="n">${open.length}</div></div>
        <div class="card"><div class="muted">Overdue</div><div class="n">${late.length}</div></div>
      </div>
      <div class="panel"><h2>Issue a book</h2>
        ${avail.length ? `<form id="inf" class="row">
          <div><label for="ib">Book</label><select id="ib">${avail.map((b) => `<option value="${b.id}">${esc(b.title)}${b.author ? " — " + esc(b.author) : ""} (${b.available} left)</option>`).join("")}</select></div>
          <div><label for="is">Borrower (student name or admission no.)</label><input id="is" list="stulist" autocomplete="off" required><datalist id="stulist">${students.map((s) => `<option value="${esc(label(s))}">`).join("")}</datalist></div>
          <div><label for="idue">Due date</label><input id="idue" type="date" required value="${addDays(today(), 14)}" min="${today()}"></div>
          <div><label for="inote">Note (optional)</label><input id="inote" maxlength="200"></div>
          <div><button class="btn" id="isub">Issue book</button></div>
        </form><div id="ih" class="muted" style="margin-top:.4rem"></div>` : `<div class="empty">No books are available to issue. Add books or wait for returns.</div>`}
        <div id="m"></div></div>
      <div class="panel"><div class="row" style="margin-bottom:.8rem"><div><label for="lf">Show</label><select id="lf"><option value="open">On loan</option><option value="late">Overdue</option><option value="done">Returned</option><option value="all">All records</option></select></div><div style="flex:0"><button class="btn ghost" id="exp">Export CSV</button></div></div><div id="list"></div></div>`;
    showFlash();

    let cur = [];
    function draw() {
      const f = $("#lf").value;
      cur = loans.filter((l) => f === "all" || (f === "open" && !l.returned_on) || (f === "late" && !l.returned_on && overdueDays(l) > 0) || (f === "done" && l.returned_on));
      mountTable($("#list"), [
        { k: "b", label: "Book", text: (x) => x.library_books && x.library_books.title },
        { k: "borrower_name", label: "Borrower" }, { k: "borrower_class", label: "Class" },
        { k: "borrowed_on", label: "Borrowed", text: (x) => S.fmtDate(x.borrowed_on) },
        { k: "due_on", label: "Due", text: (x) => S.fmtDate(x.due_on) },
        { k: "s", label: "Status", text: statusOf },
      ], cur, f === "late" ? "No overdue books." : f === "done" ? "No returned books yet." : "No books on loan.",
        (x) => (x.returned_on ? `<span class="muted">Returned ${esc(S.fmtDate(x.returned_on))}</span>` : `<button class="btn ghost" data-ret="${x.id}">Return</button> <button class="btn ghost" data-ren="${x.id}">+7 days</button>`));
    }
    draw(); $("#lf").onchange = draw;
    $("#exp").onclick = () => download("library-loans.csv", ["Book", "Author", "Borrower", "Class", "Borrowed", "Due", "Returned", "Status", "Note"],
      cur.map((x) => [x.library_books && x.library_books.title, x.library_books && x.library_books.author, x.borrower_name, x.borrower_class, x.borrowed_on, x.due_on, x.returned_on, statusOf(x), x.note]));

    if ($("#is")) $("#is").oninput = () => {
      const t = $("#is").value.trim(), s = byLabel.get($("#is").value);
      $("#ih").textContent = !t ? "" : s ? `Student: ${s.full_name}` : "Not in the student list. It will be recorded as an outside borrower (for example a teacher).";
    };
    v.onclick = async (e) => {
      const rt = e.target.closest("[data-ret]"), rn = e.target.closest("[data-ren]");
      try {
        if (rt) { if (!(await confirmBox("Mark this book as returned?"))) return; const r = await sb().rpc("lib_return", { p_loan: rt.dataset.ret }); if (r.error) throw r.error; flash = "Book returned."; S.go("libloans"); }
        if (rn) { const l = loans.find((x) => x.id === rn.dataset.ren); const base = l.due_on > today() ? l.due_on : today(); const r = await sb().rpc("lib_renew", { p_loan: l.id, p_due: addDays(base, 7) }); if (r.error) throw r.error; flash = "Due date extended by 7 days."; S.go("libloans"); }
      } catch (err) { msg($("#m"), friendly(err)); }
    };
    if ($("#inf")) $("#inf").onsubmit = async (e) => {
      e.preventDefault();
      const typed = $("#is").value.trim(), s = byLabel.get($("#is").value);
      if (!typed) return msg($("#m"), "Enter the borrower.");
      if (!s && !(await confirmBox(`"${typed}" is not in your student list. Record this as an outside borrower, such as a teacher?`))) return;
      $("#isub").disabled = true;
      const r = await sb().rpc("lib_issue", { p_book: $("#ib").value, p_student: s ? s.id : null, p_name: s ? null : typed, p_due: $("#idue").value, p_note: $("#inote").value });
      $("#isub").disabled = false;
      if (r.error) return msg($("#m"), friendly(r.error));
      flash = "Book issued."; S.go("libloans");
    };
  };

  // ---------- Parent / student ----------
  views.mylibrary = async function () {
    const v = $("#view");
    const stu = await sb().from("students").select("id").eq("school_id", sid()); if (stu.error) throw stu.error;
    if (!stu.data.length) { v.innerHTML = `<h1>My books</h1><div class="panel"><div class="empty">No student is linked to your account yet.</div></div>`; return; }
    const r = await sb().from("library_loans").select("*, library_books(title, author)").in("student_id", stu.data.map((s) => s.id)).order("borrowed_on", { ascending: false }); if (r.error) throw r.error;
    const open = r.data.filter((l) => !l.returned_on), late = open.filter((l) => overdueDays(l) > 0);
    v.innerHTML = `<h1>My books</h1><div class="cards"><div class="card"><div class="muted">Currently borrowed</div><div class="n">${open.length}</div></div><div class="card"><div class="muted">Overdue</div><div class="n">${late.length}</div></div></div><div class="panel" id="list"></div><p class="muted">Please return overdue books to the school library as soon as possible.</p>`;
    mountTable($("#list"), [
      { k: "b", label: "Book", text: (x) => x.library_books && x.library_books.title },
      { k: "borrower_name", label: "Student" },
      { k: "borrowed_on", label: "Borrowed", text: (x) => S.fmtDate(x.borrowed_on) },
      { k: "due_on", label: "Due", text: (x) => S.fmtDate(x.due_on) },
      { k: "s", label: "Status", text: statusOf },
    ], r.data, "No books have been borrowed yet.");
  };
})();
