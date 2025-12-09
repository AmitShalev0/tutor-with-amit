import { getDefaultCourses, getUsCourses } from './default.js';

function deriveLevel(gradeCeiling) {
  if (gradeCeiling <= 6) return 'elementary';
  if (gradeCeiling <= 9) return 'jr-high';
  return 'high-school';
}

function normalizeCourse(course) {
  const gradeCeiling = typeof course.gradeCeiling === 'number' ? course.gradeCeiling : 12;
  return {
    id: course.id || `course-${Math.random().toString(36).slice(2, 8)}`,
    label: course.label || 'Course',
    subjectGroup: course.subjectGroup || 'other',
    gradeCeiling,
    level: course.level || deriveLevel(gradeCeiling),
    country: (course.country || 'any').toLowerCase()
  };
}

function filterCourses(courses, { subject = null, level = null, country = null }) {
  return courses
    .map(normalizeCourse)
    .filter((course) => {
      const matchesSubject = subject ? course.subjectGroup === subject : true;
      const matchesLevel = level ? course.level === level : true;
      const matchesCountry = country ? course.country === country || course.country === 'any' : true;
      return matchesSubject && matchesLevel && matchesCountry;
    })
    .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
}

export async function getCoursesFromSource({ country = 'ca', subject = null, level = null }) {
  const normalizedCountry = (country || 'ca').toLowerCase();
  const source = normalizedCountry === 'us' ? getUsCourses : getDefaultCourses;
  const baseCourses = source();
  return filterCourses(baseCourses, { subject, level, country: normalizedCountry });
}
