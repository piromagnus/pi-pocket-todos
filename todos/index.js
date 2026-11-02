// Tasks' browser module: a panel beside the conversation with the session's task list, an item in the status line that
// opens it, and the words of the `todo_write` calls. The app loads it and calls its default export with `pocket`, the
// app's API for extensions (docs/extensions.md).

/** The version of `pocket` this module was written for: an older app does not load it. */
export const pocketApi = 1;

/** A tick, as a 24×24 stroked path like the app's own icons. */
const TICK = "M5 12.5l4.5 4.5L19 7";

export default function setup(pocket) {
    const { html, useEffect, useState, Loader } = pocket;

    pocket.style("style.css");

    /** The list of the session that the tab shows: one copy for the panel and the status line. */
    let shown = { conversation: null, items: [], error: null };
    /** What the panel's drawing listens to. */
    const listeners = new Set();
    let panel = null;
    let item = null;

    /** Where a tap on the status line goes: the panel, or a page on an app that has no panels. */
    const opens = typeof pocket.panel === "function" ? { panel: "todos" } : { page: "todos" };

    /** The status line, and the panel's button: how many tasks are done, and which one Pi works on now. */
    const draw = () => {
        const { items } = shown;
        const done = items.filter((task) => task.status === "done").length;
        const active = items.find((task) => task.status === "active");

        panel?.update({ badge: items.length - done });

        if (typeof pocket.status !== "function") {
            return;
        }

        if (items.length === 0) {
            item?.remove();
            item = null;

            return;
        }

        const spec = {
            id: "todos",
            text: `${done}/${items.length}`,
            short: `${done}/${items.length}`,
            title: active ? `Now: ${active.text}` : `${done} of ${items.length} tasks done`,
            ...opens,
        };

        if (item) {
            item.update(spec);
        } else {
            item = pocket.status(spec);
        }
    };

    const publish = (conversation, items, error = null) => {
        shown = { conversation, items, error };

        for (const listener of listeners) {
            listener(shown);
        }

        draw();
    };

    /** The panel: the list, with a box to tick each task, a field to add one, and what went wrong. */
    function Tasks() {
        const [state, setState] = useState(shown);
        const [draft, setDraft] = useState("");

        useEffect(() => {
            setState(shown);
            listeners.add(setState);

            return () => listeners.delete(setState);
        }, []);

        /**
         * Send the list the person made. It shows at once, and goes back if the server refuses it. The handlers read
         * `shown`, which is always what the server has, not what this drawing saw.
         */
        const write = (items) => {
            const conversation = pocket.conversationId();

            if (conversation === null) {
                return;
            }

            const before = shown.items;

            publish(conversation, items);
            pocket.api(`tasks/${conversation}`, { items }).catch((failure) => {
                publish(conversation, before, failure.message);
            });
        };

        const toggle = (at) => {
            write(
                shown.items.map((task, index) =>
                    index === at
                        ? { ...task, status: task.status === "done" ? "pending" : "done" }
                        : task,
                ),
            );
        };

        const add = (event) => {
            event.preventDefault();

            const text = draft.trim().slice(0, 200);

            if (text === "") {
                return;
            }

            setDraft("");
            write([...shown.items, { text, status: "pending" }]);
        };

        if (state.conversation !== pocket.conversationId()) {
            return html`<div class="td-panel"><${Loader} /></div>`;
        }

        const done = state.items.filter((task) => task.status === "done").length;
        const percent =
            state.items.length === 0 ? 0 : Math.round((done / state.items.length) * 100);

        return html`<div class="td-panel">
            <div class="td-head">
                <span class="td-count">${done}/${state.items.length}</span>
                <span class="td-bar"
                    ><span class="td-fill" style=${`width:${percent}%`}></span
                ></span>
                ${
                    done === 0
                        ? null
                        : html`<button
                              class="td-link"
                              onClick=${() =>
                                  write(shown.items.filter((task) => task.status !== "done"))}
                          >
                              Clear done
                          </button>`
                }
            </div>
            ${
                state.items.length === 0
                    ? html`<p class="muted small">
                          No tasks. Pi writes them with its todo_write tool, or add one here.
                      </p>`
                    : html`<ul class="td-list">
                          ${state.items.map(
                              (task, index) =>
                                  html`<li class=${`td-task td-${task.status}`}>
                                      <button
                                          class="td-check"
                                          aria-pressed=${task.status === "done"}
                                          aria-label=${`Done: ${task.text}`}
                                          title=${task.status === "done" ? "Not done" : "Done"}
                                          onClick=${() => toggle(index)}
                                      >
                                          ${task.status === "done" ? "✓" : ""}
                                      </button>
                                      <span class="td-text">${task.text}</span>
                                      ${
                                          task.status === "active"
                                              ? html`<span class="td-now">now</span>`
                                              : null
                                      }
                                      <button
                                          class="td-drop"
                                          aria-label=${`Delete: ${task.text}`}
                                          title="Delete"
                                          onClick=${() =>
                                              write(shown.items.filter((_, at) => at !== index))}
                                      >
                                          ×
                                      </button>
                                  </li>`,
                          )}
                      </ul>`
            }
            ${
                state.error === null
                    ? null
                    : html`<p class="td-error small" role="alert">${state.error}</p>`
            }
            <form class="td-add" onSubmit=${add}>
                <input
                    type="text"
                    maxlength="200"
                    placeholder="Add a task"
                    aria-label="Add a task"
                    value=${draft}
                    onInput=${(event) => setDraft(event.currentTarget.value)}
                />
                <button class="button" type="submit">Add</button>
            </form>
        </div>`;
    }

    if (typeof pocket.panel === "function") {
        panel = pocket.panel({ id: "todos", title: "Tasks", component: Tasks, iconPath: TICK });
    } else {
        pocket.page({ id: "todos", title: "Tasks", component: Tasks });
        pocket.rail({ id: "todos", title: "Tasks", iconPath: TICK, page: "todos" });
    }

    // The list of the session that the tab shows, at once and each time another one opens.
    pocket.onConversation((conversation) => {
        if (conversation === null) {
            publish(null, []);

            return;
        }

        pocket.api(`tasks/${conversation}`).then(
            (answer) => {
                // The person may have opened another session while it loaded.
                if (pocket.conversationId() === conversation) {
                    publish(conversation, answer.items);
                }
            },
            (failure) => publish(conversation, [], failure.message),
        );
    });

    // A change from Pi's tool, or from another tab.
    pocket.on("todos", ({ conversation, items }) => {
        if (conversation === pocket.conversationId()) {
            publish(conversation, items);
        }
    });

    pocket.toolCall({
        tool: "todo_write",
        iconPath: TICK,
        label: () => "update tasks",
        subject: (args) => {
            const items = Array.isArray(args?.tasks) ? args.tasks : [];
            const done = items.filter((task) => task?.status === "done").length;

            return items.length === 0 ? "clear" : `${done}/${items.length} done`;
        },
        summary: () => ({ verb: "updated", noun: "task list" }),
    });
}
