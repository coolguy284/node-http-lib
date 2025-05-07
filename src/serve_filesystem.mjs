export async function serveFilesystem({
  clientRequest,
  fsPath,
}) {
  if (clientRequest[':method'] != 'GET' && clientRequest[':method'] != 'HEAD') {
    clientRequest.respond(
      `Method ${JSON.stringify(clientRequest[':method'])} unknown`,
      {
        ':status': 400,
        'content-type': 'text/plain; charset=utf-8',
      }
    );
  }
  
  //clientRequest.path
}
