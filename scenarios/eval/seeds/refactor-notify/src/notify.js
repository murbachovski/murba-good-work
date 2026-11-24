export function notify(user, message, opts = {}) {
  const channel = opts.channel || user.preferred || 'email';
  if (channel === 'email') {
    if (!user.email) throw new Error('no email for ' + user.name);
    const body = message.trim();
    const subject = opts.subject || body.slice(0, 20);
    return { channel: 'email', to: user.email, subject, body: body + '\n-- sent by app' };
  } else if (channel === 'sms') {
    if (!user.phone) throw new Error('no phone for ' + user.name);
    const to = user.phone.replace(/\D/g, '');
    const body = message.trim();
    const text = body.length > 70 ? body.slice(0, 67) + '...' : body;
    return { channel: 'sms', to, body: text };
  } else if (channel === 'push') {
    if (!user.deviceToken) throw new Error('no device for ' + user.name);
    const body = message.trim();
    return { channel: 'push', to: user.deviceToken, title: opts.subject || user.name, body: body.slice(0, 100) };
  } else {
    throw new Error('unknown channel: ' + channel);
  }
}
