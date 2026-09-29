import { describe, expect, it, vi } from 'vitest';
import { XmovAvatarProvider } from './XmovAvatarProvider';
import { buildXmovKaSsml } from './xmovKa';
import type { XmovAvatarInstance } from './types';

function injectInstance(
  provider: XmovAvatarProvider,
  instance: XmovAvatarInstance,
): void {
  (provider as unknown as { instance: XmovAvatarInstance | null }).instance = instance;
}

describe('XmovAvatarProvider.playAction', () => {
  it('sends official KA SSML through SDK speak', async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const provider = new XmovAvatarProvider();

    injectInstance(provider, {
      init: vi.fn().mockResolvedValue(undefined),
      speak,
    });

    await provider.playAction('PointingSelf', 'lab-test');

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith(
      buildXmovKaSsml('PointingSelf'),
      true,
      true,
      { client_speak_id: 'lab-test' },
    );
    expect(provider.getState()).toBe('speaking');
  });

  it('rejects when the avatar has not been initialized', async () => {
    const provider = new XmovAvatarProvider();

    await expect(provider.playAction('PointingSelf')).rejects.toThrow(
      /has not been initialized/i,
    );
  });
});
