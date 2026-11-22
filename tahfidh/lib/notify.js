// الإشعارات داخل التطبيق
export function makeNotifier(pool) {
  // يرسل إشعارًا لقائمة من المستخدمين (أرقام)، أو لنتيجة استعلام SQL يُرجع عمود id
  return async function notify(target, { kind, title, body = null, link = null }) {
    // نص مختصر بلا علامات التنسيق (# - > **)
    const short = body
      ? String(body).replace(/^\s*(#{1,2}|[-•*]|>)\s+/gm, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) || null
      : null;
    if (Array.isArray(target)) {
      if (!target.length) return;
      await pool.query(
        `INSERT INTO notifications (user_id, kind, title, body, link) SELECT u, $2, $3, $4, $5 FROM unnest($1::int[]) AS u`,
        [target, kind, title, short, link]
      );
      return;
    }
    const { sql, params = [] } = target;
    const n = params.length;
    await pool.query(
      `INSERT INTO notifications (user_id, kind, title, body, link) SELECT t.id, $${n + 1}, $${n + 2}, $${n + 3}, $${n + 4} FROM (${sql}) t`,
      [...params, kind, title, short, link]
    );
  };
}

export function registerNotificationRoutes({ route, pool, all, one, ANY }) {
  route('GET', '/api/notifications', ANY, async ({ user }) => ({
    notifications: await all(
      `SELECT id, kind, title, body, link, created_at, read_at IS NOT NULL AS read FROM notifications
       WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 60`,
      [user.id]
    ),
  }));
  route('GET', '/api/notifications/count', ANY, async ({ user }) => ({
    unread: (await one('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [user.id])).n,
  }));
  route('POST', '/api/notifications/read', ANY, async ({ user }) => {
    await pool.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [user.id]);
    // نحتفظ بآخر 200 إشعار فقط لكل مستخدم
    await pool.query(
      `DELETE FROM notifications WHERE user_id = $1 AND id NOT IN (SELECT id FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 200)`,
      [user.id]
    );
    return { ok: true };
  });
  route('DELETE', '/api/notifications', ANY, async ({ user }) => {
    await pool.query('DELETE FROM notifications WHERE user_id = $1', [user.id]);
    return { ok: true };
  });
}
