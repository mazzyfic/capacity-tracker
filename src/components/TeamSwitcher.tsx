import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronDown, 
  Check, 
  Edit2, 
  UserCheck, 
  Layers,
  X
} from 'lucide-react';
import { TeamSummary } from '../data/defaultTeams';

interface TeamSwitcherProps {
  teams: TeamSummary[];
  currentTeamId: string;
  onSelectTeam: (teamId: string) => void;
  onUpdateTeam: (teamId: string, name: string, leadName: string) => void;
  activeTeamTitle: string;
  activeLeadName: string;
}

export const TeamSwitcher: React.FC<TeamSwitcherProps> = ({
  teams,
  currentTeamId,
  onSelectTeam,
  onUpdateTeam,
  activeTeamTitle,
  activeLeadName,
}) => {
  const cleanTeamName = (name: string) => {
    if (!name) return '';
    return name.replace(/\s*Capacity\s*Tracker\s*/gi, '').trim();
  };

  const [isOpen, setIsOpen] = useState(false);
  
  // State for editing any team in the list
  const [editingTeam, setEditingTeam] = useState<TeamSummary | null>(null);
  const [editName, setEditName] = useState('');
  const [editLead, setEditLead] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleOpenEditModal = (t: TeamSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTeam(t);
    setEditName(t.name);
    setEditLead(t.leadName);
    setIsOpen(false);
  };

  const handleSaveEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTeam && editName.trim() && editLead.trim()) {
      onUpdateTeam(editingTeam.id, editName.trim(), editLead.trim());
      setEditingTeam(null);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Team Switcher Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-left cursor-pointer ${
          isOpen 
            ? 'bg-slate-100/90 border-blue-300 ring-2 ring-blue-100 shadow-xs' 
            : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-2xs'
        }`}
        title="Click to switch or manage teams"
        aria-expanded={isOpen}
      >
        <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-200 flex items-center justify-center text-blue-700 font-bold shrink-0">
          <Layers className="w-4 h-4 text-blue-600" />
        </div>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm sm:text-base font-bold text-slate-900 truncate max-w-[190px] sm:max-w-[240px]">
              {cleanTeamName(activeTeamTitle) || 'Team'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
          </div>
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200/90 shadow-xl z-50 py-2.5 divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3.5 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Manage Teams
            </span>
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {teams.length} Teams
            </span>
          </div>

          {/* Teams List */}
          <div className="py-2 max-h-72 overflow-y-auto space-y-1.5 px-2">
            {teams.map((t) => {
              const isSelected = t.id === currentTeamId;
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    onSelectTeam(t.id);
                    setIsOpen(false);
                  }}
                  className={`group/item flex items-center justify-between p-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50/80 text-blue-900 font-semibold border border-blue-200/70 shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-300'}`} />
                    <div className="truncate">
                      <div className="truncate text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <span>{cleanTeamName(t.name)}</span>
                        {isSelected && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.2 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <UserCheck className="w-3 h-3 text-blue-600" />
                        <span>Lead: <strong className="text-slate-700">{t.leadName}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Edit Team Button */}
                    <button
                      type="button"
                      onClick={(e) => handleOpenEditModal(t, e)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 shadow-2xs transition-all cursor-pointer"
                      title={`Edit name and lead for ${cleanTeamName(t.name)}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Team Modal */}
      {editingTeam && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Team Details</h3>
                  <p className="text-xs text-slate-500">Update team name and assigned Team Lead</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTeam(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Team Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold bg-white border border-slate-200 hover:border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 shadow-2xs"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Team Lead Name
                </label>
                <input
                  type="text"
                  value={editLead}
                  onChange={(e) => setEditLead(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold bg-white border border-slate-200 hover:border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 shadow-2xs"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTeam(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editName.trim() || !editLead.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
