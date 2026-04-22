
import { TicketRecord, CaseKnowledge, KnowledgeBase } from "../../types";
import { aiManager } from "./aiManager";

export const normalizeText = (text: string) => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

export const learnFromCase = async (record: TicketRecord): Promise<CaseKnowledge | null> => {
  // Only learn from resolved/concluded cases as per requirement
  // status = resolvido, status = concluído
  // cases sem solução clara não devem gerar conhecimento
  const isResolved = record.status === 'CONCLUIDO';
  const hasContent = record.observations && record.observations.trim().length > 30;
  
  if (!isResolved || !hasContent) {
    return null;
  }

  try {
    const knowledge = await aiManager.requestLearning(record);
    if (!knowledge) return null;

    return {
      ...knowledge,
      lastUpdated: new Date().toISOString()
    };
  } catch (error: any) {
    console.error("Error learning from case:", error);
    return null;
  }
};

export const indexKeywords = async (record: TicketRecord): Promise<string[]> => {
  try {
    const keywords = await aiManager.requestKeywords(record);
    return keywords || [];
  } catch (error) {
    console.error("Error indexing keywords:", error);
    return [];
  }
};

export const updateKnowledgeBaseWithKeywords = (kb: KnowledgeBase, caseId: string, keywords: string[]): KnowledgeBase => {
  const newKb = { ...kb };
  
  if (newKb.entries[caseId]) {
    newKb.entries[caseId].keywords = Array.from(new Set([...newKb.entries[caseId].keywords, ...keywords]));
  } else {
    // Create a placeholder entry for indexing
    newKb.entries[caseId] = {
      caseId,
      layers: {
        identity: { subject: '', uf: '', status: '' },
        technical: {},
        fiscal: { theme: '', nature: '' },
        outcome: { confidence: 'LOW' },
        reuse: []
      },
      keywords,
      lastUpdated: new Date().toISOString()
    };
  }

  return newKb;
};

export const updateKnowledgeBase = (kb: KnowledgeBase, knowledge: CaseKnowledge): KnowledgeBase => {
  const newKb = { ...kb };
  newKb.entries[knowledge.caseId] = knowledge;

  // Update Clusters
  const theme = normalizeText(knowledge.layers.fiscal.theme);
  if (theme) {
    if (!newKb.clusters[theme]) newKb.clusters[theme] = [];
    if (!newKb.clusters[theme].includes(knowledge.caseId)) {
      newKb.clusters[theme].push(knowledge.caseId);
    }
  }

  return newKb;
};
