# Changelog

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
