import {
  request,
  //RequestSession,
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
      rejectUnauthorized: true,
    },
  });
  
  console.log('https:');
  console.log(clientResponse.headers[':status']);
  console.log((await clientResponse.getBodyAsBuffer()).toString());
}

{
  //using session = new RequestSession();
  
  const clientResponse = await request({
    mode: 'http2',
    //session,
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    options: {
      rejectUnauthorized: true,
    },
  });
  
  console.log('http2:');
  console.log(clientResponse.headers[':status']);
  console.log((await clientResponse.getBodyAsBuffer()).toString());
}

/*
{
  //using session = new RequestSession();
  
  const clientResponse = await request({
    mode: 'http3',
    //session,
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    options: {
      rejectUnauthorized: true,
    },
  });
  
  console.log('http3:');
  console.log(clientResponse.headers[':status']);
  console.log((await clientResponse.getBodyAsBuffer()).toString());
}
*/
