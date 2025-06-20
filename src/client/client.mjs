import { request as httpRequest } from 'node:http';
import { connect } from 'node:http2';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

import { streamToBuffer } from '../lib/stream_to_buffer.mjs';

class ClientResponse {
  #statusCode;
  
  getBodyAsStream() {
    // TODO
  }
  
  async getBodyAsBuffer() {
    return await streamToBuffer(this.getBodyAsStream());
  }
}

export class RequestSession {
  #sessions = new Map();
  
  [Symbol.dispose]() {
    // TODO
  }
}

export async function request({
  mode,
  session = null,
  host,
  port,
  path,
  headers = {},
  body = null,
  options = {},
  errorIfErrorStatusCode = true,
}) {
  switch (mode) {
    case 'http': {
      const request = httpRequest({
        host,
        port,
        path: `/${path}`,
        headers,
        ...options,
      });
      
      if (body != null) {
        if (body instanceof Readable) {
          body.pipe(request);
        } else {
          request.end(body);
        }
      }
      break;
    }
    
    case 'https':
      break;
    
    case 'http2': {
      using connection = connect(`https://${host.includes(':') ? `[${host}]` : host}:${port}`, options);
      
      // TODO
      break;
    }
    
    default:
      throw new Error(`mode unrecognized: ${JSON.stringify(mode)}`);
  }
}
