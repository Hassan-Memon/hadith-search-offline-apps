# Changelog

## 2026-11-12 — 1.3.0: the website's narrators and search, and its look

Brings the website's updates of 8–11 November into the app, and dresses the
app like the website. Details and measurements: `docs/1.3.0-website-updates.md`.

- **Looks like the website:** its dark header with the calligraphic logo, the
  home page picture with the search box, «یہاں کیا ہے؟» cards, the dark footer,
  tinted page headings, the bottom bar with the current tab in a pill, the
  narration page's header card, the website's cyan and Nastaliq interface.
  Dark mode kept.
- **روات حدیث:** names in Arabic (with the Urdu name on the narrator's page),
  in the order of the book's «فہرستِ رُوات»; search in Arabic or Urdu; sort by
  name, death or mentions; cards with the death date and the study's opening.
  317 narrators (spellings the website merged are one, and old addresses
  still work).
- **A narrator's page** shows the study from his latest volume, as the website
  does (same book for all 317), laid out like a narration with its contents,
  tools, copy and Word file, and the footnotes it cites; his other studies are
  listed under it.
- **Search** needs most of the typed words, as the website now does: «نماز کی
  فضیلت» finds 206 narrations instead of 891. Looser spellings only when the
  exact words find fewer than three, with the website's note. As fast as before.
- **Copied text** keeps words whole that Word had split across two spans.
- **کتب خانہ** says where the books themselves are: the app lists each book's
  narrations, and a note links to the website's کتب خانہ to read or download
  the whole book (needs internet).
- **No new download:** data schema 3 only adds two narrator columns. The
  published snapshot is upgraded in place, so devices fetch the registry
  (42 KB) and keep everything else. Apps on 1.2 update themselves first.
- Development: `pnpm dev` can do a first download again (the dev server no
  longer marks the snapshot as gzip-encoded).

## 2026-11-07 — 1.2.0: ابواب, رواۃ, the book registry and the website's reader tools

Brings the website's updates of 4–7 November into the app, offline.

- **ابواب (chapters):** /chapters grouped like the website (عقائد، عبادات …),
  a page per باب, the باب in the narration's breadcrumb and on list cards,
  «ہر باب سے ایک روایت» on «تمام احادیث», and related narrations from the
  same باب first (then the same book), as on the website.
- **رواۃ (narrators):** /narrators with name search (harakat and letter forms
  ignored) and a period filter, and a page per narrator with the studies
  quoted from the narrations already on the device. A narration lists its
  narrators and links each study section to the narrator's page.
- **Search:** filter by book and by باب, with or without words typed.
- **Books:** order, part numbers and publication dates from the website's
  book registry; two stored spellings of one book are one book. The
  narration shows «تاریخِ اشاعت».
- **Narration page:** contents list, open/close all sections, copy the
  whole text (formatted for Word, plain for chats), a Word (.docx) file made
  on the device, print, text size, and «کتاب کے اصل صفحات (PDF)» from the
  website for books whose pages are all known (needs internet).
- **تعارف:** preface of part 2 and «بعض تعبیرات کی توضیح».
- Website links (/all-hadees, /search-hadees?…, /topics, /chapters,
  /narrators) open the same page in the app.

**Fixed: devices on 1.0 did not update.** 1.0 pages expect each new version
to take over by itself. Since 1.1 a new version waits for the page to tell it
to take over, and 1.0 pages never send that message. So a browser or
installed app that had 1.0 open kept it until every window of the app was
closed (a reload is not enough, and phones keep the app alive in the
background). New browsers were fine. Now a new version asks the open pages
their version when it installs (`public/sw-handoff.js`). If one does not
answer (1.0), the new version takes over at once and that page reloads
itself into it. Pages of 1.1 and later answer, so they keep the calm
"update when in the background / update now" behaviour. Tested in a
browser: 1.0 open → deploy → reload → 1.2 within a second; 1.2 open → next
deploy → waits with the banner.

**Data (schema 2).** The hourly build reads three small registries
(/api/books, /api/chapters, /api/narrators) besides the list. A باب or date
change comes with the list, so it reaches devices as a small `meta` entry
without fetching the narration again. Devices download the registries
(`registry-<sha>.json`) only when they change. The first build after this
release is a full one (new epoch); every device downloads the snapshot once.

**Size and speed, measured on the real data (910 narrations).** Snapshot
9.45 MB gz (was 9.42), 42.2 MB on the device (was 41.8). Search, lists and
opening a narration take the same time as before; the new small columns sit
before the text so filters never read through it. App start-up JS 109 KB gz
(was 103); تعارف, رواۃ and the Word export load as separate chunks.

## 2026-11-04 — 1.1.0: data stays on the device; calmer app updates

**Fixed: data lost on refresh (seen on Android).** The on-device database
(SQLite in OPFS, "opfs-sahpool") can be open in only one window at a time.
When a second copy of the app was open (the installed app plus the Chrome tab
it was installed from, two desktop windows, or a reload while the old page was
still shutting down), the new one could not open the files and silently used
a throw-away in-memory copy: it downloaded 10 MB again, and that copy and any
bookmarks made in it were gone on the next refresh.

- The window in front owns the database (Web Lock with steal). The other
  window closes its copy and takes it back when it is focused again.
- A page that is left or reloaded stops its worker at once (`pagehide`), so
  the next page opens the files without waiting.
- The in-memory fallback is only used where the browser has no OPFS at all.
- Normal starts show a short "opening" screen instead of the first-run
  "download 10 MB" screen.
- Bookmarks, history and dismissed announcements survive a snapshot install
  (new data epoch, schema change, or a device far behind); before, the new
  file replaced them.

**App updates.** The service worker no longer reloads the page by itself. A new
version waits and is applied when the app goes to the background or from the
"update now" banner; the app checks hourly and on returning to the foreground,
updates at once when the data needs it, and says so after it updated.

## 2026-11-03 — Decision: the app's data is built outside the website

The app's data is built by a scheduled GitHub Action in this repository from
the website's public API and published to GitHub Pages next to the app. The
website is not changed. The in-website sync API (website PR #95) is closed and
will not be pursued.

**Why**

- Zero cost: public repository, GitHub Pages and Actions are free. No new
  service, and no droplet CPU, memory or bandwidth spent on device syncs.
- Fails safe: if the website is down, devices and new installs keep working
  from GitHub Pages; if a build fails, the last good data stays published.
- No website risk: no new endpoints, volumes or deploys on the donor-funded
  droplet; every future change to sync ships from this repository only.
- Freshness of up to one hour is enough for a collection that changes a few
  times a week. Admins can run the workflow by hand after an urgent
  correction.

**Revisit if** sub-hour freshness becomes required without manual runs, the
public API is locked down, the app needs per-user server features, the
collection passes about 5,000 hadith, or this repository must go private.
Even then, start with a deploy-time command on the website that writes the
same static files for nginx to serve, with no runtime endpoints.

### Hardening done with this decision

- **Build epoch.** Cursors are `<epoch>:<n>`; a rebuild from scratch starts a
  new epoch and every device reinstalls the snapshot. Before, a restarted
  counter could leave a device with a higher cursor wrongly "caught up".
- **No accidental rebuilds.** If the published build cannot be read (network,
  5xx), the run stops instead of rebuilding from scratch.
- **Changes by content.** Documents re-fetched because `updated_at` moved are
  compared by content; timestamp-only changes never reach devices.
- **Validation.** Every fetched document must have id, slug, title, book,
  sections and text, or nothing is published.
- **Deletion limit.** More than 5 deletions (or 2 %) in one run is refused
  unless the workflow is run by hand with "allow deletes".
- **Failed snapshot is an error.** A device that needs the snapshot and cannot
  download it reports an error and retries, instead of showing partial data.
- **Hourly schedule** (off the top of the hour); runs where nothing changed
  skip the deploy.
- **Keepalive.** Scheduled runs re-enable the workflow through the API so
  GitHub does not disable it after 60 days without commits.
- **Failure issue.** A failed run opens or updates one "Data build failing"
  issue.
- **Visible freshness.** مزید shows when the data was last published.
- The builder sends a descriptive User-Agent so the website owner can
  recognise it.

Not done: an early exit after the first list page. The list is not ordered by
date, so an unchanged first page says nothing about edits on page 50; the full
list (91 small requests) stays the check.
