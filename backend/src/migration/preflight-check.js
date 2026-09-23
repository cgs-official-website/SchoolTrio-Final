import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const admin = require('c:/Projects/SMS/node_modules/firebase-admin');

async function runPreflight() {
  console.log('=== PHASE 3C PRE-MIGRATION SAFETY CHECK ===');

  // 1. Check recovery plan existence and validity
  const planPath = path.resolve('prisma/migrations/dry-run/school-s024-recovery-plan.json');
  if (!fs.existsSync(planPath)) {
    throw new Error(`Recovery plan not found at ${planPath}`);
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  console.log('Recovery plan loaded successfully.');
  console.log('School ID:', plan.schoolId);
  if (plan.schoolId !== 'SchoolS024') {
    throw new Error(`Invalid plan schoolId: expected SchoolS024, got ${plan.schoolId}`);
  }
  console.log('Physical docs in plan:', plan.metrics.physicalFirestoreDocuments);
  if (plan.metrics.physicalFirestoreDocuments !== 541) {
    throw new Error(`Expected 541 physical documents in plan, found ${plan.metrics.physicalFirestoreDocuments}`);
  }

  // 2. Check Firebase Credentials & Live Connection
  const credentialPath = path.resolve('prisma-reports/secrets/school-management-system-6a2c4-firebase-adminsdk-fbsvc-3333012d26.json');
  if (!fs.existsSync(credentialPath)) {
    throw new Error(`Firebase service account credentials not found at ${credentialPath}`);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  }
  const db = admin.firestore();
  console.log('Firestore connected. Project:', serviceAccount.project_id);

  // 3. Verify Live Firestore Source Count for SchoolS024
  const schoolRef = db.collection('schools').doc('SchoolS024');
  const schoolDoc = await schoolRef.get();
  if (!schoolDoc.exists) {
    throw new Error('SchoolS024 does not exist in Firestore!');
  }
  const subCols = await schoolRef.listCollections();
  let liveSubDocCount = 0;
  for (const col of subCols) {
    const snap = await col.get();
    liveSubDocCount += snap.size;
  }
  const livePhysicalTotal = 1 + liveSubDocCount;
  console.log(`Live physical Firestore documents for SchoolS024: ${livePhysicalTotal} (1 school doc + ${liveSubDocCount} subcollection docs)`);
  if (livePhysicalTotal !== 541) {
    throw new Error(`SOURCE_CHANGED_AFTER_RECOVERY: Live Firestore has ${livePhysicalTotal} physical documents, expected 541!`);
  }
  console.log('Live Firestore count matches recovery plan perfectly (541 / 541).');

  // 4. Test PostgreSQL Database Connection via Prisma
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$queryRaw`SELECT current_database(), current_user, version()`;
    console.log('PostgreSQL connected successfully:', result);

    // Check existing SchoolS024 records in PostgreSQL
    const existingSchool = await prisma.school.findFirst({
      where: {
        OR: [
          { code: 'SchoolS024' },
          { legacyFirestoreId: 'SchoolS024' }
        ]
      }
    });
    console.log('Existing SchoolS024 in PostgreSQL:', existingSchool ? existingSchool.id : 'None (clean slate)');

    // Check existing students for SchoolS024
    if (existingSchool) {
      const studentCount = await prisma.student.count({ where: { schoolId: existingSchool.id } });
      console.log('Existing students for SchoolS024:', studentCount);
    }
  } finally {
    await prisma.$disconnect();
  }

  // 5. Inspect Invoice Schema for Orphan Handling
  const schemaContent = fs.readFileSync('prisma/schema.prisma', 'utf8');
  const invoiceModelMatch = schemaContent.match(/model Invoice \{[\s\S]*?\n\}/);
  if (!invoiceModelMatch) {
    throw new Error('Invoice model not found in schema.prisma');
  }
  const invoiceModelText = invoiceModelMatch[0];
  console.log('\n--- INVOICE SCHEMA ANALYSIS ---');
  console.log(invoiceModelText);

  const studentIdFieldMatch = invoiceModelText.match(/studentId\s+([^\s]+)/);
  console.log('studentId field type:', studentIdFieldMatch ? studentIdFieldMatch[1] : 'Unknown');

  const isStudentIdNullable = studentIdFieldMatch && studentIdFieldMatch[1].includes('?');
  console.log('Is studentId nullable?:', isStudentIdNullable);

  if (!isStudentIdNullable) {
    console.log('\n>>> BLOCKER DETECTED <<<');
    console.log('ORPHAN_INVOICE_SCHEMA_BLOCKER: Invoice.studentId is non-nullable (String).');
    console.log('PostgreSQL composite foreign key invoices_school_id_student_id_fkey strictly rejects invoices without a valid Student record.');
  }

  return {
    isStudentIdNullable,
    livePhysicalTotal
  };
}

runPreflight().catch(err => {
  console.error('Preflight check failed:', err);
  process.exit(1);
});
