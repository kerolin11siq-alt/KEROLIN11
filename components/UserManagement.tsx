
import React, { useState } from 'react';
import { User, ShieldCheck, UserPlus, Search, Edit2, Trash2, Mail, Shield, ToggleLeft, ToggleRight, X, Check, Lock } from 'lucide-react';
import { User as UserType } from '../types';
import { db, cleanData, createSecondaryAuth } from '../src/lib/firebase';
import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

interface UserManagementProps {
  users: UserType[];
  currentUser: any;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [isActive, setIsActive] = useState(true);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredUsers = users.filter(u => 
    (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openModal = (user?: UserType) => {
    setError(null);
    if (user) {
      setEditingUser(user);
      setName(user.name || '');
      setEmail(user.email || '');
      setRole(user.role || 'user');
      setIsActive(user.isActive !== undefined ? user.isActive : true);
      setUserId(user.id);
      setPassword('');
    } else {
      setEditingUser(null);
      setName('');
      setEmail('');
      setRole('user');
      setIsActive(true);
      setUserId('');
      setPassword('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      let finalUid = userId;
      const normalizedEmail = (email || '').toLowerCase().trim();

      if (!normalizedEmail) {
        throw new Error("O e-mail é obrigatório.");
      }

      if (!normalizedEmail.endsWith('@farmaciassaojoao.com.br') && normalizedEmail !== 'kerolin11siq@gmail.com' && normalizedEmail !== 'kerolin.siqueira@farmaciassaojoao.com.br') {
        throw new Error("Apenas e-mails corporativos @farmaciassaojoao.com.br são permitidos.");
      }

      // Se for novo usuário, cria no Firebase Auth primeiro
      if (!editingUser) {
        if (!password || password.length < 6) {
          throw new Error("A senha inicial deve ter pelo menos 6 caracteres.");
        }
        
        const secondaryAuth = createSecondaryAuth();
        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, password);
          finalUid = userCredential.user.uid;
          await updateProfile(userCredential.user, { displayName: name });
          // Importante: deslogar do app secundário para não interferir na sessão do admin
          await secondaryAuth.signOut();
        } catch (authError: any) {
          if (authError.code === 'auth/email-already-in-use') {
            throw new Error("Este e-mail já está em uso no sistema de autenticação.");
          }
          throw authError;
        }
      }

      const now = new Date().toISOString();
      const userToSave: UserType = {
        id: finalUid,
        name,
        email: normalizedEmail,
        role,
        isActive,
        createdAt: editingUser?.createdAt || now,
        createdBy: editingUser?.createdBy || (currentUser?.uid || 'system'),
        createdByName: editingUser?.createdByName || (currentUser?.displayName || 'Sistema'),
        createdByEmail: editingUser?.createdByEmail || (currentUser?.email || 'system@farmaciassaojoao.com.br'),
        updatedBy: currentUser?.uid || 'system',
        updatedByName: currentUser?.displayName || 'Sistema',
        updatedByEmail: currentUser?.email || 'system@farmaciassaojoao.com.br',
        updatedAt: now,
        lastSeen: editingUser?.lastSeen || undefined,
        photoURL: editingUser?.photoURL || undefined
      };

      await setDoc(doc(db, 'users', finalUid), cleanData(userToSave), { merge: true });
      
      // Log audit
      try {
        const logId = crypto.randomUUID();
        await setDoc(doc(db, 'logs', logId), cleanData({
          id: logId,
          userId: currentUser?.uid || 'system',
          userName: currentUser?.displayName || 'Sistema',
          userEmail: currentUser?.email || 'system',
          action: editingUser ? 'USER_UPDATE' : 'USER_CREATE',
          details: `Usuário ${name} (${normalizedEmail}) ${editingUser ? 'atualizado' : 'criado'}`,
          targetId: finalUid,
          timestamp: now
        }));
      } catch (logErr) {
        console.error("Erro ao logar auditoria de usuário:", logErr);
      }
      closeModal();
    } catch (err: any) {
      console.error("Erro ao salvar usuário:", err);
      setError(err.message || "Erro ao salvar usuário.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (user: UserType) => {
    try {
      await updateDoc(doc(db, 'users', user.id), { isActive: !user.isActive });
    } catch (error) {
      console.error("Erro ao alterar status:", error);
    }
  };

  const handleDelete = async (user: UserType, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user.id === currentUser?.uid) {
      alert("Você não pode excluir seu próprio usuário.");
      return;
    }
    
    setConfirmDeleteId(user.id);
  };

  const confirmDelete = async (user: UserType) => {
    console.log("Iniciando exclusão do usuário:", user.id, user.email);
    
    try {
      setIsDeleting(user.id);
      setError(null);
      await deleteDoc(doc(db, 'users', user.id));
      console.log("Usuário excluído com sucesso.");
      setConfirmDeleteId(null);
      alert("Usuário excluído com sucesso do banco de dados.");
    } catch (error: any) {
      console.error("Erro crítico ao excluir usuário:", error);
      let msg = "Erro ao excluir usuário: ";
      if (error.code === 'permission-denied') {
        msg += "Você não tem permissão no Firebase para excluir usuários. Verifique se você é Admin Master.";
      } else {
        msg += (error.message || "Erro desconhecido.");
      }
      setError(msg);
      alert(msg);
    } finally {
      setIsDeleting(null);
    }
  };

  const handleCleanupAutoUsers = async () => {
    const autoUsers = users.filter(u => {
      // Regras para identificar usuários automáticos:
      // 1. Não tem o campo createdBy (o antigo syncUser não adicionava)
      // 2. Criado pelo 'system' mas não é a Kerolin (o bootstrap usa 'system')
      // 3. Nome contém "Analista Sovos", "Atendente" ou "Atendentes"
      const name = (u.name || '').toUpperCase();
      const isKerolin = (u.email === 'kerolin.siqueira@farmaciassaojoao.com.br' || u.email === 'kerolin11siq@gmail.com');
      
      const isAuto = !u.createdBy || 
                    (u.createdBy === 'system' && !isKerolin) ||
                    name.includes('ANALISTA SOVOS') || 
                    name.includes('ATENDENTE');
                    
      return isAuto && u.id !== currentUser?.uid;
    });

    if (autoUsers.length === 0) {
      alert("Nenhum usuário automático localizado na coleção users.");
      return;
    }

    if (window.confirm(`Localizados ${autoUsers.length} usuários que parecem ter sido criados automaticamente. Deseja excluí-los permanentemente da coleção users?`)) {
      setIsSaving(true);
      try {
        let deleted = 0;
        for (const u of autoUsers) {
          await deleteDoc(doc(db, 'users', u.id));
          deleted++;
        }
        alert(`${deleted} usuários excluídos com sucesso.`);
      } catch (err) {
        console.error("Erro ao limpar usuários:", err);
        alert("Erro ao realizar a limpeza.");
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700 max-w-5xl mx-auto pb-20">
      <div className="bg-white rounded-[2.5rem] border-4 border-[#003DA5] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#003DA5]/5 rounded-full -mr-16 -mt-16" />
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10 mb-8">
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Gestão de Usuários</h2>
            <p className="text-[10px] font-black text-[#003DA5] uppercase tracking-widest leading-none mt-1">Ambiente de Controle FSJ / SOVOS</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleCleanupAutoUsers}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-4 bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Limpar Automáticos
            </button>
            <button 
              onClick={() => openModal()}
              className="flex items-center gap-2 px-6 py-4 bg-[#D91B2A] text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl hover:bg-red-700 transition-all active:scale-95"
            >
              <UserPlus className="w-4 h-4" /> Novo Usuário
            </button>
          </div>
        </div>

        <div className="relative mb-8 z-10">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Buscar por nome ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-3xl font-bold text-sm outline-none focus:border-[#003DA5] transition-all"
          />
        </div>

        <div className="bg-slate-50 rounded-[2rem] overflow-hidden border border-slate-200 z-10 relative">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-100/50">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-left">Usuário</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-left">E-mail</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-center">Perfil</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-center">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-[#003DA5] uppercase border border-slate-200">
                          {(u.name || '??').substring(0, 2)}
                        </div>
                        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{u.name || 'Sem Nome'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-bold">{u.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase inline-flex items-center gap-1.5 ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-[#003DA5]'
                      }`}>
                        <Shield className="w-3 h-3" />
                        {u.role || 'user'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => toggleStatus(u)}
                        className="transition-all hover:scale-110 active:scale-95"
                      >
                        {u.isActive ? (
                          <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                            <Check className="w-3.5 h-3.5" />
                            <span className="text-[9px] font-black uppercase">Ativo</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-3 py-1 rounded-full">
                            <X className="w-3.5 h-3.5" />
                            <span className="text-[9px] font-black uppercase">Inativo</span>
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {confirmDeleteId === u.id ? (
                          <div className="flex items-center gap-2 animate-in slide-in-from-right-4 duration-300">
                            <button 
                              onClick={() => confirmDelete(u)}
                              disabled={isDeleting === u.id}
                              className="px-3 py-1.5 bg-red-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-red-700 transition-all shadow-lg"
                            >
                              Confirmar
                            </button>
                            <button 
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={isDeleting === u.id}
                              className="px-3 py-1.5 bg-slate-200 text-slate-700 text-[9px] font-black uppercase rounded-lg hover:bg-slate-300 transition-all border border-slate-300"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <>
                            <button 
                              onClick={() => openModal(u)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              type="button"
                              onClick={(e) => handleDelete(u, e)}
                              className={`p-2 rounded-xl transition-all ${
                                isDeleting === u.id ? 'opacity-50' : 'text-red-600 hover:bg-red-50'
                              }`}
                              disabled={u.id === currentUser?.uid || isDeleting === u.id}
                            >
                              <Trash2 className={`w-4 h-4 ${isDeleting === u.id ? 'animate-spin' : ''}`} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-[#003DA5]/90 backdrop-blur-xl flex items-center justify-center p-4 z-[200] animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md border-[8px] border-white transform animate-in zoom-in-95 duration-300 flex flex-col max-h-[92vh] overflow-hidden">
            <div className="bg-[#D91B2A] text-white px-8 py-6 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight">{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h2>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Controle de acesso ao monitor</p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-8 space-y-6 overflow-y-auto">
              {error && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3">
                  <X className="w-4 h-4 text-red-600 shrink-0" />
                  <p className="text-[10px] text-red-700 font-bold uppercase">{error}</p>
                </div>
              )}

              <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-5 space-y-3">
                <p className="text-[10px] font-black text-blue-800 uppercase tracking-tight flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Controle Corporativo
                </p>
                <div className="text-[9px] text-blue-700 font-bold uppercase space-y-1">
                  <p>• Usuários de e-mail e senha apenas</p>
                  <p>• Senha inicial definida pelo administrador</p>
                  <p>• Acesso restrito a e-mails cadastrados</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-[#003DA5] transition-all"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail Corporativo</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="exemplo@farmaciassaojoao.com.br"
                    className={`w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none transition-all ${
                      editingUser && !!email ? 'opacity-50 cursor-not-allowed' : 'focus:border-[#003DA5]'
                    }`}
                    required
                    disabled={!!editingUser && !!email}
                  />
                </div>

                {!editingUser && (
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha Inicial</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full pl-12 pr-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-[#003DA5] transition-all"
                        required
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Perfil</label>
                    <select 
                      value={role}
                      onChange={(e) => setRole(e.target.value as any)}
                      className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-[#003DA5] transition-all"
                    >
                      <option value="user">Usuário</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                    <div className="flex items-center gap-1.5 mt-2">
                       <button 
                        type="button"
                        onClick={() => setIsActive(!isActive)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all font-black text-[10px] uppercase ${
                          isActive ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-red-50 border-red-500 text-red-700'
                        }`}
                       >
                         {isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                         {isActive ? 'Ativo' : 'Inativo'}
                       </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-4 bg-[#003DA5] text-white font-black uppercase text-xs rounded-2xl shadow-xl hover:bg-blue-800 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
