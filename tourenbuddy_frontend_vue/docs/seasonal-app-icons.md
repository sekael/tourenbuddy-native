# Seasonal App Icons

The app ships a **summer** and a **winter** variant of the TourenBuddy icon. Only
one set is live at a time. Swap them at the season boundary (≈ first snow / first
thaw).

## Layout

| Role             | Live path (shipped)           | Size    |
| ---------------- | ----------------------------- | ------- |
| iOS home screen  | `public/apple-touch-icon.png` | 180×180 |
| PWA icon (small) | `public/icons/icon-192.png`   | 192×192 |
| PWA icon (large) | `public/icons/icon-512.png`   | 512×512 |

The three paths above are referenced by `index.html` and the PWA manifest in
`vite.config.ts`. Filenames never change — a seasonal switch only replaces the
**bytes** at these paths. No `index.html` / manifest edits needed.

Off-season art is parked, not deleted:

- **Winter set** — `design/apple-touch-icon-winter.png`, `design/icon-192-winter.png`,
  `design/icon-512-winter.png`. Already at final sizes (180/192/512).
- **Summer source** — `public/apple-touch-icon-summer.png` (2048×2048 master).
  Kept in `public/`; excluded from the PWA precache via `globIgnores` in
  `vite.config.ts` so it does not trip the 3 MB Workbox size limit.

## Switch to winter (next fall, when winter starts)

The `design/` winter files are pre-sized, so this is a straight copy/overwrite —
no resizing:

```bash
cp design/apple-touch-icon-winter.png public/apple-touch-icon.png
cp design/icon-192-winter.png         public/icons/icon-192.png
cp design/icon-512-winter.png         public/icons/icon-512.png
```

Verify:

```bash
file public/apple-touch-icon.png public/icons/icon-192.png public/icons/icon-512.png
# expect 180x180, 192x192, 512x512
```

Then `npm run dev` → devtools → Application → Manifest to confirm winter art
renders. Commit (`feat: switch app icons to winter variant`).

## Switch back to summer (next spring)

The summer master is 2048×2048, so regenerate the three sizes from it with
`sips` (built into macOS):

```bash
sips -z 180 180 public/apple-touch-icon-summer.png --out public/apple-touch-icon.png
sips -z 192 192 public/apple-touch-icon-summer.png --out public/icons/icon-192.png
sips -z 512 512 public/apple-touch-icon-summer.png --out public/icons/icon-512.png
```

Same verify step as above.

## Notes

- PWA clients only pick up the new icon after the service worker updates and the
  app is re-added to the home screen — expect a lag for installed users.
- Keep both variants' masters in version control so either direction is a
  one-command swap.
