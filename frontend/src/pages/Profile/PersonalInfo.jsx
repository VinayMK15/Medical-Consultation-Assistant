import React, { useContext, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import api from '../../utils/api';

function InfoField({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export default function PersonalInfo() {
  const { user, updateUserSession } = useContext(AuthContext);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: '',
    age: '',
    gender: ''
  });
  const [city, setCity]       = useState(user?.city    || '');
  const [address, setAddress] = useState(user?.address || '');

  const handleEditClick = () => {
    setFormData({
      full_name: user.full_name || user.name || '',
      age: user.age || '',
      gender: user.gender || ''
    });
    setCity(user?.city || '');
    setAddress(user?.address || '');
    setSaveSuccess(false);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const payload = {
        full_name: formData.full_name,
        age: formData.age ? parseInt(formData.age, 10) : null,
        gender: formData.gender || null,
        city:    city    || null,
        address: address || null,
      };
      const res = await api.put('/api/patient/profile', payload);
      updateUserSession(res.data);
      setSaveSuccess(true);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
      alert(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  const fullName  = user.full_name || user.name || 'Not provided';
  const email     = user.email     || 'Not provided';
  const role      = user.role      || 'Patient';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-teal-600">Profile</p>
          <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">Personal Information</h2>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
          {role}
        </span>
      </div>

      {/* Avatar + name banner */}
      <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-bold uppercase text-white shadow-md shadow-blue-500/20">
          {fullName.charAt(0)}
        </div>
        <div>
          <p className="text-base font-bold text-slate-900">{fullName}</p>
          <p className="text-sm text-slate-500">{email}</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500"></span>
          Active
        </span>
      </div>

      {/* Body */}
      {isEditing ? (
        <div className="p-6">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Full Name</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Age</label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={e => setFormData({ ...formData, age: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Gender</label>
                <select
                  value={formData.gender}
                  onChange={e => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Home City */}
            <div>
              <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                Home City
              </label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px',
                  border: '1px solid #D1D5DB', borderRadius: '8px',
                  fontSize: '14px', marginTop: '4px'
                }}
              >
                <option value="">Select city</option>
                <option value="Bangalore">Bangalore</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Delhi">Delhi</option>
                <option value="Chennai">Chennai</option>
                <option value="Hyderabad">Hyderabad</option>
                <option value="Pune">Pune</option>
                <option value="Kolkata">Kolkata</option>
              </select>
            </div>

            {/* Home Area / Address */}
            <div>
              <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                Home Area / Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Koramangala, Bandra West"
                style={{
                  width: '100%', padding: '8px 12px',
                  border: '1px solid #D1D5DB', borderRadius: '8px',
                  fontSize: '14px', marginTop: '4px'
                }}
              />
              <span style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px', display: 'block' }}>
                This will be used to find doctors near your home
              </span>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => setIsEditing(false)}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Info grid */}
          <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2">
            <InfoField label="Full Name"      value={fullName} />
            <InfoField label="Email Address"  value={email} />
            <InfoField label="Age"            value={user.age    ? `${user.age} years` : 'Not provided'} />
            <InfoField label="Gender"         value={user.gender || 'Not provided'} />
            <InfoField label="Home City"      value={user.city   || 'Not provided'} />
            <InfoField label="Home Address"   value={user.address || 'Not provided'} />
            <InfoField label="Role"           value={role} />
            <InfoField label="Account Status" value="Verified & Active" />
          </div>

          {saveSuccess && (
            <div className="px-6 pb-2">
              <p style={{ color: '#1D9E75', fontSize: '13px', marginTop: '8px' }}>
                ✅ Profile saved — home location updated
              </p>
            </div>
          )}

          {/* Footer note / Edit button */}
          {role === 'patient' && (
            <div className="flex justify-end rounded-b-2xl border-t border-slate-100 bg-slate-50 px-6 py-3">
              <button
                onClick={handleEditClick}
                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
              >
                Edit Profile
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

