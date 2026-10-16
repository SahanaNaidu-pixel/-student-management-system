# Student Management System

A simple college student management system built with HTML, CSS and JavaScript.

## Modules

| Module | Branch | Files |
|--------|--------|-------|
| Student Registration | `student-registration` | `registration.html`, `registration.js` |
| Student Result | `student-result` | `result.html`, `result.js` |

Both feature branches are merged into `main`.

## How to run

Open `index.html` in a browser. Data is saved in the browser's localStorage.

## Git workflow

```bash
git checkout -b student-registration   # build registration module
git checkout main
git checkout -b student-result         # build result module
git checkout main
git merge student-registration
git merge student-result
```
