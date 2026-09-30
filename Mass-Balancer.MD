# ISCC Mass Balancer Web Application

## 📖 Project Overview
The ISCC Mass Balancer is a secure, cloud-ready web application designed to digitize and manage ISCC EU/PLUS mass balance calculations. Built to replace manual Excel workflows, this system enforces strict regulatory compliance, mathematical traceability, and secure data storage through a centralized relational database. 

While Phase 1 is built for internal, single-tenant use, the database architecture is designed with **Row-Level Tenant Isolation**, making it fully scalable for a future Multi-Tenant SaaS platform.

## 🚀 Tech Stack
*   **Frontend:** React.js, Vite, TypeScript, React Router, Axios
*   **Backend:** Node.js, Express.js, TypeScript
*   **Database:** MySQL (hosted locally via XAMPP for development)
*   **ORM:** Prisma
*   **Tunneling (UAT):** ngrok (for client UI/UX testing)

## ⚙️ Core Features (Phase 1)
*   **Authentication System:** Role-Based Access Control (RBAC) ensuring only authorized users can input or modify stock.
*   **Mass Balance Engine:** Automated regulatory calculation applying the formula $B = (A+a) \times CF + b$.
*   **Append-Only Audit Trail:** A gapless logging system capturing `before_value` and `after_value` for all database modifications to ensure ISCC audit readiness.
*   **Transaction Ledgers:** Automated tracking of inbound, outbound, and conversion events linked explicitly to periods and sites.
*   **Scheme Transfers:** Controlled logic bridging ISCC EU to ISCC PLUS volume transfers.

## 🗄️ Database Architecture Highlights
The Prisma schema utilizes a strict relational design:
*   **Company Isolation:** Every operational table (`Sites`, `Periods`, `Transactions`, `Batches`) includes a `company_id` to strictly isolate data and prevent cross-tenant leaks.
*   **Strict Period Locking:** The `Periods` table utilizes an Enum (`OPEN`, `CLOSED`) to dictate state, preventing historical modifications once a reporting period is finalized.
*   **Traceability:** `BatchMerges` and `ConversionLines` handle the complex many-to-one and one-to-many relationships inherent in biomethane processing and stock merging.

---

## 🛠️ Local Development Setup

### 1. Database Initialization
1. Start your **XAMPP Control Panel**.
2. Start the **MySQL** module (Port 3306). Apache is not required.

### 2. Backend Setup
Navigate to the `backend` directory:
```bash
cd backend
npm install