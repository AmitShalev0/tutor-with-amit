export const COURSE_CATALOG_VERSION_VALUE = 2;

// Canonical course list requested by the admin.
export const CANONICAL_COURSES = [
  // Math by grade (skip Math 20 — already in DB)
  { id: 'math-1', label: 'Math 1', subjectGroup: 'math', gradeCeiling: 1, order: 1 },
  { id: 'math-2', label: 'Math 2', subjectGroup: 'math', gradeCeiling: 2, order: 2 },
  { id: 'math-3', label: 'Math 3', subjectGroup: 'math', gradeCeiling: 3, order: 3 },
  { id: 'math-4', label: 'Math 4', subjectGroup: 'math', gradeCeiling: 4, order: 4 },
  { id: 'math-5', label: 'Math 5', subjectGroup: 'math', gradeCeiling: 5, order: 5 },
  { id: 'math-6', label: 'Math 6', subjectGroup: 'math', gradeCeiling: 6, order: 6 },
  { id: 'math-7', label: 'Math 7', subjectGroup: 'math', gradeCeiling: 7, order: 7 },
  { id: 'math-8', label: 'Math 8', subjectGroup: 'math', gradeCeiling: 8, order: 8 },
  { id: 'math-9', label: 'Math 9', subjectGroup: 'math', gradeCeiling: 9, order: 9 },
  { id: 'math-10', label: 'Math 10', subjectGroup: 'math', gradeCeiling: 10, order: 10 },
  { id: 'math-11', label: 'Math 11', subjectGroup: 'math', gradeCeiling: 11, order: 11 },
  { id: 'math-12', label: 'Math 12', subjectGroup: 'math', gradeCeiling: 12, order: 12 },

  // Elementary (K-6)
  { id: 'elem-math', label: 'Elementary Math', subjectGroup: 'math', gradeCeiling: 6, order: 30, keywords: ['k-6', 'elementary', 'math'] },
  { id: 'elem-english', label: 'Elementary English', subjectGroup: 'english', gradeCeiling: 6, order: 31, keywords: ['k-6', 'elementary', 'ela', 'english'] },
  { id: 'elem-social', label: 'Elementary Social', subjectGroup: 'social', gradeCeiling: 6, order: 32, keywords: ['k-6', 'elementary', 'social'] },
  { id: 'elem-science', label: 'Elementary Science', subjectGroup: 'science', gradeCeiling: 6, order: 33, keywords: ['k-6', 'elementary', 'science'] },

  // Junior High (7-9)
  { id: 'jr-math', label: 'Jr high Math', subjectGroup: 'math', gradeCeiling: 9, order: 40, keywords: ['junior high', '7-9', 'math'] },
  { id: 'jr-english', label: 'Jr high English', subjectGroup: 'english', gradeCeiling: 9, order: 41, keywords: ['junior high', '7-9', 'ela', 'english'] },
  { id: 'jr-social', label: 'Jr high Social', subjectGroup: 'social', gradeCeiling: 9, order: 42, keywords: ['junior high', '7-9', 'social'] },
  { id: 'jr-science', label: 'Jr high Science', subjectGroup: 'science', gradeCeiling: 9, order: 43, keywords: ['junior high', '7-9', 'science'] },

  // High school Math (labels aligned to request)
  { id: 'gr10-math', label: 'Math 10', subjectGroup: 'math', gradeCeiling: 10, order: 50 },
  { id: 'gr11-math', label: 'Math 11', subjectGroup: 'math', gradeCeiling: 11, order: 51 },
  { id: 'gr12-math', label: 'Math 12', subjectGroup: 'math', gradeCeiling: 12, order: 52 },

  // High school English
  { id: 'gr10-english', label: 'English 10', subjectGroup: 'english', gradeCeiling: 10, order: 60 },
  { id: 'gr11-english', label: 'English 11', subjectGroup: 'english', gradeCeiling: 11, order: 61 },
  { id: 'gr12-english', label: 'English 12', subjectGroup: 'english', gradeCeiling: 12, order: 62 },

  // High school Social (numbering 10/20/30)
  { id: 'gr10-social', label: 'Social 10', subjectGroup: 'social', gradeCeiling: 10, order: 70 },
  { id: 'gr11-social', label: 'Social 20', subjectGroup: 'social', gradeCeiling: 11, order: 71 },
  { id: 'gr12-social', label: 'Social 30', subjectGroup: 'social', gradeCeiling: 12, order: 72 },

  // High school Science
  { id: 'gr10-science', label: 'Science 10', subjectGroup: 'science', gradeCeiling: 10, order: 80 },
  { id: 'gr11-science', label: 'Science 11', subjectGroup: 'science', gradeCeiling: 11, order: 81 },
  { id: 'gr12-science', label: 'Science 12', subjectGroup: 'science', gradeCeiling: 12, order: 82 }
];

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