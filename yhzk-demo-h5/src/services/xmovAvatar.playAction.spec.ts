import { afterEach, describe, expect, it, vi } from 'vitest';
import type { XmovAvatarProvider } from '../avatar/XmovAvatarProvider';
import { xmovAvatar } from './xmovAvatar';

function fakeProvider(playAction = vi.fn().mockResolvedValue(undefined)) {
  return {
    provider: { playAction } as unknown as XmovAvatarProvider,
    playAction,
  };
}

let detach: (() => void) | null = null;

afterEach(() => {
  detach?.();
  detach = null;
});

describe('xmovAvatar.playAction', () => {
  it('forwards a real semantic to the ready provider', async () => {
    const { provider, playAction } = fakeProvider();
    detach = xmovAvatar.attach(provider);
    xmovAvatar.markReady(provider);

    await xmovAvatar.playAction('PointingSelf');

    expect(playAction).toHaveBeenCalledTimes(1);
    expect(playAction).toHaveBeenCalledWith('PointingSelf');
  });

  it('rejects when an attached provider is not ready', async () => {
    const { provider, playAction } = fakeProvider();
    detach = xmovAvatar.attach(provider);

    await expect(xmovAvatar.playAction('PointingSelf')).rejects.toThrow(
      /not ready/i,
    );
    expect(playAction).not.toHaveBeenCalled();
  });

  it('rejects when no provider is attached', async () => {
    await expect(xmovAvatar.playAction('PointingSelf')).rejects.toThrow(
      /not ready/i,
    );
  });

  it('propagates provider playback failures', async () => {
    const failure = new Error('SDK rejected KA');
    const { provider } = fakeProvider(
      vi.fn().mockRejectedValue(failure),
    );
    detach = xmovAvatar.attach(provider);
    xmovAvatar.markReady(provider);

    await expect(xmovAvatar.playAction('PointingSelf')).rejects.toBe(failure);
  });
});
