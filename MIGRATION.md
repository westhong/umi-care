# UmiCare v5 — Migration Notes

## What Changed

**v4.x → v5.0.0: Vanilla HTML/JS → React 19 + Vite + Tailwind CSS**

| | v4.x | v5.x |
|---|---|---|
| Frontend | Single `index.html` (monolithic) | React 19 + Vite 6 + TypeScript |
| Styling | Inline CSS in HTML | Tailwind CSS v4 + CSS variables |
| State | Global `state` object (vanilla JS) | Zustand store |
| Routing | Manual page switching | React state-driven pages |
| Build | None (static HTML) | Vite build → `frontend/dist/` |
| Backend | `_worker.js` (Cloudflare Worker) | **Unchanged** |

## Architecture

```
umi-care/
├── _worker.js          # Cloudflare Worker API (unchanged)
├── wrangler.toml       # Now points to frontend/dist/
├── frontend/           # React app (NEW)
│   ├── src/
│   │   ├── main.tsx          # Entry point
│   │   ├── App.tsx           # Root component + routing
│   │   ├── pages/
│   │   │   ├── TasksPage.tsx
│   │   │   ├── CalendarPage.tsx
│   │   │   └── AdminPage.tsx
│   │   ├── components/
│   │   │   ├── TaskCard.tsx
│   │   │   ├── ProgressRing.tsx
│   │   │   ├── PinOverlay.tsx
│   │   │   └── BottomNav.tsx
│   │   ├── store/
│   │   │   └── useAppStore.ts  # Zustand state
│   │   ├── api/
│   │   │   └── client.ts       # Fetch helpers
│   │   ├── i18n/
│   │   │   └── index.ts        # zh/en translations
│   │   └── styles/
│   │       └── global.css      # CSS variables + Tailwind
│   ├── public/               # Static assets
│   └── dist/                 # Build output (served by Worker)
```

## Dev Server

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

The dev server proxies `/api/*` — you'll need a local Worker or set `BASE` in `src/api/client.ts` to your deployed URL.

## Production Build

```bash
npm run build        # from root
# or
cd frontend && npm run build
```

Output goes to `frontend/dist/`, which Wrangler serves as static assets.

## v5.1 Roadmap (Coming Next)

- [ ] Full Calendar page implementation
- [ ] Full Admin panel (overview, records, weights, tasks, cat profile)
- [ ] Incident report modal
- [ ] Feed report modal
- [ ] Push notification integration
- [ ] i18n language switcher
- [ ] Yesterday backlog mode
- [ ] Weight recording flow
