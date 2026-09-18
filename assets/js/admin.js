import { supabase, warnIfNotConfigured } from "./supabaseClient.js";
import { requireAdmin, wireSignOutButtons } from "./auth.js";

warnIfNotConfigured();
wireSignOutButtons();

const RECEIPT_BUCKET = "raqgiveback-files";

const esc = (v) =>
  v == null
    ? ""
    : String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}
document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});
document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.classList.remove("open");
  });
});

// --- Sidebar tabs: swap which panel is visible, no page reload or anchor-jump ---
const tabLinks = document.querySelectorAll("[data-tab-link]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");
function showTab(name) {
  tabPanels.forEach((p) => (p.hidden = p.dataset.tabPanel !== name));
  tabLinks.forEach((l) => l.classList.toggle("active", l.dataset.tabLink === name));
}
tabLinks.forEach((link) => {
  link.addEventListener("click", () => showTab(link.dataset.tabLink));
});

async function uploadFile(inputEl, folder) {
  const file = inputEl.files?.[0];
  if (!file) return null;
  const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, file);
  if (error) {
    alert(`File upload failed: ${error.message}`);
    return null;
  }
  return path;
}

async function signedUrlFor(path) {
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 60);
  if (error) {
    alert(`Couldn't open file: ${error.message}`);
    return null;
  }
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

async function loadOverview() {
  const { data: profiles } = await supabase.from("profiles").select("role,status");
  const counts = { kid: 0, mentor: 0, partner: 0, ambassador: 0, pending: 0 };
  (profiles || []).forEach((p) => {
    if (p.status === "pending") counts.pending++;
    if (p.status === "approved" && counts[p.role] !== undefined) counts[p.role]++;
  });
  document.getElementById("ov-kids").textContent = counts.kid;
  document.getElementById("ov-mentors").textContent = counts.mentor;
  document.getElementById("ov-ambassadors").textContent = counts.ambassador;
  document.getElementById("ov-partners").textContent = counts.partner;
  document.getElementById("ov-pending").textContent = counts.pending;

  const { count: peopleCount } = await supabase.from("people_assisted").select("*", { count: "exact", head: true });
  const { count: recordsCount } = await supabase.from("assistance_records").select("*", { count: "exact", head: true });
  document.getElementById("ov-people").textContent = peopleCount ?? 0;
  document.getElementById("ov-services").textContent = recordsCount ?? 0;
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

let currentMemberFilter = "pending";

function memberDetails(p) {
  if (p.role === "mentor") return `Area: ${esc(p.mentor_area || "—")}<br/>Background: ${esc(p.background_check_status || "pending")}`;
  if (p.role === "partner") return `${esc(p.org_name || "—")}<br/>${esc(p.partnership_type || "")}`;
  if (p.role === "kid") return `DOB: ${esc(p.dob || "—")}<br/>Guardian: ${esc(p.guardian_name || "—")} (${esc(p.guardian_phone || "—")})`;
  return "—";
}

async function loadMembers() {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  const tbody = document.getElementById("members-body");
  if (error) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${esc(error.message)}</td></tr>`;
    return;
  }
  let rows = data || [];
  if (currentMemberFilter === "pending") rows = rows.filter((p) => p.status === "pending");
  else if (currentMemberFilter !== "all") rows = rows.filter((p) => p.role === currentMemberFilter);

  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No members in this view.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (p) => `
      <tr>
        <td>${esc(p.full_name)}</td>
        <td>${esc(p.role)}</td>
        <td>${esc(p.email)}<br/>${esc(p.phone)}</td>
        <td>${memberDetails(p)}</td>
        <td><span class="status-badge ${esc(p.status)}">${esc(p.status)}</span></td>
        <td>
          ${
            p.status !== "approved"
              ? `<button class="btn btn-dark btn-small" data-approve="${p.id}">Approve</button>`
              : ""
          }
          ${
            p.status !== "rejected"
              ? `<button class="btn btn-danger btn-small" data-reject="${p.id}">Reject</button>`
              : ""
          }
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-approve]").forEach((btn) =>
    btn.addEventListener("click", () => updateMemberStatus(btn.dataset.approve, "approved"))
  );
  tbody.querySelectorAll("[data-reject]").forEach((btn) =>
    btn.addEventListener("click", () => updateMemberStatus(btn.dataset.reject, "rejected"))
  );
}

async function updateMemberStatus(id, status) {
  const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
  if (error) return alert(error.message);
  await loadMembers();
  await loadOverview();
}

document.querySelectorAll("#member-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#member-tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMemberFilter = btn.dataset.filter;
    loadMembers();
  });
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

async function loadExpenses() {
  const { data, error } = await supabase.from("expenses").select("*").order("date", { ascending: false });
  const tbody = document.getElementById("expenses-body");
  if (error) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${esc(error.message)}</td></tr>`;
    return;
  }
  const rows = data || [];
  const totals = { Food: 0, Clothing: 0, Events: 0, Other: 0 };
  rows.forEach((r) => (totals[r.category] = (totals[r.category] || 0) + Number(r.amount)));
  document.getElementById("tot-food").textContent = money(totals.Food);
  document.getElementById("tot-clothing").textContent = money(totals.Clothing);
  document.getElementById("tot-events").textContent = money(totals.Events);
  document.getElementById("tot-other").textContent = money(totals.Other);
  document.getElementById("tot-all").textContent = money(totals.Food + totals.Clothing + totals.Events + totals.Other);

  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No expenses recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${esc(r.date)}</td>
        <td>${esc(r.category)}</td>
        <td>${esc(r.description)}</td>
        <td>${esc(r.vendor)}</td>
        <td>${money(r.amount)}</td>
        <td>${r.receipt_url ? `<button class="btn btn-small btn-dark" data-view-receipt="${esc(r.receipt_url)}">View</button>` : "—"}</td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-view-receipt]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const url = await signedUrlFor(btn.dataset.viewReceipt);
      if (url) window.open(url, "_blank");
    })
  );
}

document.getElementById("open-expense-modal").addEventListener("click", () => {
  document.getElementById("expense-form").reset();
  document.getElementById("exp-date").value = new Date().toISOString().slice(0, 10);
  openModal("modal-expense");
});

document.getElementById("expense-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const receiptPath = await uploadFile(document.getElementById("exp-receipt"), "receipts");
  const { error } = await supabase.from("expenses").insert({
    date: document.getElementById("exp-date").value,
    category: document.getElementById("exp-category").value,
    description: document.getElementById("exp-description").value.trim(),
    amount: Number(document.getElementById("exp-amount").value),
    vendor: document.getElementById("exp-vendor").value.trim(),
    receipt_url: receiptPath,
    notes: document.getElementById("exp-notes").value.trim(),
  });
  if (error) return alert(error.message);
  closeModal("modal-expense");
  await loadExpenses();
});

// ---------------------------------------------------------------------------
// Community Assistance
// ---------------------------------------------------------------------------

let peopleCache = [];

async function loadPeopleAndRecords() {
  const { data: people, error: pErr } = await supabase
    .from("people_assisted")
    .select("*")
    .order("first_helped_date", { ascending: false });
  const { data: records, error: rErr } = await supabase
    .from("assistance_records")
    .select("*, people_assisted(full_name)")
    .order("date", { ascending: false });

  peopleCache = people || [];

  const peopleBody = document.getElementById("people-body");
  if (pErr) {
    peopleBody.innerHTML = `<tr class="empty-row"><td colspan="6">${esc(pErr.message)}</td></tr>`;
  } else if (!peopleCache.length) {
    peopleBody.innerHTML = `<tr class="empty-row"><td colspan="6">No one recorded yet.</td></tr>`;
  } else {
    peopleBody.innerHTML = peopleCache
      .map((p) => {
        const serviceCount = (records || []).filter((r) => r.person_id === p.id).length;
        return `
        <tr>
          <td>${esc(p.full_name)}</td>
          <td>${esc(p.phone)}<br/>${esc(p.email)}</td>
          <td>${esc(p.first_helped_date)}</td>
          <td>${esc(p.referred_by)}</td>
          <td>${serviceCount}</td>
          <td><button class="btn btn-small btn-dark" data-add-service="${p.id}">+ Add Service</button></td>
        </tr>`;
      })
      .join("");

    peopleBody.querySelectorAll("[data-add-service]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const person = peopleCache.find((p) => p.id === btn.dataset.addService);
        document.getElementById("service-form").reset();
        document.getElementById("s-date").value = new Date().toISOString().slice(0, 10);
        document.getElementById("s-person-id").value = person.id;
        document.getElementById("s-person-name").textContent = person.full_name;
        openModal("modal-service");
      })
    );
  }

  const recordsBody = document.getElementById("records-body");
  if (rErr) {
    recordsBody.innerHTML = `<tr class="empty-row"><td colspan="7">${esc(rErr.message)}</td></tr>`;
  } else if (!records || !records.length) {
    recordsBody.innerHTML = `<tr class="empty-row"><td colspan="7">No assistance records yet.</td></tr>`;
  } else {
    recordsBody.innerHTML = records
      .map(
        (r) => `
      <tr>
        <td>${esc(r.people_assisted?.full_name)}</td>
        <td>${esc(r.assistance_type)}</td>
        <td>${esc(r.date)}</td>
        <td>${esc(r.what_provided)}</td>
        <td>${esc(r.outcome)}</td>
        <td><span class="status-badge ${esc((r.status || "").toLowerCase())}">${esc(r.status)}</span></td>
        <td>${r.estimated_cost ? money(r.estimated_cost) : "—"}</td>
      </tr>`
      )
      .join("");
  }
}

document.getElementById("open-person-modal").addEventListener("click", () => {
  document.getElementById("person-form").reset();
  document.getElementById("p-date").value = new Date().toISOString().slice(0, 10);
  openModal("modal-person");
});

document.getElementById("person-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase.from("people_assisted").insert({
    full_name: document.getElementById("p-name").value.trim(),
    phone: document.getElementById("p-phone").value.trim(),
    email: document.getElementById("p-email").value.trim(),
    first_helped_date: document.getElementById("p-date").value,
    referred_by: document.getElementById("p-referred").value.trim(),
    notes: document.getElementById("p-notes").value.trim(),
  });
  if (error) return alert(error.message);
  closeModal("modal-person");
  await loadPeopleAndRecords();
  await loadOverview();
});

document.getElementById("service-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase.from("assistance_records").insert({
    person_id: document.getElementById("s-person-id").value,
    assistance_type: document.getElementById("s-type").value,
    date: document.getElementById("s-date").value,
    what_provided: document.getElementById("s-provided").value.trim(),
    outcome: document.getElementById("s-outcome").value.trim(),
    status: document.getElementById("s-status").value,
    estimated_cost: document.getElementById("s-cost").value ? Number(document.getElementById("s-cost").value) : null,
    follow_up_needed: document.getElementById("s-followup").checked,
    notes: document.getElementById("s-notes").value.trim(),
  });
  if (error) return alert(error.message);
  closeModal("modal-service");
  await loadPeopleAndRecords();
  await loadOverview();
});

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

async function loadOperations() {
  const { data, error } = await supabase.from("operations").select("*").order("date", { ascending: false });
  const tbody = document.getElementById("operations-body");
  if (error) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${esc(error.message)}</td></tr>`;
    return;
  }
  const rows = data || [];
  const outsourcedTotal = rows.filter((r) => r.work_type === "Outsourced").reduce((sum, r) => sum + Number(r.cost || 0), 0);
  const inhouseCount = rows.filter((r) => r.work_type === "In-House" && r.status === "Completed").length;
  document.getElementById("tot-outsourced").textContent = money(outsourcedTotal);
  document.getElementById("tot-inhouse-count").textContent = inhouseCount;

  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No operations recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${esc(r.project_name)}</td>
        <td>${esc(r.work_type)}</td>
        <td>${esc(r.vendor_or_person)}</td>
        <td>${money(r.cost)}</td>
        <td>${esc(r.date)}</td>
        <td><span class="status-badge ${esc(r.status.replace(/\s/g, "").toLowerCase())}">${esc(r.status)}</span></td>
      </tr>`
    )
    .join("");
}

document.getElementById("open-operation-modal").addEventListener("click", () => {
  document.getElementById("operation-form").reset();
  document.getElementById("op-date").value = new Date().toISOString().slice(0, 10);
  openModal("modal-operation");
});

document.getElementById("operation-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const invoicePath = await uploadFile(document.getElementById("op-invoice"), "invoices");
  const { error } = await supabase.from("operations").insert({
    project_name: document.getElementById("op-project").value.trim(),
    work_type: document.getElementById("op-type").value,
    vendor_or_person: document.getElementById("op-vendor").value.trim(),
    cost: Number(document.getElementById("op-cost").value || 0),
    date: document.getElementById("op-date").value,
    reason_outsourced: document.getElementById("op-reason").value.trim(),
    status: document.getElementById("op-status").value,
    invoice_url: invoicePath,
    notes: document.getElementById("op-notes").value.trim(),
  });
  if (error) return alert(error.message);
  closeModal("modal-operation");
  await loadOperations();
});

// ---------------------------------------------------------------------------
// Events & Announcements
// ---------------------------------------------------------------------------

async function loadAdminEvents() {
  const { data, error } = await supabase.from("events").select("*").order("event_date", { ascending: false });
  const tbody = document.getElementById("admin-events-body");
  if (error) return (tbody.innerHTML = `<tr class="empty-row"><td colspan="5">${esc(error.message)}</td></tr>`);
  if (!data || !data.length) return (tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No events yet.</td></tr>`);
  tbody.innerHTML = data
    .map(
      (ev) => `
      <tr>
        <td>${esc(ev.event_date)}</td>
        <td>${esc(ev.title)}</td>
        <td>${esc(ev.location)}</td>
        <td>${ev.is_public ? "Public" : "Members only"}</td>
        <td><button class="btn btn-small btn-danger" data-del-event="${ev.id}">Delete</button></td>
      </tr>`
    )
    .join("");
  tbody.querySelectorAll("[data-del-event]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await supabase.from("events").delete().eq("id", btn.dataset.delEvent);
      loadAdminEvents();
    })
  );
}

async function loadAdminAnnouncements() {
  const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
  const tbody = document.getElementById("admin-announcements-body");
  if (error) return (tbody.innerHTML = `<tr class="empty-row"><td colspan="4">${esc(error.message)}</td></tr>`);
  if (!data || !data.length) return (tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No announcements yet.</td></tr>`);
  tbody.innerHTML = data
    .map(
      (a) => `
      <tr>
        <td>${esc(new Date(a.created_at).toLocaleDateString())}</td>
        <td>${esc(a.title)}</td>
        <td>${esc(a.body)}</td>
        <td><button class="btn btn-small btn-danger" data-del-ann="${a.id}">Delete</button></td>
      </tr>`
    )
    .join("");
  tbody.querySelectorAll("[data-del-ann]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await supabase.from("announcements").delete().eq("id", btn.dataset.delAnn);
      loadAdminAnnouncements();
    })
  );
}

document.getElementById("open-event-modal").addEventListener("click", () => {
  document.getElementById("event-form").reset();
  openModal("modal-event");
});
document.getElementById("event-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase.from("events").insert({
    title: document.getElementById("ev-title").value.trim(),
    event_date: document.getElementById("ev-date").value || null,
    location: document.getElementById("ev-location").value.trim(),
    description: document.getElementById("ev-description").value.trim(),
    is_public: document.getElementById("ev-public").checked,
  });
  if (error) return alert(error.message);
  closeModal("modal-event");
  loadAdminEvents();
});

document.getElementById("open-announcement-modal").addEventListener("click", () => {
  document.getElementById("announcement-form").reset();
  openModal("modal-announcement");
});
document.getElementById("announcement-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase.from("announcements").insert({
    title: document.getElementById("an-title").value.trim(),
    body: document.getElementById("an-body").value.trim(),
  });
  if (error) return alert(error.message);
  closeModal("modal-announcement");
  loadAdminAnnouncements();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  const result = await requireAdmin();
  if (!result) return;
  document.getElementById("side-name").textContent = result.profile?.full_name || "Admin";

  await Promise.all([
    loadOverview(),
    loadMembers(),
    loadExpenses(),
    loadPeopleAndRecords(),
    loadOperations(),
    loadAdminEvents(),
    loadAdminAnnouncements(),
  ]);
}

init();
