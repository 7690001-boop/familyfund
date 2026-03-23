# Project Roadmap & TODO

## Phases

- **Phase 1 — Core Enhancements** (high value, low complexity)
- **Phase 2 — Engagement & Gamification** (kid-facing features)
- **Phase 3 — Analytics & Reporting** (data, exports, email)
- **Phase 4 — Advanced Features** (AI, matching, notifications)
- **Phase 5 — Platform & Infrastructure** (PWA, performance, accessibility)

---

## Phase 1 — Core Enhancements

### 1.1 Market Ticker Banner
- Top banner showing live market data: USD/ILS, S&P 500, Nasdaq 100
- Daily change % with color coding (green / red)
- Data via existing Cloudflare Worker (Yahoo Finance proxy)
- Auto-refresh every few minutes, visible to all users

### 1.2 Family Announcement Banner
- Manager posts pinned announcements visible to all family members
- Create, edit, delete, optional expiry date
- Members can dismiss per-session
- Firestore: `families/{id}/announcements`

### 1.3 Bills & Expenses Display
- Track recurring bills alongside income (housing, utilities, subscriptions, etc.)
- Manager adds/edits family bills
- Dashboard shows net cash flow: income − bills
- Firestore: `families/{id}/bills`

### 1.4 Manual "Refresh Prices Now" Button
- Currently prices auto-refresh; add a manual trigger in the UI
- Useful after market open or after adding a new holding

### 1.5 Duplicate Investment Warning
- Warn manager when adding a ticker that already exists as a separate position
- Suggest consolidating or confirm intentional separate lot

---

## Phase 2 — Engagement & Gamification

### 2.1 Long-Term Holding Reward Indicator
- Visual badge for kids holding an index fund long-term
- Milestones: 1 month → 3 months → 6 months → 1 year → 2 years
- Progression metaphor: seedling → sapling → tree
- Animated sparkle/glow on the asset row at each milestone
- Eligible tickers configurable by manager (default: S&P 500, World Index)
- Counter: "החזקת את זה X ימים — המשך כך!"

### 2.2 Achievement Badges
- Earn badges for milestones:
  - First investment ever
  - First goal reached
  - Held a position for 1 year
  - Portfolio crossed a value threshold
  - 3 active goals at once
- Badges displayed on kid's summary card
- Manager can award custom badges with a note

### 2.3 Savings Streaks
- Track consecutive weeks/months where a kid added to savings
- Display streak counter with flame icon
- Break = streak resets; manager can grant a "freeze" to protect a streak

### 2.4 Finance Quiz (School Section)
- Short multiple-choice quizzes attached to school topics
- Score tracking per member
- Manager can create quizzes; kids earn a checkmark on completion
- Leaderboard within family (optional, manager can hide)

### 2.5 Goal Categories
- Tag goals with a category: חופשה / קולג' / גאדג'ט / חיסכון כללי / אחר
- Filter and group goals by category
- Each category has a distinct icon/color

---

## Phase 3 — Analytics & Reporting

### 3.1 Weekly Summary Email
- Scheduled Cloud Function (every Sunday)
- Excel report (.xlsx) per family:
  - Portfolio snapshot per member
  - Weekly gains/losses
  - Savings goals progress
  - Recent transactions
- Sent to manager email via SendGrid or Firebase Email Extension
- Backup copy stored in Firebase Storage

### 3.2 Portfolio Performance Over Time
- Weekly snapshot of total portfolio value stored automatically
- Graph showing value history (week / month / all-time)
- Per-kid and family-level views

### 3.3 Price History Charts
- Click a holding to see a price chart (1W / 1M / 3M / 1Y)
- Data via Cloudflare Worker (Yahoo Finance historical prices)

### 3.4 Portfolio Allocation Chart
- Pie/donut chart: breakdown by asset type (ETF, stock, cash, bond, crypto)
- Optional: breakdown by currency (ILS vs. USD vs. other)
- Shown on kid view and family view

### 3.5 Per-Kid Excel/CSV Export
- Export individual member data as Excel (not just full family JSON)
- Useful for parents tracking each child separately

### 3.6 Annual Gains Summary
- Year-end report: total gains/losses per member per year
- Useful reference for Israeli tax reporting (Appendix B awareness)

---

## Phase 4 — Advanced Features

### 4.1 Investment Matching for Long-Term Investments
- Parent matches a % of eligible long-term investments
- Configurable match period (default: 1 year lock-in) and match %
- Eligible securities: S&P 500, World Index (manager-configurable)
- Manager UI to set rules; member UI shows matching benefit upfront
- Firestore: `families/{id}/matchRules`

### 4.2 AI Integration (Free Tier)
- Options to evaluate:
  - **Google Gemini Flash** — free tier, strong Hebrew, easiest integration
  - **Groq** — fast inference, free tier (Llama 3 / Mixtral)
  - **OpenRouter** — free models aggregator
- Use cases:
  - Kid-friendly explanation of portfolio performance in Hebrew
  - Smart savings tip based on current goals
  - Finance Q&A in the School/Chat section
- Start with Gemini Flash

### 4.3 Notification System
- Push/email alerts for:
  - Investment request submitted (→ manager)
  - Investment request approved/rejected (→ kid)
  - Goal deadline approaching (7 days before)
  - Long-term holding milestone reached
  - Price alert triggered
- In-app notification bell + optional email

### 4.4 Price Alerts
- Member or manager sets a price threshold for any holding
- Trigger: price crosses above or below threshold
- Delivery: in-app notification + optional email

### 4.5 "Smart Goal Forecast"
- Auto-calculates: "At your current savings rate, you'll reach this goal in X months"
- Uses current portfolio value + historical return rate (configurable)
- Updates weekly with each portfolio snapshot

---

## Phase 5 — Platform & Infrastructure

### 5.1 PWA / Installable App
- Service worker for offline viewing (cached last state)
- "Add to home screen" support on iOS and Android
- Background sync when reconnected

### 5.2 Dark Mode
- CSS variable-based theme toggle
- Respect system preference (`prefers-color-scheme`) by default
- Manual toggle in settings

### 5.3 Accessibility Audit
- ARIA labels on all interactive elements
- Keyboard navigation in tables and modals
- Color-blind safe indicators (icons alongside color coding)

### 5.4 Mobile Polish
- Fix modal overflow on small screens
- Dismiss keyboard on form submit
- Responsive heatmap font sizing
- Touch-friendly drag handles in asset table

---

## Community & Feedback

### C.1 Roadmap Viewer (In-App)
- Page showing all upcoming features with status: planned / in progress / done
- Pulled from Firestore `appRoadmap` (admin-managed)
- All users can see it — encourages transparency with kids

### C.2 Feature Voting
- Users vote on which user-facing features they want most
- Each feature in the roadmap has an upvote button
- Votes scoped per family (manager + members each get one vote per feature)
- Admin sees vote totals across all families to prioritize development
- Firestore: `appRoadmap/{featureId}/votes/{familyId}`
- Display: vote count + "X families want this"

### C.3 Suggestions Box
- Any family member can submit a feature request or bug report
- Form: title + description
- Manager sees family submissions and can mark as noted/forwarded/done
- Member sees status of their own submissions
- Firestore: `families/{id}/suggestions`
