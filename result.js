// Student Result module
// Data is stored in localStorage under the key "results"

const STORAGE_KEY = "results";
const SUBJECTS = ["maths", "physics", "chemistry", "english", "programming"];
const PASS_MARK = 35;

const sampleResults = [
  { rollNo: "23CS001", name: "Arjun Reddy", semester: "3", maths: 85, physics: 78, chemistry: 72, english: 80, programming: 92 },
  { rollNo: "23CS002", name: "Priya Sharma", semester: "3", maths: 95, physics: 88, chemistry: 90, english: 86, programming: 97 },
  { rollNo: "23EC001", name: "Rahul Verma", semester: "3", maths: 30, physics: 55, chemistry: 48, english: 62, programming: 58 }
];

function loadResults() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    return JSON.parse(saved);
  }
  saveResults(sampleResults);
  return sampleResults;
}

function saveResults(results) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
}

function calculate(result) {
  const total = SUBJECTS.reduce((sum, subject) => sum + Number(result[subject]), 0);
  const percentage = total / SUBJECTS.length;
  const passed = SUBJECTS.every((subject) => Number(result[subject]) >= PASS_MARK);

  let grade;
  if (!passed) grade = "F";
  else if (percentage >= 90) grade = "O";
  else if (percentage >= 80) grade = "A+";
  else if (percentage >= 70) grade = "A";
  else if (percentage >= 60) grade = "B+";
  else if (percentage >= 50) grade = "B";
  else grade = "C";

  return { total, percentage: percentage.toFixed(2), grade, passed };
}

function showMessage(text, type) {
  const msg = document.getElementById("resMessage");
  msg.textContent = text;
  msg.className = "message " + type;
}

function renderResults() {
  const query = document.getElementById("search").value.trim().toUpperCase();
  const results = loadResults().filter((r) => r.rollNo.includes(query));
  const tbody = document.getElementById("resultTable");
  tbody.innerHTML = "";

  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13">No results found.</td></tr>';
    return;
  }

  results.forEach((r) => {
    const calc = calculate(r);
    const row = document.createElement("tr");
    const values = [r.rollNo, r.name, r.semester, ...SUBJECTS.map((s) => r[s]), calc.total, calc.percentage, calc.grade];
    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    const statusCell = document.createElement("td");
    statusCell.textContent = calc.passed ? "PASS" : "FAIL";
    statusCell.className = calc.passed ? "pass" : "fail";
    row.appendChild(statusCell);

    const actionCell = document.createElement("td");
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "danger";
    deleteBtn.addEventListener("click", () => deleteResult(r.rollNo, r.semester));
    actionCell.appendChild(deleteBtn);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  });
}

function deleteResult(rollNo, semester) {
  const results = loadResults().filter((r) => !(r.rollNo === rollNo && r.semester === semester));
  saveResults(results);
  renderResults();
  showMessage("Result of " + rollNo + " (Sem " + semester + ") deleted.", "success");
}

document.getElementById("resultForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const result = {
    rollNo: document.getElementById("rollNo").value.trim().toUpperCase(),
    name: document.getElementById("name").value.trim(),
    semester: document.getElementById("semester").value
  };
  SUBJECTS.forEach((subject) => {
    result[subject] = Number(document.getElementById(subject).value);
  });

  const results = loadResults();
  if (results.some((r) => r.rollNo === result.rollNo && r.semester === result.semester)) {
    showMessage("Result for " + result.rollNo + " in semester " + result.semester + " already exists.", "error");
    return;
  }

  results.push(result);
  saveResults(results);
  renderResults();
  event.target.reset();
  showMessage("Result saved for " + result.name + ".", "success");
});

document.getElementById("search").addEventListener("input", renderResults);

renderResults();
