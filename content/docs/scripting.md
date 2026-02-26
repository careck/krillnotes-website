---
title: "Scripting Guide"
description: "Learn how to define custom note types, hooks, and views with Rhai scripts."
weight: 2
---

Scripts in Krillnotes are written in [Rhai](https://rhai.rs), a small, fast scripting language embedded in the application. Each script can define one or more **schemas** (note types) and optional **hooks** that run when notes of those types are saved or displayed.

User scripts are managed through **Settings → Scripts**. The bundled system scripts (TextNote, Contact, Task, Project, etc.) are always available and serve as working examples.

---

## 1. Script structure

A script file is plain Rhai. The top-level calls available are:

| Call | Purpose |
|---|---|
| `schema(name, def)` | Register a note type, with optional inline hooks |
| `add_tree_action(label, types, callback)` | Register a custom context-menu entry in the tree |

Hooks (`on_save`, `on_view`, `on_add_child`) are defined as keys inside the `schema()` map. `add_tree_action` is a standalone top-level call — see [section 8](#8-add_tree_action).

A minimal script that defines a type:

```rhai
schema("Snippet", #{
    fields: [
        #{ name: "language", type: "text",     required: false },
        #{ name: "code",     type: "textarea", required: true  },
    ]
});
```

A script can contain any number of `schema()` calls. It is conventional to keep related types together in a single file.

---

## 2. Defining schemas

```rhai
schema("TypeName", #{
    // --- optional schema-level options ---
    title_can_view:         true,          // default: true
    title_can_edit:         true,          // default: true
    children_sort:          "asc",         // "asc" | "desc" | "none" (default)
    allowed_parent_types:   ["Folder"],    // default: [] (any parent allowed)
    allowed_children_types: ["Item"],      // default: [] (any child allowed)

    // --- required ---
    fields: [
        #{ name: "field_name", type: "text", required: true },
        // … more fields …
    ],

    // --- optional hooks ---
    on_save:      |note| { /* … */ note },
    on_view:      |note| { /* … */ text("") },
    on_add_child: |parent_note, child_note| { /* … */ #{ parent: parent_note, child: child_note } },
});
```

### Field definition

Each entry in `fields` is a map:

```rhai
#{
    name:        "my_field",   // required — snake_case string
    type:        "text",       // required — see Field types below
    required:    false,        // optional — default: false
    can_view:    true,         // optional — show in view mode (default: true)
    can_edit:    true,         // optional — show in edit mode (default: true)
    options:     ["A", "B"],   // required for "select" fields
    max:         5,            // required for "rating" fields
    target_type: "Project",    // optional for "note_link" fields — restricts picker to this schema type
}
```

`can_edit: false` is the standard way to mark a derived / computed field — it can be written by an `on_save` hook but users cannot change it directly.

---

## 3. Field types

| Type | Storage | Notes |
|---|---|---|
| `"text"` | String | Single-line text input |
| `"textarea"` | String | Multi-line text input; rendered as Markdown in the default view |
| `"number"` | Float | Numeric input |
| `"boolean"` | Bool | Checkbox |
| `"date"` | String (ISO `YYYY-MM-DD`) or `null` | Date picker |
| `"email"` | String | Email input with mailto link in view mode |
| `"select"` | String | Dropdown; requires `options: [...]` |
| `"rating"` | Float | Star rating; requires `max: N` (e.g. `max: 5`) |
| `"note_link"` | String (note ID) or `null` | Reference to another note; edit mode shows an inline search picker, view mode renders the linked note's title as a clickable navigation link. Optional `target_type` restricts the picker to a specific schema type. |

### Reading field values in hooks

Inside a hook, fields are accessed via `note.fields["field_name"]` or `note.fields.field_name`. The bracket syntax is safer when the field might not exist:

```rhai
let val = note.fields["notes"] ?? "";   // returns "" if the field is absent
```

Dates arrive as a string `"YYYY-MM-DD"` when set, or as the unit value `()` when empty. Check with `type_of` before doing string operations:

```rhai
let d = note.fields["due_date"];
if type_of(d) == "string" && d != "" {
    // safe to use d as a string
}
```

---

## 4. Schema options

### `title_can_edit: false`

Hides the title input in edit mode. Use this when the title is always derived by an `on_save` hook (e.g. Contacts: `"Smith, Jane"`).

### `title_can_view: false`

Hides the title entirely in view mode. Rarely needed.

### `children_sort: "asc" | "desc"`

Automatically sorts child notes alphabetically by title when displayed in the tree. Default is `"none"` (manual/insertion order).

### `allowed_parent_types: [...]`

Restricts which note types this type may be placed under. Krillnotes will enforce this constraint when moving notes. An empty array means no restriction.

```rhai
allowed_parent_types: ["ContactsFolder"],
```

### `allowed_children_types: [...]`

Restricts which note types may be placed inside this type.

```rhai
allowed_children_types: ["Contact"],
```

> **Validation order:** `allowed_parent_types` and `allowed_children_types` are always checked **before** any hook runs. If validation fails the operation is aborted and no hook fires.

---

## 5. on_save hook

The `on_save` hook runs every time a note of the given type is saved. It receives the note as a mutable map and must return the (possibly modified) note. It is defined as an `on_save` key inside the `schema()` map.

```rhai
schema("TypeName", #{
    fields: [ /* … */ ],
    on_save: |note| {
        // read fields
        let name = note.fields["name"];

        // write derived fields
        note.fields["summary"] = "Hello, " + name;

        // set the title
        note.title = name;

        // always return note
        note
    }
});
```

### The `note` map

| Key | Type | Writable |
|---|---|---|
| `note.id` | String | No |
| `note.node_type` | String | No |
| `note.title` | String | Yes |
| `note.fields` | Map | Yes (individual keys) |

> **Tags are not available in `on_save`.** Tags are managed through the tag editor in the UI, not via hooks. To read a note's tags in a script, use an `on_view` hook instead — see [section 6](#6-on_view-hook).

### Example — derived title and computed field

```rhai
schema("Book", #{
    fields: [ /* … */ ],
    on_save: |note| {
        let title  = note.fields["book_title"];
        let author = note.fields["author"];
        note.title = if author != "" && title != "" {
            author + ": " + title
        } else if title != "" {
            title
        } else {
            "Untitled Book"
        };
        note
    }
});
```

### Example — status badge

```rhai
schema("Task", #{
    fields: [ /* … */ ],
    on_save: |note| {
        let status = note.fields["status"];
        let symbol = if status == "DONE" { "✓" }
                     else if status == "WIP"  { "→" }
                     else { " " };
        note.title = "[" + symbol + "] " + note.fields["name"];
        note
    }
});
```

### Example — numeric derived field

```rhai
schema("Recipe", #{
    fields: [ /* … */ ],
    on_save: |note| {
        let total = (note.fields["prep_time"] + note.fields["cook_time"]).to_int();
        note.fields["total_time"] = if total <= 0 { "" }
            else if total < 60  { total.to_string() + " min" }
            else {
                let h = total / 60;
                let m = total % 60;
                if m == 0 { h.to_string() + "h" }
                else      { h.to_string() + "h " + m.to_string() + "min" }
            };
        note
    }
});
```

---

## 6. on_view hook

The `on_view` hook runs when a note is selected in the view panel. It receives the note map and must return an HTML string built with the [display helper functions](#9-display-helpers). The default field rendering is replaced entirely by this output; users still switch to edit mode normally. It is defined as an `on_view` key inside the `schema()` map.

The note map in `on_view` has the following keys:

| Key | Type | Notes |
|---|---|---|
| `note.id` | String | Read-only |
| `note.node_type` | String | Read-only |
| `note.title` | String | Read-only |
| `note.fields` | Map | Read-only field values |
| `note.tags` | Array of Strings | Tags assigned to this note; empty array if none |

```rhai
schema("TypeName", #{
    fields: [ /* … */ ],
    on_view: |note| {
        // build and return HTML using display helpers
        text("Hello from " + note.title)
    }
});
```

When no `on_view` hook is registered, the view panel falls back to the standard field grid, where `textarea` fields are rendered as Markdown automatically.

Inside an `on_view` hook, field values are returned as raw strings. Use the `markdown()` display helper to render them as Markdown:

```rhai
schema("MyNote", #{
    fields: [ /* … */ ],
    on_view: |note| {
        markdown(note.fields["body"] ?? "")
    }
});
```

### Early return

Return early for edge cases:

```rhai
schema("ContactsFolder", #{
    fields: [ /* … */ ],
    on_view: |note| {
        let contacts = get_children(note.id);
        if contacts.len() == 0 {
            return text("No contacts yet.");
        }
        // … rest of the hook …
    }
});
```

### Composing output

Display helpers return strings; compose them by nesting or with `stack`:

```rhai
schema("MyType", #{
    fields: [ /* … */ ],
    on_view: |note| {
        stack([
            heading("Overview"),
            field("Status", note.fields["status"] ?? "-"),
            divider(),
            section("Notes", text(note.fields["notes"] ?? ""))
        ])
    }
});
```

---

## 7. on_add_child hook

The `on_add_child` hook runs whenever a note is created as a child — or moved via drag-and-drop — under a note whose schema defines the hook. It receives both the parent note and the child note, and can return modifications to either or both.

It is defined as an `on_add_child` key inside the parent's `schema()` call.

```rhai
schema("TypeName", #{
    fields: [ /* … */ ],
    on_add_child: |parent_note, child_note| {
        // modify parent_note and/or child_note
        #{ parent: parent_note, child: child_note }
    }
});
```

### Signature

`|parent_note, child_note| -> Map`

- `parent_note` — the note whose schema defines this hook (same map shape as `on_save`)
- `child_note` — the new child (on creation: has schema default fields; on move: has existing data)
- **Return value:** a Rhai map with optional `parent` and/or `child` keys. Only present keys are persisted. Returning `()` is a no-op for both notes.

### The note map

Both arguments have the same shape:

| Key | Type | Writable |
|---|---|---|
| `note.id` | String | No (ignored if changed) |
| `note.node_type` | String | No (ignored if changed) |
| `note.title` | String | Yes |
| `note.fields` | Map | Yes (individual keys) |

### When it fires

| Operation | Fires? |
|---|---|
| Note created as a child | Yes |
| Note moved under a new parent | Yes |
| Note created at root level (no parent) | No |

### Validation order

`allowed_parent_types` and `allowed_children_types` checks run **before** the hook. If either check fails the operation is aborted and the hook never runs.

### Error handling

Any runtime error in the hook aborts the entire operation (the note is not created or moved) and shows an error with the script name and line number.

### Example — child count in parent title

```rhai
schema("ContactsFolder", #{
    fields: [
        #{ name: "child_count", type: "number", can_view: true, can_edit: false },
    ],
    on_add_child: |parent_note, child_note| {
        let count = (parent_note.fields["child_count"] ?? 0.0) + 1.0;
        parent_note.fields["child_count"] = count;
        parent_note.title = "Contacts (" + count.to_int().to_string() + ")";
        #{ parent: parent_note, child: child_note }
    }
});
```

### Example — no modification needed

Return `()` or an empty map to leave both notes unchanged:

```rhai
schema("TypeName", #{
    fields: [ /* … */ ],
    on_add_child: |parent_note, child_note| {
        // side-effect only, no note changes
        ()
    }
});
```

---

## 8. add_tree_action

`add_tree_action` registers a custom entry in the tree's right-click context menu. It is a standalone top-level call — not a key inside `schema()`.

```rhai
add_tree_action(label, allowed_types, callback)
```

| Parameter | Type | Description |
|---|---|---|
| `label` | String | Menu item text shown to the user |
| `allowed_types` | Array of Strings | Schema names for which the item appears |
| `callback` | Closure `\|note\| { … }` | Called when the user clicks the item |

The `note` argument has the same shape as in `on_save` — `id`, `node_type`, `title`, and `fields`.

The callback can use query functions (`get_children`, `get_note`, etc.) to read workspace state. If it returns an array of note ID strings, the backend reorders those notes in the given order. Any other return value is ignored. The tree refreshes automatically after the callback completes.

### Example — sort children alphabetically

```rhai
add_tree_action("Sort Children A→Z", ["Folder"], |note| {
    let children = get_children(note.id);
    children.sort_by(|a, b| a.title <= b.title);
    children.map(|c| c.id)
});
```

**Label uniqueness:** Labels must be unique per note type. If two scripts register the same label for the same type, the first-registered entry wins and a warning is printed.

---

## 9. Display helpers

All helpers return an HTML string. All user-supplied text is HTML-escaped automatically.

### `text(content)`

Whitespace-preserving paragraph. Use for plain multi-line text.

```rhai
text("Line one\nLine two")
```

### `markdown(content)`

Renders a Markdown string as HTML. Use this in `on_view` hooks when displaying `textarea` fields that contain Markdown (the default view renders them automatically, but `on_view` hooks receive raw strings).

```rhai
markdown(note.fields["body"] ?? "")
```

### `heading(text)`

A bold section heading.

```rhai
heading("Project Details")
```

### `field(label, value)`

A single key-value row with a muted label and normal-weight value.

```rhai
field("Email", note.fields["email"] ?? "-")
field("Status", note.fields["status"] ?? "—")
```

### `fields(note)`

Renders all fields in the note as key-value rows, skipping empty values. Field key names are humanised (`"first_name"` → `"First Name"`).

```rhai
fields(note)
```

### `table(headers, rows)`

A table with a header row. `headers` is an array of strings; `rows` is an array of arrays.

```rhai
let rows = contacts.map(|c| [c.title, c.fields["email"] ?? "-"]);
table(["Name", "Email"], rows)
```

### `section(title, content)`

Wraps content in a titled container with an uppercase small-caps label above.

```rhai
section("Contacts (3)", table(...))
section("Notes", text(note.fields["notes"] ?? ""))
```

### `stack(items)`

Lays items out vertically with consistent spacing. Items are strings (i.e. outputs of other helpers).

```rhai
stack([
    section("Overview", fields(note)),
    divider(),
    section("Tasks", list(tasks.map(|t| t.title)))
])
```

### `columns(items)`

Lays items out as equal-width columns side by side.

```rhai
columns([
    section("Left", text("...")),
    section("Right", text("..."))
])
```

### `list(items)`

A bullet list. Items are strings.

```rhai
list(["Apples", "Bananas", "Cherries"])
list(tasks.map(|t| t.title))
```

### `badge(text)`

A neutral pill badge.

```rhai
badge("Active")
```

### `badge(text, color)`

A colored pill badge. Supported colors: `"red"`, `"green"`, `"blue"`, `"yellow"`, `"gray"`, `"orange"`, `"purple"`. Any other color falls back to the neutral badge.

```rhai
badge("High",   "red")
badge("Done",   "green")
badge("Paused", "yellow")
```

### `link_to(note)`

A clickable link that navigates to the given note. Useful inside `on_view` hooks that query related notes.

```rhai
link_to(note)
link_to(c)   // where c is a note from get_children() or get_notes_of_type()
```

### `render_tags(tags)`

Renders a `note.tags` array as coloured pill badges. Returns an empty string when the array is empty.

```rhai
render_tags(note.tags)
```

### `divider()`

A horizontal rule.

```rhai
divider()
```

---

## 10. Query functions

Query functions are available inside `on_view` hooks. They let you fetch related notes from the workspace without leaving the scripting layer.

### `get_children(note_id)`

Returns an array of direct child notes for the given ID.

```rhai
let items = get_children(note.id);
```

### `get_note(note_id)`

Returns a single note by ID, or `()` (unit) if not found.

```rhai
let parent = get_note(note.parent_id);
if parent != () {
    field("Parent", parent.title)
}
```

### `get_notes_of_type(type_name)`

Returns all notes in the workspace that match the given schema type.

```rhai
let all_tasks = get_notes_of_type("Task");
let open = all_tasks.filter(|t| t.fields["status"] != "DONE");
```

### `get_notes_for_tag(tags)`

Returns all notes that carry **any** of the given tags (OR semantics, deduplicated). The argument is an array of tag strings.

```rhai
let related = get_notes_for_tag(note.tags);
let others  = related.filter(|n| n.id != note.id);
```

### `get_notes_with_link(note_id)`

Returns all notes that have a `note_link` field pointing to the given note ID. Use this to display backlinks — for example, all Tasks that reference a Project.

```rhai
let backlinks = get_notes_with_link(note.id);
if backlinks.len() > 0 {
    section("Linked from", list(backlinks.map(|n| link_to(n))))
}
```

### Note map shape

Each note returned by the query functions has the same shape as the `note` map passed to hooks:

| Key | Type |
|---|---|
| `note.id` | String |
| `note.node_type` | String |
| `note.title` | String |
| `note.fields` | Map of field values |
| `note.tags` | Array of Strings |

---

## 11. Utility functions

### `today()`

Returns today's date as a `"YYYY-MM-DD"` string. Useful in `on_save` hooks to auto-stamp date fields or derive a date-prefixed title.

```rhai
schema("Journal", #{
    fields: [
        #{ name: "date",  type: "date",     can_edit: false },
        #{ name: "entry", type: "textarea", required: true  },
    ],
    on_save: |note| {
        if type_of(note.fields["date"]) != "string" || note.fields["date"] == "" {
            note.fields["date"] = today();
        }
        note.title = note.fields["date"] + " — Journal";
        note
    }
});
```

---

## 12. Introspection functions

These are available both at the top level and inside hooks.

### `schema_exists(name)`

Returns `true` if a schema with the given name is currently registered.

```rhai
if schema_exists("Project") {
    // safe to reference Project notes
}
```

### `get_schema_fields(name)`

Returns an array of field-definition maps for the named schema.

```rhai
let defs = get_schema_fields("Task");
// defs[0].name, defs[0].type, defs[0].required, defs[0].can_view, defs[0].can_edit
```

---

## 13. Tips and patterns

### Null-coalescing with `??`

Field values may be absent when a note was created before the field was added to the schema. Use `??` to provide a fallback:

```rhai
let phone = note.fields["phone"] ?? "-";
```

### Conditional sections

Omit sections when the data is empty to keep views clean:

```rhai
let notes_val = note.fields["notes"] ?? "";
if notes_val == "" {
    contacts_section
} else {
    stack([contacts_section, section("Notes", text(notes_val))])
}
```

### Conditional badges based on a field value

```rhai
let status = note.fields["status"] ?? "";
let color  = if status == "DONE"    { "green" }
             else if status == "WIP" { "blue" }
             else                    { "gray" };
badge(status, color)
```

### Date arithmetic

Date fields are ISO strings (`"YYYY-MM-DD"`) when set. For simple day-difference calculations, split on `"-"` and use the approximation `year×365 + month×30 + day`:

```rhai
let s_parts = started.split("-");
let f_parts = finished.split("-");
let s_days  = parse_int(s_parts[0]) * 365 + parse_int(s_parts[1]) * 30 + parse_int(s_parts[2]);
let f_days  = parse_int(f_parts[0]) * 365 + parse_int(f_parts[1]) * 30 + parse_int(f_parts[2]);
let diff    = f_days - s_days;
if diff > 0 { diff.to_string() + " days" } else { "" }
```

This is an approximation suitable for display (not calendar-accurate).

### Checking date field presence

Date fields are `()` (unit) when not set, not an empty string. Always check the type before string operations:

```rhai
let d = note.fields["due_date"];
let label = if type_of(d) == "string" && d != "" { d } else { "Not set" };
```

### `title_can_edit: false` + `on_save` title derivation

When the title is always derived from fields, disable direct title editing to avoid confusion:

```rhai
schema("Contact", #{
    title_can_edit: false,
    fields: [ /* … */ ],
    on_save: |note| {
        note.title = note.fields["last_name"] + ", " + note.fields["first_name"];
        note
    }
});
```

### Folder / item pair

A common pattern is one container type with `allowed_children_types` and one item type with `allowed_parent_types`:

```rhai
schema("ProjectFolder", #{
    allowed_children_types: ["Project"],
    fields: []
});

schema("Project", #{
    allowed_parent_types: ["ProjectFolder"],
    fields: [ /* … */ ]
});
```

### Child count with `on_add_child`

Track how many children a container note has using a derived field updated by the hook:

```rhai
schema("ProjectFolder", #{
    fields: [
        #{ name: "item_count", type: "number", can_view: true, can_edit: false },
    ],
    allowed_children_types: ["Project"],
    on_add_child: |parent_note, child_note| {
        let count = (parent_note.fields["item_count"] ?? 0.0) + 1.0;
        parent_note.fields["item_count"] = count;
        parent_note.title = "Projects (" + count.to_int().to_string() + ")";
        #{ parent: parent_note, child: child_note }
    }
});
```

Note: this count only increases on add — it does not decrease when notes are deleted or moved away. To maintain an accurate live count, use `on_view` with `get_children()` instead.

### Displaying tags and related notes

Use `render_tags` and `get_notes_for_tag` together in an `on_view` hook to show a note's tags and link to related notes:

```rhai
schema("Zettel", #{
    fields: [
        #{ name: "body", type: "textarea" },
    ],
    on_view: |note| {
        let related = get_notes_for_tag(note.tags).filter(|n| n.id != note.id);
        let related_section = if related.len() > 0 {
            section("Related", list(related.map(|n| link_to(n))))
        } else { "" };
        stack([
            render_tags(note.tags),
            markdown(note.fields["body"] ?? ""),
            related_section
        ])
    }
});
```

### Backlinks with `get_notes_with_link`

Use a `note_link` field on one type and display backlinks on the target type's `on_view` hook:

```rhai
// Task links to a Project
schema("Task", #{
    fields: [
        #{ name: "project", type: "note_link", target_type: "Project" },
    ],
    on_save: |note| { note }
});

// Project shows all tasks that link to it
schema("Project", #{
    fields: [ /* … */ ],
    on_view: |note| {
        let tasks = get_notes_with_link(note.id);
        let tasks_section = if tasks.len() > 0 {
            section("Tasks (" + tasks.len() + ")", list(tasks.map(|t| link_to(t))))
        } else {
            section("Tasks", text("No tasks yet."))
        };
        stack([fields(note), tasks_section])
    }
});
```

---

## 14. Built-in script examples

The following scripts ship with Krillnotes and can be studied as complete examples.

### TextNote — minimal schema, no hooks

```rhai
schema("TextNote", #{
    fields: [
        #{ name: "body", type: "textarea", required: false },
    ]
});
```

### Task — derived title, status symbol, priority label

```rhai
schema("Task", #{
    title_can_edit: false,
    fields: [
        #{ name: "name",           type: "text",     required: true                     },
        #{ name: "status",         type: "select",   required: true,
           options: ["TODO", "WIP", "DONE"]                                             },
        #{ name: "priority",       type: "select",   required: false,
           options: ["low", "medium", "high"]                                           },
        #{ name: "due_date",       type: "date",     required: false                    },
        #{ name: "assignee",       type: "text",     required: false                    },
        #{ name: "notes",          type: "textarea", required: false                    },
        #{ name: "priority_label", type: "text",     required: false, can_edit: false   },
    ],
    on_save: |note| {
        let name   = note.fields["name"];
        let status = note.fields["status"];
        let symbol = if status == "DONE" { "✓" }
                     else if status == "WIP" { "→" }
                     else { " " };
        note.title = "[" + symbol + "] " + name;

        let priority = note.fields["priority"];
        note.fields["priority_label"] =
            if priority == "high"        { "🔴 High" }
            else if priority == "medium" { "🟡 Medium" }
            else if priority == "low"    { "🟢 Low" }
            else                         { "" };
        note
    }
});
```

### Contacts — folder + card with on_view custom table

```rhai
schema("ContactsFolder", #{
    children_sort: "asc",
    allowed_children_types: ["Contact"],
    fields: [
        #{ name: "notes", type: "textarea", required: false },
    ],
    on_view: |note| {
        let contacts = get_children(note.id);
        if contacts.len() == 0 {
            return text("No contacts yet. Add a contact using the context menu.");
        }
        let rows = contacts.map(|c| [
            link_to(c),
            c.fields["email"]  ?? "-",
            c.fields["phone"]  ?? "-",
            c.fields["mobile"] ?? "-"
        ]);
        let contacts_section = section(
            "Contacts (" + contacts.len() + ")",
            table(["Name", "Email", "Phone", "Mobile"], rows)
        );
        let notes_val = note.fields["notes"] ?? "";
        if notes_val == "" {
            contacts_section
        } else {
            stack([contacts_section, section("Notes", text(notes_val))])
        }
    }
});

schema("Contact", #{
    title_can_edit: false,
    allowed_parent_types: ["ContactsFolder"],
    fields: [
        #{ name: "first_name",      type: "text",    required: true  },
        #{ name: "last_name",       type: "text",    required: true  },
        #{ name: "email",           type: "email",   required: false },
        #{ name: "phone",           type: "text",    required: false },
        #{ name: "mobile",          type: "text",    required: false },
        #{ name: "birthdate",       type: "date",    required: false },
        #{ name: "is_family",       type: "boolean", required: false },
    ],
    on_save: |note| {
        let last  = note.fields["last_name"];
        let first = note.fields["first_name"];
        if last != "" || first != "" {
            note.title = last + ", " + first;
        }
        note
    }
});
```
