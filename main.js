// main.js

const APPS_SCRIPT_URL = "YOUR_APPS_SCRIPT_URL_HERE"; // <- set after deploying script

document.addEventListener("DOMContentLoaded", () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  setupStudentForm();
  setupBookingForm();
});

function setupStudentForm() {
  const form = document.getElementById("student-form");
  if (!form) return;

  const msg = document.getElementById("student-form-message");
  const nextSteps = document.getElementById("student-next-steps");
  const independentCb = document.getElementById("independent-student");
  const guardianRow = document.getElementById("guardian-name-row");

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

function setupBookingForm() {
  const form = document.getElementById("booking-form");
  if (!form) return;

  const msg = document.getElementById("booking-form-message");
  const numSel = document.getElementById("num-students");
  const studentsWrapper = document.getElementById("student-names-wrapper");
  const recurringCb = document.getElementById("recurring");
  const recurringRow = document.getElementById("recurring-end-row");

  // Dynamic student name fields
  function renderStudentFields() {
    const n = parseInt(numSel.value || "1", 10);
    studentsWrapper.innerHTML = "";
    for (let i = 1; i <= n; i++) {
      const div = document.createElement("div");
      div.className = "field-row";
      div.innerHTML = `
        <label>Student ${i} Full Name*</label>
        <input type="text" name="student_full_name_${i}" required />
      `;
      studentsWrapper.appendChild(div);
    }
  }
  numSel.addEventListener("change", renderStudentFields);
  renderStudentFields();

  // Recurring toggle
  recurringCb.addEventListener("change", () => {
    recurringRow.style.display = recurringCb.checked ? "flex" : "none";
    const input = recurringRow.querySelector("input");
    input.required = recurringCb.checked;
  });

  // Availability calendar
  const calElem = document.getElementById("availability-calendar");
  const hiddenDate = document.getElementById("selected-date");
  const hiddenStart = document.getElementById("selected-start");
  const durationSel = document.getElementById("duration-hours");

  let selectedBlockId = null;

  async function loadAvailability() {
    // For now: fake availability (Mon–Fri, 8–20). Later: fetch from Apps Script.
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const startHour = 8, endHour = 20;

    // Example data structure: available blocks per day as [startMin, endMin]
    // You will replace this with data from Apps Script.
    const demoAvailable = {
      0: [[8 * 60, 17 * 60], [19 * 60, 20 * 60]],
      1: [[8 * 60, 14 * 60], [15 * 60, 16 * 60], [17 * 60 + 15, 20 * 60]],
      2: [[8 * 60, 20 * 60]],
      3: [[8 * 60, 16 * 60], [18 * 60 + 15, 20 * 60]],
      4: [[8 * 60, 13 * 60]],
    };

    // Clear and build header row
    calElem.innerHTML = "";

    const headerRow = document.createElement("div");
    headerRow.className = "av-row";
    headerRow.innerHTML =
      `<div></div>` +
      days
        .map((d) => `<div class="av-row-header">${d}</div>`)
        .join("");
    calElem.appendChild(headerRow);

    // Build rows for each hour
    for (let h = startHour; h < endHour; h++) {
      const row = document.createElement("div");
      row.className = "av-row";

      const label = document.createElement("div");
      label.className = "av-time-label";
      label.textContent = `${formatHour(h)}:00`;
      row.appendChild(label);

      for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
        const cell = document.createElement("div");
        cell.className = "av-slot";

        // Check if this whole hour is within any available block (>= 60 mins)
        const blocks = demoAvailable[dayIdx] || [];
        const startMin = h * 60;
        const endMin = (h + 1) * 60;
        const isFree = blocks.some(
          ([s, e]) => s <= startMin && e >= endMin
        );

        if (isFree) {
          const block = document.createElement("div");
          block.className = "av-block";
          block.textContent = "Available";
          const blockId = `${dayIdx}-${h}`;
          block.dataset.blockId = blockId;
          block.addEventListener("click", () => {
            // Clear previous
            calElem.querySelectorAll(".av-block.selected").forEach((el) =>
              el.classList.remove("selected")
            );
            block.classList.add("selected");
            selectedBlockId = blockId;

            // For now: assume current week; we only need weekday + hour
            const today = new Date();
            const monday = new Date(today);
            const day = monday.getDay();
            const diff = (day === 0 ? -6 : 1) - day; // Monday of this week
            monday.setDate(today.getDate() + diff);
            const date = new Date(monday);
            date.setDate(monday.getDate() + dayIdx);
            hiddenDate.value = date.toISOString().slice(0, 10);
            hiddenStart.value = `${String(h).padStart(2, "0")}:00`;
          });
          cell.appendChild(block);
        }

        row.appendChild(cell);
      }

      calElem.appendChild(row);
    }
  }

  loadAvailability();

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
      calElem.querySelectorAll(".av-block.selected").forEach((el) =>
        el.classList.remove("selected")
      );
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
