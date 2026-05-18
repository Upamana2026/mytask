import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================
// Firebase 設定 — Firebase Console からコピーした値に差し替えてください
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyBwtrCaA4PlPL75O9oIPBtMrwW8f5bx9gM",
  authDomain: "task-9d954.firebaseapp.com",
  projectId: "task-9d954",
  storageBucket: "task-9d954.firebasestorage.app",
  messagingSenderId: "987206541441",
  appId: "1:987206541441:web:536acef0bc593bce85ad80",
  measurementId: "G-GNQZP3K4KW",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const LOCAL_STORAGE_KEY = "task-app-tasks";

let tasks = [];
let currentUid = null;
let unsubscribe = null;

const loginScreen = document.getElementById("login-screen");
const appEl = document.getElementById("app");
const signInBtn = document.getElementById("google-signin");
const signOutBtn = document.getElementById("sign-out");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");
const loginError = document.getElementById("login-error");
const syncIndicator = document.getElementById("sync-indicator");

const form = document.getElementById("task-form");
const activeList = document.getElementById("active-list");
const archiveList = document.getElementById("archive-list");
const activeEmpty = document.getElementById("active-empty");
const archiveEmpty = document.getElementById("archive-empty");

// ============================================
// 認証
// ============================================
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

getRedirectResult(auth).catch((e) => {
  loginError.textContent = "ログインに失敗しました: " + e.message;
});

signInBtn.addEventListener("click", async () => {
  loginError.textContent = "";
  // iOS Safari(ブラウザ)はリダイレクト方式、それ以外(PC/iOS PWA/Android)はポップアップ方式
  const useRedirect = isIOS && !isStandalone;
  try {
    if (useRedirect) {
      await signInWithRedirect(auth, provider);
    } else {
      await signInWithPopup(auth, provider);
    }
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/popup-closed-by-user") {
      try {
        await signInWithRedirect(auth, provider);
        return;
      } catch (e2) {
        loginError.textContent = "ログインに失敗しました: " + e2.message;
        return;
      }
    }
    loginError.textContent = "ログインに失敗しました: " + e.message;
  }
});

signOutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    userAvatar.src = user.photoURL || "";
    userName.textContent = user.displayName || user.email || "";
    loginScreen.classList.add("hidden");
    appEl.classList.remove("hidden");
    setSyncStatus("connecting");
    await migrateLocalStorageIfNeeded(user.uid);
    subscribeTasks(user.uid);
  } else {
    currentUid = null;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    loginScreen.classList.remove("hidden");
    appEl.classList.add("hidden");
    tasks = [];
    render();
  }
});

// ============================================
// localStorage からの自動移行(初回のみ)
// ============================================
async function migrateLocalStorageIfNeeded(uid) {
  const flagKey = `migrated-${uid}`;
  if (localStorage.getItem(flagKey)) return;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(flagKey, "1");
      return;
    }
    const local = JSON.parse(raw);
    if (!Array.isArray(local) || local.length === 0) {
      localStorage.setItem(flagKey, "1");
      return;
    }
    const batch = writeBatch(db);
    const tasksCol = collection(db, "users", uid, "tasks");
    const now = Date.now();
    local.forEach((t, i) => {
      const ref = doc(tasksCol);
      batch.set(ref, {
        title: t.title || "",
        content: t.content || "",
        dueDate: t.dueDate || "",
        link: t.link || "",
        done: !!t.done,
        completedAt: t.completedAt || null,
        createdAt: now + i, // 順序を保持
      });
    });
    await batch.commit();
    localStorage.setItem(flagKey, "1");
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    console.log(`localStorage から ${local.length} 件のタスクを Firestore に移行しました`);
  } catch (e) {
    console.error("移行に失敗しました", e);
  }
}

// ============================================
// Firestore リアルタイム購読
// ============================================
function subscribeTasks(uid) {
  if (unsubscribe) unsubscribe();
  const tasksCol = collection(db, "users", uid, "tasks");
  const q = query(tasksCol, orderBy("createdAt", "asc"));
  unsubscribe = onSnapshot(
    q,
    (snap) => {
      tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
      setSyncStatus("connected");
    },
    (err) => {
      console.error("購読エラー", err);
      setSyncStatus("error");
    }
  );
}

function setSyncStatus(state) {
  if (!syncIndicator) return;
  syncIndicator.className = "sync-indicator " + state;
  syncIndicator.textContent =
    state === "connected" ? "● 同期中" : state === "error" ? "✕ 同期失敗" : "… 接続中";
}

// ============================================
// タブ切替
// ============================================
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

// ============================================
// タスク CRUD
// ============================================
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUid) return;
  const data = new FormData(form);
  const title = (data.get("title") || "").trim();
  if (!title) return;
  const task = {
    title,
    content: (data.get("content") || "").trim(),
    dueDate: data.get("dueDate") || "",
    link: (data.get("link") || "").trim(),
    done: false,
    completedAt: null,
    createdAt: Date.now(),
  };
  try {
    await addDoc(collection(db, "users", currentUid, "tasks"), task);
    form.reset();
  } catch (err) {
    alert("追加に失敗しました: " + err.message);
  }
});

async function toggleTask(id) {
  if (!currentUid) return;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  const becameDone = !task.done;
  try {
    await updateDoc(doc(db, "users", currentUid, "tasks", id), {
      done: becameDone,
      completedAt: becameDone ? Date.now() : null,
    });
    if (becameDone) playCelebration();
  } catch (err) {
    alert("更新に失敗しました: " + err.message);
  }
}

async function deleteTask(id) {
  if (!currentUid) return;
  try {
    await deleteDoc(doc(db, "users", currentUid, "tasks", id));
  } catch (err) {
    alert("削除に失敗しました: " + err.message);
  }
}

// ============================================
// 描画
// ============================================
function render() {
  activeList.innerHTML = "";
  archiveList.innerHTML = "";

  const activeTasks = tasks.filter((t) => !t.done);
  const archivedTasks = tasks
    .filter((t) => t.done)
    .sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));

  activeTasks.forEach((t) => activeList.appendChild(createTaskElement(t)));
  archivedTasks.forEach((t) => archiveList.appendChild(createTaskElement(t)));

  activeEmpty.classList.toggle("hidden", activeTasks.length > 0);
  archiveEmpty.classList.toggle("hidden", archivedTasks.length > 0);
}

function createTaskElement(task) {
  const li = document.createElement("li");
  li.className = "task-item" + (task.done ? " archived" : "");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-checkbox";
  checkbox.checked = task.done;
  checkbox.addEventListener("change", () => toggleTask(task.id));

  const body = document.createElement("div");
  body.className = "task-body";

  const title = document.createElement("h3");
  title.className = "task-title";
  title.textContent = task.title;
  body.appendChild(title);

  if (task.content) {
    const content = document.createElement("p");
    content.className = "task-content";
    content.textContent = task.content;
    body.appendChild(content);
  }

  const meta = document.createElement("div");
  meta.className = "task-meta";

  if (task.dueDate) {
    const due = document.createElement("span");
    due.className = "due-date";
    due.textContent = "期日: " + task.dueDate;
    if (!task.done && new Date(task.dueDate) < new Date(new Date().toDateString())) {
      due.classList.add("overdue");
    }
    meta.appendChild(due);
  }

  if (task.link) {
    const link = document.createElement("a");
    link.href = task.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "🔗 関連リンク";
    meta.appendChild(link);
  }

  if (task.completedAt) {
    const completed = document.createElement("span");
    completed.textContent = "完了: " + new Date(task.completedAt).toLocaleString("ja-JP");
    meta.appendChild(completed);
  }

  if (meta.children.length > 0) body.appendChild(meta);

  const del = document.createElement("button");
  del.className = "btn-delete";
  del.textContent = "×";
  del.title = "削除";
  del.addEventListener("click", () => {
    if (confirm("このタスクを削除しますか?")) deleteTask(task.id);
  });

  li.appendChild(checkbox);
  li.appendChild(body);
  li.appendChild(del);
  return li;
}

// ============================================
// 完了演出
// ============================================
function playCelebration() {
  const layer = document.createElement("div");
  layer.className = "celebration";

  const burst = document.createElement("div");
  burst.className = "celebration-burst";
  layer.appendChild(burst);

  const PETALS = ["🌸", "🌺", "🌷", "💮", "🌼"];
  const rand = (min, max) => Math.random() * (max - min) + min;

  for (let i = 0; i < 24; i++) {
    const el = document.createElement("div");
    el.className = "celebration-piece piece-petal";
    el.textContent = PETALS[Math.floor(Math.random() * PETALS.length)];
    el.style.left = rand(0, 100) + "vw";
    el.style.fontSize = rand(20, 36) + "px";
    el.style.setProperty("--drift", rand(-150, 150) + "px");
    el.style.setProperty("--duration", rand(4, 7) + "s");
    el.style.animationDelay = rand(0, 1.5) + "s";
    layer.appendChild(el);
  }

  for (let i = 0; i < 6; i++) {
    const el = document.createElement("div");
    el.className = "celebration-piece piece-butterfly";
    const inner = document.createElement("span");
    inner.textContent = "🦋";
    el.appendChild(inner);
    el.style.top = rand(10, 70) + "vh";
    el.style.fontSize = rand(28, 40) + "px";
    el.style.setProperty("--duration", rand(5, 8) + "s");
    el.style.animationDelay = rand(0, 1) + "s";
    layer.appendChild(el);
  }

  for (let i = 0; i < 5; i++) {
    const el = document.createElement("div");
    el.className = "celebration-piece piece-bee";
    const inner = document.createElement("span");
    inner.textContent = "🐝";
    el.appendChild(inner);
    el.style.fontSize = rand(22, 32) + "px";
    el.style.setProperty("--duration", rand(3.5, 5.5) + "s");
    el.style.animationDelay = rand(0, 1.5) + "s";
    layer.appendChild(el);
  }

  for (let i = 0; i < 2; i++) {
    const el = document.createElement("div");
    el.className = "celebration-piece piece-bird-blue";
    el.textContent = "🐦";
    el.style.setProperty("--duration", rand(4.5, 6) + "s");
    el.style.animationDelay = rand(0, 0.8) + "s";
    layer.appendChild(el);
  }

  for (let i = 0; i < 2; i++) {
    const el = document.createElement("div");
    el.className = "celebration-piece piece-bird-white";
    el.textContent = "🕊️";
    el.style.setProperty("--duration", rand(5, 6.5) + "s");
    el.style.animationDelay = rand(0.3, 1.2) + "s";
    layer.appendChild(el);
  }

  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 9000);
}
