import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { EducationContent } from '@/types';
import { getErrorMessage } from '@/lib/utils';
import { Plus, Loader2, X, Pencil, Trash2, Eye, EyeOff, Inbox } from 'lucide-react';

export default function EducationManagementPage() {
  const [articles, setArticles] = useState<EducationContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EducationContent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(defaultForm());

  function defaultForm() {
    return { title: '', slug: '', category: 'general', content: '', summary: '', is_published: false };
  }

  useEffect(() => { loadArticles(); }, []);

  async function loadArticles() {
    setLoading(true);
    const { data, error: err } = await supabase.from('education_content').select('*').order('sort_order');
    if (err) { setError(getErrorMessage(err, 'Unable to load articles.')); setArticles([]); }
    else setArticles((data as EducationContent[]) ?? []);
    setLoading(false);
  }

  function openEdit(a: EducationContent) {
    setEditing(a);
    setForm({ title: a.title, slug: a.slug, category: a.category, content: a.content, summary: a.summary, is_published: a.is_published });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.title || !form.content) { setError('Title and content are required'); return; }
    setSaving(true);
    const slug = form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const payload = { ...form, slug, updated_at: new Date().toISOString() };

    let err;
    if (editing) {
      ({ error: err } = await supabase.from('education_content').update(payload).eq('id', editing.id));
    } else {
      ({ error: err } = await supabase.from('education_content').insert({ ...payload, sort_order: articles.length }));
    }

    if (err) { setError(err.message); } else { setShowForm(false); setEditing(null); setForm(defaultForm()); loadArticles(); }
    setSaving(false);
  }

  async function togglePublish(a: EducationContent) {
    const { error: err } = await supabase.from('education_content').update({ is_published: !a.is_published }).eq('id', a.id);
    if (err) { setError(err.message); return; }
    loadArticles();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this article?')) return;
    const { error: err } = await supabase.from('education_content').delete().eq('id', id);
    if (err) { setError(err.message); return; }
    loadArticles();
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const categories = ['general', 'prevention', 'rabies', 'first_aid', 'pet_care', 'children_safety'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Education Content</h1>
        <button onClick={() => { setEditing(null); setForm(defaultForm()); setShowForm(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Article
        </button>
      </div>

      {error && !showForm && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{editing ? 'Edit Article' : 'New Article'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && <div className="p-3 rounded-lg bg-danger-50 text-danger-700 text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input value={form.title} onChange={set('title')} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={form.category} onChange={set('category')} className="input-field">
                  {categories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
                <input value={form.summary} onChange={set('summary')} className="input-field" placeholder="Brief description" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content * (Markdown)</label>
                <textarea value={form.content} onChange={set('content')} className="input-field h-48 font-mono text-xs" required />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_published} onChange={(e) => setForm(f => ({ ...f, is_published: e.target.checked }))} className="rounded" />
                Published
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
      ) : articles.length === 0 ? (
        <div className="text-center py-12"><Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No articles yet</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {articles.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.title}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{a.category.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${a.is_published ? 'bg-success-100 text-success-800' : 'bg-gray-100 text-gray-600'}`}>
                      {a.is_published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(a)} className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => togglePublish(a)} className="p-1.5 rounded text-gray-400 hover:text-accent-600 hover:bg-accent-50">
                        {a.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded text-gray-400 hover:text-danger-600 hover:bg-danger-50"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
