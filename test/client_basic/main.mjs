import {
  request,
  RequestSession,
} from '../../src/main.mjs';

{
  const clientResponse = await request({
    mode: 'http',
    host: 'localhost',
    port: 8080,
    path: 'files/index.html',
    headers: {}, // optional
    body: null, // optional
    options: {}, // optional
    errorIfErrorStatusCode: true, // optional
  });
  
  console.log('http:');
  console.log(clientResponse.statusCode);
  console.log(await clientResponse.getBodyAsBuffer());
}

{
  const clientResponse = await request({
    mode: 'https',
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    headers: {}, // optional
    body: null, // optional
    options: {}, // optional
    errorIfErrorStatusCode: true, // optional
  });
  
  console.log('https:');
  console.log(clientResponse.statusCode);
  console.log(await clientResponse.getBodyAsBuffer());
}

{
  using session = new RequestSession();
  
  const clientResponse = await request({
    mode: 'http2',
    session, // optional
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    headers: {}, // optional
    body: null, // optional
    options: {}, // optional
    errorIfErrorStatusCode: true, // optional
  });
  
  console.log('http2:');
  console.log(clientResponse.statusCode);
  console.log(await clientResponse.getBodyAsBuffer());
}

/*
{
  using session = new RequestSession();
  
  const clientResponse = await request({
    mode: 'http3',
    session, // optional
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    headers: {}, // optional
    body: null, // optional
    options: {}, // optional
    errorIfErrorStatusCode: true, // optional
  });
  
  console.log('http3:');
  console.log(clientResponse.statusCode);
  console.log(await clientResponse.getBodyAsBuffer());
}
*/
