# ISCC Mass-Balancer Modules

This document outlines the core modules of the ISCC Mass-Balancer application, derived from both the frontend pages and backend routes.

## 1. Authentication & Security (`auth`, `oauth`)
*   **Frontend:** `LoginPage.tsx`
*   **Backend:** `auth.routes.ts`, `oauth.routes.ts`
*   **Description:** Handles user authentication, secure JWT generation, session management, and rate limiting (preventing brute-force attacks).

## 2. Company & Profile Management (`companies`)
*   **Frontend:** `CompanyProfilePage.tsx`
*   **Backend:** `companies.routes.ts`
*   **Description:** Allows companies to manage their operational profiles, contact details, registration information, and upload company logos.

## 3. User Management (`users`)
*   **Frontend:** `UsersPage.tsx`
*   **Backend:** *(Handled internally via company administration)*
*   **Description:** Handles role-based access control (Super Admin, Company Admin, Company User) allowing administrators to invite and manage staff access.

## 4. Site Management (`sites`)
*   **Frontend:** *(Managed within `CompanyProfilePage.tsx`)*
*   **Backend:** `sites.routes.ts`
*   **Description:** Manages the physical operational sites for each company, including their locations and ISCC EU / ISCC PLUS certifications (with file uploads for certificates).

## 5. Period Management (`periods`)
*   **Frontend:** `PeriodsPage.tsx`
*   **Backend:** `periods.routes.ts`
*   **Description:** Enforces mass-balance continuity by defining discrete accounting periods (e.g., Q1, Q2). Includes complex closing logic to calculate balances, check carry-forward limits (like GHG max rules), and prevent negative balances before locking the period down.

## 6. Batch Management (`batches`)
*   **Frontend:** `BatchesPage.tsx`
*   **Backend:** `batches.routes.ts`
*   **Description:** The core ledger tracking quantities (e.g., MWh, tons) of certified materials, split by product type, certification scheme, and GHG emission values.

## 7. Transactions (`transactions`)
*   **Frontend:** `TransactionsPage.tsx`, `TransactionLogPage.tsx`
*   **Backend:** `transactions.routes.ts`
*   **Description:** Handles inbound (purchasing) and outbound (selling) movements of certified materials between sites, validating them against the current open accounting period.

## 8. Material Conversions (`conversions`)
*   **Frontend:** `ConversionsPage.tsx`
*   **Backend:** `conversions.routes.ts`
*   **Description:** Allows Processing Units to convert input materials into output products using defined conversion factors (yield ratios), strictly tracking the mass balance formula: `Input = Output + Loss`.

## 9. Scheme Transfers (`schemeTransfers`)
*   **Frontend:** `SchemeTransfersPage.tsx`
*   **Backend:** `schemeTransfers.routes.ts`
*   **Description:** Facilitates unidirectional transfers of balances from stricter schemes to more permissive ones (e.g., from ISCC EU down to ISCC PLUS) as allowed by ISCC regulations.

## 10. Physical Stock Readings (`stockReadings`)
*   **Frontend:** `StockReadingsPage.tsx`
*   **Backend:** `stockReadings.routes.ts`
*   **Description:** Allows operators to log physical tank/storage readings at the end of a period to reconcile book inventory against physical inventory.

## 11. Documents & Proofs (`documents`)
*   **Frontend:** *(Attached to Batches/Transactions)*
*   **Backend:** `documents.routes.ts`
*   **Description:** Manages physical proofs of sustainability (PoS), delivery notes, and invoices linked to specific batches.

## 12. Audit Log (`auditLog`)
*   **Frontend:** `AuditLogPage.tsx`
*   **Backend:** `auditLog.routes.ts`
*   **Description:** An immutable, system-wide trail of every critical action (period closings, balance adjustments, site creations) ensuring the application is fully auditable for compliance.

## 13. Dashboard & Reporting (`dashboard`)
*   **Frontend:** `DashboardPage.tsx`
*   **Backend:** `dashboard.routes.ts`
*   **Description:** A high-level overview for administrators showing tracked MWh, total active sites, period recording metrics, and unresolved audit flags.
