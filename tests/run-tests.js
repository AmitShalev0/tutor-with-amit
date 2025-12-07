const fs = require('fs');
const path = require('path');
const assert = require('assert');

const projectRoot = path.resolve(__dirname, '..');
const headerPath = path.join(projectRoot, 'header.html');
const headerSource = fs.readFileSync(headerPath, 'utf8');

function expectContains(haystack, needle, message) {
  assert(
    haystack.includes(needle),
    message || `Expected to find \"${needle}\" in source.`
  );
}

expectContains(headerSource, "'FIND TUTOR'", 'Student nav should include FIND TUTOR.');
expectContains(headerSource, "'FIND STUDENTS'", 'Tutor nav should include FIND STUDENTS.');
expectContains(headerSource, "'/tutor-search/'", 'FIND TUTOR should link to /tutor-search/.');
expectContains(headerSource, "'/student-search/'", 'FIND STUDENTS should link to /student-search/.');
expectContains(headerSource, "'/tutsessions/'", 'Tutor sessions link should point to /tutsessions/.');
expectContains(headerSource, "'/sessions/'", 'Student sessions link should point to /sessions/.');
expectContains(headerSource, "'LOG OUT'", 'Header should render LOG OUT button.');
expectContains(headerSource, "'/dashboard/'", 'Brand link should point at /dashboard/.');

const requiredPaths = [
  'student-search.html',
  'tutsessions.html',
  path.join('student-search', 'index.html'),
  path.join('tutor-search', 'index.html'),
  path.join('dashboard', 'index.html'),
  path.join('sessions', 'index.html'),
  path.join('tutsessions', 'index.html'),
  path.join('tutsession', 'index.html')
];

requiredPaths.forEach((relativePath) => {
  const fullPath = path.join(projectRoot, relativePath);
  assert(fs.existsSync(fullPath), `Expected ${relativePath} to exist.`);
});

console.log('All header navigation checks passed.');
