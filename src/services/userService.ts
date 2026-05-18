
import { User } from '../../types';

export const USERS_LIST_KEY = 'fsj_users';

/**
 * Normaliza um nome de usuário seguindo as regras:
 * - remover espaços extras
 * - converter para minúsculo
 * - remover acentos
 * - remover caracteres especiais
 * - trim (início e fim)
 */
export const normalizeUserName = (name: string): string => {
  if (!name) return '';
  
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, ' '); // Remove espaços extras
};

/**
 * Gera um ID único baseado no nome normalizado
 */
export const generateUserId = (normalizedName: string): string => {
  return normalizedName.replace(/\s+/g, '_');
};

/**
 * Formata um nome para exibição (Title Case)
 */
export const formatDisplayName = (name: string): string => {
  if (!name) return '';
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Obtém a lista de usuários do localStorage
 */
export const getStoredUsers = (): User[] => {
  try {
    const raw = localStorage.getItem(USERS_LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Erro ao carregar usuários:', e);
    return [];
  }
};

/**
 * Salva a lista de usuários no localStorage
 */
export const saveUsers = (users: User[]): void => {
  localStorage.setItem(USERS_LIST_KEY, JSON.stringify(users));
};

/**
 * Padroniza um nome de entrada e retorna o nome formatado (Title Case)
 * Não sincroniza mais automaticamente com nenhuma lista.
 */
export const syncUser = (name: string): User => {
  const normalized = normalizeUserName(name);
  const currentDisplayName = formatDisplayName(name) || 'Sistema';

  return { 
    id: generateUserId(normalized) || 'system', 
    name: currentDisplayName, 
    email: `${generateUserId(normalized) || 'system'}@farmaciassaojoao.com.br`, 
    isActive: true, 
    role: 'user',
    createdAt: new Date().toISOString() 
  };
};

/**
 * Padroniza um nome de entrada e retorna o nome de exibição formatado
 * Esta função agora é pura e não gera efeitos colaterais (não salva dados).
 */
export const standardizeName = (name: string): string => {
  if (!name || name.trim() === '') return '';
  return formatDisplayName(name);
};
