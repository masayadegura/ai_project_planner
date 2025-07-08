import React, { useState, useEffect } from 'react';
import { XIcon, PlusIcon, TrashIcon, UserIcon, CrownIcon, ShieldIcon } from './icons';
import { ProjectCollaborationService, ProjectMember, ProjectInvitation } from '../services/projectCollaborationService';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

interface ProjectMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  userRole: string | null;
}

const ProjectMembersModal: React.FC<ProjectMembersModalProps> = ({
  isOpen,
  onClose,
  projectId,
  userRole,
}) => {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [isInviting, setIsInviting] = useState(false);

  const canManageMembers = userRole === 'owner' || userRole === 'admin';

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, projectId]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [membersData, invitationsData] = await Promise.all([
        ProjectCollaborationService.getProjectMembers(projectId),
        canManageMembers ? ProjectCollaborationService.getProjectInvitations(projectId) : Promise.resolve([]),
      ]);
      setMembers(membersData);
      setInvitations(invitationsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }

    setIsInviting(true);
    setError(null);
    try {
      await ProjectCollaborationService.inviteToProject(projectId, inviteEmail, inviteRole);
      setInviteEmail('');
      setInviteRole('member');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待の送信に失敗しました');
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: 'admin' | 'member') => {
    try {
      await ProjectCollaborationService.updateMemberRole(projectId, userId, newRole);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '役割の更新に失敗しました');
    }
  };

  const handleRemoveMember = async (userId: string, userName: string) => {
    if (!confirm(`${userName}をプロジェクトから削除しますか？`)) {
      return;
    }

    try {
      await ProjectCollaborationService.removeMember(projectId, userId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'メンバーの削除に失敗しました');
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <CrownIcon className="w-4 h-4 text-yellow-600" />;
      case 'admin':
        return <ShieldIcon className="w-4 h-4 text-blue-600" />;
      default:
        return <UserIcon className="w-4 h-4 text-slate-600" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return '所有者';
      case 'admin':
        return '管理者';
      default:
        return 'メンバー';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between p-6 border-b border-slate-200">
          <h3 className="text-xl font-bold text-slate-800">プロジェクトメンバー</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 transition-colors p-1 rounded-full hover:bg-slate-100"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-grow p-6 overflow-y-auto">
          {error && <ErrorMessage message={error} />}

          {/* 招待フォーム */}
          {canManageMembers && (
            <div className="mb-6 p-4 bg-slate-50 rounded-lg">
              <h4 className="font-semibold text-slate-800 mb-3">新しいメンバーを招待</h4>
              <div className="flex gap-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="メールアドレス"
                  className="flex-grow px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                  className="px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="member">メンバー</option>
                  <option value="admin">管理者</option>
                </select>
                <button
                  onClick={handleInvite}
                  disabled={isInviting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400"
                >
                  {isInviting ? <LoadingSpinner size="sm" color="border-white" /> : <PlusIcon className="w-4 h-4" />}
                  招待
                </button>
              </div>
            </div>
          )}

          {/* 招待一覧 */}
          {invitations.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-slate-800 mb-3">送信済み招待</h4>
              <div className="space-y-2">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{invitation.email}</p>
                      <p className="text-sm text-slate-500">
                        {getRoleLabel(invitation.role)} として招待中 | 
                        期限: {new Date(invitation.expiresAt).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                      招待中
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* メンバー一覧 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" text="メンバー情報を読み込み中..." />
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-800">現在のメンバー ({members.length}人)</h4>
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getRoleIcon(member.role)}
                    <div>
                      <p className="font-medium text-slate-800">
                        {member.userName || member.userEmail}
                      </p>
                      <p className="text-sm text-slate-500">{member.userEmail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600 bg-slate-200 px-2 py-1 rounded">
                      {getRoleLabel(member.role)}
                    </span>
                    {canManageMembers && member.role !== 'owner' && (
                      <div className="flex items-center gap-1">
                        {member.role !== 'admin' && (
                          <button
                            onClick={() => handleUpdateRole(member.userId, 'admin')}
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            title="管理者に昇格"
                          >
                            管理者に
                          </button>
                        )}
                        {member.role === 'admin' && (
                          <button
                            onClick={() => handleUpdateRole(member.userId, 'member')}
                            className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                            title="メンバーに降格"
                          >
                            メンバーに
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveMember(member.userId, member.userName || member.userEmail || '')}
                          className="p-1 text-red-500 hover:text-red-700 rounded hover:bg-red-100"
                          title="削除"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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

export default ProjectMembersModal;