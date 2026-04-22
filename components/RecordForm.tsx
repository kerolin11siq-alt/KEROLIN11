
import React, { useState, useEffect } from 'react';
import { X, Save, ClipboardList, User as UserIcon, Users, Calendar, AlertCircle, CheckCircle2, MessageSquare, StickyNote, Link2, CalendarCheck, CalendarDays, AlertTriangle, Info, Search, Loader2, ArrowRight, ShieldCheck, Plus } from 'lucide-react';
import { TicketRecord, TicketStatus, TicketType, KnowledgeBase, CaseKnowledge, MuralPost, User } from '../types';
import { aiManager, AIPriority } from '../src/services/aiManager';
import { performSearch, prioritizeResults } from '../src/services/searchService';
import { getSmartSuggestions, getAiClassification } from '../src/services/analyticsService';

interface RecordFormProps {
  onSubmit: (record: Omit<TicketRecord, 'id'>) => void;
  onClose: () => void;
  initialData?: Partial<TicketRecord>;
  records: TicketRecord[];
  kb: KnowledgeBase;
  users: User[];
  defaultUser?: string;
  muralPosts?: MuralPost[];
}

const RecordForm: React.FC<RecordFormProps> = ({ onSubmit, onClose, initialData, records, kb, users, defaultUser, muralPosts = [] }) => {
  const getLocalDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const [formData, setFormData] = useState({
    caseId: '',
    type: 'PRODUÇÃO' as TicketType,
    previousCaseId: '',
    openingDate: getLocalDateString(),
    returnDate: '',
    conclusionDate: '',
    user: '',
    externalUser: defaultUser || '',
    subject: '',
    description: '',
    scenarios: '',
    observations: '',
    status: 'ABERTO' as TicketStatus,
    creatorUser: defaultUser || '',
    createdAt: new Date().toISOString(),
    origin: 'manual' as 'manual' | 'mural' | 'workflow' | 'import',
    muralPostId: undefined as string | undefined
  });

  const [similarRecords, setSimilarRecords] = useState<(TicketRecord & { score: number; reason: string; layer: number })[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isAiChecking, setIsAiChecking] = useState(false);
  const [isAiClassifying, setIsAiClassifying] = useState(false);
  const [smartSuggestions, setSmartSuggestions] = useState<any>(null);
  const [aiClassification, setAiClassification] = useState<{ 
    category: string; 
    confidence: 'Alta' | 'Média' | 'Baixa'; 
    reasoning: string;
    similarExamples: string[];
  } | null>(null);

  const [userSearch, setUserSearch] = useState('');
  const [showUserList, setShowUserList] = useState(false);
  const [externalUserSearch, setExternalUserSearch] = useState('');
  const [showExternalUserList, setShowExternalUserList] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        caseId: initialData.caseId || '',
        type: initialData.type || 'PRODUÇÃO',
        previousCaseId: initialData.previousCaseId || '',
        openingDate: initialData.openingDate || getLocalDateString(),
        returnDate: initialData.returnDate || '',
        conclusionDate: initialData.conclusionDate || '',
        user: initialData.user || '',
        externalUser: initialData.externalUser || '',
        subject: initialData.subject || '',
        description: initialData.description || '',
        scenarios: initialData.scenarios || '',
        observations: initialData.observations || '',
        status: initialData.status || 'ABERTO',
        creatorUser: initialData.creatorUser || defaultUser || '',
        createdAt: initialData.createdAt || new Date().toISOString(),
        origin: initialData.origin || 'manual',
        muralPostId: initialData.muralPostId
      });
    }
  }, [initialData, defaultUser]);

  // Debounced similarity and smart suggestions check
  useEffect(() => {
    const timer = setTimeout(() => {
      const textToAnalyze = formData.description || formData.subject;
      if (textToAnalyze.length > 5) {
        const suggestions = getSmartSuggestions(textToAnalyze, records, muralPosts);
        setSmartSuggestions(suggestions);
        
        // Auto-atribuição sincronizada se o assunto estiver vazio ou for muito curto
        if (suggestions?.suggestedCategory && (!formData.subject || formData.subject.length < 5)) {
          setFormData(prev => ({ ...prev, subject: suggestions.suggestedCategory }));
        }
        
        if (textToAnalyze.length > 15 || formData.scenarios.length > 15) {
          runAdvancedCheck();
          runAiClassification();
        }
      } else {
        setSmartSuggestions(null);
        setSimilarRecords([]);
        setAiClassification(null);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [formData.description, formData.subject, formData.scenarios, formData.caseId]);

  const normalize = (text: string) => {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  };

  const getClassification = (score: number, layer: number) => {
    if (score >= 95 && layer === 1) return 'DUPLICIDADE_EXATA';
    if (score >= 80) return 'DUPLICIDADE_FORTE';
    if (score >= 50) return 'DUPLICIDADE_PARCIAL';
    if (score >= 20) return 'ALERTA_SEMANTICO';
    return 'SEM_INDICIO';
  };

  const runAdvancedCheck = async () => {
    setIsChecking(true);
    
    // 1. Local Check (Fast)
    const localResults = checkSimilarityLocal();
    setSimilarRecords(localResults);

    // 2. AI Check (Semantic)
    if (formData.description.length > 20) {
      setIsAiChecking(true);
      try {
        const extractionPrompt = `
          Você é o motor de Detecção de Duplicidade da SOVOS.
          Extraia as entidades técnicas deste chamado para verificação de duplicidade.
          Descrição: "${formData.description}"
          Cenários: "${formData.scenarios}"
          
          Retorne APENAS um JSON:
          {
            "assunto": "...",
            "produto": "...",
            "ncm": "...",
            "ean": "...",
            "principio_ativo": "...",
            "uf": "...",
            "contexto_fiscal": "...",
            "palavras_chave": ["..."]
          }
        `;

        const entities = await aiManager.request('duplicate_check', extractionPrompt, AIPriority.HIGH);
        
        if (entities) {
          const aiSearchResults = performSearch(entities, records, kb);
          const prioritized = prioritizeResults(aiSearchResults, entities.uf, entities);
          
          // Merge results
          setSimilarRecords(prev => {
            const merged = [...prev];
            prioritized.forEach(aiRec => {
              if (!merged.find(m => m.caseId === aiRec.caseId)) {
                merged.push({
                  ...aiRec,
                  score: aiRec.layer === 1 ? 95 : aiRec.layer === 2 ? 80 : 50,
                  reason: aiRec.matchReason || 'Similaridade Semântica (IA)',
                  layer: aiRec.layer
                });
              }
            });
            return merged.sort((a, b) => b.score - a.score).slice(0, 3);
          });
        }
      } catch (e) {
        console.error("AI Duplicity check failed:", e);
      } finally {
        setIsAiChecking(false);
      }
    }
    
    setIsChecking(false);
  };

  const runAiClassification = async () => {
    const text = formData.description || formData.subject;
    if (text.length < 15) return;

    setIsAiClassifying(true);
    try {
      const result = await getAiClassification(
        text,
        formData.scenarios,
        formData.observations,
        records
      );
      setAiClassification(result);

      // Auto-atribuição Inteligente (Apenas se confiança for Alta e usuário não tiver definido algo robusto)
      if (result && result.confidence === 'Alta' && (!formData.subject || formData.subject.length < 10)) {
        setFormData(prev => ({ ...prev, subject: result.category }));
      }
    } catch (e) {
      console.error("AI Classification error:", e);
    } finally {
      setIsAiClassifying(false);
    }
  };

  const checkSimilarityLocal = () => {
    const results: (TicketRecord & { score: number; reason: string; layer: number })[] = [];
    
    const currentDesc = normalize(formData.description);
    const currentSubject = normalize(formData.subject);
    const currentScenarios = normalize(formData.scenarios);
    const currentObs = normalize(formData.observations);
    const fullText = `${currentDesc} ${currentSubject} ${currentScenarios} ${currentObs}`;

    // Regex for codes
    const eanRegex = /\b\d{13}\b/g;
    const ncmRegex = /\b\d{4}\.\d{2}\.\d{2}\b|\b\d{8}\b/g;
    const cestRegex = /\b\d{2}\.\d{3}\.\d{2}\b|\b\d{7}\b/g;

    const currentEans = Array.from(fullText.matchAll(eanRegex)).map(m => m[0]);
    const currentNcms = Array.from(fullText.matchAll(ncmRegex)).map(m => m[0]);
    const currentCests = Array.from(fullText.matchAll(cestRegex)).map(m => m[0]);

    // UF extraction
    const ufs = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
    const currentUf = ufs.find(uf => fullText.toUpperCase().includes(` ${uf} `) || fullText.toUpperCase().includes(`-${uf}`) || fullText.toUpperCase().includes(`${uf}-`));

    records.forEach(record => {
      if (record.id === initialData?.id) return;
      if (record.caseId === formData.caseId) return;

      const enriched = kb.entries[record.caseId];
      const rDesc = normalize(record.description || '');
      const rSubject = normalize(record.subject || '');
      const rScenarios = normalize(record.scenarios || '');
      const rObs = normalize(record.observations || '');
      const rFullText = `${rDesc} ${rSubject} ${rScenarios} ${rObs}`;
      const rFullTextUpper = `${record.description} ${record.subject || ''} ${record.scenarios} ${record.observations}`.toUpperCase();

      let score = 0;
      let reasons: string[] = [];
      let layer = 3;

      // 1. EAN/GTIN (Exact)
      currentEans.forEach(ean => {
        if (rFullText.includes(ean) || (enriched?.layers.technical.ean === ean)) {
          score += 100;
          layer = 1;
          reasons.push(`EAN/GTIN idêntico (${ean})`);
        }
      });

      // 2. NCM (Exact)
      currentNcms.forEach(ncm => {
        if (rFullText.includes(ncm) || (enriched?.layers.technical.ncm === ncm)) {
          score += 60;
          if (layer > 1) layer = 1;
          reasons.push(`NCM idêntico (${ncm})`);
        }
      });

      // 3. CEST (Exact)
      currentCests.forEach(cest => {
        if (rFullText.includes(cest) || (enriched?.layers.technical.cest === cest)) {
          score += 60;
          if (layer > 1) layer = 1;
          reasons.push(`CEST idêntico (${cest})`);
        }
      });

      // 4. Princípio Ativo + UF
      if (enriched?.layers.technical.principle && fullText.includes(normalize(enriched.layers.technical.principle))) {
        score += 50;
        layer = 2;
        if (currentUf && (enriched.layers.identity.uf === currentUf || rFullTextUpper.includes(currentUf))) {
          score += 50;
          reasons.push(`Mesmo Princípio Ativo (${enriched.layers.technical.principle}) na mesma UF (${currentUf})`);
        } else {
          reasons.push(`Mesmo Princípio Ativo (${enriched.layers.technical.principle})`);
        }
      }

      // 5. Produto
      if (enriched?.layers.technical.product && fullText.includes(normalize(enriched.layers.technical.product))) {
        score += 40;
        if (layer > 2) layer = 2;
        reasons.push(`Produto semelhante (${enriched.layers.technical.product})`);
      }

      // 6. Similaridade de texto
      const words1 = new Set(currentDesc.split(/\s+/).filter(w => w.length > 3));
      const words2 = new Set(rDesc.split(/\s+/).filter(w => w.length > 3));
      const intersection = new Set([...words1].filter(x => words2.has(x)));
      const similarity = intersection.size / Math.max(words1.size, words2.size, 1);

      if (similarity > 0.6) {
        score += 80;
        layer = 2;
        reasons.push('Descrição muito semelhante');
      } else if (similarity > 0.3) {
        score += 30;
        layer = 3;
        reasons.push('Assunto semelhante');
      }

      // 7. Contexto Fiscal (from KB)
      if (enriched?.layers.fiscal.theme && fullText.includes(normalize(enriched.layers.fiscal.theme))) {
        score += 20;
        reasons.push(`Mesmo tema fiscal (${enriched.layers.fiscal.theme})`);
      }

      if (score >= 30) {
        results.push({ ...record, score, reason: reasons.join(', '), layer });
      }
    });

    return results.sort((a, b) => b.score - a.score).slice(0, 3);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Se concluir e não tiver data, assume hoje
    if (formData.status === 'CONCLUIDO' && !formData.conclusionDate) {
       formData.conclusionDate = getLocalDateString();
    }
    
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-[#003DA5]/80 backdrop-blur-md flex items-center justify-center p-4 z-[60] animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden border-[8px] border-white">
        <div className="bg-[#D91B2A] text-white px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-2 rounded-xl">
               <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight">Registro de Chamado SO</h2>
              <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">FSJ Acompanhamento de Cases Sovos | Cadastro Inteligente Ativo</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row h-full max-h-[80vh] overflow-hidden">
          {/* Formulário Principal */}
          <form onSubmit={handleSubmit} className="flex-grow p-8 space-y-6 overflow-y-auto custom-scrollbar border-r border-gray-100">
            
            {/* Alertas de Similaridade */}
            {(isChecking || similarRecords.length > 0) && (
              <div className={`p-8 rounded-[2rem] border-2 transition-all animate-in slide-in-from-top-4 duration-500 shadow-sm ${similarRecords.some(r => r.score >= 80) ? 'bg-red-50/50 border-red-200' : 'bg-amber-50/50 border-amber-200'}`}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    {similarRecords.some(r => r.score >= 80) ? (
                      <div className="bg-[#D91B2A] p-2.5 rounded-2xl shadow-lg shadow-red-900/20">
                        <AlertTriangle className="w-6 h-6 text-white" />
                      </div>
                    ) : (
                      <div className="bg-amber-500 p-2.5 rounded-2xl shadow-lg shadow-amber-900/20">
                        <Info className="w-6 h-6 text-white" />
                      </div>
                    )}
                    <div>
                      <h3 className={`text-lg font-black uppercase tracking-tight ${similarRecords.some(r => r.score >= 80) ? 'text-[#D91B2A]' : 'text-amber-800'}`}>
                        🔎 Verificação de duplicidade
                      </h3>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mt-1 italic">📌 Resumo da análise: {isChecking ? (isAiChecking ? 'Análise Semântica em curso...' : 'Analisando similaridade...') : similarRecords.some(r => r.score >= 80) ? 'Foram encontrados cases com alta aderência' : 'Precedentes Localizados'}</p>
                    </div>
                  </div>
                  {(isChecking || isAiChecking) && <Loader2 className="w-6 h-6 text-[#003DA5] animate-spin" />}
                </div>

                {!isChecking && !isAiChecking && similarRecords.length > 0 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-black text-gray-900 uppercase tracking-widest">📂 Cases semelhantes</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {similarRecords.map((record) => {
                        const enriched = kb.entries[record.caseId];
                        const classification = getClassification(record.score, record.layer);
                        return (
                          <div key={record.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-all group">
                            <div className="flex-grow">
                              <div className="flex items-center gap-3 mb-3">
                                <span className="text-xs font-black text-[#003DA5] uppercase tracking-tight">Case #{record.caseId}</span>
                                <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider ${
                                  record.status === 'ABERTO' ? 'bg-blue-100 text-blue-700' : 
                                  record.status === 'DEVOLVIDO' ? 'bg-orange-100 text-orange-700' : 
                                  'bg-emerald-100 text-emerald-700'
                                }`}>{record.status}</span>
                                <div className="h-1 w-1 bg-gray-300 rounded-full" />
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${
                                  classification === 'DUPLICIDADE_EXATA' ? 'bg-red-600 text-white border-red-700' :
                                  classification === 'DUPLICIDADE_FORTE' ? 'bg-red-100 text-red-700 border-red-200' :
                                  classification === 'DUPLICIDADE_PARCIAL' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                  'bg-blue-50 text-blue-700 border-blue-100'
                                }`}>{classification}</span>
                                <div className="h-1 w-1 bg-gray-300 rounded-full" />
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{record.score}% Aderência</span>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                                <div>
                                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Produto</p>
                                  <p className="text-[10px] font-bold text-gray-700 truncate">{enriched?.layers.technical.product || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">NCM</p>
                                  <p className="text-[10px] font-bold text-gray-700">{enriched?.layers.technical.ncm || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">UF</p>
                                  <p className="text-[10px] font-bold text-gray-700">{enriched?.layers.identity.uf || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-[8px] font-black text-[#D91B2A] uppercase tracking-widest mb-0.5">Motivo</p>
                                  <p className="text-[10px] font-bold text-gray-600 truncate">{record.reason}</p>
                                </div>
                              </div>
                              {enriched?.layers.fiscal.legalBase && (
                                <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                                  <p className="text-[8px] font-black text-emerald-700 uppercase tracking-widest mb-0.5">Base Legal / Referência</p>
                                  <p className="text-[10px] font-bold text-emerald-900 line-clamp-2">{enriched.layers.fiscal.legalBase}</p>
                                </div>
                              )}
                              <p className="text-[11px] font-bold text-gray-500 line-clamp-1 italic border-t border-gray-50 pt-2">"{record.description}"</p>
                            </div>
                            <div className="shrink-0 flex flex-col gap-2">
                               <button type="button" onClick={() => window.open(`${window.location.origin}/?case=${record.caseId}`, '_blank')} className="px-5 py-2.5 bg-gray-50 border border-gray-200 text-[10px] font-black uppercase text-[#003DA5] rounded-xl hover:bg-blue-50 transition-all flex items-center gap-2">
                                 Consultar Case <ArrowRight className="w-3 h-3" />
                               </button>
                               {!formData.previousCaseId && (
                                 <button 
                                   type="button" 
                                   onClick={() => setFormData(prev => ({ ...prev, previousCaseId: record.caseId }))}
                                   className="px-5 py-2.5 bg-orange-50 border border-orange-200 text-[10px] font-black uppercase text-orange-700 rounded-xl hover:bg-orange-100 transition-all flex items-center gap-2"
                                 >
                                   Vincular <Link2 className="w-3 h-3" />
                                 </button>
                               )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className={`p-5 rounded-2xl border-l-[6px] shadow-sm ${similarRecords.some(r => r.score >= 80) ? 'bg-red-100/30 border-[#D91B2A]' : 'bg-amber-100/30 border-amber-500'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-black text-gray-900 uppercase tracking-widest">⚠ Alerta operacional</span>
                      </div>
                      <p className="text-[12px] font-bold text-gray-700 leading-relaxed mb-4">
                        {similarRecords.some(r => r.score >= 80) 
                          ? 'Foram encontrados precedentes com alta similaridade técnica. Verifique o histórico antes de prosseguir para evitar duplicidade.' 
                          : 'Existem precedentes que podem auxiliar na análise técnica deste chamado. Consulte os cases listados acima.'}
                      </p>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-black text-gray-900 uppercase tracking-widest">➡ Recomendação</span>
                      </div>
                      <p className="text-[12px] font-bold text-gray-700 leading-relaxed">
                        {similarRecords.some(r => r.score >= 80) 
                          ? 'Consultar os cases indicados antes da efetivação para reduzir retrabalho e garantir consistência fiscal.' 
                          : 'Aproveitar o conhecimento dos cases semelhantes para agilizar o parecer técnico.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-950 uppercase mb-1 tracking-widest">ID Chamado (CASE)</label>
                <input required value={formData.caseId} onChange={e => setFormData({...formData, caseId: e.target.value})} className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl font-black text-[#003DA5] outline-none focus:border-[#003DA5] transition-all placeholder-gray-500" placeholder="Ex: 4790..." />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-950 uppercase mb-1 tracking-widest flex items-center gap-2">
                  <Link2 className="w-3 h-3 text-red-600" /> Case Anterior
                </label>
                <input value={formData.previousCaseId} onChange={e => setFormData({...formData, previousCaseId: e.target.value})} className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl font-black text-gray-600 outline-none focus:border-red-500 transition-all italic placeholder-gray-400" placeholder="ID Origem" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-950 uppercase mb-1 tracking-widest">Tipo</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as TicketType})} className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl font-black text-xs text-gray-900 outline-none focus:border-[#003DA5]">
                  <option value="PRODUÇÃO">PRODUÇÃO</option>
                  <option value="PROJETO">PROJETO</option>
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="block text-[10px] font-black text-gray-950 uppercase mb-1 tracking-widest">Status</label>
                <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as TicketStatus})} className={`w-full px-4 py-3 border-2 rounded-2xl font-black text-xs outline-none transition-all ${formData.status === 'DEVOLVIDO' ? 'border-amber-400 bg-amber-50 text-amber-950' : formData.status === 'CONCLUIDO' ? 'border-emerald-400 bg-emerald-50 text-emerald-950' : 'border-gray-200 text-gray-900 focus:border-[#003DA5]'}`}>
                  <option value="ABERTO">ABERTO</option>
                  <option value="DEVOLVIDO">DEVOLVIDO</option>
                  <option value="CONCLUIDO">RESOLVIDO</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl border-2 border-blue-50 bg-blue-50/20">
                <label className="block text-[10px] font-black text-[#003DA5] uppercase mb-2 tracking-widest flex items-center gap-2">
                  <Calendar className="w-3 h-3" /> Data Abertura
                </label>
                <input type="date" value={formData.openingDate} onChange={e => setFormData({...formData, openingDate: e.target.value})} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-xs outline-none focus:border-[#003DA5]" />
              </div>
              
              <div className="p-4 rounded-2xl border-2 border-amber-100 bg-amber-50/20">
                <label className="block text-[10px] font-black text-amber-700 uppercase mb-2 tracking-widest flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5" /> Data de Retorno
                </label>
                <input 
                  type="date" 
                  value={formData.returnDate} 
                  onChange={e => setFormData({...formData, returnDate: e.target.value})} 
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-xs outline-none focus:border-amber-500" 
                />
              </div>

              <div className="p-4 rounded-2xl border-2 border-emerald-100 bg-emerald-50/20">
                <label className="block text-[10px] font-black text-emerald-700 uppercase mb-2 tracking-widest flex items-center gap-2">
                  <CalendarCheck className="w-3.5 h-3.5" /> Data de Conclusão
                </label>
                <input 
                  type="date" 
                  value={formData.conclusionDate} 
                  onChange={e => setFormData({...formData, conclusionDate: e.target.value})} 
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-xs outline-none focus:border-emerald-500" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-[10px] font-black text-gray-950 uppercase mb-1 tracking-widest">Analista Sovos</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    required 
                    value={formData.user} 
                    onChange={e => {
                      setFormData({...formData, user: e.target.value});
                      setUserSearch(e.target.value);
                      setShowUserList(true);
                    }} 
                    onFocus={() => setShowUserList(true)}
                    onBlur={() => setTimeout(() => setShowUserList(false), 200)}
                    className="w-full pl-12 pr-5 py-3 border-2 border-gray-200 rounded-2xl font-bold text-sm text-black outline-none focus:border-[#003DA5] placeholder-gray-500" 
                    placeholder="Atendente Sovos" 
                  />
                  {showUserList && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                      {users
                        .filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()))
                        .map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setFormData({...formData, user: u.name});
                              setShowUserList(false);
                            }}
                            className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                          >
                            {u.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-950 uppercase mb-1 tracking-widest">FSJ (Solicitante)</label>
                <div className="relative">
                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    required 
                    value={formData.externalUser} 
                    onChange={e => {
                      setFormData({...formData, externalUser: e.target.value});
                      setExternalUserSearch(e.target.value);
                      setShowExternalUserList(true);
                    }} 
                    onFocus={() => setShowExternalUserList(true)}
                    onBlur={() => setTimeout(() => setShowExternalUserList(false), 200)}
                    className="w-full pl-12 pr-5 py-3 border-2 border-gray-200 rounded-2xl font-bold text-sm text-black outline-none focus:border-[#003DA5] placeholder-gray-500" 
                    placeholder="Analista FSJ" 
                  />
                  {showExternalUserList && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                      {users
                        .filter(u => u.name.toLowerCase().includes(externalUserSearch.toLowerCase()))
                        .map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setFormData({...formData, externalUser: u.name});
                              setShowExternalUserList(false);
                            }}
                            className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                          >
                            {u.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">Usuário Criador</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                  <input readOnly value={formData.creatorUser} className="w-full pl-12 pr-5 py-3 border-2 border-gray-100 bg-gray-50 rounded-2xl font-bold text-sm text-gray-400 outline-none cursor-not-allowed" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-[10px] font-black text-gray-950 uppercase mb-1 tracking-widest">
                  <AlertCircle className="w-3 h-3 text-[#003DA5]" /> Assunto / Erro Relacionado
                </label>
                <input value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} className="w-full px-5 py-3 border-2 border-gray-200 rounded-2xl font-bold text-sm text-black outline-none focus:border-[#003DA5] placeholder-gray-500" placeholder="Título ou resumo curto do erro..." />
              </div>
              <div>
                <label className="flex items-center gap-2 text-[10px] font-black text-gray-950 uppercase mb-1 tracking-widest">
                  <AlertCircle className="w-3 h-3 text-red-700" /> Descrição Erro Regra
                </label>
                <textarea rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-5 py-3 border-2 border-gray-200 rounded-2xl font-bold text-sm text-black resize-none outline-none focus:border-[#003DA5] placeholder-gray-500" placeholder="Explique o erro técnico..." />
                
                {/* Sugestão de Categoria em tempo real */}
                {smartSuggestions?.suggestedCategory && (
                   <div className="mt-2 flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Sugestão de Categoria:</span>
                     <button 
                       type="button"
                       onClick={() => setFormData(prev => ({ ...prev, subject: smartSuggestions.suggestedCategory }))}
                       className="px-3 py-1 bg-blue-50 text-[#003DA5] text-[10px] font-black rounded-lg border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-2"
                     >
                       {smartSuggestions.suggestedCategory} <Plus className="w-3 h-3" />
                     </button>
                   </div>
                )}
              </div>
              <div>
                <label className="flex items-center gap-2 text-[10px] font-black text-gray-950 uppercase mb-1 tracking-widest">
                  <MessageSquare className="w-3 h-3 text-blue-700" /> Cenários de Teste
                </label>
                <textarea rows={2} value={formData.scenarios} onChange={e => setFormData({...formData, scenarios: e.target.value})} className="w-full px-5 py-3 border-2 border-gray-200 rounded-2xl font-bold text-sm text-black resize-none outline-none focus:border-[#003DA5] placeholder-gray-500" placeholder="Quais cenários foram testados?" />
                
                {/* Sugestão de Cenário */}
                {smartSuggestions?.suggestedScenario && (
                   <div className="mt-2 flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Cenário provável:</span>
                     <button 
                       type="button"
                       onClick={() => setFormData(prev => ({ ...prev, scenarios: smartSuggestions.suggestedScenario }))}
                       className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-lg border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center gap-2"
                     >
                       {smartSuggestions.suggestedScenario} <Plus className="w-3 h-3" />
                     </button>
                   </div>
                )}
              </div>
              <div>
                <label className="flex items-center gap-2 text-[10px] font-black text-gray-950 uppercase mb-1 tracking-widest">
                  <StickyNote className="w-3 h-3 text-gray-700" /> Observações Adicionais
                </label>
                <textarea rows={2} value={formData.observations} onChange={e => setFormData({...formData, observations: e.target.value})} className="w-full px-5 py-3 border-2 border-gray-200 rounded-2xl font-bold text-sm text-black resize-none outline-none focus:border-[#003DA5] placeholder-gray-500" placeholder="Notas extras..." />
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-gray-100">
              {defaultUser && (
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-xl border border-blue-100">
                  <UserIcon className="w-3.5 h-3.5 text-[#003DA5]" />
                  <span className="text-[10px] font-black text-[#003DA5] uppercase tracking-widest">Identificado como: {defaultUser}</span>
                </div>
              )}
              <div className="flex gap-4 w-full md:w-auto flex-grow">
                <button type="button" onClick={onClose} className="flex-1 py-4 bg-gray-100 text-gray-600 font-black uppercase text-xs rounded-2xl hover:bg-gray-200 transition-colors">Cancelar</button>
                <button type="submit" className="flex-[2] py-4 bg-[#003DA5] text-white font-black uppercase text-xs rounded-2xl shadow-xl hover:bg-blue-800 flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02]">
                  <Save className="w-4 h-4" /> Efetivar Registro Sovos
                </button>
              </div>
            </div>
          </form>

          {/* Painel de Apoio ao Cadastro (Fase 2) */}
          <div className="w-full lg:w-80 bg-gray-50 p-6 overflow-y-auto custom-scrollbar animate-in slide-in-from-right-4 duration-500">
            <div className="flex items-center gap-2 mb-6">
              <div className="bg-[#003DA5] p-1.5 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-tight text-gray-900">Apoio ao Cadastro</h3>
            </div>

            {!smartSuggestions ? (
              <div className="flex flex-col items-center justify-center h-64 text-center space-y-4 opacity-40">
                <Search className="w-8 h-8 text-gray-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Digite a descrição para ativar a inteligência assistida</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Sugestão de Reincidência */}
                {smartSuggestions.reincidenceCandidate && !formData.previousCaseId && (
                  <div className="p-4 bg-orange-50 border-2 border-orange-200 rounded-2xl animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center gap-2 mb-2">
                      <Link2 className="w-4 h-4 text-orange-600" />
                      <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Possível reincidência identificada</span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-orange-100 mb-3">
                      <p className="text-[10px] font-black text-[#003DA5] mb-0.5">Case #{smartSuggestions.reincidenceCandidate.caseId}</p>
                      <p className="text-[10px] font-bold text-gray-700 truncate">{smartSuggestions.reincidenceCandidate.subject || 'Sem assunto'}</p>
                      <p className="text-[8px] font-bold text-gray-400 uppercase mt-1">
                        {new Date(smartSuggestions.reincidenceCandidate.openingDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, previousCaseId: smartSuggestions.reincidenceCandidate.caseId }))}
                      className="w-full py-2 bg-orange-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-orange-700 transition-all flex items-center justify-center gap-2"
                    >
                      Vincular como case anterior <Plus className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Alerta de Duplicidade Aberta */}
                {smartSuggestions.hasOpenSimilar && (
                  <div className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl animate-pulse">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-[#D91B2A]" />
                      <span className="text-[10px] font-black text-[#D91B2A] uppercase tracking-widest">Duplicidade em Aberto</span>
                    </div>
                    <p className="text-[11px] font-bold text-gray-700 mb-2">Já existe um case semelhante em aberto:</p>
                    <div className="bg-white p-3 rounded-xl border border-red-100">
                      <p className="text-[10px] font-black text-[#003DA5] mb-1">Case #{smartSuggestions.openSimilarCase.caseId}</p>
                      <p className="text-[9px] font-bold text-gray-500 uppercase">{smartSuggestions.openSimilarCase.status} | {smartSuggestions.openSimilarCase.user}</p>
                    </div>
                  </div>
                )}

                {/* Resumo Inteligente */}
                <div className="space-y-4">
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Categoria Sugerida</p>
                    <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm">
                      <p className="text-[11px] font-black text-[#003DA5]">{smartSuggestions.suggestedCategory}</p>
                    </div>
                  </div>

                  {/* Classificação Inteligente por IA (Fase 4) */}
                  {isAiClassifying ? (
                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-center gap-3">
                      <Loader2 className="w-4 h-4 text-[#003DA5] animate-spin" />
                      <span className="text-[10px] font-black text-[#003DA5] uppercase tracking-widest">IA analisando contexto...</span>
                    </div>
                  ) : aiClassification && (
                    <div className="p-4 bg-indigo-50 border-2 border-indigo-100 rounded-2xl animate-in zoom-in-95 duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-indigo-600" />
                          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Sugestão da IA</span>
                        </div>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase ${
                          aiClassification.confidence === 'Alta' ? 'bg-emerald-100 text-emerald-700' :
                          aiClassification.confidence === 'Média' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          Confiança {aiClassification.confidence}
                        </span>
                      </div>
                      
                      <div className="bg-white p-3 rounded-xl border border-indigo-50 mb-3">
                        <p className="text-[11px] font-black text-indigo-900 mb-1">{aiClassification.category}</p>
                        <p className="text-[9px] font-bold text-gray-500 leading-tight">{aiClassification.reasoning}</p>
                      </div>

                      <button 
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, subject: aiClassification.category }))}
                        className="w-full py-2 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                      >
                        Aplicar Sugestão IA <ArrowRight className="w-3 h-3" />
                      </button>

                      {aiClassification.similarExamples.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-indigo-100">
                          <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-1">Padrões Semelhantes</p>
                          <div className="flex flex-wrap gap-1">
                            {aiClassification.similarExamples.map((ex, i) => (
                              <span key={i} className="text-[8px] font-bold text-indigo-700 bg-indigo-100/50 px-2 py-0.5 rounded">
                                {ex}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm">
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Ocorrências</p>
                      <p className="text-lg font-black text-gray-900">{smartSuggestions.occurrenceCount}</p>
                    </div>
                    <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm">
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Últimos 7 dias</p>
                      <p className="text-lg font-black text-[#D91B2A]">{smartSuggestions.recentOccurrenceCount}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Criticidade Sugerida</p>
                    <div className={`p-3 border-2 rounded-xl flex items-center justify-between ${
                      smartSuggestions.suggestedCriticality === 'Crítica' ? 'bg-red-50 border-red-200 text-red-700' :
                      smartSuggestions.suggestedCriticality === 'Alta' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                      smartSuggestions.suggestedCriticality === 'Média' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                      'bg-emerald-50 border-emerald-200 text-emerald-700'
                    }`}>
                      <span className="text-[11px] font-black uppercase tracking-widest">{smartSuggestions.suggestedCriticality}</span>
                      <AlertCircle className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Alertas Ativos */}
                  {smartSuggestions.activeAlerts.length > 0 && (
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Alertas Relacionados</p>
                      <div className="space-y-2">
                        {smartSuggestions.activeAlerts.map((alert: any) => (
                          <div key={alert.id} className="p-2 bg-amber-50 border border-amber-100 rounded-lg flex items-start gap-2">
                            <AlertTriangle className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" />
                            <p className="text-[9px] font-bold text-amber-800">{alert.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assuntos Semelhantes */}
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Assuntos Semelhantes</p>
                    <div className="space-y-2">
                      {smartSuggestions.similarCases.map((s: any) => (
                        <div key={s.caseId} className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-blue-200 transition-all group cursor-help">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-black text-[#003DA5]">#{s.caseId}</span>
                            <span className="text-[8px] font-bold text-gray-400">{s.score}%</span>
                          </div>
                          <p className="text-[10px] font-bold text-gray-700 line-clamp-1 mb-1">{s.category}</p>
                          <div className="flex items-center justify-between">
                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded uppercase ${
                              s.status === 'ABERTO' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>{s.status}</span>
                            {s.isRecurrent && <span className="text-[7px] font-black text-[#D91B2A] uppercase">Reincidente</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordForm;
