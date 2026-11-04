/**
 * Teacher profile validation, input sanitising and completion calculation.
 * Single source of truth used by ProfileSetup (form) and TeacherDashboard (completion banner).
 * Server-side rules live in backend/src/modules/staff/staff.schemas.js (kept in sync).
 */

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const GOVT_ID_TYPES = ['Aadhaar', 'PAN', 'Voter ID', 'Passport', 'Driving License'];

const NAME_RE = /^[A-Za-z][A-Za-z\s.'-]*$/;            // letters, spaces . ' -
const TEXT_RE = /^[A-Za-z0-9][A-Za-z0-9\s.,&()'/+#:-]*$/; // organisation / degree style text
const MOBILE_RE = /^[6-9]\d{9}$/;
const AADHAAR_RE = /^[2-9]\d{11}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;
const UAN_RE = /^\d{12}$/;
const ESIC_RE = /^\d{17}$/;
const PF_RE = /^[A-Z0-9/-]{5,26}$/;
const VOTER_RE = /^[A-Z]{3}[0-9]{7}$/;
const PASSPORT_RE = /^[A-Z][0-9]{7}$/;
const DL_RE = /^[A-Z]{2}[0-9]{2}[0-9]{11}$/;

/** Fields that are blocked from accepting the wrong characters while typing. */
const DIGITS_ONLY = { mobileNumber: 10, emergencyContact: 10, aadharNumber: 12, bankAccountNumber: 18, uanNumber: 12, esicNumber: 17, yearOfPassing: 4 };
const UPPERCASE = { panNumber: 10, ifscCode: 11, pfNumber: 26 };

/**
 * Cleans a value as the user types so impossible characters never enter the field
 * (e.g. letters in a mobile number, or more than 10 digits).
 */
export function sanitizeField(name, value, formData = {}) {
    let v = value == null ? '' : String(value);

    if (DIGITS_ONLY[name]) {
        return v.replace(/\D/g, '').slice(0, DIGITS_ONLY[name]);
    }
    if (UPPERCASE[name]) {
        return v.toUpperCase().replace(/[^A-Z0-9/-]/g, '').slice(0, UPPERCASE[name]);
    }
    if (name === 'previousExperience') {
        v = v.replace(/[^\d.]/g, '');
        const parts = v.split('.');
        if (parts.length > 2) v = `${parts[0]}.${parts.slice(1).join('')}`;
        return v.slice(0, 5);
    }
    if (name === 'govtIdNumber') {
        const max = formData.govtIdType === 'Aadhaar' ? 12 : 20;
        const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max);
        return formData.govtIdType === 'Aadhaar' ? cleaned.replace(/\D/g, '') : cleaned;
    }
    if (['nationality', 'fatherGuardianName', 'languagesKnown'].includes(name)) {
        return v.replace(/[^A-Za-z\s.,'-]/g, '').slice(0, 100);
    }
    return v;
}

/** Normalises phone numbers coming from the server (+91 98xxxxxxxx, 098xxxxxxxx, spaces...). */
export function normalizePhone(value) {
    let d = String(value || '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d.slice(0, 10);
}

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * Validates the whole profile form. Returns { fieldName: 'message' } - empty object means valid.
 */
export function validateProfile(f) {
    const e = {};
    const req = (key, msg) => { if (isBlank(f[key])) e[key] = msg; };

    // ---- Personal ----
    req('dob', 'Date of birth is required');
    if (!e.dob) {
        const d = new Date(f.dob);
        const now = new Date();
        if (Number.isNaN(d.getTime())) e.dob = 'Enter a valid date of birth';
        else if (d > now) e.dob = 'Date of birth cannot be in the future';
        else {
            let age = now.getFullYear() - d.getFullYear();
            const m = now.getMonth() - d.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
            if (age < 18) e.dob = 'You must be at least 18 years old';
            else if (age > 80) e.dob = 'Enter a valid date of birth';
        }
    }
    req('gender', 'Select a gender');
    if (!isBlank(f.bloodGroup) && !BLOOD_GROUPS.includes(String(f.bloodGroup).toUpperCase())) {
        e.bloodGroup = 'Select a valid blood group';
    }
    if (!isBlank(f.nationality) && !NAME_RE.test(f.nationality.trim())) e.nationality = 'Only letters are allowed';
    if (!isBlank(f.fatherGuardianName) && (!NAME_RE.test(f.fatherGuardianName.trim()) || f.fatherGuardianName.trim().length < 2)) {
        e.fatherGuardianName = 'Enter a valid name (letters only)';
    }
    if (!isBlank(f.languagesKnown) && !/^[A-Za-z][A-Za-z\s.,'-]*$/.test(f.languagesKnown.trim())) {
        e.languagesKnown = 'Only letters, commas and spaces are allowed';
    }

    req('mobileNumber', 'Mobile number is required');
    if (!e.mobileNumber && !MOBILE_RE.test(f.mobileNumber)) {
        e.mobileNumber = 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9';
    }
    req('emergencyContact', 'Emergency contact is required');
    if (!e.emergencyContact) {
        if (!MOBILE_RE.test(f.emergencyContact)) e.emergencyContact = 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9';
        else if (f.emergencyContact === f.mobileNumber) e.emergencyContact = 'Emergency contact must be different from your mobile number';
    }

    // ---- Address ----
    req('residentialAddress', 'Residential address is required');
    if (!e.residentialAddress && f.residentialAddress.trim().length < 10) {
        e.residentialAddress = 'Enter your full address (at least 10 characters)';
    }

    // ---- Education ----
    req('highestQualification', 'Highest qualification is required');
    if (!e.highestQualification && !TEXT_RE.test(f.highestQualification.trim())) e.highestQualification = 'Enter a valid qualification (e.g. M.Sc, B.Ed)';
    if (!isBlank(f.degreeSpecialization) && !TEXT_RE.test(f.degreeSpecialization.trim())) e.degreeSpecialization = 'Enter a valid specialization';
    if (!isBlank(f.universityName) && !TEXT_RE.test(f.universityName.trim())) e.universityName = 'Enter a valid university / college name';
    if (!isBlank(f.yearOfPassing)) {
        const y = Number(f.yearOfPassing);
        const thisYear = new Date().getFullYear();
        if (!/^\d{4}$/.test(f.yearOfPassing) || y < 1960 || y > thisYear) e.yearOfPassing = `Enter a year between 1960 and ${thisYear}`;
    }

    // ---- Professional ----
    if (!isBlank(f.previousExperience)) {
        const n = Number(f.previousExperience);
        if (Number.isNaN(n) || n < 0 || n > 50) e.previousExperience = 'Enter experience between 0 and 50 years';
    }
    if (!isBlank(f.previousOrganization) && !TEXT_RE.test(f.previousOrganization.trim())) e.previousOrganization = 'Enter a valid organization name';
    if (!isBlank(f.subjectSpecialization) && !TEXT_RE.test(f.subjectSpecialization.trim())) e.subjectSpecialization = 'Enter a valid subject';
    if (!isBlank(f.gradesClassesHandled) && !TEXT_RE.test(f.gradesClassesHandled.trim())) e.gradesClassesHandled = 'Enter valid classes (e.g. Class 8 - 10)';

    // ---- Government IDs ----
    if (!isBlank(f.aadharNumber) && !AADHAAR_RE.test(f.aadharNumber)) e.aadharNumber = 'Aadhaar must be 12 digits and cannot start with 0 or 1';
    if (!isBlank(f.panNumber) && !PAN_RE.test(f.panNumber)) e.panNumber = 'PAN format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)';
    if (!isBlank(f.pfNumber) && !PF_RE.test(f.pfNumber)) e.pfNumber = 'Enter a valid PF number (5-26 letters / digits)';
    if (!isBlank(f.esicNumber) && !ESIC_RE.test(f.esicNumber)) e.esicNumber = 'ESIC number must be 17 digits';
    if (!isBlank(f.uanNumber) && !UAN_RE.test(f.uanNumber)) e.uanNumber = 'UAN must be 12 digits';

    if (!isBlank(f.govtIdNumber)) {
        const rules = {
            Aadhaar: [AADHAAR_RE, 'Aadhaar must be 12 digits and cannot start with 0 or 1'],
            PAN: [PAN_RE, 'PAN format: ABCDE1234F'],
            'Voter ID': [VOTER_RE, 'Voter ID format: 3 letters + 7 digits (e.g. ABC1234567)'],
            Passport: [PASSPORT_RE, 'Passport format: 1 letter + 7 digits (e.g. A1234567)'],
            'Driving License': [DL_RE, 'Driving license format: TN0120201234567']
        };
        const [re, msg] = rules[f.govtIdType] || [/^[A-Z0-9]{4,20}$/, 'Enter a valid ID number'];
        if (!re.test(f.govtIdNumber)) e.govtIdNumber = msg;
    }

    // ---- Bank (all-or-nothing) ----
    const bankKeys = ['bankName', 'bankAccountNumber', 'branchName', 'ifscCode'];
    const bankStarted = bankKeys.some((k) => !isBlank(f[k]));
    if (bankStarted) {
        if (isBlank(f.bankName)) e.bankName = 'Bank name is required';
        if (isBlank(f.bankAccountNumber)) e.bankAccountNumber = 'Account number is required';
        if (isBlank(f.branchName)) e.branchName = 'Branch name is required';
        if (isBlank(f.ifscCode)) e.ifscCode = 'IFSC code is required';
    }
    if (!e.bankName && !isBlank(f.bankName) && !NAME_RE.test(f.bankName.trim())) e.bankName = 'Enter a valid bank name (letters only)';
    if (!e.branchName && !isBlank(f.branchName) && !TEXT_RE.test(f.branchName.trim())) e.branchName = 'Enter a valid branch name';
    if (!e.bankAccountNumber && !isBlank(f.bankAccountNumber) && !ACCOUNT_RE.test(f.bankAccountNumber)) e.bankAccountNumber = 'Account number must be 9 to 18 digits';
    if (!e.ifscCode && !isBlank(f.ifscCode) && !IFSC_RE.test(f.ifscCode)) e.ifscCode = 'IFSC format: 4 letters, 0, then 6 letters/digits (e.g. HDFC0001234)';

    return e;
}

/** The 20 fields that count towards the "Complete Your Profile" percentage. */
export const COMPLETION_FIELDS = [
    'dob', 'bloodGroup', 'gender', 'nationality', 'maritalStatus',
    'mobileNumber', 'residentialAddress', 'emergencyContact', 'fatherGuardianName',
    'highestQualification', 'degreeSpecialization', 'universityName', 'yearOfPassing',
    'previousExperience', 'previousOrganization', 'subjectSpecialization',
    'bankAccountNumber', 'bankName', 'branchName', 'ifscCode'
];

const obj = (v) => (typeof v === 'object' && v !== null ? v : {});

/**
 * Computes completion % from the staff record returned by GET /staff/me.
 * A field only counts when it is non-empty AND passes validation, so bad legacy data
 * (e.g. a 12-digit mobile number) does not inflate the percentage.
 */
export function computeProfileCompletion(doc) {
    if (!doc) return 0;
    const custom = obj(doc.customData);
    const quals = typeof doc.qualifications === 'object' && doc.qualifications ? doc.qualifications : obj(custom.qualifications);
    const exp = typeof doc.experience === 'object' && doc.experience ? doc.experience : obj(custom.experience);
    const fin = typeof doc.financial === 'object' && doc.financial ? doc.financial : obj(custom.financial);

    const values = {
        dob: doc.dob || custom.dob,
        bloodGroup: doc.bloodGroup || custom.bloodGroup,
        gender: doc.gender || custom.gender,
        nationality: doc.nationality || custom.nationality,
        maritalStatus: doc.maritalStatus || custom.maritalStatus,
        mobileNumber: normalizePhone(doc.phone || doc.mobileNumber || custom.phone),
        residentialAddress: doc.address || custom.address,
        emergencyContact: normalizePhone(doc.emergencyContact || custom.emergencyContact),
        fatherGuardianName: doc.fatherGuardianName || custom.fatherGuardianName || custom.fatherName,
        highestQualification: quals.highestQualification || (typeof doc.qualifications === 'string' ? doc.qualifications : ''),
        degreeSpecialization: quals.degreeSpecialization,
        universityName: quals.universityName,
        yearOfPassing: quals.yearOfPassing,
        previousExperience: exp.previousExperience ?? (typeof doc.experience === 'string' ? doc.experience : ''),
        previousOrganization: exp.previousOrganization,
        subjectSpecialization: exp.subjectSpecialization,
        bankAccountNumber: fin.bankAccountNumber || doc.accountNumber,
        bankName: fin.bankName,
        branchName: fin.branchName,
        ifscCode: fin.ifscCode
    };
    const asStrings = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v == null ? '' : String(v)]));

    // Validate only the fields that are present, then count those that are filled AND valid
    const errs = validateProfile({ ...asStrings, govtIdType: 'Aadhaar' });
    let filled = 0;
    COMPLETION_FIELDS.forEach((f) => {
        if (!isBlank(asStrings[f]) && !errs[f]) filled++;
    });
    return Math.round((filled / COMPLETION_FIELDS.length) * 100);
}
