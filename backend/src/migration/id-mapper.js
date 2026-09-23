import crypto from 'crypto';

/**
 * Deterministic In-Memory Migration ID Mapper
 * 
 * Maps Firestore document identifiers to deterministic PostgreSQL UUIDs.
 * Ensures that executing multiple dry runs against identical data produces
 * identical UUIDs and tracks mapping status, tenant ownership, and duplicate checks.
 */
export class MigrationIdMapper {
  constructor() {
    this.mappings = new Map(); // key: `${schoolId || 'global'}:${collectionName}:${firestoreId}`
    this.targetIdToSource = new Map(); // targetId -> key
    this.duplicates = [];
  }

  /**
   * Generates a deterministic UUIDv4 based on input seed string.
   */
  static generateDeterministicUuid(seed) {
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    // Format hash into UUID 8-4-4-4-12
    const p1 = hash.substring(0, 8);
    const p2 = hash.substring(8, 12);
    // UUID v4 format: set version bits (4) and variant bits (8, 9, a, or b)
    const p3 = '4' + hash.substring(13, 16);
    const p4 = ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hash.substring(18, 20);
    const p5 = hash.substring(20, 32);
    return `${p1}-${p2}-${p3}-${p4}-${p5}`;
  }

  /**
   * Generates or retrieves an existing mapping for a Firestore document.
   */
  mapId(schoolId, collectionName, firestoreId, targetModel, metadata = {}) {
    if (!collectionName || !firestoreId || !targetModel) {
      throw new Error(`Invalid mapping arguments: collection=${collectionName}, firestoreId=${firestoreId}, targetModel=${targetModel}`);
    }

    const tenantKey = schoolId || 'global';
    const lookupKey = `${tenantKey}:${collectionName}:${firestoreId}`;

    if (this.mappings.has(lookupKey)) {
      const existing = this.mappings.get(lookupKey);
      this.duplicates.push({
        lookupKey,
        targetModel,
        existingTargetId: existing.targetId,
        metadata
      });
      return existing.targetId;
    }

    // Deterministic UUID seed
    const seed = `sms-migration:${tenantKey}:${collectionName}:${firestoreId}:${targetModel}`;
    const targetId = MigrationIdMapper.generateDeterministicUuid(seed);

    const mappingEntry = {
      source: 'firestore',
      schoolId: schoolId || null,
      collection: collectionName,
      sourceId: firestoreId,
      targetModel,
      targetId,
      status: 'READY',
      metadata
    };

    this.mappings.set(lookupKey, mappingEntry);
    this.targetIdToSource.set(targetId, lookupKey);

    return targetId;
  }

  /**
   * Explicitly adds or registers an existing targetId mapping.
   */
  addMapping(schoolId, collectionName, firestoreId, targetModel, targetId, metadata = {}) {
    const tenantKey = schoolId || 'global';
    const lookupKey = `${tenantKey}:${collectionName}:${firestoreId}`;
    const mappingEntry = {
      source: 'firestore',
      schoolId: schoolId || null,
      collection: collectionName,
      sourceId: firestoreId,
      targetModel,
      targetId,
      status: 'READY',
      metadata
    };
    this.mappings.set(lookupKey, mappingEntry);
    this.targetIdToSource.set(targetId, lookupKey);
    return targetId;
  }

  /**
   * Retrieves an existing PostgreSQL target UUID for a Firestore document.
   */
  getPostgresId(schoolId, collectionName, firestoreId) {
    const tenantKey = schoolId || 'global';
    const lookupKey = `${tenantKey}:${collectionName}:${firestoreId}`;
    const entry = this.mappings.get(lookupKey);
    return entry ? entry.targetId : null;
  }

  /**
   * Checks if a mapping exists.
   */
  hasMapping(schoolId, collectionName, firestoreId) {
    const tenantKey = schoolId || 'global';
    const lookupKey = `${tenantKey}:${collectionName}:${firestoreId}`;
    return this.mappings.has(lookupKey);
  }

  getAllMappings() {
    return Array.from(this.mappings.values());
  }

  getDuplicates() {
    return this.duplicates;
  }

  getStats() {
    const byModel = {};
    for (const entry of this.mappings.values()) {
      byModel[entry.targetModel] = (byModel[entry.targetModel] || 0) + 1;
    }
    return {
      totalMappings: this.mappings.size,
      duplicateOccurrences: this.duplicates.length,
      byModel
    };
  }

  reset() {
    this.mappings.clear();
    this.targetIdToSource.clear();
    this.duplicates = [];
  }
}
