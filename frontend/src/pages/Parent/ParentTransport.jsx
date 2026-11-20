import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyTransport } from '../../api/transport';
import { formatDisplayDate, formatAmount } from '../../utils/transportExport';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import toast from 'react-hot-toast';
import {
    LuBus,
    LuMapPin,
    LuRoute,
    LuPhone,
    LuUser,
    LuCalendar,
    LuIndianRupee,
    LuRefreshCw,
    LuRuler,
    LuArrowLeftRight
} from 'react-icons/lu';

const BASIS_LABEL = { STOP: 'Bus stop fee', SLAB: 'Distance slab fee' };

function InfoTile({ icon: Icon, label, value, mono = false }) {
    return (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700">
            <div className="p-2.5 rounded-xl bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 shrink-0">
                <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                <p className={`mt-0.5 font-bold text-slate-800 dark:text-white break-words ${mono ? 'font-mono tracking-wide' : ''}`}>
                    {value || '—'}
                </p>
            </div>
        </div>
    );
}

function ChildTransportCard({ item, showName }) {
    if (!item.assigned) {
        return (
            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm text-center">
                <LuBus className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                    {showName ? `${item.studentName} is` : 'Your child is'} not using school transport
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    If you need a bus, please contact the school office. Once a bus is assigned, the details will appear here.
                </p>
            </div>
        );
    }

    const phone = String(item.driverPhone || '').replace(/\D/g, '');

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div>
                    {showName && (
                        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                            {item.studentName}
                            {item.className ? ` · ${item.className}${item.sectionName ? ` - ${item.sectionName}` : ''}` : ''}
                        </p>
                    )}
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-1">Bus Number</p>
                    <p className="text-2xl font-black font-mono tracking-wide text-slate-900 dark:text-white">{item.busNumber || 'Not assigned'}</p>
                    {item.busModel ? <p className="text-xs text-slate-400 mt-0.5">{item.busModel}</p> : null}
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">Active</span>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoTile icon={LuRoute} label="Bus Route" value={item.routeName} />
                <InfoTile icon={LuMapPin} label="Bus Stop" value={item.stopName} />
                <InfoTile icon={LuRuler} label="Distance" value={item.distanceLabel} />
                <InfoTile icon={LuArrowLeftRight} label="Travel Mode" value={item.travelMode} />
                <InfoTile icon={LuCalendar} label="Effective From" value={formatDisplayDate(item.effectFrom)} />
                <InfoTile icon={LuUser} label="Driver" value={item.driverName} />
            </div>

            {phone && (
                <div className="px-6 pb-6 -mt-2">
                    <a
                        href={`tel:${phone}`}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition-colors"
                    >
                        <LuPhone className="w-4 h-4" /> Call driver ({phone})
                    </a>
                </div>
            )}

            <div className="p-6 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                    <LuIndianRupee className="w-5 h-5 text-primary-600" />
                    <h3 className="font-bold text-slate-800 dark:text-white">Transport Fee</h3>
                </div>

                {item.fees.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        The school has not set a transport fee for this bus stop yet.
                    </p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                        <table className="w-full text-left text-sm min-w-max">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase tracking-wider text-slate-400">
                                    <th className="py-3 px-4 font-semibold">Due Date</th>
                                    <th className="py-3 px-4 font-semibold">Fee</th>
                                    <th className="py-3 px-4 font-semibold text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-slate-700 dark:text-slate-200">
                                {item.fees.map((f) => (
                                    <tr key={f.id}>
                                        <td className="py-3 px-4 font-medium">{formatDisplayDate(f.dueDate)}</td>
                                        <td className="py-3 px-4">{BASIS_LABEL[f.basis] || 'Transport fee'}</td>
                                        <td className="py-3 px-4 text-right font-bold">₹{formatAmount(f.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {item.fees.length > 1 && (
                                <tfoot>
                                    <tr className="bg-slate-50 dark:bg-slate-900/40 font-bold text-slate-800 dark:text-white">
                                        <td className="py-3 px-4" colSpan={2}>Total</td>
                                        <td className="py-3 px-4 text-right">₹{formatAmount(item.totalFee)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ParentTransport() {
    const { userProfile } = useAuth();
    const outletContext = useOutletContext();
    const activeStudentId = outletContext?.activeStudentId;
    const activeChild = outletContext?.activeChild;
    const studentId = activeStudentId || userProfile?.linkedStudentId || null;

    const childName =
        activeChild?.name ||
        (activeChild?.firstName ? `${activeChild.firstName} ${activeChild.lastName || ''}`.trim() : null) ||
        null;

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const mountedRef = useRef(true);
    const currentStudentRef = useRef(studentId);

    const fetchTransport = useCallback(async (targetStudentId, manual = false) => {
        try {
            if (manual) setRefreshing(true);
            else setLoading(true);
            setError(null);

            const res = await getMyTransport(targetStudentId ? { studentId: targetStudentId } : {});
            if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;

            setItems(Array.isArray(res?.data) ? res.data : []);
            if (manual) toast.success('Transport details updated');
        } catch (err) {
            if (mountedRef.current && currentStudentRef.current === targetStudentId) {
                console.error('[ParentTransport] Error loading transport details:', err);
                const msg = err.message || 'Failed to load transport details.';
                setError(msg);
                setItems([]);
                toast.error(msg);
            }
        } finally {
            if (mountedRef.current && currentStudentRef.current === targetStudentId) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        currentStudentRef.current = studentId;
        fetchTransport(studentId);
        return () => { mountedRef.current = false; };
    }, [studentId, fetchTransport]);

    // Refresh when the school changes a bus, stop, fee or this child's mapping
    useLiveDataRefresh(() => fetchTransport(studentId), [studentId, fetchTransport], 'transport');

    // With one child selected there is a single card; without a selection, show every child
    const showName = !studentId || items.length > 1;

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-xl">
                        <LuBus className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">Transport</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            {childName ? (
                                <>School bus details for <span className="font-semibold text-slate-700 dark:text-slate-200">{childName}</span></>
                            ) : (
                                'School bus details'
                            )}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => fetchTransport(studentId, true)}
                    disabled={loading || refreshing}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-xl transition-all shadow-sm disabled:opacity-50"
                >
                    <LuRefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
                </div>
            ) : error ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-2xl text-sm">
                    {error}
                </div>
            ) : items.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm text-center text-slate-500 dark:text-slate-400">
                    No transport details found.
                </div>
            ) : (
                <div className="space-y-6">
                    {items.map((item) => (
                        <ChildTransportCard key={item.studentId} item={item} showName={showName} />
                    ))}
                </div>
            )}
        </div>
    );
}
