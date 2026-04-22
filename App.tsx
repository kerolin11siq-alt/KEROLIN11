
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, Search, Filter, Upload, ShieldCheck, FilterX, Download, Database, Calendar, Trash2, CalendarDays } from 'lucide-react';
import { TicketRecord, ViewType, KnowledgeBase, MuralPost, MuralPostType, MuralPostStatus, MuralPostCriticality, TicketStatus, TicketType, MuralTreatment, MuralNotification, User } from './types';
import { standardizeName, syncUser, USERS_LIST_KEY } from './src/services/userService';
import Header from './components/Header';
import RecordForm from './components/RecordForm';
import DataTable from './components/DataTable';
import Dashboard from './components/Dashboard';
import ManagementDashboard from './components/ManagementDashboard';
import ImportModal from './components/ImportModal';
import SmartSearch from './components/SmartSearch';
import Mural from './components/Mural/Mural';
import { differenceInDays, parseISO, startOfDay, isAfter, isBefore, isValid, parse, subDays } from 'date-fns';
import { learnFromCase, updateKnowledgeBase, indexKeywords, updateKnowledgeBaseWithKeywords } from './src/services/knowledgeService';
import { semanticCache } from './src/services/semanticCacheService';
import { 
  processarBaseAnalitica, 
  calculateAutomaticAlerts,
  gerarCategoria,
  normalizarTexto
} from './src/services/analyticsService';

const STORAGE_KEY = 'fsj_sovos_cases_v1';
const KB_STORAGE_KEY = 'fsj_sovos_kb_v1';
const MURAL_STORAGE_KEY = 'fsj_sovos_mural_v1';
const TRATATIVAS_STORAGE_KEY = 'fsj_tratativas_v1';
const NOTIFICATIONS_STORAGE_KEY = 'fsj_notifications_v1';
const USER_NAME_KEY = 'fsj_sovos_user_name';

const globalRobustDateParse = (dateStr: string | undefined): Date | null => {
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

const normalizeRecord = (record: TicketRecord): TicketRecord => {
  const statusMap: Record<string, TicketStatus> = {
    'ABERTO': 'ABERTO',
    'DEVOLVIDO': 'DEVOLVIDO',
    'CONCLUIDO': 'CONCLUIDO',
    'RESOLVIDO': 'CONCLUIDO',
    'FECHADO': 'CONCLUIDO',
    'FINALIZADO': 'CONCLUIDO',
    'PENDENTE': 'DEVOLVIDO',
    'AGUARDANDO': 'DEVOLVIDO',
    'RETORNO': 'DEVOLVIDO'
  };

  const typeMap: Record<string, TicketType> = {
    'PRODUÇÃO': 'PRODUÇÃO',
    'PRODUCAO': 'PRODUÇÃO',
    'PROJETO': 'PROJETO',
    'PROJETOS': 'PROJETO'
  };

  const rawStatus = (record.status || 'ABERTO').toUpperCase().trim();
  const rawType = (record.type || 'PRODUÇÃO').toUpperCase().trim();

  // Gera categoria automática se não existir ou se for apenas o texto original
  let normalizedCategory = record.normalizedCategory;
  if (!normalizedCategory || normalizedCategory === normalizarTexto(record.subject || "")) {
    normalizedCategory = gerarCategoria(record.subject || record.description || "");
  }

  return {
    ...record,
    status: statusMap[rawStatus] || 'ABERTO',
    type: typeMap[rawType] || 'PRODUÇÃO',
    description: (record.description || '').trim(),
    subject: (record.subject || '').trim(),
    normalizedCategory,
    user: standardizeName(record.user || ''),
    externalUser: standardizeName(record.externalUser || ''),
    creatorUser: standardizeName(record.creatorUser || ''),
    isFormalRecurrent: !!(record.previousCaseId && String(record.previousCaseId).trim() && !['N/A', 'NA', '-', '0'].includes(String(record.previousCaseId).toUpperCase().trim()))
  };
};

const App: React.FC = () => {
  const [records, setRecords] = useState<TicketRecord[]>([]);
  const [kb, setKb] = useState<KnowledgeBase>({ version: '1.0', entries: {}, clusters: {}, patterns: {} });
  const [muralPosts, setMuralPosts] = useState<MuralPost[]>([]);
  const [tratativas, setTratativas] = useState<MuralTreatment[]>([]);
  const [notifications, setNotifications] = useState<MuralNotification[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userName, setUserName] = useState<string>(standardizeName(localStorage.getItem(USER_NAME_KEY) || ''));

  const syncUsersFromData = useCallback(() => {
    // De records
    records.forEach(r => {
      if (r.user) syncUser(r.user);
      if (r.creatorUser) syncUser(r.creatorUser);
      if (r.externalUser) syncUser(r.externalUser);
    });
    
    // De mural posts
    muralPosts.forEach(p => {
      if (p.userName) syncUser(p.userName);
      p.comments.forEach(c => {
        if (c.userName) syncUser(c.userName);
      });
    });
    
    // De tratativas
    tratativas.forEach(t => {
      if (t.responsible) syncUser(t.responsible);
      if (t.usuario_criador) syncUser(t.usuario_criador);
    });
    
    // De current session
    if (userName) syncUser(userName);
    
    // Atualizar estado local de usuários
    const storedUsers = JSON.parse(localStorage.getItem(USERS_LIST_KEY) || '[]');
    setUsers(storedUsers);
  }, [records, muralPosts, tratativas, userName]);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [dbStatus, setDbStatus] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const isLoaded = React.useRef(false);
  const isKbLoaded = React.useRef(false);
  const isMuralLoaded = React.useRef(false);
  const [activeTab, setActiveTab] = useState<ViewType>('management');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TicketRecord | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [userFilter, setUserFilter] = useState<string>('ALL');
  const [solicitantFilter, setSolicitantFilter] = useState<string>('ALL');
  const [slaLevelFilter, setSlaLevelFilter] = useState<string>('ALL');
  
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [retStartDate, setRetStartDate] = useState<string>('');
  const [retEndDate, setRetEndDate] = useState<string>('');
  
  const [lineageFilter, setLineageFilter] = useState<string | null>(null);

  // ETAPA 5 — BASE UNIFICADA
  const baseAnalitica = useMemo(() => {
    return processarBaseAnalitica(records);
  }, [records]);

  // 2) CARREGAR NA INICIALIZAÇÃO
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const normalized = parsed.map(normalizeRecord);
          setRecords(normalized);
          console.log(`Persistência: carregou ${parsed.length} registros (normalizados)`);
        }
      } else {
        console.log("Persistência: carregou 0 registros");
      }
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
      localStorage.removeItem(STORAGE_KEY);
      setRecords([]);
      console.log("Persistência: erro ao carregar, limpando storage");
    }
    isLoaded.current = true;
    setDbStatus('ONLINE');

    // Carregar KnowledgeBase
    try {
      const rawKb = localStorage.getItem(KB_STORAGE_KEY);
      if (rawKb) {
        const parsedKb = JSON.parse(rawKb);
        setKb(parsedKb);
        
        // Verificar se há cases sem indexação e disparar se necessário
        // (Apenas se records já estiver carregado)
      }
    } catch (e) {
      console.error("Erro ao carregar KB:", e);
    }
    isKbLoaded.current = true;

    // Carregar Mural
    try {
      const rawMural = localStorage.getItem(MURAL_STORAGE_KEY);
      if (rawMural) {
        setMuralPosts(JSON.parse(rawMural));
      }
    } catch (e) {
      console.error("Erro ao carregar mural:", e);
    }
    isMuralLoaded.current = true;

    // Carregar Tratativas
    try {
      const rawTratativas = localStorage.getItem(TRATATIVAS_STORAGE_KEY);
      if (rawTratativas) {
        setTratativas(JSON.parse(rawTratativas));
      }
    } catch (e) {
      console.error("Erro ao carregar tratativas:", e);
    }

    // Carregar Notificações
    try {
      const rawNotifications = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (rawNotifications) {
        setNotifications(JSON.parse(rawNotifications));
      }
    } catch (e) {
      console.error("Erro ao carregar notificações:", e);
    }

    // Carregar Usuários
    try {
      const rawUsers = localStorage.getItem(USERS_LIST_KEY);
      if (rawUsers) {
        setUsers(JSON.parse(rawUsers));
      }
    } catch (e) {
      console.error("Erro ao carregar usuários:", e);
    }

    // Check if username is set
    if (!localStorage.getItem(USER_NAME_KEY)) {
      setIsUserModalOpen(true);
    }
  }, []);

  // Sync users from existing data once loaded
  useEffect(() => {
    if (isLoaded.current && isMuralLoaded.current) {
      syncUsersFromData();
    }
  }, [syncUsersFromData]);

  const isIndexingStarted = useRef(false);

  // Efeito para indexar cases faltantes após carregamento inicial
  useEffect(() => {
    if (isLoaded.current && isKbLoaded.current && records.length > 0 && !isIndexingStarted.current) {
      const missingIndexing = records.filter(r => !kb.entries[r.caseId] || !kb.entries[r.caseId].keywords || kb.entries[r.caseId].keywords.length === 0);
      if (missingIndexing.length > 0) {
        isIndexingStarted.current = true;
        console.log(`[Indexing] Localizados ${missingIndexing.length} cases sem palavras-chave. Iniciando indexação em background...`);
        // O aiManager cuidará do rate limit e agrupamento
        triggerMassIndexing(missingIndexing);
      }
    }
  }, [records.length, isKbLoaded.current, kb]);

  // 3) SALVAR AUTOMATICAMENTE QUANDO records MUDAR
  useEffect(() => {
    if (isLoaded.current) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  }, [records]);

  // Salvar KB
  useEffect(() => {
    if (isKbLoaded.current) {
      localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(kb));
    }
  }, [kb]);

  // Salvar Mural
  useEffect(() => {
    if (isMuralLoaded.current) {
      localStorage.setItem(MURAL_STORAGE_KEY, JSON.stringify(muralPosts));
    }
  }, [muralPosts]);

  // Salvar Tratativas
  useEffect(() => {
    if (isMuralLoaded.current) { // Using mural loaded as proxy or could add isTratativasLoaded
      localStorage.setItem(TRATATIVAS_STORAGE_KEY, JSON.stringify(tratativas));
    }
  }, [tratativas]);

  // Salvar Notificações
  useEffect(() => {
    if (isMuralLoaded.current) {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
    }
  }, [notifications]);

  // Salvar Usuários
  useEffect(() => {
    if (isLoaded.current) {
      localStorage.setItem(USERS_LIST_KEY, JSON.stringify(users));
    }
  }, [users]);

  // Invalidação do Cache Semântico quando a base muda
  useEffect(() => {
    if (isLoaded.current || isKbLoaded.current) {
      // Quando a base de dados ou o conhecimento muda, o cache semântico deve ser invalidado
      // para garantir que as respostas reflitam os dados mais recentes.
      semanticCache.invalidate('total');
      console.log('[Semantic Cache] Base updated, invalidating total cache.');
    }
  }, [records, kb]);

  const triggerLearning = (record: TicketRecord) => {
    // Delegar para o aiManager que gerencia fila, agrupamento e limites
    learnFromCase(record).then(knowledge => {
      if (knowledge) {
        setKb(prev => updateKnowledgeBase(prev, knowledge));
      }
    });

    // Sempre indexar palavras-chave, independente do status
    indexKeywords(record).then(keywords => {
      if (keywords && keywords.length > 0) {
        setKb(prev => updateKnowledgeBaseWithKeywords(prev, record.caseId, keywords));
      }
    });
  };

  const triggerMassIndexing = (recordsToIndex: TicketRecord[]) => {
    // Indexar em lotes para não sobrecarregar
    recordsToIndex.forEach(record => {
      indexKeywords(record).then(keywords => {
        if (keywords && keywords.length > 0) {
          setKb(prev => updateKnowledgeBaseWithKeywords(prev, record.caseId, keywords));
        }
      });
    });
  };

  const uniqueData = useMemo(() => {
    const users = new Set(records.map(r => (r.user || '').toUpperCase().trim()));
    const solicitants = new Set(records.map(r => (r.externalUser || '').toUpperCase().trim()));
    return {
      users: Array.from(users).filter(Boolean).sort(),
      solicitants: Array.from(solicitants).filter(Boolean).sort()
    };
  }, [records]);

  const contextRecords = useMemo(() => {
    return records.filter(r => {
      if (lineageFilter && (r.caseId !== lineageFilter && r.previousCaseId !== lineageFilter)) return false;
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false;
      if (userFilter !== 'ALL' && (r.user || '').toUpperCase().trim() !== userFilter) return false;
      if (solicitantFilter !== 'ALL' && (r.externalUser || '').toUpperCase().trim() !== solicitantFilter) return false;

      const rOpenDate = globalRobustDateParse(r.openingDate);
      if (rOpenDate) {
        const d = startOfDay(rOpenDate);
        if (startDate && isBefore(d, startOfDay(parseISO(startDate)))) return false;
        if (endDate && isAfter(d, startOfDay(parseISO(endDate)))) return false;
      }

      if (retStartDate || retEndDate) {
        const rRetDate = globalRobustDateParse(r.returnDate);
        if (!rRetDate) return false;
        const d = startOfDay(rRetDate);
        if (retStartDate && isBefore(d, startOfDay(parseISO(retStartDate)))) return false;
        if (retEndDate && isAfter(d, startOfDay(parseISO(retEndDate)))) return false;
      }

      const term = searchTerm.toLowerCase().trim();
      if (!term) return true;
      return (
        r.caseId.toLowerCase().includes(term) ||
        (r.subject || '').toLowerCase().includes(term) ||
        (r.normalizedCategory || '').toLowerCase().includes(term) ||
        (r.user || '').toLowerCase().includes(term) ||
        (r.externalUser || '').toLowerCase().includes(term) ||
        (r.description && r.description.toLowerCase().includes(term))
      );
    });
  }, [records, searchTerm, statusFilter, typeFilter, userFilter, solicitantFilter, startDate, endDate, retStartDate, retEndDate, lineageFilter]);

  const filteredRecords = useMemo(() => {
    const today = startOfDay(new Date());
    if (slaLevelFilter === 'ALL') return contextRecords;

    return contextRecords.filter(r => {
      const openD = globalRobustDateParse(r.openingDate);
      if (!openD) return false;
      const retD = globalRobustDateParse(r.returnDate);
      const finalDate = retD ? startOfDay(retD) : today;
      const diff = Math.abs(differenceInDays(finalDate, startOfDay(openD)));
      
      let currentSlaLevel = 'NO PRAZO';
      if (diff > 9) currentSlaLevel = 'CRÍTICO';
      else if (diff > 5) currentSlaLevel = 'ALERTA';

      return currentSlaLevel === slaLevelFilter;
    });
  }, [contextRecords, slaLevelFilter]);

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setTypeFilter('ALL');
    setUserFilter('ALL');
    setSolicitantFilter('ALL');
    setSlaLevelFilter('ALL');
    setStartDate('');
    setEndDate('');
    setRetStartDate('');
    setRetEndDate('');
    setLineageFilter(null);
  };

  const handleClearAllData = () => {
    if (window.confirm("⚠ ATENÇÃO: Deseja apagar TODOS os registros, base de conhecimento, MURAL e configurações? Esta ação é irreversível.")) {
      // Limpa todos os storages conhecidos
      const keysToClear = [
        STORAGE_KEY,
        KB_STORAGE_KEY,
        MURAL_STORAGE_KEY,
        TRATATIVAS_STORAGE_KEY,
        NOTIFICATIONS_STORAGE_KEY,
        USERS_LIST_KEY,
        'semantic_cache_v1' // Por precaução se houver persistência futura
      ];

      keysToClear.forEach(key => localStorage.removeItem(key));
      
      // Limpa cache em memória
      semanticCache.invalidate('total');
      
      // Reseta estados
      setRecords([]); 
      setKb({ version: '1.0', entries: {}, clusters: {}, patterns: {} });
      setMuralPosts([]);
      setTratativas([]);
      setNotifications([]);
      setUsers([]);
      
      resetFilters();
      
      // Feedback visual
      alert("Base de dados limpa com sucesso!");
      
      // Opcional: Recarregar a página para garantir estado limpo total
      window.location.reload();
    }
  };

  const handleSaveUserName = (name: string) => {
    const standardName = standardizeName(name);
    if (standardName) {
      setUserName(standardName);
      localStorage.setItem(USER_NAME_KEY, standardName);
      syncUser(standardName);
      setIsUserModalOpen(false);
    }
  };

  const handleAddMuralPost = (postData: Omit<MuralPost, 'id' | 'createdAt' | 'comments'>) => {
    let finalCriticality = postData.criticality;
    const textToAnalyze = (postData.title + ' ' + postData.description).toLowerCase();

    // Automatic Classification Logic (Governança FSJ)
    if (textToAnalyze.includes('crítico') || textToAnalyze.includes('critico') || textToAnalyze.includes('bloqueio') || textToAnalyze.includes('parado') || textToAnalyze.includes('erro grave') || textToAnalyze.includes('erro voltou') || textToAnalyze.includes('sem retorno')) {
      finalCriticality = 'Crítico';
    } else if (textToAnalyze.includes('ação') || textToAnalyze.includes('acao') || textToAnalyze.includes('precisa') || textToAnalyze.includes('fazer') || textToAnalyze.includes('pendente') || textToAnalyze.includes('reabertura') || textToAnalyze.includes('voltou') || textToAnalyze.includes('recorrente')) {
      finalCriticality = 'Ação necessária';
    } else if (textToAnalyze.includes('atenção') || textToAnalyze.includes('atencao') || textToAnalyze.includes('cuidado') || textToAnalyze.includes('monitorar') || textToAnalyze.includes('alerta')) {
      finalCriticality = 'Atenção';
    }

    const newPost: MuralPost = {
      ...postData,
      userName: standardizeName(postData.userName),
      criticality: finalCriticality,
      type: finalCriticality as MuralPostType,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      comments: []
    };
    setMuralPosts(prev => [newPost, ...prev]);
    syncUser(newPost.userName);

    // Create notifications for mentions
    if (newPost.mentions && newPost.mentions.length > 0) {
      const newNotifications: MuralNotification[] = newPost.mentions.map(mention => ({
        id: crypto.randomUUID(),
        userId: mention,
        authorName: newPost.userName,
        postId: newPost.id,
        postTitle: newPost.title,
        type: 'mention',
        read: false,
        createdAt: new Date().toISOString()
      }));
      setNotifications(prev => [...newNotifications, ...prev]);
    }
  };

  const handleUpdateMuralPost = (updatedPost: MuralPost) => {
    const standardizedPost = {
      ...updatedPost,
      userName: standardizeName(updatedPost.userName),
      comments: updatedPost.comments.map(c => ({
        ...c,
        userName: standardizeName(c.userName)
      }))
    };
    setMuralPosts(prev => prev.map(p => p.id === standardizedPost.id ? standardizedPost : p));
    syncUser(standardizedPost.userName);
    standardizedPost.comments.forEach(c => syncUser(c.userName));
  };

  const handleDeleteMuralPost = (postId: string) => {
    if (window.confirm('Deseja realmente excluir esta postagem?')) {
      setMuralPosts(prev => prev.filter(p => p.id !== postId));
    }
  };

  const handleCreateCaseFromPost = (post: MuralPost) => {
    setEditingRecord({
      description: `[ORIGEM MURAL] ${post.title}\n\n${post.description}`,
      subject: post.subject,
      origin: 'mural',
      muralPostId: post.id,
      caseId: post.caseId || ''
    } as TicketRecord);
    setIsFormOpen(true);
  };

  const handleLocateLineage = (caseId: string) => {
    resetFilters();
    setLineageFilter(caseId);
    setActiveTab('table');
  };

  const handleAddTreatment = (treatment: MuralTreatment) => {
    const standardizedTreatment = {
      ...treatment,
      responsible: standardizeName(treatment.responsible),
      usuario_criador: standardizeName(treatment.usuario_criador)
    };
    setTratativas(prev => [standardizedTreatment, ...prev]);
    syncUser(standardizedTreatment.responsible);
    syncUser(standardizedTreatment.usuario_criador);
  };

  const handleUpdateTreatment = (updatedTreatment: MuralTreatment) => {
    const standardizedTreatment = {
      ...updatedTreatment,
      responsible: standardizeName(updatedTreatment.responsible),
      usuario_criador: standardizeName(updatedTreatment.usuario_criador)
    };
    setTratativas(prev => prev.map(t => t.id === standardizedTreatment.id ? standardizedTreatment : t));
    syncUser(standardizedTreatment.responsible);
    syncUser(standardizedTreatment.usuario_criador);
  };

  const handleDeleteTreatment = (treatmentId: string) => {
    if (window.confirm('Deseja realmente excluir esta tratativa?')) {
      setTratativas(prev => prev.filter(t => t.id !== treatmentId));
    }
  };

  const handleDashboardFilter = (key: string, value: string) => {
    resetFilters();
    if (key === 'status') setStatusFilter(value);
    if (key === 'type') setTypeFilter(value);
    if (key === 'user') setUserFilter(value.toUpperCase());
    if (key === 'error') setSearchTerm(value);
    if (key === 'sla') setSlaLevelFilter(value);
    setActiveTab('table');
  };

  const handleViewSubject = (subject: string) => {
    resetFilters();
    setSearchTerm(subject);
    setActiveTab('table');
  };

  const handleViewTreatment = (treatment: MuralTreatment) => {
    setActiveTab('mural');
    setSearchTerm(treatment.title); // Use search to find it in mural
  };

  const handleNotificationClick = (notification: MuralNotification) => {
    setActiveTab('mural');
    setSearchTerm(notification.postTitle);
    setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n));
  };

  const handleClearNotifications = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return alert('Sem dados.');
    const headers = ['CASE ID', 'TIPO', 'CASE ANTE', 'DATA ABERTURA', 'DATA RETORNO', 'ANALISTA SOVOS', 'FSJ SOLICITANTE', 'STATUS', 'DESCRICAO'];
    const rows = filteredRecords.map(r => [r.caseId, r.type, r.previousCaseId || '', r.openingDate, r.returnDate || '', r.user, r.externalUser, r.status, `"${(r.description || '').replace(/"/g, '""')}"`]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `FSJ_Export_${Date.now()}.csv`;
    link.click();
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `BACKUP_FSJ_${Date.now()}.json`;
    link.click();
  };

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'ALL' || typeFilter !== 'ALL' || userFilter !== 'ALL' || solicitantFilter !== 'ALL' || slaLevelFilter !== 'ALL' || startDate !== '' || endDate !== '' || retStartDate !== '' || retEndDate !== '' || lineageFilter !== null;

  const automaticAlerts = useMemo(() => {
    // Pegar registros dos últimos 7 dias para comparação
    const baseAnalitica = processarBaseAnalitica(records);
    const sevenDaysAgo = subDays(new Date(), 7);
    const fourteenDaysAgo = subDays(new Date(), 14);
    
    const currentPeriod = baseAnalitica.filter(r => isAfter(parseISO(r.openingDate), sevenDaysAgo));
    const prevPeriod = baseAnalitica.filter(r => isAfter(parseISO(r.openingDate), fourteenDaysAgo) && !isAfter(parseISO(r.openingDate), sevenDaysAgo));
    
    return calculateAutomaticAlerts(currentPeriod, muralPosts, prevPeriod, tratativas);
  }, [records, muralPosts, tratativas]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F5F9]">
      <Header 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        dbStatus={dbStatus} 
        userName={userName}
        onEditUser={() => setIsUserModalOpen(true)}
        notifications={notifications}
        onNotificationClick={handleNotificationClick}
        onClearNotifications={handleClearNotifications}
      />

      {/* GLOBAL ALERTS BAR */}
      {automaticAlerts.length > 0 && (
        <div className="bg-white border-b border-gray-200 overflow-hidden shadow-sm">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center gap-6 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 shrink-0 pr-6 border-r border-gray-200">
              <div className="w-2 h-2 rounded-full bg-[#D91B2A] animate-pulse"></div>
              <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Dash Intelligence FSJ</span>
            </div>
            {automaticAlerts.map(alert => (
              <div key={alert.id} className="flex items-center gap-4 shrink-0 group hover:translate-x-1 transition-transform">
                <div className={`w-2 h-2 rounded-full ${alert.severity === 'critical' ? 'bg-[#D91B2A]' : 'bg-amber-500'}`}></div>
                <div className="flex flex-col">
                  <p className="text-[10px] font-black text-[#003DA5] uppercase leading-none mb-1 group-hover:underline cursor-pointer">{alert.title}</p>
                  <p className="text-[9px] font-bold text-gray-500 leading-none">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <main className="flex-grow p-4 md:p-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 mb-6">
          <div className="relative flex-grow">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 w-5 h-5" />
            <input
              type="text"
              placeholder="Pesquisa rápida por Case, Analista ou Texto..."
              className="w-full pl-12 pr-4 py-4 border-2 border-gray-500 bg-white rounded-3xl shadow-xl shadow-blue-900/5 focus:border-[#003DA5] outline-none transition-all font-bold text-sm text-gray-900 placeholder-gray-600"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <button onClick={() => setIsImportModalOpen(true)} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-4 bg-white border border-gray-200 text-[#003DA5] text-[10px] font-black uppercase tracking-widest rounded-3xl shadow-lg hover:bg-gray-50 transition-all">
              <Upload className="w-4 h-4" /> Importar
            </button>
            <button onClick={handleExportCSV} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black uppercase tracking-widest rounded-3xl shadow-lg hover:bg-emerald-100 transition-all">
              <Download className="w-4 h-4" /> CSV/Excel
            </button>
            <button onClick={() => { setEditingRecord(null); setIsFormOpen(true); }} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-[#D91B2A] text-white text-[10px] font-black uppercase tracking-widest rounded-3xl shadow-xl hover:bg-red-700 transition-all">
              <Plus className="w-4 h-4" /> Novo Registro
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-blue-50 mb-8 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-[#003DA5]">
              <Filter className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Painel de Filtros Avançados</span>
            </div>
            <div className="flex items-center gap-4">
               <div className="text-right">
                  <p className="text-[8px] font-black text-gray-800 uppercase leading-none mb-1">Resultados</p>
                  <p className="text-sm font-black text-[#003DA5] leading-none">{filteredRecords.length}</p>
               </div>
               {hasActiveFilters && (
                <button onClick={resetFilters} title="Limpar Filtros" className="p-2.5 bg-red-50 text-[#D91B2A] rounded-xl hover:bg-red-100 transition-all">
                  <FilterX className="w-4 h-4" />
                </button>
               )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <div className="space-y-1">
              <label className="text-[8px] font-black text-gray-950 uppercase ml-2">Status Operacional</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-500 rounded-xl text-[10px] font-black uppercase text-gray-900 outline-none focus:border-blue-700 transition-all">
                <option value="ALL">TODOS STATUS</option>
                <option value="ABERTO">ABERTOS</option>
                <option value="DEVOLVIDO">DEVOLVIDOS</option>
                <option value="CONCLUIDO">RESOLVIDOS</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-gray-950 uppercase ml-2">Nível de SLA</label>
              <select value={slaLevelFilter} onChange={(e) => setSlaLevelFilter(e.target.value)} className={`w-full px-4 py-2.5 border-2 rounded-xl text-[10px] font-black uppercase outline-none transition-all ${slaLevelFilter === 'CRÍTICO' ? 'bg-red-50 border-red-700 text-red-900' : slaLevelFilter === 'ALERTA' ? 'bg-amber-50 border-amber-700 text-amber-900' : 'bg-gray-50 border-gray-500 text-gray-900'}`}>
                <option value="ALL">TODOS NÍVEIS</option>
                <option value="NO PRAZO">NO PRAZO (Até 5d)</option>
                <option value="ALERTA">ALERTA (6 a 9d)</option>
                <option value="CRÍTICO">CRÍTICO (&gt;9d)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-gray-950 uppercase ml-2">Analista Sovos</label>
              <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-500 rounded-xl text-[10px] font-black uppercase text-gray-900 outline-none focus:border-blue-700 transition-all">
                <option value="ALL">TODOS ANALISTAS</option>
                {uniqueData.users.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-gray-950 uppercase ml-2">FSJ (Solicitante)</label>
              <select value={solicitantFilter} onChange={(e) => setSolicitantFilter(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-500 rounded-xl text-[10px] font-black uppercase text-gray-900 outline-none focus:border-blue-700 transition-all">
                <option value="ALL">TODOS FSJ</option>
                {uniqueData.solicitants.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-gray-950 uppercase ml-2">Tipo de Demanda</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-500 rounded-xl text-[10px] font-black uppercase text-gray-900 outline-none focus:border-blue-700 transition-all">
                <option value="ALL">TODOS TIPOS</option>
                <option value="PRODUÇÃO">PRODUÇÃO</option>
                <option value="PROJETO">PROJETO</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
             <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <Calendar className={`w-3.5 h-3.5 ${(startDate || endDate) ? 'text-[#D91B2A]' : 'text-[#003DA5]'}`} />
                    <span className="text-[8px] font-black text-gray-950 uppercase">Período de Abertura:</span>
                </div>
                <div className="flex items-center gap-2">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-1.5 bg-gray-50 border-2 border-gray-500 rounded-lg text-[9px] font-bold text-gray-900 outline-none focus:border-blue-700" />
                    <span className="text-gray-900 text-[9px] font-black">até</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-1.5 bg-gray-50 border-2 border-gray-500 rounded-lg text-[9px] font-bold text-gray-900 outline-none focus:border-blue-700" />
                </div>
             </div>
             
             <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <CalendarDays className={`w-3.5 h-3.5 ${(retStartDate || retEndDate) ? 'text-[#D91B2A]' : 'text-amber-700'}`} />
                    <span className="text-[8px] font-black text-gray-950 uppercase">Período de Retorno:</span>
                </div>
                <div className="flex items-center gap-2">
                    <input type="date" value={retStartDate} onChange={(e) => setRetStartDate(e.target.value)} className="px-3 py-1.5 bg-amber-50 border-2 border-amber-600 rounded-lg text-[9px] font-bold text-gray-900 outline-none focus:border-amber-700" />
                    <span className="text-gray-900 text-[9px] font-black">até</span>
                    <input type="date" value={retEndDate} onChange={(e) => setRetEndDate(e.target.value)} className="px-3 py-1.5 bg-amber-50 border-2 border-amber-600 rounded-lg text-[9px] font-bold text-gray-900 outline-none focus:border-amber-700" />
                </div>
             </div>
          </div>
        </div>

        {activeTab === 'mural' ? (
          <Mural 
            posts={muralPosts}
            onAddPost={handleAddMuralPost}
            onUpdatePost={handleUpdateMuralPost}
            onDeletePost={handleDeleteMuralPost}
            onOpenCase={handleLocateLineage}
            onCreateCaseFromPost={handleCreateCaseFromPost}
            records={baseAnalitica}
            userName={userName}
            users={users}
            searchTerm={searchTerm}
            tratativas={tratativas}
            onAddTreatment={handleAddTreatment}
            onUpdateTreatment={handleUpdateTreatment}
            onDeleteTreatment={handleDeleteTreatment}
          />
        ) : activeTab === 'search' ? (
          <SmartSearch 
            records={baseAnalitica}
            muralPosts={muralPosts}
            tratativas={tratativas}
            kb={kb}
            onOpenCase={handleLocateLineage}
            onAddTreatment={handleAddTreatment}
            userName={userName}
          />
        ) : activeTab === 'table' ? (
          <DataTable 
            records={filteredRecords} 
            onDelete={(id) => setRecords(prev => prev.filter(r => r.id !== id))} 
            onEdit={(r) => { setEditingRecord(r); setIsFormOpen(true); }} 
            onOpenCase={handleLocateLineage}
            onAddTreatment={handleAddTreatment}
            currentUserName={userName}
          />
        ) : activeTab === 'management' ? (
          <ManagementDashboard 
            records={baseAnalitica}
            posts={muralPosts}
            tratativas={tratativas}
            onViewSubject={handleViewSubject}
            onViewTreatment={handleViewTreatment}
            onOpenCase={handleLocateLineage}
            onAddTreatment={handleAddTreatment}
          />
        ) : (
          <Dashboard 
            records={baseAnalitica} 
            contextRecords={contextRecords}
            onLocateLineage={handleLocateLineage} 
            onFilterAction={handleDashboardFilter} 
          />
        )}
      </main>

      {isFormOpen && (
        <RecordForm 
          onSubmit={(data) => {
            const key = String(data.caseId || "").trim();
            if (!key) return;

            const standardizedData = {
              ...data,
              user: standardizeName(data.user || ''),
              creatorUser: standardizeName(data.creatorUser || userName)
            };

            setRecords(prev => {
              const existingIndex = prev.findIndex(r => String(r.caseId || "").trim() === key);
              let updatedRecord: TicketRecord;
              
              syncUser(standardizedData.user);
              syncUser(standardizedData.creatorUser);

              if (existingIndex !== -1) {
                const newRecords = [...prev];
                updatedRecord = normalizeRecord({ ...prev[existingIndex], ...standardizedData, caseId: key });
                newRecords[existingIndex] = updatedRecord;
                triggerLearning(updatedRecord);
                return newRecords;
              } else {
                updatedRecord = normalizeRecord({ 
                  ...standardizedData, 
                  id: crypto.randomUUID(), 
                  caseId: key,
                  creatorUser: standardizedData.creatorUser,
                  createdAt: new Date().toISOString(),
                  origin: data.origin || 'manual'
                } as TicketRecord);
                triggerLearning(updatedRecord);
                return [updatedRecord, ...prev];
              }
            });
            setIsFormOpen(false);
            setEditingRecord(null);
          }} 
          onClose={() => { setIsFormOpen(false); setEditingRecord(null); }}
          initialData={editingRecord || undefined}
          records={baseAnalitica}
          kb={kb}
          users={users}
          defaultUser={userName}
          muralPosts={muralPosts}
        />
      )}

      {isUserModalOpen && (
        <div className="fixed inset-0 bg-[#003DA5]/90 backdrop-blur-xl flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border-[8px] border-white transform animate-in zoom-in-95 duration-300">
            <div className="bg-[#D91B2A] text-white px-8 py-6">
              <h2 className="text-2xl font-black uppercase tracking-tight">Identificação</h2>
              <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Informe seu nome para continuar</p>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-gray-950 uppercase tracking-widest">Nome do Usuário</label>
                <input 
                  autoFocus
                  type="text" 
                  value={userName} 
                  onChange={(e) => setUserName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveUserName(userName)}
                  placeholder="Seu nome completo ou apelido"
                  className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-200 rounded-2xl font-bold text-gray-900 outline-none focus:border-[#003DA5] transition-all"
                />
              </div>
              <button 
                onClick={() => handleSaveUserName(userName)}
                disabled={!userName.trim()}
                className="w-full py-4 bg-[#003DA5] text-white font-black uppercase text-xs rounded-2xl shadow-xl hover:bg-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirmar Identificação
              </button>
            </div>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <ImportModal 
          onImport={(newRecords, report) => { 
            setRecords(prev => {
              const recordsMap = new Map<string, TicketRecord>();
              prev.forEach(r => {
                const key = String(r.caseId || "").trim();
                if (key) recordsMap.set(key, r);
              });
              
              let updatedCount = 0;
              let newCount = 0;

              newRecords.forEach(r => {
                const key = String(r.caseId || "").trim();
                if (!key) return;

                if (r.user) syncUser(r.user);

                let finalRecord: TicketRecord;
                if (recordsMap.has(key)) {
                  const existing = recordsMap.get(key)!;
                  finalRecord = normalizeRecord({ ...existing, ...r, id: existing.id, caseId: key });
                  recordsMap.set(key, finalRecord);
                  updatedCount++;
                } else {
                  finalRecord = normalizeRecord({ ...r, caseId: key });
                  recordsMap.set(key, finalRecord);
                  newCount++;
                }
                triggerLearning(finalRecord);
              });

              const finalRecords = Array.from(recordsMap.values());
              
              setTimeout(() => {
                alert(
                  `RELATÓRIO DE IMPORTAÇÃO:\n\n` +
                  `• Total no arquivo: ${report.total}\n` +
                  `• Novos inseridos: ${newCount}\n` +
                  `• Existentes atualizados: ${updatedCount}\n` +
                  `• Duplicados ignorados (no arquivo): ${report.duplicated}`
                );
              }, 100);

              return finalRecords;
            }); 
            setIsImportModalOpen(false); 
          }} 
          onClose={() => setIsImportModalOpen(false)} 
        />
      )}

      <footer className="bg-white border-t-4 border-[#003DA5] py-10 text-center mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
           <div className="flex items-center gap-3 text-[11px] font-black text-gray-900 uppercase tracking-widest">
              <ShieldCheck className="w-5 h-5 text-[#003DA5]" />
              FSJ Acompanhamento de Cases Sovos &copy; {new Date().getFullYear()}
           </div>
           <div className="flex flex-wrap items-center justify-center gap-8 text-[10px] font-black">
              <span className="flex items-center gap-2 text-[#003DA5] font-black"><div className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> SLA MONITOR ATIVO</span>
              <button onClick={handleExportJSON} className="flex items-center gap-2 text-[#003DA5] hover:text-blue-800 transition-colors uppercase tracking-widest font-black cursor-pointer">
                <Database className="w-4 h-4" /> Backup DB
              </button>
              <button 
                type="button"
                onClick={handleClearAllData} 
                className="flex items-center gap-2 text-[#D91B2A] hover:text-red-800 transition-all cursor-pointer uppercase tracking-widest border-2 border-red-600 px-6 py-3 rounded-2xl bg-red-50 hover:bg-red-100 active:scale-95 shadow-md font-black"
              >
                <Trash2 className="w-4.5 h-4.5" /> Limpar Base Completa
              </button>
           </div>
        </div>
      </footer>

    </div>
  );
};

export default App;
