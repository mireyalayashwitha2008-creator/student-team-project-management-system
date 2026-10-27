const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const projectRoot = path.resolve(__dirname, "..");
const frontendDirectory = path.join(projectRoot, "frontend");
const dataFile = path.join(projectRoot, "database", "teamflow.json");
const port = Number.parseInt(process.env.PORT || "3000", 10);
const taskStatuses = new Set(["To do", "In progress", "Completed"]);
const projectColors = new Set(["purple", "blue", "green", "orange"]);
const emptyState = () => ({ projects: [], tasks: [] });

let state;
let mutationQueue = Promise.resolve();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function isValidDate(value) {
  if (value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateText(value, label, maxLength, required = false) {
  if (value === undefined && !required) return null;
  if (typeof value !== "string") return `${label} must be text.`;
  if (required && !value.trim()) return `${label} is required.`;
  if (value.length > maxLength) return `${label} must be ${maxLength} characters or fewer.`;
  return null;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error("Request body must be 1 MB or smaller.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }
    return body;
  } catch (error) {
    if (error.statusCode) throw error;
    const invalidJson = new Error("Request body must contain valid JSON.");
    invalidJson.statusCode = 400;
    throw invalidJson;
  }
}

async function persistState(nextState) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  await fs.rename(temporaryFile, dataFile);
}

function updateState(update) {
  const operation = mutationQueue.then(async () => {
    const nextState = JSON.parse(JSON.stringify(state));
    const result = update(nextState);
    await persistState(nextState);
    state = nextState;
    return result;
  });
  mutationQueue = operation.catch(() => {});
  return operation;
}

function stateResponse() {
  return { state };
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/state") {
    sendJson(response, 200, stateResponse());
    return;
  }

  if (request.method === "POST" && pathname === "/api/projects") {
    const body = await readJsonBody(request);
    const nameError = validateText(body.name, "Project name", 70, true);
    const descriptionError = validateText(body.description, "Description", 240);
    if (nameError || descriptionError) {
      sendError(response, 400, nameError || descriptionError);
      return;
    }
    if (body.dueDate !== undefined && !isValidDate(body.dueDate)) {
      sendError(response, 400, "Target deadline must be a valid date.");
      return;
    }
    if (body.color !== undefined && !projectColors.has(body.color)) {
      sendError(response, 400, "Project color is invalid.");
      return;
    }

    await updateState((nextState) => {
      nextState.projects.push({
        id: randomUUID(),
        name: body.name.trim(),
        description: (body.description || "").trim(),
        dueDate: body.dueDate || "",
        color: body.color || "purple",
        createdAt: new Date().toISOString()
      });
    });
    sendJson(response, 201, stateResponse());
    return;
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (request.method === "DELETE" && projectMatch) {
    const projectId = decodeURIComponent(projectMatch[1]);
    let found = false;
    await updateState((nextState) => {
      found = nextState.projects.some((project) => project.id === projectId);
      if (found) {
        nextState.projects = nextState.projects.filter((project) => project.id !== projectId);
        nextState.tasks = nextState.tasks.filter((task) => task.projectId !== projectId);
      }
    });
    if (!found) {
      sendError(response, 404, "Project not found.");
      return;
    }
    sendJson(response, 200, stateResponse());
    return;
  }

  if (request.method === "POST" && pathname === "/api/tasks") {
    const body = await readJsonBody(request);
    const titleError = validateText(body.title, "Task title", 100, true);
    const assigneeError = validateText(body.assignee, "Assignee", 50);
    if (titleError || assigneeError) {
      sendError(response, 400, titleError || assigneeError);
      return;
    }
    if (typeof body.projectId !== "string" || !state.projects.some((project) => project.id === body.projectId)) {
      sendError(response, 400, "Choose an existing project.");
      return;
    }
    if (body.dueDate !== undefined && !isValidDate(body.dueDate)) {
      sendError(response, 400, "Due date must be a valid date.");
      return;
    }
    if (body.status !== undefined && !taskStatuses.has(body.status)) {
      sendError(response, 400, "Task status is invalid.");
      return;
    }

    await updateState((nextState) => {
      if (!nextState.projects.some((project) => project.id === body.projectId)) {
        const error = new Error("Choose an existing project.");
        error.statusCode = 400;
        throw error;
      }
      nextState.tasks.push({
        id: randomUUID(),
        title: body.title.trim(),
        projectId: body.projectId,
        assignee: (body.assignee || "Unassigned").trim() || "Unassigned",
        dueDate: body.dueDate || "",
        status: body.status || "To do",
        createdAt: new Date().toISOString()
      });
    });
    sendJson(response, 201, stateResponse());
    return;
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === "PATCH") {
    const taskId = decodeURIComponent(taskMatch[1]);
    const body = await readJsonBody(request);
    if (!taskStatuses.has(body.status)) {
      sendError(response, 400, "Task status is invalid.");
      return;
    }
    let found = false;
    await updateState((nextState) => {
      const task = nextState.tasks.find((item) => item.id === taskId);
      if (task) {
        task.status = body.status;
        found = true;
      }
    });
    if (!found) {
      sendError(response, 404, "Task not found.");
      return;
    }
    sendJson(response, 200, stateResponse());
    return;
  }

  if (taskMatch && request.method === "DELETE") {
    const taskId = decodeURIComponent(taskMatch[1]);
    let found = false;
    await updateState((nextState) => {
      found = nextState.tasks.some((task) => task.id === taskId);
      if (found) nextState.tasks = nextState.tasks.filter((task) => task.id !== taskId);
    });
    if (!found) {
      sendError(response, 404, "Task not found.");
      return;
    }
    sendJson(response, 200, stateResponse());
    return;
  }

  sendError(response, 404, "API route not found.");
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

async function serveFrontend(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendError(response, 400, "Invalid URL path.");
    return;
  }
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^[/\\]+/, "");
  const filePath = path.resolve(frontendDirectory, relativePath);
  if (filePath !== frontendDirectory && !filePath.startsWith(`${frontendDirectory}${path.sep}`)) {
    sendError(response, 404, "Page not found.");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : file);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      sendError(response, 404, "Page not found.");
      return;
    }
    throw error;
  }
}

async function loadState() {
  try {
    const savedState = JSON.parse(await fs.readFile(dataFile, "utf8"));
    if (!savedState || !Array.isArray(savedState.projects) || !Array.isArray(savedState.tasks)) {
      throw new Error(`Workspace data in ${dataFile} has an invalid format.`);
    }
    return savedState;
  } catch (error) {
    if (error.code === "ENOENT") return emptyState();
    throw error;
  }
}

async function main() {
  state = await loadState();
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url.pathname);
      } else if (request.method === "GET" || request.method === "HEAD") {
        await serveFrontend(request, response, url.pathname);
      } else {
        sendError(response, 405, "Method not allowed.");
      }
    } catch (error) {
      if (error.statusCode) {
        sendError(response, error.statusCode, error.message);
        return;
      }
      console.error("Request failed:", error);
      if (!response.headersSent) sendError(response, 500, "The server could not complete the request.");
      else response.destroy();
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`TeamFlow is running at http://127.0.0.1:${port}`);
  });
}

main().catch((error) => {
  console.error("Could not start TeamFlow:", error);
  process.exitCode = 1;
});
