
export type TicketStatus = 'ABERTO' | 'DEVOLVIDO' | 'CONCLUIDO';
export type TicketType = 'PRODUÇÃO' | 'PROJETO';
export type SLALevel = 'NO PRAZO' | 'ALERTA' | 'CRÍTICO';

export interface User {
  id: string;
  name: string;
}

export interface TicketRecord {
  id: string;
  caseId: string;
  type: TicketType;
  previousCaseId?: string; // Case anterior
  openingDate: string; // DATA ABERTURA
  returnDate?: string; // DATA RETORNO / DATA DEVOLUÇÃO
  conclusionDate?: string; // DATA CONCLUSÃO DEFINITIVA
  user: string; // ATENDENTE
  externalUser: string; // Usuário (Solicitante)
  subject?: string; // Assunto / Erro relacionado
  description: string; // DESCRIÇÃO ERRO REGRA
  scenarios: string; // CENÁRIOS
  observations: string; // OBS
  status: TicketStatus; // STATUS
  creatorUser: string; // Usuário criador (sessão)
  createdAt: string; // Data de criação do registro
  origin: 'manual' | 'mural' | 'workflow' | 'import'; // Origem do registro
  muralPostId?: string; // ID da postagem de origem se for do mural
  slaStartDate?: string; // Campo auxiliar para cálculo de SLA
  matchReason?: string; // Campo auxiliar para busca inteligente
  normalizedCategory?: string; // Categoria normalizada pelo motor analítico
  isRecurrent?: boolean; // Se é recorrente (por assunto)
  isFormalRecurrent?: boolean; // Se é reincidente formal (tem case anterior)
  criticalityScore?: number; // Score de criticidade (1-4)
}

export interface AnalyticalInsight {
  label: string;
  value: string;
  icon: React.ReactNode;
}

export interface WeeklyRankingItem {
  category: string;
  occurrences: number;
  recurrences: number;
  avgCriticality: number;
  score: number;
  trend: 'up' | 'down' | 'stable';
}

export interface AutomaticAlert {
  id: string;
  type: 'Crescimento relevante' | 'Recorrência' | 'Reincidência formal' | 'Operacional';
  title: string;
  message: string; // Contexto numérico ou operacional
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
  recommendation: string; // Ação sugerida
}

export interface CaseKnowledge {
  caseId: string;
  layers: {
    identity: {
      subject: string;
      uf: string;
      status: string;
    };
    technical: {
      ncm?: string;
      ean?: string;
      cest?: string;
      principle?: string;
      product?: string;
      brand?: string;
    };
    fiscal: {
      theme: string;
      nature: string;
      context?: string;
      analysis?: string;
      legalBase?: string;
    };
    outcome: {
      solution?: string;
      summary?: string;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    };
    reuse: string[];
  };
  keywords: string[];
  lastUpdated: string;
}

export interface KnowledgeBase {
  version: string;
  entries: Record<string, CaseKnowledge>;
  clusters: Record<string, string[]>; // theme -> caseIds[]
  patterns: Record<string, string[]>; // synonym patterns
}

export type ViewType = 'table' | 'dashboard' | 'mural' | 'management' | 'search';

export type MuralPostType = 
  | 'Informativo'
  | 'Atenção'
  | 'Ação necessária'
  | 'Crítico';

export type MuralPostStatus = 
  | 'Aberto'
  | 'Em análise'
  | 'Em acompanhamento'
  | 'Tratado'
  | 'Encerrado';

export type MuralAISuggestionType = 'Informativo' | 'Atenção' | 'Ação necessária' | 'Crítico';

export interface MuralAISuggestion {
  type: MuralAISuggestionType;
  message: string;
  hasAction: boolean;
  actionLabel?: string;
}

export type MuralPostCriticality = 
  | 'Informativo'
  | 'Atenção'
  | 'Ação necessária'
  | 'Crítico';

export type MuralTreatmentStatus = 
  | 'Aberta' 
  | 'Aguardando Sovos' 
  | 'Em acompanhamento' 
  | 'Em validação interna' 
  | 'Concluída' 
  | 'Cancelada';

export interface MuralTreatment {
  id: string;
  mural_post_id?: string;
  case_numero?: string;
  title: string;
  description: string;
  subject?: string;
  responsible: string;
  status: MuralTreatmentStatus;
  priority: MuralPostCriticality;
  deadline: string;
  origin: string;
  usuario_criador: string;
  criado_em: string;
  atualizado_em: string;
  encerrado_em?: string;
  observacoes_internas?: string;
}

export interface MuralComment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface MuralPost {
  id: string;
  userId: string;
  userName: string;
  createdAt: string;
  type: MuralPostType;
  title: string;
  description: string;
  subject: string; // Assunto / Erro relacionado
  criticality: MuralPostCriticality;
  status: MuralPostStatus;
  tags: string[];
  mentions: string[]; // @nome
  caseId?: string; // Número do case vinculado
  isHighlighted?: boolean;
  isPinned?: boolean;
  comments: MuralComment[];
  treatment?: MuralTreatment;
  aiSuggestion?: MuralAISuggestion;
}

export interface MuralNotification {
  id: string;
  userId: string; // User who was mentioned
  authorName: string; // User who mentioned
  postId: string;
  postTitle: string;
  type: 'mention' | 'comment' | 'treatment';
  read: boolean;
  createdAt: string;
}
