export async function awaitEventOrError(eventEmitter, eventNames) {
  return await new Promise((r, j) => {
    let successListeners = new Map();
    
    const successListener = (eventName, ...args) => {
      r({
        eventName,
        args,
      });
      
      eventEmitter.off('error', errorListener);
      
      for (const [ successListenerEventName, singleSuccessListener ] of successListeners) {
        if (eventName != successListenerEventName) {
          eventEmitter.off(successListenerEventName, singleSuccessListener);
        }
      }
    };
    
    const errorListener = err => {
      j(err);
      
      for (const [ successListenerEventName, singleSuccessListener ] of successListeners) {
        eventEmitter.off(successListenerEventName, singleSuccessListener);
      }
    };
    
    eventEmitter.once('error', errorListener);
    
    for (const eventName of eventNames) {
      const singleSuccessListener = successListener.bind(null, eventName);
      
      successListeners.set(eventName, singleSuccessListener);
      eventEmitter.once(eventName, singleSuccessListener);
    }
  });
}
