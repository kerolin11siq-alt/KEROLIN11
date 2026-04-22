
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  MessageCircle, 
  Edit2, 
  Trash2, 
  Pin, 
  Plus, 
  CheckCircle2, 
  AlertCircle,
  Search,
  ClipboardList,
  X,
  Users,
  ShieldCheck,
  AlertTriangle,
  Bot,
  MoreVertical,
  ArrowUpRight
} from 'lucide-react';
import { MuralPost, MuralPostType, MuralPostStatus, MuralPostCriticality, MuralTreatment, TicketRecord, MuralComment, User } from '../../types';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  getSmartTreatmentSuggestion,
  calculateMuralAISuggestion,
  calculateAutomaticAlerts,
  calculateAutomaticInsights
} from '../../src/services/analyticsService';

interface MuralProps {
  posts: MuralPost[];
  userName: string;
  users: User[];
  onAddPost: (post: Omit<MuralPost, 'id' | 'createdAt' | 'comments'>) => void;
  onUpdatePost: (post: MuralPost) => void;
  onDeletePost: (postId: string) => void;
  onOpenCase: (caseId: string) => void;
  onCreateCaseFromPost: (post: MuralPost) => void;
  records: TicketRecord[];
  searchTerm?: string;
  tratativas: MuralTreatment[];
  onAddTreatment: (treatment: MuralTreatment) => void;
  onUpdateTreatment: (treatment: MuralTreatment) => void;
  onDeleteTreatment: (treatmentId: string) => void;
}

const Mural: React.FC<MuralProps> = ({ 
  posts, 
  userName, 
  users,
  onAddPost, 
  onUpdatePost, 
  onDeletePost, 
  onOpenCase,
  onCreateCaseFromPost,
  records,
  searchTerm = '',
  tratativas,
  onAddTreatment,
  onUpdateTreatment,
  onDeleteTreatment
}) => {
  // Filters
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterCriticality, setFilterCriticality] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterSearch, setFilterSearch] = useState(searchTerm);
  const [filterPeriod, setFilterPeriod] = useState<number>(7);
  const [showMyMentions, setShowMyMentions] = useState(false);

  // Autocomplete Mentions
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  const availableUsers = useMemo(() => {
    return users.filter(u => u.name !== userName).sort((a, b) => a.name.localeCompare(b.name));
  }, [users, userName]);

  const filteredMentionUsers = useMemo(() => {
    if (!mentionSearch) return availableUsers;
    return availableUsers.filter(u => u.name.toLowerCase().includes(mentionSearch.toLowerCase()));
  }, [availableUsers, mentionSearch]);

  // Update local search when prop changes
  React.useEffect(() => {
    setFilterSearch(searchTerm);
  }, [searchTerm]);

  // New Post Form
  const [newPost, setNewPost] = useState({
    title: '',
    description: '',
    type: 'Informativo' as MuralPostType,
    criticality: 'Informativo' as MuralPostCriticality,
    status: 'Aberto' as MuralPostStatus,
    subject: '',
    caseId: '',
    mentions: [] as string[],
    tags: [] as string[]
  });

  const [isNewPostModalOpen, setIsNewPostModalOpen] = useState(false);
  const [isManualClassification, setIsManualClassification] = useState(false);
  const [showGovernanceInfo, setShowGovernanceInfo] = useState(false);

  // Handle Mention Logic
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const pos = e.target.selectionStart;
    setNewPost(prev => ({ ...prev, description: value }));
    setCursorPosition(pos);

    const lastAt = value.lastIndexOf('@', pos - 1);
    if (lastAt !== -1) {
      const query = value.substring(lastAt + 1, pos);
      if (!query.includes(' ')) {
        setMentionSearch(query);
        setShowMentionList(true);
        return;
      }
    }
    setShowMentionList(false);
  };

  const selectMention = (user: User) => {
    const lastAt = newPost.description.lastIndexOf('@', cursorPosition - 1);
    const before = newPost.description.substring(0, lastAt);
    const after = newPost.description.substring(cursorPosition);
    const newValue = `${before}@${user.name} ${after}`;
    
    setNewPost(prev => ({ 
      ...prev, 
      description: newValue,
      mentions: [...new Set([...prev.mentions, user.id])]
    }));
    setShowMentionList(false);
  };

  const applyGovernanceTemplate = () => {
    setNewPost(prev => ({
      ...prev,
      description: `Problema: \nImpacto: \nStatus: \n\n${prev.description}`
    }));
  };

  // Automatic Classification logic
  useEffect(() => {
    if (isManualClassification) return;
    const text = (newPost.title + ' ' + newPost.description).toUpperCase();
    if (!text.trim()) return;

    let suggestedCriticality: MuralPostCriticality = 'Informativo';
    
    // Automatic Classification Logic (Governança FSJ)
    if (text.includes('URGENTE') || text.includes('CRITICO') || text.includes('BLOQUEIO') || text.includes('PARADO') || text.includes('ERRO GRAVE') || text.includes('ERRO VOLTOU') || text.includes('SEM RETORNO')) {
      suggestedCriticality = 'Crítico';
    } else if (text.includes('ACAO') || text.includes('TRATATIVA') || text.includes('PENDENTE') || text.includes('REABERTURA') || text.includes('VOLTOU') || text.includes('RECORRENTE')) {
      suggestedCriticality = 'Ação necessária';
    } else if (text.includes('ATENCAO') || text.includes('CUIDADO') || text.includes('MONITORAR')) {
      suggestedCriticality = 'Atenção';
    }

    if (suggestedCriticality !== newPost.criticality) {
      setNewPost(prev => ({ ...prev, criticality: suggestedCriticality, type: suggestedCriticality as MuralPostType }));
    }
  }, [newPost.title, newPost.description, isManualClassification]);

  // Top Attention Items (Max 3 relevant)
  const attentionItems = useMemo(() => {
    return posts
      .filter(p => p.status !== 'Encerrado')
      .map(p => {
        const t = tratativas.find(tr => tr.mural_post_id === p.id);
        const hasTreatment = !!t;
        const isDelayed = t && t.deadline && new Date(t.deadline) < new Date() && t.status !== 'Concluída';
        const isRelevant = p.criticality === 'Crítico' || p.criticality === 'Ação necessária';
        
        let priority = 0;
        if (p.criticality === 'Crítico' && !hasTreatment) priority = 100;
        else if (isDelayed) priority = 80;
        else if (!hasTreatment && isRelevant) priority = 60;
        else if (isRelevant) priority = 40;
        
        return { post: p, priority };
      })
      .filter(item => item.priority > 0)
      .sort((a, b) => b.priority - a.priority || new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())
      .slice(0, 3)
      .map(item => item.post);
  }, [posts, tratativas]);

  const myUser = useMemo(() => users.find(u => u.name === userName), [users, userName]);

  const myMentionsCount = useMemo(() => {
    if (!myUser) return 0;
    return posts.filter(p => p.mentions.includes(myUser.id) && p.status !== 'Encerrado').length;
  }, [posts, myUser]);

  const globalAlerts = useMemo(() => {
    return calculateAutomaticAlerts(records, posts, [], tratativas);
  }, [records, posts, tratativas]);

  const monthlyInsights = useMemo(() => {
    // Pegar registros do mês atual
    const now = new Date();
    const currentMonthRecords = records.filter(r => {
      const date = parseISO(r.openingDate);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
    return calculateAutomaticInsights(currentMonthRecords, posts, tratativas);
  }, [records, posts, tratativas]);

  const filteredPosts = useMemo(() => {
    const today = new Date();
    const searchLower = filterSearch.toLowerCase().trim();
    
    return posts.filter(post => {
      // Automatic Archiving: Hide posts older than 15 days if not pinned or critical
      const postDate = new Date(post.createdAt);
      const daysOld = differenceInDays(today, postDate);
      if (daysOld > 15 && !post.isPinned && post.criticality !== 'Crítico' && post.status === 'Encerrado') return false;

      if (filterCriticality !== 'ALL' && post.criticality !== filterCriticality) return false;
      
      if (showMyMentions && myUser && !post.mentions.includes(myUser.id)) return false;

      if (searchLower) {
        const textMatch = post.title.toLowerCase().includes(searchLower) || 
                         post.description.toLowerCase().includes(searchLower) || 
                         (post.caseId && post.caseId.toLowerCase().includes(searchLower));
        
        if (!textMatch) return false;
      }
          
      return true;
    }).sort((a, b) => {
      // Relevance: Pinned > Critical > Time
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      
      if (a.criticality === 'Crítico' && b.criticality !== 'Crítico') return -1;
      if (a.criticality !== 'Crítico' && b.criticality === 'Crítico') return 1;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [posts, filterCriticality, filterSearch]);

  const handleAddPost = () => {
    if (!newPost.title || !newPost.description) return;

    // Check for mandatory treatment keywords (Governança FSJ)
    const needsTreatment = 
      newPost.description.toLowerCase().includes('recorrência') || 
      newPost.description.toLowerCase().includes('recorrente') || 
      newPost.description.toLowerCase().includes('reabertura') || 
      newPost.description.toLowerCase().includes('erro voltou') || 
      newPost.description.toLowerCase().includes('sem retorno') || 
      newPost.criticality === 'Crítico' ||
      newPost.criticality === 'Ação necessária';

    onAddPost({
      ...newPost,
      userId: userName,
      userName: userName,
      tags: newPost.tags,
      mentions: newPost.mentions
    });

    if (needsTreatment) {
      alert('Governança: Esta postagem exige a criação de uma tratativa obrigatória devido à sua criticidade ou natureza.');
    }

    setNewPost({
      title: '',
      description: '',
      type: 'Informativo',
      criticality: 'Informativo',
      status: 'Aberto',
      subject: '',
      caseId: '',
      mentions: [],
      tags: []
    });
    setIsManualClassification(false);
    setIsNewPostModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-8 p-8 bg-[#F8FAFC] min-h-[calc(100vh-80px)] max-w-5xl mx-auto w-full">
      {/* HEADER: AÇÕES E BUSCA */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
        <div className="flex flex-col gap-1 flex-1 w-full max-w-xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar no mural..."
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4 mt-2 px-1">
            <button 
              onClick={() => setShowMyMentions(!showMyMentions)}
              className={`text-[10px] font-black uppercase transition-colors flex items-center gap-1.5 ${showMyMentions ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Users className="w-3 h-3" />
              Minhas Marcações
              {myMentionsCount > 0 && (
                <span className="bg-blue-600 text-white text-[8px] px-1.5 py-0.5 rounded-full">
                  {myMentionsCount}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase text-slate-300">Tipo:</span>
              <select 
                className="bg-transparent text-[10px] font-black uppercase text-slate-500 outline-none cursor-pointer hover:text-slate-800 transition-colors"
                value={filterCriticality}
                onChange={(e) => setFilterCriticality(e.target.value)}
              >
                <option value="ALL">Tudo</option>
                <option value="Informativo">Info</option>
                <option value="Atenção">Atenção</option>
                <option value="Ação necessária">Ação</option>
                <option value="Crítico">Crítico</option>
              </select>
            </div>
            <div className="flex items-center gap-2 border-l border-slate-100 pl-4">
              <span className="text-[10px] font-black uppercase text-slate-300">Período:</span>
              <div className="flex gap-2">
                {[7, 15, 30].map(p => (
                  <button
                    key={p}
                    onClick={() => setFilterPeriod(p)}
                    className={`text-[10px] font-black uppercase transition-all ${filterPeriod === p ? 'text-blue-600 underline underline-offset-4' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {p}d
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setIsNewPostModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3.5 bg-[#003DA5] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-900/10 hover:bg-blue-800 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Novo Post
        </button>
      </div>

      {/* BLOCO FIXO: ATENÇÃO NO MOMENTO */}
      {attentionItems.length > 0 && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-2 mb-4 px-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h2 className="text-[11px] font-black text-slate-800 uppercase tracking-widest text-sm">Atenção no momento</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {attentionItems.map(item => (
              <div 
                key={item.id} 
                className={`p-4 rounded-2xl border bg-white shadow-sm flex flex-col gap-2 cursor-pointer hover:shadow-md transition-all ${item.criticality === 'Crítico' ? 'border-red-100 border-l-4 border-l-red-500' : 'border-orange-100 border-l-4 border-l-orange-500'}`}
                onClick={() => setFilterSearch(item.title)}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-lg ${item.criticality === 'Crítico' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                    {item.criticality}
                  </span>
                  <span className="text-[8px] font-bold text-slate-300 uppercase">{format(new Date(item.createdAt), "dd/MM HH:mm")}</span>
                </div>
                <p className="text-xs font-black text-slate-800 line-clamp-1 uppercase tracking-tight">{item.title}</p>
                <div className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-slate-200" />
                  <p className="text-[10px] text-slate-400 line-clamp-1 font-medium">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FEED DO MURAL — LINHA DO TEMPO LIMPA */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2 mb-2 px-2">
          <Pin className="w-4 h-4 text-slate-400" />
          <h2 className="text-[11px] font-black text-slate-800 uppercase tracking-widest text-sm">Feed Operacional</h2>
        </div>

        <div className="space-y-4">
          {filteredPosts.length > 0 ? (
            filteredPosts.map(post => (
              <MuralCard 
                key={post.id} 
                post={post} 
                posts={posts}
                onUpdate={onUpdatePost}
                onDelete={onDeletePost}
                onOpenCase={onOpenCase}
                onCreateCase={onCreateCaseFromPost}
                records={records}
                users={users}
                treatment={tratativas.find(t => t.mural_post_id === post.id)}
                tratativas={tratativas}
                onAddTreatment={onAddTreatment}
                onUpdateTreatment={onUpdateTreatment}
                onDeleteTreatment={onDeleteTreatment}
                userName={userName}
              />
            ))
          ) : (
            <div className="text-center py-20 bg-white rounded-[2rem] border border-dashed border-slate-200">
              <Search className="w-12 h-12 text-slate-100 mx-auto mb-4" />
              <p className="text-slate-400 font-bold uppercase text-[10px]">Nenhuma postagem encontrada.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: NOVO POST */}
      {isNewPostModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden border-[8px] border-white transform animate-in zoom-in-95 duration-300">
            <div className="bg-[#003DA5] text-white px-8 py-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Nova Publicação</h2>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Mural Operacional FSJ</p>
              </div>
              <button onClick={() => setIsNewPostModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Título</label>
                  <input 
                    type="text" 
                    placeholder="Título curto e objetivo..."
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={newPost.title}
                    onChange={(e) => setNewPost(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 relative">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase block">Conteúdo</label>
                    <button 
                      onClick={applyGovernanceTemplate}
                      className="text-[9px] font-black text-blue-600 uppercase hover:underline"
                    >
                      Usar Padrão Oficial
                    </button>
                  </div>
                  <textarea 
                    placeholder="Descreva a situação de forma clara... Use @ para mencionar alguém."
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] resize-none transition-all"
                    value={newPost.description}
                    onChange={handleDescriptionChange}
                  />
                  
                  {showMentionList && filteredMentionUsers.length > 0 && (
                    <div className="absolute z-[110] top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Mencionar usuário</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {filteredMentionUsers.map(user => (
                          <button
                            key={user.id}
                            onClick={() => selectMention(user)}
                            className="w-full px-4 py-3 text-left text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2"
                          >
                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[8px]">
                              {user.name.substring(0, 2).toUpperCase()}
                            </div>
                            {user.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Classificação</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    value={newPost.criticality}
                    onChange={(e) => {
                      setIsManualClassification(true);
                      setNewPost(prev => ({ ...prev, criticality: e.target.value as MuralPostCriticality, type: e.target.value as MuralPostType }));
                    }}
                  >
                    <option value="Informativo">Informativo</option>
                    <option value="Atenção">Atenção</option>
                    <option value="Ação necessária">Ação necessária</option>
                    <option value="Crítico">Crítico</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Case Relacionado</label>
                  <input 
                    type="text" 
                    placeholder="Número do case (opcional)"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    value={newPost.caseId}
                    onChange={(e) => setNewPost(prev => ({ ...prev, caseId: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setIsNewPostModalOpen(false)}
                  className="flex-1 py-4 border-2 border-slate-100 text-slate-400 font-black uppercase text-[10px] rounded-2xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleAddPost}
                  disabled={!newPost.title || !newPost.description}
                  className="flex-1 py-4 bg-[#003DA5] text-white font-black uppercase text-[10px] rounded-2xl shadow-xl hover:bg-blue-800 transition-all disabled:opacity-50"
                >
                  Publicar Agora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface MuralCardProps {
  post: MuralPost;
  posts: MuralPost[];
  onUpdate: (post: MuralPost) => void;
  onDelete: (postId: string) => void;
  onOpenCase: (caseId: string) => void;
  onCreateCase: (post: MuralPost) => void;
  records: TicketRecord[];
  users: User[];
  treatment?: MuralTreatment;
  tratativas: MuralTreatment[];
  onAddTreatment: (treatment: MuralTreatment) => void;
  onUpdateTreatment: (treatment: MuralTreatment) => void;
  onDeleteTreatment: (treatmentId: string) => void;
  userName: string;
}

const MuralCard: React.FC<MuralCardProps> = ({ 
  post, 
  posts,
  onUpdate, 
  onDelete, 
  onOpenCase, 
  onCreateCase,
  records,
  treatment,
  tratativas,
  onAddTreatment,
  onUpdateTreatment,
  onDeleteTreatment,
  userName,
  users
}) => {
  const [isCommenting, setIsCommenting] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isTreatmentOpen, setIsTreatmentOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const alerts = useMemo(() => calculateAutomaticAlerts(records, posts, [], tratativas), [records, posts, tratativas]);
  const aiSuggestion = useMemo(() => calculateMuralAISuggestion(post, records, alerts, posts), [post, records, alerts, posts]);
  const smartSuggestion = useMemo(() => getSmartTreatmentSuggestion(post, records, [], alerts, posts, tratativas, userName), [post, records, alerts, posts, tratativas, userName]);

  const isMandatoryTreatment = useMemo(() => {
    const text = (post.title + ' ' + post.description).toLowerCase();
    return post.criticality === 'Crítico' || 
           post.criticality === 'Ação necessária' || 
           text.includes('recorrência') || 
           text.includes('reabertura') ||
           text.includes('sem retorno');
  }, [post]);

  const highlightedDescription = useMemo(() => {
    let parts: (string | React.ReactElement)[] = [post.description];
    
    // Sort users by name length descending to avoid partial matches
    const sortedUsers = [...users].sort((a, b) => b.name.length - a.name.length);
    
    sortedUsers.forEach(user => {
      const mention = `@${user.name}`;
      const newParts: (string | React.ReactElement)[] = [];
      
      parts.forEach(part => {
        if (typeof part !== 'string') {
          newParts.push(part);
          return;
        }
        
        const split = part.split(mention);
        split.forEach((s, i) => {
          newParts.push(s);
          if (i < split.length - 1) {
            newParts.push(<span key={`${user.id}-${i}`} className="text-blue-600 font-black">@{user.name}</span>);
          }
        });
      });
      parts = newParts;
    });
    
    return parts;
  }, [post.description, users]);

  const [treatmentData, setTreatmentData] = useState({
    title: treatment?.title || smartSuggestion.title || `Tratativa: ${post.title}`,
    responsible: treatment?.responsible || smartSuggestion.responsible || '',
    priority: treatment?.priority || smartSuggestion.priority || 'Baixa',
    deadline: treatment?.deadline || (smartSuggestion.deadline ? smartSuggestion.deadline.split('T')[0] : ''),
    case_numero: treatment?.case_numero || post.caseId || '',
    description: treatment?.description || post.description || '',
    status: treatment?.status || 'Aberta' as any,
    observacoes_internas: treatment?.observacoes_internas || ''
  });

  // Reset treatment data when treatment prop changes (e.g. when opening edit modal)
  useEffect(() => {
    if (treatment) {
      setTreatmentData({
        title: treatment.title,
        responsible: treatment.responsible,
        priority: treatment.priority,
        deadline: treatment.deadline,
        case_numero: treatment.case_numero || '',
        description: treatment.description,
        status: treatment.status,
        observacoes_internas: treatment.observacoes_internas || ''
      });
    }
  }, [treatment]);

  const criticalityColors = {
    'Informativo': 'bg-blue-50 text-blue-600 border-blue-100',
    'Atenção': 'bg-amber-50 text-amber-600 border-amber-100',
    'Ação necessária': 'bg-orange-50 text-orange-600 border-orange-100',
    'Crítico': 'bg-red-50 text-red-600 border-red-100'
  };

  const statusColors = {
    'Aberto': 'bg-slate-100 text-slate-600',
    'Em análise': 'bg-blue-100 text-blue-600',
    'Em acompanhamento': 'bg-indigo-100 text-indigo-600',
    'Tratado': 'bg-emerald-100 text-emerald-600',
    'Encerrado': 'bg-slate-800 text-white'
  };

  const treatmentStatusColors = {
    'Aberta': 'bg-blue-100 text-blue-700 border-blue-200',
    'Aguardando Sovos': 'bg-amber-100 text-amber-700 border-amber-200',
    'Em acompanhamento': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'Em validação interna': 'bg-purple-100 text-purple-700 border-purple-200',
    'Concluída': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Cancelada': 'bg-slate-100 text-slate-700 border-slate-200'
  };

  const handleSaveTreatment = () => {
    if (!treatmentData.title || !treatmentData.responsible || !treatmentData.deadline) {
      alert('Por favor, preencha os campos obrigatórios.');
      return;
    }

    if (treatment) {
      // Update
      onUpdateTreatment({
        ...treatment,
        ...treatmentData,
        priority: treatmentData.priority as MuralPostCriticality,
        atualizado_em: new Date().toISOString(),
        encerrado_em: treatmentData.status === 'Concluída' ? new Date().toISOString() : treatment.encerrado_em
      });
    } else {
      // Create
      const newTreatment: MuralTreatment = {
        id: crypto.randomUUID(),
        mural_post_id: post.id,
        ...treatmentData,
        priority: treatmentData.priority as MuralPostCriticality,
        origin: 'mural',
        usuario_criador: userName,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        status: 'Aberta'
      };
      onAddTreatment(newTreatment);
      // Also update the post to reflect it has a treatment (optional if we use separate state, but good for UI)
      onUpdate({ ...post, status: 'Em acompanhamento' });
    }
    setIsTreatmentOpen(false);
  };

  return (
    <div className={`bg-white rounded-2xl border transition-all ${
      post.status === 'Encerrado' ? 'opacity-60 grayscale-[0.2]' : 'shadow-sm hover:shadow-md'
    } ${
      post.criticality === 'Crítico' ? 'border-red-100' : 
      post.criticality === 'Ação necessária' ? 'border-orange-100' :
      'border-slate-100'
    } overflow-hidden group relative`}>
      {/* Header do Card — Minimalista Premium */}
      <div className="px-5 py-3 border-b border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${
            post.criticality === 'Crítico' ? 'bg-red-50 text-red-600' : 
            post.criticality === 'Ação necessária' ? 'bg-orange-50 text-orange-600' : 
            post.criticality === 'Atenção' ? 'bg-amber-50 text-amber-600' :
            'bg-slate-100 text-slate-600'
          }`}>
            {post.type}
          </span>
          
          <div className="flex items-center gap-2">
            {post.caseId && (
              <button 
                onClick={() => onOpenCase(post.caseId!)}
                className="text-[10px] font-black text-blue-600 hover:underline uppercase"
              >
                Case {post.caseId}
              </button>
            )}
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{post.userName}</span>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tight">{format(new Date(post.createdAt), "dd/MM HH:mm")}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 relative">
          {post.isPinned && (
            <Pin className="w-3 h-3 text-blue-500 fill-current" />
          )}
          <div className="relative">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-40 overflow-hidden animate-in fade-in slide-in-from-top-2">
                <button 
                  onClick={() => {
                    onUpdate({ ...post, isPinned: !post.isPinned });
                    setIsMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Pin className="w-3 h-3" />
                  {post.isPinned ? 'Desafixar' : 'Fixar'}
                </button>
                <button 
                  onClick={() => {
                    onUpdate({ ...post, status: post.status === 'Encerrado' ? 'Aberto' : 'Encerrado' });
                    setIsMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {post.status === 'Encerrado' ? 'Reabrir' : 'Arquivar'}
                </button>
                <button 
                  onClick={() => {
                    if (confirm('Deseja excluir este post?')) {
                      onDelete(post.id);
                    }
                    setIsMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-[10px] font-black uppercase text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="w-3 h-3" />
                  Excluir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-black text-slate-800 leading-tight uppercase tracking-tight">{post.title}</h3>
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 font-medium">
            {highlightedDescription}
          </p>
        </div>

        {/* TRATATIVA — COMPACTA E ORIENTADA À AÇÃO */}
        <div className="mt-4 pt-4 border-t border-slate-50 flex flex-col gap-4">
          {treatment ? (
            <div 
              className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-1.5"
            >
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acompanhamento interno</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${treatment.status === 'Concluída' ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'}`} />
                  <p className="text-[10px] font-bold text-slate-700">
                    {treatment.responsible} • {treatment.status} • {format(parseISO(treatment.deadline), 'dd/MM')}
                  </p>
                </div>
                <button 
                  onClick={() => setIsTreatmentOpen(true)}
                  className="text-[10px] font-black text-indigo-600 hover:underline uppercase"
                >
                  Editar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
               <span className="text-[10px] font-bold text-slate-400 italic">Sem acompanhamento interno registrado</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button 
                onClick={() => {
                  onUpdate({ ...post, status: 'Em análise' });
                  alert('Status atualizado para Em Análise. Iniciando tratativa operacional...');
                }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-sm"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Agir
              </button>
              
              <button 
                onClick={() => setIsTreatmentOpen(true)}
                className="px-4 py-2 bg-[#003DA5] text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-blue-800 transition-all flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Abrir Tratativa
              </button>

              <button 
                onClick={() => {
                  const theme = post.caseId || post.title.split(' ')[0] || post.title;
                  onOpenCase(theme);
                }}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                <Search className="w-3.5 h-3.5" />
                Ver Cases Relacionados
              </button>

              <button 
                onClick={() => onCreateCase(post)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Vincular Reincidência
              </button>
            </div>

            <button 
              onClick={() => setIsCommenting(!isCommenting)}
              className="px-3 py-2 text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1.5 group/comments"
            >
              <div className="flex -space-x-2 mr-1">
                {post.comments.slice(0, 2).map((c, i) => (
                  <div key={i} className="w-5 h-5 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[7px] font-black text-slate-400 uppercase">
                    {c.userName.substring(0, 1)}
                  </div>
                ))}
              </div>
              <span className="text-[10px] font-black uppercase">{post.comments.length}</span>
              <MessageCircle className="w-3.5 h-3.5 group-hover/comments:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Seção de Comentários */}
      {isCommenting && (
        <div className="p-5 bg-white border-t border-slate-100 rounded-b-2xl">
          <div className="space-y-4 mb-4">
            {post.comments.map(comment => (
              <div key={comment.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-[10px]">
                  {comment.userName.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-black text-slate-800 uppercase">{comment.userName}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">{format(new Date(comment.createdAt), "dd/MM HH:mm")}</p>
                  </div>
                  <p className="text-xs text-slate-600">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Escreva um comentário..."
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && commentText.trim()) {
                  const newComment: MuralComment = {
                    id: crypto.randomUUID(),
                    userId: userName, 
                    userName: userName,
                    content: commentText.trim(),
                    createdAt: new Date().toISOString()
                  };
                  onUpdate({ ...post, comments: [...post.comments, newComment] });
                  setCommentText('');
                }
              }}
            />
            <button
              onClick={() => {
                if (commentText.trim()) {
                  const newComment: MuralComment = {
                    id: crypto.randomUUID(),
                    userId: userName,
                    userName: userName,
                    content: commentText.trim(),
                    createdAt: new Date().toISOString()
                  };
                  onUpdate({ ...post, comments: [...post.comments, newComment] });
                  setCommentText('');
                }
              }}
              disabled={!commentText.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* Modal de Tratativa */}
      {isTreatmentOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-indigo-600 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-6 h-6" />
                <div>
                  <h3 className="font-black uppercase text-lg tracking-tight">
                    {treatment ? 'Editar Tratativa' : 'Novo Workflow de Tratativa'}
                  </h3>
                  <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Origem: {post.title}</p>
                </div>
              </div>
              <button onClick={() => setIsTreatmentOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Título da Tratativa</label>
                  <input 
                    type="text" 
                    value={treatmentData.title}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Descrição / Escopo</label>
                  <textarea 
                    value={treatmentData.description}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Responsável</label>
                  <input 
                    type="text" 
                    placeholder="Nome do responsável"
                    value={treatmentData.responsible}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, responsible: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {smartSuggestion.responsible && (
                    <p className="text-[9px] font-bold text-blue-600 mt-1 uppercase">Responsável sugerido: {smartSuggestion.responsible}</p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Prioridade</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={treatmentData.priority}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, priority: e.target.value as any }))}
                  >
                    <option value="Informativo">Informativo</option>
                    <option value="Atenção">Atenção</option>
                    <option value="Ação necessária">Ação necessária</option>
                    <option value="Crítico">Crítico</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Status</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={treatmentData.status}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, status: e.target.value as any }))}
                  >
                    <option value="Aberta">Aberta</option>
                    <option value="Aguardando Sovos">Aguardando Sovos</option>
                    <option value="Em acompanhamento">Em acompanhamento</option>
                    <option value="Em validação interna">Em validação interna</option>
                    <option value="Concluída">Concluída</option>
                    <option value="Cancelada">Cancelada</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Prazo Sugerido</label>
                  <input 
                    type="date" 
                    value={treatmentData.deadline}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, deadline: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Case Relacionado</label>
                  <input 
                    type="text" 
                    value={treatmentData.case_numero}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, case_numero: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Observações Internas</label>
                  <textarea 
                    value={treatmentData.observacoes_internas}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, observacoes_internas: e.target.value }))}
                    rows={2}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-6 border-t border-slate-100">
                <button 
                  onClick={() => {
                    if (confirm('Tem certeza que deseja excluir esta tratativa?')) {
                      onDeleteTreatment(treatment!.id);
                      setIsTreatmentOpen(false);
                    }
                  }}
                  className={`px-4 py-3 border-2 border-red-50 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-2xl transition-all ${!treatment && 'hidden'}`}
                  title="Excluir Tratativa"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                
                <div className="flex-1 flex gap-3">
                  <button 
                    onClick={() => setIsTreatmentOpen(false)}
                    className="flex-1 py-3 border-2 border-slate-100 text-slate-400 font-black uppercase text-[10px] rounded-2xl hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                  
                  {treatment && treatment.status !== 'Concluída' && (
                    <button 
                      onClick={() => {
                        onUpdateTreatment({ ...treatment, status: 'Concluída', encerrado_em: new Date().toISOString() });
                        setIsTreatmentOpen(false);
                      }}
                      className="flex-1 py-3 bg-emerald-600 text-white font-black uppercase text-[10px] rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all"
                    >
                      Concluir
                    </button>
                  )}

                  <button 
                    onClick={handleSaveTreatment}
                    className="flex-1 py-3 bg-[#003DA5] text-white font-black uppercase text-[10px] rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-800 transition-all"
                  >
                    {treatment ? 'Salvar' : 'Iniciar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Mural;
