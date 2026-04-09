-- Backfill storyboard_prompt from generation_jobs.input_data
-- Match by URL in result_data

-- For storyboard images: match the URL from result_data
UPDATE shots s
SET storyboard_prompt = (gj.input_data->>'prompt')
FROM generation_jobs gj
WHERE s.storyboard_prompt IS NULL
  AND s.storyboard_image_url IS NOT NULL
  AND gj.result_data->>'imageUrl' IS NOT NULL
  AND gj.input_data->>'prompt' IS NOT NULL
  AND gj.status = 'completed'
  AND (
    s.storyboard_image_url = gj.result_data->>'imageUrl'
    OR s.storyboard_image_url LIKE '%' || SUBSTRING(gj.result_data->>'imageUrl' FROM '[^/]+$')
  );

-- Fallback: use shot description if still empty
UPDATE shots
SET storyboard_prompt = description
WHERE storyboard_prompt IS NULL
  AND storyboard_image_url IS NOT NULL
  AND description IS NOT NULL
  AND description != '';
