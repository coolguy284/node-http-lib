import {
  createServer as createHTTPServer,
  STATUS_CODES,
} from 'node:http';
import { createSecureServer as createHTTP2Server } from 'node:http2';
import { createServer as createHTTPSServer } from 'node:https';
import { Readable } from 'node:stream';
import { createServer as createTLSServer } from 'node:tls';

import { multiStream } from '../lib/multi_stream.mjs';
import { awaitEventOrError } from '../lib/eventemitter_promise.mjs';
import { ServerRequest } from './server_request.mjs';

function convertPossiblePseudoIPv6ToIPv4(ip) {
  let match;
  if ((match = /::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/.exec(ip)) != null) {
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
  #gracefulShutdownPromises = new Set();
  #gracefulShutdownFuncs = new Set();
  
  async #handleHTTP1Request({ listenerID, secure, req, res }) {
    let headers = Object.fromEntries(Object.entries(req.headers));
    
    headers[':scheme'] = secure ? 'https' : 'http';
    headers[':method'] = req.method;
    headers[':authority'] = req.headers.host;
    delete headers.host;
    
    await this.#requestListener(ServerRequest.createNew({
      listenerID,
      ...getIPObject(req.socket),
      secure,
      pathString: req.url,
      headers,
      streamReadable: req,
      server: this,
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
        
        if (data == null) {
          res.end();
        } else {
          if (data instanceof Readable) {
            data.pipe(res);
          } else {
            res.end(data);
          }
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
    
    await this.#requestListener(ServerRequest.createNew({
      listenerID,
      ...getIPObject(socket),
      secure,
      pathString: req.url,
      headers,
      streamReadable: multiStream([
        head,
        socket,
      ]),
      server: this,
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
          Object.entries(headers)
            .map(([ key, value ]) => `${key}: ${value}`)
            .join('\r\n') + '\r\n\r\n'
        );
        
        if (data == null) {
          socket.end();
        } else {
          if (data instanceof Readable) {
            data.pipe(socket);
          } else {
            socket.end(data);
          }
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
    
    await this.#requestListener(ServerRequest.createNew({
      listenerID,
      ...getIPObject(socket),
      secure,
      pathHostnameString: req.url,
      headers,
      streamReadable: multiStream([
        head,
        socket,
      ]),
      server: this,
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
          Object.entries(headers)
            .map(([ key, value ]) => `${key}: ${value}`)
            .join('\r\n') + '\r\n\r\n'
        );
        
        if (data == null) {
          socket.end();
        } else {
          if (data instanceof Readable) {
            data.pipe(socket);
          } else {
            socket.end(data);
          }
        }
      },
    }));
  }
  
  async #handleHTTP2Request({ listenerID, secure, stream, headers, flags, rawHeaders }) {
    let processedHeaders = Object.fromEntries(Object.entries(headers));
    
    delete processedHeaders[':path'];
    
    await this.#requestListener(ServerRequest.createNew({
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
      server: this,
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
          
          if (!stream.writable) {
            if (!(data instanceof Readable) && data.length == 0) {
              return;
            } else {
              throw new Error('stream.respond automatically ended stream (despite being told not to) and nonzero length data was given');
            }
          }
          
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
    const http1UpgradeAndConnectSockets = instance.http1UpgradeAndConnectSockets = new Set();
    
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
        http1UpgradeAndConnectSockets.add(socket);
        
        socket.on('close', () => {
          http1UpgradeAndConnectSockets.delete(socket);
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
        
        http1UpgradeAndConnectSockets.add(socket);
        
        socket.on('close', () => {
          http1UpgradeAndConnectSockets.delete(socket);
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
  
  static #createTLSServer({
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
        listenerID: string | null, (for use in ServerRequest)
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
      newInstance.http1UpgradeAndConnectSockets = null; // only used by http1
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
          
          Server.#createTLSServer({
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
          
          server.on(
            'stream',
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            async (stream, headers, flags, rawHeaders) => {
              await this.#handleHTTP2Request({
                listenerID,
                secure: true,
                stream,
                headers,
                flags,
                rawHeaders,
              });
            }
          );
          
          Server.#createTLSServer({
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
  
  addGracefulShutdownFunc(gracefulShutdownFunc) {
    this.#gracefulShutdownFuncs.add(gracefulShutdownFunc);
  }
  
  removeGracefulShutdownFunc(gracefulShutdownFunc) {
    this.#gracefulShutdownFuncs.delete(gracefulShutdownFunc);
  }
  
  addGracefulShutdownPromise(gracefulShutdownPromise) {
    this.#gracefulShutdownPromises.add(gracefulShutdownPromise);
  }
  
  removeGracefulShutdownPromise(gracefulShutdownPromise) {
    this.#gracefulShutdownPromises.delete(gracefulShutdownPromise);
  }
  
  async listen() {
    if (this.#listening) {
      throw new Error('already listening');
    }
    
    await Promise.all(
      this.#instances.map(async ({ mode, ip, port, hasTlsComponent, firstInTlsComponent, server, tlsServer }) => {
        switch (mode) {
          case 'http':
          case 'https':
          case 'http2':
            if (hasTlsComponent) {
              if (firstInTlsComponent) {
                tlsServer.listen(port, ip);
                
                await awaitEventOrError(tlsServer, 'listening');
              }
            } else {
              server.listen(port, ip);
              
              await awaitEventOrError(server, 'listening');
            }
            break;
          
          default:
            throw new Error(`unknown or unsupported mode: ${mode}`);
        }
      })
    );
    
    this.#listening = true;
  }
  
  async close() {
    if (!this.#listening) {
      return;
    }
    
    let finishPromises = [];
    
    for (const gracefulShutdownFunc of this.#gracefulShutdownFuncs) {
      await gracefulShutdownFunc();
    }
    
    this.#gracefulShutdownFuncs.clear();
    
    for (const {
      mode,
      http1UpgradeAndConnectSockets,
      http2Sessions,
      hasTlsComponent,
      firstInTlsComponent,
      server,
      tlsServer,
      tlsServerConnections,
      tlsServerCachedSessionTimeout,
    } of this.#instances) {
      if (mode == 'http' || mode == 'https') {
        server.close();
        
        for (const socket of http1UpgradeAndConnectSockets) {
          if (!socket.destroyed) {
            finishPromises.push(
              new Promise(r => {
                socket.once('close', () => r());
              })
            );
          }
        }
      } else if (mode == 'http2') {
        server.close();
        
        for (const session of http2Sessions) {
          if (!session.closed) {
            session.close();
            
            finishPromises.push(
              new Promise(r => {
                session.once('close', () => r());
              })
            );
          }
        }
      }
      
      if (hasTlsComponent) {
        if (firstInTlsComponent) {
          tlsServer.close();
          
          if (tlsServerCachedSessionTimeout != null) {
            clearTimeout(tlsServerCachedSessionTimeout);
          }
          
          for (const socket of tlsServerConnections) {
            if (!socket.destroyed) {
              finishPromises.push(
                new Promise(r => {
                  socket.once('close', () => r());
                })
              );
            }
          }
        }
      }
    }
    
    for (const gracefulShutdownPromise of this.#gracefulShutdownPromises) {
      finishPromises.push(gracefulShutdownPromise);
    }
    
    this.#gracefulShutdownPromises.clear();
    
    await Promise.all(finishPromises);
    
    this.#listening = false;
  }
  
  destroy() {
    if (!this.#listening) {
      return;
    }
    
    for (const {
      mode,
      http1UpgradeAndConnectSockets,
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
        
        for (const socket of http1UpgradeAndConnectSockets) {
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
  
  async [Symbol.asyncDispose]() {
    await this.close();
  }
}
