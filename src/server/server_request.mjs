import { streamToBuffer } from '../lib/stream_to_buffer.mjs';

export class ServerRequest {
  // http1 upgrades are treated as CONNECT requests using the extended connect
  // protocol, regardless of the true request method
  #respondFunc;
  listenerID;
  ipFamily; // 'IPv4' | 'IPv6'
  localAddress;
  localPort;
  remoteAddress;
  remotePort;
  pathIsHostname; // boolean, true if path is hostname (for CONNECT request)
  path; // string<URL pathname (URL-decoded), no search params, with initial '/' removed> | null
  pathSearchParams; // URLSearchParams (like Map<string<key>, string<value>>, with duplicate key support) | null
  pathRaw; // string<URL pathname, no processing>
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
  secure;
  bodyStream; // stream.Readable
  server;
  internal;
  
  static createNew({
    listenerID,
    ipFamily,
    localAddress,
    localPort,
    remoteAddress,
    remotePort,
    pathString,
    pathHostnameString,
    headers,
    secure,
    bodyStream,
    server,
    internal,
    respondFunc,
  }) {
    let pathIsHostname;
    let path = null;
    let pathSearchParams = null;
    
    if (pathHostnameString != null) {
      pathIsHostname = true;
      
      path = pathHostnameString;
      pathSearchParams = new URLSearchParams();
    } else {
      pathIsHostname = false;
      
      let pathUrl;
      try {
        pathUrl = new URL(`https://domain/${pathString.slice(1)}`);
      } catch { /* empty */ }
      
      if (pathUrl != null) {
        try {
          path = decodeURIComponent(pathUrl.pathname);
        } catch {
          path = pathUrl.pathname;
        }
        
        path = path.slice(1);
        pathSearchParams = pathUrl.searchParams;
      }
    }
    
    return new ServerRequest({
      listenerID,
      ipFamily,
      localAddress,
      localPort,
      remoteAddress,
      remotePort,
      pathIsHostname,
      path,
      pathSearchParams,
      pathRaw: pathString,
      headers,
      secure,
      bodyStream,
      server,
      internal,
      respondFunc,
    });
  }
  
  constructor({
    listenerID,
    ipFamily,
    localAddress,
    localPort,
    remoteAddress,
    remotePort,
    pathIsHostname,
    path,
    pathSearchParams,
    pathRaw,
    headers,
    secure,
    bodyStream,
    server,
    internal,
    respondFunc,
  }) {
    this.listenerID = listenerID;
    this.ipFamily = ipFamily;
    this.localAddress = localAddress;
    this.localPort = localPort;
    this.remoteAddress = remoteAddress;
    this.remotePort = remotePort;
    this.pathIsHostname = pathIsHostname;
    this.path = path;
    this.pathSearchParams = pathSearchParams;
    this.pathRaw = pathRaw;
    this.headers = headers;
    this.secure = secure;
    this.bodyStream = bodyStream;
    this.server = server;
    this.internal = internal;
    this.#respondFunc = respondFunc;
  }
  
  async getBodyAsBuffer() {
    return await streamToBuffer(this.bodyStream);
  }
  
  pathMatch(pathStart) {
    if (pathStart == '') {
      return true;
    } else if (pathStart.endsWith('/')) {
      return this.path.startsWith(pathStart);
    } else {
      return this.path == pathStart;
    }
  }
  
  subRequest(pathStart) {
    return new ServerRequest({
      listenerID: this.listenerID,
      ipFamily: this.ipFamily,
      localAddress: this.localAddress,
      localPort: this.localPort,
      remoteAddress: this.remoteAddress,
      remotePort: this.remotePort,
      pathIsHostname: this.pathIsHostname,
      path: this.path.slice(pathStart.length),
      pathSearchParams: this.pathSearchParams,
      pathRaw: this.pathRaw,
      headers: this.headers,
      secure: this.secure,
      bodyStream: this.bodyStream,
      server: this.server,
      internal: this.internal,
      respondFunc: this.#respondFunc,
    });
  }
  
  /*
    data: string | Buffer | Stream,
    responseHeaders: Object | integer | null,
  */
  respond(data, responseHeaders) {
    if (responseHeaders == null) {
      responseHeaders = {
        ':status': 200,
        'content-type': 'text/plain; charset=utf-8',
      };
    } else if (Number.isSafeInteger(responseHeaders)) {
      responseHeaders = {
        ':status': responseHeaders,
        'content-type': 'text/plain; charset=utf-8',
      };
    }
    
    this.#respondFunc(data, responseHeaders);
  }
}
