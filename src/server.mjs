import {
  createServer as createHTTPServer,
  STATUS_CODES,
} from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { createSecureServer as createHTTP2Server } from 'node:http2';
import { Readable } from 'node:stream';

import { ClientRequest } from './client_request.mjs';

function convertPossiblePseudoIPv6ToIPv4(ip) {
  let match;
  if (match = /::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/.exec(ip)) {
    return match[1];
  } else {
    return ip;
  }
}

function getIPObject({
  localFamily,
  localAddress,
  localPort,
  remoteAddress,
  remotePort,
}) {
  if (localFamily == 'IPv6') {
    return {
      ipFamily: localFamily,
      localAddress,
      localPort,
      remoteAddress,
      remotePort,
    };
  } else {
    return {
      ipFamily: localFamily,
      localAddress: convertPossiblePseudoIPv6ToIPv4(localAddress),
      localPort,
      remoteAddress: convertPossiblePseudoIPv6ToIPv4(remoteAddress),
      remotePort,
    };
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
      ...getIPObject(req.socket),
      secure,
      pathString: req.url,
      headers,
      internal: {
        mode: 'http1',
        req,
        res,
        socket: req.socket,
      },
      respondFunc: (data, headers) => {
        let status;
        
        if (headers == null) {
          status = 200;
          headers = {
            'content-type': 'text/plain; charset=utf-8',
          };
        } else {
          status = headers[':status'];
          headers = Object.fromEntries(
            Object.entries(headers)
              .filter(([ key, _ ]) => key != ':status')
          );
        }
        
        res.writeHead(status, headers);
        
        if (data instanceof Readable) {
          data.pipe(res);
        } else {
          res.end(data);
        }
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
      ...getIPObject(socket),
      secure,
      pathString: req.url,
      headers,
      internal: {
        mode: 'http1-upgrade',
        req,
        socket,
        head,
      },
      respondFunc: (data, headers) => {
        let status;
        
        if (headers == null) {
          status = 200;
          headers = {
            'content-type': 'text/plain; charset=utf-8',
          };
        } else {
          status = headers[':status'];
          headers = Object.fromEntries(
            Object.entries(headers)
              .filter(([ key, _ ]) => key != ':status')
          );
        }
        
        socket.write(
          `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n` +
          Object.fromEntries(headers)
            .map(([ key, value ]) => `${key}: ${value}`)
            .join('\r\n') + '\r\n\r\n'
        );
        
        if (data instanceof Readable) {
          data.pipe(socket);
        } else {
          socket.end(data);
        }
      },
    }));
  }
  
  async #handleHTTP1Connect({ listenerID, secure, req, socket, head }) {
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
      ...getIPObject(socket),
      secure,
      pathHostnameString: req.url,
      headers,
      internal: {
        mode: 'http1-connect',
        req,
        socket,
        head,
      },
      respondFunc: (data, headers) => {
        let status;
        
        if (headers == null) {
          status = 200;
          headers = {
            'content-type': 'text/plain; charset=utf-8',
          };
        } else {
          status = headers[':status'];
          headers = Object.fromEntries(
            Object.entries(headers)
              .filter(([ key, _ ]) => key != ':status')
          );
        }
        
        socket.write(
          `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n` +
          Object.fromEntries(headers)
            .map(([ key, value ]) => `${key}: ${value}`)
            .join('\r\n') + '\r\n\r\n'
        );
        
        if (data instanceof Readable) {
          data.pipe(socket);
        } else {
          socket.end(data);
        }
      },
    }));
  }
  
  async #handleHTTP2Request({ listenerID, secure, stream, headers, flags, rawHeaders }) {
    let processedHeaders = Object.fromEntries(Object.entries(headers));
    
    delete processedHeaders[':path'];
    
    await this.#requestListener(ClientRequest.createNew({
      listenerID,
      ...getIPObject(stream.session.socket),
      secure,
      ...(
        headers[':method'] == 'CONNECT' ?
        {
          pathHostnameString: headers[':path'],
        } :
        {
          pathString: headers[':path'],
        }
      ),
      headers: processedHeaders,
      internal: {
        mode: 'http2',
        stream,
        headers,
        flags,
        rawHeaders,
        socket: stream.session.socket,
      },
      respondFunc: (data, headers) => {
        if (headers == null) {
          headers = {
            'content-type': 'text/plain; charset=utf-8',
          };
        }
        
        stream.respond(headers);
        
        if (data instanceof Readable) {
          data.pipe(stream);
        } else {
          stream.end(data);
        }
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
        options: Object, (options passed to server constructor)
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
      const { listenerID, mode, options } = instance;
      
      switch (mode) {
        case 'http': {
          if (typeof options != 'object' && options != undefined) {
            throw new Error(`options not object or undefined: ${options}`);
          }
          
          const server = instance.server = createHTTPServer(options);
          
          server.on('request', async (req, res) => {
            await this.#handleHTTP1Request({
              listenerID,
              secure: false,
              req,
              res,
            });
          });
          
          server.on('upgrade', async (req, socket, head) => {
            await this.#handleHTTP1Upgrade({
              listenerID,
              secure: false,
              req,
              socket,
              head,
            });
          });
          
          server.on('connect', async (req, socket, head) => {
            await this.#handleHTTP1Connect({
              listenerID,
              secure: false,
              req,
              socket,
              head,
            });
          });
          break;
        }
        
        case 'https': {
          if (typeof options != 'object' && options != undefined) {
            throw new Error(`options not object or undefined: ${options}`);
          }
          
          const server = instance.server = createHTTPSServer(options);
          
          server.on('request', async (req, res) => {
            await this.#handleHTTP1Request({
              listenerID,
              secure: true,
              req,
              res,
            });
          });
          
          server.on('upgrade', async (req, socket, head) => {
            await this.#handleHTTP1Upgrade({
              listenerID,
              secure: true,
              req,
              socket,
              head,
            });
          });
          
          server.on('connect', async (req, socket, head) => {
            await this.#handleHTTP1Connect({
              listenerID,
              secure: true,
              req,
              socket,
              head,
            });
          });
          break;
        }
        
        case 'http2': {
          if (typeof options != 'object' && options != undefined) {
            throw new Error(`options not object or undefined: ${options}`);
          }
          
          const server = instance.server = createHTTP2Server(options);
          
          server.on('stream', async (stream, headers, flags, rawHeaders) => {
            await this.#handleHTTP2Request({
              listenerID,
              secure: true,
              stream,
              headers,
              flags,
              rawHeaders,
            });
          });
          break;
        }
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
