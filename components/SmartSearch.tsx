
import React, { useState, useMemo } from 'react';
import { Search, Database, MessageSquare, ClipboardList, ChevronRight, AlertCircle, ArrowRight, ExternalLink, Filter, Bot, Plus, X, ArrowUpRight, ArrowDownRight, Minus, ShieldCheck } from 'lucide-react';
import { TicketRecord, KnowledgeBase, MuralPost, MuralTreatment } from '../types';
import { smartSearch, normalizeText, GroupedSearchResult, SmartSearchResult, SmartSearchResponse } from '../src/services/searchService';
import { getThemeTrend } from '../src/services/analyticsService';
import { subDays, parseISO, isAfter, isSameDay } from 'date-fns';

interface SmartSearchProps {
  records: TicketRecord[];
  muralPosts: MuralPost[];
  tratativas: MuralTreatment[];
  kb: KnowledgeBase;
  onOpenCase: (caseId: string) => void;
  onAddTreatment: (treatment: MuralTreatment) => void;
  userName: string;
}

const SmartSearch: React.FC<SmartSearchProps> = ({ records, muralPosts, tratativas, kb, onOpenCase, onAddTreatment, userName }) => {
  const [query, setQuery] = useState('');
  const [isTreatmentOpen, setIsTreatmentOpen] = useState(false);
  const [treatmentData, setTreatmentData] = useState<Partial<MuralTreatment>>({});
  const [showResults, setShowResults] = useState(false);
  
  const response = useMemo(() => {
    setShowResults(false); // Hide results when query changes
    return smartSearch(query, records, muralPosts, tratativas, kb);
  }, [query, records, muralPosts, tratativas, kb]);

  const intelligentResponse = response?.intelligentResponse;
  const results = response?.groupedResults || [];

  const themeTrend = useMemo(() => {
    if (!intelligentResponse || !intelligentResponse.theme) return null;
    
    // Comparar últimos 30 dias com os 30 anteriores para a busca
    const now = new Date();
    const period = 30;
    const start = subDays(now, period);
    const prevStart = subDays(start, period);
    const prevEnd = start;
    
    const currentRecords = records.filter(r => {
      const date = parseISO(r.openingDate);
      return isAfter(date, start) || isSameDay(date, start);
    });

    const prevRecords = records.filter(r => {
      const date = parseISO(r.openingDate);
      return (isAfter(date, prevStart) || isSameDay(date, prevStart)) && isAfter(prevEnd, date);
    });

    return getThemeTrend(intelligentResponse.theme, currentRecords, prevRecords);
  }, [intelligentResponse, records]);

  const handleOpenTreatment = () => {
    if (!intelligentResponse) return;
    
    // Auto-fill treatment data based on search context
    setTreatmentData({
      title: `Tratativa Sugerida: ${intelligentResponse.theme}`,
      description: `Ação necessária identificada via busca inteligente FSJ para o tema "${intelligentResponse.theme}". \n\nMotivo da sugestão: ${intelligentResponse.recommendation.message}`,
      priority: intelligentResponse.recommendation.priority === 'CRITICA' ? 'Crítico' : 
                intelligentResponse.recommendation.priority === 'ALTA' ? 'Ação necessária' : 
                intelligentResponse.recommendation.priority === 'MEDIA' ? 'Atenção' : 'Informativo',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
      status: 'Aberta' as any,
      responsible: intelligentResponse.suggestedResponsible || ""
    });
    setIsTreatmentOpen(true);
  };

  const handleSaveTreatment = () => {
    if (!treatmentData.title || !treatmentData.responsible || !treatmentData.deadline) {
      alert('Por favor, preencha os campos obrigatórios.');
      return;
    }

    const newTreatment: MuralTreatment = {
      id: crypto.randomUUID(),
      title: treatmentData.title || '',
      description: treatmentData.description || '',
      responsible: treatmentData.responsible || '',
      priority: (treatmentData.priority as any) || 'Informativo',
      deadline: treatmentData.deadline || '',
      status: 'Aberta',
      origin: 'search',
      usuario_criador: userName,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };

    onAddTreatment(newTreatment);
    setIsTreatmentOpen(false);
    alert('Tratativa criada com sucesso!');
  };

  const highlightText = (text: string, query: string) => {
    if (!query || !text) return text;
    const terms = normalizeText(query).split(' ').filter(t => t.length > 1);
    if (terms.length === 0) return text;

    // Create a regex that matches any of the terms
    const pattern = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${pattern})`, 'gi');
    
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) => 
          regex.test(part) ? 
            <mark key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">{part}</mark> : 
            part
        )}
      </span>
    );
  };

  const suggestions = [
    'Diferimento RS',
    'PMPF Medicamentos',
    'Alíquota interestadual',
    'Substituição Tributária',
    'Erro de regra de cálculo'
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header da Busca */}
      <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-blue-900/5 border border-blue-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#003DA5]/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        
        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-[#003DA5] rounded-full text-[10px] font-black uppercase tracking-widest mb-2">
            <Search className="w-3 h-3" />
            Motor de Busca Inteligente FSJ
          </div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tighter leading-none">
            O que você deseja <span className="text-[#003DA5]">consultar</span> hoje?
          </h2>
          <p className="text-slate-500 text-sm font-medium max-w-xl mx-auto">
            Pesquise por NCM, EAN, Assunto ou trechos de descrição. Nosso motor busca em cases, mural e tratativas para encontrar o melhor precedente.
          </p>
          
          <div className="relative pt-4">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: Diferimento, Medicamentos, NCM 3004..."
              className="w-full pl-16 pr-6 py-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] text-lg font-bold text-slate-800 focus:border-[#003DA5] focus:bg-white outline-none transition-all shadow-inner"
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Sugestões:</span>
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => setQuery(s)}
                className="px-4 py-2 bg-slate-100 hover:bg-blue-50 hover:text-[#003DA5] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resultados */}
      {query.length >= 2 ? (
        <div className="space-y-6">
          {/* ASSISTENTE CONVERSACIONAL */}
          {intelligentResponse && (
            <div className="bg-white rounded-[2rem] p-8 shadow-xl border border-slate-100 animate-in slide-in-from-bottom-4 duration-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Bot className="w-48 h-48" />
              </div>
              
              <div className="flex flex-col gap-8 relative z-10">
                {/* 1. RESPOSTA DO ASSISTENTE */}
                <div className="flex items-start gap-4">
                  <div className="bg-[#003DA5] p-3 rounded-2xl text-white shadow-lg">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-[#003DA5] uppercase tracking-widest">Inteligência FSJ</span>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-3xl rounded-tl-none border border-slate-100 shadow-inner">
                      <p className="text-lg font-bold text-slate-800 leading-relaxed italic">
                        "{highlightText(intelligentResponse.answer, query)}"
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. EVIDÊNCIAS */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-2">
                  <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col gap-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Volume de Cases</span>
                    <div className="flex items-end gap-2">
                      <span className="text-xl font-black text-slate-800">{intelligentResponse.evidence.caseCount}</span>
                      <ClipboardList className="w-4 h-4 text-slate-200 mb-1" />
                    </div>
                  </div>
                  <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col gap-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Reincidência Formal</span>
                    <div className="flex items-end gap-2">
                      <span className="text-xl font-black text-[#D91B2A]">{intelligentResponse.evidence.reincidenciaFormalCount}</span>
                      <AlertCircle className="w-4 h-4 text-red-100 mb-1" />
                    </div>
                  </div>
                  <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col gap-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tratativas Ativas</span>
                    <div className="flex items-end gap-2">
                      <span className="text-xl font-black text-slate-800">{intelligentResponse.evidence.tratativaCount}</span>
                      <Database className="w-4 h-4 text-slate-200 mb-1" />
                    </div>
                  </div>
                  <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col gap-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Posts no Mural</span>
                    <div className="flex items-end gap-2">
                      <span className="text-xl font-black text-slate-800">{intelligentResponse.evidence.muralCount}</span>
                      <MessageSquare className="w-4 h-4 text-slate-200 mb-1" />
                    </div>
                  </div>
                </div>

                {/* 3. PADRÃO IDENTIFICADO */}
                {intelligentResponse.patternSummary && (
                  <div className="px-2 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-grow bg-slate-100"></div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Padrão Identificado</span>
                      <div className="h-px flex-grow bg-slate-100"></div>
                    </div>
                    <div className="p-5 bg-blue-50/30 rounded-2xl border border-blue-50/50">
                      <p className="text-xs font-semibold text-slate-600 leading-relaxed flex items-start gap-2">
                        <ArrowRight className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                        {intelligentResponse.patternSummary}
                      </p>
                    </div>
                  </div>
                )}

                {/* 4. AÇÃO RECOMENDADA */}
                <div className="px-2 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-grow bg-slate-100"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Ação Recomendada</span>
                    <div className="h-px flex-grow bg-slate-100"></div>
                  </div>
                  
                  <div className={`p-6 rounded-3xl border flex flex-col md:flex-row items-center justify-between gap-6 transition-all ${
                    intelligentResponse.recommendation.priority === 'CRITICA' ? 'bg-red-50/50 border-red-100' :
                    intelligentResponse.recommendation.priority === 'ALTA' ? 'bg-orange-50/50 border-orange-100' :
                    'bg-slate-50 border-slate-100'
                  }`}>
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`p-3 rounded-2xl ${
                        intelligentResponse.recommendation.priority === 'CRITICA' ? 'bg-red-100 text-red-600' :
                        intelligentResponse.recommendation.priority === 'ALTA' ? 'bg-orange-100 text-orange-600' :
                        'bg-blue-100 text-[#003DA5]'
                      }`}>
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight">
                            {intelligentResponse.recommendation.message}
                          </span>
                          <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                            intelligentResponse.recommendation.priority === 'CRITICA' ? 'bg-red-600 text-white' :
                            intelligentResponse.recommendation.priority === 'ALTA' ? 'bg-orange-600 text-white' :
                            'bg-blue-600 text-white'
                          }`}>
                            Prioridade {intelligentResponse.recommendation.priority}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Orientação Inteligente FSJ</p>
                      </div>
                    </div>

                    {/* BOTÕES DE AÇÃO — ORIENTAÇÃO DIRETIVA FSJ */}
                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <button 
                        onClick={() => {
                          const topCase = results.flatMap(g => g.results)[0]?.record;
                          if (topCase) onOpenCase(topCase.caseId);
                          else alert("Nenhum case específico identificado para ação imediata.");
                        }}
                        className="px-5 py-3 h-12 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg hover:shadow-xl hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-95"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Agir
                      </button>

                      <button 
                        onClick={handleOpenTreatment}
                        className="px-6 py-3 h-12 bg-[#003DA5] text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg hover:shadow-xl hover:bg-blue-800 transition-all flex items-center gap-2 active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        Abrir Tratativa
                      </button>

                      <button 
                        onClick={() => setShowResults(!showResults)}
                        className="px-5 py-3 h-12 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-2"
                      >
                        <Database className="w-3.5 h-3.5" />
                        {showResults ? 'Ocultar Cases' : 'Ver Cases Relacionados'}
                      </button>

                      <button 
                        onClick={() => {
                          const reincidenceCases = results.flatMap(g => g.results).filter(r => r.record.isFormalRecurrent || r.record.previousCaseId);
                          if (reincidenceCases.length > 0) {
                            onOpenCase(reincidenceCases[0].record.caseId);
                          } else {
                            alert("Não identifiquei reincidência formal direta para este termo no momento de vinculação.");
                          }
                        }}
                        className="px-5 py-3 h-12 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-2"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Vincular Reincidência
                      </button>
                    </div>
                  </div>
                </div>

                {/* TEMAS RELACIONADOS (OPCIONAL) */}
                {results.length > 0 && !showResults && (
                  <div className="px-2 animate-in fade-in duration-700 delay-300">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Temas Relacionados Encontrados</p>
                    <div className="flex flex-wrap gap-2">
                      {results.slice(0, 4).map(g => (
                        <button
                          key={g.subject}
                          onClick={() => setShowResults(true)}
                          className="px-4 py-2 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all text-left"
                        >
                          <p className="text-[9px] font-black text-blue-600 uppercase mb-0.5">{g.count} CASOS</p>
                          <p className="text-[10px] font-bold text-slate-600 uppercase line-clamp-1">{g.subject}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* LISTA DE CASES — EXIBIDA APENAS SOB DEMANDA */}
          {showResults && results.length > 0 && (
            <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
              <div className="flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-800 p-2 rounded-xl text-white">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Detalhamento de Cases</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {results.reduce((acc, g) => acc + g.count, 0)} registros localizados
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowResults(false)}
                  className="text-[10px] font-black text-slate-400 uppercase hover:text-red-500 transition-colors flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Ocultar
                </button>
              </div>

              <div className="grid grid-cols-1 gap-8">
                {results.map((group) => (
                  <div key={group.subject} className="space-y-4">
                    <div className="flex items-center gap-4 px-2">
                      <div className="h-px flex-grow bg-slate-200"></div>
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">
                        {group.subject} <span className="text-[#003DA5] ml-2">({group.count} casos)</span>
                      </span>
                      <div className="h-px flex-grow bg-slate-200"></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {group.results.map((res) => (
                        <div 
                          key={res.record.id}
                          className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group cursor-pointer"
                          onClick={() => onOpenCase(res.record.caseId)}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="px-3 py-1 bg-blue-50 text-[#003DA5] rounded-lg text-[10px] font-black uppercase tracking-widest">
                              Case #{res.record.caseId}
                            </div>
                            <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                              res.record.status === 'ABERTO' ? 'bg-red-50 text-red-600' :
                              res.record.status === 'DEVOLVIDO' ? 'bg-amber-50 text-amber-600' :
                              'bg-emerald-50 text-emerald-600'
                            }`}>
                              {res.record.status}
                            </div>
                          </div>

                          <h4 className="text-sm font-black text-slate-800 mb-2 uppercase line-clamp-2 leading-tight">
                            {highlightText(res.record.subject || 'Sem Assunto', query)}
                          </h4>
                          
                          <p className="text-xs text-slate-500 line-clamp-3 mb-6 font-medium leading-relaxed">
                            {highlightText(res.record.description, query)}
                          </p>

                          <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                            <div className="flex flex-wrap gap-1">
                              {res.highlights.map(h => (
                                <span key={h} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] font-black uppercase tracking-tighter">
                                  {h}
                                </span>
                              ))}
                            </div>
                            <div className="flex items-center gap-1 text-[#003DA5] opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-[10px] font-black uppercase tracking-widest">Ver Detalhes</span>
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.length === 0 && (
            <div className="bg-white rounded-[2rem] p-16 text-center border border-slate-100 shadow-sm animate-in zoom-in-95 duration-500">
              <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">
                {intelligentResponse?.answer || "Nenhum resultado encontrado"}
              </h3>
              <p className="text-slate-500 text-sm font-medium max-w-md mx-auto">
                Tente pesquisar por palavras mais genéricas ou verifique se há erros de digitação.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="bg-blue-50 w-12 h-12 rounded-2xl flex items-center justify-center text-[#003DA5]">
              <Database className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Base de Cases</h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Consulte mais de {records.length} registros históricos para evitar retrabalho e garantir conformidade.
            </p>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="bg-indigo-50 w-12 h-12 rounded-2xl flex items-center justify-center text-indigo-600">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Mural Operacional</h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Busque discussões e alertas compartilhados pelo time no dia a dia da operação.
            </p>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="bg-emerald-50 w-12 h-12 rounded-2xl flex items-center justify-center text-emerald-600">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Tratativas Internas</h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Localize planos de ação e soluções definitivas aplicadas em casos complexos.
            </p>
          </div>
        </div>
      )}

      {/* Modal de Tratativa Sugerida */}
      {isTreatmentOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border-[8px] border-white transform animate-in zoom-in-95 duration-300">
            <div className="bg-indigo-600 p-8 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-6 h-6" />
                <div>
                  <h3 className="font-black uppercase text-lg tracking-tight">Novo Acompanhamento Interno</h3>
                  <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Sugestão Automática FSJ</p>
                </div>
              </div>
              <button onClick={() => setIsTreatmentOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Título da Tratativa</label>
                  <input 
                    type="text" 
                    value={treatmentData.title}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Descrição / Escopo</label>
                  <textarea 
                    value={treatmentData.description}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Responsável</label>
                  <input 
                    type="text" 
                    placeholder="Nome do responsável"
                    value={treatmentData.responsible}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, responsible: e.target.value }))}
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  {intelligentResponse?.suggestedResponsible && (
                    <p className="text-[9px] font-bold text-blue-600 mt-1 uppercase">Responsável sugerido: {intelligentResponse.suggestedResponsible}</p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Prioridade</label>
                  <select 
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    value={treatmentData.priority}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, priority: e.target.value as any }))}
                  >
                    <option value="Informativo">Informativo</option>
                    <option value="Atenção">Atenção</option>
                    <option value="Ação necessária">Ação necessária</option>
                    <option value="Crítico">Crítico</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Prazo Sugerido</label>
                  <input 
                    type="date" 
                    value={treatmentData.deadline}
                    onChange={(e) => setTreatmentData(prev => ({ ...prev, deadline: e.target.value }))}
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setIsTreatmentOpen(false)}
                  className="flex-1 py-4 border-2 border-slate-100 text-slate-400 font-black uppercase text-[10px] rounded-2xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSaveTreatment}
                  className="flex-1 py-4 bg-indigo-600 text-white font-black uppercase text-[10px] rounded-2xl shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
                >
                  Iniciar Tratativa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartSearch;
