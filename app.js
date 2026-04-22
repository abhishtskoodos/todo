import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDdMdFnaxh46cU62011Nf7uZwRzUkCBafY",
  authDomain: "test-56172.firebaseapp.com",
  databaseURL: "https://test-56172-default-rtdb.firebaseio.com",
  projectId: "test-56172",
  storageBucket: "test-56172.firebasestorage.app",
  messagingSenderId: "395932127335",
  appId: "1:395932127335:web:49190f722dff690f3c84c2",
  measurementId: "G-D8ZMC05ETF",
};

const STATUS_COLUMNS = [
  ["new", "New"],
  ["pending", "Pending"],
  ["started", "Started"],
  ["stuck", "Stuck"],
  ["partial_completed", "Partial Completed"],
  ["completed", "Completed"],
];
const PAGE_SIZE = 20;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
getStorage(app);

const state = {
  user: null,
  activeTaskId: null,
  taskById: new Map(),
  statusPages: new Map(),
  statusData: new Map(),
  statusUnsubscribers: new Map(),
  detailUnsubs: [],
  tableView: false,
  myTasksOnly: false,
};

const $ = (selector) => document.querySelector(selector);
const authView = $("#auth-view");
const appView = $("#app-view");
const authBadge = $("#auth-badge");
const boardView = $("#board-view");
const tableView = $("#table-view");
const taskTableBody = $("#task-table-body");
const taskDialog = $("#task-dialog");

function initBoardShell() {
  const tpl = document.querySelector("#kanban-column-template");
  boardView.innerHTML = "";

  STATUS_COLUMNS.forEach(([statusKey, title]) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.status = statusKey;
    node.querySelector("h3").textContent = title;
    const list = node.querySelector(".task-list");

    list.addEventListener("dragover", (event) => {
      event.preventDefault();
      list.classList.add("drag-over");
    });

    list.addEventListener("dragleave", () => list.classList.remove("drag-over"));

    list.addEventListener("drop", async (event) => {
      event.preventDefault();
      list.classList.remove("drag-over");
      const taskId = event.dataTransfer.getData("text/plain");
      if (!taskId) return;
      await moveTaskStatus(taskId, statusKey);
    });

    node.querySelector(".load-more").addEventListener("click", () => loadMoreStatus(statusKey));
    boardView.append(node);
  });
}

function baseStatusQuery(status, cursor = null) {
  const constraints = [where("status", "==", status), orderBy("updatedAt", "desc"), limit(PAGE_SIZE)];
  if (state.myTasksOnly && state.user?.uid) {
    constraints.unshift(where("assignedTo", "array-contains", state.user.uid));
  }
  if (cursor) constraints.push(startAfter(cursor));
  return query(collection(db, "tasks"), ...constraints);
}

function subscribeStatus(status) {
  state.statusUnsubscribers.get(status)?.();

  const q = baseStatusQuery(status);
  const unsub = onSnapshot(q, (snap) => {
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.statusData.set(status, docs);
    state.statusPages.set(status, snap.docs[snap.docs.length - 1] ?? null);

    docs.forEach((task) => state.taskById.set(task.id, task));
    renderBoard();
    renderTable();
  });

  state.statusUnsubscribers.set(status, unsub);
}

async function loadMoreStatus(status) {
  const cursor = state.statusPages.get(status);
  if (!cursor) return;

  const nextQ = baseStatusQuery(status, cursor);
  const snap = await getDocs(nextQ);
  if (!snap.size) {
    state.statusPages.set(status, null);
    return;
  }

  const existing = state.statusData.get(status) ?? [];
  const more = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const merged = [...existing, ...more];
  state.statusData.set(status, merged);
  state.statusPages.set(status, snap.docs[snap.docs.length - 1] ?? null);
  merged.forEach((task) => state.taskById.set(task.id, task));

  renderBoard();
  renderTable();
}

function subscribeBoardData() {
  clearBoardSubscriptions();
  STATUS_COLUMNS.forEach(([status]) => subscribeStatus(status));
}

function clearBoardSubscriptions() {
  state.statusUnsubscribers.forEach((unsub) => unsub());
  state.statusUnsubscribers.clear();
  state.statusData.clear();
  state.statusPages.clear();
  state.taskById.clear();
}

function taskCard(task) {
  const li = document.createElement("li");
  li.className = "task-card";
  li.draggable = true;
  li.dataset.id = task.id;
  li.innerHTML = `
    <div class="title">${escapeHtml(task.title ?? "Untitled")}</div>
    <div class="meta">
      <span>P:${task.priority}</span>
      <span>D:${task.difficulty}</span>
      <span>${Math.round(task.stepProgress ?? 0)}%</span>
    </div>
  `;

  li.addEventListener("dragstart", (e) => {
    li.classList.add("dragging");
    e.dataTransfer.setData("text/plain", task.id);
  });
  li.addEventListener("dragend", () => li.classList.remove("dragging"));
  li.addEventListener("click", () => openTaskDetail(task.id));

  return li;
}

function renderBoard() {
  STATUS_COLUMNS.forEach(([status]) => {
    const section = boardView.querySelector(`[data-status="${status}"]`);
    if (!section) return;

    const list = section.querySelector(".task-list");
    list.innerHTML = "";

    const tasks = state.statusData.get(status) ?? [];
    tasks.forEach((task) => list.append(taskCard(task)));
  });
}

function renderTable() {
  const tasks = [...state.taskById.values()];
  tasks.sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));
  taskTableBody.innerHTML = "";

  tasks.forEach((task) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(task.title ?? "")}</td>
      <td>${task.status}</td>
      <td>${task.priority}</td>
      <td>${task.difficulty}</td>
      <td>${(task.assignedTo ?? []).join(", ")}</td>
      <td>${Math.round(task.stepProgress ?? 0)}%</td>
    `;
    tr.addEventListener("click", () => openTaskDetail(task.id));
    taskTableBody.append(tr);
  });
}

async function moveTaskStatus(taskId, nextStatus) {
  if (!state.user) return;
  const ref = doc(db, "tasks", taskId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const task = snap.data();
  if (!canEditTask(task)) {
    alert("You are not allowed to edit this task.");
    return;
  }

  const oldStatus = task.status;
  if (oldStatus === nextStatus) return;

  await updateDoc(ref, {
    status: nextStatus,
    updatedAt: serverTimestamp(),
  });

  await addActivity(taskId, "status_change", oldStatus, nextStatus);
}

async function addActivity(taskId, action, oldValue, newValue) {
  await addDoc(collection(db, "tasks", taskId, "activity_logs"), {
    action,
    oldValue,
    newValue,
    performedBy: state.user.uid,
    timestamp: serverTimestamp(),
  });
}

function canEditTask(task) {
  const userRole = state.user?.profile?.role;
  if (userRole === "admin") return true;
  const mine = (task.assignedTo ?? []).includes(state.user.uid);
  const owner = task.createdBy === state.user.uid;
  return mine || owner;
}

async function createTask(event) {
  event.preventDefault();
  if (!state.user) return;

  const assigned = $("#task-assigned").value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const payload = {
    title: $("#task-title").value.trim(),
    description: $("#task-description").value.trim(),
    createdBy: state.user.uid,
    assignedTo: assigned,
    priority: $("#task-priority").value,
    difficulty: $("#task-difficulty").value,
    status: "new",
    tags: $("#task-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    stepProgress: 0,
  };

  const taskRef = await addDoc(collection(db, "tasks"), payload);
  await addActivity(taskRef.id, "create", null, "task_created");

  event.target.reset();
  taskDialog.close();
}

function wireTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const key = tab.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
      document.querySelector(`.tab-panel[data-panel=\"${key}\"]`)?.classList.remove("hidden");
    });
  });
}

function closeDetailListeners() {
  state.detailUnsubs.forEach((unsub) => unsub());
  state.detailUnsubs = [];
}

function openTaskDetail(taskId) {
  state.activeTaskId = taskId;
  $("#task-detail").classList.remove("hidden");
  closeDetailListeners();

  const taskRef = doc(db, "tasks", taskId);
  state.detailUnsubs.push(onSnapshot(taskRef, (snap) => {
    if (!snap.exists()) return;
    const task = { id: snap.id, ...snap.data() };
    state.taskById.set(task.id, task);

    $("#detail-title").textContent = task.title;
    $("#detail-description").textContent = task.description || "No description.";
    $("#detail-metadata").innerHTML = `
      <li>Status: ${task.status}</li>
      <li>Priority: ${task.priority}</li>
      <li>Difficulty: ${task.difficulty}</li>
      <li>Assigned: ${(task.assignedTo ?? []).join(", ") || "none"}</li>
      <li>Tags: ${(task.tags ?? []).join(", ") || "none"}</li>
      <li>Progress: ${Math.round(task.stepProgress ?? 0)}%</li>
    `;
  }));

  const stepsQ = query(collection(db, "tasks", taskId, "steps"), orderBy("orderIndex", "asc"));
  state.detailUnsubs.push(onSnapshot(stepsQ, (snap) => {
    const list = $("#steps-list");
    list.innerHTML = "";
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    docs.forEach((step) => {
      const li = document.createElement("li");
      li.className = "panel";
      li.innerHTML = `
        <div><strong>${escapeHtml(step.name)}</strong> · ${step.status}</div>
        <div>${escapeHtml(step.description ?? "")}</div>
        <div class="row gap">
          <button data-step-id="${step.id}" data-action="advance" type="button">Advance</button>
        </div>
      `;
      li.querySelector("button").addEventListener("click", () => advanceStep(taskId, step));
      list.append(li);
    });

    recalculateStepProgress(taskId, docs);
  }));

  const convoQ = query(collection(db, "tasks", taskId, "conversations"), orderBy("timestamp", "asc"));
  state.detailUnsubs.push(onSnapshot(convoQ, (snap) => {
    const list = $("#conversations-list");
    list.innerHTML = "";

    snap.forEach((d) => {
      const msg = d.data();
      const li = document.createElement("li");
      li.className = "panel";
      li.innerHTML = `
        <strong>${msg.type}</strong> · ${msg.userId}
        <div>${renderMentions(msg.message ?? "")}</div>
      `;
      list.append(li);
    });
  }));

  const logQ = query(collection(db, "tasks", taskId, "activity_logs"), orderBy("timestamp", "desc"), limit(50));
  state.detailUnsubs.push(onSnapshot(logQ, (snap) => {
    const list = $("#activity-list");
    list.innerHTML = "";

    snap.forEach((d) => {
      const log = d.data();
      const li = document.createElement("li");
      li.className = "panel";
      li.textContent = `${log.action}: ${JSON.stringify(log.oldValue)} → ${JSON.stringify(log.newValue)} by ${log.performedBy}`;
      list.append(li);
    });
  }));
}

async function advanceStep(taskId, step) {
  const statuses = ["not_started", "in_progress", "done"];
  const curr = statuses.indexOf(step.status);
  const next = statuses[Math.min(curr + 1, statuses.length - 1)];
  if (next === step.status) return;

  await updateDoc(doc(db, "tasks", taskId, "steps", step.id), { status: next });
  await addActivity(taskId, "step_update", step.status, next);
}

async function recalculateStepProgress(taskId, steps) {
  if (!steps.length) {
    await updateDoc(doc(db, "tasks", taskId), { stepProgress: 0, updatedAt: serverTimestamp() });
    return;
  }

  const done = steps.filter((s) => s.status === "done").length;
  const progress = (done / steps.length) * 100;
  await updateDoc(doc(db, "tasks", taskId), { stepProgress: progress, updatedAt: serverTimestamp() });
}

async function addStep(event) {
  event.preventDefault();
  if (!state.activeTaskId) return;

  const stepsRef = collection(db, "tasks", state.activeTaskId, "steps");
  const currentCount = $("#steps-list").children.length;

  await addDoc(stepsRef, {
    name: $("#step-name").value.trim(),
    description: $("#step-description").value.trim(),
    status: "not_started",
    assignedTo: state.user.uid,
    orderIndex: currentCount,
    estimatedTime: $("#step-estimate").value.trim(),
  });

  await addActivity(state.activeTaskId, "step_add", null, $("#step-name").value.trim());
  event.target.reset();
}

async function addConversationMessage(event) {
  event.preventDefault();
  if (!state.activeTaskId) return;

  const message = $("#message-text").value.trim();
  if (!message) return;

  await addDoc(collection(db, "tasks", state.activeTaskId, "conversations"), {
    userId: state.user.uid,
    message,
    type: $("#message-type").value,
    timestamp: serverTimestamp(),
    mentions: extractMentions(message),
  });

  await addActivity(state.activeTaskId, "comment", null, message.slice(0, 80));
  $("#message-text").value = "";
}

function extractMentions(text) {
  return [...text.matchAll(/@([a-zA-Z0-9._-]+)/g)].map((m) => m[1]);
}

function renderMentions(text) {
  return escapeHtml(text).replace(/@([a-zA-Z0-9._-]+)/g, "<mark>@$1</mark>");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      name: user.email.split("@")[0],
      email: user.email,
      role: "user",
      createdAt: serverTimestamp(),
    });
  }
  state.user = { ...state.user, profile: (await getDoc(ref)).data() };
}

async function login(event) {
  event.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  await signInWithEmailAndPassword(auth, email, password);
}

async function signup() {
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  await createUserWithEmailAndPassword(auth, email, password);
}

function bindEvents() {
  $("#login-form").addEventListener("submit", (event) => login(event).catch(handleError));
  $("#signup-btn").addEventListener("click", () => signup().catch(handleError));
  $("#logout-btn").addEventListener("click", () => signOut(auth));

  $("#new-task-btn").addEventListener("click", () => taskDialog.showModal());
  $("#cancel-task-btn").addEventListener("click", () => taskDialog.close());
  $("#new-task-form").addEventListener("submit", (event) => createTask(event).catch(handleError));

  $("#toggle-view-btn").addEventListener("click", () => {
    state.tableView = !state.tableView;
    tableView.classList.toggle("hidden", !state.tableView);
    boardView.classList.toggle("hidden", state.tableView);
    $("#toggle-view-btn").textContent = state.tableView ? "Switch to Kanban View" : "Switch to Table View";
  });

  $("#my-tasks-toggle").addEventListener("change", (event) => {
    state.myTasksOnly = event.target.checked;
    subscribeBoardData();
  });

  $("#close-detail").addEventListener("click", () => {
    closeDetailListeners();
    $("#task-detail").classList.add("hidden");
  });

  $("#add-step-form").addEventListener("submit", (event) => addStep(event).catch(handleError));
  $("#add-message-form").addEventListener("submit", (event) => addConversationMessage(event).catch(handleError));

  wireTabs();
}

function handleError(error) {
  console.error(error);
  alert(error?.message || "Something went wrong.");
}

onAuthStateChanged(auth, async (user) => {
  closeDetailListeners();

  if (!user) {
    state.user = null;
    authView.classList.remove("hidden");
    appView.classList.add("hidden");
    authBadge.textContent = "Not authenticated";
    clearBoardSubscriptions();
    return;
  }

  state.user = { uid: user.uid, email: user.email };
  await ensureUserProfile(user);

  authBadge.textContent = `${state.user.email} (${state.user.profile.role})`;
  authView.classList.add("hidden");
  appView.classList.remove("hidden");

  initBoardShell();
  subscribeBoardData();
});

bindEvents();
