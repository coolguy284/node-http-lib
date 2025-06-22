import { request } from '../client/client.mjs';
import { awaitEventOrError } from '../lib/event_emitter_promise.mjs';

export async function serveProxyStaticEndpoint({
  serverRequest,
  requestParameters,
  errorIfErrorStatusCode = false,
  gracefulShutdownFunc = ({ serverRequest, clientRequest }) => {
    serverRequest.bodyStream.destroy();
    clientRequest.bodyStream.destroy();
  },
}) {
  const clientRequest = await request({
    headers: serverRequest.headers,
    body: serverRequest.bodyStream,
    errorIfErrorStatusCode,
    ...requestParameters,
  });
  
  serverRequest.respond(
    clientRequest.bodyStream,
    clientRequest.headers,
  );
  
  const gracefulShutdownPromiseInternal = Promise.all([
    awaitEventOrError(serverRequest.bodyStream, ['close']),
    awaitEventOrError(clientRequest.bodyStream, ['close']),
  ]);
  
  const gracefulShutdownPromise = new Promise(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
    async r => {
      try {
        await gracefulShutdownPromiseInternal;
      } finally {
        r();
        serverRequest.server.removeGracefulShutdownPromise(gracefulShutdownPromise);
      }
    }
  );
  
  serverRequest.server.addGracefulShutdownPromise(gracefulShutdownPromise);
  
  if (gracefulShutdownFunc != null) {
    const processedGracefulShutdownFunc = () => {
      gracefulShutdownFunc({ serverRequest, clientRequest });
    };
    
    serverRequest.server.addGracefulShutdownFunc(processedGracefulShutdownFunc);
    
    try {
      await gracefulShutdownPromiseInternal;
    } finally {
      serverRequest.server.removeGracefulShutdownFunc(processedGracefulShutdownFunc);
    }
  }
}

export async function serveProxy({
  serverRequest,
  requestParameters,
  errorIfErrorStatusCode,
  gracefulShutdownFunc,
}) {
  let processedRequestParameters = { ...requestParameters };
  
  const pathPrefix = processedRequestParameters.pathPrefix ?? '';
  
  delete processedRequestParameters.pathPrefix;
  
  await serveProxyStaticEndpoint({
    serverRequest,
    requestParameters: {
      path: pathPrefix + serverRequest.path,
      ...requestParameters,
    },
    errorIfErrorStatusCode,
    gracefulShutdownFunc,
  });
}
