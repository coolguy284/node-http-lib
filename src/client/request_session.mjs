import { connect } from 'node:http2';

import { awaitEventOrError } from '../lib/event_emitter_promise.mjs';

export class RequestSession {
  #disposed = false;
  #sessions = new Map();
  
  async createOrGetHttp2Session({ host, port, options }) {
    if (this.#disposed) {
      throw new Error('cannot create new http2 sessions, session manager is disposed');
    }
    
    const sessionIndex = `http2:[${host}]:${port}`;
    
    if (this.#sessions.has(sessionIndex)) {
      return this.#sessions.get(sessionIndex);
    } else {
      const session = connect(`https://${host.includes(':') ? `[${host}]` : host}:${port ?? 443}`, options);
      
      await awaitEventOrError(session, ['connect']);
      
      this.#sessions.set(sessionIndex, session);
      
      session.on('close', () => {
        this.#sessions.delete(sessionIndex);
      });
      
      return session;
    }
  }
  
  [Symbol.dispose]() {
    if (this.#disposed) {
      return;
    }
    
    for (const session of this.#sessions.values()) {
      session.close();
    }
    
    this.#disposed = true;
  }
}
