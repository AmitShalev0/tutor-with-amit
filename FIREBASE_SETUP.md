# Firebase Integration Guide

## Overview
Your tutoring website now has Firebase authentication and database integration. Users can create accounts, manage their student profiles, and book sessions more easily.

## Features Implemented

### 1. User Authentication
- **Registration** (`register.html`): New users can create accounts with email/password
- **Login** (`login.html`): Existing users can log in
- **Dashboard** (`dashboard.html`): Personalized dashboard showing profile and students

### 2. Student Management
- **Add Students** (`add-student.html`): Users can add student profiles with:
  - Student name
  - Year of birth
  - Main subject
  - School
  - Relationship to guardian
  - Additional notes
- **View Students**: Dashboard shows all students linked to the user
- **Edit/Delete Students**: Manage student profiles from dashboard

### 3. Simplified Booking
- **Book Session** (`book.html`): 
  - Select students from a list (no re-entering names)
  - Guardian info auto-filled from profile
  - Same calendar and time selection as before

## Firebase Console Setup Required

### Step 1: Enable Firestore Database
1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project: **tutordesk-3cafb**
3. Click "Firestore Database" in the left menu
4. Click "Create database"
5. Choose "Start in production mode" (we'll set up rules next)
6. Select your preferred location (e.g., us-central)

### Step 2: Set Firestore Security Rules
In the Firestore "Rules" tab, replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users can read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Users can manage their own students
    match /students/{studentId} {
      allow read, write: if request.auth != null && 
        resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
    }
    
    // Bookings (optional - if you want to store in Firestore too)
    match /bookings/{bookingId} {
      allow read: if request.auth != null && 
        resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }
  }
}
```

### Step 3: Enable Firebase Storage (Optional)
If you want to allow photo uploads:
1. Click "Storage" in Firebase Console
2. Click "Get Started"
3. Use default security rules for now
4. (Recommended) Upload the CORS configuration in `config/storage-cors.json` so local development and the live site can talk to Firebase Storage. Use `firebase storage:bucket` (CLI) or the Firebase console to confirm your bucket name, then run `gsutil cors set config/storage-cors.json gs://<your-bucket-name>` (or `gcloud storage buckets update gs://<your-bucket-name> --cors-file=config/storage-cors.json`).

### Step 4: Set Storage Security Rules (Optional)
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /student-photos/{userId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Firestore Data Structure

### Users Collection: `users/{userId}`
```javascript
{
  fullName: "Jane Smith",
  email: "jane@example.com",
  phone: "5871234567",
  createdAt: timestamp,
  students: [] // Array of student IDs (optional, for quick reference)
}
```

### Students Collection: `students/{studentId}`
```javascript
{
  userId: "user123", // Links to parent user
  studentName: "Alex Johnson",
  yearOfBirth: 2010,
  subject: "Math 7",
  school: "Woodbine Elementary",
  relationship: "parent", // parent, guardian, self, sibling, other
  notes: "Needs help with fractions",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

## User Flow

### New Users:
1. Visit `register.html` → Create account
2. Auto-redirect to `dashboard.html`
3. Click "Add Student" → Fill in student info
4. Click "Book Session" → Select students and time

### Returning Users:
1. Visit `login.html` → Log in
2. See dashboard with all their students
3. Can add more students or book sessions
4. All guardian info pre-filled

## Benefits for Your Users

1. **No Re-entering Info**: Email, phone, and name remembered
2. **Family Management**: Add multiple students under one account
3. **Quick Booking**: Select students from a list
4. **Future Features**: Can add photo uploads, booking history, session summaries

## Next Steps (Optional Enhancements)

1. **Photo Uploads**: Add ability to upload student photos
2. **Booking History**: Show past bookings in dashboard
3. **Email Verification**: Require email verification on signup
4. **Password Reset**: Add "Forgot Password" functionality
5. **Admin Dashboard**: Create admin view to manage all users/bookings

## Migration Plan

### Keep Old Forms Working:
Your existing `signup.html` and `booking.html` still work for users who don't want to create accounts.

### Gradual Transition:
- Existing users continue using old forms
- New users encouraged to create accounts
- Eventually phase out old forms

## Testing Your Setup

1. Open `register.html` in browser
2. Create a test account
3. Add a test student
4. Try booking a session
5. Check Firebase Console → Firestore to see data

## Security Notes

- Firestore rules ensure users only see their own data
- Passwords are handled securely by Firebase Auth
- API keys in `firebase-config.js` are safe to be public (they're restricted by Firebase Console settings)
