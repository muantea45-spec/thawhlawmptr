import React, { useState, useEffect } from 'react';
import { UserCheck, Trash2, Save, Lock, Edit3 } from 'lucide-react';
import { api } from '../utils/api';
import { FINANCIAL_MONTHS } from '../utils/constants';
import Modal from './common/Modal';

export default function BialMemberEditModal({
  isOpen,
  onClose,
  member,
  bialName,
  bialId,
  year,
  month,
  isLocked = false,
  onSaved = () => {},
  showToast = () => {}
}) {
  const [name, setName] = useState('');
  const [slNo, setSlNo] = useState('');
  const [pathianRam, setPathianRam] = useState('');
  const [ramthar, setRamthar] = useState('');
  const [tualchhung, setTualchhung] = useState('');
  const [building, setBuilding] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (member) {
      setName(member.name || '');
      setSlNo(member.sl_no || '');
      setPathianRam(member.pathian_ram !== undefined && member.pathian_ram !== null ? String(member.pathian_ram) : '');
      setRamthar(member.ramthar !== undefined && member.ramthar !== null ? String(member.ramthar) : '');
      setTualchhung(member.tualchhung !== undefined && member.tualchhung !== null ? String(member.tualchhung) : '');
      setBuilding(member.building !== undefined && member.building !== null ? String(member.building) : '');
    }
  }, [member, isOpen]);

  const numPR = parseFloat(pathianRam) || 0;
  const numRT = parseFloat(ramthar) || 0;
  const numTch = parseFloat(tualchhung) || 0;
  const numBldg = parseFloat(building) || 0;
  const calculatedTotal = numPR + numRT + numTch + numBldg;

  const monthName = FINANCIAL_MONTHS.find(m => m.id === month)?.name || `Month ${month}`;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Member name (HMING) cannot be empty', 'error');
      return;
    }

    if (isLocked) {
      showToast('Month is locked by Admin. Changes cannot be saved.', 'error');
      return;
    }

    try {
      setSaving(true);
      const memberId = member.member_id || member.id;

      // 1. Update Member Name and Serial No
      await api.updateMember(memberId, {
        name: name.trim(),
        sl_no: parseInt(slNo) || member.sl_no
      });

      // 2. Save Tithes for selected Month
      if (bialId) {
        await api.saveTithe({
          bial_id: bialId,
          member_id: memberId,
          year,
          month,
          pathian_ram: numPR,
          ramthar: numRT,
          tualchhung: numTch,
          building: numBldg
        });
      }

      showToast(`Updated tithes & info for ${name.trim()}!`, 'success');
      onSaved();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to update tithe figures', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const memberId = member.member_id || member.id;
    if (!window.confirm(`Are you sure you want to delete "${name}" from ${bialName || 'this Bial'}?`)) {
      return;
    }

    try {
      setDeleting(true);
      await api.deleteMember(memberId);
      showToast(`Member "${name}" deleted.`, 'info');
      onSaved();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to delete member', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen || !member) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <Modal.Header
        title="Edit Member & Tithe Figures"
        subtitle={`${bialName || 'Bial'} • ${monthName} FY ${year}`}
        icon={Edit3}
        onClose={onClose}
      />
      <form onSubmit={handleSave} className="space-y-4">
        <Modal.Body className="space-y-3.5">
          {/* Locked Notice if applicable */}
          {isLocked && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-600 shrink-0" />
              <span>This month is locked by Admin. Figures are in read-only mode.</span>
            </div>
          )}

          {/* Section 1: Member Identity */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
              1. Member Identity
            </span>
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-1">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Sl No
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  disabled={isLocked}
                  value={slNo}
                  onChange={(e) => setSlNo(e.target.value)}
                  className="w-full text-center font-mono font-bold px-2 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-600 text-xs shadow-2xs disabled:bg-slate-50"
                />
              </div>

              <div className="col-span-3">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Hming (Member Full Name)
                </label>
                <input
                  type="text"
                  required
                  disabled={isLocked}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Lalthanpuia"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-indigo-600 text-xs shadow-2xs disabled:bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Tithe Breakdown for Selected Month */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                2. Tithe Figures for {monthName}
              </span>
              <span className="text-[11px] font-mono font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                Total: ₹{calculatedTotal.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 font-mono">
              {/* Pathian Ram */}
              <div className="bg-blue-50/70 p-2.5 rounded-xl border border-blue-200">
                <label className="block text-[10.5px] font-extrabold text-blue-900 mb-1 uppercase tracking-tight">
                  Pathian Ram (PTR)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-2 text-xs font-bold text-blue-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={isLocked}
                    value={pathianRam}
                    onChange={(e) => setPathianRam(e.target.value)}
                    placeholder="0"
                    className="w-full pl-6 pr-2.5 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-950 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs shadow-2xs disabled:bg-slate-50"
                  />
                </div>
              </div>

              {/* Ramthar */}
              <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200">
                <label className="block text-[10.5px] font-extrabold text-emerald-900 mb-1 uppercase tracking-tight">
                  Ramthar (RT)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-2 text-xs font-bold text-emerald-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={isLocked}
                    value={ramthar}
                    onChange={(e) => setRamthar(e.target.value)}
                    placeholder="0"
                    className="w-full pl-6 pr-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-950 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs shadow-2xs disabled:bg-slate-50"
                  />
                </div>
              </div>

              {/* Tualchhung */}
              <div className="bg-amber-50/70 p-2.5 rounded-xl border border-amber-200">
                <label className="block text-[10.5px] font-extrabold text-amber-900 mb-1 uppercase tracking-tight">
                  Tualchhung (Tch)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-2 text-xs font-bold text-amber-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={isLocked}
                    value={tualchhung}
                    onChange={(e) => setTualchhung(e.target.value)}
                    placeholder="0"
                    className="w-full pl-6 pr-2.5 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-950 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs shadow-2xs disabled:bg-slate-50"
                  />
                </div>
              </div>

              {/* Building */}
              <div className="bg-purple-50/70 p-2.5 rounded-xl border border-purple-200">
                <label className="block text-[10.5px] font-extrabold text-purple-900 mb-1 uppercase tracking-tight">
                  Building (Bldg)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-2 text-xs font-bold text-purple-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={isLocked}
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    placeholder="0"
                    className="w-full pl-6 pr-2.5 py-1.5 rounded-lg bg-white border border-purple-200 text-purple-950 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs shadow-2xs disabled:bg-slate-50"
                  />
                </div>
              </div>
            </div>
          </div>
        </Modal.Body>

        <Modal.Footer>
          <div className="flex items-center justify-between w-full gap-2">
            <button
              type="button"
              disabled={deleting || isLocked}
              onClick={handleDelete}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-30"
              title="Delete member"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || isLocked}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
