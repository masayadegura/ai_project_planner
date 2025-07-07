import { supabase } from '../lib/supabase';
import { ProjectTask } from '../types';

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  invitedBy?: string;
  invitedAt: string;
  joinedAt?: string;
  status: 'pending' | 'active' | 'inactive';
  userEmail?: string;
  userName?: string;
}

export interface ProjectInvitation {
  id: string;
  projectId: string;
  email: string;
  role: 'admin' | 'member';
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired';
  inviterName?: string;
  projectTitle?: string;
}

export interface ActivityLogEntry {
  id: string;
  projectId: string;
  userId?: string;
  action: string;
  details: any;
  createdAt: string;
  userName?: string;
}

export class ProjectCollaborationService {
  // プロジェクトメンバーを取得
  static async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    const { data, error } = await supabase
      .from('project_members')
      .select(`
        *,
        user:auth.users(email)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`メンバー情報の取得に失敗しました: ${error.message}`);
    }

    return data.map(member => ({
      id: member.id,
      projectId: member.project_id,
      userId: member.user_id,
      role: member.role,
      invitedBy: member.invited_by,
      invitedAt: member.invited_at,
      joinedAt: member.joined_at,
      status: member.status,
      userEmail: member.user?.email,
      userName: member.user?.email?.split('@')[0] || 'Unknown',
    }));
  }

  // プロジェクトに招待を送信
  static async inviteToProject(
    projectId: string,
    email: string,
    role: 'admin' | 'member'
  ): Promise<ProjectInvitation> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('ログインが必要です');
    }

    // 既存の招待をチェック
    const { data: existingInvitation } = await supabase
      .from('project_invitations')
      .select('*')
      .eq('project_id', projectId)
      .eq('email', email)
      .eq('status', 'pending')
      .single();

    if (existingInvitation) {
      throw new Error('このメールアドレスには既に招待が送信されています');
    }

    // 既にメンバーかチェック
    const { data: existingMember } = await supabase
      .from('project_members')
      .select('user_id, auth.users(email)')
      .eq('project_id', projectId)
      .eq('status', 'active');

    const memberEmails = existingMember?.map(m => m.user?.email) || [];
    if (memberEmails.includes(email)) {
      throw new Error('このユーザーは既にプロジェクトのメンバーです');
    }

    const { data, error } = await supabase
      .from('project_invitations')
      .insert({
        project_id: projectId,
        email,
        role,
        invited_by: user.id,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`招待の送信に失敗しました: ${error.message}`);
    }

    return {
      id: data.id,
      projectId: data.project_id,
      email: data.email,
      role: data.role,
      invitedBy: data.invited_by,
      invitedAt: data.invited_at,
      expiresAt: data.expires_at,
      status: data.status,
    };
  }

  // 招待を受諾
  static async acceptInvitation(invitationId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('ログインが必要です');
    }

    // 招待情報を取得
    const { data: invitation, error: inviteError } = await supabase
      .from('project_invitations')
      .select('*')
      .eq('id', invitationId)
      .eq('email', user.email)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invitation) {
      throw new Error('有効な招待が見つかりません');
    }

    // 期限チェック
    if (new Date(invitation.expires_at) < new Date()) {
      throw new Error('招待の有効期限が切れています');
    }

    // トランザクション処理
    const { error } = await supabase.rpc('accept_project_invitation', {
      invitation_id: invitationId,
      user_id: user.id,
    });

    if (error) {
      throw new Error(`招待の受諾に失敗しました: ${error.message}`);
    }
  }

  // ユーザーの招待一覧を取得
  static async getUserInvitations(): Promise<ProjectInvitation[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('ログインが必要です');
    }

    const { data, error } = await supabase
      .from('project_invitations')
      .select(`
        *,
        inviter:auth.users!invited_by(email),
        project:projects(title)
      `)
      .eq('email', user.email)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('invited_at', { ascending: false });

    if (error) {
      throw new Error(`招待一覧の取得に失敗しました: ${error.message}`);
    }

    return data.map(invitation => ({
      id: invitation.id,
      projectId: invitation.project_id,
      email: invitation.email,
      role: invitation.role,
      invitedBy: invitation.invited_by,
      invitedAt: invitation.invited_at,
      expiresAt: invitation.expires_at,
      status: invitation.status,
      inviterName: invitation.inviter?.email?.split('@')[0] || 'Unknown',
      projectTitle: invitation.project?.title || 'Unknown Project',
    }));
  }

  // メンバーの役割を更新
  static async updateMemberRole(
    projectId: string,
    userId: string,
    newRole: 'admin' | 'member'
  ): Promise<void> {
    const { error } = await supabase
      .from('project_members')
      .update({ role: newRole })
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`メンバーの役割更新に失敗しました: ${error.message}`);
    }
  }

  // メンバーを削除
  static async removeMember(projectId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`メンバーの削除に失敗しました: ${error.message}`);
    }
  }

  // アクティビティログを記録
  static async logActivity(
    projectId: string,
    action: string,
    details: any = {}
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('project_activity_log')
      .insert({
        project_id: projectId,
        user_id: user.id,
        action,
        details,
      });
  }

  // アクティビティログを取得
  static async getActivityLog(projectId: string, limit: number = 50): Promise<ActivityLogEntry[]> {
    const { data, error } = await supabase
      .from('project_activity_log')
      .select(`
        *,
        user:auth.users(email)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`アクティビティログの取得に失敗しました: ${error.message}`);
    }

    return data.map(entry => ({
      id: entry.id,
      projectId: entry.project_id,
      userId: entry.user_id,
      action: entry.action,
      details: entry.details,
      createdAt: entry.created_at,
      userName: entry.user?.email?.split('@')[0] || 'Unknown',
    }));
  }

  // リアルタイム更新の購読
  static subscribeToProjectUpdates(
    projectId: string,
    onUpdate: (payload: any) => void
  ) {
    return supabase
      .channel(`project-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
          filter: `id=eq.${projectId}`,
        },
        onUpdate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_members',
          filter: `project_id=eq.${projectId}`,
        },
        onUpdate
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_activity_log',
          filter: `project_id=eq.${projectId}`,
        },
        onUpdate
      )
      .subscribe();
  }

  // ユーザーのプロジェクト権限を確認
  static async getUserProjectRole(projectId: string): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (error) return null;
    return data.role;
  }
}

// Supabase関数（招待受諾用）
// この関数はSupabaseのSQL Editorで実行する必要があります
/*
CREATE OR REPLACE FUNCTION accept_project_invitation(
  invitation_id uuid,
  user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  invitation_record record;
BEGIN
  -- 招待情報を取得
  SELECT * INTO invitation_record
  FROM project_invitations
  WHERE id = invitation_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation';
  END IF;

  -- 期限チェック
  IF invitation_record.expires_at < now() THEN
    RAISE EXCEPTION 'Invitation expired';
  END IF;

  -- メンバーテーブルに追加
  INSERT INTO project_members (project_id, user_id, role, invited_by, status, joined_at)
  VALUES (invitation_record.project_id, user_id, invitation_record.role, invitation_record.invited_by, 'active', now());

  -- 招待ステータスを更新
  UPDATE project_invitations
  SET status = 'accepted', updated_at = now()
  WHERE id = invitation_id;
END;
$$;
*/