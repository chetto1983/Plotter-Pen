/**
 * OPC UA WebSocket Service
 * Real-time communication with PLC via WebSocket
 */

import { log, warn, error } from '../lib/logger.js';

export class OPCUAWebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.reconnectTimer = null;
    this.isConnecting = false;
    this.wasConnected = false;
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/api/opcua/ws`;

    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (e) => this.handleMessage(e);
      this.ws.onclose = (e) => this.handleClose(e);
      this.ws.onerror = (e) => this.handleError(e);
    } catch (err) {
      error('[WS] Connection failed:', err);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.wasConnected = false;
  }

  /**
   * Handle WebSocket open event
   */
  handleOpen() {
    log('[WS] Connected to OPC UA WebSocket');
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.wasConnected = true;
    this.emit('connected', { connected: true });
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(event) {
    try {
      const msg = JSON.parse(event.data);
      this.emit(msg.type, msg.data);
    } catch (err) {
      error('[WS] Failed to parse message:', err);
    }
  }

  /**
   * Handle WebSocket close event
   */
  handleClose(event) {
    log('[WS] Connection closed:', event.code, event.reason);
    this.isConnecting = false;
    this.ws = null;
    this.emit('disconnected', { code: event.code, reason: event.reason });

    // Auto-reconnect if was previously connected
    if (this.wasConnected && event.code !== 1000) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket error
   */
  handleError(error) {
    error('[WS] WebSocket error:', error);
    this.isConnecting = false;
    this.emit('error', { message: 'WebSocket error' });
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      warn('[WS] Max reconnect attempts reached');
      this.emit('reconnect_failed', { attempts: this.reconnectAttempts });
      return;
    }

    this.clearReconnectTimer();
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
    this.reconnectAttempts++;

    log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Clear reconnection timer
   */
  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Send message to WebSocket server
   */
  send(type, data = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      warn('[WS] Cannot send - not connected');
      return false;
    }

    try {
      const msg = { type };
      if (data !== null) {
        msg.data = data;
      }
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch (err) {
      error('[WS] Send failed:', err);
      return false;
    }
  }

  // ============ High-level API methods ============

  /**
   * Subscribe to position updates
   * @param {number} interval - Update interval in ms (default 100)
   */
  subscribe(interval = 100) {
    return this.send('subscribe', { interval });
  }

  /**
   * Unsubscribe from position updates
   */
  unsubscribe() {
    return this.send('unsubscribe');
  }

  /**
   * Send command to PLC
   * @param {string} action - Action: 'connect', 'disconnect', 'send'
   * @param {string[]} commands - Commands to send (for 'send' action)
   */
  command(action, commands = []) {
    return this.send('command', { action, commands });
  }

  /**
   * Start chunked transfer to PLC
   * @param {string[]} commands - PLC commands to transfer
   */
  transfer(commands) {
    if (!commands || commands.length === 0) {
      warn('[WS] No commands to transfer');
      return false;
    }
    return this.send('transfer', { commands });
  }

  /**
   * Cancel ongoing transfer
   */
  cancelTransfer() {
    return this.send('cancel_transfer');
  }

  /**
   * Send ping to keep connection alive
   */
  ping() {
    return this.send('ping');
  }

  // ============ Event listener methods ============

  /**
   * Register event listener
   * @param {string} type - Event type
   * @param {Function} callback - Callback function
   */
  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
  }

  /**
   * Remove event listener
   * @param {string} type - Event type
   * @param {Function} callback - Callback function (optional, removes all if omitted)
   */
  off(type, callback = null) {
    if (!this.listeners.has(type)) return;

    if (callback) {
      this.listeners.get(type).delete(callback);
    } else {
      this.listeners.delete(type);
    }
  }

  /**
   * Emit event to listeners
   * @param {string} type - Event type
   * @param {*} data - Event data
   */
  emit(type, data) {
    if (!this.listeners.has(type)) return;

    for (const callback of this.listeners.get(type)) {
      try {
        callback(data);
      } catch (err) {
        console.error(`[WS] Error in ${type} listener:`, err);
      }
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
