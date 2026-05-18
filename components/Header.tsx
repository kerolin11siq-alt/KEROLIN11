
import React, { useState } from 'react';
import { ViewType, MuralNotification, User, User as UserType } from '../types';
import { LayoutDashboard, Table as TableIcon, Database, ShieldCheck, MessageSquare, BarChart3, Bell, X, Check, Search, LogIn, LogOut, User as UserIcon, Users, UserCog } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';

interface HeaderProps {
  activeTab: ViewType;
  onTabChange: (tab: ViewType) => void;
  dbStatus?: 'ONLINE' | 'OFFLINE';
  userName?: string;
  onEditUser?: () => void;
  notifications?: MuralNotification[];
  onNotificationClick?: (notification: MuralNotification) => void;
  onClearNotifications?: () => void;
  currentUser: FirebaseUser | null;
  userData: UserType | null;
  onLogin: (type?: 'google' | 'email') => void;
  onLogout: () => void;
  onBootstrap?: () => void;
  users?: User[];
}

const Header: React.FC<HeaderProps> = ({ 
  activeTab, 
  onTabChange, 
  dbStatus = 'ONLINE', 
  userName, 
  onEditUser,
  notifications = [],
  onNotificationClick,
  onClearNotifications,
  currentUser,
  userData,
  onLogin,
  onLogout,
  onBootstrap,
  users = []
}) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLoginMenuOpen, setIsLoginMenuOpen] = useState(false);
  const [isUsersMenuOpen, setIsUsersMenuOpen] = useState(false);
  
  const unreadCount = notifications.filter(n => !n.read && (n.userId === userName || (n.userId || '').toLowerCase() === 'todos')).length;
  const myNotifications = notifications.filter(n => n.userId === userName || (n.userId || '').toLowerCase() === 'todos');

  const onlineUsers = users.filter(u => {
    if (!u.lastSeen) return false;
    const lastSeenDate = new Date(u.lastSeen);
    const now = new Date();
    // Considera online se marcado como isOnline E visto nos últimos 5 minutos
    return u.isOnline && (now.getTime() - lastSeenDate.getTime() < 300000);
  });

  return (
    <header className="bg-[#003DA5] sticky top-0 z-50 border-b-4 border-[#D91B2A] shadow-lg">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 flex items-center justify-between h-20">
        {/* LOGO & TITLE */}
        <div className="flex items-center gap-4 min-w-[240px]">
          <div className="bg-white p-2.5 rounded-2xl shadow-xl transform -rotate-1 group hover:rotate-0 transition-transform duration-300">
            <ShieldCheck className="w-7 h-7 text-[#003DA5]" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-black text-white leading-tight tracking-tight uppercase">
              FSJ <span className="text-blue-300">MONITOR</span>
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200/80">Monitoramento SOVOS</p>
          </div>
        </div>

        {/* MAIN NAVIGATION */}
        <nav className="hidden lg:flex items-center bg-white/5 p-1.5 rounded-2xl border border-white/10 backdrop-blur-sm">
          {(currentUser?.email?.toLowerCase() === 'kerolin.siqueira@farmaciassaojoao.com.br' || currentUser?.email?.toLowerCase() === 'kerolin11siq@gmail.com') && (
            <button
              onClick={onBootstrap}
              className="flex items-center gap-2.5 px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.4)] animate-all hover:bg-emerald-600 transition-all mr-4 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              Sincronizar Master
            </button>
          )}
          {[
            { id: 'management', label: 'Gestão', icon: BarChart3 },
            { id: 'search', label: 'Consulta', icon: Search },
            { id: 'table', label: 'Base', icon: TableIcon },
            { id: 'mural', label: 'Mural', icon: MessageSquare },
            { id: 'dashboard', label: 'Analytics', icon: LayoutDashboard },
            ...(userData?.role === 'admin' ? [{ id: 'users', label: 'Usuários', icon: UserCog }] : [])
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id as ViewType)}
              className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                activeTab === item.id
                  ? 'bg-white text-[#003DA5] shadow-xl scale-105'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              <item.icon className={`w-4 h-4 ${activeTab === item.id ? 'animate-pulse' : ''}`} />
              {item.label}
            </button>
          ))}
        </nav>
        
        {/* RIGHT ACTIONS BAR */}
        <div className="flex items-center gap-3 lg:gap-6">
          {/* SYSTEM STATUS CLUSTER */}
          <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-r border-white/10">
            <div className="relative">
              <button 
                onClick={() => setIsUsersMenuOpen(!isUsersMenuOpen)}
                className="flex items-center gap-2 group transition-all"
                title="Usuários Ativos"
              >
                <div className="relative">
                  <Users className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-white leading-none">{onlineUsers.length}</p>
                  <p className="text-[7px] font-bold text-blue-200 uppercase tracking-tighter">Online</p>
                </div>
              </button>

              {isUsersMenuOpen && (
                <div className="absolute right-0 mt-6 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-[70] animate-in slide-in-from-top-2">
                  <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Colaboradores no Acesso</h3>
                    <span className="bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full text-[9px] font-black">
                      {onlineUsers.length}
                    </span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {onlineUsers.length > 0 ? (
                      onlineUsers.map(u => (
                        <div key={u.id} className="p-3 border-b border-slate-50 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                          <div className="relative shrink-0">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt={u.name} className="w-8 h-8 rounded-full border border-slate-200 shadow-sm" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                                <UserIcon className="w-4 h-4" />
                              </div>
                            )}
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></div>
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-[11px] font-black text-slate-800 uppercase truncate">{u.name}</p>
                            <p className="text-[8px] text-emerald-600 font-black uppercase flex items-center gap-1">
                              <span className="w-1 h-1 bg-emerald-500 rounded-full"></span> Ativo
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-slate-400">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Monitorando conexões...</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dbStatus === 'ONLINE' ? 'bg-emerald-400' : 'bg-rose-400'} animate-pulse`}></div>
              <div className="text-left">
                <p className={`text-[9px] font-black ${dbStatus === 'ONLINE' ? 'text-emerald-400' : 'text-rose-400'} uppercase tracking-tighter leading-none`}>
                  {dbStatus === 'ONLINE' ? 'CloudSync' : 'Desconectado'}
                </p>
                <p className="text-[7px] font-bold text-blue-200 uppercase tracking-tighter">Status DB</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* NOTIFICATIONS */}
            <div className="relative">
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className={`relative p-2.5 rounded-xl transition-all duration-300 ${
                  isNotificationsOpen ? 'bg-white text-[#003DA5] shadow-inner' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-[#D91B2A] text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 border-[#003DA5] shadow-lg animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-6 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-[70] animate-in slide-in-from-top-2">
                  <div className="p-4 bg-blue-600 border-b border-blue-700 flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Central de Notificações</h3>
                    {myNotifications.length > 0 && (
                      <button 
                        onClick={onClearNotifications}
                        className="text-[9px] font-black text-blue-100 uppercase hover:text-white transition-colors underline underline-offset-4"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {myNotifications.length > 0 ? (
                      myNotifications.map(notification => (
                        <button
                          key={notification.id}
                          onClick={() => {
                            onNotificationClick?.(notification);
                            setIsNotificationsOpen(false);
                          }}
                          className={`w-full p-4 text-left border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-3 ${!notification.read ? 'bg-blue-50/50' : ''}`}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${notification.type === 'mention' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}`}>
                            {notification.type === 'mention' ? <MessageSquare className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-slate-800 leading-tight">
                              <span className="text-blue-700 font-black">@{notification.authorName}</span> mencionou você
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 truncate italic">"{notification.postTitle}"</p>
                            <p className="text-[8px] text-slate-400 mt-1 font-black uppercase tracking-wide">Recente</p>
                          </div>
                          {!notification.read && <div className="w-2 h-2 rounded-full bg-[#D91B2A] mt-3 animate-pulse shrink-0"></div>}
                        </button>
                      ))
                    ) : (
                      <div className="p-10 text-center bg-slate-50/50">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                          <Bell className="w-8 h-8 text-slate-200" />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tudo limpo por aqui</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* USER PROFILE */}
            <div className="flex items-center gap-3">
              {currentUser ? (
                <div className="flex items-center gap-2 lg:gap-4 pl-3 border-l border-white/10">
                  <div className="hidden xl:flex flex-col items-end">
                    <p className="text-[7px] font-black text-blue-200 uppercase leading-none mb-1 tracking-tighter">
                      Membro Autenticado
                    </p>
                    <p className="text-[11px] font-black text-white uppercase tracking-tight truncate max-w-[120px]">
                      {userName || currentUser.displayName || 'Usuário'}
                    </p>
                  </div>
                  <div className="relative group">
                    {currentUser.photoURL ? (
                      <img src={currentUser.photoURL} alt="User" className="w-9 h-9 rounded-xl border-2 border-white/20 group-hover:border-white/50 transition-colors shadow-lg" />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white border-2 border-white/20 group-hover:border-white/50 transition-colors shadow-lg">
                        <UserIcon className="w-5 h-5" />
                      </div>
                    )}
                    <button 
                      onClick={onLogout}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-[#D91B2A] text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 active:scale-95"
                      title="Sair do sistema"
                    >
                      <LogOut className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative group">
                  <button 
                    onClick={() => onLogin()}
                    className="flex items-center gap-2.5 px-5 py-2.5 bg-white text-[#003DA5] rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:bg-blue-50 transition-all hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <LogIn className="w-4 h-4" />
                    Acessar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
