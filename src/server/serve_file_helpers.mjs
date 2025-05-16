export function serveFile_send400({ clientRequest, processedPath, serve400 }) {
  if (serve400 != null) {
    serve400({
      clientRequest,
    });
  } else {
    const headers = {
      ':status': 400,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers,
      );
    } else {
      clientRequest.respond(
        `Error: file ${JSON.stringify(processedPath)}, range ${JSON.stringify(clientRequest.headers.range)} invalid`,
        headers,
      );
    }
  }
}

export function serveFile_send404({ clientRequest, processedPath, serve404 }) {
  if (serve404 != null) {
    serve404({
      clientRequest,
    });
  } else {
    const headers = {
      ':status': 404,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers,
      );
    } else {
      clientRequest.respond(
        `Error: file ${JSON.stringify(processedPath)} not found`,
        headers,
      );
    }
  }
}
export function serveFile_send416({ clientRequest, processedPath, serve416 }) {
  if (serve416 != null) {
    serve416({
      clientRequest,
    });
  } else {
    const headers = {
      ':status': 416,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers,
      );
    } else {
      clientRequest.respond(
        `Error: file ${JSON.stringify(processedPath)}, range ${JSON.stringify(clientRequest.headers.range)} not satisfyable`,
        headers,
      );
    }
  }
}

export function serveFile_send500({ clientRequest, processedPath, serve500 }) {
  if (serve500 != null) {
    serve500({
      clientRequest,
    });
  } else {
    const headers = {
      ':status': 500,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers,
      );
    } else {
      clientRequest.respond(
        `Error: an internal server error occurred trying to access the file ${JSON.stringify(processedPath)}`,
        headers,
      );
    }
  }
}
