import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ROLE_LABELS } from '@/config/constants';
import { formatDate, getErrorMessage } from '@/lib/utils';
import type { AccountRecoveryRequest, MissingAccount, UserRole } from '@/types';
import { AlertTriangle, Loader2, ShieldCheck, ShieldX, X } from 'lucide-react';

interface Props {
  account: MissingAccount;
  request: AccountRecoveryRequest | null;
  canApprove: boolean;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Confirmation step for an account recovery. No account is created, deleted or
 * modified here: the administrator records the outcome of a manual identity
 * check, which is written to the recovery trail and the audit log.
 */
export default function RecoveryReviewModal({ account, request, canApprove, onClose, onDone }: Props) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'restored' | 'rejected' | 'open' | null>(null);
  const [error, setError] = useState('');

  const evidenceCount = Array.isArray(account.evidence) ? account.evidence.length : 0;

  async function openRequest(): Promise<string | null> {
    const { data, error: e } = await supabase.rpc('request_account_recovery', {
      p_entity_id: account.entityId,
      p_display_name: account.displayName,
      p_email: account.email ?? '',
      p_previous_role: account.role,
    });
    if (e) { setError(getErrorMessage(e, 'Unable to open a recovery request.')); return null; }
    return data as string;
  }

  async function handleOpenOnly() {
    setBusy('open');
    setError('');
    const id = await openRequest();
    setBusy(null);
    if (id) onDone();
  }

  async function handleReview(status: 'restored' | 'rejected') {
    setBusy(status);
    setError('');
    let requestId = request?.id ?? null;
    if (!requestId) requestId = await openRequest();
    if (!requestId) { setBusy(null); return; }
    const { error: e } = await supabase.rpc('review_account_recovery', {
      p_request_id: requestId,
      p_status: status,
      p_reason: note.trim(),
    });
    setBusy(null);
    if (e) { setError(getErrorMessage(e, 'Unable to record the recovery outcome.')); return; }
    onDone();
  }

  const alreadyReviewed = request?.status === 'restored' || request?.status === 'rejected';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-full bg-warning-100 text-warning-700 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Review account recovery</h2>
              <p className="text-sm text-gray-500 mt-0.5">Confirm the person's identity before deciding.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Recorded name</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{account.displayName}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Recorded role</dt>
              <dd className="font-medium text-gray-900 mt-0.5">
                {ROLE_LABELS[account.role as UserRole] ?? account.role}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Recorded email</dt>
              <dd className="font-medium text-gray-900 mt-0.5 break-all">{account.email ?? 'Not recorded'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Last seen in the audit trail</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{formatDate(account.lastSeen)}</dd>
            </div>
          </dl>

          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-800">What this action does</p>
            <p className="mt-1">
              It records your decision on the recovery trail and in the audit log. It does not create, delete or
              change any account, and it never sets or reveals a password. The person's original user ID cannot be
              reissued once the sign-in record is gone, so a restored identity is reconnected by re-registering them
              with the verified details, then re-linking their records.
            </p>
            <p className="mt-2 text-gray-500">
              {evidenceCount} audit {evidenceCount === 1 ? 'entry' : 'entries'} back this account.
            </p>
          </div>

          {alreadyReviewed ? (
            <div className="rounded-xl bg-primary-50 border border-primary-200 p-4 text-sm text-primary-800">
              This request was already marked <span className="font-semibold">{request?.status}</span>
              {request?.reviewed_at ? ` on ${formatDate(request.reviewed_at)}` : ''}.
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Verification note {canApprove ? '(recommended)' : ''}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={400}
                placeholder="How was the person's identity verified, and what records were reconnected?"
                className="input-field resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Do not write passwords or one-time codes here.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-danger-50 border border-danger-200 p-3 text-sm text-danger-700">{error}</div>
          )}

          {!canApprove && !alreadyReviewed && (
            <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm text-warning-800 flex gap-2">
              <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                You can open the recovery request for review. Only a Super Admin can approve the outcome.
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 px-6 py-4 border-t border-gray-100 sm:justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          {alreadyReviewed ? (
            <button onClick={onDone} className="btn-primary">Close</button>
          ) : canApprove ? (
            <>
              <button
                onClick={() => handleReview('rejected')}
                disabled={busy !== null}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-danger-300 text-danger-700 font-medium hover:bg-danger-50 disabled:opacity-60"
              >
                {busy === 'rejected' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldX className="w-4 h-4" />}
                Cannot recover
              </button>
              <button
                onClick={() => handleReview('restored')}
                disabled={busy !== null}
                className="btn-primary inline-flex items-center justify-center gap-2"
              >
                {busy === 'restored' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Confirm identity
              </button>
            </>
          ) : (
            <button
              onClick={handleOpenOnly}
              disabled={busy !== null}
              className="btn-primary inline-flex items-center justify-center gap-2"
            >
              {busy === 'open' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Open recovery request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
