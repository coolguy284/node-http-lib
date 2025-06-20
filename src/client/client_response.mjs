import { streamToBuffer } from '../lib/stream_to_buffer.mjs';

export class ClientResponse {
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
