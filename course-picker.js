(function (global) {
  const DEFAULT_COURSES = [
    { id: 'math-k6', label: 'Math K-6', subjectGroup: 'math', gradeCeiling: 6 },
    { id: 'math-7-9', label: 'Math 7-9', subjectGroup: 'math', gradeCeiling: 9 },
    { id: 'english-k6', label: 'English K-6', subjectGroup: 'english', gradeCeiling: 6 },
    { id: 'english-7-9', label: 'English 7-9', subjectGroup: 'english', gradeCeiling: 9 },
    { id: 'social-k6', label: 'Social K-6', subjectGroup: 'social', gradeCeiling: 6 },
    { id: 'social-7-9', label: 'Social 7-9', subjectGroup: 'social', gradeCeiling: 9 },
    { id: 'science-k6', label: 'Science K-6', subjectGroup: 'science', gradeCeiling: 6 },
    { id: 'science-7-9', label: 'Science 7-9', subjectGroup: 'science', gradeCeiling: 9 },
    { id: 'french-k6', label: 'French K-6', subjectGroup: 'french', gradeCeiling: 6 },
    { id: 'french-7-9', label: 'French 7-9', subjectGroup: 'french', gradeCeiling: 9 },
    { id: 'math-10', label: 'Math 10', subjectGroup: 'math', gradeCeiling: 10 },
    { id: 'math-20', label: 'Math 20', subjectGroup: 'math', gradeCeiling: 11 },
    { id: 'math-30', label: 'Math 30', subjectGroup: 'math', gradeCeiling: 12 },
    { id: 'science-10', label: 'Science 10', subjectGroup: 'science', gradeCeiling: 10 },
    { id: 'science-20', label: 'Science 20', subjectGroup: 'science', gradeCeiling: 11 },
    { id: 'science-30', label: 'Science 30', subjectGroup: 'science', gradeCeiling: 12 },
    { id: 'social-10', label: 'Social 10', subjectGroup: 'social', gradeCeiling: 10 },
    { id: 'social-20', label: 'Social 20', subjectGroup: 'social', gradeCeiling: 11 },
    { id: 'social-30', label: 'Social 30', subjectGroup: 'social', gradeCeiling: 12 },
    { id: 'english-10', label: 'English 10', subjectGroup: 'english', gradeCeiling: 10 },
    { id: 'english-20', label: 'English 20', subjectGroup: 'english', gradeCeiling: 11 },
    { id: 'english-30', label: 'English 30', subjectGroup: 'english', gradeCeiling: 12 },
    { id: 'french-10', label: 'French 10', subjectGroup: 'french', gradeCeiling: 10 },
    { id: 'french-20', label: 'French 20', subjectGroup: 'french', gradeCeiling: 11 },
    { id: 'french-30', label: 'French 30', subjectGroup: 'french', gradeCeiling: 12 },
    { id: 'physics-20', label: 'Physics 20', subjectGroup: 'science', gradeCeiling: 11 },
    { id: 'physics-30', label: 'Physics 30', subjectGroup: 'science', gradeCeiling: 12 },
    { id: 'biology-20', label: 'Biology 20', subjectGroup: 'science', gradeCeiling: 11 },
    { id: 'biology-30', label: 'Biology 30', subjectGroup: 'science', gradeCeiling: 12 },
    { id: 'chemistry-20', label: 'Chemistry 20', subjectGroup: 'science', gradeCeiling: 11 },
    { id: 'chemistry-30', label: 'Chemistry 30', subjectGroup: 'science', gradeCeiling: 12 }
  ];

  const SUBJECTS = [
    { id: 'math', label: 'Math' },
    { id: 'english', label: 'English / ELA' },
    { id: 'science', label: 'Science' },
    { id: 'social', label: 'Social' },
    { id: 'other', label: 'Other' }
  ];

  const LEVELS = [
    { id: 'elementary', label: 'Elementary (K-6)', maxGrade: 6 },
    { id: 'jr-high', label: 'Junior High (7-9)', maxGrade: 9 },
    { id: 'high-school', label: 'High School (10-12)', maxGrade: 12 },
    { id: 'other', label: 'Other', maxGrade: 12 }
  ];

  const COUNTRIES = [
    { id: 'ca', label: 'Canada' },
    { id: 'us', label: 'United States' },
    { id: 'other', label: 'Other' }
  ];

  function deriveLevel(gradeCeiling) {
    if (gradeCeiling <= 6) return 'elementary';
    if (gradeCeiling <= 9) return 'jr-high';
    return 'high-school';
  }

  function normalizeCourse(course) {
    const gradeCeiling = typeof course.gradeCeiling === 'number' ? course.gradeCeiling : 12;
    return {
      id: course.id || `course-${course.label}`,
      label: course.label || 'Course',
      subjectGroup: course.subjectGroup || 'other',
      gradeCeiling,
      level: course.level || deriveLevel(gradeCeiling),
      school: course.school || null,
      country: course.country || 'any'
    };
  }

  function toOption(value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  class CoursePicker {
    constructor(container, options = {}) {
      this.container = container;
      this.options = options;
      this.state = {
        country: options.defaultCountry || 'ca',
        level: options.defaultLevel || 'high-school',
        subject: options.defaultSubject || 'math',
        school: options.defaultSchool || '',
        course: options.defaultCourse || '',
        tutorOnly: Boolean(options.defaultTutorOnly)
      };
      this.allCourses = [];
      this.filteredCourses = [];
    }

    async init() {
      this.container.classList.add('course-picker');
      this.buildSkeleton();
      await this.loadCourses();
      this.updateCourseOptions();
    }

    async loadCourses() {
      const customCourses = Array.isArray(this.options.catalog) ? this.options.catalog : [];
      let baseCourses = customCourses;

      if (!baseCourses.length && Array.isArray(global.ALL_COURSES)) {
        baseCourses = global.ALL_COURSES;
      }

      if (!baseCourses.length && Array.isArray(global.CANONICAL_COURSES)) {
        baseCourses = global.CANONICAL_COURSES;
      }

      if (!baseCourses.length) {
        try {
          const module = await import('./courses-data.js');
          baseCourses = module.ALL_COURSES || module.CANONICAL_COURSES || [];
        } catch (error) {
          // Non-fatal; fall back to local catalog.
          console.warn('course picker failed to load shared courses-data.js', error);
        }
      }

      if (!baseCourses.length) {
        baseCourses = DEFAULT_COURSES;
      }

      this.allCourses = baseCourses.map(normalizeCourse);

      const fetcher = this.options.fetchCourses;
      if (typeof fetcher === 'function') {
        try {
          const remote = await fetcher({ country: this.state.country });
          if (Array.isArray(remote) && remote.length) {
            this.allCourses = this.allCourses.concat(remote.map(normalizeCourse));
          }
        } catch (error) {
          // Non-fatal; fall back to local catalog.
          console.warn('course picker fetchCourses failed', error);
        }
      }
    }

    buildSkeleton() {
      const rows = document.createElement('div');
      rows.className = 'cp-row';

      this.countrySelect = document.createElement('select');
      this.countrySelect.className = 'cp-select';
      COUNTRIES.forEach((c) => this.countrySelect.appendChild(toOption(c.id, c.label)));
      this.countrySelect.value = this.state.country;

      this.levelSelect = document.createElement('select');
      this.levelSelect.className = 'cp-select';
      LEVELS.forEach((l) => this.levelSelect.appendChild(toOption(l.id, l.label)));
      this.levelSelect.value = this.state.level;

      this.subjectSelect = document.createElement('select');
      this.subjectSelect.className = 'cp-select';
      SUBJECTS.forEach((s) => this.subjectSelect.appendChild(toOption(s.id, s.label)));
      this.subjectSelect.value = this.state.subject;

      this.schoolInput = document.createElement('input');
      this.schoolInput.type = 'text';
      this.schoolInput.placeholder = 'School (optional)';
      this.schoolInput.className = 'cp-input';
      this.schoolInput.value = this.state.school;

      this.courseInput = document.createElement('input');
      this.courseInput.type = 'text';
      this.courseInput.placeholder = 'Course (type to search)';
      this.courseInput.className = 'cp-input';
      this.courseInput.autocomplete = 'off';
      this.courseList = document.createElement('datalist');
      this.courseList.id = `course-list-${Math.random().toString(36).slice(2, 8)}`;
      this.courseInput.setAttribute('list', this.courseList.id);
      this.courseInput.value = this.state.course;

      this.tutorCheckbox = document.createElement('input');
      this.tutorCheckbox.type = 'checkbox';
      this.tutorCheckbox.checked = this.state.tutorOnly;
      this.tutorCheckbox.id = `cp-tutor-only-${Math.random().toString(36).slice(2, 8)}`;

      const tutorLabel = document.createElement('label');
      tutorLabel.textContent = 'Only show tutors offering this course';
      tutorLabel.htmlFor = this.tutorCheckbox.id;
      tutorLabel.className = 'cp-tutor-label';

      const countryField = this.wrapField('Country', this.countrySelect);
      const levelField = this.wrapField('Level', this.levelSelect);
      const subjectField = this.wrapField('Subject', this.subjectSelect);
      const schoolField = this.wrapField('School', this.schoolInput);
      const courseField = this.wrapField('Course', this.courseInput);
      const tutorField = document.createElement('div');
      tutorField.className = 'cp-field cp-checkbox-field';
      tutorField.appendChild(this.tutorCheckbox);
      tutorField.appendChild(tutorLabel);

      rows.appendChild(countryField);
      rows.appendChild(levelField);
      rows.appendChild(subjectField);
      rows.appendChild(schoolField);
      rows.appendChild(courseField);
      rows.appendChild(this.courseList);
      rows.appendChild(tutorField);

      this.container.appendChild(rows);

      this.countrySelect.addEventListener('change', () => this.handleChange('country', this.countrySelect.value));
      this.levelSelect.addEventListener('change', () => this.handleChange('level', this.levelSelect.value));
      this.subjectSelect.addEventListener('change', () => this.handleChange('subject', this.subjectSelect.value));
      this.schoolInput.addEventListener('input', () => this.handleChange('school', this.schoolInput.value));
      this.courseInput.addEventListener('input', () => this.handleChange('course', this.courseInput.value));
      this.tutorCheckbox.addEventListener('change', () => this.handleChange('tutorOnly', this.tutorCheckbox.checked));
    }

    wrapField(labelText, node) {
      const field = document.createElement('div');
      field.className = 'cp-field';
      const label = document.createElement('label');
      label.textContent = labelText;
      field.appendChild(label);
      field.appendChild(node);
      return field;
    }

    updateCourseOptions() {
      const subject = this.state.subject;
      const level = this.state.level;
      const country = this.state.country;

      this.filteredCourses = this.allCourses.filter((course) => {
        const matchesSubject = subject === 'other' ? true : course.subjectGroup === subject;
        const matchesLevel = level === 'other' ? true : course.level === level;
        const matchesCountry = course.country === 'any' || course.country === country;
        return matchesSubject && matchesLevel && matchesCountry;
      });

      this.courseList.innerHTML = '';
      this.filteredCourses
        .sort((a, b) => (a.label || '').localeCompare(b.label || ''))
        .forEach((course) => {
          const option = document.createElement('option');
          option.value = course.label;
          option.textContent = course.label;
          this.courseList.appendChild(option);
        });
    }

    handleChange(key, value) {
      this.state[key] = value;
      if (['subject', 'level', 'country'].includes(key)) {
        this.updateCourseOptions();
      }
      if (typeof this.options.onChange === 'function') {
        this.options.onChange(this.getValue());
      }
    }

    getValue() {
      return {
        country: this.state.country,
        level: this.state.level,
        subject: this.state.subject,
        school: this.state.school.trim(),
        course: this.state.course.trim(),
        tutorOnly: Boolean(this.state.tutorOnly),
        matchingCourses: this.filteredCourses
      };
    }
  }

  const api = {
    init(container, options = {}) {
      const target = typeof container === 'string' ? document.querySelector(container) : container;
      if (!target) return null;
      const picker = new CoursePicker(target, options);
      picker.init();
      return picker;
    }
  };

  global.CoursePicker = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => autoInit());
  } else {
    autoInit();
  }

  function autoInit() {
    const nodes = document.querySelectorAll('[data-course-picker]');
    nodes.forEach((node) => {
      if (!node.dataset.coursePickerInit) {
        node.dataset.coursePickerInit = 'true';
        api.init(node, {});
      }
    });
  }
})(window);
