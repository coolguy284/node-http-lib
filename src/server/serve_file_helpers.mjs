function serveFile_sendInternal({ serverRequest, statusCode, errorMsg, additionalHeaders }) {
  const headers = {
    ':status': statusCode,
    'content-type': 'text/plain; charset=utf-8',
    ...additionalHeaders,
  };
  
  if (serverRequest.headers[':method'] == 'HEAD') {
    serverRequest.respond(
      null,
      headers,
    );
  } else {
    serverRequest.respond(
      `Error: ${errorMsg}`,
      headers,
    );
  }
}

export async function serveFile_send400_generic({
  serverRequest,
  processedRequestPath,
  serve400,
  additionalHeaders,
  errorInfo = null,
}) {
  if (serve400 != null) {
    await serve400({
      serverRequest,
      errorInfo,
    });
  } else {
    serveFile_sendInternal({
      serverRequest,
      statusCode: 400,
      errorMsg:
        `file ${JSON.stringify(processedRequestPath)} request invalid` +
        (
          errorInfo != null ?
            `: ${errorInfo}` :
            ''
        ),
      additionalHeaders,
    });
  }
}

export async function serveFile_send400_badURL({ serverRequest, serve400, additionalHeaders }) {
  if (serve400 != null) {
    await serve400({
      serverRequest,
    });
  } else {
    serveFile_sendInternal({
      serverRequest,
      statusCode: 400,
      errorMsg: `unparseable URL: ${JSON.stringify(serverRequest.pathRaw)}`,
      additionalHeaders,
    });
  }
}

export async function serveFile_send403({ serverRequest, processedRequestPath, serve403, additionalHeaders }) {
  if (serve403 != null) {
    await serve403({
      serverRequest,
    });
  } else {
    serveFile_sendInternal({
      serverRequest,
      statusCode: 403,
      errorMsg: `path ${JSON.stringify(processedRequestPath)} leaves containing folder`,
      additionalHeaders,
    });
  }
}

export async function serveFile_send404({ serverRequest, processedRequestPath, serve404, additionalHeaders }) {
  if (serve404 != null) {
    await serve404({
      serverRequest,
    });
  } else {
    serveFile_sendInternal({
      serverRequest,
      statusCode: 404,
      errorMsg: `file ${JSON.stringify(processedRequestPath)} not found`,
      additionalHeaders,
    });
  }
}

export async function serveFile_send405({ serverRequest, serve405, additionalHeaders }) {
  if (serve405 != null) {
    await serve405({
      serverRequest,
    });
  } else {
    serveFile_sendInternal({
      serverRequest,
      statusCode: 405,
      errorMsg: `method ${JSON.stringify(serverRequest.headers[':method'])} unknown`,
      additionalHeaders,
    });
  }
}

export async function serveFile_send416({ serverRequest, processedRequestPath, serve416, additionalHeaders }) {
  if (serve416 != null) {
    await serve416({
      serverRequest,
    });
  } else {
    serveFile_sendInternal({
      serverRequest,
      statusCode: 416,
      errorMsg: `file ${JSON.stringify(processedRequestPath)}, range ${JSON.stringify(serverRequest.headers.range)} not satisfyable`,
      additionalHeaders,
    });
  }
}

export async function serveFile_send500({ serverRequest, processedRequestPath, serve500, additionalHeaders }) {
  if (serve500 != null) {
    await serve500({
      serverRequest,
    });
  } else {
    serveFile_sendInternal({
      serverRequest,
      statusCode: 500,
      errorMsg: `an internal server error occurred trying to access the file ${JSON.stringify(processedRequestPath)}`,
      additionalHeaders,
    });
  }
}
