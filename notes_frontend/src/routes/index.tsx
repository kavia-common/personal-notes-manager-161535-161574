import { $, component$, useSignal, useTask$, useVisibleTask$, type Signal } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { useAuthProvider, useAuth } from "~/lib/auth";
import { api } from "~/lib/http";
import type { Note, NoteInput, NoteID } from "~/lib/models";

// Helper to format date
const fmt = (s: string) => {
  try {
    const d = new Date(s);
    return d.toLocaleString();
  } catch {
    return s;
  }
};

// PUBLIC_INTERFACE
export default component$(() => {
  // Initialize auth provider at the app page level
  const auth = useAuthProvider();
  // Derive a simple token signal to avoid capturing the auth object within $ scopes
  const token = useSignal<string | null>(auth.token.value);
  useTask$(({ track }) => {
    track(() => auth.token.value);
    token.value = auth.token.value;
  });

  // UI state
  const notes = useSignal<Note[]>([]);
  const loading = useSignal<boolean>(false);
  const err = useSignal<string | null>(null);
  const query = useSignal<string>("");
  const activeId = useSignal<NoteID | null>(null);

  // Editor state
  const title = useSignal<string>("");
  const content = useSignal<string>("");

  // Load notes when authenticated
  const loadNotes$ = $(async () => {
    if (!token.value) return;
    loading.value = true;
    err.value = null;
    const res = await api.get<Note[]>("/notes", { tokenSig: token });
    loading.value = false;
    if (!res.ok) {
      err.value = res.error || "Failed to load notes";
      return;
    }
    notes.value = (res.data || []).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    // If no active note, set first
    if (!activeId.value && notes.value.length) {
      const first = notes.value[0];
      activeId.value = first.id;
      title.value = first.title;
      content.value = first.content;
    }
  });

  useVisibleTask$(async () => {
    if (auth.token.value) {
      await loadNotes$();
    }
  });

  // When activeId changes, update editor fields
  useTask$(({ track }) => {
    track(() => activeId.value);
    const n = notes.value.find((n0) => n0.id === activeId.value);
    if (n) {
      title.value = n.title;
      content.value = n.content;
    } else {
      title.value = "";
      content.value = "";
    }
  });

  // Serializable wrappers that only mutate local signals
  const selectNote$ = $((id: NoteID) => {
    activeId.value = id;
  });

  const newNote$ = $(async () => {
    const input: NoteInput = { title: "Untitled", content: "" };
    const res = await api.post<Note>("/notes", input, { tokenSig: token });
    if (!res.ok) {
      err.value = res.error || "Failed to create note";
      return;
    }
    notes.value = [res.data!, ...notes.value];
    activeId.value = res.data!.id;
    title.value = res.data!.title;
    content.value = res.data!.content;
  });

  const saveNote$ = $(async () => {
    if (!activeId.value) {
      await newNote$();
      return;
    }
    const input: NoteInput = { title: title.value.trim() || "Untitled", content: content.value };
    const res = await api.put<Note>(`/notes/${activeId.value}`, input, { tokenSig: token });
    if (!res.ok) {
      err.value = res.error || "Failed to save note";
      return;
    }
    // Update list
    const updated = res.data!;
    notes.value = notes.value
      .map((n) => (n.id === updated.id ? updated : n))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    title.value = updated.title;
    content.value = updated.content;
  });

  const deleteNote$ = $(async () => {
    if (!activeId.value) return;
    const id = activeId.value;
    const res = await api.del<void>(`/notes/${id}`, { tokenSig: token });
    if (!res.ok) {
      err.value = res.error || "Failed to delete note";
      return;
    }
    notes.value = notes.value.filter((n) => n.id !== id);
    if (notes.value.length) {
      const first = notes.value[0];
      activeId.value = first.id;
      title.value = first.title;
      content.value = first.content;
    } else {
      activeId.value = null;
      title.value = "";
      content.value = "";
    }
  });

  return (
    <div class="app-shell">
      <Header />
      <div class="app-body">
        <Sidebar
          notes={notes}
          query={query}
          activeId={activeId}
          loading={loading}
          error={err}
          create$={newNote$}
        />
        <MainContent
          titleSig={title}
          contentSig={content}
          onSave$={saveNote$}
          onDelete$={deleteNote$}
          onNew$={newNote$}
        />
      </div>

      {!auth.token.value && <AuthOverlay />}
    </div>
  );
});



// Header component
const Header = component$(() => {
  const auth = useAuth();
  return (
    <header class="app-header">
      <div class="brand">
        <span class="dot" />
        <span>Notes</span>
      </div>
      <div class="header-actions">
        {auth.user.value && <span style={{ color: "#666", fontSize: "14px" }}>{auth.user.value.email}</span>}
        {auth.token.value ? (
          <button class="button" onClick$={auth.logout}>
            Logout
          </button>
        ) : null}
      </div>
    </header>
  );
});

// Sidebar component with search and list
interface SidebarProps {
  notes: Signal<Note[]>;
  query: Signal<string>;
  activeId: Signal<NoteID | null>;
  loading: Signal<boolean>;
  error: Signal<string | null>;
  create$: () => void;
}
const Sidebar = component$((props: SidebarProps) => {
  const filtered = props.query.value
    ? props.notes.value.filter(
        (n) =>
          n.title.toLowerCase().includes(props.query.value.toLowerCase()) ||
          n.content.toLowerCase().includes(props.query.value.toLowerCase()),
      )
    : props.notes.value;

  return (
    <aside class="sidebar">
      <div class="search">
        <input
          class="input"
          placeholder="Search notes..."
          value={props.query.value}
          onInput$={(_, el) => {
            props.query.value = el.value;
          }}
        />
      </div>
      <div class="note-list">
        {props.loading.value && <div style={{ padding: "12px", color: "#666" }}>Loading…</div>}
        {props.error.value && (
          <div style={{ padding: "12px", color: "#b00020" }}>Error: {props.error.value}</div>
        )}
        {filtered.map((n) => (
          <div
            key={n.id}
            class={"note-item " + (props.activeId.value === n.id ? "active" : "")}
            onClick$={() => {
              props.activeId.value = n.id;
            }}
          >
            <div>
              <div class="title">{n.title || "Untitled"}</div>
              <div class="time">{fmt(n.updated_at)}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "12px" }}>
        <button class="button primary" onClick$={props.create$}>
          + New note
        </button>
      </div>
    </aside>
  );
});

// Main editor area
interface MainContentProps {
  titleSig: Signal<string>;
  contentSig: Signal<string>;
  onSave$: () => void;
  onDelete$: () => void;
  onNew$: () => void;
}
const MainContent = component$((props: MainContentProps) => {
  return (
    <section class="content">
      <div class="toolbar">
        <button class="button primary" onClick$={props.onSave$}>Save</button>
        <button class="button" onClick$={props.onNew$}>New</button>
        <button class="button" onClick$={props.onDelete$}>Delete</button>
      </div>
      <div class="editor">
        <input
          class="input title-input"
          placeholder="Note title"
          value={props.titleSig.value}
          onInput$={(_, el) => {
            props.titleSig.value = el.value;
          }}
        />
        <textarea
          class="textarea"
          placeholder="Start writing..."
          value={props.contentSig.value}
          onInput$={(_, el) => {
            props.contentSig.value = el.value;
          }}
        />
      </div>
      <button class="fab" title="New note" onClick$={props.onNew$}>＋</button>
    </section>
  );
});

// Authentication overlay
const AuthOverlay = component$(() => {
  const auth = useAuth();
  const mode = useSignal<"login" | "register">("login");
  const email = useSignal<string>("");
  const password = useSignal<string>("");
  const error = useSignal<string | null>(null);
  const loading = useSignal<boolean>(false);

  const submit$ = $(async () => {
    loading.value = true;
    error.value = null;
    const cred = { email: email.value.trim(), password: password.value };
    const path = mode.value === "login" ? "/auth/login" : "/auth/register";
    const res = await api.post<{ token: string; user: { id: string; email: string } }>(path, cred);
    loading.value = false;
    if (!res.ok || !res.data) {
      error.value = (res && res.error) || "Authentication failed";
      return;
    }
    // Set auth signals directly to avoid capturing auth functions
    auth.token.value = res.data.token;
    auth.user.value = res.data.user;
    // Also sync the derived token signal if exists in parent via useTask$; parent will react.
    // Persist to localStorage
    if (typeof window !== "undefined") {
      window.localStorage.setItem("auth_token", res.data.token);
      window.localStorage.setItem("auth_user", JSON.stringify(res.data.user));
    }
  });

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.35)",
      display: "grid",
      placeItems: "center",
      zIndex: 50
    }}>
      <div style={{
        width: "min(420px, 92vw)",
        background: "#fff",
        borderRadius: "12px",
        border: "1px solid var(--border)",
        boxShadow: "0 8px 30px rgba(0,0,0,.20)",
        padding: "20px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <div class="brand"><span class="dot" /> Notes</div>
          <div style={{ color: "#666", fontSize: "14px" }}>{mode.value === "login" ? "Login" : "Create account"}</div>
        </div>
        <div style={{ display: "grid", gap: "10px" }}>
          <input
            class="input"
            type="email"
            placeholder="Email"
            value={email.value}
            onInput$={(_, el) => (email.value = el.value)}
          />
          <input
            class="input"
            type="password"
            placeholder="Password"
            value={password.value}
            onInput$={(_, el) => (password.value = el.value)}
          />
          {error.value && <div style={{ color: "#b00020", fontSize: "14px" }}>{error.value}</div>}
          <button class={"button primary"} disabled={loading.value} onClick$={submit$}>
            {loading.value ? "Please wait..." : (mode.value === "login" ? "Login" : "Register")}
          </button>
          <button class="button" onClick$={() => (mode.value = mode.value === "login" ? "register" : "login")}>
            {mode.value === "login" ? "Create an account" : "Have an account? Login"}
          </button>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Notes",
  meta: [
    { name: "description", content: "Personal notes manager" },
    { name: "theme-color", content: "#1976d2" },
  ],
};
