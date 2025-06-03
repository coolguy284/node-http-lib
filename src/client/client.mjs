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
  // TODO
}

export class RequestSession {
  #sessions = new Map();
  
  [Symbol.dispose]() {
    // TODO
  }
}
