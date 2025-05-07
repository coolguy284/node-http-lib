import { createServer as createHTTPServer } from 'node:http';
import { createServer as createHTTP2Server } from 'node:http2';

class ClientRequest {
  
}

export class Server {
  #instances;
  #requestListener;
  #listening = false;
  
  /*
    instances:
    [
      {
        mode: 'http' | 'https' | 'http2' | 'http3',
        ip: string<ip address>,
        port: integer<port, 0 - 65535>,
        if mode == 'https' | 'http2' | 'http3':
          cert: Buffer<TLS certificate>,
          key: Buffer<TLS key>,
      },
      ...
    ]
  */
  constructor({
    instances,
    requestListener,
  }) {
    this.#instances = instances;
    this.#requestListener = requestListener;
  }
  
  listen() {
    // TODO
  }
  
  close() {
    // TODO
  }
}

export async function serveFilesystem({
  clientRequest,
  path,
}) {
  
}
