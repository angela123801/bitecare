import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { FirstAidGuide, ExposureCategory } from '@/types';
import { CATEGORY_LABELS } from '@/config/constants';
import {
  Loader2,
  AlertTriangle,
  Phone,
  Heart,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const CATEGORY_OPTIONS: ExposureCategory[] = ['I', 'II', 'III'];

const CATEGORY_COLORS: Record<ExposureCategory, string> = {
  I: 'bg-success-100 text-success-800 border-success-300',
  II: 'bg-warning-100 text-warning-800 border-warning-300',
  III: 'bg-danger-100 text-danger-800 border-danger-300',
};

export default function FirstAidPage() {
  const [guides, setGuides] = useState<FirstAidGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState<ExposureCategory>('I');
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  const fetchGuides = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('first_aid_guides')
        .select('*')
        .eq('is_published', true)
        .order('sort_order', { ascending: true });

      if (fetchErr) throw fetchErr;
      setGuides((data as FirstAidGuide[]) || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load guides');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGuides();
  }, [fetchGuides]);

  const filtered = guides.filter((g) => g.wound_category === activeCategory);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-danger-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">First Aid Guide</h1>
        <p className="text-gray-500 text-sm mt-1">
          What to do when bitten by an animal — step by step
        </p>
      </div>

      {/* Emergency Banner */}
      <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 flex items-start gap-3">
        <Phone className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-danger-800">Emergency Contacts</p>
          <p className="text-sm text-danger-700 mt-0.5">
            Emergency Hotline: <strong>911</strong> • DOH Hotline:{' '}
            <strong>1555</strong> • Bacolod City Health:{' '}
            <strong>(034) 708-3100</strong>
          </p>
        </div>
      </div>

      {/* Category Selector */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Select wound category:</p>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                setExpandedGuide(null);
              }}
              className={cn(
                'p-3 rounded-lg border-2 text-center transition-all',
                activeCategory === cat
                  ? CATEGORY_COLORS[cat]
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              )}
            >
              <span className="block text-lg font-bold">Category {cat}</span>
              <span className="block text-xs mt-0.5">
                {cat === 'I' ? 'Low risk' : cat === 'II' ? 'Moderate risk' : 'High risk'}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">{CATEGORY_LABELS[activeCategory]}</p>
      </div>

      {/* Guides */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Heart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No guides available for this category</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((guide) => {
            const isExpanded = expandedGuide === guide.id;
            return (
              <div key={guide.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setExpandedGuide(isExpanded ? null : guide.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <h3 className="font-semibold text-gray-900">{guide.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {guide.animal_type} • {guide.steps.length} steps
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t px-4 pb-4 space-y-4">
                    {/* Steps */}
                    <div className="pt-4 space-y-3">
                      {guide.steps.map((step, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                            <span className="text-sm font-bold text-primary-700">{i + 1}</span>
                          </div>
                          <div className="pt-1">
                            <p className="text-sm font-medium text-gray-900">{step.title}</p>
                            <p className="text-sm text-gray-600 mt-0.5">{step.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Warnings */}
                    {guide.warnings.length > 0 && (
                      <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-warning-600" />
                          <span className="text-sm font-semibold text-warning-800">Warnings</span>
                        </div>
                        <ul className="space-y-1">
                          {guide.warnings.map((w, i) => (
                            <li key={i} className="text-sm text-warning-700 flex items-start gap-2">
                              <span className="text-warning-400 mt-1">•</span> {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* When to Seek Help */}
                    {guide.when_to_seek_help && (
                      <div className="bg-danger-50 border border-danger-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <ShieldAlert className="w-4 h-4 text-danger-600" />
                          <span className="text-sm font-semibold text-danger-800">When to Seek Help</span>
                        </div>
                        <p className="text-sm text-danger-700">{guide.when_to_seek_help}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
