import React, { useState } from 'react';
import { Key, Plus, Lock, Unlock, Trash2, Edit, Search, ShieldCheck, Check, X, RefreshCw } from 'lucide-react';
import Modal from './common/Modal';
import { api } from '../utils/api';

export default function BialCredentialsModal({
  isOpen,
  onClose,
  bials,
  onRefresh,
  onEditBial,
  onAddNewBial,
  showToast
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [resettingBialId, setResettingBialId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const filteredBials = bials.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleStatus = async (bial) => {
    const newStatus = bial.status === 'active' ? 'locked' : 'active';
    try {
      await api.updateBial(bial.id, { status: newStatus });
      showToast(`Account ${bial.name} ${newStatus === 'locked' ? 'Locked' : 'Unlocked'}`, 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to toggle account status', 'error');
    }
  };

  const handleStartPasswordReset = (bial) => {
    setResettingBialId(bial.id);
    setNewPassword('');
  };

  const handleCancelPasswordReset = () => {
    setResettingBialId(null);
    setNewPassword('');
  };

  const handleSavePasswordReset = async (bialId) => {
    if (!newPassword || newPassword.trim().length < 4) {
      showToast('Password must be at least 4 characters long', 'error');
      return;
    }

    try {
      setSavingPassword(true);
      await api.updateBial(bialId, { password: newPassword.trim() });
      showToast('Password reset successfully!', 'success');
      setResettingBialId(null);
      setNewPassword('');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to reset password', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteBial = async (bial) => {
    if (!window.confirm(`Are you sure you want to permanently delete Bial "${bial.name}" (username: ${bial.username}) and all its member and tithe records?`)) {
      return;
    }
    try {
      await api.deleteBial(bial.id);
      showToast(`Bial account "${bial.name}" deleted.`, 'info');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to delete Bial', 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl">
      <Modal.Header
        title="Bial Credentials Manager"
        subtitle="Manage login usernames, reset passwords, change access status, and add/delete Bial users"
        icon={Key}
        onClose={onClose}
      />

      <Modal.Body className="space-y-3">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Bial name, code, username..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 shadow-2xs"
            />
          </div>

          <button
            onClick={() => {
              onClose();
              onAddNewBial();
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs shadow-emerald-600/20 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> <span>Add Bial User</span>
          </button>
        </div>

        {/* Credentials List */}
        <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-0.5">
          {filteredBials.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 font-sans">
              No Bial accounts found matching your search.
            </div>
          ) : (
            filteredBials.map((b, index) => (
              <div
                key={b.id}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-colors shadow-2xs space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start sm:items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 font-mono font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm">{b.name}</span>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {b.code}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                        <span>User:</span>
                        <span className="font-mono font-bold text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                          {b.username}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-center shrink-0">
                    {/* Status Badge */}
                    <button
                      onClick={() => handleToggleStatus(b)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border flex items-center gap-1 cursor-pointer transition-colors ${
                        b.status === 'active'
                          ? 'bg-emerald-100/80 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                          : 'bg-rose-100/80 text-rose-800 border-rose-300 hover:bg-rose-200'
                      }`}
                      title={b.status === 'active' ? 'Click to Lock Account' : 'Click to Unlock Account'}
                    >
                      {b.status === 'active' ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      <span>{b.status === 'active' ? 'Active' : 'Locked'}</span>
                    </button>

                    {/* Reset Password Button */}
                    <button
                      onClick={() => handleStartPasswordReset(b)}
                      className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] sm:text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                      title="Reset / Change Password"
                    >
                      <Key className="w-3 h-3 text-indigo-600" />
                      <span>Reset</span>
                    </button>

                    {/* Edit Details Button */}
                    <button
                      onClick={() => {
                        onClose();
                        onEditBial(b);
                      }}
                      className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                      title="Edit Bial Account Details"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete Bial Button */}
                    <button
                      onClick={() => handleDeleteBial(b)}
                      className="p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors cursor-pointer"
                      title="Delete Bial Account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline Password Reset Form */}
                {resettingBialId === b.id && (
                  <div className="mt-2 pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100">
                    <span className="text-xs font-bold text-indigo-900 shrink-0">
                      New Password for {b.username}:
                    </span>
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 4 chars)"
                      className="flex-1 px-3 py-1 rounded-lg bg-white border border-indigo-300 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-600"
                      autoFocus
                    />
                    <div className="flex items-center gap-1.5 shrink-0 justify-end">
                      <button
                        onClick={() => handleSavePasswordReset(b.id)}
                        disabled={savingPassword || !newPassword}
                        className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 disabled:opacity-40 cursor-pointer shadow-2xs"
                      >
                        <Check className="w-3.5 h-3.5" /> Save
                      </button>
                      <button
                        onClick={handleCancelPasswordReset}
                        className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
        >
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
}
