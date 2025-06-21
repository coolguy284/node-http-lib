import { request } from '../client/client.mjs';

export async function serveProxyStaticEndpoint({
  serverRequest,
  requestParameters,
}) {
  const clientRequest = await request({
    headers: serverRequest.headers,
    body: serverRequest.body,
    ...requestParameters,
  });
}

export async function serveProxy({
  serverRequest,
  requestParameters,
}) {
  
}
