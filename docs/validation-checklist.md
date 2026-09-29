# BIVA — Validation Plan & Checklist (v1)

**App:** BIVA — Business Inventory & Value Assistant (Sierra Leone SMEs)  
**Currency:** NLe  
**Use:** Before go-live and after major updates (receipts, barcodes, offline, day close)

---

## 1. Test environment

| Item | Requirement |
|------|-------------|
| Device | Phone/tablet or PC used in the shop |
| Browser | Chrome or Edge (recommended) |
| Install | Add to home screen (PWA) if possible |
| Printer | 58mm thermal (or PDF for testing) |
| Network | Test both **online** and **offline** |

---

## 2. Printer setup (58mm)

Before receipt/label tests, set in the print dialog:

- Paper: **58mm** / Receipt / custom 58mm wide
- Margins: **None**
- Headers & footers: **Off**
- Scale: **100%** (not “Fit to page width”)

Use the in-app **Print** button — not Ctrl+P.

---

## 3. Validation checklist

**Tester name:** _______________  
**Date:** _______________  
**Shop:** _______________

Mark: Pass | Fail | Skip | N/A

### A. Login & access

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| A1 | Sign in online | Open app → sign in with OTP | Lands on Home dashboard | |
| A2 | Stay signed in offline | Sign in once online → go offline → reopen app | Can use Sell, Products, History, Returns | |
| A3 | Account offline | Go offline → tap Account | Account disabled or shows offline message | |

### B. Products & stock

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| B1 | View products | Products tab | List loads with name, price, stock | |
| B2 | Add product | Products → Add → save | Product appears in list | |
| B3 | Edit product | Edit name/price → save | Changes show on Products and Sell | |
| B4 | Quick stock adjust | Products → + / − on card | Stock count updates | |
| B5 | Low stock | Product at/below threshold | Warning shown on product | |

### C. Barcode / scan code & labels

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| C1 | Generate scan code | Add/Edit product → Generate | Code appears (e.g. SE-…) | |
| C2 | Label preview | Toggle Barcode / QR | Preview shows name, price, code image | |
| C3 | Print label | Print label (wait for barcode to load) | 58mm label only — no dialog chrome | |
| C4 | Save label PNG | Save image | PNG downloads with barcode + text | |
| C5 | Print from Products list | Products → tag icon on product with scan code | Label dialog → print works | |

### D. Sales (Sell)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| D1 | Manual sale | Sell → tap product → Checkout → pay full | Receipt shows; stock reduced | |
| D2 | Search by name | Type product name in search | Correct product found | |
| D3 | Scan at sell | Scan product barcode (exact code) | Product added to cart | |
| D4 | Part payment / credit | Checkout → pay less than total | Receipt shows balance due | |
| D5 | Print receipt | Receipt dialog → Print | 58mm receipt; shop name, items, total | |
| D6 | Receipt reprint | History → open sale → Print | Same receipt reprints correctly | |

### E. Returns

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| E1 | Return from History | History → sale → Return | Sell opens in return mode linked to sale | |
| E2 | Process return | Select items → complete | Return receipt; stock updated per disposition | |
| E3 | Link to original | Open return receipt | Shows link to original sale | |
| E4 | Print return receipt | Print on return receipt | Prints correctly | |

### F. Credit book (Debtors)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| F1 | View debtors | Account → Credit book | Lists customers with balance | |
| F2 | Collect payment | Add payment on debtor | Balance reduces; receipt/history updates | |
| F3 | Print debtor receipt | Print from debtor receipt view | Prints correctly | |

### G. Offline

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| G1 | Sale offline | Offline → complete sale | “Saved offline” message; receipt shown | |
| G2 | Sync when online | Reconnect internet | Sale syncs; receipt gets permanent ID | |
| G3 | Stock adjust offline | Offline adjust on product | Queued; applies when online | |
| G4 | Sync conflicts | If conflicts appear | Account → Sync conflicts → resolve | |

### H. End of day

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| H1 | Day close preview | Account → End-of-day close | Shows expected cash/payments for date | |
| H2 | Count cash | Enter counted cash | Variance calculated | |
| H3 | Save day close | Save (must be **online**) | Saves successfully | |
| H4 | Day close offline | Try save while offline | Save blocked with clear message | |

### I. Branding

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| I1 | Shop name on receipt | Print receipt | Business name on receipt | |
| I2 | Logo on receipt | Set logo in Account → print | Logo appears on receipt | |

---

## 4. Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Shop owner | | | |
| Cashier / tester | | | |
| Tech support | | | |

**Go-live approved:** Yes / No — blockers: _______________

---

## 5. Known limits

- Browser print depends on **58mm paper settings** in the print dialog.
- **Account** branding saves online only; other account tools work offline.
- **Day close** can be saved offline and syncs with the queue when online.
- **Sync conflicts**: use Try again when online; dismiss refreshes cache from server.
- Offline sales sync when connection returns.
- Handheld Sunmi/BT printers may need PNG share or native printer app instead of browser print.
