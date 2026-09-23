# SUPERADMIN FIREBASE TO POSTGRESQL MAPPING

## OVERVIEW

This document specifies the exact field transformations, type conversions, and identifier mappings between Firebase source documents and PostgreSQL target tables for SuperAdmin and platform-level assets.

---

## 1. SUPERADMIN USER MAPPING

### Target Table: `users`

| Firebase Field | PostgreSQL Column | Data Type | Transformation / Rule |
| :--- | :--- | :--- | :--- |
| `uid` | `id` | `UUID` | Generated deterministic UUID; `uid` saved to `legacy_firestore_id` |
| `email` | `email` | `VARCHAR(255)` | Lowercase, unique string |
| `password` | `password_hash` | `VARCHAR(255)` | Argon2id RFC 9106 password hash |
| `'argon2id'` | `password_algorithm` | `VARCHAR(50)` | Default `'argon2id'` |
| `'superadmin'` | `system_role` | `VARCHAR(30)` | Enums to `'SUPER_ADMIN'` |
| `null` | `school_id` | `UUID` | `NULL` for global SuperAdmin |
| `1` | `token_version` | `INT` | Default `1` |
| `true` | `is_active` | `BOOLEAN` | Default `true` |
| `createdAt` | `created_at` | `TIMESTAMPTZ` | ISO 8601 string parsed to Timestamp |
| `updatedAt` | `updated_at` | `TIMESTAMPTZ` | ISO 8601 string parsed to Timestamp |

---

## 2. TENANT SCHOOL MAPPING

### Target Table: `schools`

| Firebase Field | PostgreSQL Column | Data Type | Transformation / Rule |
| :--- | :--- | :--- | :--- |
| `id` / `docId` | `id` | `UUID` | Derived UUID; legacy document ID saved to `legacy_firestore_id` |
| `name` | `name` | `VARCHAR(255)` | String |
| `code` | `code` | `VARCHAR(50)` | Unique code (e.g. `'SchoolS001'`) |
| `type` | `type` | `VARCHAR(50)` | String |
| `status` | `status` | `VARCHAR(30)` | Default `'approved'` / `'pending'` |
| `seatLimit` | `seat_limit` | `INT` | Number |
| `teacherLimit` | `teacher_limit` | `INT` | Number |
| `timezone` | `timezone` | `VARCHAR(50)` | Default `'Asia/Kolkata'` |
| `email` | `email` | `VARCHAR(255)` | String |
| `phone` | `phone` | `VARCHAR(20)` | String |
| `address` | `address` | `TEXT` | String |
| `planId` | `plan_id` | `UUID` | FK reference to `subscription_plans.id` |
| `createdAt` | `created_at` | `TIMESTAMPTZ` | Timestamp conversion |
| `updatedAt` | `updated_at` | `TIMESTAMPTZ` | Timestamp conversion |

---

## 3. SUBSCRIPTION PLAN MAPPING

### Target Table: `subscription_plans`

| Firebase Field | PostgreSQL Column | Data Type | Transformation / Rule |
| :--- | :--- | :--- | :--- |
| `id` | `id` | `UUID` | Generated UUID |
| `name` | `name` | `VARCHAR(100)` | Unique plan name |
| `userLimit` | `user_limit` | `INT` | Number |
| `pricePerUserPerYear` | `price_per_user_per_year` | `DECIMAL(10,2)` | Number to Decimal |
| `cloudStorageGB` | `cloud_storage_gb` | `INT` | Number |
| `modules` | `modules` | `JSONB` | JSON object mapping module flags |
| `isActive` | `is_active` | `BOOLEAN` | Default `true` |

---

## 4. PLATFORM BRANDING MAPPING

### Target Table: `platform_branding`

| Firebase Field | PostgreSQL Column | Data Type | Transformation / Rule |
| :--- | :--- | :--- | :--- |
| `id` | `id` | `UUID` | Single platform record UUID |
| `platformName` | `platform_name` | `VARCHAR(255)` | String (default `'School Management System'`) |
| `logoUrl` | `logo_url` | `TEXT` | URL string |
| `faviconUrl` | `favicon_url` | `TEXT` | URL string |
| `primaryColor` | `primary_color` | `VARCHAR(20)` | Hex color string |
| `secondaryColor` | `secondary_color` | `VARCHAR(20)` | Hex color string |
| `supportEmail` | `support_email` | `VARCHAR(255)` | String |
| `footerText` | `footer_text` | `TEXT` | String |
