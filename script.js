const STORAGE_KEY = "teamflow-student-projects-v1";

const starterData = {
  projects: [
    {
      id: "demo-project",
      name: "Student Team Project Management System",
      description: "A shared space to plan academic projects, assign tasks, and track team progress.",
      dueDate: "",
      color: "purple",
      createdAt: new Date().toISOString()
    }
  ],
  tasks: [
    { id: "demo-task-1", title: "Plan the project features", projectId: "demo-project", assignee: "Team member", dueDate: "", status: "Completed" },
    { id: "demo-task-2", title: "Design the user interface", projectId: "demo-project", assignee: "Team member", dueDate: "", status: "In progress" },
    { id: "demo-task-3", title: "Prepare project documentation", projectId: "demo-project", assignee: "Team member", dueDate: "", status: "To do" }
  ]
};

let state = loadState();
let currentFilter = "All";
let toastTimer;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.projects) && Array.isArray(parsed.tasks)) return parsed;
    }
  } catch (error) {
    console.warn("Could not load saved workspace data.", error);
  }
  return structuredClone(starterData);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast("Could not save data in this browser.");
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function initials(name) {
  const parts = String(name || "Team member").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "TM";
}

function formatDate(value) {
  if (!value) return "No deadline";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "No deadline";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function projectTasks(projectId) {
  return state.tasks.filter((task) => task.projectId === projectId);
}

function projectProgress(projectId) {
  const tasks = projectTasks(projectId);
  if (!tasks.length) return 0;
  return Math.round(tasks.filter((task) => task.status === "Completed").length / tasks.length * 100);
}

function renderStats() {
  $("#totalProjects").textContent = state.projects.length;
  $("#totalTasks").textContent = state.tasks.length;
  $("#completedTasks").textContent = state.tasks.filter((task) => task.status === "Completed").length;
  $("#inProgressTasks").textContent = state.tasks.filter((task) => task.status === "In progress").length;
}

function renderProjects() {
  const grid = $("#projectGrid");
  $("#emptyProjects").hidden = state.projects.length > 0;
  grid.innerHTML = state.projects.map((project) => {
    const tasks = projectTasks(project.id);
    const progress = projectProgress(project.id);
    const color = ["purple", "blue", "green", "orange"].includes(project.color) ? project.color : "purple";
    return `
      <article class="project-card">
        <div class="project-card-top">
          <div class="project-symbol ${color}">▤</div>
          <button class="more-button" data-delete-project="${escapeHTML(project.id)}" aria-label="Delete ${escapeHTML(project.name)}" title="Delete project">⋯</button>
        </div>
        <h3>${escapeHTML(project.name)}</h3>
        <p class="project-description">${escapeHTML(project.description || "No description added yet.")}</p>
        <div class="project-meta"><span>☑ ${tasks.length} task${tasks.length === 1 ? "" : "s"}</span><span>◷ ${escapeHTML(formatDate(project.dueDate))}</span></div>
        <div class="progress-heading"><span>Overall progress</span><strong>${progress}%</strong></div>
        <div class="progress-track" role="progressbar" aria-label="${escapeHTML(project.name)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><div class="progress-fill ${color}" style="width:${progress}%"></div></div>
      </article>`;
  }).join("");
  updateProjectOptions();
}

function updateProjectOptions() {
  const select = $("#taskProject");
  const previous = select.value;
  if (!state.projects.length) {
    select.innerHTML = '<option value="">Create a project first</option>';
    $("#openTaskModal").disabled = true;
    return;
  }
  $("#openTaskModal").disabled = false;
  select.innerHTML = state.projects.map((project) =>
    `<option value="${escapeHTML(project.id)}">${escapeHTML(project.name)}</option>`
  ).join("");
  if (state.projects.some((project) => project.id === previous)) select.value = previous;
}

function renderTasks() {
  const search = $("#taskSearch").value.trim().toLowerCase();
  const tasks = state.tasks.filter((task) => {
    const project = state.projects.find((item) => item.id === task.projectId);
    const matchesFilter = currentFilter === "All" || task.status === currentFilter;
    const matchesSearch = `${task.title} ${task.assignee} ${project?.name || ""}`.toLowerCase().includes(search);
    return matchesFilter && matchesSearch;
  });
  $("#taskTableBody").innerHTML = tasks.map((task) => {
    const project = state.projects.find((item) => item.id === task.projectId);
    const safeStatusClass = task.status.replace(/\s+/g, "-");
    return `
      <tr>
        <td>${escapeHTML(task.title)}</td>
        <td><span class="task-project"><i class="mini-dot"></i>${escapeHTML(project?.name || "Project removed")}</span></td>
        <td><span class="assignee"><i class="assignee-avatar">${escapeHTML(initials(task.assignee))}</i>${escapeHTML(task.assignee || "Unassigned")}</span></td>
        <td>${escapeHTML(formatDate(task.dueDate))}</td>
        <td>
          <select class="status-select status-${safeStatusClass}" data-task-status="${escapeHTML(task.id)}" aria-label="Status for ${escapeHTML(task.title)}">
            ${["To do", "In progress", "Completed"].map((status) =>
              `<option ${task.status === status ? "selected" : ""}>${status}</option>`
            ).join("")}
          </select>
        </td>
        <td><button class="delete-task" data-delete-task="${escapeHTML(task.id)}" aria-label="Delete task ${escapeHTML(task.title)}" title="Delete task">×</button></td>
      </tr>`;
  }).join("");
  $("#emptyTasks").style.display = tasks.length ? "none" : "block";
}

function render() {
  renderStats();
  renderProjects();
  renderTasks();
}

function openModal(id) {
  if (id === "taskModal" && state.projects.length === 0) {
    showToast("Create a project before adding a task.");
    openModal("projectModal");
    return;
  }
  const modal = document.getElementById(id);
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  const firstInput = modal.querySelector("input, textarea, select");
  if (firstInput) setTimeout(() => firstInput.focus(), 50);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function refreshStatusSelect(select) {
  select.className = `status-select status-${select.value.replace(/\s+/g, "-")}`;
}

$("#openProjectModal").addEventListener("click", () => openModal("projectModal"));
$("#bannerCreateProject").addEventListener("click", () => openModal("projectModal"));
$("#emptyCreateProject").addEventListener("click", () => openModal("projectModal"));
$("#openTaskModal").addEventListener("click", () => openModal("taskModal"));
$("#viewProjects").addEventListener("click", () => {
  $("#projects").scrollIntoView({ behavior: "smooth" });
});

$$("[data-close]").forEach((button) => {
  button.addEventListener("click", () => closeModal(button.dataset.close));
});

$$(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal(backdrop.id);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $$(".modal-backdrop.open").forEach((modal) => closeModal(modal.id));
  }
});

$("#projectForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get("projectName") || "").trim();
  if (!name) return;
  state.projects.unshift({
    id: makeId(),
    name,
    description: String(form.get("projectDescription") || "").trim(),
    dueDate: String(form.get("projectDueDate") || ""),
    color: String(form.get("projectColor") || "purple"),
    createdAt: new Date().toISOString()
  });
  saveState();
  render();
  event.currentTarget.reset();
  closeModal("projectModal");
  showToast("Project created successfully!");
});

$("#taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const title = String(form.get("taskName") || "").trim();
  const projectId = String(form.get("taskProject") || "");
  if (!title || !state.projects.some((project) => project.id === projectId)) {
    showToast("Please enter a task and choose a project.");
    return;
  }
  state.tasks.unshift({
    id: makeId(),
    title,
    projectId,
    assignee: String(form.get("taskAssignee") || "").trim() || "Unassigned",
    dueDate: String(form.get("taskDueDate") || ""),
    status: String(form.get("taskStatus") || "To do")
  });
  saveState();
  render();
  event.currentTarget.reset();
  closeModal("taskModal");
  showToast("Task added successfully!");
});

$$(".filter-tab").forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    $$(".filter-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    renderTasks();
  });
});

$("#taskSearch").addEventListener("input", renderTasks);

$("#taskTableBody").addEventListener("change", (event) => {
  const select = event.target.closest("[data-task-status]");
  if (!select) return;
  const task = state.tasks.find((item) => item.id === select.dataset.taskStatus);
  if (!task) return;
  task.status = select.value;
  saveState();
  refreshStatusSelect(select);
  render();
  showToast("Task status updated.");
});

$("#taskTableBody").addEventListener("click", (event) => {
  const taskButton = event.target.closest("[data-delete-task]");
  if (taskButton) {
    const task = state.tasks.find((item) => item.id === taskButton.dataset.deleteTask);
    if (!task || !confirm(`Delete the task "${task.title}"?`)) return;
    state.tasks = state.tasks.filter((item) => item.id !== task.id);
    saveState();
    render();
    showToast("Task deleted.");
    return;
  }

  const projectButton = event.target.closest("[data-delete-project]");
  if (projectButton) return;
});

$("#projectGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-project]");
  if (!button) return;
  const project = state.projects.find((item) => item.id === button.dataset.deleteProject);
  if (!project || !confirm(`Delete "${project.name}" and all its tasks?`)) return;
  state.projects = state.projects.filter((item) => item.id !== project.id);
  state.tasks = state.tasks.filter((item) => item.projectId !== project.id);
  saveState();
  render();
  showToast("Project and its tasks deleted.");
});

render();
