import { createServer as createHTTPServer } from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { createSecureServer as createHTTP2Server } from 'node:http2';

class ClientRequest {
  listenerID;
  path; // string<URL pathname, no search params> | null
  pathSearchParams; // URLSearchParams (like Map<string<key>, string<value>>, with duplicate key support) | null
  pathRaw; // string<URL pathname>
  /*
    Map<string, string>
    (
      http2-like headers object, with ':path' removed;
      ':scheme' is 'http' for insecure, and 'https' for secure requests
    )
  */
  headers;
  /*
    {
      mode: 'http1' | 'http1-upgrade' | 'http2',
      if mode == 'http1':
        req: IncomingMessage,
        res: ServerResponse,
      if mode == 'http1-upgrade':
        req: IncomingMessage,
        socket: Socket,
        head: Object,
      if mode == 'http2':
        stream: Http2Stream,
        headers: Object,
        flags: number,
        rawHeaders: Array,
    }
  */
  internal;
  
  static createNew({
    listenerID,
    pathString,
    headers,
    internal,
  }) {
    let pathUrl;
    try {
      pathUrl = new URL(`https://domain/${pathString}`);
    } catch { /* empty */ }
    
    let path = null;
    let pathSearchParams = null;
    
    if (pathUrl != null) {
      path = pathUrl.pathname;
      pathSearchParams = pathUrl.searchParams;
    }
    
    return new ClientRequest({
      listenerID,
      path,
      pathSearchParams,
      pathRaw: pathString,
      headers,
      internal,
    });
  }
  
  constructor({
    listenerID,
    path,
    pathSearchParams,
    pathRaw,
    headers,
    internal,
  }) {
    this.listenerID = listenerID;
    this.path = path;
    this.pathSearchParams = pathSearchParams;
    this.pathRaw = pathRaw;
    this.headers = headers;
    this.internal = internal;
  }
  
  pathMatch(pathStart) {
    if (pathStart.endsWith('/')) {
      return this.path.startsWith(pathStart);
    } else {
      return this.path == pathStart;
    }
  }
  
  subRequest(pathStart) {
    return new ClientRequest({
      listenerID: this.listenerID,
      path: this.path.slice(pathStart.listen - 1),
      pathSearchParams: this.pathSearchParams,
      pathRaw: this.pathRaw,
      headers: this.headers,
      internal: this.internal,
    });
  }
}

export class Server {
  #instances;
  #requestListener;
  #listening = false;
  
  async #handleHTTP1Request({ listenerID, secure, req, res }) {
    let headers = Object.fromEntries(Object.entries(req.headers));
    
    headers[':scheme'] = secure ? 'https' : 'http';
    headers[':method'] = req.method;
    headers[':authority'] = req.headers.host;
    delete headers.host;
    
    await this.#requestListener(ClientRequest.createNew({
      listenerID,
      secure,
      pathString: req.url,
      headers,
      internal: {
        mode: 'http1',
        req,
        res,
      },
    }));
  }
  
  async #handleHTTP1Upgrade({ listenerID, secure, req, socket, head }) {
    let headers = Object.fromEntries(Object.entries(req.headers));
    
    headers[':scheme'] = secure ? 'https' : 'http';
    headers[':method'] = 'CONNECT';
    headers[':authority'] = req.headers.host;
    delete headers.host;
    headers[':protocol'] = req.headers.upgrade;
    delete headers.upgrade;
    delete headers.connection;
    
    await this.#requestListener(ClientRequest.createNew({
      listenerID,
      secure,
      pathString: req.url,
      headers,
      internal: {
        mode: 'http1-upgrade',
        req,
        socket,
        head,
      },
    }));
  }
  
  async #handleHTTP2Request({ listenerID, secure, stream, headers, flags, rawHeaders }) {
    let processedHeaders = Object.fromEntries(Object.entries(req.headers));
    
    delete processedHeaders[':path'];
    
    await this.#requestListener(ClientRequest.createNew({
      listenerID,
      secure,
      pathString: req.headers[':path'],
      headers: processedHeaders,
      internal: {
        mode: 'http2',
        stream,
        headers,
        flags,
        rawHeaders,
      },
    }));
  }
  
  /*
    instances:
    [
      {
        listenerID: string | null, (for use in ClientRequest)
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
    this.#instances = instances.map(instance => {
      let newInstance = Object.fromEntries(Object.entries(instance));
      newInstance.server = null;
      return newInstance;
    });
    
    for (let instance of this.#instances) {
      const { listenerID, mode, cert, key, options } = instance;
      
      switch (mode) {
        case 'http':
          if (typeof options != 'object' && options != undefined) {
            throw new Error(`options not object or undefined: ${options}`);
          }
          
          instance.server = createHTTPServer(options);
          
          instance.server.on('request', async (req, res) => {
            await this.#handleHTTP1Request({
              listenerID,
              secure: false,
              req,
              res,
            });
          });
          
          instance.server.on('upgrade', async (req, socket, head) => {
            await this.#handleHTTP1Upgrade({
              listenerID,
              secure: true,
              req,
              socket,
              head,
            });
          });
          break;
        
        case 'https':
          if (typeof options != 'object' && options != undefined) {
            throw new Error(`options not object or undefined: ${options}`);
          }
          
          instance.server = createHTTPSServer(options);
          
          instance.server.on('request', async (req, res) => {
            await this.#handleHTTP1Request({
              listenerID,
              secure: true,
              req,
              res,
            });
          });
          
          instance.server.on('upgrade', async (req, socket, head) => {
            await this.#handleHTTP1Upgrade({
              listenerID,
              secure: true,
              req,
              socket,
              head,
            });
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
