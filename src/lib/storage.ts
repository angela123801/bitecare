import { supabase } from './supabase';
import { MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES } from '@/config/constants';

export function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG, and WebP images are allowed';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File size must be less than 5MB';
  }
  return null;
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  // Returns the storage object path (avatars bucket is private; resolve a signed URL to display).
  const error = validateImage(file);
  if (error) throw new Error(error);

  const ext = file.name.split('.').pop();
  const unique = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/avatar-${unique}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true });

  if (uploadError) throw uploadError;

  // Bucket is private; store the object path. UI resolves a signed URL on read.
  return path;
}

export async function uploadBitePhoto(
  userId: string,
  reportId: string,
  file: File,
): Promise<{ path: string; url: string }> {
  const error = validateImage(file);
  if (error) throw new Error(error);

  const ext = file.name.split('.').pop();
  const unique = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const fileName = `${unique}.${ext}`;
  const path = `${userId}/${reportId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('bite-photos')
    .upload(path, file);

  if (uploadError) throw uploadError;

  const { data } = await supabase.storage
    .from('bite-photos')
    .createSignedUrl(path, 3600);

  return { path, url: data?.signedUrl ?? '' };
}

export async function getSignedUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);

  if (error) throw error;
  return data.signedUrl;
}

export async function deleteFile(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
