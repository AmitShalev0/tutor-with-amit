export const COURSE_CATALOG_VERSION_VALUE = 1;

export const COURSE_CATALOG = [
  {
    id: "alberta-k-6",
    label: "Alberta K-6",
    description: "Core Alberta elementary curriculum",
    items: [
      { id: "ab-k6-math-1", label: "Math Grade 1", keywords: ["mathematics", "elementary"] },
      { id: "ab-k6-ela-1", label: "English Language Arts Grade 1", keywords: ["language arts", "elementary"] },
      { id: "ab-k6-science-1", label: "Science Grade 1", keywords: ["elementary"] },
      { id: "ab-k6-social-1", label: "Social Studies Grade 1", keywords: ["elementary"] },

      { id: "ab-k6-math-2", label: "Math Grade 2", keywords: ["mathematics", "elementary"] },
      { id: "ab-k6-ela-2", label: "English Language Arts Grade 2", keywords: ["language arts"] },
      { id: "ab-k6-science-2", label: "Science Grade 2" },
      { id: "ab-k6-social-2", label: "Social Studies Grade 2" },

      { id: "ab-k6-math-3", label: "Math Grade 3" },
      { id: "ab-k6-ela-3", label: "English Language Arts Grade 3" },
      { id: "ab-k6-science-3", label: "Science Grade 3" },
      { id: "ab-k6-social-3", label: "Social Studies Grade 3" },

      { id: "ab-k6-math-4", label: "Math Grade 4" },
      { id: "ab-k6-ela-4", label: "English Language Arts Grade 4" },
      { id: "ab-k6-science-4", label: "Science Grade 4" },
      { id: "ab-k6-social-4", label: "Social Studies Grade 4" },

      { id: "ab-k6-math-5", label: "Math Grade 5" },
      { id: "ab-k6-ela-5", label: "English Language Arts Grade 5" },
      { id: "ab-k6-science-5", label: "Science Grade 5" },
      { id: "ab-k6-social-5", label: "Social Studies Grade 5" },

      { id: "ab-k6-math-6", label: "Math Grade 6" },
      { id: "ab-k6-ela-6", label: "English Language Arts Grade 6" },
      { id: "ab-k6-science-6", label: "Science Grade 6" },
      { id: "ab-k6-social-6", label: "Social Studies Grade 6" }
    ]
  },
  {
    id: "alberta-7-9",
    label: "Alberta Grades 7-9",
    description: "Junior high core curriculum",
    items: [
      { id: "ab-jh-math-7", label: "Math Grade 7" },
      { id: "ab-jh-ela-7", label: "English Language Arts Grade 7" },
      { id: "ab-jh-science-7", label: "Science Grade 7" },
      { id: "ab-jh-social-7", label: "Social Studies Grade 7" },

      { id: "ab-jh-science-8", label: "Science Grade 8" },
      { id: "ab-jh-social-8", label: "Social Studies Grade 8" },

      { id: "ab-jh-math-9", label: "Math Grade 9" },
      { id: "ab-jh-ela-9", label: "English Language Arts Grade 9" },
      { id: "ab-jh-science-9", label: "Science Grade 9" },
      { id: "ab-jh-social-9", label: "Social Studies Grade 9" },
      { id: "ab-jh-kand", label: "Knowledge & Employability Math" },
      { id: "ab-jh-french-immersion", label: "French Immersion Support (7-9)", keywords: ["french", "immersion"] }
    ]
  },
  {
    id: "alberta-10-12",
    label: "Alberta Grades 10-12",
    description: "Senior high core and diploma courses",
    items: [
      { id: "ab-sh-math-10c", label: "Math 10C" },
      { id: "ab-sh-math-20-1", label: "Math 20-1" },
      { id: "ab-sh-math-20-2", label: "Math 20-2" },
      { id: "ab-sh-math-30-1", label: "Math 30-1" },
      { id: "ab-sh-math-30-2", label: "Math 30-2" },
      { id: "ab-sh-math-31", label: "Math 31" },
      { id: "ab-sh-math-applied", label: "Math 15 Competencies" },

      { id: "ab-sh-ela-10-1", label: "English Language Arts 10-1" },
      { id: "ab-sh-ela-10-2", label: "English Language Arts 10-2" },
      { id: "ab-sh-ela-20-1", label: "English Language Arts 20-1" },
      { id: "ab-sh-ela-20-2", label: "English Language Arts 20-2" },
      { id: "ab-sh-ela-30-1", label: "English Language Arts 30-1" },
      { id: "ab-sh-ela-30-2", label: "English Language Arts 30-2" },

      { id: "ab-sh-science-10", label: "Science 10" },
      { id: "ab-sh-biology-20", label: "Biology 20" },
      { id: "ab-sh-biology-30", label: "Biology 30" },
      { id: "ab-sh-chemistry-20", label: "Chemistry 20" },
      { id: "ab-sh-chemistry-30", label: "Chemistry 30" },
      { id: "ab-sh-physics-20", label: "Physics 20" },
      { id: "ab-sh-physics-30", label: "Physics 30" },
      { id: "ab-sh-science-24", label: "Science 24" },

      { id: "ab-sh-social-10-1", label: "Social Studies 10-1" },
      { id: "ab-sh-social-20-1", label: "Social Studies 20-1" },
      { id: "ab-sh-social-30-1", label: "Social Studies 30-1" },
      { id: "ab-sh-social-30-2", label: "Social Studies 30-2" },

      { id: "ab-sh-francais-10", label: "Français 10-1 / 13" },
      { id: "ab-sh-diploma-prep", label: "Diploma Exam Preparation" }
    ]
  },
  {
    id: "ib-programme",
    label: "IB Programme",
    description: "International Baccalaureate pathways",
    items: [
      { id: "ib-pyp-support", label: "IB Primary Years Programme Support", keywords: ["pyp"] },
      { id: "ib-myp-math", label: "IB MYP Mathematics", keywords: ["myp"] },
      { id: "ib-myp-sciences", label: "IB MYP Sciences" },
      { id: "ib-dp-math-aa-sl", label: "IB DP Mathematics: Analysis & Approaches SL", keywords: ["dp"] },
      { id: "ib-dp-math-aa-hl", label: "IB DP Mathematics: Analysis & Approaches HL" },
      { id: "ib-dp-math-ai-sl", label: "IB DP Mathematics: Applications & Interpretation SL" },
      { id: "ib-dp-physics-sl", label: "IB DP Physics SL" },
      { id: "ib-dp-physics-hl", label: "IB DP Physics HL" },
      { id: "ib-dp-chemistry-sl", label: "IB DP Chemistry SL" },
      { id: "ib-dp-chemistry-hl", label: "IB DP Chemistry HL" },
      { id: "ib-dp-biology-sl", label: "IB DP Biology SL" },
      { id: "ib-dp-biology-hl", label: "IB DP Biology HL" },
      { id: "ib-dp-english", label: "IB DP English Language & Literature" },
      { id: "ib-extended-essay", label: "IB Extended Essay Coaching" }
    ]
  },
  {
    id: "ap-programme",
    label: "Advanced Placement",
    description: "College Board AP courses",
    items: [
      { id: "ap-calculus-ab", label: "AP Calculus AB" },
      { id: "ap-calculus-bc", label: "AP Calculus BC" },
      { id: "ap-physics-1", label: "AP Physics 1" },
      { id: "ap-physics-c", label: "AP Physics C: Mechanics" },
      { id: "ap-chemistry", label: "AP Chemistry" },
      { id: "ap-biology", label: "AP Biology" },
      { id: "ap-statistics", label: "AP Statistics" },
      { id: "ap-english-lang", label: "AP English Language & Composition" },
      { id: "ap-english-lit", label: "AP English Literature & Composition" },
      { id: "ap-world-history", label: "AP World History" }
    ]
  },
  {
    id: "enrichment-test-prep",
    label: "Enrichment & Test Prep",
    description: "Additional supports outside core curriculum",
    items: [
      { id: "enrich-ssat", label: "SSAT Preparation" },
      { id: "enrich-act", label: "ACT Preparation" },
      { id: "enrich-sat", label: "SAT Preparation" },
      { id: "enrich-study-skills", label: "Study Skills & Organization" },
      { id: "enrich-math-contests", label: "Math Contest Coaching" }
    ]
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
        keywords: item.keywords || []
      });
    });
  });
  return output;
}