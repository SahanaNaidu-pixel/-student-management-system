// Grading rules carried over from the original Student Result module

export const PASS_PERCENT = 35;

export function gradeFor(percentage, passed = true) {
  if (!passed) return "F";
  if (percentage >= 90) return "O";
  if (percentage >= 80) return "A+";
  if (percentage >= 70) return "A";
  if (percentage >= 60) return "B+";
  if (percentage >= 50) return "B";
  return "C";
}

// subjects: [{ marks, max_marks }]. A student passes only if every subject is at least 35%.
export function summarize(subjects) {
  const total = subjects.reduce((sum, s) => sum + s.marks, 0);
  const max = subjects.reduce((sum, s) => sum + s.max_marks, 0);
  const percentage = max ? Math.round((total / max) * 10000) / 100 : 0;
  const passed = subjects.length > 0 && subjects.every((s) => (s.marks / s.max_marks) * 100 >= PASS_PERCENT);
  return { total, max, percentage, passed, grade: gradeFor(percentage, passed) };
}
