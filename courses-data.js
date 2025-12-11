export const COURSE_CATALOG_VERSION_VALUE = 2;

// Core Canadian catalog used across the site (default country)
export const CANONICAL_COURSES = [
  // Math by grade (skip Math 20 — already in DB)
  { id: 'math-1', label: 'Math 1', subjectGroup: 'math', gradeCeiling: 1, order: 1, country: 'ca' },
  { id: 'math-2', label: 'Math 2', subjectGroup: 'math', gradeCeiling: 2, order: 2, country: 'ca' },
  { id: 'math-3', label: 'Math 3', subjectGroup: 'math', gradeCeiling: 3, order: 3, country: 'ca' },
  { id: 'math-4', label: 'Math 4', subjectGroup: 'math', gradeCeiling: 4, order: 4, country: 'ca' },
  { id: 'math-5', label: 'Math 5', subjectGroup: 'math', gradeCeiling: 5, order: 5, country: 'ca' },
  { id: 'math-6', label: 'Math 6', subjectGroup: 'math', gradeCeiling: 6, order: 6, country: 'ca' },
  { id: 'math-7', label: 'Math 7', subjectGroup: 'math', gradeCeiling: 7, order: 7, country: 'ca' },
  { id: 'math-8', label: 'Math 8', subjectGroup: 'math', gradeCeiling: 8, order: 8, country: 'ca' },
  { id: 'math-9', label: 'Math 9', subjectGroup: 'math', gradeCeiling: 9, order: 9, country: 'ca' },
  { id: 'math-10', label: 'Math 10', subjectGroup: 'math', gradeCeiling: 10, order: 10, country: 'ca' },
  { id: 'math-11', label: 'Math 11', subjectGroup: 'math', gradeCeiling: 11, order: 11, country: 'ca' },
  { id: 'math-12', label: 'Math 12', subjectGroup: 'math', gradeCeiling: 12, order: 12, country: 'ca' },

  // Elementary (K-6)
  { id: 'elem-math', label: 'Elementary Math', subjectGroup: 'math', gradeCeiling: 6, order: 30, country: 'ca', keywords: ['k-6', 'elementary', 'math'] },
  { id: 'elem-english', label: 'Elementary English', subjectGroup: 'english', gradeCeiling: 6, order: 31, country: 'ca', keywords: ['k-6', 'elementary', 'ela', 'english'] },
  { id: 'elem-social', label: 'Elementary Social', subjectGroup: 'social', gradeCeiling: 6, order: 32, country: 'ca', keywords: ['k-6', 'elementary', 'social'] },
  { id: 'elem-science', label: 'Elementary Science', subjectGroup: 'science', gradeCeiling: 6, order: 33, country: 'ca', keywords: ['k-6', 'elementary', 'science'] },

  // Junior High (7-9)
  { id: 'jr-math', label: 'Jr high Math', subjectGroup: 'math', gradeCeiling: 9, order: 40, country: 'ca', keywords: ['junior high', '7-9', 'math'] },
  { id: 'jr-english', label: 'Jr high English', subjectGroup: 'english', gradeCeiling: 9, order: 41, country: 'ca', keywords: ['junior high', '7-9', 'ela', 'english'] },
  { id: 'jr-social', label: 'Jr high Social', subjectGroup: 'social', gradeCeiling: 9, order: 42, country: 'ca', keywords: ['junior high', '7-9', 'social'] },
  { id: 'jr-science', label: 'Jr high Science', subjectGroup: 'science', gradeCeiling: 9, order: 43, country: 'ca', keywords: ['junior high', '7-9', 'science'] },

  // High school Math (labels aligned to request)
  { id: 'gr10-math', label: 'Math 10', subjectGroup: 'math', gradeCeiling: 10, order: 50, country: 'ca' },
  { id: 'gr11-math', label: 'Math 20', subjectGroup: 'math', gradeCeiling: 11, order: 51, country: 'ca' },
  { id: 'gr12-math', label: 'Math 30', subjectGroup: 'math', gradeCeiling: 12, order: 52, country: 'ca' },

  // High school English
  { id: 'gr10-english', label: 'English 10', subjectGroup: 'english', gradeCeiling: 10, order: 60, country: 'ca' },
  { id: 'gr11-english', label: 'English 11', subjectGroup: 'english', gradeCeiling: 11, order: 61, country: 'ca' },
  { id: 'gr12-english', label: 'English 12', subjectGroup: 'english', gradeCeiling: 12, order: 62, country: 'ca' },

  // High school Social (numbering 10/20/30)
  { id: 'gr10-social', label: 'Social 10', subjectGroup: 'social', gradeCeiling: 10, order: 70, country: 'ca' },
  { id: 'gr11-social', label: 'Social 20', subjectGroup: 'social', gradeCeiling: 11, order: 71, country: 'ca' },
  { id: 'gr12-social', label: 'Social 30', subjectGroup: 'social', gradeCeiling: 12, order: 72, country: 'ca' },

  // High school Science
  { id: 'gr10-science', label: 'Science 10', subjectGroup: 'science', gradeCeiling: 10, order: 80, country: 'ca' },
  { id: 'gr11-science', label: 'Science 11', subjectGroup: 'science', gradeCeiling: 11, order: 81, country: 'ca' },
  { id: 'gr12-science', label: 'Science 12', subjectGroup: 'science', gradeCeiling: 12, order: 82, country: 'ca' }
];

// U.S.-specific courses
export const US_COURSES = [
  { id: 'algebra-1', label: 'Algebra 1', subjectGroup: 'math', gradeCeiling: 10, country: 'us' },
  { id: 'geometry', label: 'Geometry', subjectGroup: 'math', gradeCeiling: 10, country: 'us' },
  { id: 'algebra-2', label: 'Algebra 2', subjectGroup: 'math', gradeCeiling: 11, country: 'us' },
  { id: 'precalculus', label: 'Pre-Calculus', subjectGroup: 'math', gradeCeiling: 12, country: 'us' },
  { id: 'english-9', label: 'English 9', subjectGroup: 'english', gradeCeiling: 9, country: 'us' },
  { id: 'english-10', label: 'English 10', subjectGroup: 'english', gradeCeiling: 10, country: 'us' },
  { id: 'english-11', label: 'English 11', subjectGroup: 'english', gradeCeiling: 11, country: 'us' },
  { id: 'english-12', label: 'English 12', subjectGroup: 'english', gradeCeiling: 12, country: 'us' },
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
