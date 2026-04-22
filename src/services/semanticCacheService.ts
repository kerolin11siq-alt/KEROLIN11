
import { CaseKnowledge, TicketRecord } from "../../types";

export type SemanticIntent = 
  | 'consultar_precedente' 
  | 'consultar_ncm' 
  | 'consultar_ean' 
  | 'consultar_principio_ativo' 
  | 'verificar_duplicidade' 
  | 'localizar_case_aberto' 
  | 'buscar_historico_produto' 
  | 'buscar_solucao_anterior'
  | 'stats'
  | 'ranking';

export interface SemanticEntities {
  intent: SemanticIntent;
  assunto: string | null;
  produto: string | null;
  ncm: string | null;
  ean: string | null;
  cest: string | null;
  principio_ativo: string | null;
  uf: string | null;
  contexto_fiscal: string | null;
  status_solicitado: string | null;
  palavras_chave: string[];
}

export interface SemanticCacheEntry {
  originalQuestion: string;
  normalizedQuestion: string;
  semanticKey: string;
  entities: SemanticEntities;
  answer: string;
  timestamp: number;
  expiresAt: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  baseVersion: string;
}

class SemanticCacheService {
  private cache: Map<string, SemanticCacheEntry> = new Map();
  private baseVersion: string = Date.now().toString();

  /**
   * Normalizes text according to rules:
   * - Lowercase, no accents, no irrelevant punctuation, single spaces
   * - Abbreviations (RS -> rio grande do sul)
   * - Synonyms (GTIN -> ean)
   */
  public normalize(text: string): string {
    let normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Common abbreviations and synonyms mapping
    const mappings: Record<string, string> = {
      'rs': 'rio grande do sul',
      'sp': 'sao paulo',
      'pr': 'parana',
      'sc': 'santa catarina',
      'mg': 'minas gerais',
      'rj': 'rio de janeiro',
      'gtin': 'ean',
      'principio ativo': 'principio ativo',
      'medicamentos': 'medicamento',
      'cases': 'case',
      'precedentes': 'precedente'
    };

    // Apply mappings (simple word replacement)
    const words = normalized.split(' ');
    const mappedWords = words.map(w => mappings[w] || w);
    
    return mappedWords.join(' ');
  }

  /**
   * Generates a standardized semantic key from extracted entities
   */
  public generateSemanticKey(entities: SemanticEntities): string {
    const parts = [
      entities.intent || 'search',
      entities.assunto || '',
      entities.ncm || entities.ean || entities.principio_ativo || entities.produto || '',
      entities.uf || '',
      entities.contexto_fiscal || '',
      entities.status_solicitado || ''
    ];

    return parts
      .map(p => p.toLowerCase().trim().replace(/\|/g, ''))
      .filter(p => p !== '')
      .join('|');
  }

  /**
   * Checks if an equivalent entry exists in cache
   */
  public get(semanticKey: string): SemanticCacheEntry | null {
    const entry = this.cache.get(semanticKey);
    
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(semanticKey);
      return null;
    }

    // Check base version
    if (entry.baseVersion !== this.baseVersion) {
      return null;
    }

    // Only reuse if confidence is HIGH
    if (entry.confidence !== 'HIGH') {
      return null;
    }

    return entry;
  }

  /**
   * Stores a new entry in cache
   */
  public set(
    question: string, 
    entities: SemanticEntities, 
    answer: string, 
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH'
  ): void {
    const semanticKey = this.generateSemanticKey(entities);
    const ttl = this.getTTLForIntent(entities.intent);
    
    const entry: SemanticCacheEntry = {
      originalQuestion: question,
      normalizedQuestion: this.normalize(question),
      semanticKey,
      entities,
      answer,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
      confidence,
      baseVersion: this.baseVersion
    };

    this.cache.set(semanticKey, entry);
  }

  /**
   * Invalidates the cache (total or partial)
   */
  public invalidate(type: 'total' | 'partial', filter?: string): void {
    if (type === 'total') {
      this.baseVersion = Date.now().toString();
      this.cache.clear();
    } else if (type === 'partial' && filter) {
      const normalizedFilter = this.normalize(filter);
      for (const [key, entry] of this.cache.entries()) {
        if (key.includes(normalizedFilter) || entry.normalizedQuestion.includes(normalizedFilter)) {
          this.cache.delete(key);
        }
      }
    }
  }

  private getTTLForIntent(intent: SemanticIntent): number {
    const minute = 60 * 1000;
    switch (intent) {
      case 'consultar_ean':
      case 'consultar_ncm':
      case 'consultar_principio_ativo':
        return 15 * minute;
      case 'localizar_case_aberto':
      case 'stats':
        return 5 * minute;
      default:
        return 10 * minute;
    }
  }

  public getStats() {
    return {
      size: this.cache.size,
      version: this.baseVersion
    };
  }
}

export const semanticCache = new SemanticCacheService();
