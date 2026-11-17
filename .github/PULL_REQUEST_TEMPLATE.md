## Summary

<!-- What does this change do, and why? Link the issue it resolves, if any. -->

## Type of change

- [ ] Bug fix
- [ ] New feature or improvement to an existing tool
- [ ] New tool
- [ ] Shared kit / design system
- [ ] Docs, CI, or tooling

## Screenshots

<!-- For any visible change: light and dark themes, desktop and phone width. -->

## Checklist

- [ ] `node scripts/check.mjs` passes
- [ ] `node scripts/e2e.mjs` passes (or CI's browser job is green)
- [ ] Every file I touched has an up-to-date header: Version, Date, and Update bumped, with a Changelog entry for non-trivial edits
- [ ] Shipped files keep at most three changelog entries; older ones are in `CHANGELOG.md`
- [ ] Docs match the change (README, CONTRIBUTING, tool help text)
- [ ] Works in both themes, at desktop and phone width, with keyboard only
- [ ] No network requests, no `eval` / `new Function`, and no user data passed to `innerHTML`
