
import { User } from '../../types';

export const USERS_LIST_KEY = 'fsj_usuarios';

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
 * Registra ou recupera um usuário baseado no nome
 * Garante que o nome de exibição seja o mais completo/correto encontrado
 */
export const syncUser = (name: string): User => {
  if (!name) return { id: 'unknown', name: 'Desconhecido' };
  
  const normalized = normalizeUserName(name);
  if (!normalized) return { id: 'unknown', name: 'Desconhecido' };

  const id = generateUserId(normalized);
  const users = getStoredUsers();
  const existingIndex = users.findIndex(u => u.id === id);

  const currentDisplayName = formatDisplayName(name);

  if (existingIndex >= 0) {
    const existing = users[existingIndex];
    // Se o novo nome for mais longo (provavelmente mais completo), atualiza o nome de exibição
    if (currentDisplayName.length > existing.name.length) {
      users[existingIndex].name = currentDisplayName;
      saveUsers(users);
      return users[existingIndex];
    }
    return existing;
  }

  const newUser: User = {
    id,
    name: currentDisplayName
  };

  saveUsers([...users, newUser]);
  return newUser;
};

/**
 * Padroniza um nome de entrada e retorna o nome de exibição oficial
 */
export const standardizeName = (name: string): string => {
  return syncUser(name).name;
};
