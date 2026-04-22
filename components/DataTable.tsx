
import React, { useState } from 'react';
import { TicketRecord, TicketStatus, MuralTreatment } from '../types';
import { Trash2, Edit3, ChevronDown, ChevronUp, Clock, ShieldCheck, Timer, Calendar, CheckCircle2, AlertCircle, MessageSquare, StickyNote, Link2, Plus, Search } from 'lucide-react';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';

interface DataTableProps {
  records: TicketRecord[];
  onDelete: (id: string) => void;
  onEdit: (record: TicketRecord) => void;
  onOpenCase?: (caseId: string) => void;
  onAddTreatment?: (treatment: MuralTreatment) => void;
  currentUserName?: string;
}

const DataTable: React.FC<DataTableProps> = ({ 
  records, 
  onDelete, 
  onEdit, 
  onOpenCase, 
  onAddTreatment,
  currentUserName 
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id); else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  const getSLAInfo = (r: TicketRecord) => {
    const today = startOfDay(new Date());
    const openDate = startOfDay(parseISO(r.openingDate));
    const finalDate = r.returnDate ? startOfDay(parseISO(r.returnDate)) : today;
    const diffDays = Math.abs(differenceInDays(finalDate, openDate));
    
    const label = diffDays <= 5 ? 'NO PRAZO' : (diffDays <= 9 ? 'ALERTA' : 'CRÍTICO');
    const color = diffDays <= 5 ? 'bg-emerald-100 text-emerald-900 border-emerald-400' : (diffDays <= 9 ? 'bg-amber-100 text-amber-900 border-amber-400' : 'bg-red-100 text-red-900 border-red-400');
    const icon = diffDays <= 5 ? ShieldCheck : (diffDays <= 9 ? AlertCircle : Timer);
    
    return { label, color, icon, days: diffDays, type: r.returnDate ? 'Ciclo Finalizado' : 'Aguardando Retorno' };
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return dateStr.split('-').reverse().join('/');
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-700">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
          <thead className="bg-[#003DA5] text-white">
            <tr className="font-black uppercase tracking-normal text-[10px]">
              <th className="px-6 py-5 w-10"></th>
              <th className="px-4 py-5 text-white">CASE / Chamado</th>
              <th className="px-4 py-5 text-white">Monitor SLA</th>
              <th className="px-4 py-5 text-white">Abertura</th>
              <th className="px-4 py-5 text-white">Retorno</th>
              <th className="px-4 py-5 text-white">FSJ (Solicitante)</th>
              <th className="px-6 py-5 text-white">Analista Sovos</th>
              <th className="px-6 py-5 text-center text-white">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.map((r) => {
              const isExpanded = expandedRows.has(r.id);
              const sla = getSLAInfo(r);
              const statusColors = { ABERTO: 'bg-blue-700 text-white', DEVOLVIDO: 'bg-amber-700 text-white', CONCLUIDO: 'bg-emerald-800 text-white' };
              const isCurrentUser = currentUserName && r.externalUser?.toUpperCase() === currentUserName.toUpperCase();

              return (
                <React.Fragment key={r.id}>
                  <tr onClick={() => toggleRow(r.id)} className={`hover:bg-blue-50 cursor-pointer transition-all ${isExpanded ? 'bg-blue-50' : ''} ${isCurrentUser ? 'bg-emerald-50/30' : ''}`}>
                    <td className="px-6 py-5 text-center">{isExpanded ? <ChevronUp className="w-4 h-4 text-[#D91B2A]" /> : <ChevronDown className="w-4 h-4 text-gray-700" />}</td>
                    <td className="px-4 py-5">
                       <div className="flex flex-col">
                          <span className="font-black text-black text-sm flex items-center gap-2">
                            {r.caseId}
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${statusColors[r.status]}`}>
                              {r.status}
                            </span>
                            {isCurrentUser && (
                              <span className="bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest">Meu Registro</span>
                            )}
                          </span>
                          {r.normalizedCategory && (
                            <span className="text-[9px] font-black text-blue-700 uppercase tracking-tighter mt-1 truncate max-w-[200px]">
                              TAG: {r.normalizedCategory}
                            </span>
                          )}
                          {r.previousCaseId && (
                            <span className="text-[7px] text-[#D91B2A] font-black uppercase flex items-center gap-1 mt-1">
                              <Link2 className="w-2.5 h-2.5" /> Vinc: {r.previousCaseId}
                            </span>
                          )}
                       </div>
                    </td>
                    <td className="px-4 py-5">
                       <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl w-fit ${sla.color} border-2`}>
                          <sla.icon className="w-3.5 h-3.5" />
                          <div className="flex flex-col leading-none">
                            <span className="text-[9px] font-black uppercase">{sla.label}</span>
                            <span className="text-[7px] font-black mt-0.5 uppercase">{sla.days} DIAS</span>
                          </div>
                       </div>
                    </td>
                    <td className="px-4 py-5 text-black font-black">{formatDate(r.openingDate)}</td>
                    <td className={`px-4 py-5 font-black ${r.returnDate ? 'text-amber-950' : 'text-gray-700'}`}>
                      {formatDate(r.returnDate)}
                    </td>
                    <td className="px-4 py-5 font-black text-[#003DA5] uppercase">{r.externalUser}</td>
                    <td className="px-6 py-5 uppercase font-black text-black">{r.user}</td>
                    <td className="px-6 py-5 text-center" onClick={e => e.stopPropagation()}>
                       <div className="flex items-center justify-center gap-2">
                          <button onClick={() => onEdit(r)} className="p-2.5 bg-gray-100 rounded-xl hover:bg-[#003DA5] hover:text-white transition-all text-gray-700"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => onDelete(r.id)} className="p-2.5 bg-gray-100 rounded-xl hover:bg-[#D91B2A] hover:text-white transition-all text-gray-700"><Trash2 className="w-3.5 h-3.5" /></button>
                       </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-blue-50">
                      <td colSpan={8} className="px-8 md:px-16 py-10 border-b-2 border-blue-100">
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                           <div className="lg:col-span-2 space-y-6">
                              <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-gray-200">
                                <h4 className="text-[10px] font-black text-[#003DA5] uppercase tracking-widest flex items-center gap-2 border-b-2 border-blue-50 pb-3 mb-4">
                                  <Clock className="w-4 h-4" /> Detalhamento do Erro de Regra
                                </h4>
                                <p className="text-[11px] leading-relaxed text-gray-900 font-bold whitespace-pre-wrap">{r.description || 'Nenhuma descrição técnica informada.'}</p>
                              </div>
                              <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-gray-200">
                                <h4 className="text-[10px] font-black text-blue-800 uppercase tracking-widest flex items-center gap-2 border-b-2 border-blue-50 pb-3 mb-4">
                                  <MessageSquare className="w-4 h-4" /> Cenários & Validações
                                </h4>
                                <p className="text-[11px] leading-relaxed text-gray-900 font-bold whitespace-pre-wrap">{r.scenarios || 'Nenhum cenário registrado.'}</p>
                              </div>
                              <div className="flex flex-wrap gap-4">
                                <div className="px-4 py-2 bg-white border border-gray-200 rounded-xl">
                                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Usuário Criador</p>
                                  <p className="text-[10px] font-bold text-gray-700">{r.creatorUser || 'N/A'}</p>
                                </div>
                                <div className="px-4 py-2 bg-white border border-gray-200 rounded-xl">
                                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Origem</p>
                                  <p className="text-[10px] font-bold text-gray-700 uppercase">{r.origin || 'manual'}</p>
                                </div>
                                <div className="px-4 py-2 bg-white border border-gray-200 rounded-xl">
                                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Criado em</p>
                                  <p className="text-[10px] font-bold text-gray-700">{r.createdAt ? new Date(r.createdAt).toLocaleString('pt-BR') : '-'}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-3 pt-4 border-t-2 border-blue-50">
                                <button 
                                  onClick={() => onOpenCase?.(r.caseId)}
                                  className="px-4 py-2 bg-[#003DA5] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-800 transition-all flex items-center gap-2 active:scale-95 shadow-md"
                                >
                                  <ShieldCheck className="w-4 h-4" /> Agir
                                </button>
                                <button 
                                  onClick={() => onAddTreatment?.({
                                    id: crypto.randomUUID(),
                                    title: `Tratativa Case ${r.caseId}`,
                                    description: `Tratativa iniciada para o case ${r.caseId} (${r.status})`,
                                    responsible: currentUserName || '',
                                    priority: 'Ação necessária',
                                    deadline: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
                                    status: 'Aberta',
                                    origin: 'table',
                                    usuario_criador: currentUserName || 'Sistema',
                                    criado_em: new Date().toISOString(),
                                    atualizado_em: new Date().toISOString()
                                  })}
                                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-95 shadow-md"
                                >
                                  <Plus className="w-4 h-4" /> Abrir tratativa
                                </button>
                                <button 
                                  onClick={() => onOpenCase?.(r.normalizedCategory || r.caseId)}
                                  className="px-4 py-2 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 active:scale-95"
                                >
                                  <Search className="w-4 h-4" /> Ver cases relacionados
                                </button>
                                <button 
                                  onClick={() => {
                                    onEdit({ ...r, previousCaseId: 'LINKED' });
                                    alert('Modo de vinculação de reincidência ativado para este case.');
                                  }}
                                  className="px-4 py-2 bg-amber-100 border-2 border-amber-300 text-amber-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-200 transition-all flex items-center gap-2 active:scale-95"
                                >
                                  <Link2 className="w-4 h-4" /> Vincular reincidência
                                </button>
                              </div>
                           </div>
                           <div className="space-y-6">
                              <h4 className="text-[10px] font-black text-[#D91B2A] uppercase tracking-widest flex items-center gap-2 border-b-2 border-red-200 pb-2">
                                <Calendar className="w-4 h-4" /> Timeline Operacional
                              </h4>
                              <div className="space-y-3">
                                <div className="flex justify-between items-center text-[10px] bg-white p-3 rounded-xl border-2 border-gray-200">
                                  <span className="font-black text-gray-700 uppercase">Abertura:</span>
                                  <span className="font-black text-gray-900">{formatDate(r.openingDate)}</span>
                                </div>
                                {r.returnDate && (
                                  <div className="flex justify-between items-center text-[10px] bg-amber-50 p-3 rounded-xl border-2 border-amber-300">
                                    <span className="font-black text-amber-800 uppercase">Retorno:</span>
                                    <span className="font-black text-amber-900">{formatDate(r.returnDate)}</span>
                                  </div>
                                )}
                                {r.conclusionDate && (
                                  <div className="flex justify-between items-center text-[10px] bg-emerald-50 p-3 rounded-xl border-2 border-emerald-300">
                                    <span className="font-black text-emerald-800 uppercase">Conclusão:</span>
                                    <span className="font-black text-emerald-900">{formatDate(r.conclusionDate)}</span>
                                  </div>
                                )}
                              </div>
                           </div>
                           <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border-2 border-gray-200 flex flex-col items-center justify-center text-center h-fit">
                              <p className="text-[9px] font-black text-gray-600 uppercase mb-4 tracking-widest leading-none">Cálculo de Prazo</p>
                              <div className="flex items-end justify-center gap-2">
                                 <span className={`text-6xl font-black tracking-tighter leading-none ${sla.label === 'CRÍTICO' ? 'text-red-700' : 'text-[#003DA5]'}`}>
                                   {sla.days}
                                 </span>
                                 <span className="text-[10px] font-black text-gray-500 uppercase mb-2">Dias</span>
                              </div>
                              <div className="mt-6 px-4 py-2 bg-gray-100 rounded-full border border-gray-200">
                                <p className="text-[8px] font-black text-gray-900 uppercase">{sla.type}</p>
                              </div>
                           </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
