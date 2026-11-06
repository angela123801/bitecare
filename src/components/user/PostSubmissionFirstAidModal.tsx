import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, AlertTriangle, ShieldAlert, BookOpen } from 'lucide-react';
import { ANIMAL_FIRST_AID } from '@/config/firstAidContent';
import { cn } from '@/lib/utils';

interface Props {
  /** The animal type saved on the submitted report — never an unsaved form value. */
  animalType: 'dog' | 'cat' | 'rat' | 'other';
  /** What the user typed for "Others", shown in the heading when present. */
  otherLabel?: string | null;
  onClose: () => void;
}

export default function PostSubmissionFirstAidModal({ animalType, otherLabel, onClose }: Props) {
  const guide = ANIMAL_FIRST_AID[animalType];

  // Close on Escape and lock background scrolling while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!guide) return null;

  const heading =
    animalType === 'other' && otherLabel?.trim()
      ? `${otherLabel.trim()} Bite — First Aid`
      : guide.title;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col animate-slide-up">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-gray-200 bg-danger-50 rounded-t-2xl">
          <img
            src={guide.illustration.src}
            alt={guide.illustration.alt}
            width={96}
            height={96}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover flex-shrink-0 bg-white border border-danger-200"
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">{heading}</h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">{guide.intro}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close first-aid guidance"
            className="p-1.5 rounded-lg text-gray-500 hover:bg-white/70 hover:text-gray-800 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable guidance */}
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {/* Steps with illustrations */}
          <div className="space-y-3">
            {guide.steps.map((step, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-3 rounded-xl border p-3',
                  step.avoid ? 'border-danger-200 bg-danger-50/40' : 'border-gray-100 bg-gray-50/60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                        step.avoid ? 'bg-danger-100 text-danger-700' : 'bg-primary-100 text-primary-700',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full',
                        step.avoid ? 'bg-danger-100 text-danger-700' : 'bg-success-100 text-success-700',
                      )}
                    >
                      {step.avoid ? 'Avoid this' : 'Do this'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mt-1.5">{step.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Warnings */}
          <div className="bg-warning-50 border border-warning-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-warning-600" />
              <span className="text-sm font-semibold text-warning-800">Warnings</span>
            </div>
            <ul className="space-y-1.5">
              {guide.warnings.map((w, i) => (
                <li key={i} className="text-sm text-warning-700 flex items-start gap-2">
                  <span className="text-warning-400 mt-1">•</span> {w}
                </li>
              ))}
            </ul>
          </div>

          {/* Medical safety footer */}
          <div className="bg-danger-50 border border-danger-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldAlert className="w-4 h-4 text-danger-600" />
              <span className="text-sm font-semibold text-danger-800">Important</span>
            </div>
            <p className="text-sm text-danger-700">{guide.note}</p>
            <p className="text-xs text-danger-600 mt-2">
              Emergency: 911 &middot; DOH Hotline: 1555 &middot; Bacolod City Health: (034) 708-3100
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-gray-200 flex flex-col sm:flex-row gap-3">
          <Link to="/first-aid" className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={onClose}>
            <BookOpen className="w-4 h-4" /> Open the Complete First-Aid Guide
          </Link>
          <button type="button" onClick={onClose} className="btn-secondary px-5 py-2.5">
            Back to My Report
          </button>
        </div>
      </div>
    </div>
  );
}
