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
  onViewCarga?: (userName: string, type: 'total' | 'waiting' | 'stale' | 'devolvidos') => void;
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
      (r.status === 'DEVOLVIDO' || r.status === 'DEVOLVER TÉCNICO') && 
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
        p.mentions.some(m => (m || '').toLowerCase() === (userName || '').toLowerCase()) ||
        p.description.toLowerCase().includes(`@${(userName || '').toLowerCase()}`)
      )
    ).length;

    const aguardando = activeCases.filter(r => !r.returnDate || r.returnDate.trim() === '' || r.returnDate === '-').length;
    const retrabalhoTecnico = activeCases.filter(r => r.status === 'DEVOLVER TÉCNICO' || r.status === 'DEVOLVIDO').length;
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
      retrabalhoTecnico,
      historicoRetrabalho,
      reincidencia
    };
  }, [filteredRecords, posts, userName]);

  // Lógica de "O que precisa de atenção agora" (Top 3)
  const attentionItems = useMemo(() => {
    const items = [];
    const activeStatuses: TicketStatus[] = ['ABERTO', 'EM ANALISE', 'AGUARDANDO', 'DEVOLVER TÉCNICO', 'DEVOLVIDO'];

    // 1. Retrabalho Técnico
    const tecnicoTop = filteredRecords.filter(r => r.status === 'DEVOLVER TÉCNICO' || r.status === 'DEVOLVIDO')[0];
    if (tecnicoTop) {
      items.push({
        type: 'AÇÃO IMEDIATA',
        title: tecnicoTop.caseId || 'Case',
        subtitle: tecnicoTop.subject || tecnicoTop.description,
        meta: 'Status: Devolvido',
        severity: 'critical',
        action: () => onOpenCase(tecnicoTop.caseId),
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
        meta: 'Aguardando Retorno Técnico',
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
    const activeStatuses: TicketStatus[] = ['ABERTO', 'EM ANALISE', 'AGUARDANDO', 'DEVOLVER TÉCNICO', 'DEVOLVIDO'];

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

  // Diagnóstico Operacional Atual - Traduzidos em Ações Concretas
  const diagnosticData = useMemo(() => {
    // 1. Primário: Fila sem Movimentação (Mais Crítico)
    const primary = {
      count: operationalSummary.withoutMural,
      label: 'Fila sem Movimentação',
      context: 'Sem movimentação > 3 dias',
      action: 'Acionar responsáveis imediatamente',
      color: 'bg-red-50 border-red-200 text-red-600',
      icon: <AlertCircle className="w-6 h-6 text-red-500" />,
      type: 'stale' as const
    };

    // 2. Secundários: Gargalo Técnico e Devolvidos
    const secondary = [
      {
        count: operationalSummary.aguardando,
        label: 'Aguardando Retorno',
        context: 'Atraso de Retorno / SLA',
        action: 'Pressionar por retornos',
        color: 'bg-amber-50 border-amber-200 text-amber-700',
        icon: <Clock className="w-5 h-5 text-amber-500" />,
        type: 'waiting' as const
      },
      {
        count: operationalSummary.retrabalhoTecnico,
        label: 'Volume Devolvidos',
        context: 'Retrabalho / Devolução',
        action: 'Acompanhar retorno técnico',
        color: 'bg-orange-50 border-orange-200 text-orange-700',
        icon: <TrendingUp className="w-5 h-5 text-orange-500" />,
        type: 'devolvidos' as const
      }
    ];

    // 3. Complementar: Volume Geral Ativo
    const tertiary = {
      count: filteredRecords.filter(r => ['ABERTO', 'EM ANALISE', 'AGUARDANDO', 'DEVOLVIDO'].includes(r.status)).length,
      label: 'Volume Geral Ativo',
      context: 'Cases em andamento',
      action: 'Monitoramento contínuo',
      color: 'bg-slate-50 border-slate-200 text-slate-600',
      icon: <ClipboardList className="w-4 h-4 text-slate-400" />,
      type: 'total' as const
    };

    return { primary, secondary, tertiary };
  }, [filteredRecords, operationalSummary]);

  // 3.3 FILA OPERACIONAL (PRIORIDADES) - Lógica de Classificação e Ordenação
  const queueRecords = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const activeStatuses: TicketStatus[] = ['ABERTO', 'EM ANALISE', 'AGUARDANDO', 'DEVOLVER TÉCNICO', 'DEVOLVIDO'];
    
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
        if (isCriticalSla || r.status === 'DEVOLVIDO' || r.status === 'DEVOLVER TÉCNICO') {
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
      <section className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-[0_15px_40px_rgba(0,61,165,0.04)] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-slate-50 rounded-full -mr-24 -mt-24 blur-3xl opacity-40" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 relative z-10">
          <div className="flex items-center gap-4">
             <div className="w-11 h-11 bg-red-50/50 rounded-xl flex items-center justify-center text-red-600 shadow-sm border border-red-100/50">
                <AlertCircle className="w-6 h-6" />
             </div>
             <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">O que precisa de atenção agora</h2>
                <div className="text-[9px] font-black text-red-600/60 uppercase tracking-[0.2em] leading-none mt-1 flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-red-600 animate-pulse" />
                  Foco prioritário em ação
                </div>
             </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-slate-50/80 backdrop-blur-sm p-1.5 rounded-2xl border border-slate-200/50">
            <select 
              value={filters.period}
              onChange={e => setFilters(prev => ({ ...prev, period: e.target.value }))}
              className="bg-white px-3.5 py-1.5 rounded-xl text-[9px] font-black text-slate-700 uppercase cursor-pointer outline-none hover:text-[#003DA5] shadow-sm border border-slate-200/60 focus:border-[#003DA5] transition-all"
            >
              <option value="10d">Últimos 10 dias</option>
              <option value="20d">Últimos 20 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="60d">Últimos 60 dias</option>
              <option value="90d">Últimos 90 dias</option>
              <option value="all">Todo histórico</option>
            </select>
            
            <div className="h-4 w-px bg-slate-200 mx-0.5" />
            
            <label className="flex items-center gap-2.5 cursor-pointer group px-1">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-tight group-hover:text-[#003DA5] transition-colors">Cases ativos antigos</span>
              <div className="relative">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={includeOldActiveCases}
                  onChange={(e) => setIncludeOldActiveCases(e.target.checked)}
                />
                <div className="w-8 h-4.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:shadow-sm after:transition-all peer-checked:bg-[#003DA5]"></div>
              </div>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
          {attentionItems.length > 0 ? attentionItems.map((item, idx) => (
            <div 
              key={idx} 
              onClick={item.action}
              className="group relative bg-white rounded-[1.8rem] border border-slate-100 p-5 cursor-pointer shadow-sm hover:shadow-[0_15px_30px_rgba(0,0,0,0.05)] hover:translate-y-[-4px] transition-all duration-300 active:scale-[0.98] overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-full h-[3px] ${
                item.severity === 'critical' ? 'bg-red-500' :
                item.severity === 'warning' ? 'bg-amber-500' :
                'bg-[#003DA5]'
              }`} />

              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 shadow-sm border [&_svg]:w-4 [&_svg]:h-4 ${
                item.severity === 'critical' ? 'bg-red-50 text-red-600 border-red-100' :
                item.severity === 'warning' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                'bg-blue-50 text-[#003DA5] border-blue-100'
              }`}>
                {item.icon}
              </div>
              
              <div className="space-y-2">
                <p className={`text-[9px] font-black uppercase tracking-[0.12em] ${
                  item.severity === 'critical' ? 'text-red-600' :
                  item.severity === 'warning' ? 'text-amber-600' :
                  'text-[#003DA5]'
                }`}>
                  {item.type}
                </p>
                <h3 className="text-[15px] font-black text-slate-900 leading-tight group-hover:text-[#003DA5] transition-colors line-clamp-1 uppercase">
                  {item.title}
                </h3>
                <p className="text-[11px] font-bold text-slate-600/90 line-clamp-2 leading-relaxed min-h-[32px]">
                  {item.subtitle}
                </p>
                <div className="pt-3 border-t border-slate-50 mt-3 flex items-center justify-between">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{item.meta}</p>
                  <ArrowUpRight className="w-3 h-3 text-slate-300 group-hover:text-[#003DA5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
              </div>
            </div>
          )) : (
            <div className="col-span-3 py-12 flex flex-col items-center justify-center text-center bg-slate-50/50 rounded-[2.5rem] border border-dashed border-slate-200">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
              <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Tudo em ordem no momento!</p>
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

        {/* 3.5 DIAGNÓSTICO OPERACIONAL ATUAL */}
        <div className="bg-white rounded-[1.8rem] border border-slate-100 shadow-sm overflow-hidden">
          <button 
            onClick={() => toggleSection('insights')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                <Bot className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight">Diagnóstico Operacional Atual</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] mt-0.5">Baseado nos filtros ativos</p>
              </div>
            </div>
            {openSections.insights ? <ChevronUp className="w-5 h-5 text-slate-300" /> : <ChevronDown className="w-5 h-5 text-slate-300" />}
          </button>
          
          {openSections.insights && (
            <div className="px-6 pb-6 pt-1 animate-in fade-in slide-in-from-top-4 duration-500">
               <div className="space-y-3">
                  {/* NÍVEL 1: CARD PRINCIPAL (Destaque Total) */}
                  <div 
                    onClick={() => onViewCarga?.('', diagnosticData.primary.type)}
                    className={`group relative overflow-hidden p-4 rounded-2xl border-2 cursor-pointer transition-all duration-500 hover:shadow-lg active:scale-[0.995] ${diagnosticData.primary.color}`}
                  >
                     <div className="absolute top-0 right-0 w-48 h-48 bg-white/50 rounded-full -mr-24 -mt-24 blur-3xl opacity-10" />
                     <div className="relative flex flex-col md:flex-row items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm group-hover:rotate-2 transition-transform [&_svg]:w-5 [&_svg]:h-5">
                              {diagnosticData.primary.icon}
                           </div>
                           <div className="flex items-center gap-3">
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black">{diagnosticData.primary.count}</span>
                                <span className="text-[10px] font-black uppercase opacity-70">Cases</span>
                              </div>
                              <div className="h-4 w-px bg-current opacity-10 hidden sm:block" />
                              <p className="text-xs font-black uppercase text-slate-800 tracking-tight">{diagnosticData.primary.context}</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-3">
                           <span className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-sm border border-black/5 flex items-center gap-2 group-hover:bg-white transition-colors">
                             {diagnosticData.primary.action}
                             <ArrowUpRight className="w-3 h-3" />
                           </span>
                        </div>
                     </div>
                  </div>

                  {/* NÍVEL 2: CARDS SECUNDÁRIOS (2 Colunas) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     {diagnosticData.secondary.map((item, idx) => (
                       <div 
                         key={idx}
                         onClick={() => onViewCarga?.('', item.type)}
                         className={`group p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${item.color}`}
                       >
                          <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm [&_svg]:w-4 [&_svg]:h-4">
                                   {item.icon}
                                </div>
                                <div className="flex items-baseline gap-1">
                                   <span className="text-xl font-black">{item.count}</span>
                                   <span className="text-[9px] font-black uppercase opacity-60">Cases</span>
                                </div>
                             </div>
                             <ArrowUpRight className="w-3 h-3 text-slate-400 group-hover:text-current transition-all" />
                          </div>
                          <div>
                             <p className="text-[11px] font-black uppercase text-slate-800 tracking-tight">{item.label}</p>
                             <div className="flex items-center justify-between mt-0.5">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">{item.context}</p>
                                <p className="text-[8px] font-black uppercase opacity-60 flex items-center gap-1">
                                  <Bot className="w-2.5 h-2.5" />
                                  {item.action}
                                </p>
                             </div>
                          </div>
                       </div>
                     ))}
                  </div>

                  {/* NÍVEL 3: CARD COMPLEMENTAR (Barra Horizontal Compacta) */}
                  <div 
                    onClick={() => onViewCarga?.('', diagnosticData.tertiary.type)}
                    className={`p-2 px-4 rounded-xl border border-slate-100 cursor-pointer group transition-all hover:bg-white hover:shadow-sm flex items-center justify-between gap-4 ${diagnosticData.tertiary.color}`}
                  >
                     <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:opacity-60">
                           {diagnosticData.tertiary.icon}
                        </div>
                        <div className="flex items-center gap-3">
                           <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{diagnosticData.tertiary.label}</h4>
                           <div className="h-3 w-px bg-slate-300/50" />
                           <div className="flex items-baseline gap-1">
                             <span className="text-base font-black text-slate-900">{diagnosticData.tertiary.count}</span>
                             <span className="text-[8px] font-black text-slate-400 uppercase">Monitorado</span>
                           </div>
                        </div>
                     </div>
                     <p className="text-[9px] font-bold text-slate-400 italic hidden md:block opacity-60">
                        {diagnosticData.tertiary.context}
                     </p>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManagementDashboard;
