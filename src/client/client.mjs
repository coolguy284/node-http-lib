import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

import { ClientResponse } from './client_response.mjs';
import { createDisposableIfNull } from '../lib/create_disposable.mjs';
import { awaitEventOrError } from '../lib/event_emitter_promise.mjs';
import { multiStream } from '../lib/multi_stream.mjs';
import { RequestSession } from './request_session.mjs';

export async function request({
  mode,
  session = null,
  host,
  port = null,
  path,
  headers = {},
  body = null,
  options = {},
  errorIfErrorStatusCode = true,
}) {
  let clientResponse;
  
  switch (mode) {
    case 'http':
    case 'https': {
      let processedHeaders = Object.fromEntries(Object.entries(headers));
      delete processedHeaders[':scheme'];
      delete processedHeaders[':method'];
      
      if (':authority' in headers) {
        processedHeaders.host = headers[':authority'];
        delete processedHeaders[':authority'];
      }
      
      const requestFunc = mode == 'http' ? httpRequest : httpsRequest;
      
      const clientRequest = requestFunc({
        host,
        port,
        path: `/${path}`,
        method: headers[':method'],
        headers: processedHeaders,
        ...options,
      });
      
      if (body != null) {
        if (body instanceof Readable) {
          body.pipe(clientRequest);
        } else {
          clientRequest.end(body);
        }
      } else {
        clientRequest.end();
      }
      
      const { eventName, args } = await awaitEventOrError(clientRequest, ['response', 'upgrade', 'connect']);
      
      switch (eventName) {
        case 'response': {
          const [ response ] = args;
          
          clientResponse = new ClientResponse({
            headers: {
              ':status': response.statusCode,
              ...response.headers,
            },
            bodyStream: response,
          });
          break;
        }
        
        case 'upgrade':
        case 'connect': {
          const [ response, socket, head ] = args;
          
          clientResponse = new ClientResponse({
            headers: {
              ':status': response.statusCode,
              ...response.headers,
            },
            bodyStream: multiStream([
              head,
              socket,
            ]),
          });
          break;
        }
        
        default:
          throw new Error(`default awaitEventOrError case not possible: ${eventName}`);
      }
      break;
    }
    
    case 'http2': {
      using workingSession = createDisposableIfNull(session, () => new RequestSession());
      
      const connection = await workingSession.get().createOrGetHttp2Session({
        host,
        port: port ?? 443,
        options,
      });
      
      let processedHeaders = {
        ':path': `/${path}`,
        ...headers,
      };
      
      const stream = connection.request(processedHeaders, options);
      
      if (body != null) {
        if (body instanceof Readable) {
          body.pipe(stream);
        } else {
          stream.end(body);
        }
      } else {
        stream.end();
      }
      
      const { args: [ responseHeaders, _ ] } = await awaitEventOrError(stream, ['response']);
      
      clientResponse = new ClientResponse({
        headers: responseHeaders,
        bodyStream: stream,
      });
      break;
    }
    
    default:
      throw new Error(`mode unrecognized: ${JSON.stringify(mode)}`);
  }
  
  if (errorIfErrorStatusCode && clientResponse.headers[':status'] >= 400 && clientResponse.headers[':status'] <= 599) {
    let err = new Error(`Error code ${clientResponse.headers[':status']} in response`);
    err.clientResponse = clientResponse;
    throw err;
  }
  
  return clientResponse;
}
