export async function streamToBuffer(stream) {
  return await new Promise((r, j) => {
    let bufs = [];
    
    stream.on('data', data => {
      bufs.push(data);
    });
    
    stream.once('end', () => {
      r(Buffer.concat(bufs));
    });
    
    stream.once('error', err => {
      j(err);
    });
  });
}
