import React, { useState, useEffect } from 'react';
import { XIcon, UserIcon, FolderIcon, TrashIcon, CrownIcon } from './icons';
import { ProjectCollaborationService } from '../services/projectCollaborationService';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'projects' | 'users'>('projects');
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === 'projects') {
        const projectData = await ProjectCollaborationService.getAllProjects();
        setProjects(projectData);
      } else {
        const userData = await ProjectCollaborationService.getAllUsers();
        setUsers(userData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <CrownIcon className="w-8 h-8 text-yellow-600" />
            <h3 className="text-xl font-bold text-slate-800">管理者ダッシュボード</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 transition-colors p-1 rounded-full hover:bg-slate-100"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-grow flex flex-col overflow-hidden">
          {/* タブナビゲーション */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'projects'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <FolderIcon className="w-5 h-5 inline mr-2" />
              プロジェクト管理
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <UserIcon className="w-5 h-5 inline mr-2" />
              ユーザー管理
            </button>
          </div>

          {/* コンテンツエリア */}
          <div className="flex-grow p-6 overflow-y-auto">
            {error && <ErrorMessage message={error} />}

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="lg" text="データを読み込み中..." />
              </div>
            ) : (
              <>
                {activeTab === 'projects' && (
                  <div>
                    <h4 className="text-lg font-semibold text-slate-800 mb-4">
                      全プロジェクト ({projects.length}件)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left p-3 font-semibold text-slate-700">プロジェクト名</th>
                            <th className="text-left p-3 font-semibold text-slate-700">所有者</th>
                            <th className="text-left p-3 font-semibold text-slate-700">メンバー数</th>
                            <th className="text-left p-3 font-semibold text-slate-700">作成日</th>
                            <th className="text-left p-3 font-semibold text-slate-700">最終更新</th>
                            <th className="text-left p-3 font-semibold text-slate-700">アクション</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {projects.map((project) => (
                            <tr key={project.id} className="hover:bg-slate-50">
                              <td className="p-3">
                                <div>
                                  <p className="font-medium text-slate-800">{project.title}</p>
                                  <p className="text-xs text-slate-500 truncate max-w-xs">
                                    {project.goal}
                                  </p>
                                </div>
                              </td>
                              <td className="p-3 text-slate-600">
                                {project.user?.email || 'Unknown'}
                              </td>
                              <td className="p-3 text-slate-600">
                                {project.member_count?.[0]?.count || 0}
                              </td>
                              <td className="p-3 text-slate-600">
                                {new Date(project.created_at).toLocaleDateString('ja-JP')}
                              </td>
                              <td className="p-3 text-slate-600">
                                {new Date(project.updated_at).toLocaleDateString('ja-JP')}
                              </td>
                              <td className="p-3">
                                <button
                                  onClick={() => {
                                    if (confirm('このプロジェクトを削除しますか？この操作は取り消せません。')) {
                                      // TODO: プロジェクト削除機能を実装
                                    }
                                  }}
                                  className="text-red-500 hover:text-red-700 p-1 rounded"
                                  title="削除"
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'users' && (
                  <div>
                    <h4 className="text-lg font-semibold text-slate-800 mb-4">
                      全ユーザー ({users.length}人)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left p-3 font-semibold text-slate-700">メールアドレス</th>
                            <th className="text-left p-3 font-semibold text-slate-700">登録日</th>
                            <th className="text-left p-3 font-semibold text-slate-700">最終ログイン</th>
                            <th className="text-left p-3 font-semibold text-slate-700">ステータス</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {users.map((user) => (
                            <tr key={user.id} className="hover:bg-slate-50">
                              <td className="p-3 font-medium text-slate-800">
                                {user.email}
                              </td>
                              <td className="p-3 text-slate-600">
                                {new Date(user.created_at).toLocaleDateString('ja-JP')}
                              </td>
                              <td className="p-3 text-slate-600">
                                {user.last_sign_in_at 
                                  ? new Date(user.last_sign_in_at).toLocaleDateString('ja-JP')
                                  : '未ログイン'
                                }
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  user.email_confirmed_at 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {user.email_confirmed_at ? 'アクティブ' : '未確認'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="p-6 bg-slate-50 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700"
          >
            閉じる
          </button>
        </footer>
      </div>
    </div>
  );
};

export default AdminDashboard;