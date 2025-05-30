import {
  createServer as createHTTPServer,
  STATUS_CODES,
} from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { createSecureServer as createHTTP2Server } from 'node:http2';
import { Readable } from 'node:stream';
import { createServer as createTLSServer } from 'node:tls';

import { ClientRequest } from './client_request.mjs';
import { multiStream } from '../lib/multi_stream.mjs';

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
      streamReadable: req,
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
        
        if (data == null) {
          data = '';
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
      streamReadable: multiStream([
        head,
        socket,
      ]),
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
        
        if (data == null) {
          data = '';
        }
        
        socket.write(
          `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n` +
          Object.entries(headers)
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
      streamReadable: multiStream([
        head,
        socket,
      ]),
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
        
        if (data == null) {
          data = '';
        }
        
        socket.write(
          `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n` +
          Object.entries(headers)
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
      streamReadable: stream,
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
        
        if (data == null) {
          stream.respond(headers, { endStream: true });
        } else {
          stream.respond(headers, { endStream: false });
          
          if (data instanceof Readable) {
            data.pipe(stream);
          } else {
            stream.end(data);
          }
        }
      },
    }));
  }
  
  #createHttp1Server({
    instance,
    secure,
  }) {
    const { listenerID, server } = instance;
    const http1UpgradedSockets = instance.http1UpgradedSockets = new Set();
    
    server.on('request', async (req, res) => {
      await this.#handleHTTP1Request({
        listenerID,
        secure,
        req,
        res,
      });
    });
    
    server.on('upgrade', async (req, socket, head) => {
      if (!socket.destroyed) {
        http1UpgradedSockets.add(socket);
        
        socket.on('close', () => {
          http1UpgradedSockets.delete(socket);
        });
        
        await this.#handleHTTP1Upgrade({
          listenerID,
          secure,
          req,
          socket,
          head,
        });
      }
    });
    
    server.on('connect', async (req, socket, head) => {
      if (!socket.destroyed) {
        // assuming connect requests also count as an upgrade
        
        http1UpgradedSockets.add(socket);
        
        socket.on('close', () => {
          http1UpgradedSockets.delete(socket);
        });
        
        await this.#handleHTTP1Connect({
          listenerID,
          secure,
          req,
          socket,
          head,
        });
      }
    });
  }
  
  #createTLSServer({
    ip,
    port,
    tlsServers,
    server,
    instance,
    serverIsHttp2,
  }) {
    const ipPortKey = `[${ip}]:${port}`;
    
    if (tlsServers.has(ipPortKey)) {
      let { firstInstance } = tlsServers.get(ipPortKey);
      
      firstInstance.hasTlsComponent = true;
      firstInstance.firstInTlsComponent = true;
      instance.hasTlsComponent = true;
      instance.firstInTlsComponent = false;
      
      const tlsServer = firstInstance.tlsServer = createTLSServer({
        ...firstInstance.options,
        ALPNProtocols: ['h2', 'http/1.1'],
      });
      
      const tlsServerConnections = firstInstance.tlsServerConnections = new Set();
      
      tlsServer.on('connection', socket => {
        if (!socket.destroyed) {
          tlsServerConnections.add(socket);
          
          socket.on('close', () => {
            tlsServerConnections.delete(socket);
          });
        }
      });
      
      tlsServer.on('secureConnection', tlsSocket => {
        if (tlsSocket.destroyed) {
          return;
        }
        
        tlsSocket.setNoDelay(true);
        
        if (tlsSocket.alpnProtocol == false || tlsSocket.alpnProtocol == 'http/1.1') {
          // http/1.1
          if (serverIsHttp2) {
            firstInstance.server.emit('secureConnection', tlsSocket);
          } else {
            server.emit('secureConnection', tlsSocket);
          }
        } else {
          // http/2
          if (serverIsHttp2) {
            server.emit('secureConnection', tlsSocket);
          } else {
            firstInstance.server.emit('secureConnection', tlsSocket);
          }
        }
      });
      
      if ('sessionResumptionWithID' in firstInstance.options) {
        const tlsServerCachedSessionIDs = firstInstance.tlsServerCachedSessionIDs = new Map();
        const maxCachedEntries = firstInstance.options.sessionResumptionWithIDMaxEntries ?? 1e6;
        const maxCacheTime = firstInstance.options.sessionResumptionWithIDCacheTime ?? 3_600_000;
        
        tlsServer.on('newSession', (sessionID, sessionData, cb) => {
          const sessionIDString = sessionID.toString('base64');
          
          tlsServerCachedSessionIDs.set(sessionIDString, {
            lastUpdatedAt: Date.now(),
            sessionData,
          });
          
          if (tlsServerCachedSessionIDs.size > maxCachedEntries) {
            const { sessionIDString, done } = tlsServerCachedSessionIDs.keys().next();
            
            if (!done) {
              tlsServerCachedSessionIDs.delete(sessionIDString);
            }
          }
          
          cb();
          
          if (firstInstance.tlsServerCachedSessionTimeout == null) {
            const timeoutCallback = () => {
              const deleteBeforeThreshold = Date.now() - maxCacheTime;
              
              for (const [ sessionIDString, { lastUpdatedAt } ] of tlsServerCachedSessionIDs) {
                if (lastUpdatedAt <= deleteBeforeThreshold) {
                  tlsServerCachedSessionIDs.delete(sessionIDString);
                }
              }
              
              if (tlsServerCachedSessionIDs.size > 0) {
                firstInstance.tlsServerCachedSessionTimeout = setTimeout(timeoutCallback, maxCacheTime).unref();
              } else {
                firstInstance.tlsServerCachedSessionTimeout = null;
              }
            };
            
            firstInstance.tlsServerCachedSessionTimeout = setTimeout(timeoutCallback, maxCacheTime).unref();
          }
        });
        
        tlsServer.on('resumeSession', (sessionID, cb) => {
          const sessionIDString = sessionID.toString('base64');
          
          if (tlsServerCachedSessionIDs.has(sessionIDString)) {
            let sessionCacheEntry = tlsServerCachedSessionIDs.get(sessionIDString);
            
            sessionCacheEntry.lastUpdatedAt = Date.now();
            
            cb(null, sessionCacheEntry.sessionData);
          } else {
            cb(null, null);
          }
        });
      }
      
      firstInstance.otherServer = server;
    } else {
      tlsServers.set(ipPortKey, {
        firstInstance: instance,
      });
    }
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
          additional tls options:
            sessionResumptionWithID: boolean
            sessionResumptionWithIDMaxEntries: number, default 1e6,
            sessionResumptionWithIDCacheTime: number, default 3_600_000,
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
      
      newInstance.hasTlsComponent = false;
      newInstance.server = null;
      newInstance.http1UpgradedSockets = null; // only used by http1
      newInstance.http2Sessions = null; // only used by http2
      newInstance.firstInTlsComponent = null; // only used for https/http2 sharing
      newInstance.tlsServer = null; // only used for https/http2 sharing
      newInstance.tlsServerConnections = null; // only used for https/http2 sharing
      newInstance.otherServer = null; // only used for https/http2 sharing
      
      return newInstance;
    });
    
    let tlsServers = new Map();
    
    for (let instance of this.#instances) {
      const { listenerID, mode, ip, port, options } = instance;
      
      switch (mode) {
        case 'http': {
          if (typeof options != 'object' && options != undefined) {
            throw new Error(`options not object or undefined: ${options}`);
          }
          
          instance.server = createHTTPServer(options);
          
          this.#createHttp1Server({
            instance,
            secure: false,
          });
          break;
        }
        
        case 'https': {
          if (typeof options != 'object' && options != undefined) {
            throw new Error(`options not object or undefined: ${options}`);
          }
          
          const server = instance.server = createHTTPSServer(options);
          
          this.#createHttp1Server({
            instance,
            secure: true,
          });
          
          this.#createTLSServer({
            ip,
            port,
            tlsServers,
            server,
            instance,
            serverIsHttp2: false,
          });
          break;
        }
        
        case 'http2': {
          if (typeof options != 'object' && options != undefined) {
            throw new Error(`options not object or undefined: ${options}`);
          }
          
          const server = instance.server = createHTTP2Server(options);
          
          const http2Sessions = instance.http2Sessions = new Set();
          
          server.on('session', session => {
            http2Sessions.add(session);
            
            session.on('close', () => {
              http2Sessions.delete(session);
            });
          });
          
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
          
          this.#createTLSServer({
            ip,
            port,
            tlsServers,
            server,
            instance,
            serverIsHttp2: true,
          });
          break;
        }
      }
    }
    
    this.#requestListener = requestListener;
  }
  
  async listen() {
    await Promise.all(
      this.#instances.map(async ({ mode, ip, port, hasTlsComponent, firstInTlsComponent, server, tlsServer }) => {
        switch (mode) {
          case 'http':
          case 'https':
          case 'http2':
            if (hasTlsComponent) {
              if (firstInTlsComponent) {
                await new Promise((r, j) => {
                  const successListener = () => {
                    r();
                    tlsServer.off('error', errorListener);
                  };
                  
                  const errorListener = err => {
                    j(err);
                  };
                  
                  tlsServer.on('error', errorListener);
                  
                  tlsServer.listen(port, ip, () => {
                    successListener();
                  });
                });
              }
            } else {
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
            }
            break;
          
          default:
            throw new Error(`unknown or unsupported mode: ${mode}`);
        }
      })
    );
    
    this.#listening = true;
  }
  
  destroy() {
    if (!this.#listening) {
      throw new Error('cannot close servers, servers not listening yet');
    }
    
    for (const {
      mode,
      http1UpgradedSockets,
      http2Sessions,
      hasTlsComponent,
      firstInTlsComponent,
      server,
      tlsServer,
      tlsServerConnections,
      tlsServerCachedSessionTimeout,
    } of this.#instances) {
      if (mode == 'http' || mode == 'https') {
        server.closeAllConnections();
        
        for (const socket of http1UpgradedSockets) {
          socket.destroy();
        }
      } else if (mode == 'http2') {
        server.close();
        
        for (const session of http2Sessions) {
          session.destroy();
        }
      }
      
      if (hasTlsComponent) {
        if (firstInTlsComponent) {
          tlsServer.close();
          
          if (tlsServerCachedSessionTimeout != null) {
            clearTimeout(tlsServerCachedSessionTimeout);
          }
          
          for (const socket of tlsServerConnections) {
            socket.destroy();
          }
        }
      }
    }
    
    this.#listening = false;
  }
}
