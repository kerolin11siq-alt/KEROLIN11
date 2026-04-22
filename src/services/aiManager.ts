
import { GoogleGenAI } from "@google/genai";

export enum AIPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3
}

export type AITaskType = 'chat' | 'duplicate_check' | 'precedent_search' | 'learning' | 'stats' | 'cluster' | 'keywords' | 'classification';

interface AITask {
  id: string;
  type: AITaskType;
  priority: AIPriority;
  timestamp: number;
  prompt: string;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  config?: any;
  cacheKey?: string;
}

interface AICacheEntry {
  data: any;
  expiresAt: number;
}

class AIQuotaManager {
  private ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  private queue: AITask[] = [];
  private activeRequests = 0;
  private requestsInLastMinute = 0;
  private cache: Map<string, AICacheEntry> = new Map();
  private lastRequestTime = 0;
  
  private readonly MAX_SIMULTANEOUS = 1;
  private readonly MAX_PER_MINUTE = 10;
  private readonly MIN_INTERVAL = 3000; // Increased to 3s to be safer
  private readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes
  private isPaused = false;
  private pauseTimer: NodeJS.Timeout | null = null;

  // Batching for learning
  private learningBatch: any[] = [];
  private learningBatchTimer: NodeJS.Timeout | null = null;
  private learningBatchResolvers: ((value: any) => void)[] = [];

  // Batching for keywords
  private keywordsBatch: any[] = [];
  private keywordsBatchTimer: NodeJS.Timeout | null = null;
  private keywordsBatchResolvers: ((value: any) => void)[] = [];

  constructor() {
    // Reset minute counter
    setInterval(() => {
      this.requestsInLastMinute = 0;
      this.processQueue();
    }, 60000);

    // Clean cache
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (entry.expiresAt < now) {
          this.cache.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Main entry point for AI requests
   */
  public async request(
    type: AITaskType, 
    prompt: string, 
    priority: AIPriority = AIPriority.MEDIUM, 
    config: any = {}, 
    cacheKey?: string
  ): Promise<any> {
    // 1. Check Cache
    if (cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        console.log(`[AI Manager] Cache hit for ${cacheKey}`);
        return cached.data;
      }
    }

    // 2. Create Task
    return new Promise((resolve, reject) => {
      const task: AITask = {
        id: Math.random().toString(36).substring(7),
        type,
        priority,
        timestamp: Date.now(),
        prompt,
        resolve,
        reject,
        config,
        cacheKey
      };

      this.queue.push(task);
      this.sortQueue();
      this.processQueue();
    });
  }

  /**
   * Specialized method for learning that supports batching
   */
  public async requestLearning(caseData: any): Promise<any> {
    return new Promise((resolve) => {
      this.learningBatch.push(caseData);
      this.learningBatchResolvers.push(resolve);

      if (this.learningBatchTimer) clearTimeout(this.learningBatchTimer);

      // Wait 5 seconds for more cases before processing batch
      this.learningBatchTimer = setTimeout(() => {
        this.processLearningBatch();
      }, 5000);
    });
  }

  private async processLearningBatch() {
    if (this.learningBatch.length === 0) return;

    const batch = [...this.learningBatch];
    const resolvers = [...this.learningBatchResolvers];
    
    this.learningBatch = [];
    this.learningBatchResolvers = [];
    this.learningBatchTimer = null;

    if (batch.length === 1) {
      // Process single case normally
      const prompt = this.createLearningPrompt(batch[0]);
      this.request('learning', prompt, AIPriority.LOW).then(res => resolvers[0](res));
      return;
    }

    // Process batch
    const prompt = `
      Você é o motor de Memória Inteligente de Precedentes da SOVOS.
      Sua tarefa é converter os seguintes ${batch.length} CASES em conhecimento estruturado.
      
      DADOS DOS CASES:
      ${batch.map((c, i) => `--- CASE ${i+1} ---\nID: ${c.caseId}\nStatus: ${c.status}\nDesc: ${c.description}\nCenários: ${c.scenarios}\nSolução: ${c.observations}\n`).join('\n')}

      Retorne um ARRAY de objetos JSON, um para cada case, no formato:
      [
        {
          "caseId": "...",
          "layers": {
            "identity": { "subject": "...", "uf": "...", "status": "..." },
            "technical": { "ncm": "...", "ean": "...", "cest": "...", "principle": "...", "product": "..." },
            "fiscal": { "theme": "...", "nature": "...", "context": "..." },
            "outcome": { "solution": "...", "summary": "...", "confidence": "HIGH|MEDIUM|LOW" },
            "reuse": ["..."]
          },
          "keywords": ["..."]
        }
      ]
    `;

    try {
      const results = await this.request('learning', prompt, AIPriority.LOW);
      if (Array.isArray(results)) {
        resolvers.forEach((resolve, i) => {
          const result = results.find(r => r.caseId === batch[i].caseId);
          resolve(result || null);
        });
      } else {
        resolvers.forEach(resolve => resolve(null));
      }
    } catch (e) {
      resolvers.forEach(resolve => resolve(null));
    }
  }

  private createLearningPrompt(record: any) {
    return `
      Você é o Analista Fiscal Sênior da SOVOS.
      Sua tarefa é converter o seguinte CASE resolvido em um registro de conhecimento estruturado para a Base de Conhecimento Fiscal.
      
      DADOS DO CASE:
      - ID: ${record.caseId}
      - Status: ${record.status}
      - Descrição: ${record.description}
      - Cenários: ${record.scenarios}
      - Observações/Solução: ${record.observations}
      - Data Abertura: ${record.openingDate}
      - Usuário: ${record.user}

      DIRETRIZES TÉCNICAS:
      1. TEMA PRINCIPAL: Identifique o grupo fiscal (ex: PMPF medicamentos, PMC medicamentos, MVA ST, CEST, NCM classificação, ST cosméticos, ST suplementos, bonificação, isenção, doenças raras ANVISA, GTIN/EAN inconsistência).
      2. CONTEXTO FISCAL: Explique o cenário tributário envolvido.
      3. ANÁLISE REALIZADA: Descreva os passos da análise técnica.
      4. SOLUÇÃO ADOTADA: Descreva a resolução final.
      5. BASE LEGAL: Cite leis, convênios ou portarias se mencionados.
      6. PRECISÃO: Nunca invente base legal. Mantenha o vínculo com a UF.

      Retorne APENAS um JSON no formato:
      {
        "caseId": "${record.caseId}",
        "layers": {
          "identity": { "subject": "resumo curto do problema", "uf": "sigla", "status": "${record.status}" },
          "technical": { "ncm": "...", "ean": "...", "cest": "...", "principle": "...", "product": "...", "brand": "..." },
          "fiscal": { 
            "theme": "um dos grupos citados ou novo tema similar", 
            "nature": "tipo de operação", 
            "context": "contexto fiscal detalhado",
            "analysis": "descrição da análise técnica realizada",
            "legalBase": "referências legais se existirem"
          },
          "outcome": { "solution": "solução detalhada", "summary": "resumo executivo", "confidence": "HIGH|MEDIUM|LOW" },
          "reuse": ["cenário de reuso 1", "cenário de reuso 2"]
        },
        "keywords": ["tag1", "tag2"]
      }
    `;
  }

  /**
   * Specialized method for keywords that supports batching
   */
  public async requestKeywords(caseData: any): Promise<string[]> {
    return new Promise((resolve) => {
      this.keywordsBatch.push(caseData);
      this.keywordsBatchResolvers.push(resolve);

      if (this.keywordsBatchTimer) clearTimeout(this.keywordsBatchTimer);

      // Wait 3 seconds for more cases before processing batch
      this.keywordsBatchTimer = setTimeout(() => {
        this.processKeywordsBatch();
      }, 3000);
    });
  }

  private async processKeywordsBatch() {
    if (this.keywordsBatch.length === 0) return;

    // Limit batch size to 40 cases per AI request to avoid token limits and reduce request count
    const MAX_BATCH_SIZE = 40;
    const currentBatch = this.keywordsBatch.splice(0, MAX_BATCH_SIZE);
    const currentResolvers = this.keywordsBatchResolvers.splice(0, MAX_BATCH_SIZE);
    
    // If there are still items in the batch, schedule another processing with a delay
    if (this.keywordsBatch.length > 0) {
      this.keywordsBatchTimer = setTimeout(() => {
        this.processKeywordsBatch();
      }, 5000);
    } else {
      this.keywordsBatchTimer = null;
    }

    if (currentBatch.length === 1) {
      const prompt = this.createKeywordsPrompt(currentBatch[0]);
      this.request('keywords', prompt, AIPriority.LOW).then(res => {
        currentResolvers[0](Array.isArray(res) ? res : []);
      });
      return;
    }

    // Process batch of keywords
    const prompt = `
      Você é o motor de Indexação Inteligente da SOVOS.
      Sua tarefa é gerar palavras-chave altamente relevantes para os seguintes ${currentBatch.length} CASES.
      
      REGRAS DE GERAÇÃO:
      - Inclua termos técnicos do assunto, nomes de produtos, NCM, CEST, EAN.
      - Inclua princípio ativo, categoria do produto e tipo de operação fiscal.
      - Gere entre 5 e 10 palavras-chave por case.
      
      DADOS DOS CASES:
      ${currentBatch.map((c, i) => `--- CASE ${i+1} ---\nID: ${c.caseId}\nAssunto: ${c.description}\nProduto: ${c.observations}\nNCM: ${c.ncm || ''}\nGTIN/EAN: ${c.gtin || ''}\nUF: ${c.uf || ''}\n`).join('\n')}

      Retorne um OBJETO JSON onde as chaves são os IDs dos cases e os valores são ARRAYS de strings:
      {
        "ID_DO_CASE": ["palavra1", "palavra2", ...]
      }
    `;

    try {
      const results = await this.request('keywords', prompt, AIPriority.LOW);
      currentResolvers.forEach((resolve, i) => {
        const caseId = currentBatch[i].caseId;
        resolve(results[caseId] || []);
      });
    } catch (e) {
      currentResolvers.forEach(resolve => resolve([]));
    }
  }

  private createKeywordsPrompt(record: any) {
    return `
      Você é o motor de Indexação Inteligente da SOVOS.
      Gere palavras-chave altamente relevantes para o seguinte CASE.
      
      DADOS DO CASE:
      - ID: ${record.caseId}
      - Assunto: ${record.description}
      - Produto/Observações: ${record.observations}
      - NCM: ${record.ncm || ''}
      - GTIN/EAN: ${record.gtin || ''}
      - UF: ${record.uf || ''}
      
      REGRAS:
      - Inclua termos técnicos, NCM, EAN, princípio ativo, categoria e tipo de operação.
      - Retorne APENAS um ARRAY JSON de strings.
    `;
  }

  private sortQueue() {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.timestamp - b.timestamp;
    });
  }

  private async processQueue() {
    if (this.isPaused) return;
    if (this.activeRequests >= this.MAX_SIMULTANEOUS) return;
    if (this.requestsInLastMinute >= this.MAX_PER_MINUTE) {
      return;
    }
    if (this.queue.length === 0) return;

    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    
    if (timeSinceLast < this.MIN_INTERVAL) {
      setTimeout(() => this.processQueue(), this.MIN_INTERVAL - timeSinceLast);
      return;
    }

    // Check if we should postpone low priority if usage is high
    if (this.requestsInLastMinute > this.MAX_PER_MINUTE * 0.8) {
      const nextTask = this.queue[0];
      if (nextTask.priority === AIPriority.LOW) {
        // Postpone low priority tasks when quota is tight
        return;
      }
    }

    const task = this.queue.shift()!;
    this.executeTask(task);
  }

  private async executeTask(task: AITask, retryCount = 0) {
    if (this.isPaused) {
      this.queue.unshift(task); // Put back at the front
      return;
    }

    this.activeRequests++;
    this.requestsInLastMinute++;
    this.lastRequestTime = Date.now();

    console.log(`[AI Manager] Executing task ${task.id} (${task.type}, Priority: ${task.priority}, Attempt: ${retryCount + 1})`);

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: task.prompt }] }],
        config: task.config || { responseMimeType: "application/json" }
      });

      let result;
      if (task.config?.responseMimeType === "application/json" || !task.config) {
        try {
          result = JSON.parse(response.text);
        } catch (e) {
          result = response.text;
        }
      } else {
        result = response.text;
      }

      // Save to cache if applicable
      if (task.cacheKey) {
        this.cache.set(task.cacheKey, {
          data: result,
          expiresAt: Date.now() + this.CACHE_TTL
        });
      }

      task.resolve(result);
    } catch (error: any) {
      const errorStr = JSON.stringify(error);
      const isRateLimit = 
        error?.status === 'RESOURCE_EXHAUSTED' || 
        error?.code === 429 || 
        (typeof error?.message === 'string' && error.message.includes('429')) ||
        (error?.error?.code === 429) ||
        errorStr.includes('429') ||
        errorStr.includes('RESOURCE_EXHAUSTED');

      if (isRateLimit && retryCount < 5) {
        // Activate circuit breaker
        this.pauseProcessing(10000 * (retryCount + 1)); // Pause for 10s, 20s, 30s...

        const delays = [5000, 15000, 30000, 60000, 120000];
        const delay = delays[retryCount];
        console.warn(`[AI Manager] Rate limit hit for task ${task.id}. Retry ${retryCount + 1} in ${delay}ms...`);
        
        setTimeout(() => {
          this.executeTask(task, retryCount + 1);
        }, delay);
      } else {
        console.error(`[AI Manager] Task ${task.id} failed after ${retryCount + 1} attempts:`, error);
        task.reject(error);
      }
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  private pauseProcessing(duration: number) {
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.isPaused = true;
    console.warn(`[AI Manager] Pausing all requests for ${duration}ms due to quota limits.`);
    this.pauseTimer = setTimeout(() => {
      this.isPaused = false;
      this.pauseTimer = null;
      this.processQueue();
    }, duration);
  }

  public getStatus() {
    return {
      activeRequests: this.activeRequests,
      requestsInLastMinute: this.requestsInLastMinute,
      queueLength: this.queue.length,
      cacheSize: this.cache.size
    };
  }
}

export const aiManager = new AIQuotaManager();
