export const COURSE_CATALOG_VERSION_VALUE = 2;

// Core Canadian catalog used across the site (default country)
// Aligned to the simplified Grade/Subject choices used by students and tutors.
export const CANONICAL_COURSES = [
  // Elementary & Junior High (K-9)
  { id: 'math-k6', label: 'Math K-6', subjectGroup: 'math', gradeCeiling: 6, order: 10, country: 'ca', keywords: ['k-6', 'elementary', 'math'] },
  { id: 'math-7-9', label: 'Math 7-9', subjectGroup: 'math', gradeCeiling: 9, order: 11, country: 'ca', keywords: ['7-9', 'junior high', 'math'] },
  { id: 'english-k6', label: 'English K-6', subjectGroup: 'english', gradeCeiling: 6, order: 20, country: 'ca', keywords: ['k-6', 'elementary', 'ela', 'english'] },
  { id: 'english-7-9', label: 'English 7-9', subjectGroup: 'english', gradeCeiling: 9, order: 21, country: 'ca', keywords: ['7-9', 'junior high', 'ela', 'english'] },
  { id: 'social-k6', label: 'Social K-6', subjectGroup: 'social', gradeCeiling: 6, order: 30, country: 'ca', keywords: ['k-6', 'elementary', 'social'] },
  { id: 'social-7-9', label: 'Social 7-9', subjectGroup: 'social', gradeCeiling: 9, order: 31, country: 'ca', keywords: ['7-9', 'junior high', 'social'] },
  { id: 'science-k6', label: 'Science K-6', subjectGroup: 'science', gradeCeiling: 6, order: 40, country: 'ca', keywords: ['k-6', 'elementary', 'science'] },
  { id: 'science-7-9', label: 'Science 7-9', subjectGroup: 'science', gradeCeiling: 9, order: 41, country: 'ca', keywords: ['7-9', 'junior high', 'science'] },
  { id: 'french-k6', label: 'French K-6', subjectGroup: 'french', gradeCeiling: 6, order: 50, country: 'ca', keywords: ['k-6', 'elementary', 'french'] },
  { id: 'french-7-9', label: 'French 7-9', subjectGroup: 'french', gradeCeiling: 9, order: 51, country: 'ca', keywords: ['7-9', 'junior high', 'french'] },

  // High school (10/20/30 mappings to gradeCeiling 10/11/12)
  { id: 'math-10', label: 'Math 10', subjectGroup: 'math', gradeCeiling: 10, order: 60, country: 'ca' },
  { id: 'math-20', label: 'Math 20', subjectGroup: 'math', gradeCeiling: 11, order: 61, country: 'ca' },
  { id: 'math-30', label: 'Math 30', subjectGroup: 'math', gradeCeiling: 12, order: 62, country: 'ca' },

  { id: 'science-10', label: 'Science 10', subjectGroup: 'science', gradeCeiling: 10, order: 70, country: 'ca' },
  { id: 'science-20', label: 'Science 20', subjectGroup: 'science', gradeCeiling: 11, order: 71, country: 'ca' },
  { id: 'science-30', label: 'Science 30', subjectGroup: 'science', gradeCeiling: 12, order: 72, country: 'ca' },

  { id: 'social-10', label: 'Social 10', subjectGroup: 'social', gradeCeiling: 10, order: 80, country: 'ca' },
  { id: 'social-20', label: 'Social 20', subjectGroup: 'social', gradeCeiling: 11, order: 81, country: 'ca' },
  { id: 'social-30', label: 'Social 30', subjectGroup: 'social', gradeCeiling: 12, order: 82, country: 'ca' },

  { id: 'english-10', label: 'English 10', subjectGroup: 'english', gradeCeiling: 10, order: 90, country: 'ca' },
  { id: 'english-20', label: 'English 20', subjectGroup: 'english', gradeCeiling: 11, order: 91, country: 'ca' },
  { id: 'english-30', label: 'English 30', subjectGroup: 'english', gradeCeiling: 12, order: 92, country: 'ca' },

  { id: 'french-10', label: 'French 10', subjectGroup: 'french', gradeCeiling: 10, order: 100, country: 'ca' },
  { id: 'french-20', label: 'French 20', subjectGroup: 'french', gradeCeiling: 11, order: 101, country: 'ca' },
  { id: 'french-30', label: 'French 30', subjectGroup: 'french', gradeCeiling: 12, order: 102, country: 'ca' },

  { id: 'physics-20', label: 'Physics 20', subjectGroup: 'science', gradeCeiling: 11, order: 110, country: 'ca' },
  { id: 'physics-30', label: 'Physics 30', subjectGroup: 'science', gradeCeiling: 12, order: 111, country: 'ca' },
  { id: 'biology-20', label: 'Biology 20', subjectGroup: 'science', gradeCeiling: 11, order: 120, country: 'ca' },
  { id: 'biology-30', label: 'Biology 30', subjectGroup: 'science', gradeCeiling: 12, order: 121, country: 'ca' },
  { id: 'chemistry-20', label: 'Chemistry 20', subjectGroup: 'science', gradeCeiling: 11, order: 130, country: 'ca' },
  { id: 'chemistry-30', label: 'Chemistry 30', subjectGroup: 'science', gradeCeiling: 12, order: 131, country: 'ca' }
];

// U.S.-specific courses
export const US_COURSES = [
  { id: 'algebra-1', label: 'Algebra 1', subjectGroup: 'math', gradeCeiling: 10, country: 'us' },
  { id: 'geometry', label: 'Geometry', subjectGroup: 'math', gradeCeiling: 10, country: 'us' },
  { id: 'algebra-2', label: 'Algebra 2', subjectGroup: 'math', gradeCeiling: 11, country: 'us' },
  { id: 'precalculus', label: 'Pre-Calculus', subjectGroup: 'math', gradeCeiling: 12, country: 'us' },
  { id: 'english-9', label: 'English 9', subjectGroup: 'english', gradeCeiling: 9, country: 'us' },
  { id: 'english-10', label: 'English 10', subjectGroup: 'english', gradeCeiling: 10, country: 'us' },
  { id: 'english-11', label: 'English 20', subjectGroup: 'english', gradeCeiling: 11, country: 'us' },
  { id: 'english-12', label: 'English 30', subjectGroup: 'english', gradeCeiling: 12, country: 'us' },
  { id: 'biology', label: 'Biology', subjectGroup: 'science', gradeCeiling: 10, country: 'us' },
  { id: 'chemistry', label: 'Chemistry', subjectGroup: 'science', gradeCeiling: 11, country: 'us' },
  { id: 'physics', label: 'Physics', subjectGroup: 'science', gradeCeiling: 12, country: 'us' },
  { id: 'us-history', label: 'U.S. History', subjectGroup: 'social', gradeCeiling: 11, country: 'us' },
  { id: 'world-history', label: 'World History', subjectGroup: 'social', gradeCeiling: 10, country: 'us' },
  { id: 'civics', label: 'Civics / Government', subjectGroup: 'social', gradeCeiling: 12, country: 'us' }
];

export const ALL_COURSES = [...CANONICAL_COURSES, ...US_COURSES];

export function getCoursesByCountry(country = 'ca') {
  const normalized = (country || 'any').toLowerCase();
  return ALL_COURSES.filter((course) => {
    const courseCountry = (course.country || 'any').toLowerCase();
    return courseCountry === 'any' || courseCountry === normalized;
  });
}

// Make data available to non-module scripts (e.g., course picker)
if (typeof globalThis !== 'undefined') {
  if (!globalThis.CANONICAL_COURSES) globalThis.CANONICAL_COURSES = CANONICAL_COURSES;
  if (!globalThis.US_COURSES) globalThis.US_COURSES = US_COURSES;
  if (!globalThis.ALL_COURSES) globalThis.ALL_COURSES = ALL_COURSES;
}
