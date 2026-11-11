# ISCC Mass-Balancer - Project Progress

This document tracks the implementation progress of the core modules defined in the `Module.MD` specification.

## Core Modules Implementation Status

| Module | Frontend Page | Backend Route | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **1. Authentication & Security** | `LoginPage.tsx` | `auth.routes.ts`, `oauth.routes.ts` | ✅ Completed | Implements user auth, secure JWT, session management. |
| **2. Company & Profile Mgmt** | `CompanyProfilePage.tsx` | `companies.routes.ts` | ✅ Completed | Company profile and details management. |
| **3. User Management** | `UsersPage.tsx` | (via company administration) | ✅ Completed | Role-based access control. |
| **4. Site Management** | (within `CompanyProfilePage.tsx`) | `sites.routes.ts` | ✅ Completed | Operational sites and certifications. |
| **5. Period Management** | `PeriodsPage.tsx` | `periods.routes.ts` | ✅ Completed | Accounting periods, closing logic, balances. |
| **6. Batch Management** | `BatchesPage.tsx` | `batches.routes.ts` | ✅ Completed | Core ledger for certified materials. |
| **7. Transactions** | `TransactionsPage.tsx`, `TransactionLogPage.tsx` | `transactions.routes.ts` | ✅ Completed | Inbound and outbound movements. |
| **8. Material Conversions** | `ConversionsPage.tsx` | `conversions.routes.ts` | ✅ Completed | Input to output conversions and mass balance. |
| **9. Scheme Transfers** | `SchemeTransfersPage.tsx` | `schemeTransfers.routes.ts` | ✅ Completed | Unidirectional scheme balance transfers. |
| **10. Physical Stock Readings**| `StockReadingsPage.tsx` | `stockReadings.routes.ts` | ✅ Completed | Physical inventory reconciliation. |
| **11. Documents & Proofs** | (Attached to Batches/Transactions) | `documents.routes.ts` | ✅ Completed | Sustainability proofs and files. |
| **12. Audit Log** | `AuditLogPage.tsx` | `auditLog.routes.ts` | ✅ Completed | Immutable system-wide trail. |
| **13. Dashboard & Reporting** | `DashboardPage.tsx` | `dashboard.routes.ts` | ✅ Completed | High-level overview metrics. |

## Application Structure

### Frontend (`frontend/src/pages`)
All primary frontend pages mapped to the modules have been successfully scaffolded and implemented.

### Backend (`backend/src`)
The backend architecture is fully connected. `index.ts` is configured to mount all the respective module routes and also handles load-balancing (cluster) and job workers setup.

- **Routing:** All REST API routes matching the core modules are implemented and integrated into the main Express application.
- **Middleware & Security:** General rate limiting, CORS configuration, and error handling are implemented.
