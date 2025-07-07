/*
  # 多人数プロジェクト管理機能の追加

  1. 新しいテーブル
    - `project_members`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `user_id` (uuid, foreign key to auth.users)
      - `role` (text) - 'owner', 'admin', 'member'
      - `invited_by` (uuid, foreign key to auth.users)
      - `invited_at` (timestamp)
      - `joined_at` (timestamp)
      - `status` (text) - 'pending', 'active', 'inactive'

    - `project_invitations`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `email` (text)
      - `role` (text) - 'admin', 'member'
      - `invited_by` (uuid, foreign key to auth.users)
      - `invited_at` (timestamp)
      - `expires_at` (timestamp)
      - `status` (text) - 'pending', 'accepted', 'expired'

    - `project_activity_log`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `user_id` (uuid, foreign key to auth.users)
      - `action` (text) - 'task_updated', 'member_added', etc.
      - `details` (jsonb)
      - `created_at` (timestamp)

  2. セキュリティ
    - プロジェクトメンバーテーブルでRLSを有効化
    - プロジェクト招待テーブルでRLSを有効化
    - アクティビティログテーブルでRLSを有効化
    - プロジェクトテーブルのポリシーを更新してメンバーアクセスを許可

  3. 変更
    - プロジェクトテーブルにリアルタイム更新用のフィールドを追加
*/

-- プロジェクトメンバーテーブル
CREATE TABLE IF NOT EXISTS project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz DEFAULT now(),
  joined_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- プロジェクト招待テーブル
CREATE TABLE IF NOT EXISTS project_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invited_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- プロジェクトアクティビティログテーブル
CREATE TABLE IF NOT EXISTS project_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- プロジェクトテーブルにリアルタイム更新用フィールドを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'last_modified_by'
  ) THEN
    ALTER TABLE projects ADD COLUMN last_modified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'version'
  ) THEN
    ALTER TABLE projects ADD COLUMN version integer DEFAULT 1;
  END IF;
END $$;

-- RLSを有効化
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity_log ENABLE ROW LEVEL SECURITY;

-- プロジェクトメンバーのポリシー
CREATE POLICY "Users can view project members for their projects"
  ON project_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = project_members.project_id
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
    )
  );

CREATE POLICY "Project owners and admins can manage members"
  ON project_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = project_members.project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'admin')
      AND pm.status = 'active'
    )
  );

-- プロジェクト招待のポリシー
CREATE POLICY "Users can view invitations for their projects"
  ON project_invitations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = project_invitations.project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'admin')
      AND pm.status = 'active'
    )
  );

CREATE POLICY "Project owners and admins can manage invitations"
  ON project_invitations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = project_invitations.project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'admin')
      AND pm.status = 'active'
    )
  );

-- アクティビティログのポリシー
CREATE POLICY "Users can view activity log for their projects"
  ON project_activity_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = project_activity_log.project_id
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
    )
  );

CREATE POLICY "Users can create activity log entries"
  ON project_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- プロジェクトテーブルのポリシーを更新
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;

-- 新しいプロジェクトポリシー（メンバーアクセスを含む）
CREATE POLICY "Users can view projects they are members of"
  ON projects
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
    )
  );

CREATE POLICY "Project members can update projects"
  ON projects
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
    )
  )
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
    )
  );

CREATE POLICY "Project owners can delete projects"
  ON projects
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
      AND pm.status = 'active'
    )
  );

-- トリガー関数の更新
CREATE OR REPLACE FUNCTION update_project_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    NEW.version = OLD.version + 1;
    NEW.last_modified_by = auth.uid();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_version
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_project_version();

-- プロジェクト作成時に所有者をメンバーテーブルに追加する関数
CREATE OR REPLACE FUNCTION add_project_owner()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO project_members (project_id, user_id, role, status, joined_at)
    VALUES (NEW.id, NEW.user_id, 'owner', 'active', now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER add_project_owner_trigger
    AFTER INSERT ON projects
    FOR EACH ROW
    EXECUTE FUNCTION add_project_owner();

-- リアルタイム更新のためのパブリケーション
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE project_members;
ALTER PUBLICATION supabase_realtime ADD TABLE project_activity_log;