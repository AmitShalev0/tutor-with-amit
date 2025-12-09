(function (global) {
  const DEFAULT_COURSES = [
    { id: 'math-1', label: 'Math 1', subjectGroup: 'math', gradeCeiling: 1 },
    { id: 'math-2', label: 'Math 2', subjectGroup: 'math', gradeCeiling: 2 },
    { id: 'math-3', label: 'Math 3', subjectGroup: 'math', gradeCeiling: 3 },
    { id: 'math-4', label: 'Math 4', subjectGroup: 'math', gradeCeiling: 4 },
    { id: 'math-5', label: 'Math 5', subjectGroup: 'math', gradeCeiling: 5 },
    { id: 'math-6', label: 'Math 6', subjectGroup: 'math', gradeCeiling: 6 },
    { id: 'math-7', label: 'Math 7', subjectGroup: 'math', gradeCeiling: 7 },
    { id: 'math-8', label: 'Math 8', subjectGroup: 'math', gradeCeiling: 8 },
    { id: 'math-9', label: 'Math 9', subjectGroup: 'math', gradeCeiling: 9 },
    { id: 'math-10', label: 'Math 10', subjectGroup: 'math', gradeCeiling: 10 },
    { id: 'math-11', label: 'Math 11', subjectGroup: 'math', gradeCeiling: 11 },
    { id: 'math-12', label: 'Math 12', subjectGroup: 'math', gradeCeiling: 12 },
    { id: 'elem-math', label: 'Elementary Math', subjectGroup: 'math', gradeCeiling: 6 },
    { id: 'elem-english', label: 'Elementary English', subjectGroup: 'english', gradeCeiling: 6 },
    { id: 'elem-social', label: 'Elementary Social', subjectGroup: 'social', gradeCeiling: 6 },
    { id: 'elem-science', label: 'Elementary Science', subjectGroup: 'science', gradeCeiling: 6 },
    { id: 'jr-math', label: 'Jr high Math', subjectGroup: 'math', gradeCeiling: 9 },
    { id: 'jr-english', label: 'Jr high English', subjectGroup: 'english', gradeCeiling: 9 },
    { id: 'jr-social', label: 'Jr high Social', subjectGroup: 'social', gradeCeiling: 9 },
    { id: 'jr-science', label: 'Jr high Science', subjectGroup: 'science', gradeCeiling: 9 },
    { id: 'gr10-math', label: 'Math 10', subjectGroup: 'math', gradeCeiling: 10 },
    { id: 'gr11-math', label: 'Math 11', subjectGroup: 'math', gradeCeiling: 11 },
    { id: 'gr12-math', label: 'Math 12', subjectGroup: 'math', gradeCeiling: 12 },
    { id: 'gr10-english', label: 'English 10', subjectGroup: 'english', gradeCeiling: 10 },
    { id: 'gr11-english', label: 'English 11', subjectGroup: 'english', gradeCeiling: 11 },
    { id: 'gr12-english', label: 'English 12', subjectGroup:  'english', gradeCeiling: 12 },
    { id: 'gr10-social', label: 'Social 10', subjectGroup: 'social', gradeCeiling: 10 },
    { id: 'gr11-social', label: 'Social 20', subjectGroup: 'social', gradeCeiling: 11 },
    { id: 'gr12-social', label: 'Social 30', subjectGroup: 'social', gradeCeiling: 12 },
    { id: 'gr10-science', label: 'Science 10', subjectGroup: 'science', gradeCeiling: 10 },
    { id: 'gr11-science', label: 'Science 11', subjectGroup: 'science', gradeCeiling: 11 },
    { id: 'gr12-science', label: 'Science 12', subjectGroup: 'science', gradeCeiling: 12 }
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
      const customCourses = Array.isArray(this.options.catalog)
        ? this.options.catalog
        : (global.CANONICAL_COURSES || []);

      this.allCourses = (customCourses.length ? customCourses : DEFAULT_COURSES)
        .map(normalizeCourse);

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
