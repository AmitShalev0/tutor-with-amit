// Handle booking request form submissions
function handleBookingRequest(data, tutorEmail) {
  const guardianEmail = data.email;
  const guardianName = data.guardian_full_name;
  const numStudents = parseInt(data.num_students);
  const subject = data.subject;
  const selectedDate = data.selected_date;
  const startTime = data.start_time;
  const duration = data.duration_hours;
  const dayOfWeek = data.day_of_week;
  const phone = data.phone || "Not provided";
  const recurringEnd = data.recurring_end || "";
  const questions = data.questions || "No questions";
  const includeSummary = data.include_summary === "on";
  const slidingScale = data.sliding_scale_toggle === "on";
  const finalCost = data.final_cost || "[BUG] - final cost not calculated";
  
  // Get student names
  let studentNames = [];
  for (let i = 1; i <= numStudents; i++) {
    const name = data["student_full_name_" + i];
    if (name) studentNames.push(name);
  }
  const studentNamesStr = studentNames.join(", ");
  
  // Format day of week
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const dayName = days[parseInt(dayOfWeek)] || "N/A";
  
  // Calculate end time
  const [hours, minutes] = startTime.split(':');
  const startMinutes = parseInt(hours) * 60 + parseInt(minutes);
  const endMinutes = startMinutes + (parseFloat(duration) * 60);
  const endHours = Math.floor(endMinutes / 60);
  const endMins = endMinutes % 60;
  
  // Format start and end times with AM/PM
  function formatTime(h, m) {
    const ampm = h >= 12 ? 'pm' : 'am';
    const displayHour = h % 12 || 12;
    return m === 0 ? `${displayHour}:00${ampm}` : `${displayHour}:${String(m).padStart(2, '0')}${ampm}`;
  }
  
  const formattedStartTime = formatTime(parseInt(hours), parseInt(minutes));
  const formattedEndTime = formatTime(endHours, endMins);
  const durationText = duration == 1 ? '1 hour' : `${duration} hours`;
  
  // Format date nicely
  const dateObj = new Date(selectedDate);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  // Format recurring end date if applicable
  let recurringText = "";
  if (recurringEnd) {
    const recurringEndObj = new Date(recurringEnd);
    const formattedRecurringEnd = recurringEndObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    recurringText = `\n→ Repeats every ${dayName} till ${formattedRecurringEnd}`;
  }
  
  // Format cost information
  const summaryText = includeSummary ? "Yes" : "No";
  const costPerStudent = numStudents > 1 ? (parseFloat(finalCost) / numStudents).toFixed(2) : null;
  const costText = numStudents > 1 
    ? `Total Cost: $${finalCost} ($${costPerStudent} per student)` 
    : `Total Cost: $${finalCost}`;
  
  // Email to parent/guardian
  const guardianSubject = "Tutoring Request with Amit Received - " + subject;
  const guardianBody = `
Hello ${guardianName},

Nice to A-meet you! Your booking request has been received and is PENDING APPROVAL.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BOOKING DETAILS

Student(s): ${studentNamesStr}
Subject: ${subject}

${formattedStartTime} - ${formattedEndTime} (${durationText})
${formattedDate}${recurringText}

Session Summary: ${summaryText}
${costText}

Your Contact: ${guardianEmail} • ${phone}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

I'll review your request and contact you within 24 hours to confirm or discuss any scheduling conflicts.

Questions/Comments: ${questions}

Best regards,
Amit Shalev
AmitShalev1510@gmail.com
`;

  // Email to tutor (you)
  const tutorSubject = "New Booking Request: " + studentNamesStr + " - " + subject;
  const tutorBody = `
New booking request received:

Student(s): ${studentNamesStr}
Guardian: ${guardianName}
Subject: ${subject}

Schedule:
Time: ${formattedStartTime} - ${formattedEndTime} (${durationText})
Date: ${formattedDate}${recurringText}

Pricing:
Include Summary/Homework: ${summaryText}
Sliding Scale Applied: ${slidingScale ? "Yes" : "No"}
Total Cost: $${finalCost}

Contact:
Email: ${guardianEmail}
Phone: ${phone}

Questions/Comments:
${questions}

---
Submitted: ${new Date().toLocaleString()}

ACTION REQUIRED: Review and confirm this booking request.
`;

  // Send emails
  MailApp.sendEmail(guardianEmail, guardianSubject, guardianBody);
  MailApp.sendEmail(tutorEmail, tutorSubject, tutorBody);
  
  // Save to spreadsheet - Bookings tab
  const ss = SpreadsheetApp.openById("1_Inhm_UEFlrD9Rhrm3jnANQS5xEEjcTzz0WFhNlGUE4");
  const sheet = ss.getSheetByName("Bookings");
  
  if (!sheet) {
    Logger.log("Sheet 'Bookings' not found!");
    return;
  }
  
  const now = new Date();
  const utcMillis = now.getTime();
  
  // Check if headers exist (if row 1 is empty, add headers)
  if (sheet.getLastRow() === 0) {
    const headers = ["Timestamp", "Session ID (UTC in milli)", "Number of Students", "List of Students (separated by commas)", "Subject", "Guardian Full Name", "Guardian Email", "Guardian Phone", "Start Date", "Start Time", "End Time", "Day of Week", "End Date", "Include Summary Session?", "Apply Sliding Scale?", "Questions", "Type", "Booking Title", "Final Cost", "Approved", "Form Type"];
    sheet.appendRow(headers);
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#4285f4");
    headerRange.setFontColor("#ffffff");
  }
  
  // Calculate end time
  const [hours2, minutes2] = (startTime || "00:00").split(':');
  const startMinutes2 = parseInt(hours2) * 60 + parseInt(minutes2);
  const endMinutes2 = startMinutes2 + (parseFloat(duration) * 60);
  const endHours2 = Math.floor(endMinutes2 / 60);
  const endMins2 = endMinutes2 % 60;
  const endTime = `${String(endHours2).padStart(2, '0')}:${String(endMins2).padStart(2, '0')}`;
  
  
  // Format include summary and sliding scale as Y/N
  const includeSummaryYN = includeSummary ? "Yes" : "No";
  const slidingScaleYN = slidingScale ? "Yes" : "No";
  
  // Build booking title: [subject] - [firstname1], [firstname2], [firstname3]
  const firstNames = [];
  for (let i = 1; i <= numStudents; i++) {
    const fullName = data["student_full_name_" + i];
    if (fullName) {
      const firstName = fullName.trim().split(/\s+/)[0];
      if (firstName) firstNames.push(firstName);
    }
  }
  const bookingTitle = `${subject} - ${firstNames.join(", ")}`;
  
  // Prepare row data (20 columns)
  const row = [
    "Pending",
    now,
    utcMillis,
    numStudents,
    studentNamesStr,
    subject,
    guardianName,
    guardianEmail,
    phone,
    selectedDate,
    startTime,
    endTime,
    dayName,
    recurringEnd || "",
    includeSummaryYN,
    slidingScaleYN,
    questions,
    data.type || "booking_request",
    bookingTitle,
    finalCost,
  ];
  
  sheet.appendRow(row);
}