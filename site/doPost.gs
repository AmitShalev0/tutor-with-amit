// Tutoring Forms - Code.gs
// Handles POST from your website, sends emails, and saves to Google Sheets

// ============ MAIN ENTRY ============

// Main entry point for form submissions
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const type = data.type;
    
    // Your email address
    const tutorEmail = "AmitShalev1510@gmail.com";
    
    if (type === "student_signup") {
      handleStudentSignup(data, tutorEmail);
    } else if (type === "booking_request") {
      handleBookingRequest(data, tutorEmail);
    }
    
    return ContentService.createTextOutput(JSON.stringify({success: true}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log("Error: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({success: false, error: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}