# Tasks

Author: Pierre Marrec. MIT license.

A task list for each Pi Pocket session. Pi keeps it with its `todo_write` tool, and people see it in a panel beside the conversation, with a count in the status line under the message box.

It works as the task lists of other agent harnesses do: the model sets the whole list each time, one task is `active`, and a task is `done` as soon as it is finished. The list belongs to the session, so a fork continues it, and a new session starts empty.

## Install

Copy `todos.ts` and the `todos/` browser folder into the data folder's `extensions/` folder (default `~/.pi-pocket/extensions/`):

```sh
mkdir -p ~/.pi-pocket/extensions
cp todos.ts ~/.pi-pocket/extensions/
cp -R todos ~/.pi-pocket/extensions/
```

Open **Menu → Extensions** and turn on `todos`. A drop-in starts off. Do not copy `_pocket.d.ts`: Pi Pocket supplies its own types in the drop-in folder.

## Use

- **Pi** calls `todo_write` for work of three steps or more, and for a plan that someone asks for. Its prompt section tells it when, and to mark a task `active` before it starts it.
- **The panel** shows the list beside the conversation: a box to tick a task, a field to add one, a delete button on each row, and **Clear done**. The top bar and the places get a button for it.
- **The status line** shows `done/total`, with the active task as its tooltip. A tap opens the panel. It goes away while the list is empty.
- **The transcript** shows a `todo_write` call as "update tasks · 1/3 done".

## What it reads and writes

Only its own data, and only through public Pi Pocket APIs:

- One document per session, kind `x.todos.list`, with the list.
- Two routes, `GET tasks/:conversation` and `POST tasks/:conversation`, for the owner alone. A route checks that the session is one the person can see.
- One event, `todos`, that tells the open tabs what the list is now.

It reads no file, no secret, and no session content, starts no process, and uses no network.

## Check it

```sh
node --test extensions/todos/todos.test.ts      # the tool, the routes, and the words it refuses
node --test extensions/todos/todos-ui.test.ts   # the panel in Chromium; TODOS_SHOTS=<folder> writes screenshots
```

## Publish it

The code is at `piromagnus/pi-pocket-todos`, and the gallery entry is `entries/todos.json` in `TannerMidd/pi-pocket-extensions`. To publish a new version: commit the files there, then set `source.commit` and the SHA-256 and size of each file in that entry.

In **Menu → Extensions → Installed**, **Share…** on `todos` writes that entry for you, with the description from the module's comment and the hash of each file, and opens a pull request.
