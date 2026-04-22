import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue,
  update,
  remove,
  set,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const todosRef = ref(db, "todos");

const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const list = document.querySelector("#todo-list");
const emptyState = document.querySelector("#empty-state");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = input.value.trim();
  if (!text) {
    return;
  }

  const newTodoRef = push(todosRef);
  await set(newTodoRef, {
    text,
    done: false,
    createdAt: Date.now(),
  });

  form.reset();
  input.focus();
});

onValue(todosRef, (snapshot) => {
  const todos = snapshot.val() ?? {};
  const entries = Object.entries(todos).sort(([, a], [, b]) => {
    const aTime = a?.createdAt ?? 0;
    const bTime = b?.createdAt ?? 0;
    return aTime - bTime;
  });

  list.innerHTML = "";
  emptyState.hidden = entries.length > 0;

  entries.forEach(([id, todo]) => {
    const item = document.createElement("li");
    item.className = `todo-item ${todo.done ? "done" : ""}`;

    const label = document.createElement("label");
    label.textContent = todo.text;

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = Boolean(todo.done);
    toggle.addEventListener("change", async () => {
      await update(ref(db, `todos/${id}`), { done: toggle.checked });
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "delete";
    removeButton.textContent = "Delete";
    removeButton.addEventListener("click", async () => {
      await remove(ref(db, `todos/${id}`));
    });

    item.append(toggle, label, removeButton);
    list.append(item);
  });
});
