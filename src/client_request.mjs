export class ClientRequest {
  // http1 upgrades are treated as CONNECT requests using the extended connect
  // protocol, regardless of the true request method
  #respondFunc;
  listenerID;
  ipFamily; // 'IPv4' | 'IPv6'
  localAddress;
  localPort;
  remoteAddress;
  remotePort;
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
  internal;
  
  static createNew({
    listenerID,
    ipFamily,
    localAddress,
    localPort,
    remoteAddress,
    remotePort,
    pathString,
    headers,
    internal,
    respondFunc,
  }) {
    let pathUrl;
    try {
      pathUrl = new URL(`https://domain/${pathString.slice(1)}`);
    } catch { /* empty */ }
    
    let path = null;
    let pathSearchParams = null;
    
    if (pathUrl != null) {
      path = decodeURIComponent(pathUrl.pathname).slice(1);
      pathSearchParams = pathUrl.searchParams;
    }
    
    return new ClientRequest({
      listenerID,
      ipFamily,
      localAddress,
      localPort,
      remoteAddress,
      remotePort,
      path,
      pathSearchParams,
      pathRaw: pathString,
      headers,
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
    path,
    pathSearchParams,
    pathRaw,
    headers,
    internal,
    respondFunc,
  }) {
    this.listenerID = listenerID;
    this.ipFamily = ipFamily;
    this.localAddress = localAddress;
    this.localPort = localPort;
    this.remoteAddress = remoteAddress;
    this.remotePort = remotePort;
    this.path = path;
    this.pathSearchParams = pathSearchParams;
    this.pathRaw = pathRaw;
    this.headers = headers;
    this.internal = internal;
    this.#respondFunc = respondFunc;
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
    return new ClientRequest({
      listenerID: this.listenerID,
      path: this.path.slice(pathStart.length - 1),
      pathSearchParams: this.pathSearchParams,
      pathRaw: this.pathRaw,
      headers: this.headers,
      internal: this.internal,
      respondFunc: this.#respondFunc,
    });
  }
  
  /*
    data: string | Buffer | Stream,
    headers: Object | null,
  */
  respond(data, headers) {
    this.#respondFunc(data, headers);
  }
}
