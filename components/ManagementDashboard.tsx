import React, { useMemo, useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  AlertTriangle, 
  Clock, 
  Users, 
  ClipboardList, 
  Search, 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus,
  AlertCircle,
  CheckCircle2,
  Tag,
  ShieldCheck,
  Bot,
  Plus
} from 'lucide-react';
import { 
  TicketRecord, 
  MuralPost, 
  WeeklyRankingItem, 
  AutomaticAlert, 
  MuralTreatment
} from '../types';
import { 
  calculateRanking, 
  calculateAutomaticAlerts, 
  calculateOperationalDashboard,
  generateExecutiveInsight,
  calculateThemeTrends,
  ThemeTrend,
  calculateAutomaticInsights
} from '../src/services/analyticsService';
import { format, parseISO, isSameDay, isAfter, subDays, startOfDay, startOfMonth } from 'date-fns';

interface ManagementDashboardProps {
  records: TicketRecord[];
  posts: MuralPost[];
  tratativas: MuralTreatment[];
  onViewSubject: (subject: string) => void;
  onViewTreatment: (treatment: MuralTreatment) => void;
  onOpenCase: (caseId: string) => void;
  onAddTreatment: (treatment: MuralTreatment) => void;
}

const ManagementDashboard: React.FC<ManagementDashboardProps> = ({ 
  records, 
  posts,
  tratativas,
  onViewSubject,
  onViewTreatment,
  onOpenCase,
  onAddTreatment
}) => {
  // Filtros
  const [viewMode, setViewMode] = useState<'operacional' | 'executivo'>('operacional');

  const [filters, setFilters] = useState({
    period: '7d', // 7d, 15d, 30d, month, comparison
    responsible: 'all',
    priority: 'all',
    status: 'all',
    subject: '',
    onlyCritical: false,
    onlyDelayed: false,
    onlyFormalRecurrent: false
  });

  // Lógica de períodos
  const getPeriodDates = (period: string) => {
    const now = new Date();
    const today = startOfDay(now);
    let start;
    let prevStart;
    let prevEnd;

    switch (period) {
      case '7d':
        start = startOfDay(subDays(now, 7));
        prevStart = startOfDay(subDays(start, 7));
        prevEnd = start;
        break;
      case '15d':
        start = startOfDay(subDays(now, 15));
        prevStart = startOfDay(subDays(start, 15));
        prevEnd = start;
        break;
      case '30d':
        start = startOfDay(subDays(now, 30));
        prevStart = startOfDay(subDays(start, 30));
        prevEnd = start;
        break;
      case 'month':
      case 'comparison':
        start = startOfMonth(now);
        prevStart = startOfMonth(subDays(start, 1));
        prevEnd = start;
        break;
      default:
        start = startOfDay(subDays(now, 7));
        prevStart = startOfDay(subDays(start, 7));
        prevEnd = start;
    }
    return { start, today, prevStart, prevEnd };
  };

  const { start: periodStart, today, prevStart, prevEnd } = useMemo(() => getPeriodDates(filters.period), [filters.period]);

  // Filtragem de dados (Período Atual)
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const date = parseISO(r.openingDate);
      if (!(isAfter(date, periodStart) || isSameDay(date, periodStart))) return false;
      
      if (filters.subject && r.normalizedCategory !== filters.subject) return false;
      if (filters.onlyCritical && r.criticalityScore < 3) return false;
      if (filters.onlyFormalRecurrent && !r.isFormalRecurrent) return false;
      
      return true;
    });
  }, [records, periodStart, filters.subject, filters.onlyCritical, filters.onlyFormalRecurrent]);

  // Filtragem de dados (Período Anterior para Comparação)
  const prevPeriodRecords = useMemo(() => {
    return records.filter(r => {
      const date = parseISO(r.openingDate);
      return (isAfter(date, prevStart) || isSameDay(date, prevStart)) && isAfter(prevEnd, date);
    });
  }, [records, prevStart, prevEnd]);

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      const associatedCase = records.find(r => r.caseId === p.caseId);
      if (associatedCase) {
        const date = parseISO(associatedCase.openingDate);
        if (!(isAfter(date, periodStart) || isSameDay(date, periodStart))) return false;
      }
      
      if (filters.subject && p.subject !== filters.subject) return false;
      if (filters.onlyCritical && p.criticality !== 'Crítico') return false;
      
      return true;
    });
  }, [posts, records, periodStart, filters.subject, filters.onlyCritical]);

  const filteredTreatments = useMemo(() => {
    return tratativas.filter(t => {
      const date = parseISO(t.criado_em);
      if (!(isAfter(date, periodStart) || isSameDay(date, periodStart))) return false;
      
      if (filters.responsible !== 'all' && t.responsible !== filters.responsible) return false;
      if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
      if (filters.status !== 'all' && t.status !== filters.status) return false;
      if (filters.subject && t.subject !== filters.subject) return false;
      
      if (filters.onlyDelayed && (!t.deadline || new Date(t.deadline) >= new Date() || t.status === 'Concluída')) return false;
      if (filters.onlyCritical && t.priority !== 'Crítico') return false;
      
      return true;
    });
  }, [tratativas, periodStart, filters.responsible, filters.priority, filters.status, filters.subject, filters.onlyDelayed, filters.onlyCritical]);

  // Cálculos baseados nos filtros
  const ranking = useMemo(() => calculateRanking(filteredRecords), [filteredRecords]);
  const themeTrends = useMemo(() => calculateThemeTrends(filteredRecords, prevPeriodRecords), [filteredRecords, prevPeriodRecords]);
  const alerts = useMemo(() => calculateAutomaticAlerts(filteredRecords, filteredPosts, prevPeriodRecords, filteredTreatments), [filteredRecords, filteredPosts, prevPeriodRecords, filteredTreatments]);
  const operational = useMemo(() => calculateOperationalDashboard(filteredTreatments, filteredRecords, filteredPosts), [filteredTreatments, filteredRecords, filteredPosts]);
  const automaticInsights = useMemo(() => calculateAutomaticInsights(filteredRecords, filteredPosts, filteredTreatments), [filteredRecords, filteredPosts, filteredTreatments]);
  const insight = useMemo(() => generateExecutiveInsight(ranking, alerts, filteredPosts, filteredRecords, filteredTreatments), [ranking, alerts, filteredPosts, filteredRecords, filteredTreatments]);

  // KPIs para comparação
  const kpis = useMemo(() => {
    const currentCount = filteredRecords.length;
    const prevCount = prevPeriodRecords.length;
    const countTrend = prevCount > 0 ? Math.round(((currentCount - prevCount) / prevCount) * 100) : 0;

    const currentFormal = filteredRecords.filter(r => r.isFormalRecurrent).length;
    const prevFormal = prevPeriodRecords.filter(r => r.isFormalRecurrent).length;
    const formalTrend = prevFormal > 0 ? Math.round(((currentFormal - prevFormal) / prevFormal) * 100) : 0;

    const currentRecurrent = filteredRecords.filter(r => r.isRecurrent).length;
    const prevRecurrent = prevPeriodRecords.filter(r => r.isRecurrent).length;
    const recurrentTrend = prevRecurrent > 0 ? Math.round(((currentRecurrent - prevRecurrent) / prevRecurrent) * 100) : 0;

    return {
      cases: { value: currentCount, trend: countTrend },
      formal: { value: currentFormal, trend: formalTrend },
      recurrent: { value: currentRecurrent, trend: recurrentTrend },
      alerts: { value: alerts.length },
      delayed: { value: operational.delayedCount }
    };
  }, [filteredRecords, prevPeriodRecords, alerts, operational]);

  const responsibles = useMemo(() => {
    const set = new Set<string>();
    tratativas.forEach(t => {
      if (t.responsible) set.add(t.responsible);
    });
    posts.forEach(p => {
      if (p.treatment?.responsible) set.add(p.treatment.responsible);
    });
    return Array.from(set).sort();
  }, [posts, tratativas]);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.normalizedCategory) set.add(r.normalizedCategory);
    });
    return Array.from(set).sort();
  }, [records]);

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER & FILTROS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Painel de Gestão</h1>
            <p className="text-slate-500 text-sm">Foco em decisão e acompanhamento operacional</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl mr-2">
              <button
                onClick={() => setViewMode('operacional')}
                className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${viewMode === 'operacional' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
              >
                OPERACIONAL
              </button>
              <button
                onClick={() => setViewMode('executivo')}
                className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${viewMode === 'executivo' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
              >
                EXECUTIVO
              </button>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl">
              {[
                { id: '7d', label: '7D' },
                { id: '15d', label: '15D' },
                { id: '30d', label: '30D' },
                { id: 'month', label: 'Mês' }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setFilters(prev => ({ ...prev, period: p.id }))}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${filters.period === p.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="h-6 w-px bg-slate-200 mx-1"></div>

            <select 
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              value={filters.responsible}
              onChange={e => setFilters(prev => ({ ...prev, responsible: e.target.value }))}
            >
              <option value="all">Filtro: Responsável</option>
              {responsibles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>

      {viewMode === 'executivo' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* 1. SITUAÇÃO CRÍTICA */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-[17px] font-black text-slate-800 tracking-tight uppercase">Situação Crítica</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {alerts.slice(0, 3).map((alert, idx) => (
                <div key={idx} className="p-6 rounded-[32px] bg-slate-50 border border-slate-100 relative overflow-hidden group hover:border-red-200 transition-all">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>
                  <p className="text-[11px] font-black text-red-600 uppercase tracking-widest mb-2">{alert.type}</p>
                  <h3 className="text-[16px] font-black text-slate-800 mb-3 leading-tight">{alert.title}</h3>
                  <p className="text-[14px] text-slate-500 leading-relaxed font-medium">{alert.message}</p>
                </div>
              ))}
              {alerts.length === 0 && (
                <div className="col-span-3 py-16 text-center bg-emerald-50 rounded-[40px] border border-emerald-100">
                  <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4 opacity-50" />
                  <p className="text-xl font-black text-emerald-800 uppercase tracking-tight italic">Operação sob controle</p>
                </div>
              )}
            </div>
          </div>

          {/* 2. RESPONSÁVEIS (CARGA RELEVANTE) */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Users className="w-6 h-6 text-slate-600" />
              </div>
              <h2 className="text-[17px] font-black text-slate-800 tracking-tight uppercase">Responsáveis (Foco Atual)</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {operational.responsibleLoad.slice(0, 8).map((res, idx) => (
                <div key={idx} className="p-6 rounded-[32px] bg-slate-50 border border-slate-100 flex flex-col gap-4 group hover:bg-white hover:border-indigo-100 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-lg">
                      {res.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-[15px]">{res.name}</p>
                      <p className="text-[12px] font-black text-indigo-600 opacity-60 uppercase">{res.count} TRATATIVAS</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {res.delayed > 0 && (
                      <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-black uppercase">
                        {res.delayed} em atraso
                      </span>
                    )}
                    {res.critical > 0 && (
                      <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase">
                        {res.critical} críticas
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. LEITURA DO CENÁRIO */}
          <div className="bg-slate-900 rounded-[48px] p-12 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                <div className="bg-white/10 p-2 rounded-xl">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-black uppercase tracking-tighter italic">Leitura do Cenário</h2>
              </div>
              <p className="text-[20px] font-medium leading-relaxed text-indigo-50 italic max-w-5xl">
                "{insight.recommendation}"
              </p>
              <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-10 pt-10 border-t border-white/10 text-center sm:text-left">
                <div className="space-y-1">
                  <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">Foco Principal</span>
                  <p className="text-[16px] font-bold">{insight.mainProblem}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">Volume Reincidência</span>
                  <p className="text-[16px] font-bold">{insight.reincidence}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">Tendência do Período</span>
                  <p className="text-[16px] font-bold uppercase">{insight.trend}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* LINHA 1 — RESUMO (KPIs) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          title="TOTAL DE CASES" 
          value={kpis.cases.value} 
          icon={<ClipboardList className="w-5 h-5" />} 
          color="blue"
        />
        <KPICard 
          title="TRATATIVAS ABERTAS" 
          value={operational.totalActiveTreatments} 
          icon={<Tag className="w-5 h-5" />} 
          color="indigo"
        />
        <KPICard 
          title="TRATATIVAS EM ATRASO" 
          value={operational.delayedCount} 
          icon={<Clock className="w-5 h-5" />} 
          color="red"
          isCritical={operational.delayedCount > 0}
        />
        <KPICard 
          title="REINCIDÊNCIA" 
          value={kpis.formal.value} 
          icon={<TrendingUp className="w-5 h-5" />} 
          color="amber"
          isCritical={kpis.formal.value > 0}
        />
      </div>

      {/* LINHA 2 — SITUAÇÃO E CARGA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* BLOCO: SITUAÇÃO ATUAL */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2 h-6 bg-red-600 rounded-full"></div>
            <h2 className="text-[16px] font-black uppercase tracking-tight text-slate-800">Situação Atual</h2>
          </div>
          
          <div className="space-y-3 flex-1">
            {alerts.slice(0, 4).map((alert, idx) => (
              <div 
                key={idx} 
                className={`p-4 rounded-xl border flex items-start gap-3 transition-all hover:translate-x-1 ${
                  alert.severity === 'critical' ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'
                }`}
              >
                <div className={`mt-1 p-1.5 rounded-md ${alert.severity === 'critical' ? 'bg-red-200 text-red-700' : 'bg-slate-200 text-slate-600'}`}>
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[14px] font-black text-slate-800 leading-tight mb-1">{alert.title}</p>
                  <p className="text-[13px] text-slate-500 line-clamp-2 mb-3">{alert.message}</p>
                  
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button 
                      onClick={() => onOpenCase(alert.title.split(' ')[0])}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Agir
                    </button>
                    <button 
                      onClick={() => onAddTreatment({
                        id: crypto.randomUUID(),
                        title: `Tratativa Emergencial: ${alert.title}`,
                        description: alert.message,
                        responsible: '',
                        priority: 'Crítico',
                        deadline: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
                        status: 'Aberta',
                        origin: 'dashboard',
                        usuario_criador: 'Sistema',
                        criado_em: new Date().toISOString(),
                        atualizado_em: new Date().toISOString()
                      })}
                      className="px-3 py-1.5 bg-[#003DA5] text-white rounded-lg text-[9px] font-black uppercase hover:bg-blue-800 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Abrir tratativa
                    </button>
                    <button 
                      onClick={() => onOpenCase(alert.title)}
                      className="px-3 py-1.5 bg-white border-2 border-slate-200 text-slate-700 rounded-lg text-[9px] font-black uppercase hover:bg-slate-50 transition-all flex items-center gap-1.5"
                    >
                      <Search className="w-3.5 h-3.5" /> Ver cases relacionados
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                <CheckCircle2 className="w-12 h-12 mb-2 opacity-20" />
                <p className="text-[10px] font-black uppercase">Nenhuma situação pendente</p>
              </div>
            )}
          </div>
        </div>

        {/* BLOCO: RESPONSÁVEIS */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2 h-6 bg-indigo-600 rounded-full"></div>
            <h2 className="text-[16px] font-black uppercase tracking-tight text-slate-800">Responsáveis</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
            {operational.responsibleLoad.slice(0, 6).map((res, idx) => (
              <div 
                key={idx} 
                className="p-5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between group hover:bg-white hover:border-indigo-200 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-base font-black shadow-sm group-hover:scale-105 transition-transform">
                    {res.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[14px] font-black text-slate-800">{res.name}</p>
                    <p className="text-[13px] text-slate-400 font-bold uppercase">{res.count} TRATATIVAS</p>
                    <button 
                      onClick={() => setFilters(prev => ({ ...prev, responsible: res.name }))}
                      className="mt-1 text-[8px] font-black text-indigo-600 uppercase hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Agir / Filtrar
                    </button>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {res.delayed > 0 && (
                    <div className="px-2 py-1 bg-red-100 text-red-700 rounded-lg flex flex-col items-center min-w-[50px]">
                      <span className="text-[12px] font-black leading-none">{res.delayed}</span>
                      <span className="text-[8px] font-black tracking-tighter uppercase">ATRASOS</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {operational.responsibleLoad.length === 0 && (
              <div className="col-span-2 flex flex-col items-center justify-center py-12 text-slate-300">
                <Users className="w-12 h-12 mb-2 opacity-20" />
                <p className="text-[10px] font-black uppercase">Sem carga ativa</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LINHA 3 — PRIORITÁRIAS E REINCIDÊNCIA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BLOCO: TRATATIVAS PRIORITÁRIAS */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2 bg-slate-50/30">
            <ClipboardList className="w-5 h-5 text-slate-400" />
            <h2 className="text-[16px] font-black uppercase tracking-tight text-slate-800">Tratativas Prioritárias</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Assunto / Título</th>
                  <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                  <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">Prazo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTreatments
                  .sort((a, b) => {
                    const isADelayed = a.deadline && new Date(a.deadline) < new Date() && a.status !== 'Concluída';
                    const isBDelayed = b.deadline && new Date(b.deadline) < new Date() && b.status !== 'Concluída';
                    if (a.priority === 'Crítico' && b.priority !== 'Crítico') return -1;
                    if (isADelayed && !isBDelayed) return -1;
                    return 0;
                  })
                  .slice(0, 5)
                  .map((t, idx) => (
                    <tr 
                      key={idx} 
                      className="group hover:bg-indigo-50/30 transition-colors cursor-pointer"
                      onClick={() => onViewTreatment(t)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-between group/row">
                          <div>
                            <p className="text-[14px] font-bold text-slate-700 line-clamp-1">{t.subject || t.title}</p>
                            <p className="text-[11px] text-slate-400 uppercase font-bold">{t.responsible}</p>
                          </div>
                          
                          <div className="flex gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => { e.stopPropagation(); onOpenCase(t.case_numero || t.title); }}
                              className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[8px] font-black uppercase hover:bg-slate-50 transition-all flex items-center gap-1"
                            >
                              <Search className="w-3 h-3" /> Ver cases relacionados
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); onViewTreatment(t); }}
                              className="px-2 py-1 bg-emerald-600 text-white rounded-md text-[8px] font-black uppercase hover:bg-emerald-700 transition-all flex items-center gap-1"
                            >
                              <ShieldCheck className="w-3 h-3" /> Agir
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                          t.status === 'Concluída' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col">
                          <span className={`text-[13px] font-black ${
                            t.deadline && new Date(t.deadline) < new Date() && t.status !== 'Concluída' ? 'text-red-500' : 'text-slate-600'
                          }`}>
                            {t.deadline ? format(parseISO(t.deadline), 'dd/MM') : '-'}
                          </span>
                          {t.priority === 'Crítico' && <span className="text-[10px] text-red-600 font-black">CRÍTICO</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* BLOCO: REINCIDÊNCIA */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h2 className="text-[16px] font-black uppercase tracking-tight text-slate-800">Reincidência por Tema</h2>
          </div>
          <div className="space-y-3">
            {ranking.filter(r => r.recurrences > 0).slice(0, 5).map((item, idx) => (
              <div 
                key={idx} 
                className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100 group hover:border-indigo-200 transition-all cursor-pointer"
                onClick={() => onViewSubject(item.category)}
              >
                <div className="flex-1 truncate pr-4">
                  <p className="text-[14px] font-bold text-slate-700 truncate" title={item.category}>
                    {item.category}
                  </p>
                  <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onViewSubject(item.category); }}
                      className="text-[9px] font-black text-blue-600 uppercase hover:underline"
                    >
                      Ver cases relacionados
                    </button>
                    <span className="text-slate-300 text-[9px]">|</span>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onAddTreatment({
                          id: crypto.randomUUID(),
                          title: `Tratativa Reincidência: ${item.category}`,
                          description: `Tratativa automática para tema recorrente: ${item.category}`,
                          responsible: '',
                          priority: item.recurrences > 5 ? 'Crítico' : 'Ação necessária',
                          deadline: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
                          status: 'Aberta',
                          origin: 'dashboard',
                          usuario_criador: 'Sistema',
                          criado_em: new Date().toISOString(),
                          atualizado_em: new Date().toISOString()
                        });
                        alert('Tratativa de reincidência vinculada à fila de execução.');
                      }}
                      className="text-[9px] font-black text-emerald-600 uppercase hover:underline"
                    >
                      Vincular reincidência
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-white border border-slate-200 text-slate-500 rounded-lg text-[11px] font-black">
                    {item.occurrences} CASES
                  </span>
                  <span className={`px-2 py-1 rounded-lg text-[11px] font-black ${
                    item.recurrences > 5 ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {item.recurrences} REINCIDÊNCIAS
                  </span>
                </div>
              </div>
            ))}
            {ranking.filter(r => r.recurrences > 0).length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                <ShieldCheck className="w-12 h-12 mb-2 opacity-20" />
                <p className="text-[10px] font-black uppercase">Sem reincidências formais</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FOOTER: LEITURA GERENCIAL E AÇÕES RÁPIDAS */}
      <div className="mt-12 bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-xl shadow-blue-900/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#003DA5]/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        
        <div className="flex flex-col lg:flex-row items-center justify-between gap-10">
          <div className="flex-1 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-[#003DA5] rounded-full text-[9px] font-black uppercase tracking-widest">
              <Bot className="w-3.5 h-3.5" />
              Leitura Gerencial do Período
            </div>
            <p className="text-lg font-bold text-slate-800 leading-relaxed italic">
              "{insight.recommendation}"
            </p>
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Foco Principal</span>
                <span className="text-xs font-black text-slate-700 uppercase">{insight.mainProblem}</span>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tendência Sugerida</span>
                <span className="text-xs font-black text-emerald-600 uppercase">{insight.trend}</span>
              </div>
            </div>
          </div>

          <div className="shrink-0 flex flex-wrap items-center gap-4">
                    <button 
                      onClick={() => {
                        const critical = alerts.find(a => a.severity === 'critical');
                        if (critical) onOpenCase(critical.title.split(' ')[0]);
                        else alert("Nenhum tema crítico isolado para ação imediata via dashboard.");
                      }}
                      className="px-8 py-4 bg-emerald-600 text-white rounded-[1.25rem] text-[11px] font-black uppercase tracking-widest shadow-lg hover:shadow-xl hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-95"
                    >
                      <ShieldCheck className="w-4.5 h-4.5" />
                      Agir no Crítico
                    </button>
                    <button 
                      onClick={() => onAddTreatment({
                        id: crypto.randomUUID(),
                        title: `Plano Estratégico: ${insight.mainProblem}`,
                        description: insight.recommendation,
                        responsible: '',
                        priority: 'Ação necessária',
                        deadline: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
                        status: 'Aberta',
                        origin: 'dashboard',
                        usuario_criador: 'Sistema',
                        criado_em: new Date().toISOString(),
                        atualizado_em: new Date().toISOString()
                      })}
                      className="px-8 py-4 bg-[#003DA5] text-white rounded-[1.25rem] text-[11px] font-black uppercase tracking-widest shadow-lg hover:shadow-xl hover:bg-blue-800 transition-all flex items-center gap-2 active:scale-95"
                    >
                      <Plus className="w-4.5 h-4.5" />
                      Abrir tratativa estratégica
                    </button>
          </div>
        </div>
      </div>
    </>
  )}
</div>
  );
};

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: number;
  color: 'blue' | 'amber' | 'red' | 'indigo';
  isCritical?: boolean;
  isText?: boolean;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, icon, trend, color, isCritical, isText }) => {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
    indigo: 'text-indigo-600 bg-indigo-50'
  };

  return (
    <div className={`bg-white p-5 rounded-2xl shadow-sm border ${isCritical ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
        <div className={`p-2 rounded-xl ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
      <div className="flex items-end justify-between">
        <h3 className={`font-black tracking-tighter leading-none ${isText ? 'text-sm' : 'text-2xl'} text-slate-800`}>
          {value}
        </h3>
        {trend !== undefined && (
          <div className={`flex items-center text-[10px] font-black ${trend > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            {trend > 0 ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagementDashboard;
