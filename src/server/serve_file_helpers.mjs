function serveFile_sendInternal({ clientRequest, statusCode, errorMsg, additionalHeaders }) {
  const headers = {
    ':status': statusCode,
    'content-type': 'text/plain; charset=utf-8',
    ...additionalHeaders,
  };
  
  if (clientRequest.headers[':method'] == 'HEAD') {
    clientRequest.respond(
      null,
      headers,
    );
  } else {
    clientRequest.respond(
      `Error: ${errorMsg}`,
      headers,
    );
  }
}

export async function serveFile_send400_generic({ clientRequest, processedPath, serve400, additionalHeaders }) {
  if (serve400 != null) {
    await serve400({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      clientRequest,
      statusCode: 400,
      errorMsg: `file ${JSON.stringify(processedPath)} request invalid`,
      additionalHeaders,
    });
  }
}

export async function serveFile_send400_badURL({ clientRequest, serve400, additionalHeaders }) {
  if (serve400 != null) {
    await serve400({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      clientRequest,
      statusCode: 400,
      errorMsg: `unparseable URL: ${JSON.stringify(clientRequest.pathRaw)}`,
      additionalHeaders,
    });
  }
}

export async function serveFile_send403({ clientRequest, processedPath, serve403, additionalHeaders }) {
  if (serve403 != null) {
    await serve403({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      clientRequest,
      statusCode: 403,
      errorMsg: `path ${JSON.stringify(processedPath)} leaves containing folder`,
      additionalHeaders,
    });
  }
}

export async function serveFile_send404({ clientRequest, processedPath, serve404, additionalHeaders }) {
  if (serve404 != null) {
    await serve404({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      clientRequest,
      statusCode: 404,
      errorMsg: `file ${JSON.stringify(processedPath)} not found`,
      additionalHeaders,
    });
  }
}

export async function serveFile_send405({ clientRequest, serve405, additionalHeaders }) {
  if (serve405 != null) {
    await serve405({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      clientRequest,
      statusCode: 405,
      errorMsg: `method ${JSON.stringify(clientRequest.headers[':method'])} unknown`,
      additionalHeaders,
    });
  }
}

export async function serveFile_send416({ clientRequest, processedPath, serve416, additionalHeaders }) {
  if (serve416 != null) {
    await serve416({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      clientRequest,
      statusCode: 416,
      errorMsg: `file ${JSON.stringify(processedPath)}, range ${JSON.stringify(clientRequest.headers.range)} not satisfyable`,
      additionalHeaders,
    });
  }
}

export async function serveFile_send500({ clientRequest, processedPath, serve500, additionalHeaders }) {
  if (serve500 != null) {
    await serve500({
      clientRequest,
    });
  } else {
    serveFile_sendInternal({
      clientRequest,
      statusCode: 500,
      errorMsg: `an internal server error occurred trying to access the file ${JSON.stringify(processedPath)}`,
      additionalHeaders,
    });
  }
}
