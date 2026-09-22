import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { uploadAvatar, getSignedUrl } from '@/lib/storage';
import { formatDate, getInitials, cn, getErrorMessage } from '@/lib/utils';
import { ROLE_LABELS } from '@/config/constants';
import {
  Camera,
  Loader2,
  Pencil,
  Save,
  X,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';

export default function ProfilePage() {
  const { user, profile, updateProfile, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    address: '',
    city: '',
    date_of_birth: '',
  });

  useEffect(() => {
    let active = true;
    if (profile?.avatar_url) {
      getSignedUrl('avatars', profile.avatar_url)
        .then((url) => { if (active) setAvatarUrl(url); })
        .catch((err) => { if (active) { setAvatarUrl(''); console.error('Avatar load failed:', getErrorMessage(err)); } });
    } else {
      setAvatarUrl('');
    }
    return () => { active = false; };
  }, [profile?.avatar_url]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!profile || !user) {
    return (
      <div className="text-center py-20 text-gray-500">
        <User className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>Unable to load profile.</p>
      </div>
    );
  }

  const startEditing = () => {
    setForm({
      full_name: profile.full_name || '',
      phone: profile.phone || '',
      address: profile.address || '',
      city: profile.city || '',
      date_of_birth: profile.date_of_birth || '',
    });
    setEditing(true);
    setError('');
    setSuccess('');
  };

  const cancelEditing = () => {
    setEditing(false);
    setError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setError('Full name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateProfile({ ...form, date_of_birth: form.date_of_birth || null });
      setEditing(false);
      setSuccess('Profile updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadAvatar(user.id, file);
      await updateProfile({ avatar_url: url });
      setSuccess('Avatar updated');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to upload avatar'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fieldClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

      {error && (
        <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-lg text-sm">
          <CheckCircle className="w-4 h-4" /> {success}
        </div>
      )}

      {/* Avatar & Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative group">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={profile.full_name}
                className="w-24 h-24 rounded-full object-cover ring-4 ring-primary-100"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center ring-4 ring-primary-50">
                <span className="text-2xl font-bold text-primary-700">
                  {getInitials(profile.full_name || profile.email)}
                </span>
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-primary-700 transition-colors"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-semibold text-gray-900">
              {profile.full_name || 'No name set'}
            </h2>
            <p className="text-gray-500 text-sm">{profile.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2 justify-center sm:justify-start">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                <ShieldCheck className="w-3 h-3" />
                {ROLE_LABELS[profile.role]}
              </span>
              <span
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-xs font-medium',
                  profile.is_active ? 'bg-success-100 text-success-800' : 'bg-danger-100 text-danger-800'
                )}
              >
                {profile.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          {!editing && (
            <button
              onClick={startEditing}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* Profile Details / Edit Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <h3 className="font-semibold text-gray-900 mb-2">Edit Profile</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input className={fieldClass} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input className={fieldClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input className={fieldClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input className={fieldClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                <input type="date" className={fieldClass} value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={cancelEditing} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium">
                <X className="w-4 h-4" /> Cancel
              </button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 mb-2">Personal Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow icon={<User className="w-4 h-4" />} label="Full Name" value={profile.full_name} />
              <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={profile.email} />
              <InfoRow icon={<Phone className="w-4 h-4" />} label="Phone" value={profile.phone} />
              <InfoRow icon={<Calendar className="w-4 h-4" />} label="Date of Birth" value={profile.date_of_birth ? formatDate(profile.date_of_birth) : '—'} />
              <InfoRow icon={<MapPin className="w-4 h-4" />} label="Address" value={profile.address} />
              <InfoRow icon={<MapPin className="w-4 h-4" />} label="City" value={profile.city} />
            </div>
            <hr className="my-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Member since</span>
                <p className="font-medium text-gray-900">{formatDate(profile.created_at)}</p>
              </div>
              <div>
                <span className="text-gray-500">Last updated</span>
                <p className="font-medium text-gray-900">{formatDate(profile.updated_at)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-gray-400">{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value || '—'}</p>
      </div>
    </div>
  );
}
