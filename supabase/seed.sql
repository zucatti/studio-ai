-- ============================================================================
-- Studio IA - Seed Data
-- ============================================================================

-- Demo user ID (will be replaced by actual Auth0 user ID)
-- Using a placeholder that matches the pattern auth0|xxxxx
DO $$
DECLARE
    demo_user_id TEXT := 'demo_user_001';
    project_scifi_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    project_pub_id UUID := 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
    scene_1_id UUID := 'c3d4e5f6-a7b8-9012-cdef-123456789012';
    scene_2_id UUID := 'd4e5f6a7-b8c9-0123-def1-234567890123';
    shot_1_id UUID := 'e5f6a7b8-c9d0-1234-ef12-345678901234';
    shot_2_id UUID := 'f6a7b8c9-d0e1-2345-f123-456789012345';
    shot_3_id UUID := 'a7b8c9d0-e1f2-3456-0123-567890123456';
BEGIN

-- ============================================================================
-- PROJECTS
-- ============================================================================

INSERT INTO projects (id, user_id, name, description, status, current_step)
VALUES
    (project_scifi_id, demo_user_id, 'Court-métrage Sci-Fi', 'Un voyage dans l''espace en 2150', 'in_progress', 'script'),
    (project_pub_id, demo_user_id, 'Publicité Produit', 'Spot publicitaire pour nouveau smartphone', 'draft', 'brainstorming');

-- ============================================================================
-- BRAINSTORMING
-- ============================================================================

INSERT INTO brainstorming (project_id, content)
VALUES
    (project_scifi_id, '# Court-métrage Sci-Fi

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
- Inspiré de 2001, Interstellar, Arrival'),
    (project_pub_id, '# Publicité Smartphone

## Concept
Mettre en avant les capacités photo/vidéo révolutionnaires du nouveau smartphone.

## Cible
- Jeunes créatifs 18-35 ans
- Passionnés de photo/vidéo mobile

## Ton
- Dynamique, inspirant
- Moderne, premium');

-- ============================================================================
-- SCENES
-- ============================================================================

INSERT INTO scenes (id, project_id, scene_number, int_ext, location, time_of_day, description, sort_order)
VALUES
    (scene_1_id, project_scifi_id, 1, 'INT', 'VAISSEAU SPATIAL - COCKPIT', 'NUIT', 'Le capitaine observe les étoiles à travers le hublot.', 0),
    (scene_2_id, project_scifi_id, 2, 'EXT', 'ESPACE - PRÈS DE LA PLANÈTE', 'NUIT', 'Le vaisseau s''approche de la planète inconnue.', 1);

-- ============================================================================
-- SHOTS
-- ============================================================================

INSERT INTO shots (id, scene_id, shot_number, description, shot_type, camera_angle, camera_movement, generation_status, sort_order)
VALUES
    (shot_1_id, scene_1_id, 1, 'Plan large du cockpit avec le capitaine assis', 'wide', 'eye_level', 'static', 'not_started', 0),
    (shot_2_id, scene_1_id, 2, 'Gros plan sur le visage du capitaine', 'close_up', 'eye_level', 'static', 'not_started', 1),
    (shot_3_id, scene_2_id, 1, 'Plan large du vaisseau avec la planète en arrière-plan', 'wide', 'eye_level', 'tracking', 'not_started', 0);

-- ============================================================================
-- DIALOGUES
-- ============================================================================

INSERT INTO dialogues (shot_id, character_name, content, sort_order)
VALUES
    (shot_2_id, 'CAPITAINE', 'Nous y sommes presque...', 0);

-- ============================================================================
-- ACTIONS
-- ============================================================================

INSERT INTO actions (shot_id, content, sort_order)
VALUES
    (shot_1_id, 'Le capitaine regarde par le hublot', 0);

-- ============================================================================
-- CHARACTERS
-- ============================================================================

INSERT INTO characters (project_id, name, description, visual_description, age, gender)
VALUES
    (project_scifi_id, 'Capitaine Elena Rodriguez', 'Commandante du vaisseau Horizon. 45 ans, déterminée, calme sous pression.', 'Femme hispanique, cheveux gris courts, yeux bruns intenses, uniforme bleu marine', '45', 'female'),
    (project_scifi_id, 'Lieutenant Tom Chen', 'Second du vaisseau, expert en navigation. 35 ans, optimiste, brillant.', 'Homme asiatique, cheveux noirs, sourire chaleureux, uniforme technique gris', '35', 'male');

-- ============================================================================
-- PROPS
-- ============================================================================

INSERT INTO props (project_id, name, type, visual_description)
VALUES
    (project_scifi_id, 'Console de navigation', 'object', 'Interface holographique circulaire, lumières bleues, style futuriste épuré'),
    (project_scifi_id, 'Combinaison spatiale', 'object', 'Combinaison blanche avec détails bleus, casque transparent, design moderne');

-- ============================================================================
-- LOCATIONS
-- ============================================================================

INSERT INTO locations (project_id, name, type, visual_description, lighting, mood)
VALUES
    (project_scifi_id, 'Cockpit du vaisseau', 'interior', 'Grand cockpit futuriste, panneaux de contrôle holographiques, vue panoramique sur l''espace', 'Lumière ambiante bleue douce, étoiles visibles par les hublots', 'Calme, contemplatif'),
    (project_scifi_id, 'Espace près de la planète', 'exterior', 'Vide spatial avec planète verdoyante en arrière-plan, étoiles scintillantes', 'Lumière de la planète, ombres profondes', 'Majestueux, mystérieux');

END $$;
