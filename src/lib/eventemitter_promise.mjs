export async function awaitEventOrError(eventEmitter, eventName) {
  return await new Promise((r, j) => {
    const successListener = (...params) => {
      r(params);
      eventEmitter.off('error', errorListener);
    };
    
    const errorListener = err => {
      j(err);
      eventEmitter.off(eventName, successListener);
    };
    
    eventEmitter.once('error', errorListener);
    eventEmitter.once(eventName, successListener);
  });
}
