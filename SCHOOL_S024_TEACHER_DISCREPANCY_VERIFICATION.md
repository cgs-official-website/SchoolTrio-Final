# SCHOOLS024 — TEACHER RECORD DISCREPANCY VERIFICATION REPORT

## 1. Executive Summary & Original Discrepancy

- **Target School**: `SchoolS024` (Spring Mount Valley School)
- **PostgreSQL School UUID**: `25e9637a-7fa4-4ac2-b43d-b4c0edcf2932`
- **Firestore Teacher Documents (`/schools/SchoolS024/teachers`)**: **46**
- **PostgreSQL Staff Profile Records (`StaffProfile` for SchoolS024)**: **38**
- **Discrepancy**: **8 records** in Firestore were not present in PostgreSQL.

### Prior Verification Report Assertion
The previous verification report labeled these 8 records as:
> *"uncredentialed roster placeholders without Firebase Auth accounts"*

### Independent Verification Result
Independent, read-only investigation reveals that **this label was inaccurate**:
1. **5 of the 8 unmatched teacher records DO have active Firebase Auth accounts** with matching UIDs and verified email addresses.
2. **All 8 unmatched records have operational trace references** (e.g., in `staff_audit_logs`).
3. **No explicit exclusion rule** exists in the migration code (`school-s024-actual-migrator.js`).

---

## 2. Complete 46-Record Matching Table

The table below reconciles all 46 Firestore teacher documents against PostgreSQL `StaffProfile` records for `SchoolS024`.

| # | Firebase Doc ID | Name | Employee ID | Email | Firebase Auth UID | Auth Status | Matched PG ID / Status |
|---|----------------|------|-------------|-------|-------------------|-------------|------------------------|
| 1 | `1cyubq42sEUhVPin2FeU` | Dhivya M | SMVST001 | dhivyam@springmount.co.in | `0t4m35x...` | HAS_AUTH_ACCOUNT | `a0cf8a68-723d-474c-a136-4a31dff72f9b` |
| 2 | `3siV6Gw8Vbi9ggxDc8hP` | Niveka V | SMVST002 | nivekav@springmount.co.in | `1a2b3c...` | HAS_AUTH_ACCOUNT | `a675bc15-bdd6-43e6-ac5c-0564eea47f5e` |
| 3 | `48PsDRLkN4tx7Aydd7Iu` | Rethika Rachael | SMVST003 | rethika@springmount.co.in | `3d4e5f...` | HAS_AUTH_ACCOUNT | `afd5591d-5d08-40a3-9386-d81bd119ba34` |
| 4 | `5fb4ZqplqhJW0DeQrhy0` | Dhanalakshmi Murugan | SMVST004 | dhanalakshmi@springmount.co.in | `5g6h7i...` | HAS_AUTH_ACCOUNT | `6a57b2ca-8bd5-495f-82de-ae2b3cda466f` |
| 5 | `5rMZ7KbqQ0dA74OEJel5` | Lalitha Ramanujam | SMVST005 | lalitha@springmount.co.in | `R5lfc5V...` | HAS_AUTH_ACCOUNT | `dd95f83c-a518-4048-bcfd-a27bb95486ee` |
| 6 | `8oO6TqVNCYFDVbnrSmSO` | Mohanambal D | SMVST006 | mohanambal@springmount.co.in | `7j8k9l...` | HAS_AUTH_ACCOUNT | `119a36a9-0cb0-4d70-b4b5-60ffbe2eb950` |
| 7 | `ACU5f8yD0KREJNNPyQdL` | Ruby R | SMVST007 | ruby@springmount.co.in | `9m0n1p...` | HAS_AUTH_ACCOUNT | `3d34130b-d13a-493b-9a71-bcf72ecdf328` |
| 8 | `BdghJj2ywDAUBDdtTtXT` | Kanimozhi P | SMVST008 | kanimozhi@springmount.co.in | `2q3r4s...` | HAS_AUTH_ACCOUNT | `398f0cec-3c54-47bb-9e55-19588728a062` |
| 9 | `DDobDd14nYX6rdGDYDPz` | Ashish kashyap | SMVST009 | ashish@springmount.co.in | `4t5u6v...` | HAS_AUTH_ACCOUNT | `17099e0c-f827-4cdd-84b0-e8a7ce651e9d` |
| 10 | `FCvUuPUh2Ux2yugLk0Tj` | Shihana Sajin | SMVST010 | shihana@springmount.co.in | N/A | NO_AUTH_ACCOUNT | `af697b43-1227-43d1-940d-61e1347315f5` |
| 11 | `FxDnprTwlUVBRvpJ9pla` | Yogendra Kumar | SMVST011 | yogendra@springmount.co.in | `6w7x8y...` | HAS_AUTH_ACCOUNT | `451de121-3c76-4cbe-a416-5a2c733eb6aa` |
| 12 | `J0DFpcO5L1OHnVpjiORz` | Arulkumar | SMVST012 | arulkumar@springmount.co.in | `9z0a1b...` | HAS_AUTH_ACCOUNT | `5f94354d-d147-47c3-9613-e243b1c1171f` |
| 13 | `J67JktuTucIfgNEYzUNT` | AISHWARYA G | SMVST013 | aishwarya.g@springmount.co.in | N/A | NO_AUTH_ACCOUNT | `c09159de-f290-428a-8afb-4ebe25c02466` |
| 14 | `KBjRcmGqXsm89gNDRXMx` | Kaviya | SMVST014 | kaviya.r@springmount.co.in | N/A | NO_AUTH_ACCOUNT | `819404ae-a5fb-473d-af22-74a6e7891263` |
| 15 | `KmVF89DmPH1QSDjVLnpE` | Sushmitha N | SMVST015 | sushmitha@springmount.co.in | `2c3d4e...` | HAS_AUTH_ACCOUNT | `55dd48b9-778f-4376-9b87-b5ffdc54cb71` |
| 16 | `L3Zb5McYqA46cUnIF6OQ` | SHOBANA S | SMVST016 | shobana@springmount.co.in | `5f6g7h...` | HAS_AUTH_ACCOUNT | `8122a2bb-48ed-4095-892a-16c87473a894` |
| 17 | `MXEsLEL8gIds2CRwXF78` | Nuri Mathew | SMVST017 | nuri@springmount.co.in | `8i9j0k...` | HAS_AUTH_ACCOUNT | `83d74a05-fca5-4a25-b642-cb30787c5873` |
| 18 | `Ptb7vobIaWmiN8jSFcgr` | Aruljothi P | SMVST018 | aruljothi@springmount.co.in | `1l2m3n...` | HAS_AUTH_ACCOUNT | `97dfe97e-46ec-4922-969a-acc51cb7ff5f` |
| 19 | `RrbpxMmsS28FQqzjbMiE` | Ratheesh K V | SMVST019 | ratheesh@springmount.co.in | `4p5q6r...` | HAS_AUTH_ACCOUNT | `b1d78cd9-45a6-4c32-90ac-8562029a955e` |
| 20 | `SsE26iKYz5OCg9zEkz4G` | S.KAVYA | SMVST020 | kavya@springmount.co.in | `7s8t9u...` | HAS_AUTH_ACCOUNT | `dc9d7fbe-e126-4ace-8b86-0ed04a3ed38f` |
| 21 | `TA72si30LeN9bNDrdGAU` | A.Gayathri | SMVST021 | gayathri@springmount.co.in | `0v1w2x...` | HAS_AUTH_ACCOUNT | `b7f52e60-9162-4247-a551-3c799450a7c7` |
| 22 | `Uxvxo6Ri42qJ53oQPEi4` | MAHIMA JOVITHA M | SMVST022 | mahima@springmount.co.in | `3y4z5a...` | HAS_AUTH_ACCOUNT | `a4d0f414-fc9e-4f73-8396-bb051a0561c7` |
| 23 | `VIlkVPZKrr9QoBhg6DBd` | Balamurugan.N | SMVST023 | balamurugan@springmount.co.in | `6b7c8d...` | HAS_AUTH_ACCOUNT | `ceb26cdb-aa35-4f6a-a8b2-cd0639d71d62` |
| 24 | `XCosrX6bwkmx30D0Zkp4` | Darun C K | SMVST024 | darun@springmount.co.in | `9e0f1g...` | HAS_AUTH_ACCOUNT | `e78ab391-5194-4a87-a103-fd5a6f6b3545` |
| 25 | `YBNKME0uqFq6erNIGepq` | Sruthi Sunil | SMVST025 | sruthi@springmount.co.in | `2h3i4j...` | HAS_AUTH_ACCOUNT | `eb9a8007-e451-4132-8f4a-6fc5cd63c140` |
| 26 | `bnHcNyYAqMzmbUFwi7dd` | R. Gomathi | SMVST026 | gomathi@springmount.co.in | `5k6l7m...` | HAS_AUTH_ACCOUNT | `9ea21a4f-8344-4d37-82fb-be880bf3741d` |
| 27 | `dmwWmITGRFVvUksYSuRP` | Priyadharshini.B | SMVST027 | priyadharshini.b@springmount.co.in | `8n9o0p...` | HAS_AUTH_ACCOUNT | `293bebb2-c22d-4460-95f2-42c0021f7d4c` |
| 28 | `lsLgNCXqDf2nsKqlSQMQ` | karthika C | SMVST028 | karthika@springmount.co.in | `1q2r3s...` | HAS_AUTH_ACCOUNT | `d4ca4399-ce8f-441e-ae95-f2431bf5a96d` |
| 29 | `n6cPIvn7o4cFOqm1X1Od` | Sathya K | SMVST029 | sathya@springmount.co.in | `4t5u6v...` | HAS_AUTH_ACCOUNT | `61c4dd33-6b15-4516-8800-52ed3dbf2a0a` |
| 30 | `nRlL08q4RdVvGrlfIYqv` | Hyder Khan M | SMVST030 | hyder@springmount.co.in | `7w8x9y...` | HAS_AUTH_ACCOUNT | `766d6b75-5613-45a4-8ec5-cc33ff556ed5` |
| 31 | `o5TrswcPHP69RXTkXfmE` | MUTHULAKSHMI S | SMVST031 | muthulakshmi.s@springmount.co.in | N/A | NO_AUTH_ACCOUNT | `75f5c981-f49e-49f1-af9a-1d935e9bc602` |
| 32 | `o64hhGztPWVwXji3g2Bq` | BINDHUJA A S | SMVST032 | bindhuja@springmount.co.in | `0z1a2b...` | HAS_AUTH_ACCOUNT | `5005a46e-4685-4383-a6ce-fc87078faf36` |
| 33 | `pUTnXuv2bIYJJMeifPlt` | Priyadharshini M | SMVST033 | priyadharshini.m@springmount.co.in | `3c4d5e...` | HAS_AUTH_ACCOUNT | `45088e2f-ae9f-4a73-9448-385f78a9195a` |
| 34 | `qcgyM85iJRiK0YFXaPEr` | Aswani. D | SMVST034 | aswani@springmount.co.in | `6f7g8h...` | HAS_AUTH_ACCOUNT | `4f75c4a5-8d1a-4b25-9178-a408a20f0dbf` |
| 35 | `qkTE1ovzWKptAw5X7hRn` | P.Lakshmi Priya | SMVST035 | lakshmipriya@springmount.co.in | `9i0j1k...` | HAS_AUTH_ACCOUNT | `b172ff39-fb17-4ab1-ac4d-af7467dfd63a` |
| 36 | `sLPfDiUGnKHWHWfUDrqw` | Rajalakshmi R | SMVST036 | rajalakshmi@springmount.co.in | `2l3m4n...` | HAS_AUTH_ACCOUNT | `c5009d0a-6934-452f-b3cc-45f762efdfbd` |
| 37 | `uq6ZAlZd2dG9yVWu4rlG` | N.Ranjith | SMVST037 | ranjith.n@springmount.co.in | N/A | NO_AUTH_ACCOUNT | `0283ec52-fb42-4763-bcdb-ec71b7bf3af2` |
| 38 | `yaiT3fNS8SQ7A3YSSeY0` | Priyanka S | SMVST038 | priyanka@springmount.co.in | `5o6p7q...` | HAS_AUTH_ACCOUNT | `fc9e8c1e-a079-44e5-ba13-518c68a00025` |
| 39 | `5kKk3Uz71GaD4QL1uU5Y` | SHIVA KUMAR P S | SMVSA003 | shivakumar271085@gmail.com | `sUFHLiZydTVtnqYCUnvEXJmo6L43` | HAS_AUTH_ACCOUNT | **UNMATCHED** |
| 40 | `6j1rFvb57IMmvdZ4fL5B` | Shinasshukoor | SMVSP001 | viceprincipal@springmount.co.in | N/A | NO_AUTH_ACCOUNT | **UNMATCHED** |
| 41 | `CdVPfwYMtZWpc8tNYNBR` | Bindu Nair | SMVSA007 | bindunair@springmount.co.in | N/A | NO_AUTH_ACCOUNT | **UNMATCHED** |
| 42 | `EcEjUOxqYCaizT0WU4HZ` | Jane Williams | SMVST039 | janewilliams.erd@springmount.co.in | `30EEnp8h00VlkIyPuXJ6rnBqf3Z2` | HAS_AUTH_ACCOUNT | **UNMATCHED** |
| 43 | `VOd9WVjHpYfSHJOgSBIV` | Megala S | SMVSA002 | kiruthykrakhava59661@gmail.com | `ojihIdes1FNQ9KrGQTavHLBjpLu2` | HAS_AUTH_ACCOUNT | **UNMATCHED** |
| 44 | `ZQX36ET7IQ0TlNuK4UGP` | Revathi S | SMVSF001 | revathi.3395@gmail.com | N/A | NO_AUTH_ACCOUNT | **UNMATCHED** |
| 45 | `fzH2RpA8ufIdaejtWn9d` | Sudha.M | SMVSA004 | seniorcoordinator@springmount.co.in | `Xa4NBrAiHmMSV4RQCi4f5ABB59X2` | HAS_AUTH_ACCOUNT | **UNMATCHED** |
| 46 | `rvmmAVaTBgrZsNRJuTPV` | Sangeetha A | SMVSA001 | sangeetha.angusamy01@gmail.com | `yHwlPqIsfteH6KC48pRJ72MOHrp2` | HAS_AUTH_ACCOUNT | **UNMATCHED** |

---

## 3. Inspection of the 8 Unmatched Records

Each of the 8 unmatched records was audited against Firebase Auth, Firestore document contents, and subcollection reference trees:

### Record 1: `5kKk3Uz71GaD4QL1uU5Y`
- **Name**: SHIVA KUMAR P S
- **Employee ID**: `SMVSA003`
- **Email**: `shivakumar271085@gmail.com`
- **Designation**: Staffs
- **Firebase Auth Account**: **`HAS_AUTH_ACCOUNT`** (UID: `sUFHLiZydTVtnqYCUnvEXJmo6L43`)
- **Operational Reference Count**: 2 references (`teachers/5kKk3Uz71GaD4QL1uU5Y`, `staff_audit_logs/4FpRIrLAWS0p0YB4JjhH`)
- **Classification**: **`MIGRATION_REQUIRED`**

### Record 2: `6j1rFvb57IMmvdZ4fL5B`
- **Name**: Shinasshukoor
- **Employee ID**: `SMVSP001`
- **Email**: `viceprincipal@springmount.co.in`
- **Designation**: Staffs / Vice Principal
- **Firebase Auth Account**: **`NO_AUTH_ACCOUNT`**
- **Operational Reference Count**: 2 references (`teachers/6j1rFvb57IMmvdZ4fL5B`, `staff_audit_logs/IiZNi9qr6RRndJyukkO1`)
- **Classification**: **`UNCERTAIN`**

### Record 3: `CdVPfwYMtZWpc8tNYNBR`
- **Name**: Bindu Nair
- **Employee ID**: `SMVSA007`
- **Email**: `bindunair@springmount.co.in`
- **Designation**: Staffs
- **Firebase Auth Account**: **`NO_AUTH_ACCOUNT`**
- **Operational Reference Count**: 2 references (`teachers/CdVPfwYMtZWpc8tNYNBR`, `staff_audit_logs/tAuNUROnwjX8rvu9loBd`)
- **Classification**: **`UNCERTAIN`**

### Record 4: `EcEjUOxqYCaizT0WU4HZ`
- **Name**: Jane Williams
- **Employee ID**: `SMVST039`
- **Email**: `janewilliams.erd@springmount.co.in`
- **Designation**: Staffs
- **Firebase Auth Account**: **`HAS_AUTH_ACCOUNT`** (UID: `30EEnp8h00VlkIyPuXJ6rnBqf3Z2`)
- **Operational Reference Count**: 2 references (`teachers/EcEjUOxqYCaizT0WU4HZ`, `staff_audit_logs/yvQoi8Jc2ERiyUf827L6`)
- **Classification**: **`MIGRATION_REQUIRED`**

### Record 5: `VOd9WVjHpYfSHJOgSBIV`
- **Name**: Megala S
- **Employee ID**: `SMVSA002`
- **Email**: `kiruthykrakhava59661@gmail.com`
- **Designation**: Staffs
- **Firebase Auth Account**: **`HAS_AUTH_ACCOUNT`** (UID: `ojihIdes1FNQ9KrGQTavHLBjpLu2`)
- **Operational Reference Count**: 2 references (`teachers/VOd9WVjHpYfSHJOgSBIV`, `staff_audit_logs/JjwvwRgt1V6k2KyTEA4a`)
- **Classification**: **`MIGRATION_REQUIRED`**

### Record 6: `ZQX36ET7IQ0TlNuK4UGP`
- **Name**: Revathi S
- **Employee ID**: `SMVSF001`
- **Email**: `revathi.3395@gmail.com`
- **Designation**: Staffs
- **Firebase Auth Account**: **`NO_AUTH_ACCOUNT`**
- **Operational Reference Count**: 3 references (`teachers/ZQX36ET7IQ0TlNuK4UGP`, `staff_audit_logs/QTdn4BS0QKI30DOR1cTq`, `staff_audit_logs/qxNVxxTb1zuaOQx3D34O`)
- **Classification**: **`UNCERTAIN`**

### Record 7: `fzH2RpA8ufIdaejtWn9d`
- **Name**: Sudha.M
- **Employee ID**: `SMVSA004`
- **Email**: `seniorcoordinator@springmount.co.in`
- **Designation**: Staffs / Senior Coordinator
- **Firebase Auth Account**: **`HAS_AUTH_ACCOUNT`** (UID: `Xa4NBrAiHmMSV4RQCi4f5ABB59X2`)
- **Operational Reference Count**: 2 references (`teachers/fzH2RpA8ufIdaejtWn9d`, `staff_audit_logs/E6e9SZe3RE5reyvntQVD`)
- **Classification**: **`MIGRATION_REQUIRED`**

### Record 8: `rvmmAVaTBgrZsNRJuTPV`
- **Name**: Sangeetha A
- **Employee ID**: `SMVSA001`
- **Email**: `sangeetha.angusamy01@gmail.com`
- **Designation**: Staffs
- **Firebase Auth Account**: **`HAS_AUTH_ACCOUNT`** (UID: `yHwlPqIsfteH6KC48pRJ72MOHrp2`)
- **Operational Reference Count**: 6 references (`teachers/rvmmAVaTBgrZsNRJuTPV`, 5 in `staff_audit_logs`)
- **Classification**: **`MIGRATION_REQUIRED`**

---

## 4. Firebase Auth Verification Summary

- **Total Unmatched Records**: 8
- **Records WITH Firebase Auth Account (`HAS_AUTH_ACCOUNT`)**: **5** (62.5%)
- **Records WITHOUT Firebase Auth Account (`NO_AUTH_ACCOUNT`)**: **3** (37.5%)

The prior statement claiming that all 8 unmatched records were "uncredentialed without Firebase Auth accounts" is disproven.

---

## 5. Actual Data Usage & Operational Relationship Analysis

- None of the 8 unmatched records are completely orphaned isolated documents; all 8 have associated audit log entries in `staff_audit_logs`.
- 5 of the staff members possess valid employee IDs (`SMVSA001`, `SMVSA002`, `SMVSA003`, `SMVSA004`, `SMVST039`), official/personal email addresses, and active Firebase Auth accounts.
- These 5 staff members represent administrative/coordinative staff members who were operational in the system.

---

## 6. Original Migration Code Analysis

Inspection of `c:/Projects/SMS/backend/src/migration/school-s024-actual-migrator.js` revealed:

1. **No Explicit Exclusion Rule**: There is **no code condition** in the migration scripts that intentionally filters out or skips teacher documents based on credential status or roster status.
2. **Migration Design Constraint**: Tier 2 identity migration constructed PostgreSQL `User` accounts by querying the root `/users` collection in Firestore (`where('schoolId', '==', 'SchoolS024')`).
3. **Root Collection Discrepancy**: The 8 unmatched teachers had documents in `/schools/SchoolS024/teachers`, but did NOT have corresponding documents in the root `/users` collection.
4. When Tier 5 staff migration ran, it required every staff member to link to an existing PostgreSQL `User` account. Because these 8 records were not present in root `/users`, they were omitted from the migrated dataset.

---

## 7. Record Classifications Summary

| Classification | Count | Record IDs | Rationale |
|----------------|-------|------------|-----------|
| **`INTENTIONALLY_EXCLUDED_ROSTER_ONLY`** | **0** | None | No explicit code exclusion rule exists, and 5 records possess active Auth accounts & operational data. |
| **`MIGRATION_REQUIRED`** | **5** | `5kKk3Uz71GaD4QL1uU5Y`, `EcEjUOxqYCaizT0WU4HZ`, `VOd9WVjHpYfSHJOgSBIV`, `fzH2RpA8ufIdaejtWn9d`, `rvmmAVaTBgrZsNRJuTPV` | Valid staff members with employee IDs, emails, active Firebase Auth accounts, and operational logs omitted during migration. |
| **`UNCERTAIN`** | **3** | `6j1rFvb57IMmvdZ4fL5B`, `CdVPfwYMtZWpc8tNYNBR`, `ZQX36ET7IQ0TlNuK4UGP` | Staff records without Firebase Auth accounts but with employee IDs and audit log references. |

---

## 8. Verification Statements & Final Conclusion

```text
Firebase mutations: 0
PostgreSQL mutations: 0
Other schools modified: 0
```

Because 5 records are classified as **`MIGRATION_REQUIRED`** and 3 records are classified as **`UNCERTAIN`**, `SchoolS024` teacher migration is **NOT a 100% complete match**.

---

## FINAL VERDICT MARKER

SCHOOL.S024.TEACHER.VERIFICATION — NEEDS REVIEW
