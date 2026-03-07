SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict bq2zMcdf8dMS9QTPOgXgHuyKfr4pteHhZKHkGex9tzrs35W1PINJFDOPxeJaFZo

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."projects" ("id", "user_id", "name", "description", "thumbnail_url", "status", "current_step", "created_at", "updated_at", "visual_style", "auto_extract_inventory", "inventory_extracted_at") VALUES
	('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'google-oauth2|113084593018690519706', 'Publicité Produit', 'Spot publicitaire pour nouveau smartphone', NULL, 'draft', 'brainstorming', '2026-03-06 18:26:07.875737+00', '2026-03-06 18:31:45.859768+00', 'photorealistic', false, NULL),
	('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'google-oauth2|113084593018690519706', 'Court-métrage Sci-Fi', 'Un voyage dans l''espace en 2150', 'http://127.0.0.1:54321/storage/v1/object/public/project-thumbnails/google-oauth2_113084593018690519706/1772822185479_otgfpf.jpg', 'in_progress', 'library', '2026-03-06 18:26:07.875737+00', '2026-03-06 21:14:45.424869+00', 'photorealistic', false, '2026-03-06 21:14:45.425+00');


--
-- Data for Name: scenes; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."scenes" ("id", "project_id", "scene_number", "int_ext", "location", "time_of_day", "description", "sort_order", "created_at", "updated_at") VALUES
	('ffdf9541-ab17-4939-8850-5e7faa466ec4', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1, 'INT', 'VAISSEAU SPATIAL - PONT DE COMMANDE', 'JOUR', 'Le capitaine Elena Rodriguez observe l''espace depuis le pont du vaisseau, contemplant leur destination', 0, '2026-03-06 19:12:53.332992+00', '2026-03-06 19:12:53.332992+00'),
	('f3ddfc08-ac77-434a-866e-a279a053e47a', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 2, 'INT', 'VAISSEAU SPATIAL - POSTE DE NAVIGATION', 'JOUR', 'Le lieutenant Tom Chen travaille sur les systèmes de navigation tandis qu''ARIA répond aux questions', 1, '2026-03-06 19:12:53.389595+00', '2026-03-06 19:12:53.389595+00'),
	('f6f3bfae-af19-4960-a088-d98d07216a66', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 3, 'INT', 'VAISSEAU SPATIAL - BAIE D''OBSERVATION', 'NUIT', 'Elena et Tom se retrouvent dans la baie d''observation pour contempler leur future maison', 2, '2026-03-06 19:12:53.410738+00', '2026-03-06 19:12:53.410738+00');


--
-- Data for Name: shots; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."shots" ("id", "scene_id", "shot_number", "description", "shot_type", "camera_angle", "camera_movement", "camera_notes", "storyboard_image_url", "first_frame_url", "last_frame_url", "first_frame_prompt", "last_frame_prompt", "generated_video_url", "generation_status", "generation_error", "sort_order", "created_at", "updated_at", "storyboard_prompt") VALUES
	('dd8a4691-1a84-4521-915f-4b92096b37a8', 'ffdf9541-ab17-4939-8850-5e7faa466ec4', 2, 'Gros plan sur le visage d''Elena en profil, éclairé par la lumière froide des étoiles. Ses yeux bruns reflètent l''espoir et la détermination. Peau mate avec quelques rides d''expression, maquillage discret. Expression pensive et concentrée, légère lueur d''anticipation dans le regard.', 'close_up', 'eye_level', 'static', NULL, 'http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/dd8a4691-1a84-4521-915f-4b92096b37a8_storyboard_1772827728637.png', NULL, NULL, NULL, NULL, NULL, 'completed', NULL, 1, '2026-03-06 19:12:53.370547+00', '2026-03-06 20:08:48.684313+00', 'Close-up profile view of Elena''s face illuminated by cold starlight, brown eyes reflecting light, olive skin with subtle expression lines, minimal makeup, thoughtful concentrated expression, slight brightness in her gaze, eye-level angle'),
	('0bb9ec49-c904-4ec3-aa55-6bc35a8105d7', 'f3ddfc08-ac77-434a-866e-a279a053e47a', 4, 'Insert sur les mains de Tom interagissant avec l''hologramme 3D de la planète Kepler-442b. La planète apparaît bleu-vert avec des continents visibles, tournant lentement dans l''air. Ses doigts effleurent la surface lumineuse, créant des ondulations dorées. Éclairage chaud contrastant avec la froideur technologique environnante.', 'extreme_close_up', 'eye_level', 'static', NULL, 'http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/0bb9ec49-c904-4ec3-aa55-6bc35a8105d7_storyboard_1772829979758.png', NULL, NULL, NULL, NULL, NULL, 'completed', NULL, 1, '2026-03-06 19:12:53.406477+00', '2026-03-06 20:46:19.811956+00', 'Extreme close-up of hands interacting with blue-green holographic planet Kepler-442b floating in air, visible continents, slowly rotating, fingers touching luminous surface creating golden ripples, warm lighting contrasting with cold technological environment, spacecraft navigation station interior'),
	('c9bf7094-86fa-4d41-8d4c-cff789276d9f', 'f6f3bfae-af19-4960-a088-d98d07216a66', 5, 'Plan large de la baie d''observation, immense verrière incurvée donnant sur l''espace profond parsemé d''étoiles scintillantes. Elena et Tom se tiennent côte à côte, petites silhouettes humaines face à l''immensité cosmique. Éclairage tamisé du vaisseau créant une ambiance intime, reflets des étoiles sur le sol métallique poli.', 'wide', 'low_angle', 'static', NULL, 'http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/c9bf7094-86fa-4d41-8d4c-cff789276d9f_storyboard_1772827583572.png', NULL, NULL, NULL, NULL, NULL, 'completed', NULL, 0, '2026-03-06 19:12:53.414704+00', '2026-03-06 20:06:23.606831+00', 'Wide shot, low angle view of spaceship observation bay with massive curved glass window overlooking deep space filled with twinkling stars. Elena and Tom standing side by side as small human silhouettes against cosmic vastness. Dim ship lighting, starlight reflections on polished metallic floor.'),
	('7284db53-4d82-4658-a54d-66a6dcc28ac5', 'f6f3bfae-af19-4960-a088-d98d07216a66', 6, 'Plan en contre-plongée sur Elena et Tom vus de dos, leurs silhouettes se découpant contre la voûte étoilée. Tom, légèrement plus grand, tourne la tête vers Elena. Leurs uniformes captent la lumière stellaire, créant des reflets argentés. Atmosphere contemplative et solennelle, vastitude de l''espace accentuant leur humanité.', 'medium', 'low_angle', 'static', NULL, 'http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/7284db53-4d82-4658-a54d-66a6dcc28ac5_storyboard_1772827550220.png', NULL, NULL, NULL, NULL, NULL, 'completed', NULL, 1, '2026-03-06 19:12:53.420964+00', '2026-03-06 20:05:50.256158+00', 'Medium shot, low angle view of Elena and Tom from behind, silhouettes against starry space vista through spacecraft observation bay window. Tom slightly taller, head turned toward Elena. Their uniforms reflect starlight with silver gleams. Vast starfield backdrop emphasizes human figures.'),
	('fe77790d-faef-4fab-a874-18103eee9536', 'f6f3bfae-af19-4960-a088-d98d07216a66', 7, 'Très gros plan sur les yeux d''Elena reflétant les étoiles, expression mélant espoir et mélancolie. Pupilles dilatées captant chaque parcelle de lumière stellaire, cils délicats créant des ombres douces. Dans le reflet de ses iris, on devine la forme lointaine d''une planète bleutée. Éclairage dramatique soulignant l''émotion et l''humanité du moment.', 'extreme_close_up', 'eye_level', 'dolly_in', NULL, 'http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/fe77790d-faef-4fab-a874-18103eee9536_storyboard_1772827225502.png', NULL, NULL, NULL, NULL, NULL, 'completed', NULL, 2, '2026-03-06 19:12:53.42501+00', '2026-03-06 20:00:25.535521+00', 'Extreme close-up of Elena''s eyes reflecting stars, dilated pupils catching starlight, delicate eyelashes casting soft shadows. Distant blue planet visible in iris reflection. Dramatic lighting on face, eye-level camera angle, spacecraft observation bay interior.'),
	('fab262fd-829a-4293-a585-43a55b4e16f9', 'ffdf9541-ab17-4939-8850-5e7faa466ec4', 1, 'Vue large du pont de commande futuriste avec interfaces holographiques bleues et blanches. Elena Rodriguez, femme hispanique de 40 ans aux cheveux noirs attachés, porte un uniforme spatial gris métallique. Elle se tient debout face à la baie vitrée, silhouette élégante contre l''immensité étoilée. Éclairage froid avec reflets bleutés sur les surfaces métalliques polies.', 'wide', 'eye_level', 'static', NULL, 'http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/fab262fd-829a-4293-a585-43a55b4e16f9_storyboard_1772827744352.png', NULL, NULL, NULL, NULL, NULL, 'completed', NULL, 0, '2026-03-06 19:12:53.346737+00', '2026-03-06 20:09:04.386484+00', 'Wide shot of futuristic spaceship command bridge with blue and white holographic interfaces. Hispanic woman, 40s, black hair in bun, metallic gray space uniform, standing facing large viewport window. Elegant silhouette against starfield. Cold lighting with blue reflections on polished metal surfaces.'),
	('4b407d9e-a1a1-42ea-8f34-16e207a4948a', 'f3ddfc08-ac77-434a-866e-a279a053e47a', 3, 'Plan moyen sur Tom Chen, homme asiatique de 35 ans aux cheveux noirs courts, concentré devant des écrans holographiques complexes. Porte le même uniforme gris que Elena. Interface de navigation avec cartes stellaires en 3D, coordonnées défilant en caractères lumineux verts et bleus. Ambiance high-tech épurée avec surfaces courbes et éclairage indirect.', 'medium', 'eye_level', 'static', NULL, 'http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/4b407d9e-a1a1-42ea-8f34-16e207a4948a_storyboard_1772827630343.png', NULL, NULL, NULL, NULL, NULL, 'completed', NULL, 0, '2026-03-06 19:12:53.394896+00', '2026-03-06 20:07:10.390919+00', 'Medium shot of Tom Chen, 35-year-old Asian man with short black hair, gray uniform, facing complex holographic screens. 3D stellar maps, scrolling green and blue luminous coordinates. High-tech spaceship navigation station, curved surfaces, indirect lighting, eye-level angle.');


--
-- Data for Name: actions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."actions" ("id", "shot_id", "content", "sort_order", "created_at") VALUES
	('37ab6a4c-a6b2-4f4e-af9c-af5c0002246b', 'fab262fd-829a-4293-a585-43a55b4e16f9', 'Elena observe l''espace à travers la baie vitrée, les mains croisées derrière le dos.', 0, '2026-03-06 19:12:53.358676+00'),
	('4bf2dd4c-20a3-4ea9-bbcd-f3b57d55cbbf', '4b407d9e-a1a1-42ea-8f34-16e207a4948a', 'Tom manipule les interfaces holographiques, vérifiant les données de navigation.', 0, '2026-03-06 19:12:53.403108+00'),
	('8eaeb3c0-7a01-421d-a562-bc33099bbd47', 'c9bf7094-86fa-4d41-8d4c-cff789276d9f', 'Elena et Tom contemplent l''espace en silence, proches mais perdus dans leurs pensées.', 0, '2026-03-06 19:12:53.4189+00');


--
-- Data for Name: brainstorming; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."brainstorming" ("id", "project_id", "content", "created_at", "updated_at") VALUES
	('64ba6408-e2d3-4b70-8995-179b10aa2896', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', '# Publicité Smartphone

## Concept
Mettre en avant les capacités photo/vidéo révolutionnaires du nouveau smartphone.

## Cible
- Jeunes créatifs 18-35 ans
- Passionnés de photo/vidéo mobile

## Ton
- Dynamique, inspirant
- Moderne, premium', '2026-03-06 18:26:07.875737+00', '2026-03-06 18:26:07.875737+00'),
	('9960d364-5111-4b0a-b951-9dac72f17b50', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', '# Court-métrage Sci-Fi

## Concept
Un voyage interstellaire vers une nouvelle planète habitable en 2150.

## Thèmes
- Espoir et découverte
- Solitude dans l''espace
- Humanité face à l''inconnu

## Personnages principaux
- Capitaine Elena Rodriguez
- Lieutenant Tom Chen
- IA du vaisseau: ARIA

## Notes visuelles
- Esthétique épurée, high-tech
- Couleurs froides avec touches de chaleur humaine
- Inspiré de 2001, Interstellar, Arrival', '2026-03-06 18:26:07.875737+00', '2026-03-06 19:12:22.024738+00');


--
-- Data for Name: characters; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."characters" ("id", "project_id", "name", "description", "visual_description", "age", "gender", "reference_images", "created_at", "updated_at", "generation_prompt", "generation_status", "generation_error", "generation_progress") VALUES
	('0c3f400d-0373-4803-9dfd-c7deafc07bfd', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'ARIA', 'Intelligence artificielle du vaisseau, responsable des systèmes et de la navigation', 'IA sans forme physique visible, présence vocale uniquement', 'Non applicable', 'autre', '{http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/character_0c3f400d-0373-4803-9dfd-c7deafc07bfd_front_1772834223518.webp,http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/character_0c3f400d-0373-4803-9dfd-c7deafc07bfd_profile_1772834237501.webp,http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/character_0c3f400d-0373-4803-9dfd-c7deafc07bfd_back_1772834246486.webp}', '2026-03-06 21:14:45.413136+00', '2026-03-06 21:57:26.523905+00', 'Invisible presence concept, empty space with subtle visual cues of artificial intelligence, floating holographic interface elements, glowing data streams, ethereal digital particles in air, no physical human form visible, portrait framing of empty void', 'completed', NULL, '"{\"current\":3,\"total\":3}"'),
	('629aeed1-d26b-4635-9e6d-f682ee121e42', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Lieutenant Tom Chen', 'Officier de navigation, responsable des systèmes techniques du vaisseau', 'Homme asiatique de 35 ans aux cheveux noirs courts, légèrement plus grand qu''Elena, porte un uniforme spatial gris métallique identique à celui d''Elena, apparence concentrée et professionnelle', '35 ans', 'homme', '{http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/character_629aeed1-d26b-4635-9e6d-f682ee121e42_front_1772834151962.webp,http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/character_629aeed1-d26b-4635-9e6d-f682ee121e42_profile_1772834165624.webp,http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/character_629aeed1-d26b-4635-9e6d-f682ee121e42_back_1772834179944.webp}', '2026-03-06 21:14:45.413136+00', '2026-03-06 21:56:19.980382+00', '35-year-old Asian man with short black hair, tall stature, wearing metallic gray space uniform, concentrated and professional facial expression, portrait framing', 'completed', NULL, '"{\"current\":3,\"total\":3}"'),
	('4992f38f-86c9-48e4-8f0d-ea1793072778', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Capitaine Elena Rodriguez', 'Capitaine du vaisseau spatial, leader déterminée contemplant l''avenir de l''humanité', 'Femme hispanique de 40 ans aux cheveux noirs attachés, yeux bruns expressifs reflétant espoir et détermination, peau mate avec quelques rides d''expression, maquillage discret, porte un uniforme spatial gris métallique, silhouette élégante, expression pensive et concentrée', '40 ans', 'femme', '{http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/character_4992f38f-86c9-48e4-8f0d-ea1793072778_front_1772834106708.webp,http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/character_4992f38f-86c9-48e4-8f0d-ea1793072778_profile_1772834125523.webp,http://127.0.0.1:54321/storage/v1/object/public/project-assets/google-oauth2_113084593018690519706/a1b2c3d4-e5f6-7890-abcd-ef1234567890/character_4992f38f-86c9-48e4-8f0d-ea1793072778_back_1772834130873.webp}', '2026-03-06 21:14:45.413136+00', '2026-03-06 21:55:30.903891+00', 'Portrait of a 40-year-old Hispanic woman with tied black hair, expressive brown eyes showing hope and determination, olive skin with expression lines, subtle makeup, wearing metallic gray space uniform, elegant silhouette, thoughtful concentrated expression', 'completed', NULL, '"{\"current\":3,\"total\":3}"');


--
-- Data for Name: dialogues; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."dialogues" ("id", "shot_id", "character_name", "content", "parenthetical", "sort_order", "created_at") VALUES
	('a52983e5-3ab9-48c5-971f-8e6a2461606b', 'dd8a4691-1a84-4521-915f-4b92096b37a8', 'ELENA', 'ARIA, quelle est notre distance de Kepler-442b ?', '(doucement)', 0, '2026-03-06 19:12:53.382977+00'),
	('a78a9404-cc7c-482a-8890-df5558a7c3f8', '4b407d9e-a1a1-42ea-8f34-16e207a4948a', 'ARIA', 'Nous sommes à 2,7 années-lumière de notre destination, Capitaine.', NULL, 0, '2026-03-06 19:12:53.399596+00'),
	('22a37997-2f52-4cc9-b771-0e94f1c299ee', '0bb9ec49-c904-4ec3-aa55-6bc35a8105d7', 'TOM', 'Les scans préliminaires confirment une atmosphère respirable.', NULL, 0, '2026-03-06 19:12:53.408777+00'),
	('20aeb157-b85a-4842-b71a-81a76e1382e6', 'c9bf7094-86fa-4d41-8d4c-cff789276d9f', 'ELENA', 'Parfois je me demande si nous faisons le bon choix.', NULL, 0, '2026-03-06 19:12:53.417044+00'),
	('526e3afb-3f30-4f19-91e5-ee0e925fa9e4', '7284db53-4d82-4658-a54d-66a6dcc28ac5', 'TOM', 'L''humanité a toujours eu besoin d''explorer pour survivre.', '(avec conviction)', 0, '2026-03-06 19:12:53.423175+00'),
	('0d42eef2-e010-4770-a417-4bf858ec6446', 'fe77790d-faef-4fab-a874-18103eee9536', 'ELENA', 'Alors faisons de cette nouvelle planète... notre chez nous.', NULL, 0, '2026-03-06 19:12:53.427668+00');


--
-- Data for Name: locations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."locations" ("id", "project_id", "name", "type", "visual_description", "lighting", "mood", "reference_images", "created_at", "updated_at", "generation_prompt", "generation_status", "generation_error", "generation_progress") VALUES
	('b5357773-43f6-492c-ad99-b3e27f3435a4', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Pont de commande', 'interior', 'Pont futuriste avec baie vitrée donnant sur l''espace, surfaces métalliques polies, design épuré high-tech, interfaces holographiques intégrées', 'Éclairage froid avec reflets bleutés, lumière froide des étoiles filtrant par la baie vitrée', 'Professionnel et contemplatif, ambiance de commandement', '{}', '2026-03-06 21:14:45.421387+00', '2026-03-06 21:14:45.421387+00', NULL, 'pending', NULL, NULL),
	('588e2f99-be23-4add-8f5c-d286c78135d3', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Poste de navigation', 'interior', 'Zone technique avec écrans holographiques complexes, surfaces courbes épurées, ambiance high-tech avec interfaces de navigation avancées', 'Éclairage indirect et technique, éclairage chaud contrastant avec la froideur technologique', 'Concentré et technique, atmosphère de travail', '{}', '2026-03-06 21:14:45.421387+00', '2026-03-06 21:14:45.421387+00', NULL, 'pending', NULL, NULL),
	('d92975a4-ac75-4b76-a8e3-03885e427cb6', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Baie d''observation', 'interior', 'Immense verrière incurvée donnant sur l''espace profond parsemé d''étoiles scintillantes, sol métallique poli reflétant les étoiles, architecture permettant une vue panoramique sur l''univers', 'Éclairage tamisé du vaisseau, reflets des étoiles, lumière stellaire naturelle, éclairage dramatique', 'Contemplatif et solennel, intimiste face à l''immensité cosmique', '{}', '2026-03-06 21:14:45.421387+00', '2026-03-06 21:14:45.421387+00', NULL, 'pending', NULL, NULL);


--
-- Data for Name: props; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."props" ("id", "project_id", "name", "type", "visual_description", "reference_images", "created_at", "updated_at", "generation_prompt", "generation_status", "generation_error", "generation_progress") VALUES
	('b53d4b61-969c-49dd-bfec-3f2f843842a1', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Interfaces holographiques', 'object', 'Écrans et projections holographiques 3D en couleurs bleues et blanches, cartes stellaires flottantes, coordonnées défilant en caractères lumineux verts et bleus, surfaces interactives réagissant au toucher', '{}', '2026-03-06 21:14:45.417504+00', '2026-03-06 21:14:45.417504+00', NULL, 'pending', NULL, NULL),
	('de4f8dda-0b5d-421d-bf26-5878b13f1449', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hologramme de Kepler-442b', 'object', 'Projection 3D d''une planète bleu-vert avec des continents visibles, tournant lentement dans l''air, surface lumineuse créant des ondulations dorées au toucher', '{}', '2026-03-06 21:14:45.417504+00', '2026-03-06 21:14:45.417504+00', NULL, 'pending', NULL, NULL),
	('43019673-70fb-434b-9155-777f4189f444', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Uniformes spatiaux', 'object', 'Uniformes gris métallique au design futuriste, captant les reflets de lumière stellaire avec des reflets argentés, coupe élégante et fonctionnelle', '{}', '2026-03-06 21:14:45.417504+00', '2026-03-06 21:14:45.417504+00', NULL, 'pending', NULL, NULL);


--
-- PostgreSQL database dump complete
--

-- \unrestrict bq2zMcdf8dMS9QTPOgXgHuyKfr4pteHhZKHkGex9tzrs35W1PINJFDOPxeJaFZo

RESET ALL;
