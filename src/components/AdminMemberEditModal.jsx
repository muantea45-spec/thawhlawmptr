import React, { useState, useEffect } from 'react';
import { UserCheck, Trash2, Save, ShieldCheck, Check, DollarSign, ArrowRightLeft } from 'lucide-react';
import { api } from '../utils/api';
import { FINANCIAL_MONTHS } from '../utils/constants';
import Modal from './common/Modal';

export default function AdminMemberEditModal({
  isOpen,
  onClose,
  member,
  bial,
  year,
  month,
  onSaved,
  onTransferClick,
  showToast
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

    try {
      setSaving(true);
      const memberId = member.member_id || member.id;

      // 1. Update Member Details (Name and Serial No)
      await api.updateMember(memberId, {
        name: name.trim(),
        sl_no: parseInt(slNo) || member.sl_no
      });

      // 2. Update Member Tithes for the selected Month & Year
      if (bial?.id) {
        await api.saveTithe({
          bial_id: bial.id,
          member_id: memberId,
          year,
          month,
          pathian_ram: numPR,
          ramthar: numRT,
          tualchhung: numTch,
          building: numBldg
        });
      }

      showToast(`Updated details & tithe data for ${name.trim()}!`, 'success');
      onSaved();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to update member data', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const memberId = member.member_id || member.id;
    if (!window.confirm(`Are you sure you want to delete "${name}" from ${bial?.name || 'Bial'} and ALL associated tithe records?`)) {
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

  if (!member) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <Modal.Header
        title="Admin Edit Member & Data"
        subtitle={`${bial?.name || 'Bial'} • ${monthName} FY ${year}`}
        icon={UserCheck}
        onClose={onClose}
      />
      <form onSubmit={handleSave} className="space-y-4">
        <Modal.Body className="space-y-3.5">
          {/* Admin Authority Banner */}
          <div className="p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Admin Authority: You can edit any member info and tithe entries across all Bials.</span>
          </div>

          {/* Section 1: Member Identity */}
          <div className="space-y-2 pt-1">
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
                  value={slNo}
                  onChange={(e) => setSlNo(e.target.value)}
                  className="w-full text-center font-mono font-bold px-2 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-indigo-600 text-xs shadow-2xs"
                />
              </div>

              <div className="col-span-3">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Hming (Member Full Name)
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Lalthanpuia"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-indigo-600 text-xs shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Tithe Breakdown for Selected Month */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                2. Tithes for {monthName} (FY {year})
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Total: ₹{calculatedTotal.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono">
              <div>
                <label className="block text-[10px] font-bold text-blue-900 mb-0.5">
                  Pathian Ram (PTR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={pathianRam}
                  onChange={(e) => setPathianRam(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-blue-200 text-blue-950 font-bold focus:outline-none focus:border-blue-600 text-xs shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-emerald-900 mb-0.5">
                  Ramthar (RT)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={ramthar}
                  onChange={(e) => setRamthar(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-emerald-950 font-bold focus:outline-none focus:border-emerald-600 text-xs shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-amber-900 mb-0.5">
                  Tualchhung (Tch)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={tualchhung}
                  onChange={(e) => setTualchhung(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-amber-950 font-bold focus:outline-none focus:border-amber-600 text-xs shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-purple-900 mb-0.5">
                  Building (Bldg)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-purple-200 text-purple-950 font-bold focus:outline-none focus:border-purple-600 text-xs shadow-2xs"
                />
              </div>
            </div>
          </div>
        </Modal.Body>

        <Modal.Footer>
          <div className="flex items-center justify-between w-full gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-30"
                title="Delete member completely"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              {onTransferClick && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onTransferClick(member);
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Transfer this member to another Bial"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Transfer</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
