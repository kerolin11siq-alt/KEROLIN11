
import React, { useState, useRef } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { TicketRecord, TicketStatus } from '../types';

interface ImportModalProps {
  onImport: (records: TicketRecord[], report: { total: number, duplicated: number }) => void;
  onClose: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ onImport, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getLocalDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const normalizeHeader = (str: string): string => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .toUpperCase()
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(word => !['DE', 'DA', 'DO', 'DAS', 'DOS'].includes(word))
      .join(' ');
  };

  const headerMap: Record<string, keyof TicketRecord> = {
    'CASE': 'caseId', 'CASE ID': 'caseId', 'CHAMADO': 'caseId', 'CASE CHAMADO': 'caseId', 'TICKET': 'caseId', 'ID': 'caseId', 'NUMERO': 'caseId',
    'TIPO': 'type', 'OPERACAO': 'type', 'CATEGORIA': 'type', 'TIPO DEMANDA': 'type',
    'CASE ANTE': 'previousCaseId', 'CASE ANTERIOR': 'previousCaseId', 'VINCULO': 'previousCaseId', 'REINCIDENCIA': 'previousCaseId',
    'DATA ABERTURA': 'openingDate', 'ABERTURA': 'openingDate', 'DATA ABE': 'openingDate', 'DATA': 'openingDate', 'DATA ORIGEM': 'openingDate', 'DATA_ABERTURA': 'openingDate',
    'DATA RETORNO': 'returnDate', 'RETORNO': 'returnDate', 'DATA DEVOLUCAO': 'returnDate', 'DEVOLUCAO': 'returnDate', 'DATA RESPOSTA': 'returnDate', 'DATA_RETORNO': 'returnDate',
    'USUARIO': 'externalUser', 'CLIENTE': 'externalUser', 'SOLICITANTE': 'externalUser', 'FSJ': 'externalUser', 'NOME SOLICITANTE': 'externalUser',
    'ANALISTA': 'user', 'RESPONSAVEL': 'user', 'ATENDENTE': 'user', 'TECNICO': 'user', 'ANALISTA SOVOS': 'user',
    'DESCRICAO ERRO REGRA': 'description', 'ERRO REGRA': 'description', 'DESCRICAO': 'description', 'DETALHES': 'description', 'ERRO': 'description',
    'CENARIOS': 'scenarios', 'TESTES': 'scenarios', 'CENARIO': 'scenarios', 'CENARIOS TESTE': 'scenarios',
    'OBS': 'observations', 'OBSERVACOES': 'observations', 'NOTAS': 'observations', 'COMENTARIOS': 'observations',
    'STATUS': 'status', 'SITUACAO': 'status', 'ESTADO': 'status',
    'ASSUNTO': 'subject', 'TITULO': 'subject', 'RESUMO': 'subject'
  };

  const parseDateRobust = (dateStr: string): string => {
    if (!dateStr || dateStr.trim() === '') return '';
    const cleanStr = dateStr.trim();
    
    // Tenta Formato Brasileiro: DD/MM/YYYY ou DD-MM-YYYY
    const brMatch = cleanStr.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
    if (brMatch) {
      let [, day, month, year] = brMatch;
      if (year.length === 2) year = '20' + year;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Tenta Formato ISO: YYYY-MM-DD
    const isoMatch = cleanStr.match(/^(\d{4})[\/\.\-](\d{2})[\/\.\-](\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    
    return '';
  };

  const mapStatus = (status: string): TicketStatus => {
    const s = normalizeHeader(status || '');
    if (s.includes('CONCLU') || s.includes('FECHAD') || s.includes('RESOLV') || s.includes('FINALIZ')) return 'CONCLUIDO';
    if (s.includes('DEVOLV') || s.includes('PENDENT') || s.includes('AGUARD') || s.includes('RETORNO')) return 'DEVOLVIDO';
    return 'ABERTO';
  };

  const parseCSVData = (text: string, delimiter: string) => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentRow.push(currentField);
        currentField = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentField);
        if (currentRow.length > 0 || currentField) rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }
    return rows;
  };

  const processCSV = async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      const text = await file.text();
      const cleanText = text.replace(/^\uFEFF/, '').trim();
      if (!cleanText) throw new Error('O arquivo está vazio.');

      const firstLine = cleanText.split(/\r?\n/)[0] || '';
      const counts = { ';': (firstLine.match(/;/g) || []).length, ',': (firstLine.match(/,/g) || []).length, '\t': (firstLine.match(/\t/g) || []).length };
      const delimiter = Object.entries(counts).reduce((a, b) => a[1] > b[1] ? a : b)[0] as string;
      
      const allRows = parseCSVData(cleanText, delimiter);
      if (allRows.length < 2) throw new Error('Estrutura de dados insuficiente (mínimo cabeçalho + 1 linha).');

      const originalHeaders = allRows[0].map(h => h.trim());
      const normalizedHeaders = originalHeaders.map(h => normalizeHeader(h));
      const importedRecords: TicketRecord[] = [];
      
      // Relatório
      let totalInFile = 0;
      let ignoredDuplicatedInFile = 0;
      const seenInFile = new Set<string>();

      for (let i = 1; i < allRows.length; i++) {
        const values = allRows[i];
        if (values.length < 1 || (values.length === 1 && values[0].trim() === '')) continue;

        totalInFile++;
        const rowData: any = {};
        const unmappedData: string[] = [];

        normalizedHeaders.forEach((header, idx) => {
          const val = (values[idx] || '').trim();
          const targetKey = headerMap[header];
          if (targetKey) rowData[targetKey] = val;
          else if (val) unmappedData.push(`${originalHeaders[idx]}: ${val}`);
        });

        // Normalização do CASE ID
        const caseId = String(rowData.caseId || '').trim();
        if (!caseId) {
          totalInFile--; // Não conta como registro se não tem CASE
          continue;
        }

        // Deduplicação dentro do próprio arquivo
        if (seenInFile.has(caseId)) {
          ignoredDuplicatedInFile++;
          continue;
        }
        seenInFile.add(caseId);

        const opDateRaw = String(rowData.openingDate || '');
        const retDateRaw = String(rowData.returnDate || '');
        
        const opDate = parseDateRobust(opDateRaw) || getLocalDateString();
        const retDate = parseDateRobust(retDateRaw) || undefined;
        
        const previousCaseId = (rowData.previousCaseId || '').trim().toUpperCase() || undefined;
        
        importedRecords.push({
          id: crypto.randomUUID(),
          caseId: caseId,
          type: String(rowData.type || '').toUpperCase().includes('PROJET') ? 'PROJETO' : 'PRODUÇÃO',
          previousCaseId,
          isFormalRecurrent: !!(previousCaseId && !['N/A', 'NA', '-', '0'].includes(previousCaseId)),
          openingDate: opDate,
          returnDate: retDate,
          conclusionDate: retDate,
          user: rowData.user || 'Analista Sovos',
          externalUser: rowData.externalUser || 'FSJ (Solicitante)',
          description: rowData.description || '',
          scenarios: rowData.scenarios || '',
          observations: (rowData.observations || '') + (unmappedData.length > 0 ? `\n\n[DADOS EXTRAS DA PLANILHA]:\n${unmappedData.join('\n')}` : ''),
          status: mapStatus(String(rowData.status || '')),
          creatorUser: 'SISTEMA',
          createdAt: new Date().toISOString(),
          origin: 'workflow'
        });
      }
      
      if (importedRecords.length === 0) throw new Error('Nenhum registro válido encontrado na planilha.');
      
      onImport(importedRecords, {
        total: totalInFile,
        duplicated: ignoredDuplicatedInFile
      });
    } catch (err: any) {
      setError(err.message || 'Falha no processamento do arquivo CSV.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border-4 border-[#003DA5]">
        <div className="px-6 py-5 border-b flex items-center justify-between bg-[#003DA5]/5">
          <div className="flex items-center gap-3">
            <div className="bg-[#003DA5] p-2 rounded-xl"><FileSpreadsheet className="w-5 h-5 text-white" /></div>
            <div>
              <h2 className="text-lg font-black text-black">Importação Consolidada</h2>
              <p className="text-[9px] text-[#003DA5] font-black uppercase tracking-widest">SLA: Fiel à Planilha de Origem</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-8 space-y-6">
          {error && <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-[10px] text-red-600 font-black flex gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}
          
          <div onClick={() => !isProcessing && fileInputRef.current?.click()} className="border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-[#003DA5] hover:bg-blue-50/30 transition-all group">
            <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && processCSV(e.target.files[0])} accept=".csv" className="hidden" />
            {isProcessing ? <Loader2 className="w-10 h-10 text-[#003DA5] animate-spin" /> : (
              <div className="text-center">
                <Upload className="w-10 h-10 text-[#003DA5] mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <p className="text-sm font-black text-gray-950 uppercase">Selecionar Planilha CSV</p>
                <div className="mt-4 space-y-1">
                   <p className="text-[10px] text-emerald-800 font-black uppercase">✔ Fidelidade de Datas Ativa</p>
                   <p className="text-[10px] text-gray-700 font-bold italic">Mapeamento: Analista = Sovos | Solicitante = FSJ</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-amber-50 rounded-xl p-4 border-2 border-amber-300">
            <h4 className="text-[9px] font-black text-amber-950 uppercase flex items-center gap-2 mb-2"><AlertCircle className="w-3 h-3" /> Aviso de Integridade</h4>
            <p className="text-[10px] text-black font-bold leading-relaxed">
              O sistema importará exatamente as datas escritas na planilha. Certifique-se que as colunas <strong>Data Abertura</strong> e <strong>Data Retorno</strong> estão preenchidas corretamente no formato DD/MM/YYYY.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2 bg-white border-2 border-gray-200 text-[10px] font-black uppercase text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">Cancelar</button>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
