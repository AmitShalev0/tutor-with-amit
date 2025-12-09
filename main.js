// main.js

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxKXmxMroW74nabysGBr4LDFhwkURxaBiDntFVnowpP5PN-Czy6cWYnfO5axE58x5_j/exec";

const CALENDAR_DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CALENDAR_DAY_SHORT_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CALENDAR_DAY_VARIANTS = (() => {
  const map = new Map();
  CALENDAR_DAY_LABELS.forEach((label, index) => {
    const key = String(index);
    const lowerFull = label.toLowerCase();
    map.set(lowerFull, key);
    map.set(lowerFull.slice(0, 3), key);
  });
  map.set('thur', '3');
  map.set('thurs', '3');
  map.set('thu', '3');
  map.set('tues', '1');
  return map;
})();

function coerceCalendarHour(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(24, Math.max(0, Math.floor(value)));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const cleaned = trimmed.toLowerCase().replace(/[^0-9apm:]/g, '');
    if (!cleaned) {
      return null;
    }
    const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (match) {
      let hours = Number(match[1]);
      const minutes = match[2] ? Number(match[2]) : 0;
      const period = match[3];
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return null;
      }
      if (minutes !== 0) {
        return null;
      }
      if (period === 'am' || period === 'pm') {
        hours = hours % 12;
        if (period === 'pm') {
          hours += 12;
        }
      }
      return Math.min(24, Math.max(0, hours));
    }
    const numeric = Number(cleaned);
    if (Number.isFinite(numeric)) {
      return Math.min(24, Math.max(0, Math.floor(numeric)));
    }
  }
  return null;
}

function normalizeCalendarDayKey(value) {
  if (value == null) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  if (/^[0-6]$/.test(raw)) {
    return raw;
  }
  const lowered = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (CALENDAR_DAY_VARIANTS.has(lowered)) {
    return CALENDAR_DAY_VARIANTS.get(lowered);
  }
  return null;
}

function getCalendarDayMinWidth() {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
  if (viewportWidth <= 420) {
    return 48;
  }
  if (viewportWidth <= 640) {
    return 70;
  }
  if (viewportWidth <= 900) {
    return 90;
  }
  return 120;
}

let calendarResizeListenerAttached = false;

const DEFAULT_BOOKING_SETTINGS = {
  maxStudentsPerSession: 4,
  maxHoursPerSession: 2,
  minSessionMinutes: 60,
  baseSessionCost: 50,
  extraStudentCost: 20,
  sessionSummaryAddOn: 10,
  recurringMaxAdvanceWeeks: 12,
  availability: {
    '0': [],
    '1': [],
    '2': [],
    '3': [],
    '4': [],
    '5': [],
    '6': [{ start: '11:00', end: '16:00' }]
  },
  calendarDisplay: {
    startHour: 8,
    endHour: 20,
    visibleDays: ['0', '1', '2', '3', '4']
  }
};

function deepCloneBookingSettings(settings = DEFAULT_BOOKING_SETTINGS) {
  return JSON.parse(JSON.stringify(settings));
}

function normalizeTimeToMinutes(timeString) {
  if (typeof timeString !== 'string') {
    return null;
  }
  const trimmed = timeString.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return (hours * 60) + minutes;
}

function normalizeAvailabilityBlocks(rawAvailability = {}) {
  const template = deepCloneBookingSettings(DEFAULT_BOOKING_SETTINGS).availability;
  const result = { '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] };

  for (const key of Object.keys(template)) {
    const slots = Array.isArray(rawAvailability[key]) ? rawAvailability[key] : template[key];
    const normalizedSlots = [];

    slots.forEach((slot) => {
      if (Array.isArray(slot) && slot.length === 2) {
        const [startMinutesRaw, endMinutesRaw] = slot;
        const startMinutes = Number(startMinutesRaw);
        const endMinutes = Number(endMinutesRaw);
        if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes) {
          normalizedSlots.push([startMinutes, endMinutes]);
        }
        return;
      }

      const start = normalizeTimeToMinutes(slot?.start ?? slot?.from ?? slot?.begin);
      const end = normalizeTimeToMinutes(slot?.end ?? slot?.to ?? slot?.finish);
      if (start != null && end != null && end > start) {
        normalizedSlots.push([start, end]);
      }
    });

    result[key] = normalizedSlots;
  }

  return result;
}

function normalizeMinuteBlockList(blocks = []) {
  if (!Array.isArray(blocks)) {
    return [];
  }
  const normalized = blocks
    .map((block) => {
      if (!Array.isArray(block) || block.length !== 2) {
        return null;
      }
      const start = Number(block[0]);
      const end = Number(block[1]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return null;
      }
      return [start, end];
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);

  if (!normalized.length) {
    return [];
  }

  const merged = [normalized[0]];
  for (let i = 1; i < normalized.length; i += 1) {
    const [start, end] = normalized[i];
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

function intersectBlockLists(baseBlocks = [], clampBlocks = []) {
  if (!baseBlocks.length) {
    return [];
  }
  if (!clampBlocks.length) {
    return baseBlocks.map(([start, end]) => [start, end]);
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < baseBlocks.length && j < clampBlocks.length) {
    const [aStart, aEnd] = baseBlocks[i];
    const [bStart, bEnd] = clampBlocks[j];
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    if (end > start) {
      result.push([start, end]);
    }
    if (aEnd < bEnd) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return normalizeMinuteBlockList(result);
}

function clampAvailabilityToConfig(rawAvailability = {}, configuredBlocks = {}) {
  const allKeys = new Set([
    ...Object.keys(rawAvailability || {}),
    ...Object.keys(configuredBlocks || {})
  ]);
  const result = {};
  allKeys.forEach((key) => {
    const baseBlocks = normalizeMinuteBlockList(rawAvailability?.[key] || []);
    const clampBlocks = normalizeMinuteBlockList(configuredBlocks?.[key] || []);
    if (clampBlocks.length && baseBlocks.length) {
      result[key] = intersectBlockLists(baseBlocks, clampBlocks);
    } else if (clampBlocks.length) {
      result[key] = clampBlocks.map(([start, end]) => [start, end]);
    } else {
      result[key] = baseBlocks.map(([start, end]) => [start, end]);
    }
  });
  return result;
}

function normalizeBookingSettingsInput(settings = {}) {
  const merged = deepCloneBookingSettings();

  const clamp = (value, def, min, max) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return def;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    return clamped;
  };

  merged.maxStudentsPerSession = clamp(settings.maxStudentsPerSession, merged.maxStudentsPerSession, 1, 8);
  merged.maxHoursPerSession = clamp(settings.maxHoursPerSession, merged.maxHoursPerSession, 1, 6);
  const maxDurationMinutes = Math.max(30, Math.round(merged.maxHoursPerSession * 60));
  const requestedMinMinutes = Number(settings.minSessionMinutes ?? merged.minSessionMinutes ?? DEFAULT_BOOKING_SETTINGS.minSessionMinutes ?? 60);
  if (Number.isFinite(requestedMinMinutes)) {
    const rounded = Math.round(requestedMinMinutes / 15) * 15;
    merged.minSessionMinutes = Math.min(Math.max(rounded, 30), maxDurationMinutes);
  } else {
    const fallbackRounded = Math.round((merged.minSessionMinutes ?? DEFAULT_BOOKING_SETTINGS.minSessionMinutes) / 15) * 15;
    merged.minSessionMinutes = Math.min(Math.max(fallbackRounded, 30), maxDurationMinutes);
  }
  merged.baseSessionCost = Math.max(0, Number(settings.baseSessionCost ?? merged.baseSessionCost));
  merged.extraStudentCost = Math.max(0, Number(settings.extraStudentCost ?? merged.extraStudentCost));
  merged.sessionSummaryAddOn = Math.max(0, Number(settings.sessionSummaryAddOn ?? merged.sessionSummaryAddOn));
  merged.recurringMaxAdvanceWeeks = clamp(settings.recurringMaxAdvanceWeeks, merged.recurringMaxAdvanceWeeks, 1, 52);

  if (settings.availability && typeof settings.availability === 'object') {
    const availabilityClone = deepCloneBookingSettings(DEFAULT_BOOKING_SETTINGS).availability;
    for (const key of Object.keys(availabilityClone)) {
      if (Array.isArray(settings.availability[key])) {
        availabilityClone[key] = JSON.parse(JSON.stringify(settings.availability[key]));
      }
    }
    merged.availability = availabilityClone;
  }

  const defaultCalendarDisplay = DEFAULT_BOOKING_SETTINGS.calendarDisplay || { startHour: 8, endHour: 20, visibleDays: ['0', '1', '2', '3', '4'] };

  const parseCalendarHour = (value, fallback) => {
    const coerced = coerceCalendarHour(value);
    return coerced != null ? coerced : fallback;
  };

  const calendarSource = settings.calendarDisplay || {};
  const visibleDaysInput = Array.isArray(calendarSource.visibleDays)
    ? calendarSource.visibleDays
    : typeof calendarSource.visibleDays === 'string'
      ? calendarSource.visibleDays.split(',').map((value) => value.trim()).filter(Boolean)
      : defaultCalendarDisplay.visibleDays;
  const normalizedVisibleDays = Array.from(new Set(
    visibleDaysInput
      .map((day) => normalizeCalendarDayKey(day))
      .filter((day) => day != null)
  ));
  if (!normalizedVisibleDays.length) {
    defaultCalendarDisplay.visibleDays.forEach((day) => {
      const normalized = normalizeCalendarDayKey(day);
      if (normalized != null) {
        normalizedVisibleDays.push(normalized);
      }
    });
  }
  normalizedVisibleDays.sort((a, b) => Number(a) - Number(b));

  const calendarStartHour = parseCalendarHour(calendarSource.startHour, defaultCalendarDisplay.startHour);
  let calendarEndHour = parseCalendarHour(calendarSource.endHour, defaultCalendarDisplay.endHour);
  if (calendarEndHour <= calendarStartHour) {
    calendarEndHour = Math.min(24, Math.max(calendarStartHour + 1, defaultCalendarDisplay.endHour));
  }

  merged.calendarDisplay = {
    startHour: calendarStartHour,
    endHour: calendarEndHour,
    visibleDays: normalizedVisibleDays
  };

  merged.availabilityBlocks = normalizeAvailabilityBlocks(merged.availability);

  const calendarStartMinutes = merged.calendarDisplay.startHour * 60;
  const calendarEndMinutes = merged.calendarDisplay.endHour * 60;
  Object.keys(merged.availabilityBlocks).forEach((key) => {
    const blocks = Array.isArray(merged.availabilityBlocks[key]) ? merged.availabilityBlocks[key] : [];
    const clampedBlocks = blocks
      .map(([start, end]) => {
        const clampedStart = Math.max(calendarStartMinutes, start);
        const clampedEnd = Math.min(calendarEndMinutes, end);
        return clampedEnd > clampedStart ? [clampedStart, clampedEnd] : null;
      })
      .filter(Boolean);
    merged.availabilityBlocks[key] = normalizeMinuteBlockList(clampedBlocks);
  });

  return merged;
}

// Store the originally selected calendar date for recurring sessions
let originalCalendarDate = null;

function deriveFaqHrefFromContact(contactHref) {
  if (typeof contactHref !== 'string' || !contactHref.trim()) {
    return 'faq.html';
  }
  const trimmed = contactHref.trim();
  const swapped = trimmed.replace(/contact(\.html)?/i, 'faq$1');
  if (swapped !== trimmed) {
    return swapped;
  }
  if (trimmed.endsWith('/')) {
    return `${trimmed}faq.html`;
  }
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash !== -1) {
    return `${trimmed.slice(0, lastSlash + 1)}faq.html`;
  }
  return 'faq.html';
}

function injectFooterFaqLink() {
  const footers = document.querySelectorAll('.site-footer');
  footers.forEach((footer) => {
    if (!footer || footer.dataset.faqLinkInjected === 'true') {
      return;
    }
    const contactLink = footer.querySelector('a[href*="contact"]');
    if (!contactLink) {
      return;
    }
    if (footer.querySelector('[data-footer-link="faq"]')) {
      footer.dataset.faqLinkInjected = 'true';
      return;
    }
    const faqHref = deriveFaqHrefFromContact(contactLink.getAttribute('href'));
    const separator = document.createTextNode(' · ');
    const faqLink = document.createElement('a');
    faqLink.href = faqHref;
    faqLink.textContent = 'FAQ';
    faqLink.setAttribute('data-footer-link', 'faq');
    if (contactLink.className) {
      faqLink.className = contactLink.className;
    }
    contactLink.after(separator, faqLink);
    footer.dataset.faqLinkInjected = 'true';
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // Skip auto-initialization if page has data-no-auto-init attribute
  if (document.body.dataset.noAutoInit !== "true") {
    setupStudentForm();
    setupBookingForm();
  }
  
  setupThemeToggle();
  injectFooterFaqLink();
  // setupCurrentTime();
});

// Setup validation for input fields with patterns
function setupInputValidation(form) {
  if (!form) return;

  const inputs = form.querySelectorAll("input[pattern]");
  
  inputs.forEach((input) => {
    // Remove any existing blur listeners to avoid duplicates
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    newInput.addEventListener("blur", () => {
      if (newInput.value && !newInput.validity.valid) {
        const title = newInput.getAttribute("title") || "Invalid input format.";
        newInput.setCustomValidity(title);
        newInput.reportValidity();
      } else {
        newInput.setCustomValidity("");
      }
    });

    newInput.addEventListener("input", () => {
      newInput.setCustomValidity("");
    });
  });
}

// Theme toggle: persist theme to localStorage and set a class on documentElement
function setupThemeToggle() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  function applyTheme(theme) {
    if (theme === "light") {
      document.documentElement.classList.add("light-theme");
      document.body.classList.add("light-theme");
      toggle.checked = true;
    } else {
      document.documentElement.classList.remove("light-theme");
      document.body.classList.remove("light-theme");
      toggle.checked = false;
    }
  }

  // initialize from localStorage, or auto-detect based on time of day
  let stored = localStorage.getItem("site-theme");
  if (!stored) {
    stored = "dark";  // Default to dark mode
    // Auto-detect: 7am-6:59:59pm = light, 7pm-6:59:59am = dark
    // const now = new Date();
    // const hour = now.getHours();
    // stored = (hour >= 7 && hour < 19) ? "light" : "dark";
  }
  applyTheme(stored);

  toggle.addEventListener("change", () => {
    const next = toggle.checked ? "light" : "dark";
    localStorage.setItem("site-theme", next);
    applyTheme(next);
  });
}

function setupStudentForm() {
  const form = document.getElementById("student-form");
  if (!form) return;

  const msg = document.getElementById("student-form-message");
  const nextSteps = document.getElementById("student-next-steps");
  const independentCb = document.getElementById("independent-student");
  const guardianRow = document.getElementById("guardian-name-row");

  // Add validation for input fields
  setupInputValidation(form);

  // Toggle guardian name requirement
  function updateGuardianVisibility() {
    if (independentCb.checked) {
      guardianRow.style.display = "none";
      guardianRow.querySelector("input").required = false;
    } else {
      guardianRow.style.display = "flex";
      guardianRow.querySelector("input").required = true;
    }
  }
  independentCb.addEventListener("change", updateGuardianVisibility);
  updateGuardianVisibility();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Submitting…";
    msg.className = "form-message";

    const data = Object.fromEntries(new FormData(form).entries());
    data.type = "student_signup";

    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", // Apps Script often needs this; you can adjust later
        body: JSON.stringify(data),
      });

      // We can't reliably read the response with no-cors; just assume success
      msg.textContent = "Thanks! Your student profile has been received.";
      msg.classList.add("ok");
      form.reset();
      updateGuardianVisibility();
      if (nextSteps) nextSteps.classList.remove("hidden");
    } catch (err) {
      console.error(err);
      msg.textContent = "Something went wrong. Please try again or contact me directly.";
      msg.classList.add("error");
    }
  });
}

function setupBookingForm(settingsOverride) {
  const form = document.getElementById("booking-form");
  if (!form) return;

  const bookingSettings = normalizeBookingSettingsInput(settingsOverride || window.bookingSettings || {});
  window.bookingSettings = bookingSettings;
  const baseRatePerHour = bookingSettings.baseSessionCost;
  const extraStudentRatePerHour = bookingSettings.extraStudentCost;
  const summaryAddOnFee = bookingSettings.sessionSummaryAddOn;
  const availabilityBlocks = bookingSettings.availabilityBlocks;
  const maxSessionHours = bookingSettings.maxHoursPerSession;
  const maxRecurringWeeks = bookingSettings.recurringMaxAdvanceWeeks;
  const defaultCalendarDisplay = DEFAULT_BOOKING_SETTINGS.calendarDisplay || { startHour: 8, endHour: 20, visibleDays: ['0', '1', '2', '3', '4'] };
  const calendarDisplay = bookingSettings.calendarDisplay || defaultCalendarDisplay;
  const maxSessionMinutes = Math.max(60, Math.round(maxSessionHours * 60));
  const formatDurationLabel = (hoursValue) => {
    const totalMinutes = Math.max(0, Math.round(hoursValue * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (hours) {
      parts.push(`${hours}h`);
    }
    if (minutes) {
      parts.push(`${minutes}m`);
    }
    return parts.length ? parts.join(' ') : '0m';
  };
  const rawMinMinutes = Number(bookingSettings.minSessionMinutes ?? DEFAULT_BOOKING_SETTINGS.minSessionMinutes ?? 60);
  const normalizedMinMinutes = Number.isFinite(rawMinMinutes) ? Math.round(rawMinMinutes / 15) * 15 : 60;
  const minSessionMinutes = Math.min(Math.max(normalizedMinMinutes, 30), maxSessionMinutes);

  let calendarStartHour = Number(calendarDisplay.startHour);
  if (!Number.isFinite(calendarStartHour)) {
    calendarStartHour = defaultCalendarDisplay.startHour;
  }
  calendarStartHour = Math.max(0, Math.min(23, Math.floor(calendarStartHour)));

  let calendarEndHour = Number(calendarDisplay.endHour);
  if (!Number.isFinite(calendarEndHour)) {
    calendarEndHour = defaultCalendarDisplay.endHour;
  }
  calendarEndHour = Math.max(calendarStartHour + 1, Math.min(24, Math.floor(calendarEndHour)));

  const calendarStartMinutes = calendarStartHour * 60;
  const calendarEndMinutes = calendarEndHour * 60;

  let visibleDayIndices = Array.from(new Set(
    (calendarDisplay.visibleDays || defaultCalendarDisplay.visibleDays)
      .map((day) => normalizeCalendarDayKey(day))
      .map((key) => (key != null ? Number(key) : null))
      .filter((day) => day != null && day >= 0 && day <= 6)
  ));
  if (!visibleDayIndices.length) {
    visibleDayIndices = Array.from(new Set(
      (defaultCalendarDisplay.visibleDays || ['0', '1', '2', '3', '4'])
        .map((day) => normalizeCalendarDayKey(day))
        .map((key) => (key != null ? Number(key) : null))
        .filter((day) => day != null && day >= 0 && day <= 6)
    ));
  }
  visibleDayIndices.sort((a, b) => a - b);
  const visibleDayKeySet = new Set(visibleDayIndices.map((day) => String(day)));

  const durationChoices = (() => {
    const options = [];
    for (let minutes = minSessionMinutes; minutes <= maxSessionMinutes; minutes += 15) {
      const hoursValue = Math.round((minutes / 60) * 100) / 100;
      options.push(hoursValue);
    }
    return options;
  })();
  const durationChoiceFallback = durationChoices.length ? durationChoices[0] : 1;

  const msg = document.getElementById("booking-form-message");
  const numSel = document.getElementById("num-students");
  const studentsWrapper = document.getElementById("student-names-wrapper");
  const recurringCb = document.getElementById("recurring");
  const recurringRow = document.getElementById("recurring-end-row");
  const recurringEndSel = document.getElementById("recurring-end");
  const costDisplay = document.getElementById("cost-display");
  const includeSummaryCb = document.getElementById("include-summary");

  // Add validation for input fields
  setupInputValidation(form);

  // Function to calculate and display cost
  function updateCost() {
    let numStudents = 1;
    if (typeof window.getBookingStudentCount === 'function') {
      const derivedCount = Number(window.getBookingStudentCount());
      if (Number.isFinite(derivedCount) && derivedCount > 0) {
        numStudents = derivedCount;
      }
    } else if (numSel) {
      const parsed = parseInt(numSel.value || "1", 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        numStudents = parsed;
      }
    }
    const durationSelect = document.getElementById("duration-hours");
    const duration = parseFloat(durationSelect?.value || String(durationChoiceFallback));
    const includeSummary = includeSummaryCb ? includeSummaryCb.checked : false;
    const discountSlider = document.getElementById("income-slider");
    const discountAmountSpan = document.getElementById("discount-amount");
    
    // Maximum discount per hour based on number of students
    // 1-2 students: max $10/hr discount
    // 3-4 students: max $20/hr discount
    let maxDiscountPerHour;
    if (numStudents <= 2) {
      maxDiscountPerHour = 10;
    } else {
      maxDiscountPerHour = 20;
    }
    
    // Update slider max based on number of students
    if (discountSlider) {
      const maxSteps = Math.floor(maxDiscountPerHour / 10);
      discountSlider.max = maxSteps;
      // If current value exceeds new max, reset to max
      if (parseInt(discountSlider.value) > maxSteps) {
        discountSlider.value = maxSteps;
      }
    }
    
    // Slider value represents number of $10 decrements
    const discountSteps = discountSlider ? parseInt(discountSlider.value) : 0;
    const discountPerHour = discountSteps * 10;
    const discountAmount = discountPerHour * duration;
    
    // Standard rates: $50 for first student, $20 for each additional student
    const summaryFee = includeSummary ? summaryAddOnFee : 0;
    
    // Calculate standard cost
    const costPerHour = baseRatePerHour + ((numStudents - 1) * extraStudentRatePerHour);
    const standardTotal = (costPerHour * duration) + summaryFee;
    
    // Apply discount
    const discountedTotal = standardTotal - discountAmount;
    
    // Update discount amount display
    if (discountAmountSpan) {
      discountAmountSpan.textContent = discountAmount.toFixed(0);
    }
    
    if (costDisplay) {
      costDisplay.textContent = `Total Cost: $${discountedTotal.toFixed(2)} per session`;
    }
  }

  // Listen for summary checkbox changes
  if (includeSummaryCb) {
    includeSummaryCb.addEventListener('change', updateCost);
  }

  // Listen for sliding scale toggle
  const slidingScaleToggle = document.getElementById("sliding-scale-toggle");
  const slidingScaleRow = document.getElementById("sliding-scale-row");
  if (slidingScaleToggle && slidingScaleRow) {
    slidingScaleToggle.addEventListener('change', () => {
      if (slidingScaleToggle.checked) {
        slidingScaleRow.classList.remove('hidden');
      } else {
        slidingScaleRow.classList.add('hidden');
        // Reset slider to 0 when unchecked
        const incomeSlider = document.getElementById("income-slider");
        if (incomeSlider) {
          incomeSlider.value = 0;
        }
      }
      updateCost();
    });
  }

  // Listen for income slider changes
  const incomeSlider = document.getElementById("income-slider");
  if (incomeSlider) {
    incomeSlider.addEventListener('input', updateCost);
  }

  // Expose recalculation helper for pages that manage student selectors themselves
  window.recalculateBookingCost = updateCost;

  // Ensure the cost display reflects the latest booking settings on initial load
  updateCost();

  // Dynamic student name fields
  function renderStudentFields() {
    const n = parseInt(numSel.value || "1", 10);
    studentsWrapper.innerHTML = "";
    for (let i = 1; i <= n; i++) {
      const div = document.createElement("div");
      div.className = "field-row";
      const label = n === 1 ? "Student's Full Name*" : `Student ${i} Full Name*`;
      div.innerHTML = `
        <label>${label}</label>
        <input type="text" name="student_full_name_${i}" required pattern="^[a-zA-Z][a-zA-Z'-]* [a-zA-Z][a-zA-Z'-]*$" title="Full name must be two words, each with only letters, apostrophes, or dashes." />
      `;
      studentsWrapper.appendChild(div);
    }
    // Setup validation for dynamically added fields
    setupInputValidation(form);
    // Update cost when number of students changes
    updateCost();
  }
  
  if (numSel) {
    numSel.addEventListener("change", renderStudentFields);
    renderStudentFields();
  }

  // Recurring toggle
  if (recurringCb) {
    recurringCb.addEventListener("change", () => {
      recurringRow.style.display = recurringCb.checked ? "flex" : "none";
      if (recurringEndSel) recurringEndSel.required = recurringCb.checked;
      // If the user turns on recurring and a date is already selected, populate options
      if (recurringCb.checked && originalCalendarDate && recurringEndSel) {
        populateRecurringEndOptions(originalCalendarDate);
      }
    });
  }

  // Availability calendar
  const calElem = document.getElementById("availability-calendar");
  const hiddenDate = document.getElementById("selected-date");
  const hiddenStart = document.getElementById("selected-start");
  const durationSel = document.getElementById("duration-hours");
  const startTimeInput = document.getElementById("start-time-input");
  const daySelect = document.getElementById("day-select");
  const weekDisplay = document.getElementById("week-display");
  const prevWeekBtn = document.getElementById("prev-week");
  const nextWeekBtn = document.getElementById("next-week");

  if (daySelect) {
    const previousValue = daySelect.value;
    daySelect.innerHTML = '<option value="">Select day…</option>';
    visibleDayIndices.forEach((dayIdx) => {
      const option = document.createElement('option');
      option.value = String(dayIdx);
      option.textContent = CALENDAR_DAY_LABELS[dayIdx] || `Day ${dayIdx}`;
      daySelect.appendChild(option);
    });
    if (previousValue && visibleDayIndices.includes(Number(previousValue))) {
      daySelect.value = previousValue;
    }
  }

  // Skip calendar setup if essential elements don't exist
  if (!calElem || !hiddenDate || !hiddenStart || !durationSel) {
    return;
  }

  const handleCalendarResize = () => {
    if (!calElem) {
      return;
    }
    const dayCount = Math.max(1, visibleDayIndices.length || 1);
    const timeColumnWidth = 70;
    const minDayWidth = getCalendarDayMinWidth();
    calElem.style.minWidth = `${timeColumnWidth + (dayCount * minDayWidth)}px`;
  };

  if (!calendarResizeListenerAttached) {
    window.addEventListener('resize', handleCalendarResize);
    calendarResizeListenerAttached = true;
  }

  let selectedBlockId = null;
  let selectedBlockElem = null;
  // Show next week if today is Friday, Saturday, or Sunday
  let currentWeekOffset = 0;
  {
    const today = new Date();
    const day = today.getDay(); // 0=Sunday, 5=Friday, 6=Saturday
    if (day === 5 || day === 6 || day === 0) {
      currentWeekOffset = 1;
    }
  }

  function setAvailabilitySource(options = {}) {
    const scriptUrl = (typeof options.scriptUrl === 'string' && (options.scriptUrl.startsWith('http://') || options.scriptUrl.startsWith('https://')))
      ? options.scriptUrl
      : APPS_SCRIPT_URL;
    const calendarId = (typeof options.calendarId === 'string' && options.calendarId.trim()) ? options.calendarId.trim() : null;
    currentAvailabilitySource = { scriptUrl, calendarId };
    currentWeekOffset = 0;
    loadAvailability();
  }

  window.setBookingCalendarSource = setAvailabilitySource;

  function getMondayForOffset(offset = currentWeekOffset) {
    const base = new Date();
    const day = base.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    base.setDate(base.getDate() + diff + (offset * 7));
    base.setHours(0, 0, 0, 0);
    return base;
  }

  function getDateForDayIndex(dayIdx, offset = currentWeekOffset) {
    const monday = getMondayForOffset(offset);
    const target = new Date(monday);
    target.setDate(monday.getDate() + dayIdx);
    return target;
  }

  function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Function to populate start time dropdown with 15-minute intervals
  function populateStartTimeOptions() {
    if (!startTimeInput) return;
    startTimeInput.innerHTML = '<option value="">Select start time…</option>';
    const minDurationMinutes = Math.round(durationChoiceFallback * 60);

    const startMinutesSet = new Set();

    Object.entries(availabilityBlocks || {}).forEach(([dayKey, blocks]) => {
      if (!visibleDayKeySet.has(String(dayKey)) || !Array.isArray(blocks)) {
        return;
      }
      blocks.forEach(([start, end]) => {
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          return;
        }
        const clampedStart = Math.max(calendarStartMinutes, start);
        const clampedEnd = Math.min(calendarEndMinutes, end);
        if (clampedEnd <= clampedStart) {
          return;
        }
        for (let minute = clampedStart; minute + minDurationMinutes <= clampedEnd; minute += 15) {
          const rounded = minute - (minute % 15);
          startMinutesSet.add(rounded);
        }
      });
    });

    if (!startMinutesSet.size) {
      for (let minute = calendarStartMinutes; minute + minDurationMinutes <= calendarEndMinutes; minute += 15) {
        const rounded = minute - (minute % 15);
        startMinutesSet.add(rounded);
      }
    }

    const sortedStartMinutes = Array.from(startMinutesSet).sort((a, b) => a - b);

    sortedStartMinutes.forEach((totalMinutes) => {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const ampm = hours >= 12 ? 'pm' : 'am';
      const displayHour = hours % 12 || 12;
      const displayMinutes = String(minutes).padStart(2, '0');
      const option = document.createElement('option');
      option.value = `${String(hours).padStart(2, '0')}:${displayMinutes}`;
      option.textContent = minutes === 0
        ? `${displayHour}:00${ampm}`
        : `${displayHour}:${displayMinutes}${ampm}`;
      startTimeInput.appendChild(option);
    });
  }

  // Function to update start time availability based on selected day
  function updateStartTimeAvailability() {
    if (!startTimeInput || !daySelect) return;
    
    const selectedDay = parseInt(daySelect.value);
    if (isNaN(selectedDay)) {
      // No day selected, enable all times
      Array.from(startTimeInput.options).forEach(opt => {
        if (opt.value) opt.disabled = false;
      });
      return;
    }

    // Get the selected duration (default to 1 hour if not selected)
    const fallbackDuration = durationChoiceFallback;
    const durationHours = durationSel
      ? parseFloat(durationSel.value || String(fallbackDuration))
      : fallbackDuration;
    const durationMin = Math.round(durationHours * 60);

    // Get available and booked blocks for the selected day
    const availableBlocks = getBlocksForDay(demoAvailable, selectedDay);
    const bookedBlocks = getBlocksForDay(demoBooked, selectedDay);
    
    // Update each time option
    Array.from(startTimeInput.options).forEach(opt => {
      if (!opt.value) {
        opt.disabled = false;
        return;
      }
      
      const [h, m] = opt.value.split(':').map(Number);
      const startMin = h * 60 + m;
      const endMin = startMin + durationMin;
      
      // Check if this time slot fits within available blocks
      const fitsInAvailable = availableBlocks.some(([s, e]) => s <= startMin && e >= endMin);
      
      // Check if this time slot conflicts with any bookings
      const hasConflict = bookedBlocks.some(([bs, be]) => {
        // Check if there's any overlap between requested time and booked time
        return !(be <= startMin || bs >= endMin);
      });
      
      // Time is available if it fits in available blocks AND has no conflicts
      opt.disabled = !fitsInAvailable || hasConflict;
    });
  }

  // Function to update day availability based on selected start time
  function updateDayAvailability() {
    if (!daySelect || !startTimeInput) return;
    
    const startTime = startTimeInput.value;
    if (!startTime) {
      // No time selected, enable all days
      Array.from(daySelect.options).forEach(opt => {
        if (opt.value) opt.disabled = false;
      });
      return;
    }

    const [h, m] = startTime.split(':').map(Number);
    const timeMin = h * 60 + m;
    const fallbackDuration = durationChoiceFallback;
    const durationHours = durationSel
      ? parseFloat(durationSel.value || String(fallbackDuration))
      : fallbackDuration;
    const endMin = timeMin + Math.round(durationHours * 60);
    
    // Update each day option
    Array.from(daySelect.options).forEach(opt => {
      if (!opt.value) {
        opt.disabled = false;
        return;
      }
      
      const dayIdx = parseInt(opt.value);
      const blocks = getBlocksForDay(demoAvailable, dayIdx);
      
      // Check if this time slot has at least 1 hour available on this day
      const isAvailable = blocks.some(([s, e]) => s <= timeMin && e >= endMin);
      opt.disabled = !isAvailable;
    });
  }

  // Function to update end time options based on start time
  function updateEndTimeOptions(startTime) {
    if (!startTime) return;
    
    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    
    // Clear and rebuild options
    durationSel.innerHTML = '<option value="">Select end time…</option>';
    
    const durations = durationChoices;
    durations.forEach((dur) => {
      const endMinutes = startMinutes + (dur * 60);
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      
      // Format with AM/PM
      const ampm = endHours >= 12 ? 'pm' : 'am';
      const displayHours = endHours % 12 || 12;
      const endTimeStr = endMins === 0 
        ? `${displayHours}:00${ampm}` 
        : `${displayHours}:${String(endMins).padStart(2, '0')}${ampm}`;
      
      // Format duration text
      const durationText = formatDurationLabel(dur);
      
      const option = document.createElement('option');
      option.value = String(dur);
      option.textContent = `${endTimeStr} (${durationText})`;
      durationSel.appendChild(option);
    });
    
    // Select first option by default (minimum session length)
    if (durationSel.options.length > 1) {
      durationSel.selectedIndex = 1;
    }
  }

  // Populate start time options on load
  populateStartTimeOptions();

  // Listen to start time changes to update the calendar label
  if (startTimeInput) {
    startTimeInput.addEventListener('change', () => {
      const startTime = startTimeInput.value;
      updateEndTimeOptions(startTime);
      updateDayAvailability();

      const selectedDay = daySelect ? parseInt(daySelect.value) : NaN;
      if (isNaN(selectedDay) || !startTime) {
        selectedBlockId = null;
        selectedBlockElem = null;
        return;
      }

      const [startHour, startMinute] = startTime.split(':').map(Number);
      const startTotalMinutes = (startHour * 60) + (startMinute || 0);

      // Clear previous selection overlays
      calElem.querySelectorAll('.av-slot.selected').forEach((el) => {
        el.classList.remove('selected');
        el.textContent = '';
        const overlay = el.querySelector('.selection-overlay');
        if (overlay) overlay.remove();
      });

      const newBlockId = `${selectedDay}-${startHour}`;
      const newBlock = calElem.querySelector(`[data-block-id="${newBlockId}"]`);

      const targetDate = getDateForDayIndex(selectedDay);
      originalCalendarDate = targetDate;
      hiddenDate.value = formatDateForInput(targetDate);
      hiddenStart.value = startTime;

      updateDurationOptions(selectedDay, startTotalMinutes);

      if (newBlock && newBlock.classList.contains('available')) {
        newBlock.classList.add('selected');
        selectedBlockId = newBlockId;
        selectedBlockElem = newBlock;
      } else {
        selectedBlockId = null;
        selectedBlockElem = null;
      }

      if (durationSel.value) {
        durationSel.dispatchEvent(new Event('change'));
      } else {
        updateCost();
      }

      if (recurringCb && recurringCb.checked) {
        populateRecurringEndOptions(targetDate);
      }
    });
  }

  // Listen to day changes to update the calendar selection
  if (daySelect) {
    daySelect.addEventListener('change', () => {
      // Update start time availability based on selected day
      updateStartTimeAvailability();
      
      const selectedDay = parseInt(daySelect.value);
      if (isNaN(selectedDay)) return;

      // Get the start time (hour only for matching)
      const startTime = startTimeInput ? startTimeInput.value : hiddenStart.value;
      if (!startTime) return;

      const [startHour, startMinute] = startTime.split(':').map(Number);
      const startTotalMinutes = (startHour * 60) + (startMinute || 0);

      // Clear previous selection
      calElem.querySelectorAll('.av-slot.selected').forEach((el) => {
        el.classList.remove('selected');
        el.textContent = '';
        const overlay = el.querySelector('.selection-overlay');
        if (overlay) overlay.remove();
      });

      // Find and select the matching cell
      const newBlockId = `${selectedDay}-${startHour}`;
      const newBlock = calElem.querySelector(`[data-block-id="${newBlockId}"]`);

      const targetDate = getDateForDayIndex(selectedDay);
      originalCalendarDate = targetDate;
      hiddenDate.value = formatDateForInput(targetDate);
      hiddenStart.value = startTime;

      updateDurationOptions(selectedDay, startTotalMinutes);

      if (newBlock && newBlock.classList.contains('available')) {
        newBlock.classList.add('selected');
        selectedBlockId = newBlockId;
        selectedBlockElem = newBlock;
      } else {
        selectedBlockId = null;
        selectedBlockElem = null;
      }

      if (durationSel.value) {
        durationSel.dispatchEvent(new Event('change'));
      } else {
        updateCost();
      }

      if (recurringCb && recurringCb.checked) {
        populateRecurringEndOptions(targetDate);
      }
    });
  }

  // Mock existing bookings. Replace with server data later.
  // Each booking is [startMin, endMin] relative to day (0=Mon) and minute-of-day.
  // Example: Tuesday (1) has a booking 14:00-15:00
  // This will be populated by loadAvailability() from Apps Script
  let demoBooked = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };

  // To let updateDurationOptions look at available blocks we keep demoAvailable
  // in an outer variable and fill it later in loadAvailability().
  const baseAvailabilityMap = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: []
  };

  Object.entries(availabilityBlocks).forEach(([key, slots]) => {
    const idx = Number(key);
    if (Number.isNaN(idx) || !Array.isArray(slots)) {
      return;
    }
    baseAvailabilityMap[idx] = slots.map(([start, end]) => [start, end]);
  });

  let demoAvailable = { ...baseAvailabilityMap };
  let currentAvailabilitySource = { scriptUrl: APPS_SCRIPT_URL, calendarId: null };

  const getBlocksForDay = (collection, dayIdx) => {
    if (!collection) {
      return [];
    }
    const direct = collection[dayIdx];
    if (Array.isArray(direct)) {
      return direct;
    }
    const stringKey = String(dayIdx);
    const stringValue = collection[stringKey];
    return Array.isArray(stringValue) ? stringValue : [];
  };

  // Compute which durations are valid for the selected start time.
  function updateDurationOptions(dayIdx, startMin) {
    if (dayIdx == null || startMin == null || Number.isNaN(startMin)) return;

    // Build availability for that day from demoAvailable
    const blocks = getBlocksForDay(demoAvailable, dayIdx);

    // A helper to test if a requested endMin is within any availability block
    function withinAvailability(endMin) {
      return blocks.some(([s, e]) => s <= startMin && e >= endMin);
    }

    // A helper to test if [startMin, endMin) overlaps any booked session
    const booked = getBlocksForDay(demoBooked, dayIdx);
    function overlapsBooked(endMin) {
      return booked.some(([bs, be]) => !(be <= startMin || bs >= endMin));
    }

    // Update each duration option
    Array.from(durationSel.options).forEach((opt) => {
      if (!opt.value) {
        // Keep placeholder enabled
        opt.disabled = false;
        return;
      }
      const durHours = parseFloat(opt.value);
      const endMin = startMin + Math.round(durHours * 60);

      const ok = withinAvailability(endMin) && !overlapsBooked(endMin);
      opt.disabled = !ok;
    });

    // If current selection is now disabled, clear it
    if (durationSel.options[durationSel.selectedIndex] && durationSel.options[durationSel.selectedIndex].disabled) {
      durationSel.value = "";
    }
  }

  function resetDurationOptions() {
    Array.from(durationSel.options).forEach((opt) => (opt.disabled = false));
    // Default to minimum duration when clearing/resetting
    if (durationChoices.length) {
      durationSel.value = String(durationChoiceFallback);
    }
    // Restore selected block label and clear selection
    if (selectedBlockElem) {
      selectedBlockElem.textContent = "Available";
      selectedBlockElem.classList.remove("selected");
      selectedBlockElem = null;
    }
    selectedBlockId = null;
  }

  // Update the selected block label when duration changes
  durationSel.addEventListener("change", () => {
    const val = durationSel.value;

    // Update cost and availability even if no calendar block is selected
    updateCost();
    updateStartTimeAvailability();
    updateDayAvailability();

    if (recurringCb && recurringCb.checked && originalCalendarDate) {
      populateRecurringEndOptions(originalCalendarDate);
    }

    if (!selectedBlockElem || !selectedBlockId) return;

    if (!val) {
      const overlay = selectedBlockElem.querySelector('.selection-overlay');
      if (overlay) overlay.remove();
      return;
    }

    const durHours = parseFloat(val);
    if (isNaN(durHours)) {
      const overlay = selectedBlockElem.querySelector('.selection-overlay');
      if (overlay) overlay.remove();
      return;
    }

    // Get start time from dropdown
    const startTime = startTimeInput ? startTimeInput.value : hiddenStart.value;
    if (!startTime) return;

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startMin = startHour * 60 + (startMinute || 0);
    const endMin = startMin + Math.round(durHours * 60);

    function fmt(min) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      const ampm = h >= 12 ? "pm" : "am";
      const hr12 = h % 12 || 12;
      return m === 0 ? `${hr12}${ampm}` : `${hr12}:${String(m).padStart(2, "0")}${ampm}`;
    }

    const labelText = `${fmt(startMin)} - ${fmt(endMin)}`;
    
    // Calculate which hour cell to start in and the fractional offset
    const startHourCell = Math.floor(startMin / 60); // Which hour row (e.g., 11 for 11:45)
    const startMinuteInHour = startMin % 60; // Minutes within that hour (e.g., 45 for 11:45)
    const startFraction = startMinuteInHour / 60; // 0 to 1 (e.g., 0.75 for 45 minutes)
    
    const endHourCell = Math.floor(endMin / 60);
    const endMinuteInHour = endMin % 60;
    const endFraction = endMinuteInHour / 60;
    
    // Remove existing overlay if any
    let overlay = selectedBlockElem.querySelector('.selection-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'selection-overlay';
      selectedBlockElem.appendChild(overlay);
    }
    
    // Position overlay based on start minute within the hour cell
    overlay.style.position = 'absolute';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.top = `${startFraction * 100}%`;
    
    // Calculate height based on how many cells it spans
    const cellHeight = selectedBlockElem.offsetHeight || 50;
    
    if (startHourCell === endHourCell) {
      // Starts and ends in same hour - just show the fraction
      overlay.style.height = `${(endFraction - startFraction) * cellHeight}px`;
    } else {
      // Spans multiple hours
      // Height = remainder of start hour + full middle hours + fraction of end hour
      const remainderOfStartHour = (1 - startFraction) * cellHeight;
      const fullMiddleHours = (endHourCell - startHourCell - 1) * cellHeight;
      const fractionOfEndHour = endFraction * cellHeight;
      overlay.style.height = `${remainderOfStartHour + fullMiddleHours + fractionOfEndHour}px`;
    }
    
    overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.8)';
    overlay.style.borderRadius = '4px';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.color = 'white';
    overlay.style.fontSize = '0.85rem';
    overlay.style.fontWeight = '500';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '10';
    overlay.textContent = labelText;
  });

  // Populate the recurring-end select with weekly dates starting from the week after baseDate
  async function populateRecurringEndOptions(baseDate) {
    if (!recurringEndSel || !baseDate) return;
    
    console.log('populateRecurringEndOptions called with baseDate:', baseDate);
    console.log('Stack trace:', new Error().stack);
    
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const startDate = new Date(baseDate);
    
    // Get the selected time and duration for conflict checking
    const startTime = hiddenStart.value;
    const selectedDuration = durationSel.value ? parseFloat(durationSel.value) : 1;
    
    // Calculate start and end minutes for conflict detection
    let startMin = 0;
    let endMin = 0;
    if (startTime) {
      const [startHour, startMinute] = startTime.split(':').map(Number);
      startMin = startHour * 60 + (startMinute || 0);
      endMin = startMin + Math.round(selectedDuration * 60);
    }
    
    // Get day index for conflict checking
    const dayOfWeek = startDate.getDay();
    const dayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to 0=Mon, 1=Tue, etc.
    
    console.log('Base date:', startDate, 'Day of week:', dayOfWeek, 'dayIdx:', dayIdx);
    
    // Show loading message
    recurringEndSel.innerHTML = '<option value="">Loading availability...</option>';
    recurringEndSel.disabled = true;
    
    // Load availability data for relevant weeks (batch request)
    const availabilityCache = {};
    
    const today = new Date();
    const todayMonday = new Date(today);
    const todayDayOfWeek = todayMonday.getDay();
    const todayDiff = (todayDayOfWeek === 0 ? -6 : 1) - todayDayOfWeek;
    todayMonday.setDate(todayMonday.getDate() + todayDiff);
    todayMonday.setHours(0, 0, 0, 0);
    
    // Limit recurring choices to the configured number of weeks (1-52 safe range)
    const recurringWeeksLimit = Math.max(1, Math.min(Math.round(maxRecurringWeeks) || 1, 52));

    // Calculate next occurrence of the same day (1 week from baseDate)
    const nextWeekDate = new Date(baseDate);
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    
    console.log('Next week date:', nextWeekDate, 'Day of week:', nextWeekDate.getDay());
    
    // Determine unique weeks we need to check (respecting configured limit)
    const weeksToFetch = new Set();
    const weekToDateMap = {};
    
    for (let i = 1; i <= recurringWeeksLimit; i++) {
      const checkDate = new Date(nextWeekDate);
      checkDate.setDate(nextWeekDate.getDate() + (i - 1) * 7);
      const checkMonday = new Date(checkDate);
      const checkDayOfWeek = checkMonday.getDay();
      const checkDiff = (checkDayOfWeek === 0 ? -6 : 1) - checkDayOfWeek;
      checkMonday.setDate(checkMonday.getDate() + checkDiff);
      checkMonday.setHours(0, 0, 0, 0);
      const weekOffset = Math.floor((checkMonday - todayMonday) / (7 * 24 * 60 * 60 * 1000));
      weeksToFetch.add(weekOffset);
      weekToDateMap[weekOffset] = weekToDateMap[weekOffset] || [];
      weekToDateMap[weekOffset].push(i);
    }
    
    console.log('Fetching', weeksToFetch.size, 'weeks of availability data');
    
    // Fetch all needed weeks' availability (with longer timeout and in parallel batches)
    try {
      const batchSize = 10;
      const weekArray = Array.from(weeksToFetch);
      
      for (let batchStart = 0; batchStart < weekArray.length; batchStart += batchSize) {
        const batch = weekArray.slice(batchStart, batchStart + batchSize);
        
        await Promise.all(batch.map(weekOffset => {
          return new Promise(async (resolve) => {
            try {
              const callbackName = 'availCallback' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
              const url = `${APPS_SCRIPT_URL}?action=getAvailability&weekOffset=${weekOffset}&callback=${callbackName}`;
              
              const data = await new Promise((resolveInner, rejectInner) => {
                window[callbackName] = (data) => {
                  delete window[callbackName];
                  resolveInner(data);
                };
                
                const script = document.createElement('script');
                script.src = url;
                script.onerror = () => {
                  delete window[callbackName];
                  rejectInner(new Error('Failed to load'));
                };
                
                document.head.appendChild(script);
                
                setTimeout(() => {
                  if (script.parentNode) document.head.removeChild(script);
                }, 200);
                
                setTimeout(() => {
                  if (window[callbackName]) {
                    delete window[callbackName];
                    rejectInner(new Error('Timeout'));
                  }
                }, 10000); // 10 second timeout per request
              });
              
              if (data.success) {
                availabilityCache[weekOffset] = data.booked || {};
              }
              resolve();
            } catch (error) {
              console.warn('Failed to load week', weekOffset, error);
              resolve(); // Continue even if one fails
            }
          });
        }));
      }
      
      console.log('Loaded availability for', Object.keys(availabilityCache).length, 'weeks');
    } catch (error) {
      console.error('Error loading availability for recurring dates:', error);
    }
    
    // Now populate the options with conflict detection
    recurringEndSel.innerHTML = '<option value="">Choose last date…</option>';
    recurringEndSel.disabled = false;
    
    let lastOptionIndex = 1;

    // Get the day name directly from the baseDate (which is already a proper Date object)
    const dayName = days[startDate.getDay()];
    console.log('Day name for display:', dayName, 'from baseDate.getDay():', startDate.getDay());

    for (let i = 1; i <= recurringWeeksLimit; i++) {
      // Calculate date: add (i-1) weeks to the next week's date
      const d = new Date(nextWeekDate);
      d.setDate(nextWeekDate.getDate() + (i - 1) * 7);
      const monthName = months[d.getMonth()];
      const dateNum = d.getDate();
      const year = d.getFullYear();

      // Calculate which week this date falls in
      const checkMonday = new Date(d);
      const checkDayOfWeek = checkMonday.getDay();
      const checkDiff = (checkDayOfWeek === 0 ? -6 : 1) - checkDayOfWeek;
      checkMonday.setDate(checkMonday.getDate() + checkDiff);
      checkMonday.setHours(0, 0, 0, 0);
      const weekOffset = Math.floor((checkMonday - todayMonday) / (7 * 24 * 60 * 60 * 1000));
      
      // Check if this date has a conflict with existing bookings
      let hasConflict = false;
      if (startTime && availabilityCache[weekOffset]) {
        const bookedSlots = availabilityCache[weekOffset][dayIdx] || [];
        hasConflict = bookedSlots.some(([bs, be]) => {
          // Check if there's any overlap
          return !(be <= startMin || bs >= endMin);
        });
        
        if (hasConflict) {
          console.log(`Conflict on ${dayName} ${monthName} ${dateNum}: booked slots overlap with ${startMin}-${endMin}`);
          // Stop at first conflict - don't show any dates after this
          break;
        }
      }

      const label = `${dayName}, ${monthName} ${dateNum}, ${year} (${i})`;
      const opt = document.createElement('option');
      // Use local date formatting to avoid timezone conversion
      const optYear = d.getFullYear();
      const optMonth = String(d.getMonth() + 1).padStart(2, '0');
      const optDay = String(d.getDate()).padStart(2, '0');
      opt.value = `${optYear}-${optMonth}-${optDay}`;
      opt.textContent = label;
      
      recurringEndSel.appendChild(opt);
      lastOptionIndex = recurringEndSel.options.length - 1;
    }

    // Select the FIRST available option by default (1 week) instead of the furthest allowed week
    // This also fixes the auto-reset bug where it kept jumping back to (20)
    if (recurringEndSel.options.length > 1) {
      recurringEndSel.selectedIndex = 1; // Index 1 is the first date option (0 is placeholder)
    }
  }

  function buildAvailabilityUrl(includeCallback = false) {
    const source = currentAvailabilitySource || {};
    const baseUrl = source.scriptUrl || APPS_SCRIPT_URL;
    const urlObj = new URL(baseUrl);
    urlObj.searchParams.set('action', 'getAvailability');
    urlObj.searchParams.set('weekOffset', currentWeekOffset);
    if (source.calendarId) {
      urlObj.searchParams.set('calendarId', source.calendarId);
    }
    let callbackName = null;
    if (includeCallback) {
      callbackName = 'handleAvailabilityResponse' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      urlObj.searchParams.set('callback', callbackName);
    }
    return { url: urlObj.toString(), callbackName };
  }

  async function fetchAvailabilityViaHttp(url) {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      return response.json();
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (parseError) {
      throw new Error(`Unexpected response format: ${parseError.message}`);
    }
  }

  function fetchAvailabilityViaJsonp(url, callbackName) {
    return new Promise((resolve, reject) => {
      window[callbackName] = (data) => {
        console.log('Received availability data (JSONP):', data);
        delete window[callbackName];
        resolve(data);
      };

      const script = document.createElement('script');
      script.src = url;
      script.onerror = (error) => {
        console.error('Script loading error:', error);
        delete window[callbackName];
        reject(new Error('Failed to load availability data'));
      };

      document.head.appendChild(script);

      script.onload = () => {
        setTimeout(() => {
          if (script.parentNode) {
            document.head.removeChild(script);
          }
        }, 100);
      };

      setTimeout(() => {
        if (window[callbackName]) {
          console.error('Request timeout after 10 seconds');
          delete window[callbackName];
          if (script.parentNode) {
            document.head.removeChild(script);
          }
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  async function loadAvailability(retryCount = 0) {
    try {
      const { url: fetchUrl } = buildAvailabilityUrl(false);
      console.log('Loading availability from:', fetchUrl, 'Attempt:', retryCount + 1, '(fetch first)');

      let data = null;
      try {
        data = await fetchAvailabilityViaHttp(fetchUrl);
      } catch (fetchError) {
        console.warn('Fetch availability failed, falling back to JSONP', fetchError);
        const { url: jsonpUrl, callbackName } = buildAvailabilityUrl(true);
        data = await fetchAvailabilityViaJsonp(jsonpUrl, callbackName);
      }

      if (!data || !data.success) {
        throw new Error((data && data.message) || 'Failed to load availability');
      }

      const configuredBlocks = (window.bookingSettings && window.bookingSettings.availabilityBlocks) || {};

      // Populate demoAvailable and demoBooked from server response and clamp to configured availability
      demoAvailable = clampAvailabilityToConfig(data.available || {}, configuredBlocks);
      demoBooked = data.booked || {};

      const allDayKeys = new Set([
        ...Object.keys(configuredBlocks || {}),
        ...Object.keys(demoAvailable || {}),
        ...Object.keys(demoBooked || {})
      ]);

      allDayKeys.forEach((dayKey) => {
        if (!demoAvailable[dayKey]) {
          demoAvailable[dayKey] = normalizeMinuteBlockList(configuredBlocks?.[dayKey] || []);
        }
        if (!demoBooked[dayKey]) {
          demoBooked[dayKey] = [];
        }
      });
      
      console.log('Available slots:', demoAvailable);
      console.log('Booked slots:', demoBooked);
      
      // Calculate the Monday of the current week offset
      const today = new Date();
      const monday = new Date(today);
      const day = monday.getDay();
      const diff = (day === 0 ? -6 : 1) - day; // Monday of current week
      monday.setDate(today.getDate() + diff + (currentWeekOffset * 7));
      
      // Format date as DD/MM/YYYY for display
      const displayDate = `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}/${monday.getFullYear()}`;
      if (weekDisplay) weekDisplay.textContent = `Week of ${displayDate}`;
      
      // Disable "Previous Week" button if viewing current week
      if (prevWeekBtn) {
        prevWeekBtn.disabled = (currentWeekOffset === 0);
        prevWeekBtn.style.opacity = (currentWeekOffset === 0) ? '0.5' : '1';
        prevWeekBtn.style.cursor = (currentWeekOffset === 0) ? 'not-allowed' : 'pointer';
      }

      // Render the calendar
      renderCalendar(monday);
      updateStartTimeAvailability();
      updateDayAvailability();
      
    } catch (error) {
      console.error('Error loading availability:', error);
      
      // Retry up to 2 times with exponential backoff
      if (retryCount < 2) {
        console.log(`Retrying in ${(retryCount + 1) * 2} seconds...`);
        setTimeout(() => {
          loadAvailability(retryCount + 1);
        }, (retryCount + 1) * 2000);
        return;
      }
      
      // After retries exhausted, show user-friendly message
      const errorMessage = 'The calendar is taking longer than expected to load. Please wait a moment and refresh the page. If the issue persists, you can still book by selecting a date and time from the dropdowns below.';
      
      if (calElem) {
        calElem.innerHTML = `
          <div style="padding: 2rem; text-align: center; background: rgba(255, 165, 0, 0.1); border-radius: 8px; border: 1px solid rgba(255, 165, 0, 0.3);">
            <p style="margin: 0; color: #ffaa00; font-weight: 600;">⚠️ Calendar Loading Issue</p>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem;">${errorMessage}</p>
            <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4f9dff; color: white; border: none; border-radius: 4px; cursor: pointer;">Refresh Page</button>
          </div>
        `;
      }
      
      // Fallback to empty availability on error
      demoAvailable = {
        0: [],
        1: [],
        2: [],
        3: [],
        4: [],
        5: [],
        6: [[11 * 60, 16 * 60]],
      };
      demoBooked = {
        0: [],
        1: [],
        2: [],
        3: [],
        4: [],
        5: [],
        6: [],
      };
      
      // Still update week display
      const today = new Date();
      const monday = new Date(today);
      const day = monday.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      monday.setDate(today.getDate() + diff + (currentWeekOffset * 7));
      
      const displayDate = `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}/${monday.getFullYear()}`;
      if (weekDisplay) weekDisplay.textContent = `Week of ${displayDate}`;
      
      if (prevWeekBtn) {
        prevWeekBtn.disabled = (currentWeekOffset === 0);
        prevWeekBtn.style.opacity = (currentWeekOffset === 0) ? '0.5' : '1';
        prevWeekBtn.style.cursor = (currentWeekOffset === 0) ? 'not-allowed' : 'pointer';
      }

      updateStartTimeAvailability();
      updateDayAvailability();
    }
  }
  
  function renderCalendar(monday) {
    calElem.innerHTML = "";

    const dayCount = Math.max(1, visibleDayIndices.length || 1);
    const timeColumnWidth = 70;
    const minDayWidth = getCalendarDayMinWidth();
    calElem.style.minWidth = `${timeColumnWidth + (dayCount * minDayWidth)}px`;
    const columnTemplate = `70px repeat(${dayCount}, minmax(${minDayWidth}px, 1fr))`;

    const headerRow = document.createElement("div");
    headerRow.className = "av-row";
    headerRow.style.gridTemplateColumns = columnTemplate;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let headerHTML = `<div></div>`;
    visibleDayIndices.forEach((dayIdx) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + dayIdx);
      date.setHours(0, 0, 0, 0);
      const dayName = CALENDAR_DAY_SHORT_LABELS[dayIdx] || `Day ${dayIdx}`;
      const dateNum = date.getDate();
      const isToday = date.getTime() === today.getTime();
      const isPast = date < today;

      const dayStyle = isToday ? 'color: #4f9dff; font-weight: 600;' : (isPast ? 'opacity: 0.4;' : '');
      const dateStyle = isToday
        ? 'background: #4f9dff; color: white; font-weight: 700; padding: 4px 8px; border-radius: 50%; display: inline-block; min-width: 32px;'
        : (isPast ? 'font-weight: 600; opacity: 0.4;' : 'font-weight: 600;');

      headerHTML += `<div class="av-row-header"><span style="font-size: 0.7rem; ${dayStyle}">${dayName}</span><br/><span style="font-size: 1.2rem; ${dateStyle}">${dateNum}</span></div>`;
    });
    headerRow.innerHTML = headerHTML;
    calElem.appendChild(headerRow);

    for (let h = calendarStartHour; h < calendarEndHour; h++) {
      const row = document.createElement("div");
      row.className = "av-row";
      row.style.gridTemplateColumns = columnTemplate;

      const label = document.createElement("div");
      label.className = "av-time-label";
      label.textContent = `${formatHour(h)}:00`;
      row.appendChild(label);

      visibleDayIndices.forEach((dayIdx) => {
        const cell = document.createElement("div");
        cell.className = "av-slot";

        const date = new Date(monday);
        date.setDate(monday.getDate() + dayIdx);
        date.setHours(0, 0, 0, 0);
        const isPast = date < today;

        if (isPast) {
          cell.style.opacity = '0.3';
          cell.style.cursor = 'not-allowed';
          cell.style.background = '#333';
          row.appendChild(cell);
          return;
        }

        const blocks = getBlocksForDay(demoAvailable, dayIdx);
        const bookedBlocks = getBlocksForDay(demoBooked, dayIdx);
        const startMin = h * 60;
        const endMin = (h + 1) * 60;

        const potentialOffsets = [0, 15, 30, 45];
        const hasSelectableStart = potentialOffsets.some((offset) => {
          const candidateStart = startMin + offset;
          const candidateEnd = candidateStart + 60;
          if (candidateStart < calendarStartMinutes || candidateEnd > calendarEndMinutes) {
            return false;
          }
          const fitsAvailability = blocks.some(([s, e]) => s <= candidateStart && e >= candidateEnd);
          if (!fitsAvailability) {
            return false;
          }
          const overlapsBooking = bookedBlocks.some(([bs, be]) => !(be <= candidateStart || bs >= candidateEnd));
          return !overlapsBooking;
        });

        cell.dataset.dayIdx = String(dayIdx);
        cell.dataset.hour = h;
        cell.style.position = 'relative';

        if (hasSelectableStart) {
          cell.classList.add('available');
          const blockId = `${dayIdx}-${h}`;
          cell.dataset.blockId = blockId;
          cell.addEventListener("click", (e) => {
            const latestBlocks = getBlocksForDay(demoAvailable, dayIdx);
            const latestBooked = getBlocksForDay(demoBooked, dayIdx);

            const rect = cell.getBoundingClientRect();
            const clickY = e.clientY - rect.top;
            const cellHeight = rect.height;
            const clickRatio = cellHeight ? (clickY / cellHeight) : 0;

            let minutes = 0;
            if (clickRatio < 0.25) {
              minutes = 0;
            } else if (clickRatio < 0.5) {
              minutes = 15;
            } else if (clickRatio < 0.75) {
              minutes = 30;
            } else {
              minutes = 45;
            }

            const clickStartMin = h * 60 + minutes;
            const minEndMin = clickStartMin + 60;

            if (clickStartMin < calendarStartMinutes || minEndMin > calendarEndMinutes) {
              return;
            }

            const fitsInAvailable = latestBlocks.some(([s, e]) => s <= clickStartMin && e >= minEndMin);
            if (!fitsInAvailable) {
              return;
            }

            const hasConflict = latestBooked.some(([bs, be]) => !(be <= clickStartMin || bs >= minEndMin));
            if (hasConflict) {
              return;
            }

            calElem.querySelectorAll('.av-slot.selected').forEach((el) => {
              el.classList.remove('selected');
              el.textContent = '';
              const overlay = el.querySelector('.selection-overlay');
              if (overlay) overlay.remove();
            });

            cell.classList.add('selected');
            selectedBlockId = blockId;
            selectedBlockElem = cell;

            Array.from(durationSel.options).forEach((opt) => (opt.disabled = false));

            const selectionDate = new Date(monday);
            selectionDate.setDate(monday.getDate() + dayIdx);
            originalCalendarDate = selectionDate;
            const year = selectionDate.getFullYear();
            const month = String(selectionDate.getMonth() + 1).padStart(2, '0');
            const day = String(selectionDate.getDate()).padStart(2, '0');
            hiddenDate.value = `${year}-${month}-${day}`;
            const timeStr = `${String(h).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            hiddenStart.value = timeStr;

            if (daySelect) {
              daySelect.value = String(dayIdx);
            }

            if (startTimeInput) {
              startTimeInput.value = timeStr;
              updateEndTimeOptions(timeStr);
              updateDayAvailability();
            }

            updateDurationOptions(dayIdx, clickStartMin);
            durationSel.dispatchEvent(new Event('change'));

            if (recurringEndSel) {
              populateRecurringEndOptions(selectionDate);
              if (recurringCb.checked) {
                recurringRow.style.display = 'flex';
                recurringEndSel.required = true;
              }
            }
          });
        } else {
          cell.classList.add('unavailable');
          cell.style.cursor = 'not-allowed';
        }

        const availableSegments = blocks
          .map(([s, e]) => [Math.max(s, startMin, calendarStartMinutes), Math.min(e, endMin, calendarEndMinutes)])
          .filter(([s, e]) => e > s)
          .sort((a, b) => a[0] - b[0]);

        let cursorMin = startMin;
        availableSegments.forEach(([segStart, segEnd]) => {
          if (segStart > cursorMin) {
            const blockEl = document.createElement('div');
            blockEl.className = 'av-block-unavailable';
            const topPct = ((cursorMin - startMin) / 60) * 100;
            const heightPct = ((segStart - cursorMin) / 60) * 100;
            if (heightPct > 0) {
              blockEl.style.top = `${topPct}%`;
              blockEl.style.height = `${heightPct}%`;
              cell.appendChild(blockEl);
            }
          }
          cursorMin = Math.max(cursorMin, segEnd);
        });

        if (cursorMin < endMin) {
          const blockEl = document.createElement('div');
          blockEl.className = 'av-block-unavailable';
          const topPct = ((cursorMin - startMin) / 60) * 100;
          const heightPct = ((Math.min(endMin, calendarEndMinutes) - cursorMin) / 60) * 100;
          if (heightPct > 0) {
            blockEl.style.top = `${topPct}%`;
            blockEl.style.height = `${heightPct}%`;
            cell.appendChild(blockEl);
          }
        }

        row.appendChild(cell);
      });

      calElem.appendChild(row);
    }
  }

  // Week navigation handlers
  if (prevWeekBtn) {
    prevWeekBtn.addEventListener('click', () => {
      currentWeekOffset--;
      loadAvailability();
      // Clear any selection when changing weeks
      hiddenDate.value = "";
      hiddenStart.value = "";
      selectedBlockId = null;
      selectedBlockElem = null;
      resetDurationOptions();
    });
  }

  if (nextWeekBtn) {
    nextWeekBtn.addEventListener('click', () => {
      currentWeekOffset++;
      loadAvailability();
      // Clear any selection when changing weeks
      hiddenDate.value = "";
      hiddenStart.value = "";
      selectedBlockId = null;
      selectedBlockElem = null;
      resetDurationOptions();
    });
  }

  loadAvailability();

  // Ensure duration options start enabled
  resetDurationOptions();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Submitting booking request…";
    msg.className = "form-message";

    if (!hiddenDate.value || !hiddenStart.value) {
      msg.textContent = "Please click an available time in the calendar.";
      msg.classList.add("error");
      return;
    }

    if (!durationSel.value) {
      msg.textContent = "Please select a duration.";
      msg.classList.add("error");
      return;
    }

    // If recurring is requested, ensure a recurring end date was chosen
    if (recurringCb.checked) {
      const fd = new FormData(form);
      if (!fd.get('recurring_end')) {
        msg.textContent = 'Please choose a last date for recurring sessions.';
        msg.classList.add('error');
        return;
      }
      
      // Check for conflicts in recurring sessions
      const startDate = new Date(hiddenDate.value);
      const endDate = new Date(fd.get('recurring_end'));
      const startTime = hiddenStart.value;
      const duration = parseFloat(durationSel.value);
      const conflictingDates = [];
      
      // Get the day of week for the recurring session
      const dayOfWeek = startDate.getDay();
      const dayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to 0=Mon, 1=Tue, etc.
      
      // Parse start hour from the time string
      const [startHour] = startTime.split(':').map(Number);
      const startMin = startHour * 60;
      const endMin = startMin + Math.round(duration * 60);
      
      // Check each week for conflicts
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        // Use local date formatting to avoid timezone conversion
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        // Check if this date conflicts with existing bookings
        const bookedSlots = demoBooked[dayIdx] || [];
        const hasConflict = bookedSlots.some(([bs, be]) => {
          // Check if there's any overlap between requested time and booked time
          return !(be <= startMin || bs >= endMin);
        });
        
        if (hasConflict) {
          // Format date nicely for display
          const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const dayName = days[currentDate.getDay()];
          const monthName = months[currentDate.getMonth()];
          const date = currentDate.getDate();
          const year = currentDate.getFullYear();
          conflictingDates.push(`${dayName}, ${monthName} ${date}, ${year}`);
        }
        
        // Move to next week
        currentDate.setDate(currentDate.getDate() + 7);
      }
      
      // If there are conflicts, show warning but still allow submission
      if (conflictingDates.length > 0) {
        const conflictMsg = document.createElement('div');
        conflictMsg.style.marginTop = '12px';
        conflictMsg.style.padding = '12px';
        conflictMsg.style.background = 'rgba(255, 165, 0, 0.2)';
        conflictMsg.style.borderRadius = '8px';
        conflictMsg.style.color = '#ffaa00';
        conflictMsg.innerHTML = `
          <strong>⚠️ Scheduling Conflict Detected</strong><br/>
          <span style="font-size: 0.9rem;">The following dates are already booked:</span><br/>
          <ul style="margin: 8px 0; padding-left: 20px; font-size: 0.9rem;">
            ${conflictingDates.map(date => `<li>${date}</li>`).join('')}
          </ul>
          <span style="font-size: 0.9rem;">Your session will not be booked on those dates, but it will still be booked for the other sessions.</span>
        `;
        
        // Remove any existing conflict messages
        const existingMsg = form.querySelector('.conflict-warning');
        if (existingMsg) existingMsg.remove();
        
        conflictMsg.className = 'conflict-warning';
        msg.parentNode.insertBefore(conflictMsg, msg);
      } else {
        // Remove conflict message if no conflicts
        const existingMsg = form.querySelector('.conflict-warning');
        if (existingMsg) existingMsg.remove();
      }
    }

    const formData = new FormData(form);
    const obj = Object.fromEntries(formData.entries());
    obj.type = "booking_request";

    // Build friendly title: [subject] – [first, second, third...]
    const num = parseInt(obj.num_students || "1", 10);
    const firstNames = [];
    for (let i = 1; i <= num; i++) {
      const full = obj[`student_full_name_${i}`] || "";
      const first = full.trim().split(/\s+/)[0] || "";
      if (first) firstNames.push(first);
    }
    obj.session_title = `${obj.subject} – ${firstNames.join(", ")}`;
    
    // Calculate and include final cost
    const duration = parseFloat(obj.duration_hours || "1");
    const includeSummary = obj.include_summary === "on";
    const slidingScaleEnabled = obj.sliding_scale_toggle === "on";
    const discountSlider = document.getElementById("income-slider");
    
    // Calculate base cost
    const baseRate = 50;
    const additionalRate = 20;
    const summaryFee = includeSummary ? 10 : 0;
    const costPerHour = baseRate + ((num - 1) * additionalRate);
    const standardTotal = (costPerHour * duration) + summaryFee;
    
    // Apply discount if sliding scale enabled
    let finalCost = standardTotal;
    if (slidingScaleEnabled && discountSlider) {
      const discountSteps = parseInt(discountSlider.value);
      const discountPerHour = discountSteps * 10;
      const discountAmount = discountPerHour * duration;
      finalCost = standardTotal - discountAmount;
    }
    
    obj.final_cost = finalCost.toFixed(2);

    try {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify(obj),
      });

      msg.textContent =
        "Thanks! Your booking request has been submitted. I will review it and email you with confirmation.";
      msg.classList.add("ok");
      form.reset();
      renderStudentFields();
      hiddenDate.value = "";
      hiddenStart.value = "";
      calElem.querySelectorAll(".av-slot.selected").forEach((el) =>
        el.classList.remove("selected")
      );
      // Reset durations when clearing a selection
      resetDurationOptions();
    } catch (err) {
      console.error(err);
      msg.textContent = "Something went wrong. Please try again or contact me directly.";
      msg.classList.add("error");
    }
  });
}

function formatHour(h) {
  const ampm = h >= 12 ? "PM" : "AM";
  const hr12 = h % 12 || 12;
  return `${hr12}`;
}
