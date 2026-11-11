import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { staffApi } from '../api/staff';
import { computeProfileCompletion, isTeachingStaff } from '../utils/profileValidation';

/**
 * "Complete Your Profile" banner for portals other than the Teacher portal
 * (admin portal: admins, grade co-ordinators and other non-teaching staff).
 * Uses the same completion calculation as the Profile page, so both always agree.
 */
export default function ProfileCompletionBanner({ profilePath = '/admin/profile' }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [doc, setDoc] = useState(null);

    useEffect(() => {
        let active = true;
        const load = () => {
            staffApi.getStaffMe()
                .then((res) => { if (active && res?.data) setDoc(res.data); })
                .catch((err) => console.error('Error loading profile for completion banner:', err));
        };
        load();
        window.addEventListener('staff-profile-updated', load);
        return () => {
            active = false;
            window.removeEventListener('staff-profile-updated', load);
        };
    }, []);

    if (!doc) return null;
    const completion = computeProfileCompletion(doc);
    if (completion >= 100 || location.pathname === profilePath) return null;

    const hint = isTeachingStaff(doc.staffType)
        ? 'address, qualifications, and bank info'
        : 'contact details, address, and bank info';

    return (
        <div className="p-4 pb-0 shrink-0">
            <div
                onClick={() => navigate(profilePath)}
                className="cursor-pointer bg-gradient-to-r from-amber-500 to-orange-400 rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                <div className="flex justify-between items-center relative z-10">
                    <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">Complete Your Profile</h3>
                        <p className="text-white/90 text-sm mt-1 max-w-lg">
                            You are {completion}% complete. Click here to add missing details like {hint}.
                        </p>
                    </div>
                    <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center font-bold text-xl relative shrink-0 border-4 border-white/30">
                        {completion}%
                    </div>
                </div>
            </div>
        </div>
    );
}
