import { NotificationsService } from '../notifications/notifications.service';
/** Unknown provider acceptance must never become an automatic resend. */
export async function sendGuestEmail(mail: NotificationsService, body: { to: string[]; subject: string; html: string }) {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([mail.sendEmail(body),new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined),30000); })]); }
  finally { if (timer) clearTimeout(timer); }
}
