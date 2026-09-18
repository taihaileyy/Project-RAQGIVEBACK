import { supabase, warnIfNotConfigured } from "./supabaseClient.js";

warnIfNotConfigured();

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------------------------------------------------------------------
   Mobile navigation
   The old stylesheet simply hid the nav under 700px, leaving phone visitors
   with no navigation at all. This is a real panel with proper a11y wiring.
--------------------------------------------------------------------------- */

const toggle = document.querySelector("[data-nav-toggle]");
const panel = document.getElementById("nav-panel");

function setNav(open) {
  if (!toggle || !panel) return;
  toggle.setAttribute("aria-expanded", String(open));
  panel.dataset.open = String(open);
  document.body.classList.toggle("nav-open", open);
}

if (toggle && panel) {
  toggle.addEventListener("click", () => {
    setNav(toggle.getAttribute("aria-expanded") !== "true");
  });

  // Any navigation away from the panel should close it.
  panel.addEventListener("click", (e) => {
    if (e.target.closest("a")) setNav(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setNav(false);
      toggle.focus();
    }
  });

  // Don't leave the panel stuck open if the viewport grows past the breakpoint.
  window.matchMedia("(min-width: 1025px)").addEventListener("change", (e) => {
    if (e.matches) setNav(false);
  });
}

/* ---------------------------------------------------------------------------
   Scroll reveal — subtle, and skipped entirely under reduced-motion
--------------------------------------------------------------------------- */

const revealables = document.querySelectorAll(".reveal");

if (reducedMotion || !("IntersectionObserver" in window)) {
  revealables.forEach((el) => el.classList.add("is-in"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        revealObserver.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );
  revealables.forEach((el) => revealObserver.observe(el));
}

/* ---------------------------------------------------------------------------
   Impact numbers
   Values come from the public_impact_stats view — never hardcoded. The
   count-up is presentation only: the final rendered number is always
   whatever the database returned.
--------------------------------------------------------------------------- */

const STAT_FIELDS = {
  "stat-people": "people_assisted",
  "stat-kids": "kids_mentored",
  "stat-mentors": "mentors",
  "stat-ambassadors": "ambassadors",
  "stat-partners": "community_partners",
  "stat-services": "services_provided",
};

let impactVisible = reducedMotion;

function render(el, value) {
  el.textContent = value.toLocaleString();
}

function countUp(el, target) {
  if (reducedMotion || target <= 0) {
    render(el, target);
    return;
  }
  const duration = 1100;
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / duration, 1);
    // easeOutCubic
    const eased = 1 - Math.pow(1 - p, 3);
    render(el, Math.round(target * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function playStat(el) {
  if (el.dataset.played === "true" || el.dataset.target === undefined) return;
  el.dataset.played = "true";
  countUp(el, Number(el.dataset.target));
}

function playAllReady() {
  Object.keys(STAT_FIELDS).forEach((id) => {
    const el = document.getElementById(id);
    if (el) playStat(el);
  });
}

const impactGrid = document.querySelector("[data-impact]");
if (impactGrid && !reducedMotion && "IntersectionObserver" in window) {
  const impactObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        impactVisible = true;
        playAllReady();
        impactObserver.disconnect();
      });
    },
    { threshold: 0.2 }
  );
  impactObserver.observe(impactGrid);
} else {
  impactVisible = true;
}

async function loadStats() {
  if (!supabase) return; // leaves the em-dash placeholders in place
  const { data, error } = await supabase.from("public_impact_stats").select("*").maybeSingle();
  if (error || !data) {
    // Placeholders stay put rather than showing invented numbers.
    console.warn("RaqGiveback: impact stats unavailable.", error?.message ?? "no rows returned");
    return;
  }

  Object.entries(STAT_FIELDS).forEach(([id, field]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.target = String(data[field] ?? 0);
    if (impactVisible) playStat(el);
  });
}

loadStats();
