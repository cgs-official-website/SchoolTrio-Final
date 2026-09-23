# Leave Approval Routing Migration Note (Phase 1)

This note describes how to backfill `requiredApproverRoleId` and `needsManualRouting` for existing pending leave requests after Phase 1 is deployed.

---

## 1. Backfill Script Logic

When executing a backfill, the script should:
1. Fetch all documents from `schools/{schoolId}/leaves` where `status == "Pending"`.
2. Fetch the tenant's leave rules from `schools/{schoolId}/config/leaveApprovalRules/rules`.
3. For each leave document:
   - Compute duration in days: `(endDate - startDate + 1)`.
   - Find the rule where `minDays <= duration <= maxDays` (or Infinity if `maxDays` is null).
   - If a rule matches, update the document with `requiredApproverRoleId: rule.roleId`.
   - If no rule matches or the collection is empty, update the document with `requiredApproverRoleId: null` and `needsManualRouting: true`.

---

## 2. Mock Backfill Execution Script (Node.js)

You can run this script using `firebase-admin` to execute the backfill safely:

```javascript
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function backfillLeaves(schoolId) {
  const leavesRef = db.collection(`schools/${schoolId}/leaves`);
  const rulesRef = db.collection(`schools/${schoolId}/config/leaveApprovalRules/rules`);

  const [leavesSnap, rulesSnap] = await Promise.all([
    leavesRef.where('status', '==', 'Pending').get(),
    rulesRef.orderBy('order', 'asc').get()
  ]);

  const rules = [];
  rulesSnap.forEach(doc => rules.push({ id: doc.id, ...doc.data() }));

  console.log(`Found ${leavesSnap.size} pending leaves and ${rules.length} approval rules.`);

  const batch = db.batch();

  leavesSnap.forEach(leaveDoc => {
    const data = leaveDoc.data();
    
    // Skip if already processed
    if (data.requiredApproverRoleId !== undefined || data.needsManualRouting !== undefined) {
      return;
    }

    let duration = 0;
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      const diffTime = Math.abs(end - start);
      duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    const matchingRule = rules.find(r => {
      const min = Number(r.minDays);
      const max = r.maxDays === null || r.maxDays === undefined ? Infinity : Number(r.maxDays);
      return duration >= min && duration <= max;
    });

    const updatePayload = {};
    if (matchingRule) {
      updatePayload.requiredApproverRoleId = matchingRule.roleId;
    } else {
      updatePayload.requiredApproverRoleId = null;
      updatePayload.needsManualRouting = true;
    }

    batch.update(leaveDoc.ref, updatePayload);
  });

  await batch.commit();
  console.log("Backfill completed successfully.");
}

// Example usage:
// backfillLeaves('your-school-id-here');
```
