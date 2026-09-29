import type { XmovAvatarConstructor } from './types';

let sdkPromise: Promise<XmovAvatarConstructor> | null = null;

export function loadXmovSdk(src: string): Promise<XmovAvatarConstructor> {
  if (window.XmovAvatar) return Promise.resolve(window.XmovAvatar);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<XmovAvatarConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-xmov-avatar-sdk="true"]',
    );

    const finish = () => {
      if (window.XmovAvatar) {
        resolve(window.XmovAvatar);
      } else {
        sdkPromise = null;
        reject(new Error('XmovAvatar SDK script loaded, but window.XmovAvatar is unavailable'));
      }
    };

    if (existing) {
      if (window.XmovAvatar) {
        resolve(window.XmovAvatar);
        return;
      }
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener(
        'error',
        () => {
          sdkPromise = null;
          reject(new Error('Failed to load XmovAvatar SDK'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.xmovAvatarSdk = 'true';
    script.addEventListener('load', finish, { once: true });
    script.addEventListener(
      'error',
      () => {
        sdkPromise = null;
        script.remove();
        reject(new Error(`Failed to load XmovAvatar SDK from ${src}`));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });

  return sdkPromise;
}
