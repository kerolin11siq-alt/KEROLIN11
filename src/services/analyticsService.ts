import { TicketRecord, MuralPost, AnalyticalInsight, WeeklyRankingItem, AutomaticAlert, MuralTreatment, MuralAISuggestion, MuralPostCriticality } from '../../types';
import { startOfDay, subDays, isSameDay, parseISO, isAfter, addDays, differenceInDays } from 'date-fns';
import { aiManager, AIPriority } from './aiManager';

// Dicionário de Assuntos (Mapeamento de equivalência)
const SUBJECT_PATTERNS = [
  { pattern: ['ST PR', 'ALIQUOTA'], category: 'ST PR - DIFERENÇA ALÍQUOTA' },
  { pattern: ['ST PR'], category: 'ST PR - SUBSTITUIÇÃO TRIBUTÁRIA' },
  { pattern: ['ST RS'], category: 'ST RS - SUBSTITUIÇÃO TRIBUTÁRIA' },
  { pattern: ['ST SC'], category: 'ST SC - SUBSTITUIÇÃO TRIBUTÁRIA' },
  { pattern: ['DIFERIMENTO'], category: 'DIFERIMENTO' },
  { pattern: ['NCM', 'INVALIDO'], category: 'NCM INVÁLIDO - RETORNO' },
  { pattern: ['NCM'], category: 'CORREÇÃO NCM' },
  { pattern: ['IPI', 'CALCULO'], category: 'REGRA DE CÁLCULO IPI' },
  { pattern: ['IPI'], category: 'IPI' },
  { pattern: ['PAUTA'], category: 'PAUTA' },
  { pattern: ['ISENCAO'], category: 'ISENÇÃO / DESONERAÇÃO' },
  { pattern: ['DESONERACAO'], category: 'ISENÇÃO / DESONERAÇÃO' },
  { pattern: ['ICMS', 'ALIQUOTA'], category: 'ALÍQUOTA ICMS' },
  { pattern: ['ICMS', 'DIFAL'], category: 'DIFAL - DIFERENCIAL DE ALÍQUOTA' },
  { pattern: ['CONFLITO', 'REGRA'], category: 'CONFLITO DE REGRAS' },
  { pattern: ['SISTEMA', 'PORTAL'], category: 'SISTEMA PORTAL' },
  { pattern: ['PMPF'], category: 'PMPF - PREÇO MÉDIO PONDERADO' },
  { pattern: ['BENEFICIO', 'FISCAL'], category: 'BENEFÍCIO FISCAL' },
  { pattern: ['CEST'], category: 'CEST - CÓDIGO ESPECIFICADOR' },
  { pattern: ['PIS', 'COFINS'], category: 'PIS / COFINS' },
  { pattern: ['RETENCAO'], category: 'RETENÇÃO NA FONTE' },
];

export const normalizarTexto = (texto: string): string => {
  if (!texto) return "";
  
  return texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^\w\s]/gi, ' ') // Remove pontuação
    .replace(/\s+/g, ' ') // Remove espaços duplicados
    .trim();
};

/**
 * Calcula a similaridade entre duas strings (0 a 1)
 * Baseado em sobreposição de palavras (Word Overlap)
 */
export const calcularSimilaridade = (s1: string, s2: string): number => {
  const n1 = normalizarTexto(s1);
  const n2 = normalizarTexto(s2);
  
  if (!n1 || !n2) return 0;
  if (n1 === n2) return 1;

  const words1 = new Set(n1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(n2.split(' ').filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  
  // Jaccard Index: interseção / união
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
};

export const gerarCategoria = (descricao: string): string => {
  const normalizado = normalizarTexto(descricao);
  
  for (const item of SUBJECT_PATTERNS) {
    if (item.pattern.every(p => normalizado.includes(p))) {
      return item.category;
    }
  }
  
  return normalizado || "OUTROS";
};

/**
 * ETAPA 1, 4 e 5 — BASE UNIFICADA E PROCESSAMENTO
 * Transforma registros brutos na base_analitica processada
 */
export const processarBaseAnalitica = (records: TicketRecord[]): TicketRecord[] => {
  // Filtra registros sem data de abertura válida ou sem ID de case
  const validRecords = records.filter(r => {
    if (!r.caseId || !r.openingDate) return false;
    const date = new Date(r.openingDate);
    return !isNaN(date.getTime());
  });

  // Ordena por data de abertura para detecção correta de reincidência
  const sorted = [...validRecords].sort((a, b) => 
    new Date(a.openingDate).getTime() - new Date(b.openingDate).getTime()
  );

  const processed: TicketRecord[] = [];
  const seenCategories = new Set<string>();

  sorted.forEach(record => {
    const category = record.normalizedCategory || gerarCategoria(record.description || record.subject || "");
    const isSubjectRecurrent = seenCategories.has(category);
    const isFormalRecurrent = !!(record.previousCaseId && String(record.previousCaseId).trim() && !['N/A', 'NA', '-', '0'].includes(String(record.previousCaseId).toUpperCase().trim()));
    
    if (category !== "OUTROS" && category !== "") {
      seenCategories.add(category);
    }

    processed.push({
      ...record,
      normalizedCategory: category,
      isRecurrent: isSubjectRecurrent, // Recorrência de assunto
      isFormalRecurrent: isFormalRecurrent, // Reincidência formal
      criticalityScore: record.criticalityScore || 2
    });
  });

  // Retorna na ordem original (geralmente decrescente por data para a UI) ou mantém a ordem de processamento
  return processed.reverse(); 
};

export interface ThemeTrend {
  category: string;
  currentCount: number;
  prevCount: number;
  variation: number;
  trend: 'up' | 'down' | 'stable';
}

/**
 * Calcula a tendência por tema comparando dois períodos
 */
export const calculateThemeTrends = (currentRecords: TicketRecord[], prevRecords: TicketRecord[]): ThemeTrend[] => {
  const currentCounts: Record<string, number> = {};
  currentRecords.forEach(r => {
    const cat = r.normalizedCategory || 'OUTROS';
    currentCounts[cat] = (currentCounts[cat] || 0) + 1;
  });

  const prevCounts: Record<string, number> = {};
  prevRecords.forEach(r => {
    const cat = r.normalizedCategory || 'OUTROS';
    prevCounts[cat] = (prevCounts[cat] || 0) + 1;
  });

  const allCategories = new Set([...Object.keys(currentCounts), ...Object.keys(prevCounts)]);
  
  return Array.from(allCategories).map(category => {
    const current = currentCounts[category] || 0;
    const prev = prevCounts[category] || 0;
    
    let variation = 0;
    let trend: 'up' | 'down' | 'stable' = 'stable';
    
    if (prev === 0 && current > 0) {
      variation = 100;
      trend = 'up';
    } else if (prev > 0) {
      variation = Math.round(((current - prev) / prev) * 100);
      if (variation > 5) trend = 'up';
      else if (variation < -5) trend = 'down';
    } else if (current === 0 && prev === 0) {
      trend = 'stable';
    }
    
    return {
      category,
      currentCount: current,
      prevCount: prev,
      variation,
      trend
    };
  }).sort((a, b) => b.currentCount - a.currentCount);
};

/**
 * Busca a tendência de um tema específico
 */
export const getThemeTrend = (theme: string, currentRecords: TicketRecord[], prevRecords: TicketRecord[]): ThemeTrend | null => {
  const trends = calculateThemeTrends(currentRecords, prevRecords);
  const normalizedSearch = normalizarTexto(theme);
  
  // Tenta encontrar por match exato ou parcial
  return trends.find(t => 
    normalizarTexto(t.category) === normalizedSearch || 
    normalizedSearch.includes(normalizarTexto(t.category)) ||
    normalizarTexto(t.category).includes(normalizedSearch)
  ) || null;
};

export const calculateDailyInsights = (baseAnalitica: TicketRecord[], muralPosts: MuralPost[]): AnalyticalInsight[] => {
  const today = startOfDay(new Date());
  
  const todayRecords = baseAnalitica.filter(r => {
    try {
      return isSameDay(parseISO(r.openingDate), today);
    } catch (e) { return false; }
  });
  
  if (todayRecords.length === 0) {
    return [
      { label: 'Assunto com maior volume hoje', value: 'Nenhum', icon: null },
      { label: 'Ocorrências hoje', value: '0', icon: null },
      { label: 'Alertas ativos', value: '0', icon: null }
    ];
  }

  // Agrupar por categoria_normalizada
  const categoryCounts: Record<string, number> = {};
  todayRecords.forEach(r => {
    const cat = r.normalizedCategory || 'OUTROS';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  const topSubject = sortedCategories[0]?.[0] || 'Nenhum';
  const topCount = sortedCategories[0]?.[1] || 0;

  const alerts = calculateAutomaticAlerts(baseAnalitica, muralPosts);

  return [
    { label: 'Assunto com maior volume hoje', value: `${topSubject} (${topCount})`, icon: null },
    { label: 'Ocorrências hoje', value: todayRecords.length.toString(), icon: null },
    { label: 'Alertas ativos', value: alerts.length.toString(), icon: null }
  ];
};

/**
 * Calcula o Ranking de Assuntos
 * Agrupa por categoria_normalizada e calcula métricas de volume e reincidência
 */
export const calculateRanking = (records: TicketRecord[]): WeeklyRankingItem[] => {
  const groups: Record<string, { occurrences: number, recurrences: number, totalCriticality: number }> = {};

  records.forEach(r => {
    const cat = r.normalizedCategory || 'OUTROS';
    if (!groups[cat]) {
      groups[cat] = { occurrences: 0, recurrences: 0, totalCriticality: 0 };
    }
    groups[cat].occurrences++;
    // Agora conta reincidências formais (com case anterior)
    if (r.isFormalRecurrent) groups[cat].recurrences++;
    groups[cat].totalCriticality += (r.criticalityScore || 2);
  });

  return Object.entries(groups).map(([category, data]) => {
    const avgCriticality = data.totalCriticality / data.occurrences;
    // Score prioriza reincidências formais
    const score = data.occurrences + (data.recurrences * 3);
    
    return {
      category,
      occurrences: data.occurrences,
      recurrences: data.recurrences, // Reincidências formais
      avgCriticality,
      score,
      trend: 'stable' as 'up' | 'down' | 'stable'
    };
  }).sort((a, b) => b.occurrences !== a.occurrences ? b.occurrences - a.occurrences : b.score - a.score);
};

/**
 * Mantido para compatibilidade, mas agora usa calculateRanking internamente
 */
export const calculateWeeklyRanking = (baseAnalitica: TicketRecord[]): WeeklyRankingItem[] => {
  const sevenDaysAgo = subDays(new Date(), 7);
  const weeklyRecords = baseAnalitica.filter(r => {
    try {
      const date = parseISO(r.openingDate);
      return isAfter(date, sevenDaysAgo) || isSameDay(date, sevenDaysAgo);
    } catch (e) { return false; }
  });

  return calculateRanking(weeklyRecords);
};

export const calculateAutomaticAlerts = (
  baseAnalitica: TicketRecord[], 
  muralPosts: MuralPost[] = [],
  prevPeriodRecords: TicketRecord[] = [],
  tratativas: MuralTreatment[] = []
): AutomaticAlert[] => {
  const alerts: AutomaticAlert[] = [];
  const now = new Date();
  const nowISO = now.toISOString();

  // 1. AUMENTO DE TEMA (Crescimento Relevante)
  const currentCounts: Record<string, number> = {};
  baseAnalitica.forEach(r => {
    const cat = r.normalizedCategory || 'OUTROS';
    currentCounts[cat] = (currentCounts[cat] || 0) + 1;
  });

  const prevCounts: Record<string, number> = {};
  prevPeriodRecords.forEach(r => {
    const cat = r.normalizedCategory || 'OUTROS';
    prevCounts[cat] = (prevCounts[cat] || 0) + 1;
  });

  Object.entries(currentCounts).forEach(([cat, currentCount]) => {
    const prevCount = prevCounts[cat] || 0;
    if (currentCount >= 3) {
      const growth = prevCount > 0 ? (currentCount - prevCount) / prevCount : 1;
      if (growth >= 0.5) {
        alerts.push({
          id: crypto.randomUUID(),
          type: 'Crescimento relevante' as any,
          title: 'Aumento de tema identificado',
          message: `${cat} apresentou aumento relevante de casos no período`,
          severity: 'critical',
          timestamp: nowISO,
          recommendation: 'Acompanhar aumento e avaliar necessidade de tratativa'
        });
      }
    }
  });

  // 2. FALTA DE RETORNO DA SOVOS (Cases sem atualização por tempo)
  // Como TicketRecord não tem updatedAt, usamos openingDate para casos ABERTOS que estão há muito tempo sem retorno
  const staleOpenCases = baseAnalitica.filter(r => 
    r.status === 'ABERTO' && 
    !r.returnDate && 
    differenceInDays(now, parseISO(r.openingDate)) > 7
  );

  if (staleOpenCases.length > 0) {
    alerts.push({
      id: crypto.randomUUID(),
      type: 'Operacional' as any,
      title: 'Falta de retorno da Sovos',
      message: `Há ${staleOpenCases.length} cases aguardando retorno da Sovos sem atualização há mais de 7 dias`,
      severity: 'critical',
      timestamp: nowISO,
      recommendation: 'Verificar status dos chamados técnicos na Sovos'
    });
  }

  // 3. TRATATIVAS PARADAS (Atrasadas ou Status não atualizado)
  const delayedTreatments = tratativas.filter(t => {
    if (t.status === 'Concluída' || t.status === 'Cancelada') return false;
    
    const isOverdue = t.deadline && new Date(t.deadline) < now;
    const lastUpdateDate = t.atualizado_em || t.criado_em;
    const isStale = lastUpdateDate && differenceInDays(now, parseISO(lastUpdateDate)) > 5;
    
    return isOverdue || isStale;
  });

  if (delayedTreatments.length > 0) {
    alerts.push({
      id: crypto.randomUUID(),
      type: 'Operacional' as any,
      title: 'Tratativas paradas ou em atraso',
      message: `Existem ${delayedTreatments.length} tratativas com prazo vencido ou sem atualização de status`,
      severity: 'critical',
      timestamp: nowISO,
      recommendation: 'Revisar acompanhamentos internos pendentes'
    });
  }

  // 4. AUSÊNCIA DE TRATATIVA (Tema recorrente sem acompanhamento)
  Object.entries(currentCounts).forEach(([cat, count]) => {
    if (count >= 5) {
      const hasActiveTreatment = tratativas.some(t => 
        (t.subject === cat || t.title.includes(cat)) && 
        t.status !== 'Concluída' && t.status !== 'Cancelada'
      );
      
      if (!hasActiveTreatment) {
        alerts.push({
          id: crypto.randomUUID(),
          type: 'Recorrência' as any,
          title: 'Ausência de tratativa identificada',
          message: `Tema recorrente "${cat}" está sem acompanhamento interno vinculado`,
          severity: 'warning',
          timestamp: nowISO,
          recommendation: 'Sugerido abrir tratativa para o tema recorrente'
        });
      }
    }
  });

  // Priorização e limite de 3 alertas
  const priorityMap: Record<string, number> = {
    'Operacional': 1,
    'Crescimento relevante': 2,
    'Recorrência': 3,
    'Reincidência formal': 4
  };

  return alerts
    .sort((a, b) => {
      if (a.severity === 'critical' && b.severity !== 'critical') return -1;
      if (a.severity !== 'critical' && b.severity === 'critical') return 1;
      return (priorityMap[a.type] || 99) - (priorityMap[b.type] || 99);
    })
    .slice(0, 3);
};

/**
 * FASE 2 — CADASTRO INTELIGENTE ASSISTIDO
 * Gera sugestões em tempo real baseadas no texto digitado e no histórico
 */
export const getSmartSuggestions = (
  inputText: string, 
  baseAnalitica: TicketRecord[],
  muralPosts: MuralPost[] = []
) => {
  if (!inputText || inputText.length < 5) return null;

  const normalizedInput = normalizarTexto(inputText);
  const sevenDaysAgo = subDays(new Date(), 7);

  // 1. Encontrar casos semelhantes
  const similarities = baseAnalitica.map(record => ({
    record,
    score: Math.max(
      calcularSimilaridade(inputText, record.description || ""),
      record.subject ? calcularSimilaridade(inputText, record.subject) : 0
    )
  })).filter(s => s.score > 0.15)
     .sort((a, b) => b.score - a.score);

  const topSimilar = similarities.slice(0, 5);
  
  if (topSimilar.length === 0) {
    // Tenta sugerir categoria pelos padrões fixos se não houver similaridade forte
    const suggestedCat = gerarCategoria(inputText);
    return {
      suggestedCategory: suggestedCat !== normalizarTexto(inputText) ? suggestedCat : "OUTROS",
      similarCases: [],
      isRecurrent: false,
      occurrenceCount: 0,
      recentOccurrenceCount: 0,
      hasOpenSimilar: false,
      suggestedCriticality: 'Baixa',
      suggestedScenario: '',
      activeAlerts: []
    };
  }

  // 2. Sugestão de Categoria (baseada no caso mais similar ou padrões)
  let suggestedCategory = topSimilar[0].record.normalizedCategory || "OUTROS";
  const patternCat = gerarCategoria(inputText);
  if (patternCat !== normalizarTexto(inputText) && patternCat !== "OUTROS") {
    suggestedCategory = patternCat;
  }

  // 3. Estatísticas da Categoria Sugerida
  const categoryHistory = baseAnalitica.filter(r => r.normalizedCategory === suggestedCategory);
  const occurrenceCount = categoryHistory.length;
  const recentOccurrenceCount = categoryHistory.filter(r => {
    try { return isAfter(parseISO(r.openingDate), sevenDaysAgo); } catch(e) { return false; }
  }).length;
  
  const openSimilarCases = categoryHistory.filter(r => r.status !== 'CONCLUIDO');
  const hasOpenSimilar = openSimilarCases.length > 0;

  // 4. Sugestão de Criticidade
  // Se tem muitas ocorrências recentes ou alertas ativos, sobe a criticidade
  const alerts = calculateAutomaticAlerts(baseAnalitica, muralPosts);
  const relatedAlerts = alerts.filter(a => a.message.includes(suggestedCategory));
  
  let criticality: 'Baixa' | 'Média' | 'Alta' | 'Crítica' = 'Baixa';
  if (recentOccurrenceCount > 5 || relatedAlerts.some(a => a.severity === 'critical')) {
    criticality = 'Crítica';
  } else if (recentOccurrenceCount > 2 || relatedAlerts.length > 0) {
    criticality = 'Alta';
  } else if (occurrenceCount > 5) {
    criticality = 'Média';
  }

  // 5. Sugestão de Cenário
  const scenarioCounts: Record<string, number> = {};
  categoryHistory.forEach(r => {
    if (r.scenarios) {
      scenarioCounts[r.scenarios] = (scenarioCounts[r.scenarios] || 0) + 1;
    }
  });
  const suggestedScenario = Object.entries(scenarioCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  return {
    suggestedCategory,
    similarCases: topSimilar.map(s => ({
      caseId: s.record.caseId,
      category: s.record.normalizedCategory,
      date: s.record.openingDate,
      status: s.record.status,
      user: s.record.user,
      isRecurrent: s.record.isRecurrent,
      score: Math.round(s.score * 100)
    })),
    isRecurrent: occurrenceCount > 0,
    occurrenceCount,
    recentOccurrenceCount,
    hasOpenSimilar,
    openSimilarCase: openSimilarCases[0], // Pega o mais recente aberto para alerta de duplicidade
    suggestedCriticality: criticality,
    suggestedScenario,
    activeAlerts: relatedAlerts,
    reincidenceCandidate: topSimilar.find(s => {
      const isHighSimilarity = s.score > 0.6 && s.record.normalizedCategory === suggestedCategory;
      if (!isHighSimilarity) return false;
      
      try {
        const daysDiff = Math.abs(differenceInDays(new Date(), parseISO(s.record.openingDate)));
        return daysDiff <= 180; // 6 meses de proximidade temporal
      } catch (e) {
        return false;
      }
    })?.record || null
  };
};

/**
 * FASE 4 — CLASSIFICAÇÃO INTELIGENTE POR IA
 * Solicita à IA uma sugestão de categoria baseada no contexto semântico
 */
export const getAiClassification = async (
  inputText: string,
  scenarios: string,
  observations: string,
  baseAnalitica: TicketRecord[]
): Promise<{ 
  category: string; 
  confidence: 'Alta' | 'Média' | 'Baixa'; 
  reasoning: string;
  similarExamples: string[];
} | null> => {
  if (!inputText || inputText.length < 10) return null;

  // Extrair categorias únicas existentes para dar contexto à IA
  const existingCategories = Array.from(new Set(
    baseAnalitica
      .map(r => r.normalizedCategory)
      .filter(Boolean)
  )).slice(0, 50); // Limita para não estourar tokens se houver muitas

  const prompt = `
    Você é o Especialista em Classificação Fiscal da SOVOS.
    Sua tarefa é analisar um chamado técnico e sugerir a categoria mais adequada.

    CONTEXTO DO CHAMADO:
    - Descrição/Assunto: ${inputText}
    - Cenários: ${scenarios}
    - Observações: ${observations}

    CATEGORIAS EXISTENTES (PREFIRA ESTAS SE HOUVER FIT):
    ${existingCategories.join(', ')}

    DIRETRIZES:
    1. Analise o padrão semântico (ex: "erro st pr" -> "ST PR - DIFERENÇA ALÍQUOTA").
    2. Se houver uma categoria existente que se encaixe perfeitamente, use-a.
    3. Se for um assunto novo, sugira um nome padronizado (CURTO e em MAIÚSCULAS).
    4. Defina a confiança baseada na clareza dos termos técnicos encontrados.

    RETORNE APENAS UM JSON:
    {
      "category": "NOME DA CATEGORIA",
      "confidence": "Alta|Média|Baixa",
      "reasoning": "Breve explicação do porquê desta categoria",
      "similarExamples": ["Exemplo 1", "Exemplo 2"]
    }
  `;

  try {
    const result = await aiManager.request('classification', prompt, AIPriority.MEDIUM, { responseMimeType: "application/json" });
    return result;
  } catch (e) {
    console.error("AI Classification failed:", e);
    return null;
  }
};

/**
 * FASE 5 — ENRIQUECIMENTO DO MURAL
 * Calcula dados contextuais para uma postagem do mural
 */
export const getMuralPostEnrichment = (
  post: MuralPost,
  baseAnalitica: TicketRecord[],
  ranking: WeeklyRankingItem[],
  alerts: AutomaticAlert[]
) => {
  const category = post.subject || gerarCategoria(post.description);
  const rankingPos = ranking.findIndex(r => r.category === category) + 1;
  const rankingItem = ranking.find(r => r.category === category);
  const activeAlerts = alerts.filter(a => a.message.includes(category));
  
  return {
    category,
    weeklyOccurrences: rankingItem?.occurrences || 0,
    rankingPosition: rankingPos > 0 ? rankingPos : null,
    activeAlertsCount: activeAlerts.length,
    treatmentStatus: post.treatment?.status || 'Nenhuma'
  };
};

/**
 * FASE 6 — TRATATIVA INTELIGENTE
 * Sugere dados para uma nova tratativa
 */
export const getSmartTreatmentSuggestion = (
  post: MuralPost,
  baseAnalitica: TicketRecord[],
  ranking: WeeklyRankingItem[],
  alerts: AutomaticAlert[],
  muralPosts: MuralPost[] = [],
  tratativas: MuralTreatment[] = [],
  currentUser?: string
): Partial<MuralTreatment> => {
  const category = post.subject || gerarCategoria(post.description);
  const rankingItem = ranking.find(r => r.category === category);
  const activeAlerts = alerts.filter(a => a.message.includes(category));
  
  // 1. Título sugerido
  const title = `Tratativa: ${category}`;

  // 2. Prioridade Automática
  let priority: MuralPostCriticality = 'Informativo';
  const score = (rankingItem?.score || 0) + (activeAlerts.length * 5);
  
  if (post.criticality === 'Crítico' || score > 20 || activeAlerts.some(a => a.severity === 'critical')) {
    priority = 'Crítico';
  } else if (post.criticality === 'Ação necessária' || score > 10 || activeAlerts.length > 0) {
    priority = 'Ação necessária';
  } else if (score > 5) {
    priority = 'Atenção';
  }

  // 3. Prazo Sugerido
  let deadline = '';
  const today = new Date();
  if (priority === 'Crítico') deadline = addDays(today, 1).toISOString();
  else if (priority === 'Ação necessária') deadline = addDays(today, 2).toISOString();
  else if (priority === 'Atenção') deadline = addDays(today, 5).toISOString();
  // Informativo -> livre (vazio)

  // 4. Responsável Sugerido
  const suggestedResponsible = suggestResponsible(category, baseAnalitica, muralPosts, tratativas, currentUser);

  return {
    title,
    priority,
    deadline,
    responsible: suggestedResponsible,
    status: 'Aberta'
  };
};

/**
 * FASE 6 — PAINEL OPERACIONAL
 * Consolida métricas de tratativas e carga
 */
export const calculateOperationalDashboard = (
  tratativas: MuralTreatment[],
  baseAnalitica: TicketRecord[],
  muralPosts: MuralPost[] = []
) => {
  const today = new Date();

  const criticalOpen = tratativas.filter(t => t.priority === 'Crítico' && t.status !== 'Concluída');
  const delayed = tratativas.filter(t => {
    if (!t.deadline || t.status === 'Concluída') return false;
    return new Date(t.deadline) < today;
  });

  const unassignedCount = tratativas.filter(t => (!t.responsible || t.responsible === 'Não atribuído') && t.status !== 'Concluída').length;

  const responsibleLoad: Record<string, { count: number, critical: number, delayed: number }> = {};
  tratativas.forEach(t => {
    if (t.status !== 'Concluída') {
      const resp = t.responsible || 'Não atribuído';
      if (!responsibleLoad[resp]) {
        responsibleLoad[resp] = { count: 0, critical: 0, delayed: 0 };
      }
      responsibleLoad[resp].count++;
      if (t.priority === 'Crítico') responsibleLoad[resp].critical++;
      if (t.deadline && new Date(t.deadline) < today) responsibleLoad[resp].delayed++;
    }
  });

  // GOVERNANCE SCORE CALCULATION
  let governanceScore = 100;
  let treatmentCoverage = 100;
  let mandatoryPending = 0;

  if (muralPosts.length > 0) {
    // 1. Mandatory Treatment Adherence (40%)
    const postsNeedingTreatment = muralPosts.filter(p => 
      p.criticality === 'Crítico' || 
      p.criticality === 'Ação necessária' || 
      p.description.toLowerCase().includes('recorrência') || 
      p.description.toLowerCase().includes('reabertura')
    );
    const postsWithTreatment = postsNeedingTreatment.filter(p => 
      tratativas.some(t => t.mural_post_id === p.id)
    );
    treatmentCoverage = postsNeedingTreatment.length > 0 
      ? (postsWithTreatment.length / postsNeedingTreatment.length) * 100 
      : 100;
    
    mandatoryPending = postsNeedingTreatment.filter(p => !tratativas.some(t => t.mural_post_id === p.id)).length;

    // 2. Writing Pattern Adherence (30%)
    const postsWithPattern = muralPosts.filter(p => 
      p.description.includes('Problema:') && 
      p.description.includes('Impacto:') && 
      p.description.includes('Status:')
    );
    const patternAdherence = (postsWithPattern.length / muralPosts.length) * 100;

    // 3. Mention Response Rate (30%)
    const mentionedPosts = muralPosts.filter(p => p.mentions.length > 0);
    const respondedMentions = mentionedPosts.filter(p => p.comments.length > 0);
    const mentionResponseRate = mentionedPosts.length > 0 
      ? (respondedMentions.length / mentionedPosts.length) * 100 
      : 100;

    governanceScore = Math.round(
      (treatmentCoverage * 0.4) + 
      (patternAdherence * 0.3) + 
      (mentionResponseRate * 0.3)
    );
  }

  // Reincidência por assunto (baseado nas tratativas vinculadas a cases reincidentes)
  const reincidenceBySubject: Record<string, number> = {};
  tratativas.forEach(t => {
    const associatedCase = baseAnalitica.find(r => r.caseId === t.case_numero);
    if (associatedCase && associatedCase.isFormalRecurrent) {
      const subject = t.subject || associatedCase.normalizedCategory || 'OUTROS';
      reincidenceBySubject[subject] = (reincidenceBySubject[subject] || 0) + 1;
    }
  });

  return {
    criticalOpenCount: criticalOpen.length,
    delayedCount: delayed.length,
    unassignedCount,
    responsibleLoad: Object.entries(responsibleLoad)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.count - a.count),
    totalActiveTreatments: tratativas.filter(t => t.status !== 'Concluída').length,
    governanceScore,
    reincidenceBySubject: Object.entries(reincidenceBySubject)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    
    // Novas métricas de governança
    treatmentCoverage, // % de posts críticos com tratativa
    avgResponseTime: 0, // Placeholder
    mandatoryPending
  };
};

/**
 * Sugere o responsável mais adequado baseado no histórico do sistema
 */
export const suggestResponsible = (
  theme: string,
  baseAnalitica: TicketRecord[],
  muralPosts: MuralPost[] = [],
  tratativas: MuralTreatment[] = [],
  currentUser?: string
): string => {
  if (!theme) return currentUser || "";

  const normalizedTheme = normalizarTexto(theme);
  const userScores: Record<string, { total: number, lastAction: Date }> = {};

  const recordAction = (user: string, points: number, dateStr: string) => {
    if (!user || user === 'Sistema' || user === 'Não atribuído') return;
    
    let date: Date;
    try {
      date = dateStr ? new Date(dateStr) : new Date(0);
      if (isNaN(date.getTime())) date = new Date(0);
    } catch (e) {
      date = new Date(0);
    }

    if (!userScores[user]) {
      userScores[user] = { total: 0, lastAction: date };
    }
    userScores[user].total += points;
    if (date > userScores[user].lastAction) {
      userScores[user].lastAction = date;
    }
  };

  // 1. Cases relacionados (1 ponto cada)
  baseAnalitica.forEach(r => {
    const recordTheme = r.normalizedCategory || gerarCategoria(r.description || r.subject || "");
    if (recordTheme === theme || normalizarTexto(r.subject || "").includes(normalizedTheme)) {
      recordAction(r.user, 1, r.openingDate);
    }
  });

  // 2. Tratativas anteriores (3 pontos cada)
  tratativas.forEach(t => {
    const titleMatch = normalizarTexto(t.title).includes(normalizedTheme);
    const subjectMatch = t.subject && normalizarTexto(t.subject) === normalizedTheme;
    if (titleMatch || subjectMatch) {
      recordAction(t.responsible, 3, t.atualizado_em || t.criado_em);
    }
  });

  // 3. Registros no mural (2 pontos cada)
  muralPosts.forEach(p => {
    const postTheme = p.subject || gerarCategoria(p.description);
    if (postTheme === theme || normalizarTexto(p.title + " " + p.description).includes(normalizedTheme)) {
      recordAction(p.userName, 2, p.createdAt);
    }
  });

  const candidates = Object.entries(userScores).sort((a, b) => {
    // Principal: Score Total
    if (b[1].total !== a[1].total) return b[1].total - a[1].total;
    // Empate 1: Mais recente
    if (b[1].lastAction.getTime() !== a[1].lastAction.getTime()) return b[1].lastAction.getTime() - a[1].lastAction.getTime();
    // Empate 2: Usuário atual
    if (currentUser) {
      if (a[0] === currentUser) return -1;
      if (b[0] === currentUser) return 1;
    }
    return 0;
  });

  return candidates[0]?.[0] || currentUser || "";
};

/**
 * FASE 7 — INTELIGÊNCIA DO MURAL
 * Classifica postagens e sugere tratativas
 */
export const calculateMuralAISuggestion = (
  post: MuralPost,
  baseAnalitica: TicketRecord[],
  alerts: AutomaticAlert[],
  allPosts: MuralPost[] = []
): MuralAISuggestion | null => {
  // Se já tem tratativa concluída ou em andamento, não sugere
  if (post.status === 'Em acompanhamento' || (post.treatment && ['Em acompanhamento', 'Em validação interna', 'Concluída'].includes(post.treatment.status))) {
    return null;
  }

  const text = normalizarTexto(`${post.title} ${post.description}`);
  const category = post.subject || gerarCategoria(post.description);
  
  // 1. Critérios de Tempo (Atenção se > 3 dias sem atualização)
  const daysSinceCreation = differenceInDays(new Date(), parseISO(post.createdAt));
  const isStale = daysSinceCreation > 3 && post.status !== 'Encerrado' && post.status !== 'Tratado';

  // 2. Critérios de Recorrência e Alertas
  const categoryHistory = baseAnalitica.filter(r => r.normalizedCategory === category);
  const hasFormalReincidence = categoryHistory.some(r => r.isFormalRecurrent);
  const activeAlerts = alerts.filter(a => a.message.includes(category));
  const isCriticalAlert = activeAlerts.some(a => a.severity === 'critical');
  
  // Contar posts do mesmo tema no mural
  const themePostsCount = allPosts.filter(p => (p.subject === category || gerarCategoria(p.description) === category) && p.id !== post.id).length;

  // 3. Palavras-chave (Governança FSJ)
  const criticalKeywords = ['URGENTE', 'CRITICO', 'BLOQUEIO', 'PRODUCAO', 'PARADO', 'ERRO GRAVE', 'ERRO VOLTOU', 'SEM RETORNO'];
  const actionKeywords = ['REABERTURA', 'NAO RESOLVIDO', 'VOLTOU', 'SEM RETORNO', 'AGUARDANDO', 'PENDENTE', 'RECORRENTE'];
  const infoKeywords = ['RESOLVIDO', 'CONCLUIDO', 'INFORMATIVO', 'CIENTE', 'OK'];

  const hasCriticalKeyword = criticalKeywords.some(k => text.includes(k));
  const hasActionKeyword = actionKeywords.some(k => text.includes(k));
  const hasInfoKeyword = infoKeywords.some(k => text.includes(k));

  // CLASSIFICAÇÃO (Ordem de prioridade: Crítico -> Ação -> Atenção -> Informativo)

  // CRÍTICO / AÇÃO NECESSÁRIA (Sugestão Ativa)
  const shouldSuggestTreatment = 
    hasCriticalKeyword || 
    isCriticalAlert || 
    post.criticality === 'Crítico' ||
    hasActionKeyword || 
    hasFormalReincidence || 
    post.criticality === 'Ação necessária' ||
    themePostsCount > 0 ||
    categoryHistory.length > 1;

  if (shouldSuggestTreatment) {
    const isCritical = hasCriticalKeyword || isCriticalAlert || post.criticality === 'Crítico';
    return {
      type: isCritical ? 'Crítico' : 'Ação necessária',
      message: 'Sugestão: Criar acompanhamento interno devido ao volume de ocorrências ou termos identificados.',
      hasAction: true,
      actionLabel: 'Criar Tratativa'
    };
  }

  // ATENÇÃO
  if (isStale || categoryHistory.length > 5 || post.criticality === 'Atenção') {
    return {
      type: 'Atenção',
      message: 'Pode exigir acompanhamento: Assunto recorrente ou tempo sem atualização.',
      hasAction: false
    };
  }

  // INFORMATIVO
  if (hasInfoKeyword || post.status === 'Tratado' || post.status === 'Encerrado' || post.criticality === 'Informativo') {
    return {
      type: 'Informativo',
      message: 'Postagem informativa.',
      hasAction: false
    };
  }

  return null;
};

/**
 * GERA LISTA DE INSIGHTS AUTOMÁTICOS
 */
export const calculateAutomaticInsights = (
  records: TicketRecord[],
  muralPosts: MuralPost[],
  tratativas: MuralTreatment[] = []
): string[] => {
  const insights: string[] = [];
  
  if (records.length === 0) return ["Sem dados operacionais para análise no período."];

  // 1. Concentração por Tema
  const ranking = calculateRanking(records);
  if (ranking.length > 0) {
    const top = ranking[0];
    const percentage = Math.round((top.occurrences / records.length) * 100);
    if (percentage > 30) {
      insights.push(`Concentração crítica: ${percentage}% dos casos são sobre "${top.category}".`);
    } else {
      insights.push(`Maior volume de casos concentrado no tema "${top.category}".`);
    }
  }

  // 2. Recorrência vs Tratativas
  const problematicThemes = ranking.filter(r => r.recurrences > 2);
  const themeWithoutTreatments = problematicThemes.find(theme => {
    const hasTreatment = tratativas.some(t => t.subject === theme.category && t.status !== 'Concluída' && t.status !== 'Cancelada');
    return !hasTreatment;
  });

  if (themeWithoutTreatments) {
    insights.push(`Tema "${themeWithoutTreatments.category}" apresenta recorrência relevante e baixa cobertura de tratativas.`);
  }

  // 3. Falta de Retorno e Atrasos
  const waitingSovos = records.filter(r => r.status === 'ABERTO' && !r.returnDate).length;
  const delayedTreatments = tratativas.filter(t => {
    if (!t.deadline || t.status === 'Concluída' || t.status === 'Cancelada') return false;
    return new Date(t.deadline) < new Date();
  }).length;

  if (delayedTreatments > 0) {
    insights.push(`Fluxo obstruído: Existem tratativas internas com prazo vencido necessitando revisão.`);
  } else if (waitingSovos > (records.length * 0.4)) {
    insights.push(`Alerta de fila: Elevado volume de casos aguardando retorno técnico da Sovos.`);
  }

  // 4. Concentração por Usuário
  const userCounts: Record<string, number> = {};
  records.forEach(r => {
    const user = r.user || 'Desconhecido';
    userCounts[user] = (userCounts[user] || 0) + 1;
  });
  
  const sortedUsers = Object.entries(userCounts).sort((a, b) => b[1] - a[1]);
  if (sortedUsers.length > 0 && sortedUsers[0][1] > (records.length * 0.5)) {
    insights.push(`Sobrecarga identificada: Mais de 50% dos registros concentrados em ${sortedUsers[0][0]}.`);
  }

  return insights.slice(0, 3);
};

/**
 * GERA INSIGHT EXECUTIVO (RODAPÉ DO PAINEL DE GESTÃO)
 */
export const generateExecutiveInsight = (
  ranking: WeeklyRankingItem[],
  alerts: AutomaticAlert[],
  muralPosts: MuralPost[],
  records: TicketRecord[],
  tratativas: MuralTreatment[] = []
): {
  mainProblem: string;
  trend: string;
  reincidence: string;
  recommendation: string;
} => {
  if (ranking.length === 0) {
    return {
      mainProblem: "Nenhum dado relevante",
      trend: "Estável",
      reincidence: "Baixa",
      recommendation: "Manter monitoramento preventivo"
    };
  }

  const topSubject = ranking[0].category;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  
  // Tratativas críticas e atrasadas
  const criticalTreatments = tratativas.filter(t => t.priority === 'Crítico' && t.status !== 'Concluída');
  const delayedTreatments = tratativas.filter(t => {
    if (!t.deadline || t.status === 'Concluída') return false;
    return new Date(t.deadline) < new Date();
  });

  // Tendência baseada no volume total vs média
  const trend = ranking[0].trend === 'up' ? 'Crescente' : ranking[0].trend === 'down' ? 'Em queda' : 'Estável';
  
  // Reincidência
  const totalRecurrences = ranking.reduce((acc, curr) => acc + curr.recurrences, 0);
  const reincidence = totalRecurrences > 10 ? 'Alta' : totalRecurrences > 5 ? 'Média' : 'Baixa';

  // Recomendação
  let recommendation = "O volume de cases está sob controle. Priorizar a resolução dos temas recorrentes para reduzir o volume futuro.";
  
  const topSubjectRecurrences = ranking[0].recurrences;
  const delayedCount = delayedTreatments.length;
  const criticalCount = criticalTreatments.length;

  if (criticalCount > 0 || delayedCount > 0) {
    recommendation = `O maior foco atual está em ${topSubject}, com ${criticalCount} tratativas críticas e ${delayedCount} atrasadas (aguardando retorno da Sovos). Focar no saneamento operacional imediato.`;
  } else if (topSubjectRecurrences > 3) {
    recommendation = `Atenção à reincidência formal em ${topSubject}. Há necessidade de revisão das regras de negócio para evitar novos registros deste tema.`;
  } else if (criticalAlerts.length > 0) {
    recommendation = `Atenção imediata ao assunto "${topSubject}" devido a alertas críticos de crescimento ou reincidência. Recomenda-se abertura de tratativa.`;
  }

  return {
    mainProblem: topSubject,
    trend,
    reincidence: totalRecurrences > 0 ? `${totalRecurrences} casos` : "Baixa",
    recommendation
  };
};
