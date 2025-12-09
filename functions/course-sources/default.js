const BASE_COURSES = [
  { id: 'math-10', label: 'Math 10', subjectGroup: 'math', gradeCeiling: 10, country: 'ca' },
  { id: 'math-11', label: 'Math 11', subjectGroup: 'math', gradeCeiling: 11, country: 'ca' },
  { id: 'math-12', label: 'Math 12', subjectGroup: 'math', gradeCeiling: 12, country: 'ca' },
  { id: 'english-10', label: 'English 10', subjectGroup: 'english', gradeCeiling: 10, country: 'ca' },
  { id: 'english-11', label: 'English 11', subjectGroup: 'english', gradeCeiling: 11, country: 'ca' },
  { id: 'english-12', label: 'English 12', subjectGroup: 'english', gradeCeiling: 12, country: 'ca' },
  { id: 'social-10', label: 'Social 10', subjectGroup: 'social', gradeCeiling: 10, country: 'ca' },
  { id: 'social-20', label: 'Social 20', subjectGroup: 'social', gradeCeiling: 11, country: 'ca' },
  { id: 'social-30', label: 'Social 30', subjectGroup: 'social', gradeCeiling: 12, country: 'ca' },
  { id: 'science-10', label: 'Science 10', subjectGroup: 'science', gradeCeiling: 10, country: 'ca' },
  { id: 'science-11', label: 'Science 11', subjectGroup: 'science', gradeCeiling: 11, country: 'ca' },
  { id: 'science-12', label: 'Science 12', subjectGroup: 'science', gradeCeiling: 12, country: 'ca' }
];

const USA_COURSES = [
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

export function getDefaultCourses() {
  return BASE_COURSES;
}

export function getUsCourses() {
  return USA_COURSES;
}
