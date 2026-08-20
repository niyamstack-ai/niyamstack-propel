ALTER TABLE content_items ADD COLUMN IF NOT EXISTS parent_folder_id UUID;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS parent_folder_id UUID;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS max_attempts INTEGER;
