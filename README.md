# TeamFlow backend (Express + SQLite)

## Run it

```bash
npm install
npm start
```

Open http://localhost:3000. The server serves the frontend from `public/` and stores data in `teamflow.db`, which is created automatically on first run.

Requires Node.js 18 or newer.

## Structure

```
teamflow/
├── server.js        # REST API + static file server
├── package.json
└── public/
    ├── index.html   # unchanged
    ├── style.css    # unchanged
    └── script.js    # updated: uses fetch() instead of localStorage
```

## API

| Method | Endpoint            | Body                                                    | Result            |
|--------|---------------------|---------------------------------------------------------|-------------------|
| GET    | /api/state          | –                                                       | `{projects, tasks}` |
| GET    | /api/projects       | –                                                       | list of projects  |
| POST   | /api/projects       | `name`, `description`, `dueDate`, `color`               | created project   |
| DELETE | /api/projects/:id   | –                                                       | 204 (tasks cascade) |
| GET    | /api/tasks          | –                                                       | list of tasks     |
| POST   | /api/tasks          | `title`, `projectId`, `assignee`, `dueDate`, `status`   | created task      |
| PATCH  | /api/tasks/:id      | any of `title`, `assignee`, `dueDate`, `status`         | updated task      |
| DELETE | /api/tasks/:id      | –                                                       | 204               |

Errors come back as `{ "error": "message" }` with a 400/404/500 status.
