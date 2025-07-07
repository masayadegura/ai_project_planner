import React, { useState, useEffect } from 'react';
import { XIcon, CheckIcon, UserIcon } from './icons';
import { ProjectCollaborationService, ProjectInvitation } from '../services/projectCollaborationService';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

interface InvitationNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvitationAccepted: () => void;
}

const InvitationNotificationModal: React.FC<InvitationNotificationModalProps> = ({
  isOpen,
  onClose,
  onInvitationAccepted,
}) => {
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingInvitations, setProcessingInvitations] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      loadInvitations();
    }
  }, [isOpen]);

  const loadInvitations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ProjectCollaborationService.getUserInvitations();
      setInvitations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待一覧の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    setProcessingInvitations(prev => new Set(prev).add(invitationId));
    setError(null);
    try {
      await ProjectCollaborationService.acceptInvitation(invitationId);
      await loadInvitations();
      onInvitationAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待の受諾に失敗しました');
    } finally {
      setProcessingInvitations(prev => {
        const newSet = new Set(prev);
        newSet.delete(invitationId);
        return newSet;
      });
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return '管理者';
      case 'member':
        return 'メンバー';
      default:
        return role;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between p-6 border-b border-slate-200">
          <h3 className="text-xl font-bold text-slate-800">プロジェクト招待</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 transition-colors p-1 rounded-full hover:bg-slate-100"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-grow p-6 overflow-y-auto">
          {error && <ErrorMessage message={error} />}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" text="招待を確認中..." />
            </div>
          ) : invitations.length === 0 ? (
            <div className="text-center py-12">
              <UserIcon className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-500 text-lg">新しい招待はありません</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-slate-600 mb-4">
                以下のプロジェクトに招待されています：
              </p>
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="p-4 border border-slate-200 rounded-lg bg-slate-50"
                >
                  <div className="mb-3">
                    <h4 className="font-semibold text-slate-800 mb-1">
                      {invitation.projectTitle}
                    </h4>
                    <p className="text-sm text-slate-600">
                      {invitation.inviterName}さんから{getRoleLabel(invitation.role)}として招待されました
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      招待日: {new Date(invitation.invitedAt).toLocaleDateString('ja-JP')} | 
                      有効期限: {new Date(invitation.expiresAt).toLocaleDateString('ja-JP')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptInvitation(invitation.id)}
                      disabled={processingInvitations.has(invitation.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-slate-400 text-sm"
                    >
                      {processingInvitations.has(invitation.id) ? (
                        <LoadingSpinner size="sm" color="border-white" />
                      ) : (
                        <CheckIcon className="w-4 h-4" />
                      )}
                      参加する
                    </button>
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

export default InvitationNotificationModal;