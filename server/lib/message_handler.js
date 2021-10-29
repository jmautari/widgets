'use strict';

class MessageHandler {
  constructor() {
    this._handlers = {};
  }

  on(cmd, handler) {
    this._handlers[cmd] = handler;
  }

  process(client, server, payload) {
    const cmd = payload.cmd;
    const params = payload.data;
    if (!cmd) {
      console.log('Invalid %s command', cmd);
      return;
    }

    const handler = this._handlers[cmd];
    if (typeof handler !== 'function') {
      console.log('Unhandled command %s', cmd);
      return;
    }

    handler(client, server, params);
  }
};

module.exports = new MessageHandler;
