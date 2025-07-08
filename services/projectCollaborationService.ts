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
        users!user_id(email)
      `)
      .eq('project_id', projectId)
      .eq('status', 'active')
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
      userEmail: member.users?.email,
      userName: member.users?.email?.split('@')[0] || 'Unknown',
    }));
  }

  // プロジェクトの招待一覧を取得
  static async getProjectInvitations(projectId: string): Promise<ProjectInvitation[]> {
    const { data, error } = await supabase
      .from('project_invitations')
      .select(`
        *,
        inviter:users!invited_by(email)
      `)
      .eq('project_id', projectId)
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
    const { data: existingMembers } = await supabase
      .from('project_members')
      .select(`
        user_id,
        users!user_id(email)
      `)
      .eq('project_id', projectId)
      .eq('status', 'active');

    const memberEmails = existingMembers?.map(m => m.users?.email) || [];
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

    // メンバーテーブルに追加
    const { error: memberError } = await supabase
      .from('project_members')
      .insert({
        project_id: invitation.project_id,
        user_id: user.id,
        role: invitation.role,
        invited_by: invitation.invited_by,
        status: 'active',
        joined_at: new Date().toISOString(),
      });

    if (memberError) {
      throw new Error(`メンバー追加に失敗しました: ${memberError.message}`);
    }

    // 招待ステータスを更新
    const { error: updateError } = await supabase
      .from('project_invitations')
      .update({ 
        status: 'accepted',
        updated_at: new Date().toISOString()
      })
      .eq('id', invitationId);

    if (updateError) {
      throw new Error(`招待ステータスの更新に失敗しました: ${updateError.message}`);
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
        inviter:users!invited_by(email),
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
        user:users!user_id(email)
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

  // 管理者かどうかをチェック
  static async isAdmin(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    
    // 管理者のメールアドレスをチェック
    return user.email === 'administrator@example.com';
  }

  // 全プロジェクトを取得（管理者用）
  static async getAllProjects(): Promise<any[]> {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        user:users!user_id(email),
        member_count:project_members(count)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`プロジェクト一覧の取得に失敗しました: ${error.message}`);
    }

    return data;
  }

  // 全ユーザーを取得（管理者用）
  static async getAllUsers(): Promise<any[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`ユーザー一覧の取得に失敗しました: ${error.message}`);
    }

    return data;
  }
}