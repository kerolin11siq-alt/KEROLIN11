
import React, { useMemo, useState } from 'react';
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
  'DEVOLVIDO': { color: '#ea580c', label: 'DEVOLVIDO' }
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

const normalizeStatusStrict = (status: string | undefined): string | null => {
  if (!status || status === '-' || status.trim() === '') return null;
  const s = status
    .trim()
    .toUpperCase()
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") 
    .replace(/[\n\r\t]/g, "")
    .replace(/\s+/g, " ")
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "");

  if (['ABERTO', 'EM ABERTO'].includes(s)) return 'ABERTO';
  if (['CONCLUIDO', 'FINALIZADO', 'RESOLVIDO', 'CONCLUIDA'].includes(s)) return 'CONCLUÍDO';
  if (['DEVOLVIDO', 'RETORNADO', 'REABERTO'].includes(s)) return 'DEVOLVIDO';
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

const Dashboard: React.FC<DashboardProps> = ({ records, contextRecords, onLocateLineage, onFilterAction }) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('general');
  const [selectedCycleMonth, setSelectedCycleMonth] = useState<string | null>(null);
  const today = useMemo(() => startOfDay(new Date()), []);

  const stats = useMemo(() => {
    try {
      if (!contextRecords || contextRecords.length === 0) return null;
      const isSlaLevelFilterActive = records.length > 0 && records.length < contextRecords.length;

      let totalSlaSum = 0;
      let maxSlaDays = 0;
      let minSlaDays = Infinity;
      let totalOnTime = 0;
      let validRecordsCount = 0;
      
      let openCasesCount = 0;
      let sumBacklogAge = 0;
      let oldestBacklogAge = 0;

      const userMap: Record<string, { total: number, onTime: number, devolved: number, sumSla: number, concluded: number }> = {};
      const errorMap: Record<string, number> = {};
      const errorMonthlyMap: Map<string, Record<string, number>> = new Map();
      const solicitantMap: Record<string, number> = {};
      const monthlyMap: Map<string, { 
        month: string, 
        PRODUÇÃO: number, 
        PROJETO: number, 
        total: number, 
        sumConclusion: number, 
        timestamp: number,
        records: TicketRecord[]
      }> = new Map();
      const statusCounts: Record<string, number> = { 'ABERTO': 0, 'CONCLUÍDO': 0, 'DEVOLVIDO': 0 };
      const typeCounts: Record<string, number> = { 'PRODUÇÃO': 0, 'PROJETO': 0 };
      const devolucaoReasons: Record<string, number> = {};
      const reincidenciaReasons: Record<string, number> = {};
      let totalDevolvidos = 0;
      let sumSlaDevolvidos = 0;
      
      let totalConcluidos = 0;
      let concluidosSemRetrabalho = 0;
      let reprocessadosCount = 0;

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

      records.forEach(r => {
        const caseIdValid = (r.caseId && r.caseId !== '-' && r.caseId.trim() !== '');
        if (!caseIdValid) return;

        const openDateRaw = robustDateParse(r.openingDate);
        const mappedStatus = normalizeStatusStrict(r.status);
        const rawType = (r.type || '').toUpperCase().trim();
        const normalizedType = rawType === 'PROJETO' ? 'PROJETO' : 'PRODUÇÃO';
        const u = (r.user || r.externalUser || 'S/A').toUpperCase().trim();
        const sName = (r.externalUser || 'DESCONHECIDO').toUpperCase().trim();

        // Use normalizedCategory from the record if available, fallback to description
        const errorDesc = r.normalizedCategory || (r.description || 'NÃO INFORMADO').toUpperCase().trim();

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

        solicitantMap[sName] = (solicitantMap[sName] || 0) + 1;

        if (mappedStatus === 'CONCLUÍDO') {
          totalConcluidos++;
          const hasPrev = r.isFormalRecurrent || (r.previousCaseId && String(r.previousCaseId).trim() && !['N/A', 'NA', '-', '0'].includes(String(r.previousCaseId).toUpperCase().trim()));
          if (!hasPrev) concluidosSemRetrabalho++;

          if (openDateRaw) {
            const monthKey = format(openDateRaw, 'yyyy-MM');
            const q = monthlyQuality.get(monthKey) || { total: 0, withoutRework: 0 };
            q.total++;
            if (!hasPrev) q.withoutRework++;
            monthlyQuality.set(monthKey, q);
          }
        }
        if (r.isFormalRecurrent || (r.previousCaseId && String(r.previousCaseId).trim() && !['N/A', 'NA', '-', '0'].includes(String(r.previousCaseId).toUpperCase().trim()))) {
          reprocessadosCount++;
        }

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

          if (!userMap[u]) userMap[u] = { total: 0, onTime: 0, devolved: 0, sumSla: 0, concluded: 0 };
          userMap[u].total++;
          userMap[u].sumSla += conclusionDiff;
          if (conclusionDiff <= 5) userMap[u].onTime++;
          if (mappedStatus === 'DEVOLVIDO') userMap[u].devolved++;
          if (mappedStatus === 'CONCLUÍDO') userMap[u].concluded++;

          // Mapa mensal de erros para tendências - Using normalizedCategory
          const e = r.normalizedCategory || (r.description || 'NÃO INFORMADO').toUpperCase().trim();
          errorMap[e] = (errorMap[e] || 0) + 1;
          if (!errorMonthlyMap.has(e)) errorMonthlyMap.set(e, {});
          const eMonthCounts = errorMonthlyMap.get(e)!;
          eMonthCounts[monthKey] = (eMonthCounts[monthKey] || 0) + 1;
        }

        if (mappedStatus === 'DEVOLVIDO') {
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
          
          // Use normalizedCategory from the first member if available
          const reason = membersSorted[0].normalizedCategory || (membersSorted[0].description || 'NÃO INFORMADO').toUpperCase().trim();
          
          let slaImpact = 0;
          let firstSla = 0;
          data.members.forEach((m, idx) => {
            const od = robustDateParse(m.openingDate);
            const rd = robustDateParse(m.returnDate);
            const diff = od ? Math.abs(differenceInDays(rd ? startOfDay(rd) : today, startOfDay(od))) : 0;
            slaImpact += diff;
            if (idx === 0) firstSla = diff;
          });

          // Check if any member is marked as formal recurrent (has previous case)
          const isRecurrent = data.count > 1 || data.members.some(m => m.isFormalRecurrent);

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
        : (validRecordsCount > 0 ? ((totalOnTime / validRecordsCount) * 100).toFixed(0) : '0');

      let ctxNoPrazo = 0, ctxAlerta = 0, ctxCritico = 0;
      let prevRiskStats = { noPrazo: 0, alerta: 0, critico: 0 };
      
      contextRecords.forEach(r => {
        const openD = robustDateParse(r.openingDate);
        if (!openD) return;
        
        const monthKey = format(openD, 'yyyy-MM');
        const finalDate = robustDateParse(r.returnDate) ? startOfDay(robustDateParse(r.returnDate)!) : today;
        const diff = Math.abs(differenceInDays(finalDate, startOfDay(openD)));
        
        const isCurrent = monthKey === currentMonthKey;
        const isPrev = monthKey === prevMonthKey;

        if (diff <= 5) {
            ctxNoPrazo++;
            if (isPrev) prevRiskStats.noPrazo++;
        } else if (diff <= 9) {
            ctxAlerta++;
            if (isPrev) prevRiskStats.alerta++;
        } else {
            ctxCritico++;
            if (isPrev) prevRiskStats.critico++;
        }
      });

      const currentMonthRiskStats = { noPrazo: 0, alerta: 0, critico: 0 };
      contextRecords.forEach(r => {
          const openD = robustDateParse(r.openingDate);
          if (openD && format(openD, 'yyyy-MM') === currentMonthKey) {
              const finalDate = robustDateParse(r.returnDate) ? startOfDay(robustDateParse(r.returnDate)!) : today;
              const diff = Math.abs(differenceInDays(finalDate, startOfDay(openD)));
              if (diff <= 5) currentMonthRiskStats.noPrazo++;
              else if (diff <= 9) currentMonthRiskStats.alerta++;
              else currentMonthRiskStats.critico++;
          }
      });

      const analystRanking = Object.entries(userMap).map(([name, data]) => ({
        name, count: data.total, total: data.total, onTime: data.onTime, concluido: data.concluded,
        avgSla: data.total > 0 ? (data.sumSla / data.total).toFixed(1) : '0.0',
        efficiency: data.total > 0 ? ((data.concluded / data.total) * 100).toFixed(0) : '0',
        label: `${data.total} (${validRecordsCount > 0 ? ((data.total / validRecordsCount) * 100).toFixed(0) : '0'}%)`
      })).sort((a, b) => b.count - a.count);

      const rftIndex = totalConcluidos > 0 ? ((concluidosSemRetrabalho / totalConcluidos) * 100).toFixed(1) : '100.0';
      const qualityInconsistency = Number(rftIndex) === 100 && (totalDevolvidos > 0 || auditData.length > 0);

      return { 
        total: records.length, validRecordsCount, efficiencyIndex, efficiencyLabel: isSlaLevelFilterActive ? 'Participação' : 'Conformidade',
        ctxNoPrazo, ctxAlerta, ctxCritico,
        ctxNoPrazoPct: contextRecords.length > 0 ? ((ctxNoPrazo / contextRecords.length) * 100).toFixed(0) : '0',
        ctxAlertaPct: contextRecords.length > 0 ? ((ctxAlerta / contextRecords.length) * 100).toFixed(0) : '0',
        ctxCriticoPct: contextRecords.length > 0 ? ((ctxCritico / contextRecords.length) * 100).toFixed(0) : '0',
        avgSla: validRecordsCount > 0 ? (totalSlaSum / validRecordsCount).toFixed(1) : '0.0',
        maxSlaDays, minSlaFinal: minSlaDays === Infinity ? 0 : minSlaDays,
        statusChart: ['ABERTO', 'CONCLUÍDO', 'DEVOLVIDO'].map(name => {
          const count = statusCounts[name] || 0;
          const totalStatus = Object.values(statusCounts).reduce((a,b)=>a+b, 0);
          return { name, value: count, color: STATUS_CONFIG[name]?.color || '#cbd5e1', realPercent: totalStatus > 0 ? ((count / totalStatus) * 100).toFixed(1) : '0.0' };
        }).filter(i => i.value > 0),
        typeChart: [
          { name: 'Produção', value: typeCounts['PRODUÇÃO'], color: FSJ_COLORS.blue },
          { name: 'Projeto', value: typeCounts['PROJETO'], color: FSJ_COLORS.red }
        ].map(i => ({ ...i, realPercent: validRecordsCount > 0 ? ((i.value / validRecordsCount) * 100).toFixed(1) : '0.0' })),
        analystRanking, errorRanking, podiumSolicitants: Object.entries(solicitantMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 3),
        auditData, totalDevolvidos, percentDevolvidos: validRecordsCount > 0 ? ((totalDevolvidos / validRecordsCount) * 100).toFixed(1) : '0.0',
        avgSlaDevolvidos: totalDevolvidos > 0 ? (sumSlaDevolvidos / totalDevolvidos).toFixed(1) : '0.0',
        monthlyEvolutionData, cycleTimeData, cycleSummary,
        periodRef: currentMonthKey ? format(parse(currentMonthKey, 'yyyy-MM', new Date()), 'MMM/yyyy', { locale: ptBR }).toUpperCase() : 'N/A',
        riskTrends: {
            noPrazo: getTrend(currentMonthRiskStats.noPrazo, prevRiskStats.noPrazo),
            alerta: getTrend(currentMonthRiskStats.alerta, prevRiskStats.alerta),
            critico: getTrend(currentMonthRiskStats.critico, prevRiskStats.critico)
        },
        rftIndex,
        rftTrend,
        avgReworkDelay,
        topReworkReason,
        topReworkCount,
        topDevolReason,
        topReincReason,
        rftBase: totalConcluidos,
        concluidosSemRetrabalho,
        reprocessadosCount,
        qualityInconsistency,
        funnel: [
          { step: 'Início', value: validRecordsCount, label: 'DEMANDA TOTAL', color: 'bg-blue-600' },
          { step: 'Em Tratamento', value: statusCounts['ABERTO'], label: 'BACKLOG ATIVO', color: 'bg-blue-400' },
          { step: 'Concluídos', value: totalConcluidos, label: 'ENTREGAS TOTAIS', color: 'bg-emerald-600' },
          { step: 'Devolvidos', value: totalDevolvidos, label: 'REJEIÇÕES TÉCNICAS', color: 'bg-red-600' },
          { step: 'Reprocessados', value: reprocessadosCount, label: 'RETRABALHO OPERACIONAL', color: 'bg-orange-600' },
          { step: 'Finalizados s/ Retrabalho', value: concluidosSemRetrabalho, label: 'QUALIDADE ASSEGURADA', color: 'bg-indigo-600' }
        ]
      };
    } catch (e) {
      console.error("Erro crítico no Dashboard:", e);
      return null;
    }
  }, [records, contextRecords]);

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
              <div className="border-b border-gray-100 pb-4"><h3 className="text-lg font-black text-black uppercase tracking-tight">SLA Geral / Efficiency</h3></div>
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="relative w-40 h-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ value: Number(stats.efficiencyIndex) }, { value: 100 - Number(stats.efficiencyIndex) }]} innerRadius={50} outerRadius={70} startAngle={90} endAngle={450} dataKey="value" stroke="none"><RechartsCell fill={Number(stats.efficiencyIndex) > 85 ? '#059669' : (Number(stats.efficiencyIndex) > 60 ? '#d97706' : '#dc2626')} /><RechartsCell fill="#F1F5F9" /></Pie></PieChart></ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center"><span className="text-3xl font-black text-black leading-none drop-shadow-md">{stats.efficiencyIndex}%</span><span className="text-[10px] font-black text-[#003DA5] uppercase mt-1">{stats.efficiencyLabel}</span></div>
                </div>
                <div className="flex-grow grid grid-cols-1 gap-3 w-full font-black uppercase text-[10px]">
                  <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border-2 border-emerald-200"><span>No Prazo (≤ 5d)</span><span className="text-lg text-black drop-shadow-md">{stats.ctxNoPrazo} <span className="text-[9px] text-emerald-900 font-black">({stats.ctxNoPrazoPct}%)</span></span></div>
                  <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border-2 border-amber-200"><span>Alerta (6-9d)</span><span className="text-lg text-black drop-shadow-md">{stats.ctxAlerta} <span className="text-[9px] text-amber-950 font-black">({stats.ctxAlertaPct}%)</span></span></div>
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl border-2 border-red-200"><span>Crítico (&gt;9d)</span><span className="text-lg text-black drop-shadow-md">{stats.ctxCritico} <span className="text-[9px] text-red-950 font-black">({stats.ctxCriticoPct}%)</span></span></div>
                </div>
              </div>
            </div>
            <div className="bg-[#003DA5] p-8 rounded-[2rem] text-white shadow-xl flex flex-col justify-between relative overflow-hidden group">
              <div className="relative z-10"><ActivityIcon className="w-8 h-8 mb-4 opacity-80 group-hover:scale-110 transition-transform" /><h4 className="text-[10px] font-black uppercase tracking-widest text-blue-100">SLA Médio Geral</h4><p className="text-4xl font-black mt-2 drop-shadow-lg">{stats.avgSla} <span className="text-sm">dias</span></p></div>
              <TrendingUpIcon className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 group-hover:rotate-12 transition-transform" />
            </div>
            <div className="bg-white p-8 rounded-[2rem] shadow-xl border-2 border-white flex flex-col justify-between">
              <div className="space-y-6">
                <div className="flex justify-between border-b pb-4"><div className="flex flex-col"><span className="text-[10px] font-black text-red-900 uppercase">Máximo Espera</span><span className="text-2xl font-black text-black drop-shadow-sm">{stats.maxSlaDays}d</span></div><TimerIcon className="w-6 h-6 text-red-700" /></div>
                <div className="flex justify-between"><div className="flex flex-col"><span className="text-[10px] font-black text-emerald-900 uppercase">Maior Agilidade</span><span className="text-2xl font-black text-black drop-shadow-sm">{stats.minSlaFinal}d</span></div><ZapIcon className="w-6 h-6 text-emerald-700 animate-pulse" /></div>
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

            <section className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-200 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-4"><h3 className="text-xs font-black uppercase tracking-tight text-black flex items-center gap-2"><RotateCcwIcon className="w-4 h-4 text-amber-700" /> Monitor Devolvidos</h3></div>
              <div className="flex-grow flex flex-col items-center justify-center py-4">
                 {stats.totalDevolvidos === 0 ? (
                    <div className="text-center animate-in zoom-in duration-500"><CheckCircle className="w-12 h-12 text-emerald-700 mx-auto mb-2" /><p className="text-xl font-black text-emerald-700">CONFORME</p></div>
                 ) : (
                    <div className="text-center"><span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Taxa Devolução</span><p className="text-6xl font-black text-black italic leading-none drop-shadow-md">{stats.percentDevolvidos}%</p><div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 bg-red-50 text-red-800 rounded-full border border-red-200"><ArrowUpRight className="w-4 h-4" /><span className="text-[10px] font-black uppercase">ALERTA</span></div></div>
                 )}
              </div>
              <div className="mt-6 bg-gray-50 p-4 rounded-2xl flex items-center justify-between border border-gray-200"><span className="text-[9px] font-black text-gray-700 uppercase">Total Devolvidos</span><span className="text-xl font-black text-black drop-shadow-sm">{stats.totalDevolvidos}</span></div>
            </section>
          </div>

          {/* PERFORMANCE E INCIDÊNCIAS DE REGRAS (RESTAURADO) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section className="bg-white p-8 rounded-[2rem] shadow-lg flex flex-col h-[400px]">
              <h3 className="text-[11px] font-black uppercase mb-6 flex items-center gap-3 text-gray-900 border-b pb-4 tracking-widest"><UsersIcon className="w-5 h-5 text-[#003DA5]" /> Performance Analistas</h3>
              <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                <ResponsiveContainer width="100%" height={Math.max(300, stats.analystRanking.length * 40)}>
                  <BarChart data={stats.analystRanking} layout="vertical" margin={{ top: 10, right: 80, left: 10, bottom: 5 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 9, fontWeight: 900, fill: '#1f2937' }} axisLine={false} tickLine={false} />
                    <Bar dataKey="count" fill={FSJ_COLORS.blue} radius={[0, 8, 8, 0]} barSize={20} onClick={(d) => onFilterAction('user', d.name)}><LabelList dataKey="label" position="right" style={{ fontSize: 9, fontWeight: 900, fill: '#003DA5' }} offset={12} /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="bg-white p-8 rounded-[2rem] shadow-lg flex flex-col h-[400px]">
              <h3 className="text-[11px] font-black uppercase mb-6 flex items-center gap-3 text-gray-900 border-b pb-4 tracking-widest"><ShieldAlertIcon className="w-5 h-5 text-[#D91B2A]" /> DESCRIÇÃO DO ASSUNTO / ERRO</h3>
              <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
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
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={100} 
                      tick={{ fontSize: 9, fontWeight: 900, fill: '#1f2937', cursor: 'pointer' }} 
                      axisLine={false} 
                      tickLine={false} 
                    />
                    <Bar 
                      dataKey="count" 
                      fill={FSJ_COLORS.red} 
                      radius={[0, 8, 8, 0]} 
                      barSize={20}
                    >
                      <LabelList dataKey="label" position="right" style={{ fontSize: 9, fontWeight: 900, fill: '#D91B2A' }} offset={12} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* STATUS E TIPO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="bg-white p-8 rounded-[2rem] shadow-lg border border-gray-100">
                <h3 className="text-[11px] font-black uppercase mb-6 tracking-widest text-gray-900">Status Operacional</h3>
                {stats.statusChart.length > 0 ? (
                  <div className="flex items-center gap-8">
                    <div className="w-1/2 h-40"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={stats.statusChart} innerRadius={35} outerRadius={55} dataKey="value" stroke="none">{stats.statusChart.map((e, i) => <RechartsCell key={i} fill={e.color} />)}</Pie><Tooltip content={<CustomTooltip />} /></PieChart></ResponsiveContainer></div>
                    <div className="w-1/2 space-y-1.5">{stats.statusChart.slice(0,3).map((item, idx) => (<div key={idx} className="flex justify-between text-[10px] font-black uppercase"><span>{item.name} — {item.value} ({item.realPercent}%)</span></div>))}</div>
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
                    <div className="w-1/2 space-y-1.5">{stats.typeChart.map((item, idx) => (<div key={idx} className="flex justify-between text-[10px] font-black uppercase"><span>{item.name} — {item.value} ({item.realPercent}%)</span></div>))}</div>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-[10px] font-black uppercase text-gray-400 italic">Sem dados no período</div>
                )}
            </section>
          </div>

          {/* MONITOR DE REINCIDÊNCIA (RETRABALHO) */}
          <section className="bg-white rounded-[2rem] border-4 border-white shadow-2xl overflow-hidden">
            <div className="px-10 py-6 bg-[#003DA5] text-white flex items-center justify-between border-b-[6px] border-[#D91B2A]">
              <div className="flex items-center gap-5"><Link2Icon className="w-8 h-8 text-white" /><div><h3 className="text-xl font-black uppercase tracking-widest leading-none">Monitor de Retrabalho (REINCIDÊNCIA)</h3><p className="text-[10px] font-black text-white/80 mt-2 uppercase tracking-widest italic">Casos processados mais de uma vez</p></div></div>
              <div className="text-right"><p className="text-3xl font-black tracking-tighter leading-none">{stats.auditData.length}</p><p className="text-[10px] font-black uppercase tracking-widest opacity-80">Linhagens</p></div>
            </div>
            <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
              <table className="w-full text-left font-black uppercase text-[10px]">
                <thead className="bg-gray-50 border-b sticky top-0 z-10"><tr><th className="px-10 py-4">Case Raiz</th><th className="px-8 py-4">Solicitante</th><th className="px-8 py-4 text-center">Aberturas</th><th className="px-10 py-4 text-center">Ação</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.auditData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-red-50 transition-colors"><td className="px-10 py-4 text-[#D91B2A] font-black">{row.rootId}</td><td className="px-8 py-4 text-gray-900 truncate max-w-[150px]">{row.firstUser}</td><td className="px-8 py-4 text-center"><span className="px-3 py-1 bg-red-100 text-[#D91B2A] rounded-xl font-black">{row.totalImpact}x</span></td><td className="px-10 py-4 text-center"><button onClick={() => onLocateLineage(row.rootId)} className="px-4 py-2 bg-[#003DA5] text-white rounded-xl text-[9px] hover:bg-[#D91B2A] transition-all shadow-md">LOCALIZAR</button></td></tr>
                  ))}
                  {stats.auditData.length === 0 && (<tr><td colSpan={4} className="px-10 py-20 text-center text-gray-400 italic font-black uppercase">Nenhuma reincidência operativa detectada</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>

          {/* PÓDIUM SOLICITANTES (FIXADO NO FINAL COM ANIMAÇÕES) */}
          <section className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-white overflow-hidden relative mt-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center gap-6 mb-12 relative z-10">
                <div className="bg-yellow-500 p-4 rounded-3xl animate-glow shadow-lg">
                    <TrophyIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                    <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Ranking de Solicitantes (PÓDIO)</h3>
                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mt-1">Volume por Analista FSJ</p>
                </div>
            </div>
            <div className="flex flex-col md:flex-row items-end justify-center gap-6 md:gap-16 max-w-4xl mx-auto py-6">
               {stats.podiumSolicitants[1] && (
                 <div className="w-full md:w-1/4 flex flex-col items-center group mb-6 md:mb-0 animate-in fade-in slide-in-from-left-4 duration-500">
                    <p className="text-[10px] font-black text-gray-900 uppercase mb-4 text-center truncate w-full">{stats.podiumSolicitants[1].name}</p>
                    <div className="w-full h-24 bg-gradient-to-b from-slate-300 to-slate-500 rounded-t-[2rem] flex flex-col items-center justify-center border-t-4 border-slate-400 shadow-xl group-hover:scale-105 transition-transform">
                        <span className="text-white text-3xl font-black">2º</span>
                        <span className="text-[9px] font-black text-slate-900 bg-white/30 px-2 py-0.5 rounded-full mt-2">{stats.podiumSolicitants[1].count} Cases</span>
                    </div>
                 </div>
               )}
               {stats.podiumSolicitants[0] && (
                 <div className="w-full md:w-1/3 flex flex-col items-center group scale-110 md:scale-125 z-20 mb-12 md:mb-0 animate-in zoom-in fade-in duration-1000">
                    <p className="text-[11px] font-black text-gray-900 uppercase mb-6 text-center truncate w-full">{stats.podiumSolicitants[0].name}</p>
                    <div className="w-full h-40 bg-gradient-to-b from-[#003DA5] to-blue-900 rounded-t-[2.5rem] flex flex-col items-center justify-center border-t-4 border-blue-950 shadow-2xl relative group-hover:scale-110 transition-transform">
                       <span className="text-white text-5xl font-black italic">1º</span>
                       <span className="text-[10px] font-black text-white bg-yellow-500 px-4 py-1 rounded-full mt-3 shadow-md">{stats.podiumSolicitants[0].count} Cases</span>
                    </div>
                 </div>
               )}
               {stats.podiumSolicitants[2] && (
                 <div className="w-full md:w-1/4 flex flex-col items-center group animate-in fade-in slide-in-from-right-4 duration-500">
                    <p className="text-[10px] font-black text-gray-900 uppercase mb-4 text-center truncate w-full">{stats.podiumSolicitants[2].name}</p>
                    <div className="w-full h-20 bg-gradient-to-b from-orange-300 to-orange-500 rounded-t-[2rem] flex flex-col items-center justify-center border-t-4 border-orange-400 shadow-xl group-hover:scale-105 transition-transform">
                       <span className="text-white text-2xl font-black">3º</span>
                       <span className="text-[8px] font-black text-orange-950 bg-white/30 px-2 py-0.5 rounded-full mt-2">{stats.podiumSolicitants[2].count} Cases</span>
                    </div>
                 </div>
               )}
            </div>
          </section>

        </div>
      )}

      {/* DASHBOARDS ESPECÍFICOS (ABAS) */}
      {activeTab === 'productivity' && (
        <div className="space-y-8 animate-in slide-in-from-right-10 duration-500">
           {stats.analystRanking.length === 0 ? (
             <div className="bg-white p-20 rounded-[2.5rem] shadow-xl text-center border-4 border-blue-50"><UsersIcon className="w-16 h-16 text-gray-200 mx-auto mb-6" /><h3 className="text-xl font-black uppercase text-gray-400">Sem dados de produtividade</h3></div>
           ) : (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-xl"><h3 className="text-xl font-black uppercase mb-8 flex items-center gap-3 text-[#003DA5] tracking-tight"><Target className="w-6 h-6" /> Produtividade e Agilidade por Analista</h3><div className="overflow-x-auto"><table className="w-full text-left font-black uppercase text-[10px]"><thead className="bg-gray-50 border-b"><tr><th className="px-4 py-3">Analista / Atendente</th><th className="px-4 py-3 text-center">Volume</th><th className="px-4 py-3 text-center">No Prazo</th><th className="px-4 py-3 text-center">Resolvidos</th><th className="px-4 py-3 text-center">Média SLA</th><th className="px-4 py-3 text-right">Aproveitamento</th></tr></thead><tbody className="divide-y divide-gray-100">{stats.analystRanking.map((u, i) => (<tr key={i} className="hover:bg-blue-50 transition-colors"><td className="px-4 py-4 text-gray-900">{u.name}</td><td className="px-4 py-4 text-center">{u.total}</td><td className="px-4 py-4 text-center text-emerald-700">{u.onTime}</td><td className="px-4 py-4 text-center text-[#003DA5]">{u.concluido}</td><td className="px-4 py-4 text-center text-gray-500">{u.avgSla}d</td><td className="px-4 py-4 text-right"><div className="flex items-center justify-end gap-2"><div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#003DA5]" style={{ width: `${u.efficiency}%` }} /></div><span className="text-[#003DA5] min-w-[35px]">{u.efficiency}%</span></div></td></tr>))}</tbody></table></div></div>
                <div className="space-y-6"><div className="bg-[#003DA5] p-10 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden"><h4 className="text-[10px] font-black uppercase mb-4 tracking-[0.2em] text-blue-200">Analista Top Volume</h4><p className="text-2xl font-black italic">{stats.analystRanking[0]?.name || '-'}</p><p className="text-sm font-bold text-blue-100 mt-2">{stats.analystRanking[0]?.total || 0} Processados</p><Target className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10" /></div><div className="bg-emerald-600 p-10 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden"><h4 className="text-[10px] font-black uppercase mb-4 tracking-[0.2em] text-emerald-100">Destaque Agilidade</h4><p className="text-2xl font-black italic">{stats.analystRanking.length > 0 ? stats.analystRanking.slice().sort((a,b)=>Number(a.avgSla)-Number(b.avgSla))[0]?.name : '-'}</p><p className="text-sm font-bold text-emerald-50 mt-2">Recorde de {stats.analystRanking.length > 0 ? stats.analystRanking.slice().sort((a,b)=>Number(a.avgSla)-Number(b.avgSla))[0]?.avgSla : '0.0'} dias</p><ZapIcon className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10" /></div></div>
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
                <div className="flex flex-col gap-1 mt-2">
                  <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#D91B2A]" />
                    Tempo até Conclusão: Data Retorno – Data Abertura
                  </div>
                  <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
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
                      tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }} 
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
                      label={{ 
                        position: 'insideLeft', 
                        value: 'META SLA (≤5d)', 
                        fill: FSJ_COLORS.emerald, 
                        fontSize: 9, 
                        fontWeight: 900 
                      }} 
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
            <div className="mt-12 border-t pt-10">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h4 className="text-xl font-black uppercase tracking-tighter text-gray-900">
                    {selectedCycleMonth ? `Casos Críticos de ${selectedCycleMonth}` : 'Top 5 Casos Críticos do Período'}
                  </h4>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">
                    Ordenado por maior tempo de conclusão
                  </p>
                </div>
                {selectedCycleMonth && (
                  <button 
                    onClick={() => setSelectedCycleMonth(null)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase transition-all"
                  >
                    Limpar Seleção
                  </button>
                )}
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
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div 
                onClick={() => onFilterAction('sla', 'NO PRAZO')}
                className="bg-emerald-600 p-10 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden cursor-pointer group hover:scale-[1.02] transition-all"
              >
                 <div className="flex justify-between items-start relative z-10">
                    <div>
                        <p className="text-[10px] font-black uppercase mb-2 opacity-80 tracking-widest">Conformidade (≤5d)</p>
                        <p className="text-4xl font-black">{stats.ctxNoPrazo} <span className="text-xl font-bold opacity-70">({stats.ctxNoPrazoPct}%)</span></p>
                    </div>
                    <div className="flex flex-col items-end">
                        <TrendIcon trend={stats.riskTrends.noPrazo as "UP" | "DOWN" | "STABLE"} />
                        <span className="text-[9px] font-black uppercase opacity-60 mt-1">Ref: {stats.periodRef}</span>
                    </div>
                 </div>
                 <CheckCircle2 className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 group-hover:scale-110 transition-all" />
              </div>

              <div 
                onClick={() => onFilterAction('sla', 'ALERTA')}
                className="bg-amber-600 p-10 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden cursor-pointer group hover:scale-[1.02] transition-all"
              >
                 <div className="flex justify-between items-start relative z-10">
                    <div>
                        <p className="text-[10px] font-black uppercase mb-2 opacity-80 tracking-widest">Alerta (6-9d)</p>
                        <p className="text-4xl font-black">{stats.ctxAlerta} <span className="text-xl font-bold opacity-70">({stats.ctxAlertaPct}%)</span></p>
                    </div>
                    <div className="flex flex-col items-end">
                        <TrendIcon trend={stats.riskTrends.alerta as "UP" | "DOWN" | "STABLE"} />
                        <span className="text-[9px] font-black uppercase opacity-60 mt-1">Ref: {stats.periodRef}</span>
                    </div>
                 </div>
                 <AlertTriangle className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 group-hover:scale-110 transition-all" />
              </div>

              <div 
                onClick={() => onFilterAction('sla', 'CRÍTICO')}
                className="bg-red-600 p-10 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden cursor-pointer group hover:scale-[1.02] transition-all"
              >
                 <div className="flex justify-between items-start relative z-10">
                    <div>
                        <p className="text-[10px] font-black uppercase mb-2 opacity-80 tracking-widest">Crítico (&gt;9d)</p>
                        <p className="text-4xl font-black">{stats.ctxCritico} <span className="text-xl font-bold opacity-70">({stats.ctxCriticoPct}%)</span></p>
                    </div>
                    <div className="flex flex-col items-end">
                        <TrendIcon trend={stats.riskTrends.critico as "UP" | "DOWN" | "STABLE"} />
                        <span className="text-[9px] font-black uppercase opacity-60 mt-1">Ref: {stats.periodRef}</span>
                    </div>
                 </div>
                 <ShieldAlertIcon className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 group-hover:scale-110 transition-all" />
              </div>
           </div>
        </div>
      )}

      {/* DASHBOARD QUALIDADE - ATUALIZADO */}
      {activeTab === 'quality' && (
        <div className="space-y-10 animate-in slide-in-from-right-10 duration-500">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <section className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center justify-center text-center relative border-4 border-white">
                  <div className="mb-10 w-full">
                      <div className="flex justify-between items-start mb-4">
                          <div className="text-left">
                              <h4 className="text-[14px] font-black uppercase tracking-tight text-gray-900">QUALIDADE DA ENTREGA — SOVOS</h4>
                              <p className="text-[10px] font-black text-gray-400 uppercase mt-1">Baseado nos motivos de devolução e retrabalho</p>
                          </div>
                          <div className="flex flex-col items-end">
                              <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black ${Number(stats.rftIndex) >= 98 ? 'bg-emerald-100 text-emerald-700' : Number(stats.rftIndex) >= 95 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                  <Target className="w-3 h-3" />
                                  {Number(stats.rftIndex) >= 98 ? 'META ATINGIDA' : Number(stats.rftIndex) >= 95 ? 'ALERTA' : 'ABAIXO DA META'} (≥98%)
                              </div>
                              <div className="flex items-center gap-1 mt-2">
                                  <TrendIcon trend={stats.rftTrend as "UP" | "DOWN" | "STABLE"} />
                                  <span className="text-[9px] font-black text-gray-500 uppercase">vs mês anterior</span>
                              </div>
                          </div>
                      </div>
                      <div className="h-px bg-gray-100 w-full mb-6" />
                  </div>

                  <div className="relative w-72 h-72">
                      <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                              <Pie 
                                data={[{ value: Number(stats.rftIndex) }, { value: 100 - Number(stats.rftIndex) }]} 
                                innerRadius={85} 
                                outerRadius={120} 
                                startAngle={90} 
                                endAngle={450} 
                                dataKey="value" 
                                stroke="none"
                              >
                                  <RechartsCell fill={Number(stats.rftIndex) >= 98 ? '#064e3b' : Number(stats.rftIndex) >= 95 ? '#92400e' : '#991b1b'} />
                                  <RechartsCell fill="#f1f5f9" />
                              </Pie>
                          </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-7xl font-black leading-none text-gray-900">{stats.rftIndex}%</span>
                          <span className="text-[10px] font-black text-gray-600 uppercase mt-2 max-w-[220px]">
                              {stats.concluidosSemRetrabalho} de {stats.rftBase} casos resolvidos sem retrabalho
                          </span>
                          <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">Período: {stats.periodRef}</span>
                      </div>
                  </div>

                   <div className="grid grid-cols-2 gap-4 w-full mt-12">
                      <div className="bg-red-800 p-6 rounded-3xl shadow-xl text-left group hover:bg-red-900 transition-colors">
                          <div className="flex items-center gap-2 mb-2">
                              <RotateCcwIcon className="w-4 h-4 text-white" />
                              <span className="text-[10px] font-black text-white uppercase tracking-wider">PRINCIPAL CAUSA DE REINCIDÊNCIA</span>
                          </div>
                          <p className="text-[11px] font-black text-white uppercase line-clamp-2 leading-tight">{stats.topReincReason}</p>
                      </div>
                      <div className="bg-blue-700 p-6 rounded-3xl shadow-xl text-left group hover:bg-blue-800 transition-colors">
                          <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className="w-4 h-4 text-white" />
                              <span className="text-[10px] font-black text-white uppercase tracking-wider">PRINCIPAL CAUSA DE DEVOLUÇÃO</span>
                          </div>
                          <p className="text-[11px] font-black text-white uppercase line-clamp-2 leading-tight">{stats.topDevolReason}</p>
                      </div>
                  </div>

                  {stats.qualityInconsistency && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-pulse flex items-center gap-2 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl text-amber-800">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-[8px] font-black uppercase">Inconsistência Operativa Detectada</span>
                    </div>
                  )}
              </section>

              <section className="bg-[#1e293b] p-12 rounded-[3rem] shadow-2xl text-white relative overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between mb-12">
                      <h3 className="text-2xl font-black uppercase flex items-center gap-4 tracking-tighter">
                        <ClipboardCheck className="w-10 h-10 text-emerald-400" /> Funil de Resolução Completo
                      </h3>
                      <p className="text-[10px] font-black text-white/90 uppercase">Métricas Absolutas</p>
                  </div>
                  <div className="space-y-6 relative z-10 flex-grow">
                      {stats.funnel.map((item, idx) => {
                          const maxVal = stats.validRecordsCount || 1;
                          const percent = (item.value / maxVal) * 100;
                          return (
                            <div key={idx} className="space-y-2 group">
                                <div className="flex justify-between items-end">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black uppercase text-blue-100 leading-none">{item.step}</span>
                                        <span className="text-[8px] font-black text-white/70 uppercase mt-1">{item.label}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-lg font-black block leading-none">{item.value}</span>
                                        <span className="text-[11px] font-black text-white">{percent.toFixed(1)}%</span>
                                    </div>
                                </div>
                                <div className="h-5 bg-white/5 rounded-full overflow-hidden p-1 border border-white/10 group-hover:border-white/20 transition-all">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-1000 ${item.color}`} 
                                      style={{ width: `${Math.max(2, percent)}%` }} 
                                    />
                                </div>
                            </div>
                          );
                      })}
                  </div>
                  <Target className="absolute -right-12 -bottom-12 w-80 h-80 opacity-[0.03] text-white" />
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
