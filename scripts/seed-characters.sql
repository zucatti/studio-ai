INSERT INTO global_assets (id, user_id, asset_type, name, data, reference_images, tags, created_at, updated_at)
VALUES
(
  '4e4efb72-4980-4104-944c-e51586b0e2a8',
  'google-oauth2|113084593018690519706',
  'character',
  'Diane',
  '{"age": "28", "description": "", "gender": "femme", "visual_description": "", "reference_images_metadata": [{"label": "Vue de face", "type": "front", "url": "b2://creeks-studio/uploads/google-oauth2_113084593018690519706/1773665473847_z997q3.webp"}, {"label": "Profil (Vue de cote)", "type": "profile", "url": "b2://creeks-studio/characters/google-oauth2_113084593018690519706/4e4efb72-4980-4104-944c-e51586b0e2a8/profile_1773673033132.webp"}, {"label": "Dos (Vue arriere)", "type": "back", "url": "b2://creeks-studio/characters/google-oauth2_113084593018690519706/4e4efb72-4980-4104-944c-e51586b0e2a8/back_1773673069614.webp"}, {"label": "3/4 (Vue trois-quarts)", "type": "three_quarter", "url": "b2://creeks-studio/characters/google-oauth2_113084593018690519706/4e4efb72-4980-4104-944c-e51586b0e2a8/three_quarter_1773682871162.webp"}, {"label": "Autre", "type": "custom", "url": "b2://creeks-studio/characters/google-oauth2_113084593018690519706/4e4efb72-4980-4104-944c-e51586b0e2a8/custom_1773683205987.webp"}]}'::jsonb,
  ARRAY['b2://creeks-studio/uploads/google-oauth2_113084593018690519706/1773665473847_z997q3.webp', 'b2://creeks-studio/characters/google-oauth2_113084593018690519706/4e4efb72-4980-4104-944c-e51586b0e2a8/profile_1773673033132.webp', 'b2://creeks-studio/characters/google-oauth2_113084593018690519706/4e4efb72-4980-4104-944c-e51586b0e2a8/back_1773673069614.webp', 'b2://creeks-studio/characters/google-oauth2_113084593018690519706/4e4efb72-4980-4104-944c-e51586b0e2a8/three_quarter_1773682871162.webp', 'b2://creeks-studio/characters/google-oauth2_113084593018690519706/4e4efb72-4980-4104-944c-e51586b0e2a8/custom_1773683205987.webp'],
  ARRAY['Pas dans cette vie'],
  NOW(),
  NOW()
),
(
  'fd628128-88ba-4472-ba18-870b759e9f7c',
  'google-oauth2|113084593018690519706',
  'character',
  'Morgana',
  '{"age": "30", "description": "Chanteuse de Lacrimae Mundi", "gender": "femme", "visual_description": "", "reference_images_metadata": [{"label": "Image personnalisée", "type": "custom", "url": "b2://creeks-studio/uploads/google-oauth2_113084593018690519706/1773672150525_960b32.jpeg"}, {"label": "Dos (Vue arriere)", "type": "back", "url": "b2://creeks-studio/characters/google-oauth2_113084593018690519706/fd628128-88ba-4472-ba18-870b759e9f7c/back_1773683395449.webp"}, {"label": "3/4 (Vue trois-quarts)", "type": "three_quarter", "url": "b2://creeks-studio/characters/google-oauth2_113084593018690519706/fd628128-88ba-4472-ba18-870b759e9f7c/three_quarter_1773683504642.webp"}]}'::jsonb,
  ARRAY['b2://creeks-studio/uploads/google-oauth2_113084593018690519706/1773672150525_960b32.jpeg', 'b2://creeks-studio/characters/google-oauth2_113084593018690519706/fd628128-88ba-4472-ba18-870b759e9f7c/back_1773683395449.webp', 'b2://creeks-studio/characters/google-oauth2_113084593018690519706/fd628128-88ba-4472-ba18-870b759e9f7c/three_quarter_1773683504642.webp'],
  ARRAY['LacrimaeMundi'],
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
