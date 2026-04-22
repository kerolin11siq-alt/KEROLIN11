
import { TicketRecord, KnowledgeBase, CaseKnowledge, MuralPost, MuralTreatment } from "../../types";
import { suggestResponsible } from "./analyticsService";

export const normalizeText = (text: string) => {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s]/g, ' ') // Remove caracteres especiais, mantém letras e números
    .replace(/\s+/g, ' ') // Remove espaços duplicados
    .trim();
};

export const ufMapping: Record<string, string> = {
  'rs': 'rio grande do sul',
  'pr': 'parana',
  'sc': 'santa catarina',
  'sp': 'sao paulo',
  'rj': 'rio de janeiro',
  'mg': 'minas gerais',
  'es': 'espirito santo',
  'mt': 'mato grosso',
  'ms': 'mato grosso do sul',
  'go': 'goias',
  'df': 'distrito federal',
  'ba': 'bahia',
  'pe': 'pernambuco',
  'ce': 'ceara',
  'rn': 'rio grande do norte',
  'pb': 'paraiba',
  'al': 'alagoas',
  'se': 'sergipe',
  'ma': 'maranhao',
  'pi': 'piaui',
  'am': 'amazonas',
  'pa': 'para',
  'ro': 'rondonia',
  'ac': 'acre',
  'rr': 'roraima',
  'ap': 'amapa',
  'to': 'tocantins'
};

export interface SearchResult {
  record: TicketRecord & { matchReason?: string; knowledge?: CaseKnowledge; layer: number };
  score: number;
  layer: number;
}

export interface SmartSearchResult {
  record: TicketRecord;
  score: number;
  matchType: string;
  highlights: string[];
}

export interface GroupedSearchResult {
  subject: string;
  count: number;
  results: SmartSearchResult[];
}

export interface RecommendedAction {
  type: 'ABRIR_TRATATIVA' | 'ACOMPANHAR_TRATATIVA' | 'ATENCAO_GERENCIAL' | 'NENHUMA';
  message: string;
  priority: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA' | 'N/A';
  details?: string;
}

export interface IntelligentResponse {
  answer: string;
  intent: 'historico' | 'reincidencia' | 'status' | 'geral';
  theme: string;
  context: string[];
  evidence: {
    caseCount: number;
    muralCount: number;
    tratativaCount: number;
    recorrenciaCount: number;
    reincidenciaFormalCount: number;
    predominantStatus: string;
    hasReabertura: boolean;
    hasFaltaRetorno: boolean;
  };
  recommendation: RecommendedAction;
  patternSummary?: string;
  suggestedResponsible?: string;
}

export interface SmartSearchResponse {
  intelligentResponse: IntelligentResponse;
  groupedResults: GroupedSearchResult[];
}

const analyzeQuery = (query: string) => {
  const normalized = normalizeText(query);
  
  let intent: IntelligentResponse['intent'] = 'geral';
  if (normalized.includes('historico') || normalized.includes('quais') || normalized.includes('buscar')) intent = 'historico';
  if (normalized.includes('reincidencia') || normalized.includes('recorrencia') || normalized.includes('ja aconteceu') || normalized.includes('repetiu') || normalized.includes('recorrente')) intent = 'reincidencia';
  if (normalized.includes('status') || normalized.includes('como esta') || normalized.includes('andamento') || normalized.includes('andamentos')) intent = 'status';

  const contexts: string[] = [];
  if (normalized.includes('voltou') || normalized.includes('novamente') || normalized.includes('recorrente')) contexts.push('Erro recorrente');
  if (normalized.includes('sem retorno') || normalized.includes('parado') || normalized.includes('atrasado')) contexts.push('Aguardando retorno');
  if (normalized.includes('reaberto') || normalized.includes('reabertura')) contexts.push('Reabertura de caso');

  // Simple theme extraction (first few words after intent keywords or just first words)
  const words = normalized.split(' ').filter(w => w.length > 3);
  const theme = words.slice(0, 3).join(' ');

  return { intent, theme, contexts };
};

export const simplifiedSearch = (
  query: string,
  records: TicketRecord[]
): SmartSearchResult[] => {
  const normalizedQuery = normalizeText(query);
  const queryTerms = normalizedQuery.split(' ').filter(t => t.length > 1);
  const results: SmartSearchResult[] = [];

  records.forEach(record => {
    let score = 0;
    const highlights: string[] = [];
    
    const subject = normalizeText(record.subject || '');
    const description = normalizeText(record.description || '');
    const category = normalizeText(record.normalizedCategory || '');
    const observations = normalizeText(record.observations || '');
    
    queryTerms.forEach(term => {
      if (subject.includes(term)) { score += 40; if (!highlights.includes('Assunto')) highlights.push('Assunto'); }
      if (description.includes(term)) { score += 20; if (!highlights.includes('Descrição')) highlights.push('Descrição'); }
      if (category.includes(term)) { score += 30; if (!highlights.includes('Categoria')) highlights.push('Categoria'); }
      if (observations.includes(term)) { score += 10; if (!highlights.includes('Observações')) highlights.push('Observações'); }
    });

    if (score > 0) {
      results.push({
        record,
        score,
        matchType: highlights.join(', '),
        highlights
      });
    }
  });

  return results.sort((a, b) => b.score - a.score).slice(0, 10);
};

export const smartSearch = (
  query: string,
  records: TicketRecord[],
  muralPosts: MuralPost[],
  tratativas: MuralTreatment[],
  knowledgeBase: KnowledgeBase
): SmartSearchResponse | null => {
  if (!query || query.trim().length < 2) return null;

  const { intent, theme, contexts } = analyzeQuery(query);
  const normalizedQuery = normalizeText(query);
  
  // Tratamento de variações (Stemming simples para termos comuns)
  const queryTerms = normalizedQuery.split(' ').filter(t => t.length > 1).map(t => {
    if (t.startsWith('diferi')) return 'diferi'; // diferimento, diferido
    if (t.startsWith('aliquot')) return 'aliquot'; // aliquota, aliquotas
    if (t.startsWith('medicament')) return 'medicament'; // medicamento, medicamentos
    return t;
  });
  
  const results: SmartSearchResult[] = [];
  let muralMatches = 0;
  let tratativaMatches = 0;
  let recorrenciaCount = 0;
  let reincidenciaFormalCount = 0;

  records.forEach(record => {
    let score = 0;
    const highlights: string[] = [];
    
    const subject = normalizeText(record.subject || '');
    const description = normalizeText(record.description || '');
    const scenarios = normalizeText(record.scenarios || '');
    const observations = normalizeText(record.observations || '');
    const category = normalizeText(record.normalizedCategory || '');
    
    queryTerms.forEach(term => {
      if (subject.includes(term)) { score += 40; if (!highlights.includes('Assunto')) highlights.push('Assunto'); }
      if (scenarios.includes(term)) { score += 40; if (!highlights.includes('Erro Regra')) highlights.push('Erro Regra'); }
      if (description.includes(term)) { score += 20; if (!highlights.includes('Descrição')) highlights.push('Descrição'); }
      if (observations.includes(term)) { score += 10; if (!highlights.includes('Observações')) highlights.push('Observações'); }
      if (category.includes(term)) { score += 30; if (!highlights.includes('Categoria')) highlights.push('Categoria'); }
    });

    const linkedPosts = muralPosts.filter(p => p.caseId === record.caseId);
    linkedPosts.forEach(post => {
      const postText = normalizeText(post.title + ' ' + post.description);
      queryTerms.forEach(term => {
        if (postText.includes(term)) {
          score += 10;
          if (!highlights.includes('Mural')) {
            highlights.push('Mural');
            muralMatches++;
          }
        }
      });
    });

    const linkedTratativas = tratativas.filter(t => t.case_numero === record.caseId);
    linkedTratativas.forEach(t => {
      const tText = normalizeText(t.title + ' ' + t.description + ' ' + (t.observacoes_internas || ''));
      queryTerms.forEach(term => {
        if (tText.includes(term)) {
          score += 10;
          if (!highlights.includes('Tratativa')) {
            highlights.push('Tratativa');
            tratativaMatches++;
          }
        }
      });
    });

    if (score > 0) {
      if (record.isRecurrent) recorrenciaCount++;
      if (record.isFormalRecurrent || record.previousCaseId) reincidenciaFormalCount++;

      results.push({
        record,
        score,
        matchType: highlights.join(', '),
        highlights
      });
    }
  });

  if (results.length === 0) return {
    intelligentResponse: {
      answer: "Não encontrei registros suficientemente próximos para afirmar com segurança.",
      intent,
      theme,
      context: contexts,
      evidence: { caseCount: 0, muralCount: 0, tratativaCount: 0, recorrenciaCount: 0, reincidenciaFormalCount: 0, predominantStatus: 'N/A', hasReabertura: false, hasFaltaRetorno: false },
      recommendation: {
        type: 'NENHUMA',
        message: "Não há evidências suficientes para sugerir uma ação com segurança.",
        priority: 'N/A'
      },
      patternSummary: "",
      suggestedResponsible: ""
    },
    groupedResults: []
  };

  // Ordenar por score e data (recentes primeiro)
  const sortedResults = results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.record.openingDate).getTime() - new Date(a.record.openingDate).getTime();
  });

  // Agrupar por Assunto
  const groups: Record<string, SmartSearchResult[]> = {};
  sortedResults.forEach(res => {
    const groupKey = (res.record.subject || 'OUTROS').toUpperCase();
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(res);
  });

  const groupedResults = Object.entries(groups).map(([subject, results]) => ({
    subject,
    count: results.length,
    results
  })).sort((a, b) => b.count - a.count);

  // Calculate predominant status
  const statusCounts: Record<string, number> = {};
  results.forEach(r => {
    statusCounts[r.record.status] = (statusCounts[r.record.status] || 0) + 1;
  });
  const predominantStatus = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  // Generate Answer
  let answer = "";
  const open = results.filter(r => r.record.status === 'ABERTO').length;
  const concluded = results.filter(r => r.record.status === 'CONCLUIDO').length;

  if (intent === 'reincidencia') {
    if (recorrenciaCount > 0 || reincidenciaFormalCount > 0) {
      answer = `Sim, identifiquei um padrão de recorrência para "${theme}". `;
      answer += `Foram localizados ${recorrenciaCount} registros similares e ${reincidenciaFormalCount} reincidências formais no histórico.`;
    } else {
      answer = `Não identifiquei registros históricos de reincidência formal para "${theme}" até o momento.`;
    }
  } else if (intent === 'status') {
    answer = `Atualmente, monitoramos ${open} cases em aberto e ${concluded} concluídos sobre "${theme}". `;
    answer += open > 0 ? "A maior parte exige atenção imediata." : "O fluxo operacional parece estabilizado.";
  } else {
    answer = `Encontrei ${results.length} registros relacionados a "${theme}". `;
    if (reincidenciaFormalCount > 0) {
      answer += `Note que ${reincidenciaFormalCount} destes são reincidências formais, o que indica um tema sensível.`;
    } else {
      answer += "O volume de dados permite uma análise de padrões sólida.";
    }
  }

  // Low confidence check
  if (results.length < 3 && results[0]?.score < 50) {
    answer = "Encontrei poucos registros parecidos, mas não o suficiente para afirmar com segurança.";
  }

  // Adicionar evidências e exemplos relevantes no resumo se necessário, 
  // mas o componente SmartSearch já mostra os cards.
  // Vamos garantir que a resposta direta seja clara.

  const hasReabertura = contexts.includes('Reabertura de caso');
  const hasFaltaRetorno = contexts.includes('Aguardando retorno');

  // Automatic Pattern Recognition (Memória Inteligente Automática)
  let patternSummary = "";
  const count = results.length;
  
  if (count > 0) {
    const level = count > 10 ? "crítica" : count > 5 ? "alta" : count > 2 ? "moderada" : "baixa";
    patternSummary = `Identificada recorrência ${level} deste tema na operação. `;
    
    if (reincidenciaFormalCount > 0) {
      patternSummary += `Há evidência de reincidência formal, sugerindo falha na solução definitiva anterior. `;
    }

    if (hasFaltaRetorno) {
      patternSummary += `O padrão inclui atraso em retornos externos ou falta de tratativa conclusiva. `;
    }

    if (tratativaMatches === 0 && count > 3) {
      patternSummary += `Tema com recorrência relevante e ausência de tratativa estruturada vinculada. `;
    }

    if (hasReabertura) {
      patternSummary += `Detectado histórico de reaberturas, o que indica inconsistência nas tratativas atuais. `;
    }
  }

  // Find Suggested Responsible
  const suggestedResponsible = suggestResponsible(theme, records, muralPosts, tratativas);

  // Generate Recommendation
  let recommendation: RecommendedAction = {
    type: 'NENHUMA',
    message: "Não há evidências suficientes para sugerir uma ação com segurança.",
    priority: 'N/A'
  };

  if (results.length > 0) {
    const isCriticalTheme = theme.toLowerCase().includes('pmpf') || theme.toLowerCase().includes('aliquota') || theme.toLowerCase().includes('st');

    // Determine Priority
    let priority: RecommendedAction['priority'] = 'BAIXA';
    if (recorrenciaCount > 2 || reincidenciaFormalCount > 0 || isCriticalTheme) priority = 'MEDIA';
    if (recorrenciaCount > 5 || reincidenciaFormalCount > 1 || hasFaltaRetorno) priority = 'ALTA';
    if (recorrenciaCount > 10 || reincidenciaFormalCount > 2 || (hasFaltaRetorno && isCriticalTheme)) priority = 'CRITICA';

    // Determine Action Type
    const hasActiveTreatment = tratativas.some(t => 
      (t.case_numero && results.some(r => r.record.caseId === t.case_numero)) && 
      t.status !== 'Concluída' && t.status !== 'Cancelada'
    );

    if (reincidenciaFormalCount > 2 || (hasActiveTreatment && hasFaltaRetorno)) {
      recommendation = {
        type: 'ATENCAO_GERENCIAL',
        message: "Esse tema exige atenção gerencial devido ao nível de reincidência ou atraso de retorno.",
        priority
      };
    } else if (hasActiveTreatment) {
      recommendation = {
        type: 'ACOMPANHAR_TRATATIVA',
        message: "Já existe acompanhamento em andamento. Recomenda-se monitorar a tratativa existente.",
        priority
      };
    } else if (results.length > 1 || hasReabertura || hasFaltaRetorno || muralMatches > 1) {
      recommendation = {
        type: 'ABRIR_TRATATIVA',
        message: "Sugestão: Criar acompanhamento interno devido ao padrão de recorrência ou criticidade identificado.",
        priority
      };
    }
  }

  return {
    intelligentResponse: {
      answer,
      intent,
      theme,
      context: contexts,
      evidence: {
        caseCount: results.length,
        muralCount: muralMatches,
        tratativaCount: tratativaMatches,
        recorrenciaCount,
        reincidenciaFormalCount,
        predominantStatus,
        hasReabertura,
        hasFaltaRetorno
      },
      recommendation,
      patternSummary,
      suggestedResponsible
    },
    groupedResults
  };
};

export const performSearch = (entities: any, base: TicketRecord[], knowledgeBase: KnowledgeBase): SearchResult[] => {
  const resultsWithScores: SearchResult[] = [];
  
  const normalizedEntities = {
    caseId: entities.caseId ? normalizeText(entities.caseId) : null,
    assunto: entities.assunto ? normalizeText(entities.assunto) : null,
    produto: entities.produto ? normalizeText(entities.produto) : null,
    ncm: entities.ncm ? normalizeText(entities.ncm) : null,
    ean: entities.ean ? normalizeText(entities.ean) : null,
    cest: entities.cest ? normalizeText(entities.cest) : null,
    principio: entities.principio_ativo ? normalizeText(entities.principio_ativo) : null,
    uf: entities.uf ? normalizeText(entities.uf) : null,
    contexto_fiscal: entities.contexto_fiscal ? normalizeText(entities.contexto_fiscal) : null,
    keywords: (entities.palavras_chave || []).map((k: string) => normalizeText(k))
  };

  // UF Normalization
  if (normalizedEntities.uf && ufMapping[normalizedEntities.uf.toLowerCase()]) {
    normalizedEntities.uf = ufMapping[normalizedEntities.uf.toLowerCase()];
  }

  base.forEach(record => {
    const desc = normalizeText(record.description || '');
    const obs = normalizeText(record.observations || '');
    const scenarios = normalizeText(record.scenarios || '');
    const caseId = normalizeText(record.caseId || '');
    const category = normalizeText(record.normalizedCategory || '');
    const fullText = `${desc} ${obs} ${scenarios} ${caseId} ${category}`;

    // Check KnowledgeBase for enriched data
    const enriched = knowledgeBase.entries[record.caseId];
    const enrichedText = enriched ? [
      enriched.layers.identity.subject,
      enriched.layers.fiscal.theme,
      enriched.layers.fiscal.nature,
      ...enriched.keywords
    ].map(normalizeText).join(' ') : '';

    const searchContent = `${fullText} ${enrichedText}`;

    let score = 0;
    let layer = 4;
    let matchReasons: string[] = [];

    // NÍVEL 1: Correspondência exata
    if (normalizedEntities.caseId && caseId === normalizedEntities.caseId) { score += 1000; layer = 1; matchReasons.push('Número do Case idêntico'); }
    else if (normalizedEntities.ean && searchContent.includes(normalizedEntities.ean)) { score += 900; layer = 1; matchReasons.push('EAN/GTIN idêntico'); }
    else if (normalizedEntities.ncm && searchContent.includes(normalizedEntities.ncm)) { score += 800; layer = 1; matchReasons.push('NCM idêntico'); }
    else if (normalizedEntities.cest && searchContent.includes(normalizedEntities.cest)) { score += 700; layer = 1; matchReasons.push('CEST idêntico'); }
    else if (normalizedEntities.produto && (desc === normalizedEntities.produto || (enriched && normalizeText(enriched.layers.technical.product || '') === normalizedEntities.produto))) { score += 600; layer = 1; matchReasons.push('Produto idêntico'); }
    else if (normalizedEntities.principio && searchContent.includes(normalizedEntities.principio)) { score += 500; layer = 1; matchReasons.push('Princípio Ativo idêntico'); }

    // NÍVEL 2: Correspondência forte
    if (layer > 1) {
      if (normalizedEntities.ncm && normalizedEntities.uf && searchContent.includes(normalizedEntities.ncm) && searchContent.includes(normalizedEntities.uf)) { score += 400; layer = 2; matchReasons.push('NCM + UF'); }
      else if (normalizedEntities.produto && normalizedEntities.uf && searchContent.includes(normalizedEntities.produto) && searchContent.includes(normalizedEntities.uf)) { score += 350; layer = 2; matchReasons.push('Produto + UF'); }
      else if (normalizedEntities.produto && normalizedEntities.ncm && searchContent.includes(normalizedEntities.produto) && searchContent.includes(normalizedEntities.ncm)) { score += 300; layer = 2; matchReasons.push('Produto + NCM'); }
      else if (normalizedEntities.principio && normalizedEntities.uf && searchContent.includes(normalizedEntities.principio) && searchContent.includes(normalizedEntities.uf)) { score += 250; layer = 2; matchReasons.push('Princípio Ativo + UF'); }
    }

    // NÍVEL 3: Correspondência parcial / semântica
    if (layer > 2) {
      if (normalizedEntities.assunto && searchContent.includes(normalizedEntities.assunto)) { score += 100; layer = 3; matchReasons.push('Assunto semelhante'); }
      else if (normalizedEntities.produto && searchContent.includes(normalizedEntities.produto)) { score += 80; layer = 3; matchReasons.push('Produto semelhante'); }
      
      if (normalizedEntities.contexto_fiscal && searchContent.includes(normalizedEntities.contexto_fiscal)) { score += 80; layer = 3; matchReasons.push('Contexto tributário'); }
      
      // Semantic grouping via KB clusters
      if (normalizedEntities.assunto && knowledgeBase.clusters[normalizedEntities.assunto]?.includes(record.caseId)) {
        score += 150; layer = 3; matchReasons.push('Cluster de tema');
      }
    }

    // Keyword matches
    let keywordMatches = 0;
    let exactKeywordMatches = 0;
    
    const caseKeywords = enriched ? enriched.keywords.map(k => normalizeText(k)) : [];
    
    normalizedEntities.keywords.forEach((k: string) => {
      // Check if it's an exact match with one of the indexed keywords
      if (caseKeywords.includes(k)) {
        exactKeywordMatches++;
      } else if (searchContent.includes(k)) {
        keywordMatches++;
      }
    });

    if (exactKeywordMatches > 0 || keywordMatches > 0) {
      score += (exactKeywordMatches * 50) + (keywordMatches * 15);
      if (layer > 3) layer = 3;
      if (exactKeywordMatches > 0) matchReasons.push(`${exactKeywordMatches} palavras-chave idênticas`);
    }

    if (score > 0) {
      resultsWithScores.push({ 
        record: { ...record, matchReason: matchReasons.join(', '), knowledge: enriched, layer }, 
        score, 
        layer 
      });
    }
  });

  return resultsWithScores;
};

export const prioritizeResults = (resultsWithScores: SearchResult[], targetUf: string | null, entities: any) => {
  const statusPriority: Record<string, number> = {
    'ABERTO': 1,
    'DEVOLVIDO': 2, // Assuming DEVOLVIDO is "em andamento" or similar
    'CONCLUIDO': 3
  };

  const normalizedTargetUf = targetUf ? normalizeText(targetUf) : null;

  return resultsWithScores.sort((a, b) => {
    // 1. Status Priority (ABERTO first)
    const pA = statusPriority[a.record.status] || 99;
    const pB = statusPriority[b.record.status] || 99;
    if (pA !== pB) return pA - pB;

    // 2. UF Priority
    if (normalizedTargetUf) {
      const enrichedA = a.record.knowledge;
      const enrichedB = b.record.knowledge;
      const ufA = normalizeText(enrichedA?.layers.identity.uf || a.record.description || '');
      const ufB = normalizeText(enrichedB?.layers.identity.uf || b.record.description || '');
      const hasUfA = ufA.includes(normalizedTargetUf);
      const hasUfB = ufB.includes(normalizedTargetUf);
      if (hasUfA && !hasUfB) return -1;
      if (!hasUfA && hasUfB) return 1;
    }

    // 3. NCM Priority
    if (entities.ncm) {
      const ncmA = a.record.knowledge?.layers.technical.ncm || '';
      const ncmB = b.record.knowledge?.layers.technical.ncm || '';
      const hasNcmA = ncmA.includes(entities.ncm);
      const hasNcmB = ncmB.includes(entities.ncm);
      if (hasNcmA && !hasNcmB) return -1;
      if (!hasNcmA && hasNcmB) return 1;
    }

    // 4. EAN Priority
    if (entities.ean) {
      const eanA = a.record.knowledge?.layers.technical.ean || '';
      const eanB = b.record.knowledge?.layers.technical.ean || '';
      const hasEanA = eanA.includes(entities.ean);
      const hasEanB = eanB.includes(entities.ean);
      if (hasEanA && !hasEanB) return -1;
      if (!hasEanA && hasEanB) return 1;
    }

    // 5. Produto Priority
    if (entities.produto) {
      const prodA = normalizeText(a.record.knowledge?.layers.technical.product || a.record.description || '');
      const prodB = normalizeText(b.record.knowledge?.layers.technical.product || b.record.description || '');
      const hasProdA = prodA.includes(normalizeText(entities.produto));
      const hasProdB = prodB.includes(normalizeText(entities.produto));
      if (hasProdA && !hasProdB) return -1;
      if (!hasProdA && hasProdB) return 1;
    }

    // 6. Score Priority (Semantic similarity)
    if (a.score !== b.score) return b.score - a.score;

    // 7. Recent Priority
    return new Date(b.record.openingDate).getTime() - new Date(a.record.openingDate).getTime();
  }).map(r => r.record);
};
