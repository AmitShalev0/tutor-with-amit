// Handle student signup form submissions
function handleStudentSignup(data, tutorEmail) {
  const studentEmail = data.email;
  const studentName = data.student_name;
  const guardianName = data.guardian_name || "N/A";
  const phone = data.phone || "Not provided";
  const yearOfBirth = data.year_of_birth;
  const subject = data.subject;
  const questions = data.questions || "None";
  
  // Extract first name for greeting
  const firstName = studentName.trim().split(/\s+/)[0] || studentName;
  
  // Email to student/guardian
  const studentSubject = "Welcome to Tutoring with Amit - Registration Confirmed";
  const studentBody = `
Hello ${firstName},

Thank you for registering for tutoring sessions with Amit!

Here's a summary of your registration:

Student Name: ${studentName}
Guardian Name: ${guardianName}
Email: ${studentEmail}
Phone: ${phone}
Year of Birth: ${yearOfBirth}
Main Subject: ${subject}
Questions/Comments: ${questions}

I've received your registration and will review it shortly. You can now proceed to book your first session at:
[Your booking page URL]

If you have any questions, feel free to reply to this email.

Best regards,
Amit Shalev
AmitShalev1510@gmail.com
`;

  // Email to tutor (you)
  const tutorSubject = "New Student Registration: " + studentName;
  const tutorBody = `
New student registration received:

Student Name: ${studentName}
Guardian Name: ${guardianName}
Email: ${studentEmail}
Phone: ${phone}
Year of Birth: ${yearOfBirth}
Main Subject: ${subject}
Questions/Comments: ${questions}

---
Submitted: ${new Date().toLocaleString()}
`;

  // Send emails
  MailApp.sendEmail(studentEmail, studentSubject, studentBody);
  MailApp.sendEmail(tutorEmail, tutorSubject, tutorBody);
  
  // Save to spreadsheet - Students tab
  const ss = SpreadsheetApp.openById("1_Inhm_UEFlrD9Rhrm3jnANQS5xEEjcTzz0WFhNlGUE4");
  const sheet = ss.getSheetByName("Students");
  
  if (!sheet) {
    Logger.log("Sheet 'Students' not found!");
    return;
  }
  
  const now = new Date();
  const utcMillis = now.getTime();
  
  // Check if headers exist (if row 1 is empty, add headers)
  if (sheet.getLastRow() === 0) {
    const headers = ["Timestamp", "Session ID (UTC)", "Student Name", "Guardian Name", "Email", "Phone", "Year of Birth", "Main Subject", "Questions/Comments", "Independent Student", "Type"];
    sheet.appendRow(headers);
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#4285f4");
    headerRange.setFontColor("#ffffff");
  }
  
  // Prepare row data
  const row = [
    now,
    utcMillis,

    data.student_name || "",
    data.year_of_birth || "",
    data.subject || "",
    data.school || "",

    data.guardian_name || data.student_name,
    data.email || "",
    data.phone || "",
  
    data.questions || "",
  ];
  
  sheet.appendRow(row);
}