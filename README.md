# TeamFlow backend

This dependency-free Node.js server serves the frontend and provides the JSON API
used by `frontend/script.js`. Workspace data is stored in
`database/teamflow.json`, created automatically on the first write.

## Run

From the project root:

```powershell
node .\backend\server.js
```

Or from this directory:

```powershell
npm start
```

Open <http://127.0.0.1:3000>. Set the `PORT` environment variable to use another
port.

## API

- `GET /api/state` — return `{ "state": { "projects": [], "tasks": [] } }`
- `POST /api/projects` — create a project (`name`, optional `description`,
  `dueDate`, `color`)
- `DELETE /api/projects/:id` — delete a project and its tasks
- `POST /api/tasks` — create a task (`title`, `projectId`, optional `assignee`,
  `dueDate`, `status`)
- `PATCH /api/tasks/:id` — update task `status`
- `DELETE /api/tasks/:id` — delete a task

Mutation requests and responses use JSON. Validation errors return an `error`
message with a 4xx status.
