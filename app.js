import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const { SUPABASE_URL, SUPABASE_KEY } = window.FUN_PLACE_CONFIG;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const AVATARS = ["😀", "😎", "🤓", "🦄", "🐼", "🦊", "🐸", "🐙", "🤖", "👻", "🍕", "🌵", "🚀", "🎧", "🐱", "🐶"];
const MOODS = ["✨", "😂", "🔥", "🥳", "🤔", "😴", "☕", "🙌", "💡", "🫠"];
const COLORS = ["yellow", "pink", "blue", "green", "purple", "orange"];
const REACTIONS = ["😂", "❤️", "🔥", "👏", "🤯", "🫠"];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = {
  me: null,            // auth user
  profile: null,       // my profile row
  people: new Map(),   // id -> profile
  posts: [],
  filter: "all",
  mood: MOODS[0],
  color: COLORS[0],
  tags: new Map(),     // id -> profile (composer)
  sentCounts: new Map(),
  channel: null,
};

/* ---------------- helpers ---------------- */
function toast(msg, ms = 2800) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function bigPoke() {
  const el = document.createElement("div");
  el.className = "big-poke";
  el.textContent = "👉";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
function tiltFor(id) { return (((id * 9301 + 49297) % 233280) / 233280 * 5 - 2.5).toFixed(2) + "deg"; }
function nameOf(id) { return state.people.get(id)?.display_name ?? "Someone"; }
function avatarOf(id) { return state.people.get(id)?.avatar ?? "🙂"; }
function lastSeenKey() { return `fp_inbox_seen_${state.me?.id}`; }

function buildEmojiRow(el, list, current, onPick) {
  el.innerHTML = list.map((e) => `<button type="button" data-v="${e}" class="${e === current ? "selected" : ""}">${e}</button>`).join("");
  el.onclick = (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    $$("button", el).forEach((x) => x.classList.toggle("selected", x === b));
    onPick(b.dataset.v);
  };
}

/* ---------------- auth ---------------- */
function setAuthMsg(msg, isError = false) {
  const el = $("#auth-msg");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

function initAuthUI() {
  $$(".tab").forEach((t) => (t.onclick = () => {
    $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $("#login-form").classList.toggle("hidden", t.dataset.tab !== "login");
    $("#signup-form").classList.toggle("hidden", t.dataset.tab !== "signup");
    setAuthMsg("");
  }));

  const signup = $("#signup-form");
  buildEmojiRow($("#avatar-picker"), AVATARS, "😀", (v) => (signup.avatar.value = v));

  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    setAuthMsg("Logging in…");
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    if (error) setAuthMsg(error.message, true);
  };

  signup.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    setAuthMsg("Creating your account…");
    const { data, error } = await sb.auth.signUp({
      email: f.email.value.trim(),
      password: f.password.value,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: f.display_name.value.trim(), department: f.department.value.trim(), avatar: f.avatar.value },
      },
    });
    if (error) return setAuthMsg(error.message, true);
    if (!data.session) setAuthMsg("Almost there! Check your email to confirm your account, then log in. 📬");
  };
}

/* ---------------- data loading ---------------- */
async function loadPeople() {
  const { data, error } = await sb.from("profiles").select("id, display_name, avatar, department").order("display_name");
  if (error) return toast("Couldn't load colleagues");
  state.people = new Map(data.map((p) => [p.id, p]));
  state.profile = state.people.get(state.me.id);
}

async function loadSentCounts() {
  const { data } = await sb.from("pokes").select("to_user").eq("from_user", state.me.id);
  state.sentCounts = new Map();
  (data ?? []).forEach((r) => state.sentCounts.set(r.to_user, (state.sentCounts.get(r.to_user) ?? 0) + 1));
}

async function loadPosts() {
  const { data, error } = await sb
    .from("posts")
    .select("id, author_id, content, mood, color, created_at, post_tags(user_id), reactions(emoji, user_id)")
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) return toast("Couldn't load the board");
  state.posts = data;
}

async function loadLeaderboard() {
  const { data } = await sb.from("poke_stats").select("*").order("received", { ascending: false }).limit(5);
  const el = $("#leaderboard");
  const rows = (data ?? []).filter((r) => r.received > 0);
  el.innerHTML = rows.length
    ? rows.map((r) => `<li>${esc(r.avatar)} ${esc(r.display_name)} <span class="count">${r.received} 👉</span></li>`).join("")
    : `<li class="muted">No pokes yet. Be the instigator.</li>`;
}

/* ---------------- rendering ---------------- */
function renderMe() {
  $("#me-avatar").textContent = state.profile?.avatar ?? "🙂";
  $("#me-name").textContent = state.profile?.display_name ?? "";
}

function renderPeople() {
  const q = $("#people-search").value.trim().toLowerCase();
  const list = [...state.people.values()]
    .filter((p) => p.id !== state.me.id)
    .filter((p) => !q || p.display_name.toLowerCase().includes(q) || (p.department ?? "").toLowerCase().includes(q));
  $("#people").innerHTML = list.length
    ? list.map((p) => {
        const n = state.sentCounts.get(p.id) ?? 0;
        return `<li data-id="${p.id}">
          <span class="avatar">${esc(p.avatar)}</span>
          <div class="info"><div class="name">${esc(p.display_name)}</div>
            <div class="sub">${esc(p.department || "")}${n ? `${p.department ? " · " : ""}poked ${n}×` : ""}</div></div>
          <button class="poke-btn" data-poke="${p.id}">Poke 👉</button>
        </li>`;
      }).join("")
    : `<li class="muted">${state.people.size <= 1 ? "Invite your colleagues to sign up!" : "No matches."}</li>`;
}

function renderBoard() {
  const me = state.me.id;
  let posts = state.posts;
  if (state.filter === "mine") posts = posts.filter((p) => p.author_id === me);
  if (state.filter === "tagged") posts = posts.filter((p) => p.post_tags.some((t) => t.user_id === me));

  $("#board-empty").classList.toggle("hidden", posts.length > 0);
  $("#board").innerHTML = posts.map((p) => {
    const taggedMe = p.post_tags.some((t) => t.user_id === me);
    const counts = {};
    const mine = new Set();
    p.reactions.forEach((r) => { counts[r.emoji] = (counts[r.emoji] ?? 0) + 1; if (r.user_id === me) mine.add(r.emoji); });
    const tags = p.post_tags.map((t) => `<span class="chip">@${esc(nameOf(t.user_id))}</span>`).join("");
    return `<article class="note ${esc(p.color)} ${taggedMe ? "tagged-me" : ""}" style="--tilt:${tiltFor(p.id)}" data-id="${p.id}">
      <div class="note-head">
        <span class="avatar">${esc(avatarOf(p.author_id))}</span>
        <div><div class="who">${esc(nameOf(p.author_id))}</div><div class="when">${timeAgo(p.created_at)}</div></div>
        <span class="mood">${esc(p.mood)}</span>
      </div>
      <div class="note-body">${esc(p.content)}</div>
      ${tags ? `<div class="chips">${tags}</div>` : ""}
      <div class="note-foot">
        ${REACTIONS.map((e) => `<button class="react ${mine.has(e) ? "on" : ""}" data-react="${e}">${e}${counts[e] ? " " + counts[e] : ""}</button>`).join("")}
        <div class="note-actions">
          ${p.author_id !== me ? `<button data-poke="${p.author_id}" title="Poke the author">👉 poke</button>` : `<button data-delete="${p.id}">delete</button>`}
        </div>
      </div>
    </article>`;
  }).join("");
}

/* ---------------- inbox ---------------- */
async function loadInbox() {
  const me = state.me.id;
  const [pokesRes, tagsRes] = await Promise.all([
    sb.from("pokes").select("id, from_user, created_at").eq("to_user", me).order("created_at", { ascending: false }).limit(40),
    sb.from("post_tags").select("post_id, posts(id, author_id, content, created_at)").eq("user_id", me).limit(40),
  ]);
  const items = [
    ...(pokesRes.data ?? []).map((p) => ({ kind: "poke", from: p.from_user, at: p.created_at })),
    ...(tagsRes.data ?? []).filter((t) => t.posts).map((t) => ({ kind: "tag", from: t.posts.author_id, at: t.posts.created_at, text: t.posts.content })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 50);

  // Collapse runs of pokes from the same person
  const collapsed = [];
  for (const it of items) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && it.kind === "poke" && prev.kind === "poke" && prev.from === it.from) { prev.n++; continue; }
    collapsed.push({ ...it, n: 1 });
  }
  state.inbox = collapsed;

  const seen = Number(localStorage.getItem(lastSeenKey()) ?? 0);
  const unread = items.filter((i) => new Date(i.at).getTime() > seen).length;
  const badge = $("#inbox-count");
  badge.textContent = unread > 99 ? "99+" : unread;
  badge.classList.toggle("hidden", unread === 0);
}

function renderInbox() {
  const seen = Number(localStorage.getItem(lastSeenKey()) ?? 0);
  const list = state.inbox ?? [];
  $("#inbox-list").innerHTML = list.length
    ? list.map((i) => {
        const unread = new Date(i.at).getTime() > seen ? "unread" : "";
        const who = esc(nameOf(i.from));
        const body = i.kind === "poke"
          ? `<b>${who}</b> poked you${i.n > 1 ? ` <b>${i.n}×</b>` : ""} 👉`
          : `<b>${who}</b> tagged you: “${esc(i.text.slice(0, 80))}${i.text.length > 80 ? "…" : ""}”`;
        const action = i.kind === "poke" ? `<button class="back" data-poke="${i.from}">Poke back</button>` : "";
        return `<li class="${unread}"><span class="avatar">${esc(avatarOf(i.from))}</span>
          <div class="txt">${body}<small>${timeAgo(i.at)}</small></div>${action}</li>`;
      }).join("")
    : `<li class="muted">Nothing yet. Quiet day.</li>`;
}

/* ---------------- actions ---------------- */
async function poke(userId, btn) {
  if (!userId || userId === state.me.id) return;
  btn?.classList.remove("shake"); void btn?.offsetWidth; btn?.classList.add("shake");
  const { error } = await sb.from("pokes").insert({ to_user: userId });
  if (error) return toast("Poke failed 😢");
  state.sentCounts.set(userId, (state.sentCounts.get(userId) ?? 0) + 1);
  const n = state.sentCounts.get(userId);
  toast(`You poked ${nameOf(userId)}${n > 1 ? ` (${n}× total)` : ""} 👉`, 1600);
  renderPeople();
}

async function toggleReaction(postId, emoji) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  const existing = post.reactions.find((r) => r.emoji === emoji && r.user_id === state.me.id);
  if (existing) {
    post.reactions = post.reactions.filter((r) => r !== existing);
    renderBoard();
    await sb.from("reactions").delete().match({ post_id: postId, user_id: state.me.id, emoji });
  } else {
    post.reactions.push({ emoji, user_id: state.me.id });
    renderBoard();
    const { error } = await sb.from("reactions").insert({ post_id: postId, emoji });
    if (error && error.code !== "23505") toast("Couldn't react");
  }
}

async function deletePost(id) {
  if (!confirm("Unpin this post for everyone?")) return;
  const { error } = await sb.from("posts").delete().eq("id", id);
  if (error) return toast("Couldn't delete");
  state.posts = state.posts.filter((p) => p.id !== id);
  renderBoard();
}

/* ---------------- composer ---------------- */
function renderTagChips() {
  $("#tag-chips").innerHTML = [...state.tags.values()]
    .map((p) => `<span class="chip">${esc(p.avatar)} ${esc(p.display_name)} <button type="button" data-untag="${p.id}" aria-label="Remove">✕</button></span>`)
    .join("");
}

function initComposer() {
  buildEmojiRow($("#mood-picker"), MOODS, state.mood, (v) => (state.mood = v));
  const colorEl = $("#color-picker");
  colorEl.innerHTML = COLORS.map((c) => `<button type="button" data-v="${c}" aria-label="${c}" style="background:var(--note-${c})" class="${c === state.color ? "selected" : ""}"></button>`).join("");
  colorEl.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $$("button", colorEl).forEach((x) => x.classList.toggle("selected", x === b));
    state.color = b.dataset.v;
  };

  const ta = $("#post-content");
  ta.oninput = () => ($("#char-count").textContent = `${ta.value.length}/500`);

  const input = $("#tag-input");
  const sug = $("#tag-suggest");
  let active = 0;
  const matches = () => {
    const q = input.value.trim().replace(/^@/, "").toLowerCase();
    return [...state.people.values()]
      .filter((p) => p.id !== state.me.id && !state.tags.has(p.id))
      .filter((p) => !q || p.display_name.toLowerCase().includes(q))
      .slice(0, 8);
  };
  const show = () => {
    const m = matches();
    active = Math.min(active, Math.max(0, m.length - 1));
    sug.innerHTML = m.map((p, i) => `<li data-id="${p.id}" class="${i === active ? "active" : ""}">${esc(p.avatar)} ${esc(p.display_name)}</li>`).join("");
    sug.classList.toggle("hidden", m.length === 0);
  };
  const add = (id) => {
    const p = state.people.get(id); if (!p) return;
    state.tags.set(id, p); input.value = ""; active = 0; renderTagChips(); show(); input.focus();
  };
  input.onfocus = show;
  input.oninput = () => { active = 0; show(); };
  input.onblur = () => setTimeout(() => sug.classList.add("hidden"), 150);
  input.onkeydown = (e) => {
    const m = matches();
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, m.length - 1); show(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); show(); }
    else if (e.key === "Enter") { e.preventDefault(); if (m[active]) add(m[active].id); }
    else if (e.key === "Backspace" && !input.value && state.tags.size) { state.tags.delete([...state.tags.keys()].pop()); renderTagChips(); }
  };
  sug.onmousedown = (e) => { const li = e.target.closest("li"); if (li) { e.preventDefault(); add(li.dataset.id); } };
  $("#tag-chips").onclick = (e) => { const b = e.target.closest("[data-untag]"); if (b) { state.tags.delete(b.dataset.untag); renderTagChips(); } };

  $("#composer").onsubmit = async (e) => {
    e.preventDefault();
    const content = ta.value.trim();
    if (!content) return;
    const btn = e.submitter; btn.disabled = true;
    const { data: post, error } = await sb.from("posts")
      .insert({ content, mood: state.mood, color: state.color })
      .select("id, author_id, content, mood, color, created_at").single();
    if (error) { btn.disabled = false; return toast("Couldn't pin that 😢"); }
    const tagIds = [...state.tags.keys()];
    if (tagIds.length) {
      const { error: tErr } = await sb.from("post_tags").insert(tagIds.map((user_id) => ({ post_id: post.id, user_id })));
      if (tErr) toast("Posted, but tagging failed");
    }
    if (!state.posts.some((p) => p.id === post.id)) {
      state.posts.unshift({ ...post, post_tags: tagIds.map((user_id) => ({ user_id })), reactions: [] });
    } else {
      const p = state.posts.find((x) => x.id === post.id); p.post_tags = tagIds.map((user_id) => ({ user_id }));
    }
    ta.value = ""; $("#char-count").textContent = "0/500";
    state.tags.clear(); renderTagChips();
    btn.disabled = false;
    renderBoard();
    toast("Pinned! 📌", 1500);
  };
}

/* ---------------- realtime ---------------- */
function subscribe() {
  state.channel?.unsubscribe();
  state.channel = sb.channel("fun-place")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, async ({ new: p }) => {
      if (state.posts.some((x) => x.id === p.id)) return;
      if (!state.people.has(p.author_id)) await loadPeople();
      state.posts.unshift({ ...p, post_tags: [], reactions: [] });
      renderBoard();
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, ({ old }) => {
      state.posts = state.posts.filter((x) => x.id !== old.id); renderBoard();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_tags" }, ({ new: t }) => {
      const p = state.posts.find((x) => x.id === t.post_id);
      if (p && !p.post_tags.some((x) => x.user_id === t.user_id)) { p.post_tags.push({ user_id: t.user_id }); renderBoard(); }
      if (t.user_id === state.me.id && p?.author_id !== state.me.id) {
        toast(`🏷️ ${nameOf(p?.author_id)} tagged you in a post`);
        loadInbox();
      }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions" }, ({ new: r }) => {
      if (r.user_id === state.me.id) return;
      const p = state.posts.find((x) => x.id === r.post_id);
      if (p) { p.reactions.push({ emoji: r.emoji, user_id: r.user_id }); renderBoard(); }
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions" }, () => { loadPosts().then(renderBoard); })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "pokes" }, async ({ new: k }) => {
      if (k.to_user === state.me.id) {
        if (!state.people.has(k.from_user)) await loadPeople();
        bigPoke();
        toast(`👉 ${nameOf(k.from_user)} poked you!`);
        loadInbox();
      }
      loadLeaderboard();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, () => { loadPeople().then(renderPeople); })
    .subscribe();
}

/* ---------------- app wiring ---------------- */
function initAppUI() {
  initComposer();

  $$(".filter").forEach((f) => (f.onclick = () => {
    $$(".filter").forEach((x) => x.classList.toggle("active", x === f));
    state.filter = f.dataset.filter; renderBoard();
  }));
  $("#people-search").oninput = renderPeople;

  // delegated clicks: poke / react / delete
  document.addEventListener("click", (e) => {
    const pk = e.target.closest("[data-poke]");
    if (pk) return poke(pk.dataset.poke, pk);
    const rc = e.target.closest("[data-react]");
    if (rc) return toggleReaction(Number(rc.closest(".note").dataset.id), rc.dataset.react);
    const del = e.target.closest("[data-delete]");
    if (del) return deletePost(Number(del.dataset.delete));
  });

  $("#inbox-btn").onclick = async () => {
    await loadInbox();
    renderInbox();
    $("#inbox").classList.remove("hidden");
    try { localStorage.setItem(lastSeenKey(), Date.now()); } catch {}
    $("#inbox-count").classList.add("hidden");
  };
  $("#inbox-close").onclick = () => $("#inbox").classList.add("hidden");
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#inbox").classList.add("hidden"); });

  $("#logout-btn").onclick = () => sb.auth.signOut();

  setInterval(() => state.me && renderBoard(), 60_000); // refresh "x minutes ago"
}

async function enterApp(user) {
  state.me = user;
  $("#auth-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
  await loadPeople();
  // profile row is created by DB trigger; retry briefly in case it's racing
  for (let i = 0; !state.profile && i < 3; i++) { await new Promise((r) => setTimeout(r, 500)); await loadPeople(); }
  await Promise.all([loadPosts(), loadSentCounts()]);
  renderMe(); renderPeople(); renderBoard();
  loadLeaderboard(); loadInbox();
  subscribe();
}

function leaveApp() {
  state.channel?.unsubscribe();
  Object.assign(state, { me: null, profile: null, posts: [], channel: null });
  $("#app-view").classList.add("hidden");
  $("#auth-view").classList.remove("hidden");
  setAuthMsg("");
}

initAuthUI();
initAppUI();

let currentUserId; // undefined until the first auth event, so a logged-out first load still renders the login screen
sb.auth.onAuthStateChange((_event, session) => {
  const uid = session?.user?.id ?? null;
  if (uid === currentUserId) return;
  currentUserId = uid;
  // defer to avoid calling supabase inside the auth callback
  setTimeout(() => (session ? enterApp(session.user) : leaveApp()), 0);
});
