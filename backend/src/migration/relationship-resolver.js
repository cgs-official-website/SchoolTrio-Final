/**
 * Migration Relationship Resolver & Quarantine Manager
 * 
 * Verifies relational integrity across transformed entities,
 * validates tenant isolation, checks foreign keys against mapped UUIDs,
 * and routes defective or unresolvable records into the Quarantine Queue.
 */

export class RelationshipResolver {
  constructor(idMapper) {
    this.idMapper = idMapper;
    this.metrics = {
      checked: 0,
      resolved: 0,
      missing: 0,
      crossTenant: 0,
      invalid: 0
    };
    this.quarantineQueue = [];
    this.warnings = [];
  }

  /**
   * Resolves foreign key and validates tenant consistency.
   */
  resolveForeignKey({
    sourceModel,
    sourceId,
    sourceSchoolUuid,
    field,
    targetModel,
    targetCollection,
    targetSourceId,
    isNullable = false,
    rawSchoolId
  }) {
    this.metrics.checked++;

    if (!targetSourceId) {
      if (isNullable) {
        return { targetId: null, status: 'RESOLVED_NULL' };
      }
      this.metrics.missing++;
      this.quarantineQueue.push({
        model: sourceModel,
        sourceId,
        school: rawSchoolId || 'unknown',
        reason: `MISSING_REQUIRED_REFERENCE: Field '${field}' is empty`,
        affectedRelationship: `${sourceModel}.${field} -> ${targetModel}`,
        recommendedAction: 'Provide valid target reference or allow nullable'
      });
      return { targetId: null, status: 'MISSING_REFERENCE' };
    }

    // Lookup in ID Mapper
    let targetId = this.idMapper.getPostgresId(sourceSchoolUuid, targetCollection, targetSourceId)
      || this.idMapper.getPostgresId(null, targetCollection, targetSourceId);

    // If not found in current tenant or global, check if it exists in another tenant
    if (!targetId && sourceSchoolUuid) {
      for (const entry of this.idMapper.mappings.values()) {
        if (entry.collection === targetCollection && entry.sourceId === targetSourceId) {
          if (entry.schoolId && entry.schoolId !== sourceSchoolUuid) {
            this.metrics.crossTenant++;
            this.quarantineQueue.push({
              model: sourceModel,
              sourceId,
              school: rawSchoolId || 'unknown',
              reason: `CROSS_TENANT_VIOLATION: Referenced ${targetModel} belongs to another school (${entry.schoolId})`,
              affectedRelationship: `${sourceModel}.${field} -> ${targetModel}`,
              recommendedAction: 'Reject cross-tenant reference'
            });
            return { targetId: null, status: 'CROSS_TENANT_REFERENCE' };
          }
        }
      }
    }

    if (!targetId) {
      this.metrics.missing++;
      
      // Special classification for known orphan invoices
      const isInvoiceStudent = sourceModel === 'Invoice' && field === 'studentId';
      const reason = isInvoiceStudent
        ? 'ORPHAN_INVOICE: Target student record was deleted in Firestore'
        : `UNRESOLVED_REFERENCE: Target ${targetModel} '${targetSourceId}' does not exist`;

      this.quarantineQueue.push({
        model: sourceModel,
        sourceId,
        school: rawSchoolId || 'unknown',
        reason,
        affectedRelationship: `${sourceModel}.${field} -> ${targetModel} (${targetSourceId})`,
        recommendedAction: isInvoiceStudent
          ? 'Link to archived dummy student or flag for billing administrator'
          : `Ensure parent document in '${targetCollection}' is migrated first`
      });

      return { targetId: null, status: isInvoiceStudent ? 'ORPHAN_INVOICE' : 'MISSING_REFERENCE' };
    }

    this.metrics.resolved++;
    return { targetId, status: 'READY' };
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getQuarantineQueue() {
    return [...this.quarantineQueue];
  }

  getWarnings() {
    return [...this.warnings];
  }

  reset() {
    this.metrics = {
      checked: 0,
      resolved: 0,
      missing: 0,
      crossTenant: 0,
      invalid: 0
    };
    this.quarantineQueue = [];
    this.warnings = [];
  }
}
