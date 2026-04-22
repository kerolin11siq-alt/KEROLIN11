
import React, { useState } from 'react';
import { ViewType, MuralNotification } from '../types';
import { LayoutDashboard, Table as TableIcon, Database, ShieldCheck, MessageSquare, BarChart3, Bell, X, Check, Search } from 'lucide-react';

interface HeaderProps {
  activeTab: ViewType;
  onTabChange: (tab: ViewType) => void;
  dbStatus?: 'ONLINE' | 'OFFLINE';
  userName?: string;
  onEditUser?: () => void;
  notifications?: MuralNotification[];
  onNotificationClick?: (notification: MuralNotification) => void;
  onClearNotifications?: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  activeTab, 
  onTabChange, 
  dbStatus = 'ONLINE', 
  userName, 
  onEditUser,
  notifications = [],
  onNotificationClick,
  onClearNotifications
}) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  
  const unreadCount = notifications.filter(n => !n.read && (n.userId === userName || n.userId.toLowerCase() === 'todos')).length;
  const myNotifications = notifications.filter(n => n.userId === userName || n.userId.toLowerCase() === 'todos');

  return (
    <header className="bg-[#003DA5] sticky top-0 z-50 border-b-[6px] border-[#D91B2A] shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between py-4 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2 rounded-xl shadow-inner">
            <ShieldCheck className="w-8 h-8 text-[#003DA5]" />
          </div>
          <div className="text-white">
            <h1 className="text-xl font-black leading-none tracking-tight uppercase">
              FSJ <span className="text-blue-200">Acompanhamento</span>
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white mt-1">Cases Sovos</p>
          </div>
        </div>

        <nav className="flex bg-white/10 p-1 rounded-2xl backdrop-blur-md">
          <button
            onClick={() => onTabChange('management')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-normal transition-all ${
              activeTab === 'management'
                ? 'bg-white text-[#003DA5] shadow-lg scale-105'
                : 'text-white/90 hover:text-white hover:bg-white/10'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Painel de Gestão
          </button>
          <button
            onClick={() => onTabChange('search')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-normal transition-all ${
              activeTab === 'search'
                ? 'bg-white text-[#003DA5] shadow-lg scale-105'
                : 'text-white/90 hover:text-white hover:bg-white/10'
            }`}
          >
            <Search className="w-4 h-4" />
            Consulta Inteligente
          </button>
          <button
            onClick={() => onTabChange('table')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-normal transition-all ${
              activeTab === 'table'
                ? 'bg-white text-[#003DA5] shadow-lg scale-105'
                : 'text-white/90 hover:text-white hover:bg-white/10'
            }`}
          >
            <TableIcon className="w-4 h-4" />
            Base de Dados
          </button>
          <button
            onClick={() => onTabChange('mural')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-normal transition-all ${
              activeTab === 'mural'
                ? 'bg-white text-[#003DA5] shadow-lg scale-105'
                : 'text-white/90 hover:text-white hover:bg-white/10'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Mural Operacional
          </button>
          <button
            onClick={() => onTabChange('dashboard')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-normal transition-all ${
              activeTab === 'dashboard'
                ? 'bg-white text-[#003DA5] shadow-lg scale-105'
                : 'text-white/90 hover:text-white hover:bg-white/10'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Analytics
          </button>
        </nav>
        
        <div className="flex items-center gap-4 pl-6 border-l border-white/20">
           {/* NOTIFICATIONS */}
           <div className="relative">
             <button 
               onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
               className="relative p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all"
             >
               <Bell className="w-5 h-5" />
               {unreadCount > 0 && (
                 <span className="absolute top-1 right-1 w-4 h-4 bg-[#D91B2A] text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 border-[#003DA5] animate-pulse">
                   {unreadCount}
                 </span>
               )}
             </button>

             {isNotificationsOpen && (
               <div className="absolute right-0 mt-4 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-[60] animate-in slide-in-from-top-2 duration-200">
                 <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                   <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Notificações</h3>
                   <button 
                     onClick={onClearNotifications}
                     className="text-[9px] font-black text-[#003DA5] uppercase hover:underline"
                   >
                     Limpar Tudo
                   </button>
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
                         className={`w-full p-4 text-left border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-3 ${!notification.read ? 'bg-blue-50/30' : ''}`}
                       >
                         <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${notification.type === 'mention' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                           {notification.type === 'mention' ? <MessageSquare className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                         </div>
                         <div className="flex-1">
                           <p className="text-xs font-bold text-slate-800 leading-tight">
                             <span className="text-[#003DA5]">@{notification.authorName}</span> mencionou você em:
                           </p>
                           <p className="text-[10px] text-slate-600 mt-1 line-clamp-1">{notification.postTitle}</p>
                           <p className="text-[8px] text-slate-400 mt-1 font-bold uppercase">Há alguns instantes</p>
                         </div>
                         {!notification.read && <div className="w-2 h-2 rounded-full bg-[#D91B2A] mt-2"></div>}
                       </button>
                     ))
                   ) : (
                     <div className="p-8 text-center">
                       <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                       <p className="text-[10px] font-bold text-slate-400 uppercase">Nenhuma notificação</p>
                     </div>
                   )}
                 </div>
               </div>
             )}
           </div>

           {userName && (
             <button 
               onClick={onEditUser}
               className="flex flex-col items-end group cursor-pointer"
             >
               <p className="text-[8px] font-black text-blue-200 uppercase leading-none mb-1 group-hover:text-white transition-colors">Usuário Ativo</p>
               <p className="text-[11px] font-black text-white uppercase tracking-tight group-hover:underline decoration-blue-300 underline-offset-4">{userName}</p>
             </button>
           )}
           <div className="hidden lg:block text-right">
              <p className="text-[8px] font-black text-blue-200 uppercase leading-none mb-1">Status Operacional</p>
              <div className="flex items-center gap-2 justify-end">
                 <span className={`text-[10px] font-black ${dbStatus === 'ONLINE' ? 'text-emerald-400' : 'text-red-400'}`}>
                   {dbStatus === 'ONLINE' ? 'SISTEMA ONLINE' : 'DATABASE OFFLINE'}
                 </span>
                 <Database className={`w-3.5 h-3.5 ${dbStatus === 'ONLINE' ? 'text-emerald-400' : 'text-red-400'}`} />
              </div>
           </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
