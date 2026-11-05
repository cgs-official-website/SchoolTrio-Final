import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { LuPaperclip as Paperclip, LuX as X, LuFileText as FileText } from 'react-icons/lu';
import { uploadFileToCloudinaryOrFirebase } from '../utils/cloudinary';

export const MAX_NOTICE_FILES = 5;
const ACCEPT = 'image/*,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

/**
 * Optional media / document uploader for notices.
 * Files are uploaded as soon as they are chosen (Cloudinary or Firebase, 3 MB limit per file)
 * and only { name, url, size, type } is stored with the notice.
 *
 * Props:
 *  files:     Array<{ name, url, size?, type? }>
 *  onChange:  (files) => void
 *  schoolId:  string
 *  onBusyChange?: (uploading: boolean) => void   - lets the form disable its submit button
 */
export default function NoticeAttachmentPicker({ files = [], onChange, schoolId, onBusyChange, disabled = false }) {
    const inputRef = useRef(null);
    const [uploading, setUploading] = useState(false);

    const setBusy = (v) => {
        setUploading(v);
        if (onBusyChange) onBusyChange(v);
    };

    const handlePick = async (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = '';
        if (picked.length === 0) return;

        const room = MAX_NOTICE_FILES - files.length;
        if (room <= 0) {
            toast.error(`You can attach up to ${MAX_NOTICE_FILES} files.`);
            return;
        }
        const batch = picked.slice(0, room);
        if (picked.length > room) toast.error(`Only ${MAX_NOTICE_FILES} files allowed - extra files were skipped.`);

        setBusy(true);
        const uploaded = [];
        for (const file of batch) {
            try {
                const url = await uploadFileToCloudinaryOrFirebase(file, schoolId, `notices/${schoolId}/${Date.now()}_${file.name}`);
                uploaded.push({ name: file.name, url, size: file.size, type: file.type || '' });
            } catch (err) {
                toast.error(err?.message || `Could not upload ${file.name}`);
            }
        }
        setBusy(false);
        if (uploaded.length > 0) onChange([...files, ...uploaded]);
    };

    const remove = (idx) => onChange(files.filter((_, i) => i !== idx));

    const isImage = (f) => (f.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(f.url || '');

    return (
        <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Attachments <span className="text-slate-400 font-normal">(optional)</span>
            </label>

            <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={handlePick} disabled={disabled || uploading} />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || uploading || files.length >= MAX_NOTICE_FILES}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-500 dark:text-slate-300 hover:border-primary-400 hover:text-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {uploading ? (
                    <><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" /> Uploading...</>
                ) : (
                    <><Paperclip size={16} /> Add images, PDF or documents (max {MAX_NOTICE_FILES}, 3 MB each)</>
                )}
            </button>

            {files.length > 0 && (
                <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {files.map((f, idx) => (
                        <li key={`${f.url}-${idx}`} className="flex items-center gap-3 p-2 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                            {isImage(f) ? (
                                <img src={f.url} alt={f.name} className="h-10 w-10 rounded-lg object-cover shrink-0" />
                            ) : (
                                <div className="h-10 w-10 rounded-lg bg-primary-50 dark:bg-slate-700 flex items-center justify-center shrink-0">
                                    <FileText size={18} className="text-primary-600" />
                                </div>
                            )}
                            <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{f.name}</span>
                            <button type="button" onClick={() => remove(idx)} className="text-slate-400 hover:text-red-500" aria-label={`Remove ${f.name}`}>
                                <X size={16} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
