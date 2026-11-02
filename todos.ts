/**
 * Tasks: a task list for each session that Pi keeps with a todo_write tool, and that people see and change in a panel
 * beside the conversation. It uses only this module's documents and public Pi Pocket APIs: no outside files, secrets,
 * processes, or network services.
 */
import { Type } from "@earendil-works/pi-ai";
import { defineDoc, defineExtension, defineTool, section } from "@earendil-works/pi-durable";
import type { ConversationId } from "@earendil-works/pi-durable";
import type { Web, WebRequest } from "./_pocket.d.ts";

// It returns `output`, so it needs version 2 of the extension API: Pi Pocket 0.18 says so, and does not load it.
export const pocketApi = 2;

/** How a task stands. `active` is the one that Pi works on now. */
export type Status = "pending" | "active" | "done";

/** One task of a session's list. */
export type Task = { text: string; status: Status };

/** A list has this many tasks at most. */
const MAX_TASKS = 50;

/** A task is one line of this many characters at most. */
const MAX_TEXT = 200;

/** Each session's tasks, in order. A document kind is stored data: named after the module, never renamed. */
const Tasks = defineDoc<{ items: Task[] }>({
    kind: "x.todos.list",
    version: 1,
    scope: "conversation",
    history: "latest",
    // A fork continues the work that the list describes, so it starts with the list as it is.
    fork: "current",
    initial: () => ({ items: [] }),
    checkpointWhen: () => false,
});

/**
 * The list as it is stored, from what the tool or the panel gives: at most 50 tasks, each one line of at most 200
 * characters. It throws words for the model and for the person.
 */
export function cleanTasks(value: unknown): Task[] {
    if (!Array.isArray(value)) {
        throw new Error("tasks must be a list");
    }

    if (value.length > MAX_TASKS) {
        throw new Error(`A list has ${MAX_TASKS} tasks at most.`);
    }

    return value.map((each: unknown) => {
        const task = each as { text?: unknown; status?: unknown } | null;
        const text = typeof task?.text === "string" ? task.text.replace(/\s+/g, " ").trim() : "";
        const status = task?.status;

        if (text === "") {
            throw new Error("Every task needs text.");
        }

        if (text.length > MAX_TEXT) {
            throw new Error(`A task has ${MAX_TEXT} characters at most.`);
        }

        if (status !== "pending" && status !== "active" && status !== "done") {
            throw new Error("A task's status is pending, active, or done.");
        }

        return { text, status };
    });
}

/** What the model reads back: the list, so that it sees what it set. */
export function describe(items: Task[]): string {
    if (items.length === 0) {
        return "The task list is empty.";
    }

    const done = items.filter((task) => task.status === "done").length;
    const count = items.length === 1 ? "1 task" : `${items.length} tasks`;
    const lines = items.map(
        (task) =>
            `${task.status === "done" ? "[x]" : task.status === "active" ? "[>]" : "[ ]"} ${task.text}`,
    );

    return `${count}, ${done} done:\n${lines.join("\n")}`;
}

export default function createTodos(_host: unknown, web: Web) {
    // The panel beside the conversation, in the owner's tabs.
    web.client("todos", { access: "owner" });

    /** Tell the open tabs of a session what its list is now. */
    const publish = (conversation: ConversationId, items: Task[]) => {
        web.send("todos", { conversation, items });
    };

    const todoWrite = Object.assign(
        defineTool({
            name: "todo_write",
            description:
                "Set this session's task list: the whole list, in order, each task pending, active, or done. An empty list clears it. Use it for work of three steps or more.",
            parameters: Type.Object({
                tasks: Type.Array(
                    Type.Object({
                        text: Type.String({ description: "One task, in a few words" }),
                        status: Type.Union([
                            Type.Literal("pending"),
                            Type.Literal("active"),
                            Type.Literal("done"),
                        ]),
                    }),
                    { description: "Every task, in order. It replaces the list." },
                ),
            }),
            // It replaces the whole list, so a second run after a restart gives the same list.
            replay: "safe",
            execute: async (args, api, context) => {
                const items = cleanTasks(args.tasks);

                await api.commit(async (tx) => {
                    (await tx.doc(Tasks, api.conversationId)).items = items;
                }, context);
                publish(api.conversationId, items);

                return {
                    output: [{ type: "text" as const, text: describe(items) }],
                    details: { items },
                };
            },
        }),
        // It changes this session's list only, as context management does: Pi may plan with it.
        { annotations: { readOnlyHint: true } },
    );

    /** The session that a route names, when this person can see it. */
    const sessionOf = (request: WebRequest): ConversationId => {
        const id = Number(request.params.conversation);
        const seen = request.sessions().some((session) => session.id === id);

        if (!Number.isSafeInteger(id) || id <= 0 || !seen) {
            throw web.error(404, "No such session.");
        }

        // The app checks the id against the sessions this person sees, above.
        return id as unknown as ConversationId;
    };

    web.route("GET", "tasks/:conversation", async (request) => {
        const conversation = sessionOf(request);
        const stored = await request.snapshot(Tasks, conversation, request.context);

        return { items: stored?.items ?? [] };
    });

    web.route("POST", "tasks/:conversation", async (request) => {
        const conversation = sessionOf(request);
        let items: Task[];

        try {
            items = cleanTasks(request.body.items);
        } catch (failure) {
            throw web.error(400, failure instanceof Error ? failure.message : "Invalid tasks.");
        }

        await request.commit(async (tx) => {
            (await tx.doc(Tasks, conversation)).items = items;
        });
        publish(conversation, items);

        return { items };
    });

    const guide = section(
        "todos",
        () =>
            "Plan with the `todo_write` tool when the work has three steps or more, or when the person asks for a plan: write the whole list before the first step, and revise it when the plan changes. Set the whole list each time. Mark a task `active` before you start it, and `done` as soon as it is finished, not all at the end. Keep one task `active`. Do not use it for a single step, or for a list that the person asked you to write in your answer.",
    );

    return defineExtension({ name: "todos", tools: [todoWrite], sections: [guide] });
}
