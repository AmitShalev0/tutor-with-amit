import { CANONICAL_COURSES, COURSE_CATALOG_VERSION_VALUE } from './courses-data.js';
export { CANONICAL_COURSES, COURSE_CATALOG_VERSION_VALUE };


export const COURSE_CATALOG = [
  {
    id: 'elementary',
    label: 'Elementary (K-6)',
    description: 'Core elementary courses',
    items: CANONICAL_COURSES.filter((c) => c.gradeCeiling === 6)
  },
  {
    id: 'jr-high',
    label: 'Junior High (7-9)',
    description: 'Core junior high courses',
    items: CANONICAL_COURSES.filter((c) => c.gradeCeiling === 9)
  },
  {
    id: 'high-school',
    label: 'High School (10-12)',
    description: 'Core senior high courses',
    items: CANONICAL_COURSES.filter((c) => c.gradeCeiling >= 10)
  }
];

export function slugifyCourseLabel(label) {
  return (label || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'course-' + Date.now().toString(36);
}

export function flattenCatalog(catalog = COURSE_CATALOG) {
  const output = [];
  catalog.forEach((group) => {
    const items = Array.isArray(group.items) ? group.items : [];
    items.forEach((item) => {
      output.push({
        groupId: group.id,
        groupLabel: group.label,
        id: item.id,
        label: item.label,
        keywords: item.keywords || [],
        subjectGroup: item.subjectGroup,
        gradeCeiling: item.gradeCeiling,
        order: item.order
      });
    });
  });
  return output;
}

export function buildCourseIndex(courses = CANONICAL_COURSES) {
  const byId = new Map();
  const byLabel = new Map();
  const bySlug = new Map();

  courses.forEach((course) => {
    const normalized = { ...course };
    normalized.id = normalized.id || slugifyCourseLabel(normalized.label);
    const labelKey = (normalized.label || '').toLowerCase();
    const slug = slugifyCourseLabel(normalized.label);
    byId.set(normalized.id, normalized);
    if (labelKey) {
      byLabel.set(labelKey, normalized);
    }
    if (slug) {
      bySlug.set(slug, normalized);
    }
  });

  return { byId, byLabel, bySlug };
}

export function findCourseByLabel(label, index = buildCourseIndex()) {
  if (!label) return null;
  const normalized = label.trim().toLowerCase();
  if (index.byLabel.has(normalized)) return index.byLabel.get(normalized);
  const slug = slugifyCourseLabel(label);
  if (index.bySlug.has(slug)) return index.bySlug.get(slug);
  return null;
}

export function sortCourses(courses = []) {
  return [...courses].sort((a, b) => {
    const orderA = typeof a.order === 'number' ? a.order : 999;
    const orderB = typeof b.order === 'number' ? b.order : 999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.label || '').localeCompare(b.label || '');
  });
}