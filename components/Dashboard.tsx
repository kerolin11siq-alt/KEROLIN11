
import React, { useMemo, useState } from 'react';
import { standardizeName } from '../src/services/userService';
import { TicketRecord, TicketStatus } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, 
  PieChart, Pie, Cell as RechartsCell, LabelList,
  CartesianGrid, Tooltip,
  LineChart, Line, Legend, AreaChart, Area, ComposedChart,
  ScatterChart, Scatter, ZAxis, ReferenceLine
} from 'recharts';
import { 
  Activity as ActivityIcon, ShieldAlert as ShieldAlertIcon, 
  Trophy as TrophyIcon, Medal as MedalIcon, Link2 as Link2Icon, Users as UsersIcon, 
  Briefcase as BriefcaseIcon,
  SearchCode as SearchCodeIcon, RotateCcw as RotateCcwIcon, 
  Layers as LayersIcon, PieChart as PieChartIcon, 
  TrendingUp as TrendingUpIcon, Star as StarIcon, Timer as TimerIcon, Zap as ZapIcon,
  TrendingUp, Calendar, Info, BarChart3, Gauge, ClipboardCheck, AlertTriangle, History, 
  Clock, LayoutGrid, CheckCircle2, Target, BarChart2, Filter,
  CheckCircle, ArrowUpRight, AlertCircle, TrendingDown, Minus, ExternalLink
} from 'lucide-react';
import { differenceInDays, parseISO, startOfDay, isValid, parse, format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DashboardProps {
  records: TicketRecord[];
  contextRecords: TicketRecord[];
  onLocateLineage: (caseId: string) => void;
  onFilterAction: (key: string, value: string) => void;
  dateFilters?: {
    startDate?: string;
    endDate?: string;
    retStartDate?: string;
    retEndDate?: string;
  };
}

const FSJ_COLORS = {
  blue: '#003DA5',
  lightBlue: '#3b82f6',
  red: '#D91B2A',
  emerald: '#059669',
  amber: '#d97706',
  indigo: '#3730a3',
  slate: '#1e293b',
  gray: '#4b5563',
  orange: '#ea580c',
  purple: '#7c3aed',
  rose: '#e11d48'
};

const STATUS_CONFIG: Record<string, { color: string, label: string }> = {
  'CONCLUÍDO': { color: '#059669', label: 'CONCLUÍDO' },
  'ABERTO': { color: '#003DA5', label: 'ABERTO' },
  'DEVOLVIDO': { color: '#ea580c', label: 'DEVOLVIDO' },
  'NÃO INFORMADO': { color: '#94a3b8', label: 'NÃO INFORMADO' }
};

const robustDateParse = (dateStr: string | undefined): Date | null => {
  if (!dateStr || dateStr === '-' || dateStr.trim() === '') return null;
  const s = dateStr.trim().toLowerCase();
  let d = parseISO(s);
  if (isValid(d)) return d;
  const patterns = ['dd/MM/yyyy', 'dd-MM-yyyy', 'dd/MM/yy', 'dd-MM-yy'];
  for (const p of patterns) {
    const parsed = parse(s, p, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
};

const fixEncoding = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/\ufffd/g, ' ')
    // Common Mojibake fixes for Brazilian Portuguese
    .replace(/Ã¡/g, 'á').replace(/Ã /g, 'à').replace(/Ã¢/g, 'â').replace(/Ã£/g, 'ã')
    .replace(/Ã©/g, 'é').replace(/Ãª/g, 'ê')
    .replace(/Ã\u00ad/g, 'í').replace(/Ã³/g, 'ó').replace(/Ã´/g, 'ô').replace(/Ãµ/g, 'õ')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã\u0081/g, 'Á').replace(/Ã\u0089/g, 'É').replace(/Ã\u008d/g, 'Í').replace(/Ã\u0093/g, 'Ó').replace(/Ã\u009a/g, 'Ú')
    // Specific mentioned broken names
    .replace(/D BORA/g, 'DÉBORA') 
    .trim();
};

const normalizeStatusStrict = (status: string | undefined): string => {
  if (!status || status === '-' || status.trim() === '') return 'NÃO INFORMADO';
  
  let s = status
    .trim()
    .toUpperCase()
    // Remove non-printable characters and replacement characters (like )
    .replace(/[\u0000-\u001F\u007F-\u009F\uFFFD]/g, "")
    .replace(/\s+/g, " ");

  // Normalização agressiva para CONCLUÍDO (lidando com encoding quebrado)
  if (s.includes('CONCLU') && (s.includes('DO') || s.includes('IDO'))) return 'CONCLUÍDO';
  if (s === 'CONCLUIDO') return 'CONCLUÍDO';
  
  if (s === 'DEVOLVIDO') return 'DEVOLVIDO';
  if (s === 'ABERTO') return 'ABERTO';
  
  return s; 
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 rounded-2xl shadow-2xl border-2 border-gray-200 min-w-[150px]">
        <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-2 border-b pb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-6 mt-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || p.stroke }} />
              <span className="text-[10px] font-black uppercase text-gray-700">{p.name}:</span>
            </div>
            <span className="text-xs font-black text-gray-900">{p.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const EndPointMarker = (props: any) => {
  const { cx, cy, index, dataLength, payload, dataKey, stroke } = props;
  if (!payload || index === undefined || dataLength === undefined || index !== dataLength - 1) return null;
  const value = payload[dataKey];
  if (value === undefined) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill="white" stroke={stroke} strokeWidth={4} />
      <circle cx={cx} cy={cy} r={4} fill={stroke} />
      <text x={cx + 12} y={cy} dy={4} fill={stroke} fontSize={12} fontWeight={900} className="drop-shadow-sm">{value}</text>
    </g>
  );
};

type DashboardTab = 'general' | 'productivity' | 'bottlenecks' | 'cycle' | 'risk' | 'quality';

const Dashboard: React.FC<DashboardProps> = ({ records, contextRecords, onLocateLineage, onFilterAction, dateFilters }) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('general');
  const [selectedCycleMonth, setSelectedCycleMonth] = useState<string | null>(null);
  const detailsRef = React.useRef<HTMLDivElement>(null);
  const today = useMemo(() => startOfDay(new Date()), []);

  // Auxiliar para identificar retrabalho dinamicamente baseado em palavras-chave na OBS
  const getReturnInfo = (r: TicketRecord) => {
    const obs = (r.observations || '').toLowerCase();
    // Keywords requested: devolvido, reaberto, reabertura, retorno incorreto, devolução
    const keywords = ['devolvido', 'reaberto', 'reabertura', 'retorno incorreto', 'devolução'];
    let count = 0;
    
    // Contar ocorrências totais das palavras-chave na OBS
    keywords.forEach(kw => {
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = obs.match(regex);
      if (matches) count += matches.length;
    });

    // O status DEVOLVIDO por si só já conta como 1 devolução se não houver nas observações ainda
    const statusIsDevolvido = normalizeStatusStrict(r.status) === 'DEVOLVIDO';
    const finalCount = count + (statusIsDevolvido && count === 0 ? 1 : 0);

    return {
      wasReturned: finalCount > 0,
      count: finalCount
    };
  };

  const stats = useMemo(() => {
    try {
      if (!contextRecords || contextRecords.length === 0) return null;
      const isSlaLevelFilterActive = records.length > 0 && records.length < contextRecords.length;

      let totalSlaSum = 0;
      let maxSlaDays = 0;
      let minSlaDays = Infinity;
      let totalOnTime = 0;
      let validRecordsCount = 0;
      let ctxNoPrazo = 0, ctxAlerta = 0, ctxCritico = 0;
      let openCasesCount = 0;
      let sumBacklogAge = 0;
      let oldestBacklogAge = 0;

      const analystMap: Record<string, { total: number, onTime: number, devolved: number, sumSla: number, concluded: number }> = {};
      const errorMap: Record<string, number> = {};
      const errorMonthlyMap: Map<string, Record<string, number>> = new Map();
      const solicitantMap: Record<string, number> = {};
      const IGNORED_NAMES = new Set(['', '-', 'N/A', 'NA', 'NUL', 'NULL', 'UNDEFINED']);
      const monthlyMap: Map<string, { 
        month: string, 
        PRODUÇÃO: number, 
        PROJETO: number, 
        total: number, 
        sumConclusion: number, 
        timestamp: number,
        records: TicketRecord[]
      }> = new Map();
      const statusCounts: Record<string, number> = { 'ABERTO': 0, 'DEVOLVIDO': 0, 'CONCLUÍDO': 0, 'NÃO INFORMADO': 0 };
      const typeCounts: Record<string, number> = { 'PRODUÇÃO': 0, 'PROJETO': 0 };
      const devolucaoReasons: Record<string, number> = {};
      const reincidenciaReasons: Record<string, number> = {};
      let totalDevolvidos = 0;
      let sumSlaDevolvidos = 0;
      
      let totalConcluidos = 0;
      let totalReincidentes = 0;
      let totalRetrabalho = 0;
      let concluidosPerfeitos = 0; // Sem reincidência E sem retrabalho

      const rootMap = new Map<string, string>();
      [...records].sort((a,b) => (robustDateParse(a.openingDate)?.getTime() || 0) - (robustDateParse(b.openingDate)?.getTime() || 0))
      .forEach(r => {
        let root = r.caseId;
        const hasFormal = r.isFormalRecurrent || (r.previousCaseId && String(r.previousCaseId).trim() && !['N/A', 'NA', '-', '0'].includes(String(r.previousCaseId).toUpperCase().trim()));
        if (hasFormal && r.previousCaseId && rootMap.has(r.previousCaseId)) root = rootMap.get(r.previousCaseId)!;
        else if (hasFormal && r.previousCaseId) root = r.previousCaseId;
        rootMap.set(r.caseId, root);
      });

      const reincidenceGroups: Record<string, { count: number, members: TicketRecord[] }> = {};

      const monthlyQuality = new Map<string, { total: number, withoutRework: number }>();
      
      const generalRiskStats = { noPrazo: 0, alerta: 0, critico: 0, total: 0, sumSla: 0, maxSla: 0, minSla: Infinity };
      records.forEach(r => {
        const od = robustDateParse(r.openingDate);
        if (od) {
          const startOfOpen = startOfDay(od);
          const retD = robustDateParse(r.returnDate);
          const concD = robustDateParse(r.conclusionDate);
          const conclusionDate = retD ? startOfDay(retD) : (concD ? startOfDay(concD) : today);
          const conclusionDiff = Math.abs(differenceInDays(conclusionDate, startOfOpen));

          generalRiskStats.total++;
          generalRiskStats.sumSla += conclusionDiff;
          if (conclusionDiff > generalRiskStats.maxSla) generalRiskStats.maxSla = conclusionDiff;
          if (conclusionDiff < generalRiskStats.minSla) generalRiskStats.minSla = conclusionDiff;

          if (conclusionDiff <= 5) generalRiskStats.noPrazo++;
          else if (conclusionDiff <= 9) generalRiskStats.alerta++;
          else generalRiskStats.critico++;
        }
      });

      const filteredRiskStats = { noPrazo: 0, alerta: 0, critico: 0, total: 0, sumSla: 0, maxSla: 0, minSla: Infinity };
      contextRecords.forEach(r => {
        const od = robustDateParse(r.openingDate);
        if (od) {
          const startOfOpen = startOfDay(od);
          const retD = robustDateParse(r.returnDate);
          const concD = robustDateParse(r.conclusionDate);
          const conclusionDate = retD ? startOfDay(retD) : (concD ? startOfDay(concD) : today);
          const conclusionDiff = Math.abs(differenceInDays(conclusionDate, startOfOpen));

          filteredRiskStats.total++;
          filteredRiskStats.sumSla += conclusionDiff;
          if (conclusionDiff > filteredRiskStats.maxSla) filteredRiskStats.maxSla = conclusionDiff;
          if (conclusionDiff < filteredRiskStats.minSla) filteredRiskStats.minSla = conclusionDiff;

          if (conclusionDiff <= 5) filteredRiskStats.noPrazo++;
          else if (conclusionDiff <= 9) filteredRiskStats.alerta++;
          else filteredRiskStats.critico++;
        }
      });

      // Para tendências de risco baseadas no filtro atual
      const currentMonthRiskStats = { noPrazo: 0, alerta: 0, critico: 0 };
      const prevRiskStats = { noPrazo: 0, alerta: 0, critico: 0 };
      const monthsKeysRef = Array.from(new Set(records.map(r => {
        const d = robustDateParse(r.openingDate);
        return d ? format(d, 'yyyy-MM') : null;
      }).filter(Boolean))).sort().reverse();
      const currentMonthKeyRef = monthsKeysRef[0];
      const prevMonthKeyRef = monthsKeysRef[1];

      records.forEach(r => {
        const caseIdValid = (r.caseId && r.caseId !== '-' && r.caseId.trim() !== '');
        if (!caseIdValid) return;

        const openDateRaw = robustDateParse(r.openingDate);
        const mappedStatus = normalizeStatusStrict(r.status);
        const rawType = (r.type || '').toUpperCase().trim();
        const normalizedType = rawType === 'PROJETO' ? 'PROJETO' : 'PRODUÇÃO';
        
        // PADRONIZAÇÃO DO SOLICITANTE (RANKING FSJ) - Vindo da coluna "USUÁRIO" via ImportModal
        const sName = standardizeName(r.externalUser || '');
        const solicitantClean = (r.externalUser || '').toUpperCase().trim();

        // PADRONIZAÇÃO DO ANALISTA (ATENDENTE SOVOS) - Vindo da coluna "ANALISTA"
        const aName = standardizeName(r.user || '');
        const analystClean = (r.user || '').toUpperCase().trim();

        // Use description as the primary grouping for "Assuntos"
        const errorDesc = (r.description || r.normalizedCategory || r.subject || 'NÃO INFORMADO').toUpperCase().trim();

        const root = rootMap.get(r.caseId) || r.caseId;
        if (!reincidenceGroups[root]) reincidenceGroups[root] = { count: 0, members: [] };
        reincidenceGroups[root].count++;
        reincidenceGroups[root].members.push(r);

        validRecordsCount++;
        typeCounts[normalizedType]++;
        if (mappedStatus && statusCounts[mappedStatus] !== undefined) statusCounts[mappedStatus]++;

        if (mappedStatus === 'DEVOLVIDO' && errorDesc) {
          devolucaoReasons[errorDesc] = (devolucaoReasons[errorDesc] || 0) + 1;
        }
        
        // Use isFormalRecurrent flag from the record
        const isFormalRecurrent = r.isFormalRecurrent || (r.previousCaseId && String(r.previousCaseId).trim() && !['N/A', 'NA', '-', '0'].includes(String(r.previousCaseId).toUpperCase().trim()));
        if (isFormalRecurrent && errorDesc) {
          reincidenciaReasons[errorDesc] = (reincidenciaReasons[errorDesc] || 0) + 1;
        }

        // Agrupar por solicitante FSJ (Coluna Usuário)
        const sRaw = fixEncoding(r.externalUser || '').trim();
        const solicitantDisplay = sRaw ? sRaw.toUpperCase() : 'NÃO INFORMADO';
        
        // Filtrar apenas valores que não são placeholders genéricos, mas permitir "NÃO INFORMADO" se for o caso
        if (solicitantDisplay !== 'NÃO INFORMADO' && !['S/A', 'DESCONHECIDO', 'N/A', 'NA', '-', '0'].includes(solicitantDisplay)) {
          solicitantMap[solicitantDisplay] = (solicitantMap[solicitantDisplay] || 0) + 1;
        } else if (solicitantDisplay === 'NÃO INFORMADO') {
          // Opcional: decidir se inclui "NÃO INFORMADO" no ranking. 
          // Dada a regra "ignorar no ranking" anterior, mas a nova regra "marcar como não informado",
          // vou incluir para dar visibilidade à falha de preenchimento, exceto se todos forem assim.
          solicitantMap[solicitantDisplay] = (solicitantMap[solicitantDisplay] || 0) + 1;
        }

        const isReincidente = r.isFormalRecurrent || (r.previousCaseId && String(r.previousCaseId).trim() && !['N/A', 'NA', '-', '0'].includes(String(r.previousCaseId).toUpperCase().trim()));
        const returnInfo = getReturnInfo(r);
        const isRetrabalho = returnInfo.wasReturned;

        if (mappedStatus === 'CONCLUÍDO') {
          totalConcluidos++;
          if (!isReincidente && !isRetrabalho) concluidosPerfeitos++;

          if (openDateRaw) {
            const monthKey = format(openDateRaw, 'yyyy-MM');
            const q = monthlyQuality.get(monthKey) || { total: 0, withoutRework: 0 };
            q.total++;
            if (!isReincidente && !isRetrabalho) q.withoutRework++;
            monthlyQuality.set(monthKey, q);
          }
        }
        
        if (isReincidente) totalReincidentes++;
        if (isRetrabalho) totalRetrabalho++;

        if (mappedStatus !== 'CONCLUÍDO') {
          if (openDateRaw) {
            const age = Math.abs(differenceInDays(today, startOfDay(openDateRaw)));
            openCasesCount++;
            sumBacklogAge += age;
            if (age > oldestBacklogAge) oldestBacklogAge = age;
          }
        }

        if (openDateRaw) {
          const startOfOpen = startOfDay(openDateRaw);
          const retD = robustDateParse(r.returnDate);
          const concD = robustDateParse(r.conclusionDate);
          
          const conclusionDate = retD ? startOfDay(retD) : (concD ? startOfDay(concD) : today);
          const conclusionDiff = Math.abs(differenceInDays(conclusionDate, startOfOpen));
          
          totalSlaSum += conclusionDiff;
          if (conclusionDiff > maxSlaDays) maxSlaDays = conclusionDiff;
          if (conclusionDiff < minSlaDays) minSlaDays = conclusionDiff;
          
          if (conclusionDiff <= 5) ctxNoPrazo++;
          else if (conclusionDiff <= 9) ctxAlerta++;
          else ctxCritico++;

          // Trend Risk stats
          const caseMonth = format(startOfOpen, 'yyyy-MM');
          if (caseMonth === currentMonthKeyRef) {
            if (conclusionDiff <= 5) currentMonthRiskStats.noPrazo++;
            else if (conclusionDiff <= 9) currentMonthRiskStats.alerta++;
            else currentMonthRiskStats.critico++;
          } else if (caseMonth === prevMonthKeyRef) {
            if (conclusionDiff <= 5) prevRiskStats.noPrazo++;
            else if (conclusionDiff <= 9) prevRiskStats.alerta++;
            else prevRiskStats.critico++;
          }

          if (conclusionDiff <= 5) totalOnTime++;

          const monthKey = format(startOfOpen, 'yyyy-MM');
          const existing = monthlyMap.get(monthKey) || {
            month: format(startOfOpen, 'MMM/yy', { locale: ptBR }).toUpperCase().replace('.', ''),
            PRODUÇÃO: 0, PROJETO: 0, total: 0, sumConclusion: 0, 
            timestamp: new Date(startOfOpen.getFullYear(), startOfOpen.getMonth(), 1).getTime(),
            records: []
          };
          if (normalizedType === 'PRODUÇÃO') existing.PRODUÇÃO++; else existing.PROJETO++;
          existing.total++;
          existing.sumConclusion += conclusionDiff;
          existing.records.push(r);
          monthlyMap.set(monthKey, existing);

          if (aName && aName !== 'Desconhecido' && !IGNORED_NAMES.has(analystClean)) {
            if (!analystMap[aName]) analystMap[aName] = { total: 0, onTime: 0, devolved: 0, sumSla: 0, concluded: 0 };
            analystMap[aName].total++;
            analystMap[aName].sumSla += conclusionDiff;
            if (conclusionDiff <= 5) analystMap[aName].onTime++;
            if (mappedStatus === 'DEVOLVIDO') analystMap[aName].devolved++;
            if (mappedStatus === 'CONCLUÍDO') analystMap[aName].concluded++;
          }

          // Use subject as primary grouping for trends
          const e = (r.subject || r.normalizedCategory || r.description || 'NÃO INFORMADO').toUpperCase().trim();
          errorMap[e] = (errorMap[e] || 0) + 1;
          if (!errorMonthlyMap.has(e)) errorMonthlyMap.set(e, {});
          const eMonthCounts = errorMonthlyMap.get(e)!;
          eMonthCounts[monthKey] = (eMonthCounts[monthKey] || 0) + 1;
        }

        const retInfo = getReturnInfo(r);
        if (retInfo.wasReturned) {
          totalDevolvidos++;
          const openD = robustDateParse(r.openingDate);
          const retD = robustDateParse(r.returnDate);
          if (openD) {
            const finalD = retD ? startOfDay(retD) : today;
            sumSlaDevolvidos += Math.abs(differenceInDays(finalD, startOfDay(openD)));
          }
        }
      });

      const auditData = Object.entries(reincidenceGroups)
        .map(([rootId, data]) => {
          const membersSorted = [...data.members].sort((a,b) => (robustDateParse(a.openingDate)?.getTime() || 0) - (robustDateParse(b.openingDate)?.getTime() || 0));
          const lastOccur = membersSorted[0].openingDate;
          
          // Use subject as primary reason for audit data
          const reason = (membersSorted[0].subject || membersSorted[0].normalizedCategory || membersSorted[0].description || 'NÃO INFORMADO').toUpperCase().trim();
          
          let slaImpact = 0;
          let firstSla = 0;
          data.members.forEach((m, idx) => {
            const od = robustDateParse(m.openingDate);
            const rd = robustDateParse(m.returnDate);
            const diff = od ? Math.abs(differenceInDays(rd ? startOfDay(rd) : today, startOfDay(od))) : 0;
            slaImpact += diff;
            if (idx === 0) firstSla = diff;
          });

          // Reincidência Formal: apenas se houver lineage ou marcador formal, NÃO via keywords de OBS
          const isRecurrent = data.count > 1 || data.members.some(m => 
            m.isFormalRecurrent || (m.previousCaseId && String(m.previousCaseId).trim() && !['N/A', 'NA', '-', '0'].includes(String(m.previousCaseId).toUpperCase().trim()))
          );

          return { 
            rootId, 
            totalImpact: data.count, 
            firstUser: data.members[0].externalUser || 'S/A', 
            isRecurrent,
            lastOccur,
            reason,
            slaImpact,
            additionalSla: slaImpact - firstSla
          };
        })
        .filter(a => a.isRecurrent).sort((a, b) => b.totalImpact - a.totalImpact);

      const getTrend = (cur: number, prev: number) => {
          if (cur > prev) return 'UP';
          if (cur < prev) return 'DOWN';
          return 'STABLE';
      };

      const monthsKeys = Array.from(monthlyMap.keys()).sort().reverse();
      const currentMonthKey = monthsKeys[0];
      const prevMonthKey = monthsKeys[1];

      const curQ = monthlyQuality.get(currentMonthKey);
      const prevQ = monthlyQuality.get(prevMonthKey);
      const curRft = curQ && curQ.total > 0 ? (curQ.withoutRework / curQ.total) * 100 : 100;
      const prevRft = prevQ && prevQ.total > 0 ? (prevQ.withoutRework / prevQ.total) * 100 : 100;
      const rftTrend = getTrend(curRft, prevRft);

      const totalAdditionalSla = auditData.reduce((acc, curr) => acc + curr.additionalSla, 0);
      const avgReworkDelay = auditData.length > 0 ? (totalAdditionalSla / auditData.length).toFixed(1) : '0.0';

      const reworkReasons: Record<string, number> = {};
      auditData.forEach(a => {
        const r = a.reason.toUpperCase().trim();
        reworkReasons[r] = (reworkReasons[r] || 0) + 1;
      });
      const topReworkEntry = Object.entries(reworkReasons).sort((a, b) => b[1] - a[1])[0];
      const topReworkReason = topReworkEntry?.[0] || 'N/A';
      const topReworkCount = topReworkEntry?.[1] || 0;

      const topDevolEntry = Object.entries(devolucaoReasons).sort((a, b) => b[1] - a[1])[0];
      const topDevolReason = topDevolEntry ? `${topDevolEntry[0]} — ${topDevolEntry[1]} ocorrência(s)` : 'Sem devoluções no período';

      const topReincEntry = Object.entries(reincidenciaReasons).sort((a, b) => b[1] - a[1])[0];
      const topReincReason = topReincEntry ? `${topReincEntry[0]} — ${topReincEntry[1]} ocorrência(s)` : 'Sem reincidências no período';

      const errorRanking = Object.entries(errorMap).map(([name, count], index) => {
        const curMonthCount = errorMonthlyMap.get(name)?.[currentMonthKey] || 0;
        const prevMonthCount = errorMonthlyMap.get(name)?.[prevMonthKey] || 0;
        
        let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
        if (curMonthCount > prevMonthCount) trend = 'UP';
        else if (curMonthCount < prevMonthCount) trend = 'DOWN';

        let level: 'CRITICAL' | 'ATTENTION' | 'CONTROL' = 'CONTROL';
        if (index < 3) level = 'CRITICAL';
        else if (index < 6) level = 'ATTENTION';

        return { 
          name, 
          count, 
          trend,
          level,
          label: `${count} (${validRecordsCount > 0 ? ((count / validRecordsCount) * 100).toFixed(0) : '0'}%)` 
        };
      }).sort((a,b) => b.count - a.count);

      const monthlyEvolutionData = Array.from(monthlyMap.values()).sort((a, b) => a.timestamp - b.timestamp);
      const cycleTimeData = monthlyEvolutionData.map(m => ({ 
        ...m, 
        avgConclusion: m.total > 0 ? (m.sumConclusion / m.total).toFixed(1) : '0.0'
      }));

      const lastMonthData = monthlyMap.get(currentMonthKey);
      const avgSlaMonthly = lastMonthData && lastMonthData.total > 0 
        ? (lastMonthData.sumConclusion / lastMonthData.total).toFixed(1) 
        : '0.0';
      
      const avgSlaValue = validRecordsCount > 0 ? (totalSlaSum / validRecordsCount) : 0;
      const avgSlaMonthlyValue = parseFloat(avgSlaMonthly);
      
      let slaDiffPercent = 0;
      let slaComparisonTrend: 'BETTER' | 'WORSE' | 'STABLE' = 'STABLE';
      
      if (avgSlaValue > 0 && avgSlaMonthlyValue > 0) {
        slaDiffPercent = Math.abs(((avgSlaMonthlyValue - avgSlaValue) / avgSlaValue) * 100);
        slaComparisonTrend = avgSlaMonthlyValue < avgSlaValue ? 'BETTER' : (avgSlaMonthlyValue > avgSlaValue ? 'WORSE' : 'STABLE');
      }

      const concAvgs = cycleTimeData.map(d => parseFloat(d.avgConclusion)).filter(v => v > 0);
      
      const cycleSummary = {
        avgConc: concAvgs.length > 0 ? (concAvgs.reduce((a, b) => a + b, 0) / concAvgs.length).toFixed(1) : '0.0',
        bestConc: concAvgs.length > 0 ? Math.min(...concAvgs).toFixed(1) : '0.0',
        worstConc: concAvgs.length > 0 ? Math.max(...concAvgs).toFixed(1) : '0.0',
        backlogAvg: openCasesCount > 0 ? (sumBacklogAge / openCasesCount).toFixed(1) : '0.0',
        openCasesCount,
        oldestBacklogAge
      };

      const efficiencyIndex = isSlaLevelFilterActive 
        ? (contextRecords.length > 0 ? ((records.length / contextRecords.length) * 100).toFixed(0) : '0')
        : (validRecordsCount > 0 ? ((ctxNoPrazo / validRecordsCount) * 100).toFixed(0) : '0');

      const riskTrends = {
          noPrazo: getTrend(currentMonthRiskStats.noPrazo, prevRiskStats.noPrazo),
          alerta: getTrend(currentMonthRiskStats.alerta, prevRiskStats.alerta),
          critico: getTrend(currentMonthRiskStats.critico, prevRiskStats.critico)
      };

      const analystRanking = Object.entries(analystMap).map(([name, data]) => ({
        name, count: data.total, total: data.total, onTime: data.onTime, concluido: data.concluded,
        avgSla: data.total > 0 ? (data.sumSla / data.total).toFixed(1) : '0.0',
        efficiency: data.total > 0 ? ((data.concluded / data.total) * 100).toFixed(0) : '0',
        label: `${data.total} (${validRecordsCount > 0 ? ((data.total / validRecordsCount) * 100).toFixed(0) : '0'}%)`
      })).sort((a, b) => b.count - a.count);

      const solicitantRankingRaw = Object.entries(solicitantMap).map(([name, count]) => ({
        name, count,
        share: validRecordsCount > 0 ? ((count / validRecordsCount) * 100).toFixed(1) : '0'
      })).sort((a, b) => b.count - a.count);

      const solicitantRanking = solicitantRankingRaw.map((item, idx) => ({
        ...item,
        label: `${idx + 1}º ${item.name} — ${item.count} cases`
      }));

      const rftIndex = totalConcluidos > 0 ? ((concluidosPerfeitos / totalConcluidos) * 100).toFixed(1) : '100.0';
      const qualityInconsistency = Number(rftIndex) === 100 && (totalDevolvidos > 0 || auditData.length > 0);

      const reworkRate = validRecordsCount > 0 ? (totalRetrabalho / validRecordsCount) * 100 : 0;
      const reworkAlert = reworkRate > 5;

      const periodRef = (() => {
        const { startDate, endDate, retStartDate, retEndDate } = dateFilters || {};
        
        if (startDate && endDate && startDate === endDate) {
            return `Abertura: ${format(parseISO(startDate), "dd/MM/yy")}`;
        }
        
        if (startDate || endDate) {
            const start = startDate ? format(parseISO(startDate), 'dd/MM/yy') : 'Início';
            const end = endDate ? format(parseISO(endDate), 'dd/MM/yy') : 'Hoje';
            return `Abertura: ${start} até ${end}`;
        }
        
        if (retStartDate || retEndDate) {
            const start = retStartDate ? format(parseISO(retStartDate), 'dd/MM/yy') : 'Início';
            const end = retEndDate ? format(parseISO(retEndDate), 'dd/MM/yy') : 'Hoje';
            return `Retorno: ${start} até ${end}`;
        }
        
        return 'Base total (sem filtro de período)';
      })();

      return { 
        total: records.length, validRecordsCount, efficiencyIndex, efficiencyLabel: isSlaLevelFilterActive ? 'Participação' : 'Conformidade',
        ctxNoPrazo: filteredRiskStats.noPrazo, 
        ctxAlerta: filteredRiskStats.alerta, 
        ctxCritico: filteredRiskStats.critico,
        ctxNoPrazoPct: filteredRiskStats.total > 0 ? ((filteredRiskStats.noPrazo / filteredRiskStats.total) * 100).toFixed(0) : '0',
        ctxAlertaPct: filteredRiskStats.total > 0 ? ((filteredRiskStats.alerta / filteredRiskStats.total) * 100).toFixed(0) : '0',
        ctxCriticoPct: filteredRiskStats.total > 0 ? ((filteredRiskStats.critico / filteredRiskStats.total) * 100).toFixed(0) : '0',
        generalRiskStats,
        generalRiskStatsPct: {
          noPrazo: generalRiskStats.total > 0 ? ((generalRiskStats.noPrazo / generalRiskStats.total) * 100).toFixed(0) : '0',
          alerta: generalRiskStats.total > 0 ? ((generalRiskStats.alerta / generalRiskStats.total) * 100).toFixed(0) : '0',
          critico: generalRiskStats.total > 0 ? ((generalRiskStats.critico / generalRiskStats.total) * 100).toFixed(0) : '0',
          avg: generalRiskStats.total > 0 ? (generalRiskStats.sumSla / generalRiskStats.total).toFixed(1) : '0.0',
          max: generalRiskStats.maxSla,
          min: generalRiskStats.minSla === Infinity ? 0 : generalRiskStats.minSla
        },
        filteredRiskStats,
        filteredRiskStatsPct: {
          noPrazo: filteredRiskStats.total > 0 ? ((filteredRiskStats.noPrazo / filteredRiskStats.total) * 100).toFixed(0) : '0',
          alerta: filteredRiskStats.total > 0 ? ((filteredRiskStats.alerta / filteredRiskStats.total) * 100).toFixed(0) : '0',
          critico: filteredRiskStats.total > 0 ? ((filteredRiskStats.critico / filteredRiskStats.total) * 100).toFixed(0) : '0',
          avg: filteredRiskStats.total > 0 ? (filteredRiskStats.sumSla / filteredRiskStats.total).toFixed(1) : '0.0',
          max: filteredRiskStats.maxSla,
          min: filteredRiskStats.minSla === Infinity ? 0 : filteredRiskStats.minSla
        },
        avgSla: validRecordsCount > 0 ? (totalSlaSum / validRecordsCount).toFixed(1) : '0.0',
        avgSlaMonthly,
        slaDiffPercent: slaDiffPercent.toFixed(0),
        slaComparisonTrend,
        maxSlaDays, minSlaFinal: minSlaDays === Infinity ? 0 : minSlaDays,
        statusChart: ['ABERTO', 'CONCLUÍDO', 'DEVOLVIDO'].map(name => {
          const count = statusCounts[name] || 0;
          const totalStatus = Object.values(statusCounts).reduce((a,b)=>a+b, 0);
          return { name, value: count, color: STATUS_CONFIG[name]?.color || '#cbd5e1', realPercent: totalStatus > 0 ? ((count / totalStatus) * 100).toFixed(1) : '0.0' };
        }).filter(i => i.value > 0 || ['ABERTO', 'CONCLUÍDO', 'DEVOLVIDO'].includes(i.name)),
        typeChart: [
          { name: 'Produção', value: typeCounts['PRODUÇÃO'], color: FSJ_COLORS.blue },
          { name: 'Projeto', value: typeCounts['PROJETO'], color: FSJ_COLORS.red }
        ].map(i => ({ ...i, realPercent: validRecordsCount > 0 ? ((i.value / validRecordsCount) * 100).toFixed(1) : '0.0' })),
        analystRanking, solicitantRanking, errorRanking, podiumSolicitants: solicitantRanking.slice(0, 3),
        auditData, totalDevolvidos, percentDevolvidos: validRecordsCount > 0 ? ((totalDevolvidos / validRecordsCount) * 100).toFixed(1) : '0.0',
        avgSlaDevolvidos: totalDevolvidos > 0 ? (sumSlaDevolvidos / totalDevolvidos).toFixed(1) : '0.0',
        monthlyEvolutionData, cycleTimeData, cycleSummary,
        periodRef,
        riskTrends,
        rftIndex,
        rftTrend,
        reworkRate,
        reworkAlert,
        avgReworkDelay,
        topReworkReason,
        topReworkCount,
        topDevolReason,
        topReincReason,
        rftBase: totalConcluidos,
        concluidosPerfeitos,
        totalConcluidos,
        totalReincidentes,
        totalRetrabalho,
        qualityInconsistency,
        operationalFunnel: [
          { step: 'Entrada', value: validRecordsCount, label: 'TOTAL', color: 'bg-blue-600' },
          { step: 'Backlog', value: statusCounts['ABERTO'], label: 'EM ABERTO', color: 'bg-blue-400' },
          { step: 'Saída', value: totalConcluidos, label: 'CONCLUÍDOS', color: 'bg-emerald-600' }
        ],
        qualityFunnel: [
          { step: 'Base', value: totalConcluidos, label: 'VOLUME CONCLUÍDO', color: 'bg-emerald-600' },
          { step: 'RFT', value: concluidosPerfeitos, label: 'CONFORMIDADE (RFT)', color: 'bg-blue-600' },
          { step: 'Falha', value: totalRetrabalho, label: 'PROCESSAMENTO COM RETRABALHO', color: 'bg-orange-600' }
        ]
      };
    } catch (e) {
      console.error("Erro crítico no Dashboard:", e);
      return null;
    }
  }, [records, contextRecords, dateFilters]);

  if (!stats) return <div className="p-20 text-center uppercase font-black text-gray-400 italic flex flex-col items-center gap-4"><AlertCircle className="w-12 h-12" />Processando Dashboard...</div>;

  const NavButton = ({ id, icon: Icon, label }: { id: DashboardTab, icon: any, label: string }) => (
    <button onClick={() => setActiveTab(id)} className={`flex items-center gap-2 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-normal transition-all ${activeTab === id ? 'bg-[#003DA5] text-white shadow-xl shadow-blue-900/20 scale-105' : 'bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200 hover:scale-102'}`}><Icon className="w-4 h-4" />{label}</button>
  );

  const TrendIcon = ({ trend }: { trend: 'UP' | 'DOWN' | 'STABLE' }) => {
      if (trend === 'UP') return <TrendingUp className="w-4 h-4" />;
      if (trend === 'DOWN') return <TrendingDown className="w-4 h-4" />;
      return <Minus className="w-4 h-4" />;
  };

  return (
    <div className="space-y-10 pb-32">
      <div className="flex flex-wrap gap-3 bg-white/50 p-2 rounded-3xl backdrop-blur-sm border border-white sticky top-24 z-40 shadow-xl">
        <NavButton id="general" icon={LayoutGrid} label="Visão Geral" />
        <NavButton id="productivity" icon={Target} label="Produtividade" />
        <NavButton id="bottlenecks" icon={AlertTriangle} label="Gargalos" />
        <NavButton id="cycle" icon={Clock} label="Tempo de Ciclo" />
        <NavButton id="risk" icon={ShieldAlertIcon} label="Risco Operacional" />
        <NavButton id="quality" icon={ClipboardCheck} label="Qualidade" />
      </div>

      {activeTab === 'general' && (
        <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500">
          
          {/* TOP KPIs */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-2 bg-white p-8 rounded-[2rem] shadow-xl border-2 border-white flex flex-col gap-6">
              <div className="border-b border-gray-100 pb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-black uppercase tracking-tight">Análise de Eficiência SLA</h3>
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Base Histórica vs Filtrada</p>
                </div>
                <Gauge className="w-6 h-6 text-blue-600" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-x-2 divide-gray-50">
                {/* BLOCO GERAL (Base Histórica) */}
                <div className="space-y-6">
                   <div className="flex items-center gap-2 mb-2">
                     <History className="w-4 h-4 text-gray-500" />
                     <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">SLA Geral (Histórico)</span>
                   </div>
                   <div className="flex items-center gap-6">
                     <div className="relative w-28 h-28 shrink-0">
                       <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                           <Pie 
                             data={[
                               { value: Number(stats.generalRiskStatsPct.noPrazo) }, 
                               { value: 100 - Number(stats.generalRiskStatsPct.noPrazo) }
                             ]} 
                             innerRadius={35} outerRadius={50} startAngle={90} endAngle={450} dataKey="value" stroke="none"
                           >
                             <RechartsCell fill="#059669" />
                             <RechartsCell fill="#F1F5F9" />
                           </Pie>
                         </PieChart>
                       </ResponsiveContainer>
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                         <span className="text-xl font-black text-black leading-none">{stats.generalRiskStatsPct.noPrazo}%</span>
                         <span className="text-[7px] font-black text-emerald-700 uppercase mt-0.5">No Prazo</span>
                       </div>
                     </div>
                     <div className="flex-grow space-y-2">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                          <span className="text-[9px] font-black text-emerald-800">No Prazo</span>
                          <span className="text-xs font-black">{stats.generalRiskStats.noPrazo} <span className="opacity-75 ml-1">({stats.generalRiskStatsPct.noPrazo}%)</span></span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-100">
                          <span className="text-[9px] font-black text-amber-800">Alerta</span>
                          <span className="text-xs font-black">{stats.generalRiskStats.alerta} <span className="opacity-75 ml-1">({stats.generalRiskStatsPct.alerta}%)</span></span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-1.5 bg-red-50 rounded-lg border border-red-100">
                          <span className="text-[9px] font-black text-red-800">Crítico</span>
                          <span className="text-xs font-black">{stats.generalRiskStats.critico} <span className="opacity-75 ml-1">({stats.generalRiskStatsPct.critico}%)</span></span>
                        </div>
                     </div>
                   </div>
                </div>

                {/* BLOCO FILTRADO (Base Filtrada) */}
                <div className="space-y-6 pl-8">
                   <div className="flex items-center gap-2 mb-2">
                     <Filter className="w-4 h-4 text-blue-600" />
                     <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">SLA Filtrado (Dinâmico)</span>
                   </div>
                   <div className="flex items-center gap-6">
                     <div className="relative w-28 h-28 shrink-0">
                       <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                           <Pie 
                             data={[
                               { value: Number(stats.ctxNoPrazoPct) }, 
                               { value: 100 - Number(stats.ctxNoPrazoPct) }
                             ]} 
                             innerRadius={35} outerRadius={50} startAngle={90} endAngle={450} dataKey="value" stroke="none"
                           >
                             <RechartsCell fill="#003DA5" />
                             <RechartsCell fill="#F1F5F9" />
                           </Pie>
                         </PieChart>
                       </ResponsiveContainer>
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                         <span className="text-xl font-black text-black leading-none">{stats.ctxNoPrazoPct}%</span>
                         <span className="text-[7px] font-black text-[#003DA5] uppercase mt-0.5">No Prazo</span>
                       </div>
                     </div>
                     <div className="flex-grow space-y-2">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                          <span className="text-[9px] font-black text-blue-800">No Prazo</span>
                          <span className="text-xs font-black">{stats.ctxNoPrazo} <span className="opacity-75 ml-1">({stats.ctxNoPrazoPct}%)</span></span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                          <span className="text-[9px] font-black text-amber-700">Alerta</span>
                          <span className="text-xs font-black">{stats.ctxAlerta} <span className="opacity-75 ml-1">({stats.ctxAlertaPct}%)</span></span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                          <span className="text-[9px] font-black text-red-700">Crítico</span>
                          <span className="text-xs font-black">{stats.ctxCritico} <span className="opacity-75 ml-1">({stats.ctxCriticoPct}%)</span></span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                           <span className="text-[8px] font-black text-gray-600 uppercase">Eficiência Período</span>
                           <span className={`text-[10px] font-black ${Number(stats.efficiencyIndex) > 85 ? 'text-emerald-600' : 'text-amber-600'}`}>
                             {stats.efficiencyIndex}%
                           </span>
                        </div>
                     </div>
                   </div>
                </div>
              </div>
            </div>
            <div className="bg-[#003DA5] p-7 rounded-[2rem] text-white shadow-xl flex flex-col relative overflow-hidden group">
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ActivityIcon className="w-4 h-4 text-blue-200 opacity-70 group-hover:rotate-12 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-100">SLA Médio / Conclusão</span>
                  </div>
                  {stats.slaComparisonTrend === 'BETTER' ? (
                    <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-full text-emerald-300 border border-emerald-500/30">
                      <TrendingDown className="w-3 h-3" />
                      <span className="text-[9px] font-black">-{stats.slaDiffPercent}% vs média</span>
                    </div>
                  ) : stats.slaComparisonTrend === 'WORSE' ? (
                    <div className="flex items-center gap-1 bg-red-500/20 px-2 py-0.5 rounded-full text-red-300 border border-red-500/30">
                      <TrendingUp className="w-3 h-3" />
                      <span className="text-[9px] font-black">+{stats.slaDiffPercent}% vs média</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-blue-400/20 px-2 py-0.5 rounded-full text-blue-200">
                      <Minus className="w-3 h-3" />
                      <span className="text-[9px] font-black uppercase tracking-widest">Estável</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-4">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase tracking-widest text-blue-100 leading-none mb-1">Resultado Atual (Filtrado)</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black drop-shadow-xl tracking-tighter">{stats.avgSlaMonthly}</span>
                      <span className="text-xs font-black text-blue-50 uppercase">dias</span>
                    </div>
                  </div>
                  
                  <div className="bg-white/10 border border-white/20 p-3 rounded-2xl flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[7px] font-black uppercase text-blue-100">SLA Médio Geral</span>
                      <span className="text-sm font-black text-white">{stats.avgSla} dias</span>
                    </div>
                    <div className="w-px h-6 bg-white/20" />
                    <div className="text-right">
                      <span className="text-[7px] font-black uppercase text-blue-100">Tendência</span>
                      <p className="text-[10px] font-black flex items-center justify-end gap-1">
                        {stats.slaComparisonTrend === 'BETTER' ? 'POSITIVA' : stats.slaComparisonTrend === 'WORSE' ? 'ATENÇÃO' : 'NEUTRA'}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Real Trend Graph (Area Chart) */}
                <div className="h-16 w-full mt-auto relative pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.cycleTimeData.slice(-12)}>
                      <defs>
                        <linearGradient id="whiteArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#fff" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#fff" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="avgConclusion" stroke="#fff" strokeWidth={2} fill="url(#whiteArea)" isAnimationActive={true} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 opacity-50">
                    <span className="text-[8px] font-black uppercase">Variação Temporal SLA</span>
                    <span className="text-[8px] font-black uppercase italic">Real-time</span>
                  </div>
                </div>
              </div>
              <ActivityIcon className="absolute -right-4 -bottom-4 w-24 h-24 opacity-5 group-hover:rotate-12 transition-transform" />
            </div>
            <div className="bg-white p-7 rounded-[2rem] shadow-xl border-2 border-white flex flex-col justify-between">
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                   <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest leading-none">Extremos SLA / Eficiência</span>
                   <ZapIcon className="w-4 h-4 text-amber-500" />
                </div>
                
                <div className="grid grid-cols-1 gap-4 flex-grow">
                  {/* MÁXIMO COMPARATIVO */}
                  <div className="bg-red-50/60 p-4 rounded-2xl border border-red-100 flex flex-col justify-center">
                    <div className="flex items-center justify-between mb-3">
                       <div className="flex items-center gap-2">
                          <TimerIcon className="w-3 h-3 text-red-600" />
                          <span className="text-[9px] font-black text-red-900 uppercase tracking-widest">Máximo Espera (Cases)</span>
                       </div>
                    </div>
                    
                    <div className="flex items-end justify-between gap-4">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-red-600 uppercase mb-0.5">Dinâmico / Filtro</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-red-900 leading-none">{stats.filteredRiskStats.maxSla}</span>
                          <span className="text-[10px] font-black text-red-950/70 uppercase">dias</span>
                        </div>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[8px] font-black text-gray-600 uppercase mb-0.5">Geral Histórico</span>
                        <span className="text-lg font-black text-gray-500 leading-none">{stats.generalRiskStats.maxSla}d</span>
                      </div>
                    </div>
                  </div>

                  {/* MÍNIMO COMPARATIVO */}
                  <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100 flex flex-col justify-center">
                    <div className="flex items-center justify-between mb-3">
                       <div className="flex items-center gap-2">
                          <ZapIcon className="w-3 h-3 text-emerald-600" />
                          <span className="text-[9px] font-black text-emerald-900 uppercase tracking-widest">Maior Agilidade (Min)</span>
                       </div>
                    </div>
                    
                    <div className="flex items-end justify-between gap-4">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-emerald-600 uppercase mb-0.5">Dinâmico / Filtro</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-emerald-900 leading-none">{stats.filteredRiskStats.minSla === Infinity ? 0 : stats.filteredRiskStats.minSla}</span>
                          <span className="text-[10px] font-black text-emerald-950/70 uppercase">dias</span>
                        </div>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[8px] font-black text-gray-600 uppercase mb-0.5">Geral Histórico</span>
                        <span className="text-lg font-black text-gray-500 leading-none">{stats.generalRiskStats.minSla === Infinity ? 0 : stats.generalRiskStats.minSla}d</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* EVOLUÇÃO E MONITOR DE DEVOLVIDOS */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <section className="lg:col-span-3 bg-white p-10 rounded-[2.5rem] shadow-2xl border border-gray-100 relative overflow-hidden">
               <div className="flex items-center justify-between mb-8 border-b border-gray-200 pb-4">
                  <div><h3 className="text-lg font-black uppercase tracking-tight text-black">1º Evolução Mensal de Cases</h3><p className="text-[10px] font-black text-[#003DA5] uppercase mt-1 tracking-widest italic">Análise Temporal Escalável</p></div>
                  <div className="flex gap-4"><div className="flex items-center gap-2"><div className="w-3 h-1 bg-[#003DA5]" /><span className="text-[8px] font-black uppercase text-gray-700">Produção</span></div><div className="flex items-center gap-2"><div className="w-3 h-1 bg-blue-400 border-t border-dashed border-gray-400" /><span className="text-[8px] font-black uppercase text-gray-700">Projeto</span></div></div>
               </div>
               <div className="overflow-x-auto custom-scrollbar-h pb-4">
                  <div style={{ minWidth: `${Math.max(100, stats.monthlyEvolutionData.length * 90)}px`, height: '280px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.monthlyEvolutionData} margin={{ top: 20, right: 60, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }} dy={10} interval={0} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#003DA5', strokeWidth: 1, strokeDasharray: '5 5' }} />
                        <Line type="monotone" dataKey="PRODUÇÃO" name="Produção" stroke={FSJ_COLORS.blue} strokeWidth={4} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} animationDuration={1000}><LabelList content={<EndPointMarker dataLength={stats.monthlyEvolutionData.length} stroke={FSJ_COLORS.blue} dataKey="PRODUÇÃO" />} /></Line>
                        <Line type="monotone" dataKey="PROJETO" name="Projeto" stroke={FSJ_COLORS.lightBlue} strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 6, strokeWidth: 0 }} animationDuration={1000}><LabelList content={<EndPointMarker dataLength={stats.monthlyEvolutionData.length} stroke={FSJ_COLORS.lightBlue} dataKey="PROJETO" />} /></Line>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
               </div>
            </section>

            <section 
              onClick={() => onFilterAction('devolvidos', 'true')}
              className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-200 flex flex-col justify-between h-full cursor-pointer hover:shadow-red-500/10 hover:border-red-200 hover:scale-[1.02] transition-all active:scale-[0.98] group"
            >
              <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
                <h3 className="text-xs font-black uppercase tracking-tight text-black flex items-center gap-2 group-hover:text-red-700 transition-colors">
                  <RotateCcwIcon className="w-4 h-4 text-amber-700" /> Monitor Devolvidos
                </h3>
                <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" />
              </div>
              <div className="flex-grow flex flex-col items-center justify-center py-4">
                 {stats.totalDevolvidos === 0 ? (
                    <div className="text-center animate-in zoom-in duration-500">
                      <CheckCircle className="w-12 h-12 text-emerald-700 mx-auto mb-2" />
                      <p className="text-xl font-black text-emerald-700">CONFORME</p>
                    </div>
                 ) : (
                    <div className="text-center animate-in zoom-in duration-500">
                       <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-2" />
                       <p className="text-lg font-black text-red-600 uppercase leading-tight">Retrabalho Identificado</p>
                       <p className="text-[10px] font-bold text-gray-500 uppercase mt-1">
                         {stats.totalDevolvidos} cases devolvidos/reabertos
                       </p>
                       <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 bg-red-50 text-red-800 rounded-full border border-red-200">
                         <span className="text-[10px] font-black uppercase">Atenção</span>
                       </div>
                    </div>
                 )}
              </div>
              <div className="mt-6 bg-gray-50 p-4 rounded-2xl flex items-center justify-between border border-gray-200">
                <span className="text-[9px] font-black text-gray-700 uppercase">Incidência Geral</span>
                <span className="text-xl font-black text-black drop-shadow-sm">{stats.percentDevolvidos}%</span>
              </div>
            </section>
          </div>

          {/* PERFORMANCE ANALISTAS E ASSUNTOS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section className="bg-white p-8 rounded-[2rem] shadow-lg flex flex-col h-[400px]">
              <div className="flex items-center justify-between mb-6 border-b pb-4">
                <h3 className="text-[11px] font-black uppercase flex items-center gap-3 text-gray-900 tracking-widest"><UsersIcon className="w-5 h-5 text-[#003DA5]" /> Performance Analistas (SOVOS)</h3>
                <span className="text-[9px] font-black bg-blue-50 text-[#003DA5] px-3 py-1 rounded-full">TOP {stats.analystRanking.length}</span>
              </div>
              <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                {stats.analystRanking.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(300, stats.analystRanking.length * 40)}>
                    <BarChart data={stats.analystRanking} layout="vertical" margin={{ top: 10, right: 80, left: 10, bottom: 5 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 9, fontWeight: 900, fill: '#1f2937' }} axisLine={false} tickLine={false} />
                      <Bar dataKey="count" fill={FSJ_COLORS.blue} radius={[0, 8, 8, 0]} barSize={20} onClick={(d) => onFilterAction('user', d.name)}><LabelList dataKey="label" position="right" style={{ fontSize: 9, fontWeight: 900, fill: '#003DA5' }} offset={12} /></Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-50">
                    <UsersIcon className="w-10 h-10 mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Nenhum analista identificado</p>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white p-8 rounded-[2rem] shadow-lg flex flex-col h-[400px]">
              <div className="flex items-center justify-between mb-6 border-b pb-4">
                <h3 className="text-[11px] font-black uppercase flex items-center gap-3 text-gray-900 tracking-widest"><ShieldAlertIcon className="w-5 h-5 text-[#D91B2A]" /> Volume por Assunto / Tema</h3>
                <span className="text-[9px] font-black bg-red-50 text-[#D91B2A] px-3 py-1 rounded-full">{stats.errorRanking.length} CATEGORIAS</span>
              </div>
              <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                {stats.errorRanking.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(300, stats.errorRanking.length * 40)}>
                    <BarChart 
                      data={stats.errorRanking} 
                      layout="vertical" 
                      margin={{ top: 10, right: 80, left: 10, bottom: 5 }}
                      onClick={(state) => {
                        if (state && state.activeLabel) {
                          onFilterAction('error', String(state.activeLabel));
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 9, fontWeight: 900, fill: '#1f2937' }} axisLine={false} tickLine={false} />
                      <Bar dataKey="count" fill={FSJ_COLORS.red} radius={[0, 8, 8, 0]} barSize={20}>
                        <LabelList dataKey="label" position="right" style={{ fontSize: 9, fontWeight: 900, fill: '#D91B2A' }} offset={12} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-50"><ShieldAlertIcon className="w-10 h-10 mb-4" /><p className="text-[10px] font-black uppercase tracking-widest">Sem dados de assuntos</p></div>
                )}
              </div>
            </section>
          </div>

          {/* STATUS E TIPO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="bg-white p-8 rounded-[2rem] shadow-lg border border-gray-100">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-900">Status Operacional</h3>
                    <p className="text-[9px] font-bold text-[#003DA5] uppercase mt-1">Coluna usada: STATUS</p>
                  </div>
                </div>
                {stats.statusChart.length > 0 ? (
                  <div className="flex items-center gap-8">
                    <div className="w-1/2 h-40"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={stats.statusChart} innerRadius={35} outerRadius={55} dataKey="value" stroke="none">{stats.statusChart.map((e, i) => <RechartsCell key={i} fill={e.color} />)}</Pie><Tooltip content={<CustomTooltip />} /></PieChart></ResponsiveContainer></div>
                    <div className="w-1/2 space-y-1.5">
                      {stats.statusChart.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[10px] font-black uppercase text-gray-800 gap-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span>{item.name}</span>
                          </div>
                          <span>{item.value} ({item.realPercent}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-[10px] font-black uppercase text-gray-400 italic">Sem dados no período</div>
                )}
            </section>
            <section className="bg-white p-8 rounded-[2rem] shadow-lg border border-gray-100">
                <h3 className="text-[11px] font-black uppercase mb-6 tracking-widest text-gray-900">Tipo de Demanda</h3>
                {stats.typeChart.some(i => i.value > 0) ? (
                  <div className="flex items-center gap-8">
                    <div className="w-1/2 h-40"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={stats.typeChart} innerRadius={35} outerRadius={55} dataKey="value" stroke="none">{stats.typeChart.map((e, i) => <RechartsCell key={i} fill={e.color} />)}</Pie><Tooltip content={<CustomTooltip />} /></PieChart></ResponsiveContainer></div>
                    <div className="w-1/2 space-y-1.5">
                      {stats.typeChart.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[10px] font-black uppercase gap-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span>{item.name}</span>
                          </div>
                          <span>{item.value} ({item.realPercent}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-[10px] font-black uppercase text-gray-400 italic">Sem dados no período</div>
                )}
            </section>
          </div>

          {/* MONITOR DE REINCIDÊNCIA (RETRABALHO) */}
          <section className="bg-white rounded-[2rem] border-4 border-white shadow-2xl overflow-hidden mb-12">
            <div className="px-10 py-6 bg-[#003DA5] text-white flex items-center justify-between border-b-[6px] border-[#D91B2A]">
              <div className="flex items-center gap-5"><Link2Icon className="w-8 h-8 text-white" /><div><h3 className="text-xl font-black uppercase tracking-widest leading-none">Monitor de Retrabalho (REINCIDÊNCIA)</h3><p className="text-[10px] font-black text-white/80 mt-2 uppercase tracking-widest italic">Casos processados mais de uma vez</p></div></div>
              <div className="text-right"><p className="text-3xl font-black tracking-tighter leading-none">{stats.auditData.length}</p><p className="text-[10px] font-black uppercase tracking-widest opacity-80">Linhagens</p></div>
            </div>
            <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
              <table className="w-full text-left font-black uppercase text-[10px]">
                <thead className="bg-gray-50 border-b sticky top-0 z-10"><tr><th className="px-10 py-4">Case Raiz</th><th className="px-8 py-4">Solicitante</th><th className="px-8 py-4 text-center">Aberturas</th><th className="px-10 py-4 text-center">Ação</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.auditData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-red-50 transition-colors"><td className="px-10 py-4 text-[#D91B2A] font-black">{row.rootId}</td><td className="px-8 py-4 text-gray-900 truncate max-w-[150px]">{fixEncoding(row.firstUser)}</td><td className="px-8 py-4 text-center"><span className="px-3 py-1 bg-red-100 text-[#D91B2A] rounded-xl font-black">{row.totalImpact}x</span></td><td className="px-10 py-4 text-center"><button onClick={() => onLocateLineage(row.rootId)} className="px-4 py-2 bg-[#003DA5] text-white rounded-xl text-[9px] hover:bg-[#D91B2A] transition-all shadow-md">LOCALIZAR</button></td></tr>
                  ))}
                  {stats.auditData.length === 0 && (<tr><td colSpan={4} className="px-10 py-20 text-center text-gray-400 italic font-black uppercase">Nenhuma reincidência operativa detectada</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>

          {/* RANKING DE SOLICITANTES (PÓDIO FSJ) - MOVIDO PARA O FINAL */}
          <section className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-white overflow-hidden relative animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="flex items-center justify-between mb-12 border-b pb-6">
              <div className="flex items-center gap-4">
                <div className="bg-yellow-500 p-3 rounded-2xl shadow-lg ring-4 ring-yellow-100">
                  <TrophyIcon className="w-8 h-8 text-white animate-pulse" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Ranking de Solicitantes (FSJ)</h3>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">Colaboradores que mais abrem chamados</p>
                </div>
              </div>
              <div className="hidden md:block">
                <span className="text-[10px] font-black bg-blue-50 text-[#003DA5] px-4 py-2 rounded-full border border-blue-100">FONTE: COLUNA USUÁRIO</span>
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row items-end justify-center gap-8 md:gap-4 py-12 max-w-5xl mx-auto">
              {stats.podiumSolicitants.length > 0 ? (
                <>
                  {/* 2º Lugar */}
                  {stats.podiumSolicitants[1] && (
                    <div className="flex flex-col items-center group w-full md:w-1/4 animate-in slide-in-from-left-8 duration-700 delay-200">
                      <div className="text-center mb-6 truncate w-full px-2">
                        <p className="text-sm font-black text-gray-800 uppercase leading-none">{fixEncoding(stats.podiumSolicitants[1].name)}</p>
                      </div>
                      <div className="w-full h-32 bg-gradient-to-b from-slate-200 to-slate-400 rounded-t-[2.5rem] flex flex-col items-center justify-center border-t-4 border-slate-300 shadow-xl relative group-hover:-translate-y-2 transition-transform duration-500">
                        <MedalIcon className="w-10 h-10 text-slate-500 absolute -top-5 drop-shadow-md" />
                        <span className="text-white text-4xl font-black italic">2º</span>
                        <div className="mt-3 bg-white/40 px-3 py-1 rounded-full backdrop-blur-sm">
                          <span className="text-[11px] font-black text-slate-900">{stats.podiumSolicitants[1].count} CASES</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* 1º Lugar */}
                  {stats.podiumSolicitants[0] && (
                    <div className="flex flex-col items-center group w-full md:w-1/3 z-10 animate-in slide-in-from-bottom-12 duration-1000">
                      <div className="text-center mb-8 truncate w-full px-4">
                        <p className="text-lg font-black text-[#003DA5] uppercase tracking-tighter leading-none">{fixEncoding(stats.podiumSolicitants[0].name)}</p>
                      </div>
                      <div className="w-full h-48 bg-gradient-to-b from-[#003DA5] to-blue-900 rounded-t-[3rem] flex flex-col items-center justify-center border-t-8 border-blue-950 shadow-[0_20px_50px_rgba(0,61,165,0.3)] relative group-hover:-translate-y-4 transition-transform duration-500">
                        <div className="absolute -top-10">
                          <TrophyIcon className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.6)] animate-bounce" />
                        </div>
                        <span className="text-white text-6xl font-black italic tracking-tighter mb-2">1º</span>
                        <div className="bg-yellow-500 px-6 py-2 rounded-full shadow-lg border-2 border-yellow-300">
                          <span className="text-[12px] font-extrabold text-white uppercase tracking-widest">{stats.podiumSolicitants[0].count} CASES</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* 3º Lugar */}
                  {stats.podiumSolicitants[2] && (
                    <div className="flex flex-col items-center group w-full md:w-1/4 animate-in slide-in-from-right-8 duration-700 delay-400">
                      <div className="text-center mb-6 truncate w-full px-2">
                        <p className="text-sm font-black text-gray-800 uppercase leading-none">{fixEncoding(stats.podiumSolicitants[2].name)}</p>
                      </div>
                      <div className="w-full h-24 bg-gradient-to-b from-orange-300 to-orange-500 rounded-t-[2.5rem] flex flex-col items-center justify-center border-t-4 border-orange-400 shadow-xl relative group-hover:-translate-y-1 transition-transform duration-500">
                        <MedalIcon className="w-8 h-8 text-orange-700 absolute -top-4 opacity-70" />
                        <span className="text-white text-3xl font-black italic">3º</span>
                        <div className="mt-2 bg-white/40 px-3 py-1 rounded-full backdrop-blur-sm">
                          <span className="text-[10px] font-black text-orange-950">{stats.podiumSolicitants[2].count} CASES</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center opacity-30 py-20 w-full border-4 border-dashed border-gray-100 rounded-[3rem]">
                  <AlertCircle className="w-16 h-16 mb-4 text-gray-400" />
                  <p className="text-sm font-black uppercase tracking-widest text-center">Dados insuficientes para o Ranking</p>
                </div>
              )}
            </div>
            
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -z-1 opacity-50" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-red-50 rounded-full blur-3xl -z-1 opacity-50" />
          </section>
        </div>
      )}

      {/* DASHBOARDS ESPECÍFICOS (ABAS) */}
      {activeTab === 'productivity' && (
        <div className="space-y-8 animate-in slide-in-from-right-10 duration-500">
           {stats.analystRanking.length === 0 ? (
             <div className="bg-white p-20 rounded-[2.5rem] shadow-xl text-center border-4 border-blue-50"><UsersIcon className="w-16 h-16 text-gray-200 mx-auto mb-6" /><h3 className="text-xl font-black uppercase text-gray-400">Sem dados de produtividade</h3></div>
           ) : (
             <div className="flex flex-col gap-10">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl">
                  <h3 className="text-xl font-black uppercase mb-8 flex items-center gap-3 text-[#003DA5] tracking-tight"><Target className="w-6 h-6" /> Produtividade e Agilidade por Analista (SOVOS)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-black uppercase text-[10px]">
                      <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-3">Analista / Atendente</th><th className="px-4 py-3 text-center">Volume</th><th className="px-4 py-3 text-center">No Prazo</th><th className="px-4 py-3 text-center">Resolvidos</th><th className="px-4 py-3 text-center">Média SLA</th><th className="px-4 py-3 text-right">Aproveitamento</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.analystRanking.map((u, i) => (
                          <tr key={i} className="hover:bg-blue-50 transition-colors">
                            <td className="px-4 py-4 text-gray-900">{u.name}</td>
                            <td className="px-4 py-4 text-center">{u.total}</td>
                            <td className="px-4 py-4 text-center text-emerald-700">{u.onTime}</td>
                            <td className="px-4 py-4 text-center text-[#003DA5]">{u.concluido}</td>
                            <td className="px-4 py-4 text-center text-gray-500">{u.avgSla}d</td>
                            <td className="px-4 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-[#003DA5]" style={{ width: `${u.efficiency}%` }} />
                                </div>
                                <span className="text-[#003DA5] min-w-[35px]">{u.efficiency}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border-t-8 border-[#D91B2A]">
                  <h3 className="text-xl font-black uppercase mb-8 flex items-center gap-3 text-[#D91B2A] tracking-tight"><BriefcaseIcon className="w-6 h-6" /> Ranking Completo de Solicitantes (FSJ)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-black uppercase text-[10px]">
                      <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Solicitante</th><th className="px-4 py-3 text-center">Volume de Cases</th><th className="px-4 py-3 text-right">Participação</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.solicitantRanking.map((s, i) => (
                          <tr key={i} className="hover:bg-red-50 transition-colors">
                            <td className="px-4 py-4 font-black text-gray-400">{i + 1}º</td>
                            <td className="px-4 py-4 text-gray-900 font-bold">{s.name}</td>
                            <td className="px-4 py-4 text-center">{s.count}</td>
                            <td className="px-4 py-4 text-right">
                               <span className="px-3 py-1 bg-red-100 text-[#D91B2A] rounded-full">{s.share}%</span>
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
      )}

      {/* DASHBOARD GARGALOS - PRIORIZAÇÃO GERENCIAL */}
      {activeTab === 'bottlenecks' && (
        <div className="space-y-8 animate-in slide-in-from-right-10 duration-500">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <section className="bg-white p-10 rounded-[2.5rem] shadow-xl border-t-8 border-red-600">
                 <div className="flex items-center justify-between mb-10">
                    <h3 className="text-2xl font-black uppercase flex items-center gap-4 text-gray-900 tracking-tighter">
                      <AlertTriangle className="w-10 h-10 text-[#D91B2A]" /> Gargalos: Top 10 Prioridades
                    </h3>
                    <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-[#D91B2A] rounded-xl border border-red-200">
                       <ShieldAlertIcon className="w-5 h-5" />
                       <span className="text-[11px] font-black uppercase">Painel Crítico</span>
                    </div>
                 </div>
                 
                 <div className="h-[550px]">
                    <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={stats.errorRanking.slice(0, 10)} layout="vertical" margin={{ left: 20, right: 60 }}>
                          <XAxis type="number" hide />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={160} 
                            tick={{ fontSize: 11, fontWeight: 900, fill: '#1e293b' }} 
                            axisLine={false} 
                            tickLine={false} 
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" radius={[0, 12, 12, 0]} barSize={32}>
                             {stats.errorRanking.slice(0,10).map((entry, index) => (
                               <RechartsCell key={index} fill={entry.level === 'CRITICAL' ? '#D91B2A' : (entry.level === 'ATTENTION' ? '#ea580c' : '#4b5563')} />
                             ))}
                             <LabelList 
                                dataKey="count" 
                                position="right" 
                                content={(props: any) => {
                                  const { x, y, width, height, value, index } = props;
                                  const entry = stats.errorRanking[index];
                                  if(!entry) return null;
                                  return (
                                    <g>
                                       <text 
                                          x={x + width + 10} 
                                          y={y + height / 2 + 5} 
                                          fill={entry.level === 'CRITICAL' ? '#D91B2A' : '#1e293b'} 
                                          fontSize={18} 
                                          fontWeight={800}
                                       >
                                          {value}
                                       </text>
                                       <foreignObject x={x + width + 45} y={y + 5} width={30} height={height}>
                                          <div className="flex items-center h-full">
                                             {entry.trend === 'UP' && <TrendingUp className="w-5 h-5 text-red-600 animate-pulse" />}
                                             {entry.trend === 'DOWN' && <TrendingDown className="w-5 h-5 text-emerald-600" />}
                                             {entry.trend === 'STABLE' && <Minus className="w-5 h-5 text-gray-400" />}
                                          </div>
                                       </foreignObject>
                                    </g>
                                  );
                                }}
                             />
                          </Bar>
                       </BarChart>
                    </ResponsiveContainer>
                 </div>
              </section>

              <section className="bg-[#1e293b] p-10 rounded-[2.5rem] shadow-xl text-white flex flex-col">
                 <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-6">
                    <h3 className="text-2xl font-black uppercase flex items-center gap-4 tracking-tighter">
                      <History className="w-10 h-10 text-blue-400" /> Histórico de Retrabalho Crítico
                    </h3>
                    <div className="text-right">
                       <span className="text-[10px] font-black text-blue-300 uppercase block">Total Casos</span>
                       <span className="text-3xl font-black">{stats.auditData.length}</span>
                    </div>
                 </div>
                 
                 <div className="space-y-6 flex-grow overflow-y-auto pr-4 custom-scrollbar">
                    {stats.auditData.map((a, i) => (
                      <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-[2rem] hover:bg-white/10 transition-all group relative overflow-hidden">
                         <div className="flex flex-col gap-4 relative z-10">
                            <div className="flex items-center justify-between">
                               <div>
                                  <span className="text-blue-400 font-black text-lg block leading-none">{a.rootId}</span>
                                  <span className="text-white/40 text-[10px] font-black uppercase tracking-widest mt-1">Linhagem Identificada</span>
                               </div>
                               <div className="text-right">
                                  <span className="bg-[#D91B2A] text-white px-4 py-1.5 rounded-full text-[12px] font-black shadow-lg">
                                     {a.totalImpact}x Reincidência
                                  </span>
                               </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 bg-black/20 p-4 rounded-2xl border border-white/5">
                               <div className="space-y-1">
                                  <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">Motivo Principal</span>
                                  <p className="text-[11px] font-black text-blue-100 line-clamp-2 italic leading-tight">"{a.reason}"</p>
                               </div>
                               <div className="space-y-1 text-right">
                                  <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">Última Ocorrência</span>
                                  <p className="text-[12px] font-black text-white">{a.lastOccur.split('-').reverse().join('/')}</p>
                               </div>
                            </div>

                            <div className="flex items-center justify-between">
                               <div className="flex items-center gap-3">
                                  <div className="bg-red-900/40 p-2 rounded-lg border border-red-500/20">
                                     <TimerIcon className="w-4 h-4 text-red-400" />
                                  </div>
                                  <div>
                                     <span className="text-[9px] font-black text-red-400 uppercase tracking-widest block leading-none">Impacto no SLA</span>
                                     <span className="text-sm font-black text-white">{a.slaImpact} Dias Acumulados</span>
                                  </div>
                               </div>
                               <button 
                                  onClick={() => onLocateLineage(a.rootId)}
                                  className="flex items-center gap-2 px-5 py-2.5 bg-[#003DA5] hover:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-md group-hover:scale-105"
                               >
                                  <ExternalLink className="w-3 h-3" /> Abrir Casos Relacionados
                                </button>
                            </div>
                         </div>
                         <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 blur-[60px] rounded-full" />
                      </div>
                    ))}
                 </div>
              </section>
           </div>
        </div>
      )}

      {activeTab === 'cycle' && (
        <div className="space-y-8 animate-in slide-in-from-right-10 duration-500">
          <section className="bg-white p-10 rounded-[2.5rem] shadow-xl border-4 border-blue-50">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 gap-6">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-[#003DA5]">Velocidade de Resposta / Atendimento</h3>
                <div className="flex flex-col gap-2 mt-3">
                  <div className="flex items-center gap-4">
                    <div className="text-[10px] font-black text-gray-700 uppercase tracking-widest flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#003DA5]" />
                      SLA Realizado (Médio)
                    </div>
                    <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                      <div className="w-3 h-1 bg-emerald-500 rounded-full" />
                      Meta SLA (≤ 5 dias)
                    </div>
                  </div>
                  <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    Backlog: Casos em aberto (Tempo Médio)
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-red-50 px-6 py-3 rounded-2xl border border-red-100">
                  <p className="text-[8px] font-black text-red-900 uppercase mb-1">Média Conclusão</p>
                  <p className="text-xl font-black text-[#D91B2A]">{stats.cycleSummary.avgConc}d</p>
                  <p className="text-[7px] font-black text-red-700 uppercase mt-1">Meta: 5d</p>
                </div>
                <div className="bg-amber-50 px-6 py-3 rounded-2xl border border-amber-100">
                  <p className="text-[8px] font-black text-amber-900 uppercase mb-1">Tempo Médio em Aberto</p>
                  <p className="text-xl font-black text-amber-700">{stats.cycleSummary.backlogAvg}d</p>
                  <p className="text-[7px] font-black text-amber-600 uppercase mt-1">Status ≠ Concluído</p>
                </div>
                <div className="bg-orange-50 px-6 py-3 rounded-2xl border border-orange-100">
                  <p className="text-[8px] font-black text-orange-900 uppercase mb-1">Mais Antigo (Aberto)</p>
                  <p className="text-xl font-black text-orange-700">{stats.cycleSummary.oldestBacklogAge}d</p>
                </div>
                <div className="bg-blue-50 px-6 py-3 rounded-2xl border border-blue-100">
                  <p className="text-[8px] font-black text-blue-900 uppercase mb-1">Qtd em Aberto</p>
                  <p className="text-xl font-black text-[#003DA5]">{stats.cycleSummary.openCasesCount}</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar-h pb-6">
              <div style={{ minWidth: `${Math.max(800, stats.cycleTimeData.length * 100)}px`, height: '450px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart 
                    data={stats.cycleTimeData} 
                    margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
                    onClick={(data) => {
                      if (data && data.activeLabel) {
                        const label = String(data.activeLabel);
                        setSelectedCycleMonth(selectedCycleMonth === label ? null : label);
                        
                        // Smooth scroll to details
                        setTimeout(() => {
                          detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }
                    }}
                  >
                    <defs>
                      <linearGradient id="colorConc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={FSJ_COLORS.blue} stopOpacity={0.1}/>
                        <stop offset="95%" stopColor={FSJ_COLORS.blue} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 900, fill: '#475569' }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 900, fill: '#475569' }} 
                    />
                    <Tooltip 
                      content={(props: any) => {
                        const { active, payload, label } = props;
                        if (active && payload && payload.length) {
                          const concVal = parseFloat(payload[0].value);
                          const isOutlier = concVal > 20;
                          return (
                            <div className="bg-white p-4 rounded-2xl shadow-2xl border-2 border-gray-200 min-w-[200px]">
                              <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-2 border-b pb-1">{label}</p>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-6">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: concVal <= 5 ? '#059669' : (concVal <= 9 ? '#d97706' : '#D91B2A') }} />
                                    <span className="text-[9px] font-black uppercase text-gray-700">Tempo Conclusão:</span>
                                  </div>
                                  <span className="text-xs font-black" style={{ color: concVal <= 5 ? '#059669' : (concVal <= 9 ? '#d97706' : '#D91B2A') }}>{concVal} dias</span>
                                </div>
                              </div>
                              {isOutlier && (
                                <div className="mt-3 pt-2 border-t border-red-100 flex items-start gap-2">
                                  <AlertTriangle className="w-3 h-3 text-red-600 shrink-0 mt-0.5" />
                                  <p className="text-[8px] font-black text-red-700 uppercase leading-tight">
                                    Pico Extremo: Volume atípico ou complexidade elevada.
                                  </p>
                                </div>
                              )}
                              <p className="text-[8px] font-black text-blue-600 uppercase mt-2 italic">Clique para ver detalhes abaixo</p>
                            </div>
                          );
                        }
                        return null;
                      }} 
                    />
                    <ReferenceLine 
                      y={5} 
                      stroke={FSJ_COLORS.emerald} 
                      strokeDasharray="5 5" 
                      strokeWidth={2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="avgConclusion" 
                      name="Conclusão" 
                      fill="url(#colorConc)" 
                      stroke={FSJ_COLORS.blue} 
                      strokeWidth={2} 
                      animationDuration={1000}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="avgConclusion" 
                      name="Pico" 
                      stroke="none" 
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        const val = parseFloat(payload.avgConclusion);
                        const isOutlier = val > 20;
                        const color = val <= 5 ? '#059669' : (val <= 9 ? '#d97706' : '#D91B2A');
                        
                        if (isOutlier) {
                          return (
                            <g key={props.index}>
                              <circle cx={cx} cy={cy} r={6} fill={color} className="animate-pulse" />
                              <circle cx={cx} cy={cy} r={10} stroke={color} strokeWidth={1} fill="none" className="animate-ping" />
                            </g>
                          );
                        }
                        return <circle key={props.index} cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />;
                      }} 
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* QUADRO DE IDENTIFICAÇÃO DE CASES CRÍTICOS */}
            <div className="mt-12 border-t pt-10" ref={detailsRef}>
              <div className="flex flex-col mb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xl font-black uppercase tracking-tighter text-gray-900">
                      {selectedCycleMonth ? `Detalhamento: ${selectedCycleMonth}` : 'Top 5 Casos Críticos do Período'}
                    </h4>
                    <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest mt-1">
                      {selectedCycleMonth ? 'Análise granular do período selecionado' : 'Ordenado por maior tempo de conclusão'}
                    </p>
                  </div>
                  {selectedCycleMonth && (
                    <button 
                      onClick={() => setSelectedCycleMonth(null)}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2"
                    >
                      <RotateCcwIcon className="w-3 h-3" /> Limpar Seleção
                    </button>
                  )}
                </div>

                {selectedCycleMonth && (() => {
                  const monthData = stats.cycleTimeData.find(d => d.month === selectedCycleMonth);
                  if (!monthData) return null;
                  
                  const records = monthData.records || [];
                  const total = records.length;
                  const avgSla = parseFloat(monthData.avgConclusion);
                  
                  const critico = records.filter(r => {
                    const od = robustDateParse(r.openingDate);
                    const rd = robustDateParse(r.returnDate);
                    const cd = robustDateParse(r.conclusionDate);
                    const start = od ? startOfDay(od) : today;
                    const conc = rd ? startOfDay(rd) : (cd ? startOfDay(cd) : today);
                    return Math.abs(differenceInDays(conc, start)) > 9;
                  }).length;

                  const alerta = records.filter(r => {
                    const od = robustDateParse(r.openingDate);
                    const rd = robustDateParse(r.returnDate);
                    const cd = robustDateParse(r.conclusionDate);
                    const start = od ? startOfDay(od) : today;
                    const conc = rd ? startOfDay(rd) : (cd ? startOfDay(cd) : today);
                    const diff = Math.abs(differenceInDays(conc, start));
                    return diff > 5 && diff <= 9;
                  }).length;

                  const devolvidos = records.filter(r => normalizeStatusStrict(r.status) === 'DEVOLVIDO').length;

                  return (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 animate-in slide-in-from-top-4 duration-300">
                      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">SLA Médio</span>
                        <p className={`text-xl font-black ${avgSla <= 5 ? 'text-emerald-600' : (avgSla <= 9 ? 'text-amber-600' : 'text-red-600')}`}>
                          {avgSla}d
                        </p>
                      </div>
                      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Total de Cases</span>
                        <p className="text-xl font-black text-gray-900">{total}</p>
                      </div>
                      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <span className="text-[8px] font-black text-red-400 uppercase tracking-widest block mb-1">Críticos</span>
                        <p className="text-xl font-black text-red-600">{critico}</p>
                      </div>
                      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest block mb-1">Alerta</span>
                        <p className="text-xl font-black text-amber-600">{alerta}</p>
                      </div>
                      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <span className="text-[8px] font-black text-orange-400 uppercase tracking-widest block mb-1">Devolvidos</span>
                        <p className="text-xl font-black text-orange-600">{devolvidos}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="overflow-x-auto rounded-3xl border-2 border-gray-100 shadow-sm">
                <table className="w-full text-left font-black uppercase text-[10px]">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-4">Case</th>
                      <th className="px-6 py-4">Analista</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-center">Conclusão (Dias)</th>
                      <th className="px-6 py-4 text-center">Reinc.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(() => {
                      let displayRecords: TicketRecord[] = [];
                      if (selectedCycleMonth) {
                        const monthData = stats.cycleTimeData.find(d => d.month === selectedCycleMonth);
                        displayRecords = monthData ? monthData.records : [];
                      } else {
                        displayRecords = records;
                      }

                      return displayRecords
                        .map(r => {
                          const od = robustDateParse(r.openingDate);
                          const rd = robustDateParse(r.returnDate);
                          const cd = robustDateParse(r.conclusionDate);
                          const start = od ? startOfDay(od) : today;
                          const conc = rd ? startOfDay(rd) : (cd ? startOfDay(cd) : today);
                          
                          return {
                            ...r,
                            concDiff: Math.abs(differenceInDays(conc, start))
                          };
                        })
                        .sort((a, b) => b.concDiff - a.concDiff)
                        .slice(0, selectedCycleMonth ? 100 : 5)
                        .map((r, idx) => (
                          <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                            <td className="px-6 py-4 text-[#003DA5] font-black">{r.caseId}</td>
                            <td className="px-6 py-4 text-gray-700">{r.user || r.externalUser || 'S/A'}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded-md text-[8px] ${r.type === 'PROJETO' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                {r.type}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${STATUS_CONFIG[normalizeStatusStrict(r.status) || '']?.color || 'bg-gray-300'}`} />
                                <span className="text-[9px]">{normalizeStatusStrict(r.status)}</span>
                                {normalizeStatusStrict(r.status) === 'DEVOLVIDO' && (
                                  <RotateCcwIcon className="w-3 h-3 text-amber-600" />
                                )}
                              </div>
                            </td>
                            <td className={`px-6 py-4 text-center font-black ${r.concDiff >= 10 ? 'text-red-600' : (r.concDiff >= 6 ? 'text-amber-600' : 'text-emerald-600')}`}>
                              {r.concDiff}d
                            </td>
                            <td className="px-6 py-4 text-center">
                              {r.previousCaseId && r.previousCaseId !== '-' ? (
                                <div className="flex items-center justify-center gap-1 text-red-600">
                                  <History className="w-3 h-3" />
                                  <span className="text-[8px]">SIM</span>
                                </div>
                              ) : (
                                <span className="text-gray-300 text-[8px]">-</span>
                              )}
                            </td>
                          </tr>
                        ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* DASHBOARD RISCO OPERACIONAL */}
      {activeTab === 'risk' && (
        <div className="space-y-10 animate-in slide-in-from-right-10 duration-500">
           <div className="flex items-center justify-between bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-gray-900 flex items-center gap-3">
                  <Gauge className="w-8 h-8 text-blue-600" /> SLA GERAL vs PERFORMANCE MENSAL
                </h3>
                <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mt-1">Comparativo de performance entre a base histórica e o período atual</p>
              </div>
              <div className="px-5 py-2 bg-blue-50 rounded-2xl border border-blue-100 text-blue-700 flex items-center gap-3">
                <Calendar className="w-5 h-5 opacity-60" />
                <span className="text-[11px] font-black uppercase">{stats.periodRef}</span>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* COLUNA GERAL (Baseline) */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-2 px-4">
                  <div className="w-3 h-3 rounded-full bg-gray-500" />
                  <h4 className="text-sm font-black uppercase tracking-widest text-gray-700">Benchmark Geral (Base Histórica)</h4>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { label: 'No Prazo (≤5d)', count: stats.generalRiskStats.noPrazo, pct: stats.generalRiskStatsPct.noPrazo, color: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: <CheckCircle2 className="w-5 h-5" /> },
                    { label: 'Alerta (6-9d)', count: stats.generalRiskStats.alerta, pct: stats.generalRiskStatsPct.alerta, color: 'bg-amber-50 text-amber-700 border-amber-100', icon: <AlertTriangle className="w-5 h-5" /> },
                    { label: 'Crítico (>9d)', count: stats.generalRiskStats.critico, pct: stats.generalRiskStatsPct.critico, color: 'bg-red-50 text-red-700 border-red-100', icon: <ShieldAlertIcon className="w-5 h-5" /> }
                  ].map((item, i) => (
                    <div key={i} className={`p-6 rounded-[2rem] border shadow-sm flex items-center justify-between ${item.color}`}>
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/50 rounded-xl">{item.icon}</div>
                        <div>
                          <p className="text-[10px] font-black uppercase opacity-60">{item.label}</p>
                          <p className="text-3xl font-black">{item.count}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase opacity-40">Share</p>
                        <p className="text-xl font-black opacity-80">{item.pct}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* COLUNA PERÍODO (Performance Atual) */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-2 px-4">
                  <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse" />
                  <h4 className="text-sm font-black uppercase tracking-widest text-blue-600">Performance Período Selecionado</h4>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { key: 'noPrazo', label: 'No Prazo (≤5d)', count: stats.ctxNoPrazo, pct: stats.ctxNoPrazoPct, generalPct: stats.generalRiskStatsPct.noPrazo, color: 'bg-emerald-600 text-white', icon: <CheckCircle2 className="w-6 h-6" />, reverseTrend: true },
                    { key: 'alerta', label: 'Alerta (6-9d)', count: stats.ctxAlerta, pct: stats.ctxAlertaPct, generalPct: stats.generalRiskStatsPct.alerta, color: 'bg-amber-600 text-white', icon: <AlertTriangle className="w-6 h-6" /> },
                    { key: 'critico', label: 'Crítico (>9d)', count: stats.ctxCritico, pct: stats.ctxCriticoPct, generalPct: stats.generalRiskStatsPct.critico, color: 'bg-red-600 text-white', icon: <ShieldAlertIcon className="w-6 h-6" /> }
                  ].map((item, i) => {
                    const diff = Number(item.pct) - Number(item.generalPct);
                    const isPositive = diff > 0;
                    const isBetter = item.reverseTrend ? isPositive : !isPositive;
                    
                    return (
                      <div key={i} className={`p-6 rounded-[2rem] shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-all cursor-pointer ${item.color}`} onClick={() => onFilterAction('sla', item.label.split(' ')[0].toUpperCase())}>
                        <div className="flex items-center justify-between relative z-10">
                          <div className="flex items-center gap-5">
                            <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">{item.icon}</div>
                            <div>
                              <p className="text-[10px] font-black uppercase opacity-70 tracking-widest">{item.label}</p>
                              <p className="text-4xl font-black">{item.count} <span className="text-xl opacity-60">({item.pct}%)</span></p>
                            </div>
                          </div>
                          
                          <div className="text-right flex flex-col items-end">
                            <TrendIcon trend={(stats.riskTrends as any)[item.key]} />
                            <div className={`mt-2 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black border ${Math.abs(diff) === 0 ? 'bg-white/10 border-white/20' : (isBetter ? 'bg-emerald-400 text-emerald-950 border-emerald-300' : 'bg-red-400 text-red-950 border-red-300')}`}>
                              {diff !== 0 && (isBetter ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />)}
                              {diff > 0 ? `+${diff}` : (diff < 0 ? diff : 'ESTÁVEL')}% vs Geral
                            </div>
                          </div>
                        </div>
                        <div className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 group-hover:scale-110 transition-all pointer-events-none">
                           {item.icon}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
           </div>
        </div>
      )}

      {/* DASHBOARD QUALIDADE - REESTRUTURADO */}
      {activeTab === 'quality' && (
        <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
           
           {/* LINHA 1: KPIs PRINCIPAIS */}
           <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center group hover:shadow-md transition-all">
                  <div className={`p-3 rounded-xl mb-4 transition-colors ${Number(stats.rftIndex) >= 98 ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100' : 'bg-red-50 text-red-600 group-hover:bg-red-100'}`}>
                    <Target className="w-6 h-6" />
                  </div>
                  <h4 className="text-[14px] font-black text-gray-700 uppercase tracking-wide mb-1">Qualidade (RFT)</h4>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-[32px] font-bold ${Number(stats.rftIndex) >= 98 ? 'text-emerald-700' : 'text-red-700'}`}>{stats.rftIndex}%</span>
                    <TrendIcon trend={stats.rftTrend as "UP" | "DOWN" | "STABLE"} />
                  </div>
                  <div className={`mt-2 px-4 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1.5 ${Number(stats.rftIndex) >= 98 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${Number(stats.rftIndex) >= 98 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {Number(stats.rftIndex) >= 98 ? 'Acima da Meta' : 'Abaixo da Meta'}
                  </div>
                  <p className="text-[11px] font-medium text-gray-600 mt-2 italic">Meta de qualidade (RFT): ≥ 98%</p>
              </div>

              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center group hover:shadow-md transition-all">
                  <div className="p-3 bg-indigo-50 rounded-xl mb-4 group-hover:bg-indigo-100 transition-colors">
                    <CheckCircle2 className="w-6 h-6 text-indigo-600" />
                  </div>
                  <h4 className="text-[14px] font-black text-gray-700 uppercase tracking-wide mb-1">Qualidade Total</h4>
                  <span className="text-[32px] font-bold text-[#111827]">
                    {((stats.totalConcluidos / (stats.validRecordsCount || 1)) * 100).toFixed(1)}%
                  </span>
                  <p className="text-[12px] font-medium text-indigo-600 uppercase mt-2">Efetividade</p>
              </div>

              <div 
                onClick={() => onFilterAction('recurrence', 'RETRABALHO')}
                className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center group hover:shadow-md transition-all cursor-pointer"
              >
                  <div className="p-3 bg-orange-50 rounded-xl mb-4 group-hover:bg-orange-100 transition-colors">
                    <RotateCcwIcon className="w-6 h-6 text-orange-600" />
                  </div>
                  <h4 className="text-[14px] font-black text-gray-700 uppercase tracking-wide mb-1">Retrabalho</h4>
                  <span className="text-[32px] font-bold text-[#111827]">{stats.totalRetrabalho}</span>
                  <p className="text-[12px] font-medium text-orange-600 uppercase mt-2">Volume Bruto</p>
              </div>

              <div className={`p-6 rounded-[2rem] shadow-sm border flex flex-col items-center justify-center text-center transition-all ${stats.reworkAlert ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
                  <div className={`p-3 rounded-xl mb-4 ${stats.reworkAlert ? 'bg-red-100' : 'bg-emerald-100'}`}>
                    {stats.reworkAlert ? <AlertTriangle className="w-6 h-6 text-red-600" /> : <CheckCircle className="w-6 h-6 text-emerald-600" />}
                  </div>
                  <h4 className={`text-[14px] font-semibold uppercase tracking-wide mb-1 ${stats.reworkAlert ? 'text-red-500' : 'text-emerald-500'}`}>Diagnóstico</h4>
                  <span className={`text-[28px] font-bold ${stats.reworkAlert ? 'text-red-900' : 'text-emerald-900'}`}>
                    {stats.reworkAlert ? 'ALERTA' : 'CONFORME'}
                  </span>
                  <p className={`text-[11px] font-bold uppercase mt-2 ${stats.reworkAlert ? 'text-red-700' : 'text-emerald-700'}`}>
                    Meta: ≤ 5% ({stats.reworkRate.toFixed(1)}%)
                  </p>
              </div>
           </div>

            <div className="bg-[#111827] p-6 rounded-[2rem] border-l-[6px] border-amber-500 shadow-lg">
              <p className="text-[16px] font-bold text-[#F9FAFB] uppercase tracking-tight flex items-center gap-3">
                <ZapIcon className="w-5 h-5 text-amber-500" />
                RFT (Resolução na primeira interação): {stats.rftIndex}% | Retrabalho: {stats.reworkRate.toFixed(1)}%
              </p>
              <div className="flex items-center justify-between mt-3">
                <p className="text-[11px] font-black text-gray-600 uppercase tracking-wider italic">{stats.periodRef}</p>
                <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-lg border border-white/10">
                  <Filter className="w-3 h-3 text-gray-500" />
                  <span className="text-[11px] font-black text-gray-600 uppercase tracking-widest">Base Filtrada</span>
                </div>
              </div>
            </div>

           {/* LINHA 2: ANÁLISE DETALHADA */}
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="absolute top-6 left-6">
                    <h4 className="text-[15px] font-semibold text-[#111827] uppercase tracking-wide">Visão Analítica RFT</h4>
                  </div>
                  
                  <div className="relative w-56 h-56 mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                              <Pie 
                                data={[{ value: Number(stats.rftIndex) }, { value: 100 - Number(stats.rftIndex) }]} 
                                innerRadius={70} 
                                outerRadius={90} 
                                startAngle={90} 
                                endAngle={450} 
                                dataKey="value" 
                                stroke="none"
                              >
                                  <RechartsCell fill={Number(stats.rftIndex) >= 98 ? '#059669' : Number(stats.rftIndex) >= 95 ? '#D97706' : '#DC2626'} />
                                  <RechartsCell fill="#F3F4F6" />
                              </Pie>
                          </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`text-[36px] font-bold ${Number(stats.rftIndex) >= 98 ? 'text-emerald-600' : 'text-red-600'}`}>{stats.rftIndex}%</span>
                          <span className={`text-[10px] font-bold uppercase mt-1 ${Number(stats.rftIndex) >= 98 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {Number(stats.rftIndex) >= 98 ? 'Meta Atingida' : 'Abaixo da Meta'}
                          </span>
                      </div>
                  </div>
                  
                  <div className="mt-4 text-center">
                    <p className="text-[12px] font-medium text-gray-500 uppercase">
                      {stats.concluidosPerfeitos} de {stats.rftBase} entregues em conformidade RFT
                    </p>
                  </div>
              </section>

              <div className="grid grid-cols-1 gap-4">
                  <div className="bg-[#991b1b] p-6 rounded-[2rem] shadow-sm flex flex-col justify-between border-b-4 border-[#450a0a]">
                      <div className="flex items-center gap-3 mb-4">
                          <History className="w-5 h-5 text-[#F9FAFB] opacity-80" />
                          <span className="text-[14px] font-semibold text-[#F9FAFB] uppercase tracking-wide">Causa: Reincidência</span>
                      </div>
                      <p className="text-[14px] font-bold text-[#F9FAFB] uppercase leading-tight line-clamp-2 italic opacity-90">{stats.topReincReason}</p>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-red-200 uppercase opacity-60">Destaque Crítico</span>
                        <TrendingDown className="w-4 h-4 text-red-200" />
                      </div>
                  </div>
                  <div className="bg-[#1e3a8a] p-6 rounded-[2rem] shadow-sm flex flex-col justify-between border-b-4 border-[#172554]">
                      <div className="flex items-center gap-3 mb-4">
                          <AlertTriangle className="w-5 h-5 text-[#F9FAFB] opacity-80" />
                          <span className="text-[14px] font-semibold text-[#F9FAFB] uppercase tracking-wide">Causa: Devolução</span>
                      </div>
                      <p className="text-[14px] font-bold text-[#F9FAFB] uppercase leading-tight line-clamp-2 italic opacity-90">{stats.topDevolReason}</p>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-blue-200 uppercase opacity-60">Monitoramento</span>
                        <ActivityIcon className="w-4 h-4 text-blue-200" />
                      </div>
                  </div>
              </div>
           </div>

           {/* LINHA 3: FUNIS DE RESOLUÇÃO E QUALIDADE */}
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10 transition-all">
               <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col">
                  <div className="flex items-center gap-4 mb-6 border-b border-gray-50 pb-4">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <LayersIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-[16px] font-bold text-[#111827] uppercase tracking-tight leading-none">Funil Operacional</h3>
                      <p className="text-[11px] font-black text-gray-600 uppercase mt-1">Status de Fluxo</p>
                    </div>
                  </div>
                  
                  <div className="space-y-6 flex-grow">
                      {stats.operationalFunnel.map((item, idx) => {
                          const maxVal = stats.validRecordsCount || 1;
                          const percent = (item.value / maxVal) * 100;
                          return (
                            <div key={idx} className="space-y-2 group">
                                <div className="flex justify-between items-end">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black uppercase text-gray-600 leading-none mb-1">{item.step}</span>
                                        <span className="text-[15px] font-bold text-[#111827] uppercase tracking-tight">{item.label}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[28px] font-bold block leading-none text-[#111827] mb-1">{item.value}</span>
                                        <span className="text-[11px] font-black text-gray-600">{percent.toFixed(1)}%</span>
                                    </div>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-1000 ${item.color}`} 
                                      style={{ width: `${Math.max(2, percent)}%` }} 
                                    />
                                </div>
                            </div>
                          );
                      })}
                  </div>
               </section>

               <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col">
                  <div className="flex items-center gap-4 mb-6 border-b border-gray-50 pb-4">
                    <div className="p-2 bg-emerald-50 rounded-lg">
                      <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-[16px] font-bold text-[#111827] uppercase tracking-tight leading-none">Funil de Qualidade</h3>
                      <p className="text-[11px] font-black text-gray-600 uppercase mt-1">Conformidade RFT</p>
                    </div>
                  </div>
                  
                  <div className="space-y-6 flex-grow">
                      {stats.qualityFunnel.map((item, idx) => {
                          const maxVal = stats.totalConcluidos || 1;
                          const percent = (item.value / maxVal) * 100;
                          const isRework = item.label === 'PROCESSAMENTO COM RETRABALHO';
                          return (
                            <div 
                              key={idx} 
                              className={`space-y-2 group transition-all ${isRework ? 'cursor-pointer p-2 -m-2 rounded-xl hover:bg-gray-50' : ''}`}
                              onClick={isRework ? () => onFilterAction('recurrence', 'RETRABALHO') : undefined}
                              title={isRework ? "Ver cases com retrabalho" : ""}
                            >
                                <div className="flex justify-between items-end">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black uppercase text-gray-600 leading-none mb-1">{item.step}</span>
                                        <span className="text-[15px] font-bold text-[#111827] uppercase tracking-tight flex items-center gap-2">
                                          {item.label}
                                          {isRework && <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-amber-500" />}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[28px] font-bold block leading-none text-[#111827] mb-1">{item.value}</span>
                                        <span className="text-[11px] font-black text-gray-600">{percent.toFixed(1)}%</span>
                                    </div>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-1000 ${item.color}`} 
                                      style={{ width: `${Math.max(2, percent)}%` }} 
                                    />
                                </div>
                            </div>
                          );
                      })}
                  </div>
               </section>
           </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #003DA5; }
        
        .custom-scrollbar-h::-webkit-scrollbar { height: 8px; }
        .custom-scrollbar-h::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; }
        .custom-scrollbar-h::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar-h::-webkit-scrollbar-thumb:hover { background: #003DA5; }

        @keyframes glow {
          0%, 100% { filter: drop-shadow(0 0 5px rgba(234, 179, 8, 0.4)); transform: scale(1); }
          50% { filter: drop-shadow(0 0 20px rgba(234, 179, 8, 0.8)); transform: scale(1.05); }
        }
        .animate-glow { animation: glow 3s ease-in-out infinite; }
        
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes bounce-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .animate-bounce-slow { animation: bounce-slow 3s ease-in-out infinite; }
        .scale-102:hover { transform: scale(1.02); }
      `}</style>
    </div>
  );
};

export default Dashboard;
