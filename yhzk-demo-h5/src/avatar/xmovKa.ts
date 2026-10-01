function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildXmovKaSsml(semantic: string, text = ''): string {
  const normalized = semantic.trim();
  if (!normalized) {
    throw new Error('Xmov KA semantic is required');
  }

  return [
    '<speak>',
    '<ue4event>',
    '<type>ka</type>',
    `<data><action_semantic>${escapeXmlText(normalized)}</action_semantic></data>`,
    '</ue4event>',
    escapeXmlText(text.trim()),
    '</speak>',
  ].join('');
}
