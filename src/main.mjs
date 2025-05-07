import { createServer as createHTTPServer } from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { createSecureServer as createHTTP2Server } from 'node:http2';

class ClientRequest {
  path = null; // string<URL pathname, no search params> | null
  pathSearchParams = null; // URLSearchParams (like Map<string<key>, string<value>>, with duplicate key support) | null
  pathRaw; // string<URL pathname>
  headers; // Map<string, string> (http2-like headers object, with ':path' removed)
  /*
    {
      mode: 'http' | 'https' | 'http2' | 'http3',
      if mode == 'http' | 'https':
        req: IncomingMessage,
        res: ServerResponse,
    }
  */
  internal;
  
  constructor({
    pathString,
    headers,
    internal,
  }) {
    this.pathRaw = pathString;
    
    let pathUrl;
    try {
      pathUrl = new URL(`https://domain/${pathString}`);
    } catch { /* empty */ }
    
    if (pathUrl != null) {
      this.path = pathUrl.pathname;
      this.pathSearchParams = pathUrl.searchParams;
    }
    
    this.headers = headers;
    this.internal = internal;
  }
  
  pathMatch(pathStart) {
    // TODO
  }
  
  subRequest(pathStart) {
    // TODO
  }
}

export class Server {
  #instances;
  #requestListener;
  #listening = false;
  
  async #handleHTTP1Request(req, res) {
    let headers = Object.fromEntries(Object.entries(req.headers));
    
    headers[':scheme'] = 'http';
    headers[':method'] = req.method;
    headers[':authority'] = req.headers.host;
    delete headers.host;
    
    await this.#requestListener(new ClientRequest({
      pathString: req.url,
      headers,
      internal: {
        req,
        res,
      },
    }));
  }
  
  async #handleHTTP1Upgrade(req, head, socket) {
    // TODO
  }
  
  async #handleHTTP2Request(req) {
    // TODO
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
  
  async listen() {
    await Promise.all(
      this.#instances.map(async ({ mode, ip, port, server }) => {
        switch (mode) {
          case 'http':
          case 'https':
          case 'http2':
            await new Promise((r, j) => {
              const successListener = () => {
                r();
                server.off('error', errorListener);
              };
              
              const errorListener = err => {
                j(err);
              };
              
              server.on('error', errorListener);
              
              server.listen(port, ip, () => {
                successListener();
              });
            });
            break;
          
          default:
            throw new Error(`unknown or unsupported mode: ${mode}`);
        }
      })
    );
    
    this.#listening = true;
  }
  
  close() {
    if (!this.#listening) {
      throw new Error('cannot close servers, servers not listening yet');
    }
    
    for (const { server } of this.#instances) {
      server.closeAllConnections();
    }
    
    this.#listening = false;
  }
}

export async function serveFilesystem({
  clientRequest,
  path,
}) {
  
}
