
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, Search, Filter, Upload, ShieldCheck, FilterX, Download, Database, Calendar, Trash2, CalendarDays, LogIn, LogOut } from 'lucide-react';
import { TicketRecord, ViewType, KnowledgeBase, MuralPost, MuralPostType, MuralPostStatus, MuralPostCriticality, TicketStatus, TicketType, MuralTreatment, MuralNotification, User } from './types';
import { standardizeName, syncUser, USERS_LIST_KEY } from './src/services/userService';
import Header from './components/Header';
import RecordForm from './components/RecordForm';
import DataTable from './components/DataTable';
import Dashboard from './components/Dashboard';
import ManagementDashboard, { NavigationContext } from './components/ManagementDashboard';
import ImportModal from './components/ImportModal';
import SmartSearch from './components/SmartSearch';
import Mural from './components/Mural/Mural';
import { differenceInDays, parseISO, startOfDay, isAfter, isBefore, isValid, parse, subDays, format } from 'date-fns';
import { learnFromCase, updateKnowledgeBase, indexKeywords, updateKnowledgeBaseWithKeywords } from './src/services/knowledgeService';
import { semanticCache } from './src/services/semanticCacheService';
import { 
  processarBaseAnalitica, 
  calculateAutomaticAlerts,
  gerarCategoria,
  normalizarTexto
} from './src/services/analyticsService';

// Firebase imports
import { auth, db, cleanData } from './src/lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInAnonymously,
  GoogleAuthProvider, 
  signOut,
  updateProfile,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  getDoc,
  updateDoc,
  query,
  orderBy,
  runTransaction,
  where,
  deleteDoc
} from 'firebase/firestore';

const STORAGE_KEY = 'fsj_cases';
const KB_STORAGE_KEY = 'fsj_kb';
const MURAL_STORAGE_KEY = 'fsj_mural_posts';
const TRATATIVAS_STORAGE_KEY = 'fsj_tratativas';
const NOTIFICATIONS_STORAGE_KEY = 'fsj_notifications';
const USER_NAME_KEY = 'fsj_user_name';

const OLD_STORAGE_KEYS = {
  cases: 'fsj_sovos_cases_v1',
  kb: 'fsj_sovos_kb_v1',
  mural: 'fsj_sovos_mural_v1',
  tratativas: 'fsj_tratativas_v1',
  notifications: 'fsj_notifications_v1',
  userName: 'fsj_sovos_user_name',
  users: 'fsj_sovos_users_list'
};

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
    'CONCLUIDO': 'CONCLUÍDO',
    'CONCLUÍDO': 'CONCLUÍDO',
    'NÃO INFORMADO': 'NÃO INFORMADO'
  };

  const typeMap: Record<string, TicketType> = {
    'PRODUÇÃO': 'PRODUÇÃO',
    'PRODUCAO': 'PRODUÇÃO',
    'PROJETO': 'PROJETO',
    'PROJETOS': 'PROJETO'
  };

  const cleanStatus = (record.status || '').toUpperCase().trim()
    .replace(/[\u0000-\u001F\u007F-\u009F\uFFFD]/g, "")
    .replace(/\s+/g, ' ');
    
  let rawStatus = cleanStatus || 'NÃO INFORMADO';
  
  // Normalização agressiva para CONCLUÍDO (lidando com encoding quebrado)
  if (rawStatus.includes('CONCLU') && (rawStatus.includes('DO') || rawStatus.includes('IDO'))) {
    rawStatus = 'CONCLUÍDO';
  } else if (rawStatus === 'CONCLUIDO') {
    rawStatus = 'CONCLUÍDO';
  }
  const rawType = (record.type || 'PRODUÇÃO').toUpperCase().trim();

  // Gera categoria automática se não existir ou se for apenas o texto original
  let normalizedCategory = record.normalizedCategory;
  if (!normalizedCategory || normalizedCategory === normalizarTexto(record.subject || "")) {
    normalizedCategory = gerarCategoria(record.subject || record.description || "");
  }

  return {
    ...record,
    id: record.id || crypto.randomUUID(),
    createdAt: record.createdAt || new Date().toISOString(),
    status: statusMap[rawStatus] || (rawStatus as TicketStatus),
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
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);

  // 1. Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        const name = standardizeName(user.displayName || user.email || '');
        if (name) {
          setUserName(name);
        } else if (user.isAnonymous) {
          setIsUserModalOpen(true);
        }
        setDbStatus('ONLINE');
      } else {
        setDbStatus('OFFLINE');
      }
    });
    return () => unsubscribe();
  }, []);

  // 1.5. Sync Current User to Firestore for global visibility
  useEffect(() => {
    if (currentUser && userName && userName !== 'Usuário') {
      const userObj: User = {
        id: currentUser.uid,
        name: userName,
        photoURL: currentUser.photoURL || undefined
      };
      setDoc(doc(db, 'users', currentUser.uid), cleanData(userObj), { merge: true })
        .catch(e => console.error("Erro ao sincronizar usuário global:", e));
    }
  }, [currentUser, userName]);

  const handleLogin = async (type: 'google' | 'anonymous' = 'google') => {
    try {
      if (type === 'google') {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } else {
        await signInAnonymously(auth);
        setIsUserModalOpen(true); // Ask for name for anonymous users
      }
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      alert("Erro ao conectar. Verifique se o acesso anônimo está habilitado no Console do Firebase.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUserName('');
      localStorage.removeItem(USER_NAME_KEY);
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  };

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

  // 2. Real-time Firestore Sync
  useEffect(() => {
    if (!currentUser) return;

    const unsubTickets = onSnapshot(collection(db, 'tickets'), (snapshot) => {
      const docs = snapshot.docs.map(doc => doc.data() as TicketRecord);
      setRecords(docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });

    const unsubMural = onSnapshot(collection(db, 'muralPosts'), (snapshot) => {
      const docs = snapshot.docs.map(doc => doc.data() as MuralPost);
      setMuralPosts(docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });

    const unsubTratativas = onSnapshot(collection(db, 'treatments'), (snapshot) => {
      const docs = snapshot.docs.map(doc => doc.data() as MuralTreatment);
      setTratativas(docs);
    });

    const unsubNotifs = onSnapshot(query(collection(db, 'notifications'), where('userId', '==', currentUser.uid)), (snapshot) => {
       const docs = snapshot.docs.map(doc => doc.data() as MuralNotification);
       setNotifications(docs);
    });

    const unsubKB = onSnapshot(doc(db, 'knowledgeBase', 'version_1'), (doc) => {
      if (doc.exists()) {
        setKb(doc.data() as KnowledgeBase);
      }
    });
    
    // Listen to registered users for mentions
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const docs = snapshot.docs.map(doc => doc.data() as User);
      setUsers(docs.sort((a, b) => a.name.localeCompare(b.name)));
    });

    return () => {
      unsubTickets();
      unsubMural();
      unsubTratativas();
      unsubNotifs();
      unsubKB();
      unsubUsers();
    };
  }, [currentUser]);

  // Migration Helper: Upload local data to Firestore ONCE per session if Firestore is empty
  useEffect(() => {
    if (!currentUser || isLoaded.current) return;

    const migrateToCloud = async () => {
      try {
        const configRef = doc(db, 'configs', 'migration');
        const testDoc = await getDoc(configRef);
        
        if (!testDoc.exists()) {
           console.log("Migrando dados do localStorage para o Cloud Firestore...");
           const localRecords = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
           const localMural = JSON.parse(localStorage.getItem(MURAL_STORAGE_KEY) || '[]');
           const localTreatments = JSON.parse(localStorage.getItem(TRATATIVAS_STORAGE_KEY) || '[]');
           const localKB = JSON.parse(localStorage.getItem(KB_STORAGE_KEY) || 'null');

           for (const r of localRecords) {
             if (r.id) await setDoc(doc(db, 'tickets', r.id), cleanData(r));
           }
           for (const p of localMural) {
             if (p.id) await setDoc(doc(db, 'muralPosts', p.id), cleanData(p));
           }
           for (const t of localTreatments) {
             if (t.id) await setDoc(doc(db, 'treatments', t.id), cleanData(t));
           }
           if (localKB) {
             await setDoc(doc(db, 'knowledgeBase', 'version_1'), cleanData(localKB));
           }

           await setDoc(configRef, { migrated: true, at: new Date().toISOString() });
           console.log("Migração concluída.");
        }
      } catch (e) {
        console.error("Erro na migração para nuvem:", e);
      }
      isLoaded.current = true;
    };

    migrateToCloud();
  }, [currentUser]);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [dbStatus, setDbStatus] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const isLoaded = React.useRef(false);
  const isKbLoaded = React.useRef(false);
  const isMuralLoaded = React.useRef(false);
  const [activeTab, setActiveTab] = useState<ViewType>('management');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TicketRecord | null>(null);
  const [pendingMuralPost, setPendingMuralPost] = useState<(Partial<MuralPost> & { autoCreateTreatment?: boolean }) | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; status: string } | null>(null);
  const [initialMuralFilters, setInitialMuralFilters] = useState<{ search?: string, mentions?: boolean, criticality?: string } | null>(null);
  
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
  
  const [onlyAguardandoRetorno, setOnlyAguardandoRetorno] = useState(false);
  const [onlySemMovimentacao, setOnlySemMovimentacao] = useState(false);
  const [onlyDevolvidos, setOnlyDevolvidos] = useState(false);
  
  const [lineageFilter, setLineageFilter] = useState<string | null>(null);
  const [recurrenceFilter, setRecurrenceFilter] = useState<string>('ALL');
  const [tagFilter, setTagFilter] = useState<string>('ALL');
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');

  // ETAPA 5 — BASE UNIFICADA
  const baseAnalitica = useMemo(() => {
    return processarBaseAnalitica(records);
  }, [records]);

  // 2. Carregamento inicial (obsoleto com Firestore, mantido para redundância se necessário)
  useEffect(() => {
    if (!currentUser) return;
    setDbStatus('ONLINE');
  }, [currentUser]);

  // Sync users
  useEffect(() => {
    if (records.length > 0) {
      syncUsersFromData();
    }
  }, [records, syncUsersFromData]);

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

  // 3) SALVAR AUTOMATICAMENTE (Substituído por funções de escrita diretas)

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
    const subjects = new Set(records.map(r => (r.normalizedCategory || '').toUpperCase().trim()));
    return {
      users: Array.from(users).filter(Boolean).sort(),
      solicitants: Array.from(solicitants).filter(Boolean).sort(),
      subjects: Array.from(subjects).filter(Boolean).sort()
    };
  }, [records]);

  const contextRecords = useMemo(() => {
    const normalize = (str: any) => {
      if (str === null || str === undefined) return '';
      return String(str)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    };

    const isDevolvidoOrRetrabalho = (r: TicketRecord) => {
      const statusNorm = normalize(r.status);
      const obsNorm = normalize(r.observations);
      const isStatusDevolvido = statusNorm === 'devolvido';
      const keywords = ['devolvido', 'devolucao', 'reaberto', 'reabertura'];
      const hasDevolvidoKeywords = keywords.some(kw => obsNorm.includes(kw));
      return isStatusDevolvido || hasDevolvidoKeywords;
    };

    const isReincidente = (r: TicketRecord) => {
      const caseAnterior = normalize(r.previousCaseId);
      const invalidValues = ['', 'n/a', 'na', '-', '0'];
      return r.isFormalRecurrent || (caseAnterior !== '' && !invalidValues.includes(caseAnterior));
    };

    const getTags = (r: TicketRecord) => {
      const text = normalize(r.subject + ' ' + (r.description || '') + ' ' + (r.normalizedCategory || ''));
      const tags: string[] = [];
      if (text.includes('reforma tributaria')) tags.push('Reforma Tributária');
      if (text.includes('icms st')) tags.push('ICMS ST');
      if (text.includes('reducao')) tags.push('Redução');
      if (text.includes('cbenef')) tags.push('CBenef');
      if (text.includes('ncm')) tags.push('NCM');
      if (text.includes('cest')) tags.push('CEST');
      return tags;
    };

    return records.filter(r => {
      if (lineageFilter && (r.caseId !== lineageFilter && r.previousCaseId !== lineageFilter)) return false;
      
      // Filtro de Recorrência (Correção Solicitada)
      if (recurrenceFilter === 'REINCIDENCIA') {
        if (!isReincidente(r)) return false;
      } else if (recurrenceFilter === 'RETRABALHO') {
        if (!isDevolvidoOrRetrabalho(r)) return false;
      } else if (recurrenceFilter === 'SEM_RECORRENCIA') {
        if (isReincidente(r) || isDevolvidoOrRetrabalho(r)) return false;
      }

      // Filtro de TAGS (Nova Lógica)
      if (tagFilter !== 'ALL') {
        const tags = getTags(r);
        if (tagFilter === 'OUTROS') {
          if (tags.length > 0) return false;
        } else {
          if (!tags.includes(tagFilter)) return false;
        }
      }

      if (subjectFilter !== 'ALL' && (r.normalizedCategory || '').toUpperCase().trim() !== subjectFilter) return false;
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false;
      if (userFilter !== 'ALL' && (r.user || '').toUpperCase().trim() !== userFilter) return false;
      if (solicitantFilter !== 'ALL' && (r.externalUser || '').toUpperCase().trim() !== solicitantFilter) return false;

      if (onlyAguardandoRetorno && (r.returnDate && r.returnDate.trim() !== '' && r.returnDate !== '-')) return false;
      
      if (onlyDevolvidos) {
        if (!isDevolvidoOrRetrabalho(r)) return false;
      }

      if (onlySemMovimentacao) {
        const activeStatuses: TicketStatus[] = ['ABERTO', 'DEVOLVIDO'];
        if (!activeStatuses.includes(r.status)) return false;
        
        const threeDaysAgo = subDays(new Date(), 3);
        const openingDate = globalRobustDateParse(r.openingDate) || new Date(0);
        const returnDate = r.returnDate ? globalRobustDateParse(r.returnDate) : null;
        const lastMovement = returnDate && isAfter(returnDate, openingDate) ? returnDate : openingDate;
        
        if (!isAfter(threeDaysAgo, lastMovement)) return false;
      }

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
  }, [records, searchTerm, statusFilter, typeFilter, userFilter, solicitantFilter, startDate, endDate, retStartDate, retEndDate, lineageFilter, recurrenceFilter, tagFilter, onlyAguardandoRetorno, onlySemMovimentacao, onlyDevolvidos]);

  const filteredRecords = useMemo(() => {
    const today = startOfDay(new Date());
    
    let base = [...contextRecords];

    // Ordenação especial para Devolvidos se o filtro estiver ativo
    if (onlyDevolvidos) {
      base.sort((a, b) => {
        const getSlaLevel = (r: TicketRecord) => {
          const openD = globalRobustDateParse(r.openingDate);
          if (!openD) return 0;
          const retD = globalRobustDateParse(r.returnDate);
          const finalDate = retD ? startOfDay(retD) : today;
          const diff = Math.abs(differenceInDays(finalDate, startOfDay(openD)));
          if (diff > 9) return 3; // Crítico
          if (diff > 5) return 2; // Alerta
          return 1; // Normal
        };
        return getSlaLevel(b) - getSlaLevel(a);
      });
      return base;
    }

    if (slaLevelFilter === 'ALL') return base;

    return base.filter(r => {
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
    setOnlyAguardandoRetorno(false);
    setOnlySemMovimentacao(false);
    setOnlyDevolvidos(false);
    setLineageFilter(null);
    setRecurrenceFilter('ALL');
    setTagFilter('ALL');
    setSubjectFilter('ALL');
  };

  const handleClearAllData = async () => {
    if (window.confirm("⚠ ATENÇÃO: Deseja apagar TODOS os registros, base de conhecimento, MURAL e configurações no CLOUD? Esta ação é irreversível.")) {
      try {
        const allToDelete = [
          ...records.map(r => ({ coll: 'tickets', id: r.id })),
          ...muralPosts.map(p => ({ coll: 'muralPosts', id: p.id })),
          ...tratativas.map(t => ({ coll: 'treatments', id: t.id })),
          ...notifications.map(n => ({ coll: 'notifications', id: n.id })),
          ...users.map(u => ({ coll: 'users', id: u.id })),
          { coll: 'knowledgeBase', id: 'version_1' },
          { coll: 'configs', id: 'migration' }
        ].filter(item => item.id);

        if (allToDelete.length === 0) {
          alert("Nenhum dado encontrado para limpar no momento.");
          return;
        }

        setImportProgress({ 
          current: 0, 
          total: allToDelete.length, 
          status: 'Limpando Base de Dados...' 
        });

        // Deletar em lotes para evitar sobrecarga e timeouts
        const chunkSize = 20;
        for (let i = 0; i < allToDelete.length; i += chunkSize) {
          const chunk = allToDelete.slice(i, i + chunkSize);
          await Promise.all(chunk.map(item => deleteDoc(doc(db, item.coll, item.id))));
          setImportProgress({
            current: Math.min(i + chunkSize, allToDelete.length),
            total: allToDelete.length,
            status: 'Limpando Base de Dados...'
          });
        }

        // Limpa storages conhecidos
        const keysToClear = [
          STORAGE_KEY,
          KB_STORAGE_KEY,
          MURAL_STORAGE_KEY,
          TRATATIVAS_STORAGE_KEY,
          NOTIFICATIONS_STORAGE_KEY,
          USERS_LIST_KEY,
          USER_NAME_KEY,
          'semantic_cache_v1'
        ];

        keysToClear.forEach(key => localStorage.removeItem(key));
        
        // Limpa cache em memória
        semanticCache.invalidate('total');
        
        setImportProgress(null);
        alert("Base de dados limpa com sucesso!");
        window.location.reload();
      } catch (e) {
        console.error("Erro ao limpar dados:", e);
        setImportProgress(null);
        alert("Ocorreu um erro ao limpar a base cloud. Verifique sua conexão ou permissões.");
      }
    }
  };

  const handleSaveUserName = async (name: string) => {
    const standardName = standardizeName(name);
    if (standardName) {
      setUserName(standardName);
      localStorage.setItem(USER_NAME_KEY, standardName);
      syncUser(standardName);
      
      // Update Firebase Profile if logged in
      if (currentUser) {
        try {
          await updateProfile(currentUser, { displayName: standardName });
          // Force a state refresh if needed, though onAuthStateChanged might handle it
        } catch (e) {
          console.error("Erro ao atualizar perfil:", e);
        }
      }
      
      setIsUserModalOpen(false);
    }
  };

  const handleAddMuralPost = async (postData: Omit<MuralPost, 'id' | 'createdAt' | 'comments'>) => {
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
    
    await setDoc(doc(db, 'muralPosts', newPost.id), cleanData(newPost));
    syncUser(newPost.userName);

    // Create notifications for mentions
    if (newPost.mentions && newPost.mentions.length > 0) {
      for (const mention of newPost.mentions) {
        const notifId = crypto.randomUUID();
        const notification: MuralNotification = {
          id: notifId,
          userId: mention,
          authorName: newPost.userName,
          postId: newPost.id,
          postTitle: newPost.title,
          type: 'mention',
          read: false,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'notifications', notifId), cleanData(notification));
      }
    }
  };

  const handleUpdateMuralPost = async (updatedPost: MuralPost) => {
    const standardizedPost = {
      ...updatedPost,
      userName: standardizeName(updatedPost.userName),
      comments: updatedPost.comments.map(c => ({
        ...c,
        userName: standardizeName(c.userName)
      }))
    };
    await setDoc(doc(db, 'muralPosts', standardizedPost.id), cleanData(standardizedPost));
    syncUser(standardizedPost.userName);
    standardizedPost.comments.forEach(c => syncUser(c.userName));
  };

  const handleDeleteMuralPost = async (postId: string) => {
    if (window.confirm('Deseja realmente excluir esta postagem?')) {
      await deleteDoc(doc(db, 'muralPosts', postId));
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

  const handleViewCarga = (userName: string, type: 'total' | 'waiting' | 'stale') => {
    resetFilters();
    setSolicitantFilter(userName.toUpperCase());
    if (type === 'waiting') {
      setOnlyAguardandoRetorno(true);
    } else if (type === 'stale') {
      setOnlySemMovimentacao(true);
    }
    setActiveTab('table');
  };

  const handleViewMural = (filters: { search?: string, mentions?: boolean, criticality?: string }) => {
    setInitialMuralFilters(filters);
    setActiveTab('mural');
  };

  const handleLocateLineage = (caseId: string, context?: NavigationContext) => {
    resetFilters();
    setLineageFilter(caseId);
    if (context) {
      if (context.startDate) setStartDate(context.startDate);
      if (context.endDate) setEndDate(context.endDate);
      if (context.status) setStatusFilter(context.status);
      if (context.type) setTypeFilter(context.type);
      if (context.isFormalRecurrent) setRecurrenceFilter('ONLY_RECURRENT');
    }
    setActiveTab('table');
  };

  const handleAddTreatment = async (treatment: MuralTreatment) => {
    const standardizedTreatment = {
      ...treatment,
      responsible: standardizeName(treatment.responsible),
      usuario_criador: standardizeName(treatment.usuario_criador)
    };
    await setDoc(doc(db, 'treatments', standardizedTreatment.id), cleanData(standardizedTreatment));
    syncUser(standardizedTreatment.responsible);
    syncUser(standardizedTreatment.usuario_criador);
  };

  const handleUpdateTreatment = async (updatedTreatment: MuralTreatment) => {
    const standardizedTreatment = {
      ...updatedTreatment,
      responsible: standardizeName(updatedTreatment.responsible),
      usuario_criador: standardizeName(updatedTreatment.usuario_criador)
    };
    await setDoc(doc(db, 'treatments', standardizedTreatment.id), cleanData(standardizedTreatment));
    syncUser(standardizedTreatment.responsible);
    syncUser(standardizedTreatment.usuario_criador);
  };

  const handleDeleteTreatment = async (treatmentId: string) => {
    if (window.confirm('Deseja realmente excluir esta tratativa?')) {
      await deleteDoc(doc(db, 'treatments', treatmentId));
    }
  };

  const handleDashboardFilter = (key: string, value: string) => {
    resetFilters();
    if (key === 'status') setStatusFilter(value);
    if (key === 'type') setTypeFilter(value);
    if (key === 'user') setUserFilter(value.toUpperCase());
    if (key === 'error') setSearchTerm(value);
    if (key === 'sla') setSlaLevelFilter(value);
    if (key === 'recurrence') setRecurrenceFilter(value);
    if (key === 'devolvidos') {
      setRecurrenceFilter('RETRABALHO');
      setOnlyDevolvidos(true); // Mantem compatibilidade com a ordenação
    }
    setActiveTab('table');
  };

  const handleViewSubject = (subject: string, context?: NavigationContext) => {
    resetFilters();
    if (subject) {
      setSubjectFilter(subject.toUpperCase());
    }
    if (context) {
      if (context.startDate) setStartDate(context.startDate);
      if (context.endDate) setEndDate(context.endDate);
      if (context.status) setStatusFilter(context.status);
      if (context.type) setTypeFilter(context.type);
      if (context.isFormalRecurrent) setRecurrenceFilter('ONLY_RECURRENT');
    }
    setActiveTab('table');
  };

  const handleViewTreatment = (treatment: MuralTreatment) => {
    setInitialMuralFilters({ search: treatment.title });
    setActiveTab('mural');
  };

  const handleNotificationClick = async (notification: MuralNotification) => {
    setActiveTab('mural');
    setSearchTerm(notification.postTitle);
    await updateDoc(doc(db, 'notifications', notification.id), { read: true });
  };

  const handleSendCaseToMural = (record: TicketRecord, createTreatment: boolean = false) => {
    const isCritical = record.status === 'DEVOLVIDO' || !!record.previousCaseId;
    const suggestedPriority = isCritical ? 'Ação necessária' : 'Informativo';
    
    setPendingMuralPost({
      title: `Case #${record.caseId}: ${record.subject || 'Problema Operacional'}`,
      description: `Impacto: ${record.subject || 'Solicitação Técnica'}\nStatus Atual: ${record.status}\n\nDescrição do Case:\n${record.description}\n\nCenários de Teste:\n${record.scenarios || 'Nenhum registrado.'}\n\nAnalista Responsável: ${record.user}\nSolicitante: ${record.externalUser}`,
      caseId: record.caseId,
      subject: record.subject,
      criticality: suggestedPriority as MuralPostCriticality,
      type: suggestedPriority as MuralPostType,
      autoCreateTreatment: createTreatment
    });
    
    setActiveTab('mural');
  };

  const handleClearNotifications = async () => {
    for (const n of notifications) {
      if (!n.read) {
        await updateDoc(doc(db, 'notifications', n.id), { read: true });
      }
    }
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

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'ALL' || typeFilter !== 'ALL' || userFilter !== 'ALL' || solicitantFilter !== 'ALL' || slaLevelFilter !== 'ALL' || recurrenceFilter !== 'ALL' || tagFilter !== 'ALL' || subjectFilter !== 'ALL' || startDate !== '' || endDate !== '' || retStartDate !== '' || retEndDate !== '' || lineageFilter !== null || onlyAguardandoRetorno || onlySemMovimentacao;

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
        currentUser={currentUser}
        onLogin={handleLogin}
        onLogout={handleLogout}
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

          <div className="space-y-6">
            {/* LINHA 1: STATUS | SLA | ANALISTA SOVOS | FSJ SOLICITANTE | TIPO DE DEMANDA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-gray-950 uppercase ml-2">Status Operacional</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-500 rounded-xl text-[10px] font-black uppercase text-gray-900 outline-none focus:border-blue-700 transition-all">
                  <option value="ALL">TODOS STATUS</option>
                  <option value="ABERTO">ABERTO</option>
                  <option value="DEVOLVIDO">DEVOLVIDO</option>
                  <option value="CONCLUÍDO">CONCLUÍDO</option>
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

            {/* LINHA 2: RECORRÊNCIA | FILTRO POR TAGS | TEMA / ASSUNTO | ABERTURA | RETORNO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-4 border-t border-gray-100 items-end">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-gray-950 uppercase ml-2">Recorrência</label>
                <select value={recurrenceFilter} onChange={(e) => setRecurrenceFilter(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-500 rounded-xl text-[10px] font-black uppercase text-gray-900 outline-none focus:border-blue-700 transition-all">
                  <option value="ALL">TODAS</option>
                  <option value="REINCIDENCIA">Reincidência</option>
                  <option value="RETRABALHO">Retrabalho / Devolvidos</option>
                  <option value="SEM_RECORRENCIA">Sem recorrência</option>
                </select>
                <div className="mt-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg animate-pulse">
                  <p className="text-[7px] font-black text-blue-800 uppercase">
                    Diagnóstico: {recurrenceFilter === 'ALL' ? 'Todas' : recurrenceFilter === 'REINCIDENCIA' ? 'Reincidência' : recurrenceFilter === 'RETRABALHO' ? 'Retrabalho' : 'Sem Recorrência'} | {contextRecords.length} itens
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-gray-950 uppercase ml-2">Filtro por TAGS</label>
                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-500 rounded-xl text-[10px] font-black uppercase text-gray-900 outline-none focus:border-blue-700 transition-all">
                  <option value="ALL">TODAS TAGS</option>
                  <option value="Reforma Tributária">Reforma Tributária</option>
                  <option value="ICMS ST">ICMS ST</option>
                  <option value="Redução">Redução</option>
                  <option value="CBenef">CBenef</option>
                  <option value="NCM">NCM</option>
                  <option value="CEST">CEST</option>
                  <option value="OUTROS">Outros</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-gray-950 uppercase ml-2">Tema / Assunto</label>
                <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-500 rounded-xl text-[10px] font-black uppercase text-gray-900 outline-none focus:border-blue-700 transition-all">
                  <option value="ALL">TODOS TEMAS</option>
                  {uniqueData.subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-1 ml-2">
                    <Calendar className={`w-3 h-3 ${(startDate || endDate) ? 'text-[#D91B2A]' : 'text-[#003DA5]'}`} />
                    <span className="text-[8px] font-black text-gray-500 uppercase">Abertura</span>
                </div>
                <div className="flex items-center gap-1">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[45%] px-2 py-2 bg-gray-50 border-2 border-gray-500 rounded-xl text-[9px] font-bold text-gray-900 outline-none focus:border-blue-700 transition-all" />
                    <span className="text-gray-900 text-[8px] font-black opacity-30">❯</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[45%] px-2 py-2 bg-gray-50 border-2 border-gray-500 rounded-xl text-[9px] font-bold text-gray-900 outline-none focus:border-blue-700 transition-all" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-1 ml-2">
                    <CalendarDays className={`w-3 h-3 ${(retStartDate || retEndDate) ? 'text-[#D91B2A]' : 'text-amber-700'}`} />
                    <span className="text-[8px] font-black text-gray-500 uppercase">Retorno</span>
                </div>
                <div className="flex items-center gap-1">
                    <input type="date" value={retStartDate} onChange={(e) => setRetStartDate(e.target.value)} className="w-[45%] px-2 py-2 bg-amber-50 border-2 border-amber-600 rounded-xl text-[9px] font-bold text-gray-900 outline-none focus:border-amber-700 transition-all" />
                    <span className="text-gray-900 text-[8px] font-black opacity-30">❯</span>
                    <input type="date" value={retEndDate} onChange={(e) => setRetEndDate(e.target.value)} className="w-[45%] px-2 py-2 bg-amber-50 border-2 border-amber-600 rounded-xl text-[9px] font-bold text-gray-900 outline-none focus:border-amber-700 transition-all" />
                </div>
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
            initialPostData={pendingMuralPost}
            onClearInitialPostData={() => {
              setPendingMuralPost(null);
              setInitialMuralFilters(null);
            }}
            initialFilters={initialMuralFilters || undefined}
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
            onDelete={async (id) => {
              if (window.confirm('Excluir registro?')) {
                await deleteDoc(doc(db, 'tickets', id));
              }
            }} 
            onEdit={(r) => { setEditingRecord(r); setIsFormOpen(true); }} 
            onOpenCase={handleLocateLineage}
            onAddTreatment={handleAddTreatment}
            onSendToMural={handleSendCaseToMural}
            currentUserName={userName}
            isRetrabalhoFilterActive={recurrenceFilter === 'RETRABALHO'}
          />
        ) : activeTab === 'management' ? (
          <ManagementDashboard 
            records={baseAnalitica}
            posts={muralPosts}
            tratativas={tratativas}
            userName={userName}
            onViewSubject={handleViewSubject}
            onViewTreatment={handleViewTreatment}
            onViewCarga={handleViewCarga}
            onViewMural={handleViewMural}
            onOpenCase={handleLocateLineage}
            onAddTreatment={handleAddTreatment}
          />
        ) : (
          <Dashboard 
            records={contextRecords} 
            contextRecords={baseAnalitica}
            onLocateLineage={handleLocateLineage} 
            onFilterAction={handleDashboardFilter} 
            dateFilters={{ startDate, endDate, retStartDate, retEndDate }}
          />
        )}
      </main>

      {isFormOpen && (
        <RecordForm 
          onSubmit={async (data) => {
            const key = String(data.caseId || "").trim();
            if (!key) return;

            const standardizedData = {
              ...data,
              user: standardizeName(data.user || ''),
              creatorUser: standardizeName(data.creatorUser || userName)
            };

            syncUser(standardizedData.user);
            syncUser(standardizedData.creatorUser);

            const existingIndex = records.findIndex(r => String(r.caseId || "").trim() === key);
            let updatedRecord: TicketRecord;

            if (existingIndex !== -1) {
              updatedRecord = normalizeRecord({ ...records[existingIndex], ...standardizedData, caseId: key });
              await setDoc(doc(db, 'tickets', updatedRecord.id), cleanData(updatedRecord));
            } else {
              updatedRecord = normalizeRecord({ 
                ...standardizedData, 
                id: crypto.randomUUID(), 
                caseId: key,
                creatorUser: standardizedData.creatorUser,
                createdAt: new Date().toISOString(),
                origin: data.origin || 'manual'
              } as TicketRecord);
              await setDoc(doc(db, 'tickets', updatedRecord.id), cleanData(updatedRecord));
            }
            
            triggerLearning(updatedRecord);
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
          onAddTreatment={handleAddTreatment}
          onSendToMural={(record, createTreatment) => {
            handleSendCaseToMural(record, createTreatment);
            setIsFormOpen(false);
            setEditingRecord(null);
          }}
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
          onImport={async (newRecords, report) => { 
            setIsImportModalOpen(false);
            setImportProgress({ current: 0, total: newRecords.length, status: 'Iniciando importação...' });
            
            const recordsMap = new Map<string, TicketRecord>();
            records.forEach(r => {
              const key = String(r.caseId || "").trim();
              if (key) recordsMap.set(key, r);
            });
            
            let updatedCount = 0;
            let newCount = 0;
            const CHUNK_SIZE = 5; 

            for (let i = 0; i < newRecords.length; i += CHUNK_SIZE) {
              const chunk = newRecords.slice(i, i + CHUNK_SIZE);
              
              await Promise.all(chunk.map(async (r) => {
                const key = String(r.caseId || "").trim();
                if (!key) return;

                if (r.user) syncUser(r.user);

                let finalRecord: TicketRecord;
                if (recordsMap.has(key)) {
                  const existing = recordsMap.get(key)!;
                  finalRecord = normalizeRecord({ ...existing, ...r, id: existing.id, caseId: key });
                  await setDoc(doc(db, 'tickets', finalRecord.id), cleanData(finalRecord));
                  updatedCount++;
                } else {
                  finalRecord = normalizeRecord({ ...r, caseId: key });
                  await setDoc(doc(db, 'tickets', finalRecord.id), cleanData(finalRecord));
                  newCount++;
                }
                triggerLearning(finalRecord);
              }));

              setImportProgress({ 
                current: Math.min(i + CHUNK_SIZE, newRecords.length), 
                total: newRecords.length, 
                status: `Processando registros: ${Math.min(i + CHUNK_SIZE, newRecords.length)} de ${newRecords.length}` 
              });
            }

            setImportProgress(null);
            
            alert(
              `RELATÓRIO DE IMPORTAÇÃO CONCLUÍDO:\n\n` +
              `• Total no arquivo: ${report.total}\n` +
              `• Novos inseridos: ${newCount}\n` +
              `• Existentes atualizados: ${updatedCount}\n` +
              `• Duplicados ignorados: ${report.duplicated}`
            );
          }} 
          onClose={() => setIsImportModalOpen(false)} 
        />
      )}

      {importProgress && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border-[8px] border-[#003DA5] transform animate-in zoom-in-95 duration-300">
            <div className="bg-[#003DA5] text-white px-8 py-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Importando Dados</h2>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Aguarde a sincronização cloud</p>
              </div>
              <div className="bg-white/20 p-3 rounded-2xl">
                <Database className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            
            <div className="p-10 space-y-8">
              <div className="relative pt-1">
                <div className="flex mb-4 items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black py-1 px-2 uppercase rounded-full text-[#003DA5] bg-blue-50 border border-blue-100">
                      {importProgress.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[14px] font-black text-[#003DA5]">
                      {Math.round((importProgress.current / importProgress.total) * 100)}%
                    </span>
                  </div>
                </div>
                <div className="overflow-hidden h-6 text-xs flex rounded-[1rem] bg-gray-100 border-2 border-gray-100 shadow-inner">
                  <div 
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-[#003DA5] to-blue-600 transition-all duration-500 rounded-[1rem]"
                  >
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <p className="text-[8px] font-black text-gray-500 uppercase mb-1">Processados</p>
                  <p className="text-xl font-black text-gray-900">{importProgress.current}</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <p className="text-[8px] font-black text-gray-500 uppercase mb-1">Total</p>
                  <p className="text-xl font-black text-gray-900">{importProgress.total}</p>
                </div>
              </div>

              <p className="text-[9px] text-gray-500 font-bold text-center italic">
                Não feche o navegador durante este processo para garantir a integridade dos dados.
              </p>
            </div>
          </div>
        </div>
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
