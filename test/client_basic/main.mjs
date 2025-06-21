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
  });
  
  console.log('http:');
  console.log(clientResponse.headers[':status']);
  console.log((await clientResponse.getBodyAsBuffer()).toString());
}

{
  const clientResponse = await request({
    mode: 'https',
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    options: {
      rejectUnauthorized: false,
    },
  });
  
  console.log('https:');
  console.log(clientResponse.headers[':status']);
  console.log((await clientResponse.getBodyAsBuffer()).toString());
}

{
  const clientResponse = await request({
    mode: 'http2',
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    options: {
      rejectUnauthorized: false,
    },
  });
  
  console.log('http2 (no session):');
  console.log(clientResponse.headers[':status']);
  console.log((await clientResponse.getBodyAsBuffer()).toString());
}

{
  using session = new RequestSession();
  
  const clientResponse = await request({
    mode: 'http2',
    session,
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    options: {
      rejectUnauthorized: false,
    },
  });
  
  console.log('http2 (session):');
  console.log(clientResponse.headers[':status']);
  console.log((await clientResponse.getBodyAsBuffer()).toString());
}

/*
{
  const clientResponse = await request({
    mode: 'http3',
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    options: {
      rejectUnauthorized: false,
    },
  });
  
  console.log('http3 (no session):');
  console.log(clientResponse.headers[':status']);
  console.log((await clientResponse.getBodyAsBuffer()).toString());
}

{
  using session = new RequestSession();
  
  const clientResponse = await request({
    mode: 'http3',
    session,
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    options: {
      rejectUnauthorized: false,
    },
  });
  
  console.log('http3 (session):');
  console.log(clientResponse.headers[':status']);
  console.log((await clientResponse.getBodyAsBuffer()).toString());
}
*/
