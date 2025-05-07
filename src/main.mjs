import { createServer as createHTTPServer } from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { createServer as createHTTP2Server } from 'node:http2';

class ClientRequest {
  path; // string<URL pathname, no search params> | null
  pathSearchParams; // URLSearchParams (like Map<string<key>, string<value>>, with duplicate key support) | null
  pathRaw; // string<URL pathname>
  headers;
  
  constructor({ pathString }) {
    this.pathRaw = pathString;
    
    try {
      const url = new URL(`https://domain/${pathString}`);
      this.path = url.pathname;
      this.pathSearchParams = url.searchParams;
    } catch { /* empty */ }
  }
}

export class Server {
  #instances;
  #requestListener;
  #listening = false;
  
  async #handleHTTP1Request(req, res) {
    await this.#requestListener(new ClientRequest({
      pathString: req.url,
    }));
  }
  
  async #handleHTTP1Upgrade(req, res) {
    
  }
  
  async #handleHTTP2Request(req, res) {
    
  }
  
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
    this.#instances = instances.map(
      ({ mode, ip, port, cert, key, options }) => ({
        mode,
        ip,
        port,
        cert,
        key,
        options,
        server: null,
      })
    );
    
    for (let instance of this.#instances) {
      const { mode, cert, key, options } = instance;
      
      switch (mode) {
        case 'http':
          if (typeof options != 'object' && options != undefined) {
            throw new Error(`options not object or undefined: ${options}`);
          }
          
          instance.server = createHTTPServer(options);
          
          instance.server.on('request', async (req, res) => {
            await this.#handleHTTP1Request(req, res);
          });
          
          instance.server.on('upgrade', async (req, res) => {
            await this.#handleHTTP1Upgrade(req, res);
          });
          break;
      }
    }
    
    this.#requestListener = requestListener;
  }
  
  listen() {
    for (const { mode, ip, port } of this.#instances) {
      switch (mode) {
        case 'http':
        case 'https':
        case 'http2':
          this.#instances.server.listen(port, ip);
          break;
        
        default:
          throw new Error(`unknown or unsupported mode: ${mode}`);
      }
    }
    
    this.#listening = true;
  }
  
  close() {
    if (!this.#listening) {
      throw new Error('cannot close servers, servers not listening yet');
    }
    
    for (const { server } of this.#instances) {
      this.#instances.server.closeAllConnections();
    }
    
    this.#listening = false;
  }
}

export async function serveFilesystem({
  clientRequest,
  path,
}) {
  
}
