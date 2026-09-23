# SUPERADMIN DATA MIGRATION INVENTORY

## OVERVIEW

This inventory lists all SuperAdmin and platform-level authentication accounts and data assets identified during the **Phase SUPERADMIN.DATA** inspection.

The migration objective is to transition SuperAdmin authentication and platform data to PostgreSQL so the SuperAdmin portal operates on native REST APIs (`/api/v1/superadmin/*`, `/api/v1/auth/*`) without core Firebase dependencies.

---

## SUPERADMIN & PLATFORM DATA ASSET INVENTORY

| Firebase Source | Purpose | Record Count | PostgreSQL Destination | Dependency | Migration Required |
| :--- | :--- | ---: | :--- | :--- | :--- |
| `users` (superadmin role) | SuperAdmin administrative account(s) | 1 | `users` table (`system_role = 'SUPER_ADMIN'`) | None | **YES** (Auth & User Record) |
| `schools` | Tenant school accounts | 4 | `schools` table | `subscription_plans` | **YES** (Platform Tenants) |
| `plans` | Subscription plans & feature modules | 4 | `subscription_plans` table | None | **YES** (Platform Plans) |
| `platformSettings` | Platform-wide configurations | 1 | `platform_settings` table | None | **YES** (Platform Config) |
| `platformBranding` | Platform white-label branding | 1 | `platform_branding` table | None | **YES** (Platform Branding) |
| `auditLogs` (platform) | SuperAdmin administrative action logs | 10 | `audit_logs` table | `users` | **YES** (Platform Audit) |
| `zuna-landing-page-22564` (Support Tickets) | External ticket system | 12 | Isolated external project | Firebase project | ⏸️ **DEFERRED** (External project) |

---

## SUPERADMIN ACCOUNT CENSUS

| Attribute | Details |
| :--- | :--- |
| **Email** | `superadmin@platform.com` |
| **System Role** | `SUPER_ADMIN` |
| **School ID** | `NULL` (Global platform scope) |
| **Target Password Algorithm** | `argon2id` (RFC 9106 compliant) |
| **Authentication Endpoint** | `POST /api/v1/auth/login` |
| **Session Authority** | PostgreSQL JWT Access Token + HttpOnly Refresh Cookie |

---

## EXCLUSION VERIFICATION

The following operational school data assets are **EXPLICITLY EXCLUDED** from this SuperAdmin migration phase:
* Students (`students` table)
* Teachers & Staff (`staff_profiles` table)
* Parents & Linkages (`parent_profiles` table)
* Attendance records (`attendance` table)
* Homework & Assignments (`homework` table)
* Exams & Grades (`examinations` table)
* Fees & Invoices (`fee_collections` table)
* HR & Payroll (`payrolls` table)
* Inventory items (`inventory_items` table)
* Admissions (`admission_applications` table)
* Academic Calendar (`academic_calendar_events` table)
* Canteen orders (`canteen_items` table)
* Transport & Vehicles (`transport_routes` table)
* Library books (`library_books` table)
