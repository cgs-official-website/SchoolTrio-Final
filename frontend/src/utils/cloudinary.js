import { getIntegrations } from '../api/settings';
import { apiClient } from '../api/client.js';

const UPLOAD_TIMEOUT_MS = 30000;

// Rejects with a clear message instead of leaving the UI stuck on "Uploading..." forever
const withTimeout = (promise, message, ms = UPLOAD_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

// Server upload (same storage Resource Sharing uses: server Cloudinary env, else local disk)
const uploadViaBackend = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await withTimeout(
    apiClient('/api/v1/uploads', { method: 'POST', body: formData }),
    'Upload timed out. Please check that the server is running and try again.'
  );
  const url = res?.data?.fileUrl;
  if (!url) throw new Error('Upload failed: server did not return a file URL.');
  return url;
};

/**
 * Uploads a file to Cloudinary if configured, otherwise falls back to Firebase Storage.
 * @param {File} file - The file to upload
 * @param {string} schoolId - The school's ID to fetch settings
 * @param {string} firebaseFallbackPath - The storage path for Firebase if Cloudinary is not used
 * @returns {Promise<string>} The secure URL of the uploaded file
 */
export const uploadFileToCloudinaryOrFirebase = async (file, schoolId, firebaseFallbackPath) => {
  if (!file) throw new Error("No file provided for upload");
  if (!schoolId) throw new Error("schoolId is required to fetch upload configuration");

  // Enforce 3MB limit (3 * 1024 * 1024 = 3145728 bytes)
  const isAudio = file.type && file.type.startsWith('audio/');
  if (file.size > 3145728 && !isAudio) {
    throw new Error(`File "${file.name}" exceeds the 3MB size limit. Please upload a smaller file.`);
  }

  try {
    // 1. Fetch School Configuration via REST
    let cloudinaryConfig = null;
    try {
      const res = await getIntegrations();
      const data = res?.data || res;
      cloudinaryConfig = data?.apiKeys?.cloudinary;
    } catch (fetchErr) {
      console.warn("Could not fetch integrations via REST, falling back:", fetchErr);
    }

    // 2. Check if Cloudinary is configured for tenant
    const cloudName = cloudinaryConfig?.cloudName?.trim();
    const uploadPreset = cloudinaryConfig?.uploadPreset?.trim();
    const apiKey = cloudinaryConfig?.apiKey?.trim();

    if (cloudinaryConfig && typeof cloudinaryConfig === 'object' && cloudName && (uploadPreset || apiKey)) {
      console.log(`Uploading media to Cloudinary cloud '${cloudName}'...`);

      const formData = new FormData();
      formData.append("file", file);
      if (uploadPreset) {
        formData.append("upload_preset", uploadPreset);
      }
      if (apiKey) {
        formData.append("api_key", apiKey);
      }

      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`, {
        method: "POST",
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Cloudinary upload failed:", result);
        throw new Error(result.error?.message || "Failed to upload to Cloudinary");
      }

      return result.secure_url;
    }

    // 3. Server upload (uses the backend Cloudinary env, or local disk if not set)
    let serverError = null;
    try {
      return await uploadViaBackend(file);
    } catch (err) {
      serverError = err;
      console.warn("Server upload failed:", err);
    }

    // 4. Last resort: Firebase Storage (legacy)
    if (!firebaseFallbackPath) throw serverError;
    try {
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const { storage } = await import('../firebase/config');
      if (!storage) throw serverError;
      const storageRef = ref(storage, firebaseFallbackPath);
      await withTimeout(uploadBytes(storageRef, file), serverError?.message || "Upload failed.");
      return await withTimeout(getDownloadURL(storageRef), "Could not get the file URL. Please try again.");
    } catch (fbErr) {
      throw serverError || fbErr;
    }

  } catch (error) {
    console.error("Error in uploadFileToCloudinaryOrFirebase:", error);
    throw error;
  }
};

export const uploadCustomDataFiles = async (customData, schoolId, moduleName) => {
  if (!customData || typeof customData !== 'object') return customData;
  const newData = { ...customData };
  const uploadPromises = Object.entries(newData).map(async ([key, value]) => {
    if (value instanceof File) {
      const safeSchoolName = moduleName.replace(/[^a-z0-9]/gi, '_').trim();
      const safeFileName = value.name.replace(/[^a-z0-9.]/gi, '_');
      const storagePath = `CustomModules/${safeSchoolName}/${safeFileName}`;
      const url = await uploadFileToCloudinaryOrFirebase(value, schoolId, storagePath);
      return { key, url };
    }
    return null;
  });

  const results = await Promise.all(uploadPromises);
  results.forEach(res => {
    if (res) {
      newData[res.key] = res.url;
    }
  });

  return newData;
};
