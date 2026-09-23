import fs from 'fs';
import { createRequire } from 'module';
import { assertDryRunSafety } from './dry-run.guard.js';

const require = createRequire(import.meta.url);
const admin = require('c:/Projects/SMS/node_modules/firebase-admin');

/**
 * Read-Only Firestore Extractor
 * 
 * Safely extracts documents from root collections, tenant subcollections,
 * and nested subcollections without mutating Firestore or Firebase Auth.
 */
export class FirestoreExtractor {
  constructor(credentialPath) {
    assertDryRunSafety();

    this.credentialPath = credentialPath || 'C:/Projects/SMS/backend/prisma-reports/secrets/school-management-system-6a2c4-firebase-adminsdk-fbsvc-3333012d26.json';
    
    if (!fs.existsSync(this.credentialPath)) {
      throw new Error(`Firebase service account credentials not found at ${this.credentialPath}`);
    }

    const serviceAccount = JSON.parse(fs.readFileSync(this.credentialPath, 'utf8'));

    if (!admin.apps.length) {
      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
    } else {
      this.app = admin.app();
    }

    this.db = admin.firestore();
    this.projectId = serviceAccount.project_id;
  }

  /**
   * Reads all documents from a collection reference.
   */
  async getCollectionDocs(colRef) {
    const snap = await colRef.get();
    return snap.docs.map(doc => ({
      id: doc.id,
      data: doc.data(),
      ref: doc.ref
    }));
  }

  /**
   * Extracts all root collections.
   */
  async extractRootCollections() {
    assertDryRunSafety();
    const result = {};
    const rootCols = await this.db.listCollections();

    for (const col of rootCols) {
      const docs = await this.getCollectionDocs(col);
      result[col.id] = {
        collectionName: col.id,
        count: docs.length,
        docs
      };
    }

    return result;
  }

  /**
   * Extracts all subcollections and nested subcollections for a school.
   */
  async extractSchool(schoolId) {
    assertDryRunSafety();
    const schoolRef = this.db.collection('schools').doc(schoolId);
    const schoolDoc = await schoolRef.get();

    if (!schoolDoc.exists) {
      return null;
    }

    const schoolData = {
      id: schoolDoc.id,
      data: schoolDoc.data(),
      subcollections: {},
      nestedSubcollections: {},
      totalDocs: 0
    };

    const subCols = await schoolRef.listCollections();

    for (const subCol of subCols) {
      const subName = subCol.id;
      const docs = await this.getCollectionDocs(subCol);

      schoolData.subcollections[subName] = {
        count: docs.length,
        docs
      };
      schoolData.totalDocs += docs.length;
    }

    return schoolData;
  }

  /**
   * Extracts all nested subcollections efficiently using collectionGroup queries.
   */
  async extractNestedCollections(schoolsData) {
    assertDryRunSafety();
    const nestedGroups = ['messages', 'submissions', 'report_cards'];
    let totalNestedDocs = 0;

    for (const groupName of nestedGroups) {
      const snap = await this.db.collectionGroup(groupName).get();
      for (const doc of snap.docs) {
        const parts = doc.ref.path.split('/');
        // Format: schools/{schoolId}/{parentCollection}/{parentId}/{nestedCollection}/{id}
        if (parts[0] === 'schools' && parts.length >= 6) {
          const schoolId = parts[1];
          const parentCollection = parts[2];
          const parentId = parts[3];
          const nestedCollection = parts[4];
          const key = `${parentCollection}/${nestedCollection}`;

          if (schoolsData[schoolId]) {
            if (!schoolsData[schoolId].nestedSubcollections[key]) {
              schoolsData[schoolId].nestedSubcollections[key] = {
                parentCollection,
                nestedCollection,
                count: 0,
                docs: []
              };
            }
            schoolsData[schoolId].nestedSubcollections[key].count++;
            schoolsData[schoolId].nestedSubcollections[key].docs.push({
              id: doc.id,
              parentId,
              parentCollection,
              data: doc.data()
            });
            schoolsData[schoolId].totalDocs++;
            totalNestedDocs++;
          }
        }
      }
    }

    return totalNestedDocs;
  }

  /**
   * Full extraction of all data across Firestore.
   */
  async extractAll(onProgress = () => {}) {
    assertDryRunSafety();

    onProgress({ stage: 'root_collections_start' });
    const rootData = await this.extractRootCollections();
    onProgress({ stage: 'root_collections_done', count: Object.keys(rootData).length });

    const schoolsSnap = await this.db.collection('schools').get();
    const schoolsData = {};
    let subcollectionDocCount = 0;

    for (const sDoc of schoolsSnap.docs) {
      onProgress({ stage: 'school_extract_start', schoolId: sDoc.id });
      const extractedSchool = await this.extractSchool(sDoc.id);
      schoolsData[sDoc.id] = extractedSchool;

      for (const sub of Object.values(extractedSchool.subcollections)) {
        subcollectionDocCount += sub.count;
      }

      onProgress({ stage: 'school_extract_done', schoolId: sDoc.id, totalDocs: extractedSchool.totalDocs });
    }

    // Extract nested subcollections via collectionGroup
    onProgress({ stage: 'nested_extract_start' });
    const nestedDocCount = await this.extractNestedCollections(schoolsData);
    onProgress({ stage: 'nested_extract_done', count: nestedDocCount });

    let rootDocCount = 0;
    for (const col of Object.values(rootData)) {
      rootDocCount += col.count;
    }

    return {
      projectId: this.projectId,
      root: rootData,
      schools: schoolsData,
      counts: {
        root: rootDocCount,
        schoolSubcollections: subcollectionDocCount,
        nestedSubcollections: nestedDocCount,
        total: rootDocCount + subcollectionDocCount + nestedDocCount
      }
    };
  }
}
