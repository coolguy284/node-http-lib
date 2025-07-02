import { Enum } from '../lib/enum.mjs';
import { streamToBuffer } from '../lib/stream_to_buffer.mjs';

const PATH_HOSTNAME_REGEX = new RegExp(
  '^' +
  '(?:' +
  '(?:[a-z0-9-]+\\.)*[a-z0-9-]+(?::\\d{0,5})?|' + // abc.xyz OR abc.xyz:1234
  '(?:\\d{1,3}\\.){3}\\d{1,3}(?::\\d{0,5})?|' + // 0.0.0.0 OR 0.0.0.0:1234
  '(?:[0-9a-fA-F]{0,4}:){0,7}(?:[0-9a-fA-F]{0,4})?' + // ::
  '\\[(?:[0-9a-fA-F]{0,4}:){0,7}(?:[0-9a-fA-F]{0,4})?\\]:\\d{0,5}' + // [::]:1234
  ')' +
  '$'
);

const ABSOLUTE_PATH_REGEX = /^[a-z-]+:\/\/.*$/s;

export const PATH_FORMAT = Enum([
  'PATH_DECODED',
  'PATH_NOT_DECODED',
  'PATH_INVALID',
  'ABSOLUTE_PATH',
  'HOSTNAME',
]);

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
  /*
  PATH_DECODED: pathname was able to be url decoded
  PATH_NOT_DECODED: pathname was not able to be url decoded
  PATH_INVALID: path is not a valid pathname
  ABSOLUTE_PATH: path is an unprocessed absolute path (i.e. "https://example.com/path", used if this server is a http proxy)
  HOSTNAME: path is a hostname (i.e. "example.com:443", used for CONNECT requests)
  */
  pathFormat;
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
    headers,
    secure,
    bodyStream,
    server,
    internal,
    respondFunc,
  }) {
    let pathFormat;
    let path = null;
    let pathSearchParams = null;
    
    if (PATH_HOSTNAME_REGEX.test(pathString)) {
      pathFormat = PATH_FORMAT.HOSTNAME;
      path = pathString;
      pathSearchParams = null;
    } else if (ABSOLUTE_PATH_REGEX.test(pathString)) {
      pathFormat = PATH_FORMAT.ABSOLUTE_PATH;
      path = pathString;
      pathSearchParams = null;
    } else {
      pathFormat = false;
      
      let pathUrl;
      try {
        pathUrl = new URL(`https://domain/${pathString.slice(1)}`);
      } catch { /* empty */ }
      
      if (pathUrl == null) {
        pathFormat = PATH_FORMAT.PATH_INVALID;
        path = null;
      } else {
        pathFormat = PATH_FORMAT.PATH_DECODED;
        
        try {
          path = decodeURIComponent(pathUrl.pathname);
        } catch {
          pathFormat = PATH_FORMAT.PATH_NOT_DECODED;
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
      pathFormat,
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
    pathFormat,
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
    this.pathFormat = pathFormat;
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
      pathFormat: this.pathFormat,
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
