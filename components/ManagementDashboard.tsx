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
  Plus,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { 
  TicketRecord, 
  MuralPost, 
  WeeklyRankingItem, 
  AutomaticAlert, 
  MuralTreatment,
  TicketStatus
} from '../types';
import { 
  calculateRanking, 
  calculateAutomaticAlerts, 
  calculateOperationalDashboard,
  generateExecutiveInsight,
  calculateThemeTrends,
  ThemeTrend,
  calculateAutomaticInsights,
  calculateGrowthTrend
} from '../src/services/analyticsService';
import { format, parseISO, isSameDay, isAfter, subDays, startOfDay, startOfMonth, isValid, parse, differenceInDays } from 'date-fns';

const robustParse = (dateStr: string | undefined): Date => {
  if (!dateStr || dateStr === '-' || dateStr.trim() === '') return new Date(0);
  const iso = parseISO(dateStr);
  if (isValid(iso)) return iso;
  
  const patterns = ['dd/MM/yyyy', 'dd-MM-yyyy', 'dd/MM/yy', 'dd-MM-yy'];
  for (const p of patterns) {
    const parsed = parse(dateStr, p, new Date());
    if (isValid(parsed)) return parsed;
  }
  return new Date(0);
};

export interface NavigationContext {
  startDate?: string;
  endDate?: string;
  status?: string;
  type?: string;
  isFormalRecurrent?: boolean;
}

interface ManagementDashboardProps {
  records: TicketRecord[];
  posts: MuralPost[];
  tratativas: MuralTreatment[];
  userName: string;
  onViewSubject: (subject: string, context?: NavigationContext) => void;
  onViewTreatment: (treatment: MuralTreatment) => void;
  onViewCarga?: (userName: string, type: 'total' | 'waiting' | 'stale') => void;
  onViewMural?: (filters: { search?: string, mentions?: boolean, criticality?: string }) => void;
  onOpenCase: (caseId: string, context?: NavigationContext) => void;
  onAddTreatment: (treatment: MuralTreatment) => void;
}

const ManagementDashboard: React.FC<ManagementDashboardProps> = ({ 
  records, 
  posts,
  tratativas,
  userName,
  onViewSubject,
  onViewTreatment,
  onViewCarga,
  onViewMural,
  onOpenCase,
  onAddTreatment
}) => {
  // Estado das seções colapsáveis - Todas iniciam FECHADAS
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    status: false,
    responsibles: false,
    operational: false,
    themes: false,
    insights: false
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const [filters, setFilters] = useState({
    period: '30d',
    subject: ''
  });

  const [includeOldActiveCases, setIncludeOldActiveCases] = useState(false);

  // Lógica de períodos
  const getPeriodDates = (period: string) => {
    const now = new Date();
    if (period === 'all') {
      return { start: new Date(0), today: now };
    }
    
    const days = parseInt(period.replace('d', '')) || 30;
    const periodStart = subDays(now, days);
    return { start: startOfDay(periodStart), today: now };
  };

  const { start: periodStart, today } = useMemo(() => getPeriodDates(filters.period), [filters.period]);

  // Base Analítica Filtrada
  const filteredRecords = useMemo(() => {
    const activeStatusesForInclusion: TicketStatus[] = ['ABERTO', 'DEVOLVIDO'];
    return records.filter(r => {
      const date = robustParse(r.openingDate);
      const passedDateFilter = filters.period === 'all' ? true : (isAfter(date, periodStart) || isSameDay(date, periodStart));
      const isOldActive = includeOldActiveCases && activeStatusesForInclusion.includes(r.status);

      if (filters.subject && r.normalizedCategory !== filters.subject) return false;
      
      return passedDateFilter || isOldActive;
    });
  }, [records, periodStart, filters.subject, includeOldActiveCases, filters.period]);

  // Auxiliar para identificar retrabalho dinamicamente
  const getReturnInfo = (r: TicketRecord) => {
    const obs = (r.observations || '').toLowerCase();
    const keywords = ['devolvido', 'reaberto', 'reabertura', 'retorno incorreto', 'devolução'];
    let count = 0;
    
    keywords.forEach(kw => {
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = obs.match(regex);
      if (matches) count += matches.length;
    });

    const statusIsDevolvido = r.status.toUpperCase() === 'DEVOLVIDO';
    const finalCount = count + (statusIsDevolvido && count === 0 ? 1 : 0);

    return {
      wasReturned: finalCount > 0,
      count: finalCount
    };
  };

  // Cálculo do Resumo Operacional
  const operationalSummary = useMemo(() => {
    const activeStatuses: TicketStatus[] = ['ABERTO', 'EM ANALISE', 'AGUARDANDO', 'DEVOLVIDO'];
    const activeCases = filteredRecords.filter(r => activeStatuses.includes(r.status));
    const now = new Date();

    const withMural = activeCases.filter(r => posts.some(p => p.caseId === r.caseId)).length;
    
    // Novas métricas de Inteligência Mural
    const devolvidosSemMural = activeCases.filter(r => 
      (r.status === 'DEVOLVIDO' || r.status === 'DEVOLVER SOVOS') && 
      !posts.some(p => p.caseId === r.caseId)
    ).length;

    const fiveDaysAgo = subDays(now, 5);
    const semAtualizacaoMural = activeCases.filter(r => {
      const casePosts = posts.filter(p => p.caseId === r.caseId);
      if (casePosts.length === 0) return false; 
      const lastPostDate = new Date(Math.max(...casePosts.map(p => new Date(p.createdAt).getTime())));
      return isAfter(fiveDaysAgo, lastPostDate);
    }).length;

    const myMentions = posts.filter(p => 
      p.status !== 'Encerrado' && (
        p.mentions.some(m => m.toLowerCase() === (userName || '').toLowerCase()) ||
        p.description.toLowerCase().includes(`@${(userName || '').toLowerCase()}`)
      )
    ).length;

    const aguardando = activeCases.filter(r => !r.returnDate || r.returnDate.trim() === '' || r.returnDate === '-').length;
    const retrabalhoSovos = activeCases.filter(r => r.status === 'DEVOLVER SOVOS' || r.status === 'DEVOLVIDO').length;
    const historicoRetrabalho = filteredRecords.filter(r => getReturnInfo(r).wasReturned).length;
    const reincidencia = filteredRecords.filter(r => 
      r.isFormalRecurrent || 
      (r.previousCaseId && String(r.previousCaseId).trim() && !['N/A', 'NA', '-', '0'].includes(String(r.previousCaseId).toUpperCase().trim()))
    ).length;

    // Calculando "Sem Movimentação" conforme nova regra
    const threeDaysAgo = subDays(new Date(), 3);
    const staleCount = activeCases.filter(r => {
      const openingDate = robustParse(r.openingDate);
      const returnDate = r.returnDate ? robustParse(r.returnDate) : null;
      const lastMovement = returnDate && isAfter(returnDate, openingDate) ? returnDate : openingDate;
      return isAfter(threeDaysAgo, lastMovement);
    }).length;

    return {
      total: filteredRecords.length,
      withMural,
      devolvidosSemMural,
      semAtualizacaoMural,
      myMentions,
      withoutMural: staleCount, // Usando a nova métrica de "Sem Movimentação" aqui
      aguardando,
      retrabalhoSovos,
      historicoRetrabalho,
      reincidencia
    };
  }, [filteredRecords, posts, userName]);

  // Lógica de "O que precisa de atenção agora" (Top 3)
  const attentionItems = useMemo(() => {
    const items = [];
    const activeStatuses: TicketStatus[] = ['ABERTO', 'EM ANALISE', 'AGUARDANDO', 'DEVOLVER SOVOS', 'DEVOLVIDO'];

    // 1. Retrabalho Sovos
    const sovostop = filteredRecords.filter(r => r.status === 'DEVOLVER SOVOS' || r.status === 'DEVOLVIDO')[0];
    if (sovostop) {
      items.push({
        type: 'AÇÃO IMEDIATA',
        title: sovostop.caseId || 'Case',
        subtitle: sovostop.subject || sovostop.description,
        meta: 'Status: Devolvido',
        severity: 'critical',
        action: () => onOpenCase(sovostop.caseId),
        icon: <ArrowUpRight className="w-5 h-5" />
      });
    }

    // 2. Sem movimentação (Regra FSJ)
    const threeDaysAgo = subDays(new Date(), 3);
    const activeCases = records.filter(r => activeStatuses.includes(r.status));
    
    const staleCases = activeCases.filter(r => {
      const openingDate = robustParse(r.openingDate);
      const returnDate = r.returnDate ? robustParse(r.returnDate) : null;
      
      const lastMovement = returnDate && isAfter(returnDate, openingDate) ? returnDate : openingDate;
      return isAfter(threeDaysAgo, lastMovement);
    });

    if (staleCases.length > 0 && items.length < 3) {
      const topStale = staleCases[0];
      items.push({
        type: 'ATENÇÃO',
        title: `${staleCases.length} cases sem movimentação`,
        subtitle: `Destaque: ${topStale.caseId}`,
        meta: 'Sem acompanhamento ou retorno recente',
        severity: 'warning',
        action: () => onOpenCase(topStale.caseId),
        icon: <Clock className="w-5 h-5" />
      });
    }

    // 3. Aguardando
    const aguardandoTop = filteredRecords.filter(r => !r.returnDate || r.returnDate.trim() === '' || r.returnDate === '-')[0];
    if (aguardandoTop && items.length < 3) {
      items.push({
        type: 'PENDÊNCIA',
        title: aguardandoTop.caseId || 'Case',
        subtitle: aguardandoTop.subject || aguardandoTop.description,
        meta: 'Aguardando Retorno Sovos',
        severity: 'info',
        action: () => onOpenCase(aguardandoTop.caseId),
        icon: <Minus className="w-5 h-5" />
      });
    }

    return items;
  }, [filteredRecords, posts, onOpenCase]);

  // Carga por analista personalizada
  const analystLoad = useMemo(() => {
    const load: Record<string, { total: number, waiting: number, stale: number, withMural: number }> = {};
    const threeDaysAgo = subDays(new Date(), 3);
    const activeStatuses: TicketStatus[] = ['ABERTO', 'EM ANALISE', 'AGUARDANDO', 'DEVOLVER SOVOS', 'DEVOLVIDO'];

    filteredRecords.forEach(r => {
      const resp = r.externalUser || 'Sem Responsável';
      if (!load[resp]) load[resp] = { total: 0, waiting: 0, stale: 0, withMural: 0 };
      
      load[resp].total++;
      if (!r.returnDate || r.returnDate.trim() === '' || r.returnDate === '-') load[resp].waiting++;
      
      const casePosts = posts.filter(p => p.caseId === r.caseId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      if (casePosts.length > 0) load[resp].withMural++;
      
      const isActive = activeStatuses.includes(r.status);
      if (isActive) {
        const openingDate = robustParse(r.openingDate);
        const returnDate = r.returnDate ? robustParse(r.returnDate) : null;
        const lastMovement = returnDate && isAfter(returnDate, openingDate) ? returnDate : openingDate;
        
        if (isAfter(threeDaysAgo, lastMovement)) {
          load[resp].stale++;
        }
      }
    });

    return Object.entries(load).map(([name, stats]) => ({ name, ...stats }));
  }, [filteredRecords, posts]);

  // Temas Recorrentes
  const themesRanking = useMemo(() => calculateRanking(filteredRecords).slice(0, 5), [filteredRecords]);

  // Insights Operacionais - Traduzidos em Ações Concretas
  const insights = useMemo(() => {
    const list: Array<{ title: string; data: string; action: string; icon: React.ReactNode; filter?: any }> = [];
    
    // 1. Minhas Menções (Prioridade 1 no Dashboard)
    if (operationalSummary.myMentions > 0) {
      list.push({
        title: 'Suas Menções no Mural',
        data: `Você foi marcado em ${operationalSummary.myMentions} interações que aguardam seu comentário.`,
        action: 'Verificar posts onde você é o responsável ou consultado.',
        icon: <Users className="w-5 h-5 text-blue-300" />,
        filter: { mentions: true }
      });
    }

    // 2. Devolvidos sem acompanhamento
    if (operationalSummary.devolvidosSemMural > 0) {
      list.push({
        title: 'Devolvidos sem Intelligence',
        data: `${operationalSummary.devolvidosSemMural} cases devolvidos não possuem rastreio no Mural Operacional.`,
        action: 'Cobrar acompanhamento ou registrar status técnico no Mural.',
        icon: <AlertTriangle className="w-5 h-5 text-red-300" />,
        filter: { search: 'DEVOLVIDO' }
      });
    }

    // 3. Sem atualização recente
    if (operationalSummary.semAtualizacaoMural > 0) {
      list.push({
        title: 'Ausência de Interação',
        data: `${operationalSummary.semAtualizacaoMural} cases estão sem novas notas no Mural há mais de 5 dias.`,
        action: 'Verificar status com analista Sovos e atualizar o dashboard/mural.',
        icon: <Clock className="w-5 h-5 text-amber-300" />,
        filter: { criticality: 'Atenção' }
      });
    }

    // Fallbacks
    if (list.length < 3) {
      const devolvidosCount = filteredRecords.filter(r => r.status === 'DEVOLVIDO' || r.status === 'DEVOLVER SOVOS').length;
      if (devolvidosCount > 0 && !list.find(i => i.title.includes('Devolvidos'))) {
        list.push({
          title: 'Volume de Devolvidos',
          data: `${devolvidosCount} cases no status Devolvido/Devolver Sovos.`,
          action: 'Acompanhar retorno da SOVOS para evitar atrasos no SLA.',
          icon: <ArrowUpRight className="w-5 h-5 text-red-300" />
        });
      }
    }

    return list.slice(0, 3);
  }, [filteredRecords, operationalSummary]);

  // 3.3 FILA OPERACIONAL (PRIORIDADES) - Lógica de Classificação e Ordenação
  const queueRecords = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const activeStatuses: TicketStatus[] = ['ABERTO', 'EM ANALISE', 'AGUARDANDO', 'DEVOLVER SOVOS', 'DEVOLVIDO'];
    
    const classified = filteredRecords
      .filter(r => activeStatuses.includes(r.status))
      .map(r => {
        const openingDate = robustParse(r.openingDate);
        const returnDate = r.returnDate ? robustParse(r.returnDate) : null;
        
        // SLA Calculation (diff > 9 = crítico, diff > 5 = alerta)
        const finalDateForSla = returnDate ? startOfDay(returnDate) : today;
        const diffSla = Math.abs(differenceInDays(finalDateForSla, startOfDay(openingDate)));
        const isCriticalSla = diffSla > 9;
        const isAlertSla = diffSla > 5;

        // Movimentação
        const lastMovement = returnDate && isAfter(returnDate, openingDate) ? returnDate : openingDate;
        const daysSinceLastMovement = Math.abs(differenceInDays(now, lastMovement));

        let priority: 'ALTA' | 'MÉDIA' | 'BAIXA' = 'BAIXA';
        let priorityScore = 1;

        // PRIORIDADE ALTA: SLA = CRÍTICO OU STATUS = DEVOLVIDO
        if (isCriticalSla || r.status === 'DEVOLVIDO' || r.status === 'DEVOLVER SOVOS') {
          priority = 'ALTA';
          priorityScore = 3;
        } 
        // PRIORIDADE MÉDIA: SLA = ALERTA OU sem retorno (ou sem movimentação > 5 dias)
        else if (isAlertSla || !r.returnDate || r.returnDate.trim() === '' || r.returnDate === '-' || daysSinceLastMovement > 5) {
          priority = 'MÉDIA';
          priorityScore = 2;
        }
        // PRIORIDADE BAIXA: SLA = NO PRAZO - case recente
        else {
          priority = 'BAIXA';
          priorityScore = 1;
        }

        const retInfo = getReturnInfo(r);
        const slaLabel = isCriticalSla ? 'CRÍTICO' : (isAlertSla ? 'ALERTA' : 'NO PRAZO');

        return { ...r, priority, priorityScore, slaLabel, returnInfo: retInfo };
      });

    return classified
      .sort((a, b) => b.priorityScore - a.priorityScore || b.openingDate.localeCompare(a.openingDate))
      .slice(0, 10);
  }, [filteredRecords]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-700 max-w-5xl mx-auto">
      {/* 1. BLOCO PRINCIPAL (TOPO FIXO) */}
      <section className="bg-white rounded-[2.5rem] border-4 border-[#003DA5] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#003DA5]/5 rounded-full -mr-16 -mt-16" />
        
        <div className="flex items-center justify-between mb-8 relative z-10">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 shadow-inner">
                <AlertCircle className="w-7 h-7" />
             </div>
             <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">O que precisa de atenção agora</h2>
                <p className="text-[11px] font-black text-red-500 uppercase tracking-widest leading-none mt-1">Foco prioritário em ação</p>
             </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <select 
              value={filters.period}
              onChange={e => setFilters(prev => ({ ...prev, period: e.target.value }))}
              className="bg-slate-100 px-6 py-2 rounded-2xl text-[10px] font-black text-[#003DA5] uppercase cursor-pointer outline-none hover:bg-blue-50 transition-colors border-2 border-transparent focus:border-[#003DA5]"
            >
              <option value="10d">Últimos 10 dias</option>
              <option value="20d">Últimos 20 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="60d">Últimos 60 dias</option>
              <option value="90d">Últimos 90 dias</option>
              <option value="all">Todos</option>
            </select>
            
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={includeOldActiveCases}
                  onChange={(e) => setIncludeOldActiveCases(e.target.checked)}
                />
                <div className="w-10 h-5 bg-slate-100 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#003DA5]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#003DA5]"></div>
              </div>
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-tight group-hover:text-[#003DA5] transition-colors">Cases ativos antigos</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          {attentionItems.length > 0 ? attentionItems.map((item, idx) => (
            <div 
              key={idx} 
              onClick={item.action}
              className="group bg-slate-50 rounded-[2rem] border-2 border-slate-100 p-6 cursor-pointer hover:border-red-200 hover:bg-white hover:shadow-2xl hover:shadow-red-500/10 transition-all active:scale-[0.98]"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 shadow-sm ${
                item.severity === 'critical' ? 'bg-red-500 text-white' :
                item.severity === 'warning' ? 'bg-amber-500 text-white' :
                'bg-[#003DA5] text-white'
              }`}>
                {item.icon}
              </div>
              
              <div className="space-y-2">
                <p className={`text-[10px] font-black uppercase tracking-widest ${
                  item.severity === 'critical' ? 'text-red-600' :
                  item.severity === 'warning' ? 'text-amber-600' :
                  'text-[#003DA5]'
                }`}>
                  {item.type}
                </p>
                <h3 className="text-base font-black text-slate-900 leading-tight group-hover:text-red-700 transition-colors line-clamp-1 uppercase">
                  {item.title}
                </h3>
                <p className="text-[11px] font-bold text-slate-500 line-clamp-2 leading-relaxed">
                  {item.subtitle}
                </p>
                <div className="pt-3 border-t border-slate-100 mt-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{item.meta}</p>
                </div>
              </div>
            </div>
          )) : (
            <div className="col-span-3 py-12 flex flex-col items-center justify-center text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-4" />
              <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Tudo em ordem no momento!</p>
            </div>
          )}
        </div>
      </section>

      {/* 2. RESUMO OPERACIONAL (LINHA COMPACTA) */}
      <div className="bg-[#003DA5] rounded-[2rem] p-2 shadow-xl">
        <div className="flex flex-wrap items-center justify-around gap-4 px-6 py-2">
           <div className="flex items-center gap-2">
             <span className="text-[10px] font-black text-white/60 uppercase">Cases:</span>
             <span className="text-lg font-black text-white">{operationalSummary.total}</span>
           </div>
           <div className="w-px h-6 bg-white/20 hidden md:block" />
           <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onViewMural?.({})}>
             <span className="text-[10px] font-black text-white/60 uppercase">Com Mural:</span>
             <span className="text-lg font-black text-white">{operationalSummary.withMural}</span>
           </div>
           <div className="w-px h-6 bg-white/20 hidden md:block" />
           <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onViewMural?.({ criticality: 'Atenção' })}>
             <span className="text-[10px] font-black text-white/60 uppercase">Sem Atualização Mural:</span>
             <span className="text-lg font-black text-white">{operationalSummary.semAtualizacaoMural}</span>
             {operationalSummary.semAtualizacaoMural > 0 && <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />}
           </div>
           <div className="w-px h-6 bg-white/20 hidden md:block" />
           <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onViewMural?.({ mentions: true })}>
             <span className="text-[10px] font-black text-white/60 uppercase">Minhas Menções:</span>
             <span className="text-lg font-black text-white">{operationalSummary.myMentions}</span>
             {operationalSummary.myMentions > 0 && <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />}
           </div>
           <div className="w-px h-6 bg-white/20 hidden md:block" />
           <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onViewMural?.({ search: 'DEVOLVIDO' })}>
             <span className="text-[10px] font-black text-white/60 uppercase">Devolvidos s/ Mural:</span>
             <span className="text-lg font-black text-white">{operationalSummary.devolvidosSemMural}</span>
           </div>
        </div>
      </div>

      {/* 3. DETALHES (SEÇÕES COLAPSÁVEIS) */}
      <div className="space-y-4">
        {/* 3.1 STATUS DOS CASES */}
        <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-sm overflow-hidden">
          <button 
            onClick={() => toggleSection('status')}
            className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-[#003DA5]">
                <Tag className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">3.1 Status dos Cases</h3>
            </div>
            {openSections.status ? <ChevronUp className="w-6 h-6 text-slate-300" /> : <ChevronDown className="w-6 h-6 text-slate-300" />}
          </button>
          
          {openSections.status && (
            <div className="px-8 pb-10 pt-4 animate-in fade-in slide-in-from-top-4 duration-500">
               <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[
                    { label: 'Aberto', value: 'ABERTO', color: 'bg-blue-50 text-blue-700 border-blue-100' },
                    { label: 'Devolvido', value: 'DEVOLVIDO', color: 'bg-red-50 text-red-700 border-red-100' },
                    { label: 'Concluído', value: 'CONCLUÍDO', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
                  ].map((st, idx) => {
                    const count = filteredRecords.filter(r => r.status === st.value).length;
                    return (
                      <div key={idx} className={`p-6 rounded-[1.5rem] border-2 flex flex-col items-center justify-center text-center ${st.color}`}>
                        <p className="text-2xl font-black mb-1">{count}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest">{st.label}</p>
                      </div>
                    );
                  })}
               </div>
            </div>
          )}
        </div>

        {/* 3.2 CARGA POR ANALISTA */}
        <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-sm overflow-hidden">
          <button 
            onClick={() => toggleSection('responsibles')}
            className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">3.2 Carga por Analista (FSJ)</h3>
            </div>
            {openSections.responsibles ? <ChevronUp className="w-6 h-6 text-slate-300" /> : <ChevronDown className="w-6 h-6 text-slate-300" />}
          </button>
          
          {openSections.responsibles && (
            <div className="px-8 pb-10 pt-4 animate-in fade-in slide-in-from-top-4 duration-500">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {analystLoad.map((res, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100">
                      <div className="flex items-center gap-4 mb-5 pb-4 border-b border-slate-200">
                        <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center font-black text-[#003DA5] text-sm border border-slate-100 uppercase">
                          {res.name.substring(0, 2)}
                        </div>
                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{res.name}</p>
                      </div>
                      <div className="space-y-3">
                        <div 
                          onClick={() => onViewCarga?.(res.name, 'total')}
                          className="flex justify-between items-center bg-white/60 p-3 rounded-xl cursor-pointer hover:bg-white hover:shadow-sm transition-all"
                        >
                          <span className="text-[10px] font-black text-slate-500 uppercase">Total Cases</span>
                          <span className="text-sm font-black text-slate-900">{res.total}</span>
                        </div>
                        <div 
                          onClick={() => onViewCarga?.(res.name, 'waiting')}
                          className="flex justify-between items-center bg-white/60 p-3 rounded-xl cursor-pointer hover:bg-white hover:shadow-sm transition-all"
                        >
                          <span className="text-[10px] font-black text-slate-500 uppercase">Aguardando</span>
                          <span className="text-sm font-black text-amber-600">{res.waiting}</span>
                        </div>
                        <div 
                          onClick={() => onViewCarga?.(res.name, 'stale')}
                          className="flex justify-between items-center bg-red-50 p-3 rounded-xl cursor-pointer hover:bg-red-100 hover:shadow-sm transition-all"
                        >
                          <span className="text-[10px] font-black text-red-500 uppercase">Sem Movimentação</span>
                          <span className="text-sm font-black text-red-600">{res.stale}</span>
                        </div>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>

        {/* 3.3 FILA OPERACIONAL (PRIORIDADES) */}
        <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-sm overflow-hidden">
          <button 
            onClick={() => toggleSection('operational')}
            className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-600">
                <ClipboardList className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">3.3 Fila Operacional (Prioridades)</h3>
            </div>
            {openSections.operational ? <ChevronUp className="w-6 h-6 text-slate-300" /> : <ChevronDown className="w-6 h-6 text-slate-300" />}
          </button>
          
          {openSections.operational && (
            <div className="px-8 pb-10 pt-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="bg-slate-50 rounded-[2rem] overflow-hidden border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-100/50">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-left">Prioridade</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-left">Case / Resumo</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-left">Responsável</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-center">SLA</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-right">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {queueRecords.map((r, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors cursor-pointer group" onClick={() => onOpenCase(r.caseId)}>
                          <td className="px-6 py-5">
                             <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${
                                  r.priority === 'ALTA' ? 'bg-red-500 animate-pulse' :
                                  r.priority === 'MÉDIA' ? 'bg-amber-500' :
                                  'bg-emerald-500'
                                }`} />
                                <span className={`text-[10px] font-black uppercase ${
                                  r.priority === 'ALTA' ? 'text-red-600' :
                                  r.priority === 'MÉDIA' ? 'text-amber-600' :
                                  'text-emerald-600'
                                }`}>
                                  {r.priority}
                                </span>
                                {(r as any).returnInfo?.wasReturned && (
                                  <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded-[4px] text-[7px] font-black border border-red-100 italic">
                                    {(r as any).returnInfo.count > 1 ? `RETRABALHO (${(r as any).returnInfo.count})` : 'RETRABALHO'}
                                  </span>
                                )}
                             </div>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-xs font-black text-[#003DA5] mb-1">{r.caseId}</p>
                            <p className="text-[10px] font-bold text-slate-600 line-clamp-1 truncate max-w-xs">{r.subject || r.description}</p>
                          </td>
                          <td className="px-6 py-5">
                            <span className="text-[10px] font-black text-slate-700 uppercase">{r.externalUser || 'Sem Resp'}</span>
                          </td>
                          <td className="px-6 py-5 text-center">
                             <div className="flex flex-col items-center gap-1">
                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                                  r.slaLabel === 'CRÍTICO' ? 'bg-red-100 text-red-600' :
                                  r.slaLabel === 'ALERTA' ? 'bg-amber-100 text-amber-600' :
                                  'bg-emerald-100 text-emerald-600'
                                }`}>
                                  {r.slaLabel}
                                </span>
                             </div>
                          </td>
                          <td className="px-6 py-5 text-right">
                             <div className="flex flex-col items-end gap-1">
                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                                  r.status?.toUpperCase() === 'DEVOLVIDO' || r.status?.toUpperCase() === 'DEVOLVER SOVOS' ? 'bg-red-500 text-white' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {r.status}
                                </span>
                             </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3.4 TEMAS RECORRENTES */}
        <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-sm overflow-hidden">
          <button 
            onClick={() => toggleSection('themes')}
            className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                 <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">3.4 Temas Recorrentes</h3>
            </div>
            {openSections.themes ? <ChevronUp className="w-6 h-6 text-slate-300" /> : <ChevronDown className="w-6 h-6 text-slate-300" />}
          </button>
          
          {openSections.themes && (
            <div className="px-8 pb-10 pt-4 animate-in fade-in slide-in-from-top-4 duration-500">
               <div className="space-y-4">
                  {themesRanking.map((theme, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-6 bg-slate-50 rounded-[1.5rem] border-2 border-transparent hover:border-blue-100 hover:bg-white hover:shadow-lg transition-all group cursor-pointer"
                      onClick={() => onViewSubject(theme.category)}
                    >
                      <div className="flex items-center gap-5">
                         <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-sm font-black text-slate-300 group-hover:text-[#003DA5] shadow-sm">
                           #{idx + 1}
                         </div>
                         <p className="text-xs font-black text-slate-700 uppercase tracking-tight group-hover:text-slate-900">{theme.category}</p>
                      </div>
                      <div className="flex items-center gap-4">
                         <div className="text-right">
                            <p className="text-lg font-black text-slate-900 leading-none">{theme.occurrences}</p>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Cases</p>
                         </div>
                         <ArrowUpRight className="w-5 h-5 text-slate-300 group-hover:text-[#003DA5]" />
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>

        {/* 3.5 INSIGHTS OPERACIONAIS */}
        <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-sm overflow-hidden">
          <button 
            onClick={() => toggleSection('insights')}
            className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">3.5 Insights Operacionais</h3>
            </div>
            {openSections.insights ? <ChevronUp className="w-6 h-6 text-slate-300" /> : <ChevronDown className="w-6 h-6 text-slate-300" />}
          </button>
          
          {openSections.insights && (
            <div className="px-8 pb-10 pt-4 animate-in fade-in slide-in-from-top-4 duration-500">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {insights.map((insight, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => insight.filter && onViewMural?.(insight.filter)}
                      className={`bg-gradient-to-br from-slate-900 to-[#003DA5] p-6 rounded-[2rem] text-white shadow-xl relative overflow-hidden flex flex-col h-full transition-transform active:scale-[0.98] ${insight.filter ? 'cursor-pointer hover:shadow-2xl hover:shadow-blue-900/40' : ''}`}
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mt-12" />
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center mb-4 backdrop-blur-sm border border-white/10">
                          {insight.icon}
                        </div>
                        <h4 className="text-[11px] font-black uppercase tracking-wider mb-3 text-blue-200">{insight.title}</h4>
                        <div className="space-y-4 flex-grow">
                          <p className="text-xs font-bold leading-tight text-white/90">
                            <span className="block text-[8px] uppercase tracking-widest text-white/50 mb-1">Situação:</span>
                            {insight.data}
                          </p>
                          <p className="text-xs font-bold leading-tight text-blue-100 italic">
                            <span className="block text-[8px] uppercase tracking-widest text-blue-400/60 mb-1 not-italic">Recomendação:</span>
                            {insight.action}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManagementDashboard;
