// School logo and student photos (resized in the browser to keep files small)
(function () {
  "use strict";
  const S = window.SSMS, st = S.st, esc = S.esc, msg = S.msg, friendly = S.friendly, confirmBox = S.confirmBox, views = S.views;
  const $ = (s) => document.querySelector(s);
  const sb = () => S.sb(), sid = () => S.schoolId();

  function loadImage(file) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("That file could not be read as an image.")); }; i.src = u; });
  }
  async function shrink(file, o) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
    if (file.size > 8 * 1024 * 1024) throw new Error("That image is too large. Choose one under 8 MB.");
    const img = await loadImage(file), c = document.createElement("canvas"), x = c.getContext("2d");
    if (o.square) { const s = Math.min(img.width, img.height); c.width = c.height = o.size; if (o.type === "image/jpeg") { x.fillStyle = "#fff"; x.fillRect(0, 0, o.size, o.size); } x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, o.size, o.size); }
    else { const k = Math.min(1, o.size / Math.max(img.width, img.height)); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); x.drawImage(img, 0, 0, c.width, c.height); }
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not process the image."))), o.type, o.quality));
  }
  async function signed(path) { const r = await sb().storage.from("student-photos").createSignedUrl(path, 3600); return r.error ? null : r.data.signedUrl; }

  // sidebar logo
  (window.SSMS_NAV = window.SSMS_NAV || []).push((items, state) => {
    const el = $("#schoolLogo"), l = state.ctx && state.ctx.school && state.ctx.school.logo_url;
    if (el && l) { el.style.background = "#fff"; el.innerHTML = `<img src="${esc(l)}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:6px">`; } else if (el) el.style.background = "";
  });

  // ---- logo on the School profile page ----
  const baseProfile = views.schoolprofile;
  views.schoolprofile = async function () {
    await baseProfile(); const first = $("#view .panel"); if (!first) return;
    const sch = st.ctx.school;
    first.insertAdjacentHTML("beforebegin", `<div class="panel"><h2>School logo</h2><div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap">${sch.logo_url ? `<img src="${esc(sch.logo_url)}" alt="School logo" style="height:72px;max-width:160px;object-fit:contain">` : `<div class="muted">No logo yet.</div>`}<div><label class="btn ghost" style="display:inline-block;margin:0">${sch.logo_url ? "Change logo" : "Upload logo"}<input id="logoIn" type="file" accept="image/png,image/jpeg,image/webp" style="display:none"></label>${sch.logo_url ? ` <button class="btn ghost" id="logoDel">Remove</button>` : ""}</div></div><p class="muted">Shown on report cards, invoices and receipts. A square or wide PNG with a plain background works best.</p><div id="lm"></div></div>`);
    $("#logoIn").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return; const out = $("#lm"); out.innerHTML = `<p><span class="spin"></span> Uploading…</p>`;
      try {
        const blob = await shrink(f, { size: 400, type: "image/png" }); const path = `${sid()}/logo.png`;
        const up = await sb().storage.from("school-logos").upload(path, blob, { upsert: true, contentType: "image/png" }); if (up.error) throw up.error;
        const url = sb().storage.from("school-logos").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
        const r = await sb().from("schools").update({ logo_url: url }).eq("id", sid()).select("id"); if (r.error) throw r.error; if (!r.data.length) throw new Error("Nothing was saved. You may not have permission.");
        st.ctx.school.logo_url = url; S.go("schoolprofile");
      } catch (err) { msg(out, /bucket|not found/i.test(err.message) ? "Storage is not set up yet. Run 009_photos_logo.sql in Supabase, then try again." : friendly(err)); }
    };
    if ($("#logoDel")) $("#logoDel").onclick = async () => { if (!(await confirmBox("Remove the school logo?"))) return; await sb().storage.from("school-logos").remove([`${sid()}/logo.png`]); const r = await sb().from("schools").update({ logo_url: null }).eq("id", sid()); if (r.error) return msg($("#lm"), friendly(r.error)); st.ctx.school.logo_url = null; S.go("schoolprofile"); };
  };

  // ---- photo on the student page ----
  const baseStudent = views.student;
  views.student = async function () {
    await baseStudent(); const h1 = $("#view h1"), id = st.studentId; if (!h1 || !id) return;
    const mgr = S.isManager(); const r = await sb().from("students").select("photo_path, first_name").eq("id", id).maybeSingle(); if (r.error || !r.data) return;
    const url = r.data.photo_path ? await signed(r.data.photo_path) : null;
    h1.insertAdjacentHTML("beforebegin", `<div id="ph" style="display:flex;gap:1rem;align-items:center;margin-bottom:.8rem">${url ? `<img src="${esc(url)}" alt="Student photo" style="width:96px;height:96px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">` : `<div style="width:96px;height:96px;border-radius:12px;background:var(--bg);border:1px dashed var(--line);display:grid;place-items:center;font-size:2rem">🧒</div>`}${mgr ? `<div><label class="btn ghost" style="display:inline-block;margin:0">${url ? "Change photo" : "Add photo"}<input id="phIn" type="file" accept="image/png,image/jpeg,image/webp" style="display:none"></label>${url ? ` <button class="btn ghost" id="phDel">Remove</button>` : ""}<div id="pm"></div></div>` : ""}</div>`);
    if (!mgr) return;
    $("#phIn").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return; const out = $("#pm"); out.innerHTML = `<small><span class="spin"></span> Uploading…</small>`;
      try {
        const blob = await shrink(f, { size: 400, square: true, type: "image/jpeg", quality: 0.82 }); const path = `${sid()}/${id}.jpg`;
        const up = await sb().storage.from("student-photos").upload(path, blob, { upsert: true, contentType: "image/jpeg" }); if (up.error) throw up.error;
        const u = await sb().from("students").update({ photo_path: path }).eq("id", id); if (u.error) throw u.error; S.go("student");
      } catch (err) { msg(out, /bucket|not found|photo_path/i.test(err.message) ? "Storage is not set up yet. Run 009_photos_logo.sql in Supabase, then try again." : friendly(err)); }
    };
    if ($("#phDel")) $("#phDel").onclick = async () => { if (!(await confirmBox("Remove this student's photo?"))) return; await sb().storage.from("student-photos").remove([`${sid()}/${id}.jpg`]); const u = await sb().from("students").update({ photo_path: null }).eq("id", id); if (u.error) return msg($("#pm"), friendly(u.error)); S.go("student"); };
  };

  // ---- photo on the report card ----
  const baseCard = views.reportcard;
  views.reportcard = async function () {
    await baseCard(); const card = $("#card"), rc = st.rc; if (!card || !rc) return;
    const r = await sb().from("students").select("photo_path").eq("id", rc.student).maybeSingle(); if (r.error || !r.data || !r.data.photo_path) return;
    const url = await signed(r.data.photo_path), p = card.querySelector("p"); if (!url || !p) return;
    p.insertAdjacentHTML("beforebegin", `<img src="${esc(url)}" alt="Student photo" style="float:right;width:84px;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--line);margin:0 0 .5rem .8rem">`);
  };
})();
