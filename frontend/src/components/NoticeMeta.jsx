import React from 'react';
import { LuTag as Tag, LuPaperclip as Paperclip, LuFileText as FileText } from 'react-icons/lu';

/** Category badges (above the title) */
export function NoticeCategoryBadges({ notice }) {
    const cats = Array.isArray(notice?.categories) ? notice.categories : [];
    if (cats.length === 0) return null;
    return (
        <>
            {cats.map((c) => (
                <span key={c.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                    <Tag size={12} /> {c.name}
                </span>
            ))}
        </>
    );
}

/** Attached images / files (below the message) */
export function NoticeAttachments({ notice }) {
    const files = Array.isArray(notice?.attachments) ? notice.attachments.filter((f) => f && f.url) : [];
    if (files.length === 0) return null;
    const isImage = (f) => (f.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(f.url);
    const images = files.filter(isImage);
    const others = files.filter((f) => !isImage(f));

    return (
        <div className="space-y-3">
            {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {images.map((f, i) => (
                        <a key={`${f.url}-${i}`} href={f.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                            <img src={f.url} alt={f.name || 'Attachment'} loading="lazy" className="w-full h-32 object-cover hover:scale-105 transition-transform" />
                        </a>
                    ))}
                </div>
            )}
            {others.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {others.map((f, i) => (
                        <a key={`${f.url}-${i}`} href={f.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-primary-700 dark:text-primary-300 hover:bg-primary-50 max-w-full">
                            {(f.type || '').includes('pdf') ? <FileText size={14} /> : <Paperclip size={14} />}
                            <span className="truncate">{f.name || 'Attachment'}</span>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
