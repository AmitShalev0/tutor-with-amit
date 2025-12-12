import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { CANONICAL_COURSES, US_COURSES } = require('./courses-data.cjs');

export function getDefaultCourses() {
  return CANONICAL_COURSES;
}

export function getUsCourses() {
  return US_COURSES;
}
