# YAiRO News

This branch only holds the news that the Control Center loads at startup
(`src/main/newsService.ts` on `master`). Fetched from
`https://raw.githubusercontent.com/hyleon-dev/yairo/news/index.json`.
Changes go live within about 5 minutes after the push (GitHub cache).

## Add a news entry

1. Create a Markdown file, e.g. `2026-10-lmu.md` (do NOT put the title in the
   file, it comes from `index.json`).
2. Add an entry to `index.json`:

```json
[
  {
    "id": "2026-10-lmu",
    "date": "2026-10-15",
    "title": "Le Mans Ultimate is now supported",
    "file": "2026-10-lmu.md",
    "priority": "high",
    "showUpdate": "v1.0.0-pre4",
    "maxVersion": "1.5.99",
    "expires": "2026-12-31"
  }
]
```

| Field        | Required | Meaning |
|--------------|----------|---------|
| `id`         | yes      | Unique, never reuse it. The app uses it to remember "read". |
| `date`       | yes      | ISO date (`"2026-10-15"`) or date with time (`"2026-10-15T14:30"`). Sorts the news, newest first. The app shows only the date. Add a time to order several news on the same day. Without a time, news with the same date keep their order in `index.json` (earlier in the array = shown as newer). |
| `title`      | yes      | Text in the banner and heading in the modal. |
| `file`       | yes      | Markdown file relative to this branch. |
| `priority`   | no       | `high` = modal at startup, otherwise (`normal`) banner only. |
| `showUpdate` | no       | Update button in the modal. `true` = latest release (only if newer than installed). A release tag like `"v1.0.0-pre4"` = minimum version: links to the newest full release >= this tag, else the newest pre-release >= this tag (only if newer than installed). So a news can point to `v1.0.0-pre4` first and switches to `v1.0.0` by itself once that is released. |
| `minVersion` | no       | Only for app versions >= this value. |
| `maxVersion` | no       | Only for app versions <= this value (e.g. "only users not yet on 1.6"). |
| `expires`    | no       | ISO date, not shown anymore from the following day. |

Relative links/images in the Markdown file (e.g. `![](img/lmu.png)`) point
to files in this branch. At most the 10 newest matching news entries are
loaded.
