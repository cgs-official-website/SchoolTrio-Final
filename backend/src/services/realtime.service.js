import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';

/**
 * In-Memory Realtime Event Emitter & Future Pub-Sub Abstraction
 *
 * NOTE: Phase 4A establishes the event dispatching interface.
 * WebSocket/SSE transport adapters will be configured feature-by-feature in later phases.
 */
class RealtimeService extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Dispatches an event to subscribers within a specific tenant school.
   *
   * @param {string} schoolId - Tenant school UUID
   * @param {string} event - Event name (e.g. 'attendance:marked', 'notice:published')
   * @param {any} payload - Event data payload
   */
  emitToSchool(schoolId, event, payload) {
    if (!schoolId || !event) return;
    const scopedEvent = `school:${schoolId}:${event}`;
    logger.debug({ msg: '[REALTIME EVENT]', schoolId, event });
    this.emit(scopedEvent, payload);
    this.emit(`school:${schoolId}:*`, { event, payload });
  }

  /**
   * Subscribes to events for a specific tenant school.
   *
   * @param {string} schoolId - Tenant school UUID
   * @param {string} event - Event name or '*'
   * @param {Function} listener - Event handler
   */
  subscribeSchool(schoolId, event, listener) {
    const scopedEvent = `school:${schoolId}:${event}`;
    this.on(scopedEvent, listener);
  }

  /**
   * Unsubscribes from events for a specific tenant school.
   *
   * @param {string} schoolId - Tenant school UUID
   * @param {string} event - Event name
   * @param {Function} listener - Event handler
   */
  unsubscribeSchool(schoolId, event, listener) {
    const scopedEvent = `school:${schoolId}:${event}`;
    this.off(scopedEvent, listener);
  }
}

export const realtimeService = new RealtimeService();
