import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { LuFolderDown, LuSearch, LuFileText, LuLink, LuVideo, LuImage, LuDownload, LuExternalLink, LuRefreshCw } from 'react-icons/lu';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { listStudentResources } from '../../api/academic-resources';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { formatClassSection } from '../../utils/classSorting';

const TABS = ['all', 'document', 'video', 'link', 'image'];

const typeIcon = (type) => {
    switch ((type || '').toLowerCase()) {
        case 'video': return <LuVideo className="text-rose-500" size={22} />;
        case 'link': return <LuLink className="text-sky-500" size={22} />;
        case 'image': return <LuImage className="text-emerald-500" size={22} />;
        default: return <LuFileText className="text-primary-600" size={22} />;
    }
};

/**
 * Parent portal: resources the teachers shared with the active child's class + section.
 */
export default function ParentResources() {
    const { userProfile } = useAuth();
    const outletContext = useOutletContext();
    const studentId = outletContext?.activeStudentId || userProfile?.linkedStudentId;

    const [resources, setResources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const currentStudentRef = useRef(studentId);

    const fetchResources = useCallback(async (targetStudentId, { silent = false } = {}) => {
        if (!targetStudentId) return;
        if (!silent) setLoading(true);
        try {
            let all = [];
            let page = 1;
            let totalPages = 1;
            do {
                const res = await listStudentResources(targetStudentId, { page, limit: 100 });
                all = all.concat(Array.isArray(res?.data) ? res.data : []);
                totalPages = res?.pagination?.totalPages || 1;
                page += 1;
            } while (page <= totalPages && page <= 20);
            if (currentStudentRef.current === targetStudentId) setResources(all);
        } catch (err) {
            console.error('[ParentResources] failed to load resources:', err);
            if (currentStudentRef.current === targetStudentId) {
                toast.error(err?.message || 'Failed to load resources.');
                setResources([]);
            }
        } finally {
            if (currentStudentRef.current === targetStudentId) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        currentStudentRef.current = studentId;
        if (!studentId) {
            setLoading(false);
            setResources([]);
            return;
        }
        fetchResources(studentId);
    }, [studentId, fetchResources]);

    const handleLiveRefresh = useCallback(() => {
        if (studentId) fetchResources(studentId, { silent: true });
    }, [studentId, fetchResources]);
    useLiveDataRefresh(handleLiveRefresh, [handleLiveRefresh], 'resources');

    // Admin/teacher shares from another browser or device: poll quietly + refresh when the tab regains focus
    useEffect(() => {
        if (!studentId) return undefined;
        const refreshIfVisible = () => {
            if (document.visibilityState === 'visible') fetchResources(studentId, { silent: true });
        };
        const timer = setInterval(refreshIfVisible, 30000);
        document.addEventListener('visibilitychange', refreshIfVisible);
        window.addEventListener('focus', refreshIfVisible);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', refreshIfVisible);
            window.removeEventListener('focus', refreshIfVisible);
        };
    }, [studentId, fetchResources]);

    const term = searchTerm.trim().toLowerCase();
    const filtered = resources.filter(r => {
        const type = (r.type || 'document').toLowerCase();
        if (activeTab !== 'all' && type !== activeTab) return false;
        if (!term) return true;
        return [r.title, r.subjectName, r.description, r.uploaderName, r.type]
            .some(v => String(v || '').toLowerCase().includes(term));
    });

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <LuFolderDown className="text-primary-600" /> Resources
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Study materials, notes and links shared by your child's teachers.</p>
                </div>
                <button
                    type="button"
                    onClick={() => { setRefreshing(true); fetchResources(studentId, { silent: true }); }}
                    disabled={!studentId || refreshing}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                    <LuRefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 px-6 pt-4 overflow-x-auto">
                    {TABS.map(tab => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 font-bold text-sm border-b-2 capitalize whitespace-nowrap transition-colors ${activeTab === tab ? 'border-primary-600 text-primary-700 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        >
                            {tab === 'all' ? 'All Files' : `${tab}s`}
                        </button>
                    ))}
                </div>

                <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                    <div className="relative max-w-md">
                        <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Search resources..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm font-medium"
                        />
                    </div>
                </div>

                <div className="p-6">
                    {!studentId ? (
                        <p className="text-center text-slate-500 py-12">Select a child to see the resources shared with their class.</p>
                    ) : loading ? (
                        <div className="flex justify-center py-16">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16">
                            <LuFolderDown className="mx-auto text-slate-300 mb-3" size={40} />
                            <p className="font-bold text-slate-700 dark:text-slate-200">No resources yet</p>
                            <p className="text-sm text-slate-500 mt-1">Resources teachers share with your child's class will appear here.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {filtered.map(r => {
                                const url = r.fileUrl;
                                const isLink = (r.type || '').toLowerCase() === 'link';
                                return (
                                    <div key={r.id} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-primary-300 hover:shadow-md transition-all flex flex-col">
                                        <div className="flex items-start gap-3 mb-4">
                                            {typeIcon(r.type)}
                                            <div className="min-w-0">
                                                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight line-clamp-2" title={r.title}>{r.title}</h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{r.uploaderName ? `By ${r.uploaderName}` : ''}</p>
                                            </div>
                                        </div>
                                        {r.description && <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 line-clamp-3">{r.description}</p>}
                                        <div className="flex flex-wrap gap-2 mb-5">
                                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                {formatClassSection({ name: r.className, section: r.sectionName })}
                                            </span>
                                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-primary-50 text-primary-600">
                                                {r.subjectName || 'General'}
                                            </span>
                                        </div>
                                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center mt-auto">
                                            <span className="text-xs font-semibold text-slate-400">
                                                {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : ''}
                                            </span>
                                            {url && (
                                                <a
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                                    title={isLink ? 'Open link' : 'Open / download'}
                                                >
                                                    {isLink ? <LuExternalLink size={16} /> : <LuDownload size={16} />}
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
