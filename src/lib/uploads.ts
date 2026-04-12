import { supabase } from '@/lib/supabase'

const BUCKET = 'room-images'
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface UploadResult {
  url: string
  path: string
}

/**
 * Validate an image file before upload.
 * Returns an error message string if invalid, null if valid.
 */
export function validateImage(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Unsupported image format. Please upload JPG, PNG, or WebP.'
  }
  if (file.size > MAX_SIZE_BYTES) {
    return 'Image is too large. Max size is 10 MB.'
  }
  return null
}

/**
 * Upload an image to Supabase Storage.
 * Returns the public URL and storage path.
 */
export async function uploadImage(
  file: File,
  roomSlug: 'ari' | 'eli'
): Promise<UploadResult> {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const uuid = crypto.randomUUID()
  const path = `${roomSlug}/${year}/${month}/${uuid}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
    })

  if (error) {
    throw new Error(`Upload failed: ${error.message}`)
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path)

  return {
    url: urlData.publicUrl,
    path,
  }
}
