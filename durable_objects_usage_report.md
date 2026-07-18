# Durable Objects Usage Report (Cloudflare)

This report lists the usage statistics of Cloudflare Durable Objects (DO) associated with your account (`tiejeevan@gmail.com`) for the past month.

- **Period:** 2026-06-18 to 2026-07-19
- **Account Name:** Tiejeevan@gmail.com's Account
- **Account ID:** `4f8ddf16397fb9abf048009d354b7a9c`
- **Durable Object Namespace ID:** `733ef605620649d88db9c6373360974a` (Namespace Name: `global`, Script: `hin`)

---

## Daily Usage Breakdown

| Date | Requests | Errors | Success Rate | Wall Time (s) | Billed Duration (s) | Active Time (s) | CPU Time (ms) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 2026-07-01 | 84 | 72 | 14.3% | 12.629s | 1012.280s | 7.908s | 0.194ms |
| 2026-07-02 | 6 | 6 | 0.0% | 0.479s | 46.017s | 0.360s | 0.017ms |
| 2026-07-04 | 23 | 18 | 21.7% | 5.593s | 476.129s | 3.720s | 0.047ms |
| 2026-07-05 | 52 | 28 | 46.2% | 12.094s | 944.334s | 7.378s | 0.090ms |
| 2026-07-06 | 35 | 25 | 28.6% | 17.493s | 1179.549s | 9.215s | 0.105ms |
| 2026-07-08 | 100 | 66 | 34.0% | 21.748s | 1497.530s | 11.699s | 0.316ms |
| 2026-07-09 | 13 | 12 | 7.7% | 1.415s | 173.999s | 1.359s | 0.097ms |
| 2026-07-10 | 1 | 1 | 0.0% | 0.130s | 16.694s | 0.130s | 0.009ms |
| 2026-07-11 | 12 | 8 | 33.3% | 0.165s | 15.798s | 0.123s | 0.061ms |
| 2026-07-12 | 9 | 6 | 33.3% | 0.175s | 15.301s | 0.120s | 0.031ms |
| 2026-07-16 | 43 | 40 | 7.0% | 14.034s | 1442.742s | 11.271s | 0.247ms |
| 2026-07-17 | 84 | 31 | 63.1% | 18.045s | 1740.292s | 13.596s | 0.211ms |
| 2026-07-18 | 14 | 11 | 21.4% | 1.215s | 113.198s | 0.884s | 0.042ms |
| **Total** | **476** | **324** | **31.9%** | **105.217s** | **8673.863s** | **67.765s** | **1.466ms** |

---

## Error Status Analysis

When a Durable Object request finishes, Cloudflare records its invocation status. For the **324 error requests** recorded:

| Invocation Status | Count | Percentage | Description |
| :--- | :---: | :---: | :--- |
| `clientDisconnected` | 315 | 97.2% | **Expected WebSocket Closure:** The client (browser, mobile app) disconnected before the request fully terminated. For long-lived WebSocket connections, this is normal behavior (e.g. user closed tab or app). |
| `scriptThrewException` | 9 | 2.8% | **Runtime JS Error:** An uncaught exception was thrown in the Durable Object script. |

### Daily Distribution of `scriptThrewException` Errors:
- **2026-07-01:** 2 errors
- **2026-07-06:** 4 errors
- **2026-07-08:** 2 errors
- **2026-07-16:** 1 error

---

## Observations & Recommendations

1. **No Systemic Issues:** 97.2% of the "errors" are simply `clientDisconnected` events, which are standard for WebSocket servers when users close connections.
2. **Investigating Exceptions:** The remaining 9 `scriptThrewException` events represent actual Javascript execution failures. Check the Cloudflare Worker console logs under `$workers.outcome = "exception"` or `$metadata.error EXISTS` around the specific dates above to see the stack traces.
3. **Storage/SQL Usage:** No SQLite database operations (rows read/written) or storage bytes were recorded, indicating minimal storage usage during this period.
