#!/usr/bin/env python3
import os

files = [
    "index.html",
    "booking.html", 
    "signup.html",
    "contact.html"
]

old_pattern = '''
    <div class="header-right">
        <label class="theme-switch" title="Toggle light/dark mode">
            <input type="checkbox" id="theme-toggle" aria-label="Toggle theme">
            <span class="switch-slider"></span>
        </label>
        <div id="current-time" class="current-time"></div>
    </div>
'''

new_pattern = '''
    <div class="header-right">
        <div class="time-display">
            <span id="current-time" class="current-time"></span>
            <label class="theme-switch" title="Toggle light/dark mode">
            <input type="checkbox" id="theme-toggle" aria-label="Toggle theme">
            <span class="switch-slider"></span>
        </label>
        </div>
    </div>
'''

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace(old_pattern, new_pattern)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Updated {filepath}")

print("Done!")
