import { supabase } from '@/lib/supabase';
import type { NotificationType } from '@/types';

interface NotifyPayload {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  referenceType?: string | null;
  referenceId?: string | null;
}

/**
 * Creates an in-app notification for a user.
 *
 * Best-effort: a notification failure must never break the primary action
 * (creating a schedule, updating an appointment, etc.), so the error is
 * logged and swallowed. The database policy limits who may notify whom.
 */
export async function notifyUser({
  userId,
  title,
  message,
  type = 'info',
  referenceType = null,
  referenceId = null,
}: NotifyPayload): Promise<void> {
  const { error } = await supabase.rpc('create_notification', {
    p_user_id: userId,
    p_title: title,
    p_message: message,
    p_type: type,
    p_ref_type: referenceType,
    p_ref_id: referenceId,
  });
  if (error) {
    console.error('Notification could not be created:', error.message);
  }
}

/**
 * Looks up the reporter of a bite report so staff actions can notify the
 * patient-facing user who filed it.
 */
export async function getReportReporterId(reportId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('bite_reports')
    .select('reporter_id')
    .eq('id', reportId)
    .maybeSingle();
  if (error) {
    console.error('Could not resolve report reporter:', error.message);
    return null;
  }
  return data?.reporter_id ?? null;
}
