-- TeamFlow project and task database for Supabase.
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- Projects belong to the authenticated user who creates them. Tasks inherit
-- access from their project. The app must authenticate with Supabase and send
-- the user's access token for these policies to allow reads and writes.

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL DEFAULT auth.uid()
        REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 70),
    description TEXT NOT NULL DEFAULT ''
        CHECK (char_length(description) <= 240),
    due_date DATE,
    color TEXT NOT NULL DEFAULT 'purple'
        CHECK (color IN ('purple', 'blue', 'green', 'orange')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL
        REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
    assignee TEXT NOT NULL DEFAULT 'Unassigned'
        CHECK (char_length(assignee) <= 50),
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'To do'
        CHECK (status IN ('To do', 'In progress', 'Completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_owner_id_idx
    ON public.projects(owner_id);

CREATE INDEX IF NOT EXISTS tasks_project_id_idx
    ON public.tasks(project_id);

CREATE INDEX IF NOT EXISTS tasks_status_idx
    ON public.tasks(status);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;
CREATE POLICY "Users can view their own projects"
    ON public.projects
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
CREATE POLICY "Users can create their own projects"
    ON public.projects
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
CREATE POLICY "Users can update their own projects"
    ON public.projects
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = owner_id)
    WITH CHECK ((SELECT auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;
CREATE POLICY "Users can delete their own projects"
    ON public.projects
    FOR DELETE
    TO authenticated
    USING ((SELECT auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Users can view tasks in their projects" ON public.tasks;
CREATE POLICY "Users can view tasks in their projects"
    ON public.tasks
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = tasks.project_id
              AND projects.owner_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can create tasks in their projects" ON public.tasks;
CREATE POLICY "Users can create tasks in their projects"
    ON public.tasks
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = tasks.project_id
              AND projects.owner_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can update tasks in their projects" ON public.tasks;
CREATE POLICY "Users can update tasks in their projects"
    ON public.tasks
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = tasks.project_id
              AND projects.owner_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = tasks.project_id
              AND projects.owner_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can delete tasks in their projects" ON public.tasks;
CREATE POLICY "Users can delete tasks in their projects"
    ON public.tasks
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.projects
            WHERE projects.id = tasks.project_id
              AND projects.owner_id = (SELECT auth.uid())
        )
    );
