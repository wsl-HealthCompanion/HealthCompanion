import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const service = new PasswordHasherService();

  it('uses a fresh salt so equal passwords do not share a stored hash', async () => {
    const first = await service.hash('correct horse battery staple');
    const second = await service.hash('correct horse battery staple');

    expect(first).not.toBe(second);
    expect(first).toMatch(/^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(second).toMatch(/^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  });

  it('accepts the original password and rejects a different password', async () => {
    const stored = await service.hash('Admin-Only-Password');

    await expect(service.verify('Admin-Only-Password', stored)).resolves.toBe(true);
    await expect(service.verify('wrong-password', stored)).resolves.toBe(false);
  });

  it.each([
    '',
    'plaintext',
    'bcrypt$salt$value',
    'scrypt$$',
    'scrypt$not-base64!$also-not-base64!',
  ])('rejects malformed stored value %j without throwing', async (stored) => {
    await expect(service.verify('anything', stored)).resolves.toBe(false);
  });
});
