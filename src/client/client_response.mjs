import { streamToBuffer } from '../lib/stream_to_buffer.mjs';

export class ClientResponse {
  headers;
  bodyStream;
  
  constructor({
    headers,
    bodyStream,
  }) {
    this.headers = headers;
    this.bodyStream = bodyStream;
  }
  
  async getBodyAsBuffer() {
    return await streamToBuffer(this.bodyStream);
  }
}
