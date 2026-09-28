# Releases

Versions are recorded in `package.json` and `package-lock.json`. After the
version bump is merged and CI passes, tag that commit as `vX.Y.Z` and publish
a GitHub release. The package remains private and is not published to npm.

## Website dependency updates

Publishing a release runs **Update website dependency**, opening a PR against
`willbradshaw/willbradshaw-astro` to update its package manifest and lockfile.
The PR links the release and compares the game count and `generatedAt` from
the website's currently locked commit with the new release. Review and merge
it manually; the workflow does not enable auto-merge.

Create a fine-grained personal access token restricted to
`willbradshaw/willbradshaw-astro`, with **Contents: Read and write** and
**Pull requests: Read and write** (Metadata read access is included). Store it
as the Actions repository secret **`WEBSITE_UPDATE_TOKEN` in gameplot**, not
in the website repository. The workflow's ordinary `GITHUB_TOKEN` only reads
this repo; it cannot open PRs in the website repo. Renew the PAT before it expires.

The updater uses Node 22 and `npm install --package-lock-only --ignore-scripts`.
It verifies the resolved commit against the release tag and normalizes npm's
GitHub shorthand and SSH git URLs to HTTPS in both manifests and the resolved
lock entry, so Vercel does not need an SSH key. Only `package.json`
and `package-lock.json` are committed. Required CLI dependencies stay unchanged.

If a run fails (including a missing or expired token), fix the cause and rerun
it, or use **Actions → Update website dependency → Run workflow** on `main`
with the published tag. Runs for the same tag reuse `gameplot/vX.Y.Z`, updating
the existing PR rather than opening duplicates. These branches are managed by
the workflow; reruns regenerate their changes from the website's `main`.
A website already pinned to the same release with an HTTPS lock entry produces
no dependency diff or new PR. A manual run must refer to a published release;
rerunning an older release can propose a downgrade, so check the tag first.

Publish releases through the GitHub UI or an authenticated `gh release create`.
A release created by another workflow using `GITHUB_TOKEN` will not trigger
this release workflow; use a PAT/App token for that publisher or dispatch the
website update manually. See GitHub's [workflow triggering documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
