// Share initialization across concurrent requests and retain successful results.
// Retry after failures instead of keeping a rejected promise forever.
export function initializeOnce(operation) {
  let pending;
  return function initialize() {
    if (!pending) {
      pending = Promise.resolve().then(operation).catch(error => {
        pending = undefined;
        throw error;
      });
    }
    return pending;
  };
}
