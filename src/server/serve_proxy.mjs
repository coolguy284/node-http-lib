import { request } from '../client/client.mjs';

export async function serveProxyStaticEndpoint({
  serverRequest,
  requestParameters,
  errorIfErrorStatusCode = false,
}) {
  const clientRequest = await request({
    headers: serverRequest.headers,
    body: serverRequest.getBodyAsStream(),
    errorIfErrorStatusCode,
    ...requestParameters,
  });
  
  serverRequest.respond(
    clientRequest.getBodyAsStream(),
    clientRequest.headers,
  );
}

export async function serveProxy({
  serverRequest,
  requestParameters,
  errorIfErrorStatusCode,
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
  });
}
