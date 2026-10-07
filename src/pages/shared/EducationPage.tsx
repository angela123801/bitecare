import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate, cn, getErrorMessage } from '@/lib/utils';
import type { EducationContent } from '@/types';
import { educationVisual } from '@/lib/educationMedia';
import { BookOpen, ArrowLeft, Loader2, Search } from 'lucide-react';

export default function EducationPage() {
  const [articles, setArticles] = useState<EducationContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<EducationContent | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('education_content')
        .select('*')
        .eq('is_published', true)
        .order('sort_order', { ascending: true });

      if (fetchErr) throw fetchErr;
      setArticles((data as EducationContent[]) || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load articles'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const categories = ['all', ...Array.from(new Set(articles.map((a) => a.category)))];

  const filtered = articles.filter((a) => {
    const matchCat = activeCategory === 'all' || a.category === activeCategory;
    const matchSearch =
      !searchQuery ||
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.summary || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

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

  // Article Detail View
  if (selectedArticle) {
    const visual = educationVisual(selectedArticle);
    const heroSrc = selectedArticle.cover_image_url || visual.src;
    const heroAlt = selectedArticle.cover_image_url ? selectedArticle.title : visual.alt;
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => setSelectedArticle(null)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to articles
        </button>

        <img
          src={heroSrc}
          alt={heroAlt}
          width={900}
          height={502}
          className="w-full h-48 sm:h-64 lg:h-72 object-cover rounded-xl mb-6 bg-primary-50"
        />

        <div className="space-y-4">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
            {selectedArticle.category}
          </span>
          <h1 className="text-3xl font-bold text-gray-900">{selectedArticle.title}</h1>
          <p className="text-gray-500 text-sm">{formatDate(selectedArticle.created_at)}</p>
          <hr />
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
            {selectedArticle.content}
          </div>
        </div>
      </div>
    );
  }

  // Articles List View
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Education</h1>
        <p className="text-gray-500 text-sm mt-1">
          Learn about animal bite prevention, treatment, and rabies awareness
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search articles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm"
        />
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize',
              activeCategory === cat
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No articles found</p>
          <p className="text-gray-400 text-sm mt-1">Try a different search or category</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((article) => {
            const visual = educationVisual(article);
            return (
            <button
              key={article.id}
              onClick={() => setSelectedArticle(article)}
              className="text-left bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md hover:border-primary-200 transition-all group"
            >
              <img
                src={article.cover_image_url || visual.src}
                alt={article.cover_image_url ? article.title : visual.alt}
                width={900}
                height={502}
                loading="lazy"
                decoding="async"
                className="w-full h-40 object-cover bg-primary-50 group-hover:scale-105 transition-transform"
              />
              <div className="p-4 space-y-2">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 capitalize">
                  {article.category}
                </span>
                <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 group-hover:text-primary-700 transition-colors">
                  {article.title}
                </h3>
                <p className="text-gray-500 text-xs line-clamp-2">{article.summary}</p>
              </div>
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
