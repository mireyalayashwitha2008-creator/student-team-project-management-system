const express = require("express");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const PORT = process.env.PORT || 3000;

/* ---------- Database ---------- */
const db = new Database(path.join(__dirname, "teamflow.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date    TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT 'purple',
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assignee   TEXT NOT NULL DEFAULT 'Unassigned',
    due_date   TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'To do'
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
`);

const COLORS = ["purple", "blue", "green", "orange"];
const STATUSES = ["To do", "In progress", "Completed"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PROJECT_COLUMNS = `id, name, description, due_date AS dueDate, color, created_at AS createdAt`;
const TASK_COLUMNS = `id, title, project_id AS projectId, assignee, due_date AS dueDate, status`;

const q = {
  allProjects: db.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects ORDER BY rowid DESC`),
  allTasks: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks ORDER BY rowid DESC`),
  getProject: db.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`),
  getTask: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`),
  insertProject: db.prepare(
    `INSERT INTO projects (id, name, description, due_date, color, created_at)
     VALUES (@id, @name, @description, @dueDate, @color, @createdAt)`
  ),
  insertTask: db.prepare(
    `INSERT INTO tasks (id, title, project_id, assignee, due_date, status)
     VALUES (@id, @title, @projectId, @assignee, @dueDate, @status)`
  ),
  deleteProject: db.prepare(`DELETE FROM projects WHERE id = ?`),
  deleteTask: db.prepare(`DELETE FROM tasks WHERE id = ?`),
  countProjects: db.prepare(`SELECT COUNT(*) AS n FROM projects`)
};

/* Seed the same starter data the frontend used to create locally */
function seed() {
  if (q.countProjects.get().n > 0) return;
  const projectId = "demo-project";
  const run = db.transaction(() => {
    q.insertProject.run({
      id: projectId,
      name: "Student Team Project Management System",
      description: "A shared space to plan academic projects, assign tasks, and track team progress.",
      dueDate: "",
      color: "purple",
      createdAt: new Date().toISOString()
    });
    // inserted in reverse because the API returns newest-first
    [
      ["demo-task-3", "Prepare project documentation", "To do"],
      ["demo-task-2", "Design the user interface", "In progress"],
      ["demo-task-1", "Plan the project features", "Completed"]
    ].forEach(([id, title, status]) =>
      q.insertTask.run({ id, title, projectId, assignee: "Team member", dueDate: "", status })
    );
  });
  run();
}
seed();

/* ---------- Helpers ---------- */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const clean = (value, max) => String(value ?? "").trim().slice(0, max);

function cleanDate(value) {
  const v = String(value ?? "").trim();
  if (v === "") return "";
  if (!DATE_RE.test(v) || Number.isNaN(new Date(`${v}T00:00:00`).getTime())) {
    throw new HttpError(400, "Dates must use the format YYYY-MM-DD.");
  }
  return v;
}

/* ---------- App ---------- */
const app = express();
app.use(express.json({ limit: "100kb" }));

/* GET everything the dashboard needs in one request */
app.get("/api/state", (req, res) => {
  res.json({ projects: q.allProjects.all(), tasks: q.allTasks.all() });
});

/* Projects */
app.get("/api/projects", (req, res) => res.json(q.allProjects.all()));

app.post("/api/projects", (req, res) => {
  const name = clean(req.body.name, 70);
  if (!name) throw new HttpError(400, "Project name is required.");

  const color = COLORS.includes(req.body.color) ? req.body.color : "purple";
  const project = {
    id: crypto.randomUUID(),
    name,
    description: clean(req.body.description, 240),
    dueDate: cleanDate(req.body.dueDate),
    color,
    createdAt: new Date().toISOString()
  };
  q.insertProject.run(project);
  res.status(201).json(q.getProject.get(project.id));
});

app.delete("/api/projects/:id", (req, res) => {
  const result = q.deleteProject.run(req.params.id); // tasks are removed by ON DELETE CASCADE
  if (!result.changes) throw new HttpError(404, "Project not found.");
  res.status(204).end();
});

/* Tasks */
app.get("/api/tasks", (req, res) => res.json(q.allTasks.all()));

app.post("/api/tasks", (req, res) => {
  const title = clean(req.body.title, 100);
  if (!title) throw new HttpError(400, "Task title is required.");

  const projectId = String(req.body.projectId ?? "");
  if (!q.getProject.get(projectId)) throw new HttpError(400, "Please choose a valid project.");

  const status = req.body.status === undefined ? "To do" : req.body.status;
  if (!STATUSES.includes(status)) throw new HttpError(400, "Invalid status.");

  const task = {
    id: crypto.randomUUID(),
    title,
    projectId,
    assignee: clean(req.body.assignee, 50) || "Unassigned",
    dueDate: cleanDate(req.body.dueDate),
    status
  };
  q.insertTask.run(task);
  res.status(201).json(q.getTask.get(task.id));
});

app.patch("/api/tasks/:id", (req, res) => {
  const existing = q.getTask.get(req.params.id);
  if (!existing) throw new HttpError(404, "Task not found.");

  const updated = { ...existing };
  if (req.body.title !== undefined) {
    updated.title = clean(req.body.title, 100);
    if (!updated.title) throw new HttpError(400, "Task title cannot be empty.");
  }
  if (req.body.assignee !== undefined) {
    updated.assignee = clean(req.body.assignee, 50) || "Unassigned";
  }
  if (req.body.dueDate !== undefined) updated.dueDate = cleanDate(req.body.dueDate);
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) throw new HttpError(400, "Invalid status.");
    updated.status = req.body.status;
  }

  db.prepare(
    `UPDATE tasks SET title = @title, assignee = @assignee, due_date = @dueDate, status = @status WHERE id = @id`
  ).run(updated);
  res.json(q.getTask.get(req.params.id));
});

app.delete("/api/tasks/:id", (req, res) => {
  const result = q.deleteTask.run(req.params.id);
  if (!result.changes) throw new HttpError(404, "Task not found.");
  res.status(204).end();
});

/* Unknown API routes -> JSON 404 */
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

/* Frontend */
app.use(express.static(path.join(__dirname, "public")));

/* Error handler */
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`TeamFlow running at http://localhost:${PORT}`);
});
