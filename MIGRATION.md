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

## v5.9.0 — 2026-03-20 (Current)

### New Features
- ✅ **ISS-07 Pull-to-refresh** — AdminPage: pull down from top (>70px) shows ↻ pill and reloads all admin data
- ✅ **ISS-02 Acknowledge All** — TasksPage: orange banner when unacknowledged self-reports exist; one-tap bulk acknowledge via `POST /api/selfreports/acknowledge-all` (new endpoint)
- ✅ **ISS-05 Special Tasks unified view** — AdminPage Manage tab: shows ALL completed adhoc tasks (not just today's) in Completed section

### Already Implemented (verified)
- ✅ **ISS-06 Activity time-group headers** — already present in all filter modes
- ✅ **ISS-03 Weights form at top** — weight entry form already above history list in Settings tab

---

## v5.8.0 — 2026-03-19

### 新功能
- ✅ **Calendar 頁面** — 完整月曆格，點擊日期展開當日任務/餵食/異常/體重摘要
- ✅ **Calendar API** — `GET /api/calendar/day?date=YYYY-MM-DD` 後端新端點

### Bug Fixes
- ✅ selfreports `parseInt` → `parseFloat`（0.5份食物現在正確儲存）
- ✅ `currentDate` 跨夜更新（每分鐘自動 refresh）
- ✅ cron/simulate `doneIds` 只算 `isDone:true`（略過任務不再誤觸通知）
- ✅ PIN verify + change 加 input 存在性驗證

## v5.9 Roadmap (Coming Next)

- [ ] Full Admin panel (overview, records, weights, tasks, cat profile)
- [ ] Incident report modal improvements
- [ ] Feed report modal improvements
- [ ] i18n language switcher UI
- [ ] Yesterday backlog mode
- [ ] Calendar: pre-fetch optimization / lazy load badges
