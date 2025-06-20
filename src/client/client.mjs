import { request as httpRequest } from 'node:http';
import { connect } from 'node:http2';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

import { createDisposableIfNull } from '../lib/create_disposable.mjs';
import { awaitEventOrError } from '../lib/eventemitter_promise.mjs';
import { streamToBuffer } from '../lib/stream_to_buffer.mjs';

class ClientResponse {
  headers;
  #bodyStream;
  
  constructor({
    headers,
    bodyStream,
  }) {
    this.headers = headers;
    this.#bodyStream = bodyStream;
  }
  
  getBodyAsStream() {
    return this.#bodyStream;
  }
  
  async getBodyAsBuffer() {
    return await streamToBuffer(this.getBodyAsStream());
  }
}

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
      
      await awaitEventOrError(session, 'connect');
      
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

export async function request({
  mode,
  session = null,
  host,
  port = null,
  path,
  headers = {},
  body = null,
  options = {},
  errorIfErrorStatusCode = true,
}) {
  let clientResponse;
  
  switch (mode) {
    case 'http':
    case 'https': {
      let processedHeaders = Object.fromEntries(Object.entries(headers));
      delete processedHeaders[':scheme'];
      delete processedHeaders[':method'];
      
      if (':authority' in headers) {
        processedHeaders.host = headers[':authority'];
        delete processedHeaders[':authority'];
      }
      
      const requestFunc = mode == 'http' ? httpRequest : httpsRequest;
      
      const clientRequest = requestFunc({
        host,
        port,
        path: `/${path}`,
        method: headers[':method'],
        headers: processedHeaders,
        ...options,
      });
      
      if (body != null) {
        if (body instanceof Readable) {
          body.pipe(clientRequest);
        } else {
          clientRequest.end(body);
        }
      } else {
        clientRequest.end();
      }
      
      const [ response ] = await awaitEventOrError(clientRequest, 'response');
      
      clientResponse = new ClientResponse({
        headers: {
          ':status': response.statusCode,
          ...response.headers,
        },
        bodyStream: response,
      });
      break;
    }
    
    case 'http2': {
      using workingSession = createDisposableIfNull(session, () => new RequestSession());
      
      const connection = await workingSession.get().createOrGetHttp2Session({
        host,
        port: port ?? 443,
        options,
      });
      
      let processedHeaders = {
        ':path': `/${path}`,
        ...headers,
      };
      
      const stream = connection.request(processedHeaders, options);
      
      if (body != null) {
        if (body instanceof Readable) {
          body.pipe(stream);
        } else {
          stream.end(body);
        }
      } else {
        stream.end();
      }
      
      const [ responseHeaders, _ ] = await awaitEventOrError(stream, 'response');
      
      clientResponse = new ClientResponse({
        headers: responseHeaders,
        bodyStream: stream,
      });
      break;
    }
    
    default:
      throw new Error(`mode unrecognized: ${JSON.stringify(mode)}`);
  }
  
  if (errorIfErrorStatusCode && clientResponse.headers[':status'] >= 400 && clientResponse.headers[':status'] <= 599) {
    let err = new Error(`Error code ${clientResponse.headers[':status']} in response`);
    err.clientResponse = clientResponse;
    throw err;
  }
  
  return clientResponse;
}
