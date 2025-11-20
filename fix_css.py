#!/usr/bin/env python3

with open('style.css', 'r', encoding='utf-8') as f:
    content = f.read()

old_css = '''/* Current time display */
.current-time {
  font-size: 0.8rem;
  color: var(--muted);
  text-align: right;
  margin-top: 4px;
  white-space: nowrap;
}'''

new_css = '''/* Time display wrapper */
.time-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* Current time display */
.current-time {
  font-size: 0.8rem;
  color: var(--muted);
  text-align: center;
  white-space: nowrap;
}'''

content = content.replace(old_css, new_css)

with open('style.css', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated style.css")
