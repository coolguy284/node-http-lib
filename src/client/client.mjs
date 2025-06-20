import { request as httpRequest } from 'node:http';
import { connect } from 'node:http2';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

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

// export class RequestSession {
//   #sessions = new Map();
  
//   [Symbol.dispose]() {
//     // TODO
//   }
// }

export async function request({
  mode,
  //session = null,
  host,
  port,
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
      }
      
      // TODO
      break;
    }
    
    case 'http2': {
      const connection = connect(`https://${host.includes(':') ? `[${host}]` : host}:${port ?? 443}`, options);
      
      await awaitEventOrError(connection, 'connect');
      
      try {
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
        }
        
        const [ responseHeaders, _ ] = await awaitEventOrError(stream, 'respose');
        
        clientResponse = new ClientResponse({
          headers: responseHeaders,
          bodyStream: stream,
        });
      } finally {
        connection.close();
      }
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
