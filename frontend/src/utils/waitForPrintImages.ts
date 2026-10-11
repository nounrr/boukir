/** Wait for printable images, while letting missing files finish without blocking export. */
export async function waitForPrintImages(container: HTMLElement, timeoutMs = 15000): Promise<void> {
  await Promise.all(Array.from(container.querySelectorAll('img')).map(image => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>(resolve => {
      const finish = () => {
        clearTimeout(timer);
        image.removeEventListener('load', finish);
        image.removeEventListener('error', finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
      if (image.complete) finish();
    });
  }));
}
