{
  const clientResponse = await request({
    mode: 'http',
    host: 'localhost',
    port: 8080,
    path: 'files/index.html',
    headers: {},
    body: null,
    errorIfErrorStatusCode: true,
  });
  
  console.log('http:');
  console.log(clientResponse.statusCode);
  console.log(clientResponse.body);
}

{
  const clientResponse = await request({
    mode: 'https',
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    headers: {},
    body: null,
    errorIfErrorStatusCode: true,
  });
  
  console.log('https:');
  console.log(clientResponse.statusCode);
  console.log(clientResponse.body);
}

{
  const clientResponse = await request({
    mode: 'http2',
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    headers: {},
    body: null,
    errorIfErrorStatusCode: true,
  });
  
  console.log('http2:');
  console.log(clientResponse.statusCode);
  console.log(clientResponse.body);
}

/*
{
  const clientResponse = await request({
    mode: 'http3',
    host: 'localhost',
    port: 8443,
    path: 'files/index.html',
    headers: {},
    body: null,
    errorIfErrorStatusCode: true,
  });
  
  console.log('http3:');
  console.log(clientResponse.statusCode);
  console.log(clientResponse.body);
}
*/
