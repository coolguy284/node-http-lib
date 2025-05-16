function serveFile_sendInternal({ statusCode, errorMsg }) {
  const headers = {
    ':status': statusCode,
    'content-type': 'text/plain; charset=utf-8',
  };
  
  if (clientRequest.headers[':method'] == 'HEAD') {
    clientRequest.respond(
      '',
      headers,
    );
  } else {
    clientRequest.respond(
      `Error: ${errorMsg}`,
      headers,
    );
  }
}

export function serveFile_send400_generic({ clientRequest, processedPath, serve400 }) {
  if (serve400 != null) {
    serve400({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      statusCode: 400,
      errorMsg: `file ${JSON.stringify(processedPath)} request invalid`,
    });
  }
}

export function serveFile_send400_badURL({ clientRequest, serve400 }) {
  if (serve400 != null) {
    serve400({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      statusCode: 400,
      errorMsg: `unparseable URL: ${JSON.stringify(clientRequest.pathRaw)}`,
    });
  }
}

export function serveFile_send403({ clientRequest, processedPath, serve403 }) {
  if (serve403 != null) {
    serve403({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      statusCode: 403,
      errorMsg: `path ${JSON.stringify(processedPath)} leaves containing folder`,
    });
  }
}

export function serveFile_send404({ clientRequest, processedPath, serve404 }) {
  if (serve404 != null) {
    serve404({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      statusCode: 404,
      errorMsg: `file ${JSON.stringify(processedPath)} not found`,
    });
  }
}

export function serveFile_send405({ clientRequest, serve405 }) {
  if (serve405 != null) {
    serve405({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      statusCode: 405,
      errorMsg: `method ${JSON.stringify(clientRequest.headers[':method'])} unknown`,
    });
  }
}

export function serveFile_send416({ clientRequest, processedPath, serve416 }) {
  if (serve416 != null) {
    serve416({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      statusCode: 416,
      errorMsg: `file ${JSON.stringify(processedPath)}, range ${JSON.stringify(clientRequest.headers.range)} not satisfyable`,
    });
  }
}

export function serveFile_send500({ clientRequest, processedPath, serve500 }) {
  if (serve500 != null) {
    serve500({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      statusCode: 500,
      errorMsg: `an internal server error occurred trying to access the file ${JSON.stringify(processedPath)}`,
    });
  }
}
