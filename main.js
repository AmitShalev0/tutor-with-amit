// main.js

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzbKeFr3aAq9tmosxniada0DP2oW0Vv91G0H681BYk34yMy0_iC3PqnRzpqVO_CnRVN/exec";

document.addEventListener("DOMContentLoaded", () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // Skip auto-initialization if page has data-no-auto-init attribute
  if (document.body.dataset.noAutoInit !== "true") {
    setupStudentForm();
    setupBookingForm();
  }
  
  setupThemeToggle();
  setupCurrentTime();
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
    // Auto-detect: 7am-6:59:59pm = light, 7pm-6:59:59am = dark
    const now = new Date();
    const hour = now.getHours();
    stored = (hour >= 7 && hour < 19) ? "light" : "dark";
  }
  applyTheme(stored);

  toggle.addEventListener("change", () => {
    const next = toggle.checked ? "light" : "dark";
    localStorage.setItem("site-theme", next);
    applyTheme(next);
  });
}

// Display current time, day, and date
function setupCurrentTime() {
  const timeElem = document.getElementById("current-time");
  if (!timeElem) return;

  function updateTime() {
    const now = new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const ampm = now.getHours() >= 12 ? "pm" : "am";
    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const date = now.getDate();
    const year = now.getFullYear();

    timeElem.textContent = `${dayName}, ${monthName} ${date}, ${year}, ${hours}:${minutes}${ampm}`;
  }

  // Update immediately and then every second
  updateTime();
  setInterval(updateTime, 1000);
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

function setupBookingForm() {
  const form = document.getElementById("booking-form");
  if (!form) return;

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
    const numStudents = numSel ? parseInt(numSel.value || "1", 10) : 1;
    const duration = parseFloat(document.getElementById("duration-hours")?.value || "1");
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
    const baseRate = 50;
    const additionalRate = 20;
    const summaryFee = includeSummary ? 10 : 0;
    
    // Calculate standard cost
    const costPerHour = baseRate + ((numStudents - 1) * additionalRate);
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
      if (recurringCb.checked && hiddenDate.value && recurringEndSel) {
        const d = new Date(hiddenDate.value);
        populateRecurringEndOptions(d);
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

  // Skip calendar setup if essential elements don't exist
  if (!calElem || !hiddenDate || !hiddenStart || !durationSel) {
    return;
  }

  let selectedBlockId = null;
  let selectedBlockElem = null;
  let currentWeekOffset = 0; // 0 = current week, 1 = next week, etc.

  // Function to populate start time dropdown with 15-minute intervals
  function populateStartTimeOptions() {
    if (!startTimeInput) return;
    startTimeInput.innerHTML = '<option value="">Select start time…</option>';
    
    // Populate from 8am to 8pm in 15-minute intervals
    for (let h = 8; h < 20; h++) {
      for (let m = 0; m < 60; m += 15) {
        const totalMinutes = h * 60 + m;
        const ampm = h >= 12 ? 'pm' : 'am';
        const displayHour = h % 12 || 12;
        const timeStr = m === 0 
          ? `${displayHour}:${String(m).padStart(2, '0')}${ampm}`
          : `${displayHour}:${String(m).padStart(2, '0')}${ampm}`;
        
        const option = document.createElement('option');
        option.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        option.textContent = timeStr;
        startTimeInput.appendChild(option);
      }
    }
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
    const durationHours = durationSel ? parseFloat(durationSel.value || "1") : 1;
    const durationMin = Math.round(durationHours * 60);

    // Get available and booked blocks for the selected day
    const availableBlocks = demoAvailable[selectedDay] || [];
    const bookedBlocks = demoBooked[selectedDay] || [];
    
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
    const endMin = timeMin + 60; // Need at least 1 hour available
    
    // Update each day option
    Array.from(daySelect.options).forEach(opt => {
      if (!opt.value) {
        opt.disabled = false;
        return;
      }
      
      const dayIdx = parseInt(opt.value);
      const blocks = demoAvailable[dayIdx] || [];
      
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
    
    const durations = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];
    durations.forEach(dur => {
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
      const durationText = dur === 1 ? '1 hour' : `${dur} hours`;
      
      const option = document.createElement('option');
      option.value = dur;
      option.textContent = `${endTimeStr} (${durationText})`;
      durationSel.appendChild(option);
    });
    
    // Select first option by default (1 hour)
    if (durationSel.options.length > 1) {
      durationSel.selectedIndex = 1;
    }
  }

  // Populate start time options on load
  populateStartTimeOptions();

  // Listen to start time changes to update the calendar label
  if (startTimeInput) {
    startTimeInput.addEventListener('change', () => {
      updateEndTimeOptions(startTimeInput.value);
      
      // Update day availability based on selected start time
      updateDayAvailability();
      
      // Update calendar selection if both day and start time are selected
      const selectedDay = daySelect ? parseInt(daySelect.value) : null;
      const startTime = startTimeInput.value;
      
      if (!isNaN(selectedDay) && startTime) {
        const [startHour] = startTime.split(':').map(Number);
        
        // Clear previous selection
        calElem.querySelectorAll(".av-slot.selected").forEach((el) => {
          el.classList.remove("selected");
          el.textContent = "";
          // Remove any selection overlay
          const overlay = el.querySelector('.selection-overlay');
          if (overlay) overlay.remove();
        });
        
        // Find and select the matching cell
        const newBlockId = `${selectedDay}-${startHour}`;
        const newBlock = calElem.querySelector(`[data-block-id="${newBlockId}"]`);
        
        if (newBlock && newBlock.classList.contains('available')) {
          newBlock.classList.add("selected");
          selectedBlockId = newBlockId;
          selectedBlockElem = newBlock;

          // Calculate the actual date for the selected day
          const today = new Date();
          const monday = new Date(today);
          const day = monday.getDay();
          const diff = (day === 0 ? -6 : 1) - day;
          monday.setDate(today.getDate() + diff + (currentWeekOffset * 7));
          const date = new Date(monday);
          date.setDate(monday.getDate() + selectedDay);
          
          // Use local date format instead of UTC to avoid timezone issues
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day_of_month = String(date.getDate()).padStart(2, '0');
          hiddenDate.value = `${year}-${month}-${day_of_month}`;
          
          hiddenStart.value = startTime;

          // Update the label
          if (durationSel.value) {
            durationSel.dispatchEvent(new Event('change'));
          }
        } else {
          // Selected time is not available on this day
          selectedBlockId = null;
          selectedBlockElem = null;
        }
      } else if (selectedBlockElem && durationSel.value) {
        // Just update the label if a block is already selected
        durationSel.dispatchEvent(new Event('change'));
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

      const [startHour] = startTime.split(':').map(Number);

      // Clear previous selection
      calElem.querySelectorAll(".av-slot.selected").forEach((el) => {
        el.classList.remove("selected");
        el.textContent = "";
        // Remove any selection overlay
        const overlay = el.querySelector('.selection-overlay');
        if (overlay) overlay.remove();
      });

      // Find and select the matching cell
      const newBlockId = `${selectedDay}-${startHour}`;
      const newBlock = calElem.querySelector(`[data-block-id="${newBlockId}"]`);
      
      if (newBlock && newBlock.classList.contains('available')) {
        newBlock.classList.add("selected");
        selectedBlockId = newBlockId;
        selectedBlockElem = newBlock;

        // Calculate the actual date for the selected day
        const today = new Date();
        const monday = new Date(today);
        const day = monday.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        monday.setDate(today.getDate() + diff + (currentWeekOffset * 7));
        const date = new Date(monday);
        date.setDate(monday.getDate() + selectedDay);
        
        // Use local date format instead of UTC to avoid timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day_of_month = String(date.getDate()).padStart(2, '0');
        hiddenDate.value = `${year}-${month}-${day_of_month}`;
        
        hiddenStart.value = startTime;

        // Update the label
        if (durationSel.value) {
          durationSel.dispatchEvent(new Event('change'));
        }
      } else {
        // Selected time is not available on this day
        selectedBlockId = null;
        selectedBlockElem = null;
      }
    });
  }

  // Mock existing bookings. Replace with server data later.
  // Each booking is [startMin, endMin] relative to day (0=Mon) and minute-of-day.
  // Example: Tuesday (1) has a booking 14:00-15:00
  const demoBooked = {
    0: [],
    1: [[14 * 60, 15 * 60]],
    2: [],
    3: [],
    4: [],
  };

  // To let updateDurationOptions look at available blocks we keep demoAvailable
  // in an outer variable and fill it later in loadAvailability().
  let demoAvailable = {};

  // Compute which durations are valid for the selected start time.
  function updateDurationOptions(dayIdx, startHour) {
    if (dayIdx == null || startHour == null) return;

    // Build availability for that day from demoAvailable
    const blocks = demoAvailable[dayIdx] || [];
    // Convert start to minutes
    const startMin = startHour * 60;

    // A helper to test if a requested endMin is within any availability block
    function withinAvailability(endMin) {
      return blocks.some(([s, e]) => s <= startMin && e >= endMin);
    }

    // A helper to test if [startMin, endMin) overlaps any booked session
    const booked = demoBooked[dayIdx] || [];
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
    // Default to 1 hour when clearing/resetting
    durationSel.value = "1";
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
    if (!selectedBlockElem || !selectedBlockId) return;
    const val = durationSel.value;
    if (!val) {
      // no duration selected => clear text
      const overlay = selectedBlockElem.querySelector('.selection-overlay');
      if (overlay) overlay.remove();
      updateCost(); // Update cost when duration changes
      updateStartTimeAvailability(); // Update available start times
      return;
    }

    const durHours = parseFloat(val);
    if (isNaN(durHours)) {
      const overlay = selectedBlockElem.querySelector('.selection-overlay');
      if (overlay) overlay.remove();
      updateCost(); // Update cost when duration changes
      updateStartTimeAvailability(); // Update available start times
      return;
    }

    // Get start time from dropdown
    const startTime = startTimeInput ? startTimeInput.value : hiddenStart.value;
    if (!startTime) return;
    
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startMin = startHour * 60 + (startMinute || 0);
    const endMin = startMin + Math.round(durHours * 60);
    
    // Update cost and available start times
    updateCost();
    updateStartTimeAvailability();

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
  function populateRecurringEndOptions(baseDate) {
    if (!recurringEndSel || !baseDate) return;
    // Clear keep placeholder
    recurringEndSel.innerHTML = '<option value="">Choose last date…</option>';

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const start = new Date(baseDate);
    // Start from the following week
    start.setDate(start.getDate() + 7);

    for (let i = 1; i <= 52; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + (i - 1) * 7);

      const dayName = days[d.getDay()];
      const monthName = months[d.getMonth()];
      const dateNum = d.getDate();
      const year = d.getFullYear();

      const label = `${dayName}, ${monthName} ${dateNum}, ${year} (${i})`;
      const opt = document.createElement('option');
      opt.value = d.toISOString().slice(0, 10);
      opt.textContent = label;
      recurringEndSel.appendChild(opt);
    }

    // Select the first real option by default
    if (recurringEndSel.options.length > 1) recurringEndSel.selectedIndex = 1;
  }

  async function loadAvailability() {
    // For now: fake availability (Mon–Fri, 8–20). Later: fetch from Apps Script.
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const startHour = 8, endHour = 20;

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

    // Example data structure: available blocks per day as [startMin, endMin]
    // You will replace this with data from Apps Script.
    demoAvailable = {
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
    
    // Build header with actual dates
    let headerHTML = `<div></div>`;
    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + dayIdx);
      const dayName = days[dayIdx];
      const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
      headerHTML += `<div class="av-row-header">${dayName}<br/><small>${dateStr}</small></div>`;
    }
    headerRow.innerHTML = headerHTML;
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
          cell.classList.add('available');
          cell.dataset.blockId = `${dayIdx}-${h}`;
          cell.style.position = 'relative'; // Enable positioning for children
          cell.addEventListener("click", (e) => {
            // Determine if click is in top or bottom half of cell
            const rect = cell.getBoundingClientRect();
            const clickY = e.clientY - rect.top;
            const cellHeight = rect.height;
            const clickRatio = clickY / cellHeight;
            
            // Determine minutes based on click position
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
            
            // Calculate the start time in minutes
            const clickStartMin = h * 60 + minutes;
            
            // Check if at least 1 hour is available from this click point
            const minEndMin = clickStartMin + 60; // Need at least 1 hour
            
            // Check if this time fits within available blocks
            const fitsInAvailable = blocks.some(([s, e]) => s <= clickStartMin && e >= minEndMin);
            
            if (!fitsInAvailable) {
              // Can't select this time - not enough availability
              return;
            }
            
            // Check if this time conflicts with any bookings
            const bookedBlocks = demoBooked[dayIdx] || [];
            const hasConflict = bookedBlocks.some(([bs, be]) => {
              return !(be <= clickStartMin || bs >= minEndMin);
            });
            
            if (hasConflict) {
              // Can't select this time - conflicts with booking
              return;
            }
            
            // Clear previous selected block(s) and restore their label
            calElem.querySelectorAll(".av-slot.selected").forEach((el) => {
              el.classList.remove("selected");
              el.textContent = "";
              // Remove any selection overlay
              const overlay = el.querySelector('.selection-overlay');
              if (overlay) overlay.remove();
            });

            // Select this cell
            cell.classList.add("selected");
            selectedBlockId = `${dayIdx}-${h}`;
            selectedBlockElem = cell;

            // Re-enable duration options and recompute (updateDurationOptions will disable appropriately)
            Array.from(durationSel.options).forEach((opt) => (opt.disabled = false));

            // Calculate the actual date for the selected day
            const date = new Date(monday);
            date.setDate(monday.getDate() + dayIdx);
            hiddenDate.value = date.toISOString().slice(0, 10);
            const timeStr = `${String(h).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
            hiddenStart.value = timeStr;
            
            // Update day dropdown
            if (daySelect) {
              daySelect.value = String(dayIdx);
            }
            
            // Update start time dropdown
            if (startTimeInput) {
              startTimeInput.value = timeStr;
              updateEndTimeOptions(timeStr);
              // Update day availability after setting time
              updateDayAvailability();
            }

            // Update duration options to reflect any bookings around this time
            updateDurationOptions(dayIdx, h);

            // Trigger change so the selectedBlockElem label updates to the chosen time range
            durationSel.dispatchEvent(new Event('change'));

            // Populate recurring-end dropdown starting from the week after the selected date
            if (recurringEndSel) {
              populateRecurringEndOptions(date);
              // If recurring is checked, ensure the row is visible and required
              if (recurringCb.checked) {
                recurringRow.style.display = 'flex';
                recurringEndSel.required = true;
              }
            }
          });
        } else {
          // Add unavailable block for grayed out slots
          const unavailableBlock = document.createElement("div");
          unavailableBlock.className = "av-block-unavailable";
          cell.appendChild(unavailableBlock);
        }

        row.appendChild(cell);
      }

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
        const dateStr = currentDate.toISOString().slice(0, 10);
        
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
