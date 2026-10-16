// Student Registration module
// Data is stored in localStorage under the key "students"

const STORAGE_KEY = "students";

const sampleStudents = [
  { rollNo: "23CS001", name: "Arjun Reddy", dob: "2005-03-14", gender: "Male", email: "arjun@college.edu", phone: "9876543210", department: "CSE", year: "2" },
  { rollNo: "23CS002", name: "Priya Sharma", dob: "2005-07-22", gender: "Female", email: "priya@college.edu", phone: "9876543211", department: "CSE", year: "2" },
  { rollNo: "23CS003", name: "Kiran Kumar", dob: "2005-01-19", gender: "Male", email: "kiran@college.edu", phone: "9876543213", department: "CSE", year: "2" },
  { rollNo: "23CS004", name: "Sneha Patel", dob: "2005-09-02", gender: "Female", email: "sneha@college.edu", phone: "9876543214", department: "CSE", year: "2" },
  { rollNo: "23EC001", name: "Rahul Verma", dob: "2004-11-05", gender: "Male", email: "rahul@college.edu", phone: "9876543212", department: "ECE", year: "2" },
  { rollNo: "23EC002", name: "Ananya Iyer", dob: "2005-04-11", gender: "Female", email: "ananya@college.edu", phone: "9876543215", department: "ECE", year: "2" },
  { rollNo: "23EE001", name: "Vikram Singh", dob: "2004-12-27", gender: "Male", email: "vikram@college.edu", phone: "9876543216", department: "EEE", year: "2" },
  { rollNo: "23EE002", name: "Divya Nair", dob: "2005-06-08", gender: "Female", email: "divya@college.edu", phone: "9876543217", department: "EEE", year: "2" },
  { rollNo: "23ME001", name: "Mohammed Faiz", dob: "2005-02-15", gender: "Male", email: "faiz@college.edu", phone: "9876543218", department: "MECH", year: "2" },
  { rollNo: "23ME002", name: "Lakshmi Prasad", dob: "2004-10-30", gender: "Female", email: "lakshmi@college.edu", phone: "9876543219", department: "MECH", year: "2" },
  { rollNo: "23CE001", name: "Rohan Gupta", dob: "2005-08-21", gender: "Male", email: "rohan@college.edu", phone: "9876543220", department: "CIVIL", year: "2" },
  { rollNo: "23CE002", name: "Meghana Rao", dob: "2005-05-03", gender: "Female", email: "meghana@college.edu", phone: "9876543221", department: "CIVIL", year: "2" }
];

function loadStudents() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    return JSON.parse(saved);
  }
  saveStudents(sampleStudents);
  return sampleStudents;
}

function saveStudents(students) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
}

function showMessage(text, type) {
  const msg = document.getElementById("regMessage");
  msg.textContent = text;
  msg.className = "message " + type;
}

function renderStudents() {
  const students = loadStudents();
  const tbody = document.getElementById("studentTable");
  tbody.innerHTML = "";

  if (students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9">No students registered yet.</td></tr>';
    return;
  }

  students.forEach((s) => {
    const row = document.createElement("tr");
    [s.rollNo, s.name, s.dob, s.gender, s.email, s.phone, s.department, s.year].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    const actionCell = document.createElement("td");
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "danger";
    deleteBtn.addEventListener("click", () => deleteStudent(s.rollNo));
    actionCell.appendChild(deleteBtn);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  });
}

function deleteStudent(rollNo) {
  const students = loadStudents().filter((s) => s.rollNo !== rollNo);
  saveStudents(students);
  renderStudents();
  showMessage("Student " + rollNo + " deleted.", "success");
}

document.getElementById("registrationForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const student = {
    rollNo: document.getElementById("rollNo").value.trim().toUpperCase(),
    name: document.getElementById("name").value.trim(),
    dob: document.getElementById("dob").value,
    gender: document.getElementById("gender").value,
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    department: document.getElementById("department").value,
    year: document.getElementById("year").value
  };

  const students = loadStudents();
  if (students.some((s) => s.rollNo === student.rollNo)) {
    showMessage("Roll number " + student.rollNo + " is already registered.", "error");
    return;
  }

  students.push(student);
  saveStudents(students);
  renderStudents();
  event.target.reset();
  showMessage("Student " + student.name + " registered successfully.", "success");
});

renderStudents();
