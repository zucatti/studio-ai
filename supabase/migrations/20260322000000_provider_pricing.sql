-- Provider pricing table for dynamic cost calculation
-- Prices are automatically synced daily from provider APIs

CREATE TABLE IF NOT EXISTS provider_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,  -- wavespeed, fal, runway, modelslab, elevenlabs, claude
  model TEXT NOT NULL,     -- Model identifier (e.g., 'kwaivgi/kling-video-o3-pro/image-to-video')
  model_alias TEXT,        -- Short alias (e.g., 'kling-o3-pro')
  price_per_unit DECIMAL(10, 6) NOT NULL,  -- Price in USD
  unit_type TEXT NOT NULL DEFAULT 'per_generation',  -- per_generation, per_second, per_1k_chars, per_1m_tokens_input, per_1m_tokens_output
  category TEXT,           -- image, video, audio, text
  display_name TEXT,       -- Human-readable name
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  source TEXT DEFAULT 'manual',  -- manual, api, scrape
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(provider, model)
);

-- Index for fast lookups
CREATE INDEX idx_provider_pricing_lookup ON provider_pricing(provider, model) WHERE is_active = true;
CREATE INDEX idx_provider_pricing_alias ON provider_pricing(provider, model_alias) WHERE model_alias IS NOT NULL AND is_active = true;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_provider_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER provider_pricing_updated_at
  BEFORE UPDATE ON provider_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_provider_pricing_updated_at();

-- Insert initial WaveSpeed prices (March 2026)
INSERT INTO provider_pricing (provider, model, model_alias, price_per_unit, unit_type, category, display_name) VALUES
  -- WaveSpeed Video - Kling
  ('wavespeed', 'kwaivgi/kling-video-o3-pro/image-to-video', 'kling-o3-pro', 0.020000, 'per_generation', 'video', 'Kling O3 Pro'),
  ('wavespeed', 'kwaivgi/kling-video-o3-std/image-to-video', 'kling-o3-std', 0.015000, 'per_generation', 'video', 'Kling O3 Standard'),
  -- WaveSpeed Video - Sora
  ('wavespeed', 'openai/sora-2/image-to-video', 'sora-2', 0.100000, 'per_generation', 'video', 'Sora 2'),
  ('wavespeed', 'openai/sora-2-pro/image-to-video', 'sora-2-pro', 0.150000, 'per_generation', 'video', 'Sora 2 Pro'),
  -- WaveSpeed Video - Veo
  ('wavespeed', 'google/veo3.1/image-to-video', 'veo-3.1', 0.400000, 'per_generation', 'video', 'Veo 3.1'),
  -- WaveSpeed Video - Seedance
  ('wavespeed', 'bytedance/seedance-v2.0/image-to-video', 'seedance-2', 0.030000, 'per_generation', 'video', 'Seedance 2.0'),
  ('wavespeed', 'bytedance/seedance-v1.5-pro/image-to-video', 'seedance-1.5', 0.025000, 'per_generation', 'video', 'Seedance 1.5 Pro'),
  -- WaveSpeed Video - WAN
  ('wavespeed', 'alibaba/wan-2.6/image-to-video', 'wan-2.6', 0.020000, 'per_generation', 'video', 'WAN 2.6'),
  ('wavespeed', 'alibaba/wan-2.5/image-to-video', 'wan-2.5', 0.050000, 'per_generation', 'video', 'WAN 2.5'),
  -- WaveSpeed Video - OmniHuman
  ('wavespeed', 'bytedance/omnihuman-1.5/image-to-video', 'omnihuman-1.5', 0.050000, 'per_generation', 'video', 'OmniHuman 1.5'),
  -- WaveSpeed Image
  ('wavespeed', 'flux-dev', NULL, 0.005000, 'per_generation', 'image', 'Flux Dev'),
  ('wavespeed', 'flux-schnell', NULL, 0.005000, 'per_generation', 'image', 'Flux Schnell'),
  ('wavespeed', 'sd-3.5-large', NULL, 0.020000, 'per_generation', 'image', 'SD 3.5 Large'),

  -- fal.ai Image
  ('fal', 'fal-ai/nano-banana-2', 'nano-banana-2', 0.040000, 'per_generation', 'image', 'Nano Banana 2'),
  ('fal', 'fal-ai/seedream-v4', 'seedream-v4', 0.030000, 'per_generation', 'image', 'Seedream v4'),
  ('fal', 'fal-ai/flux/schnell', 'flux-schnell', 0.003000, 'per_generation', 'image', 'Flux Schnell'),
  ('fal', 'fal-ai/flux/dev', 'flux-dev', 0.010000, 'per_generation', 'image', 'Flux Dev'),
  ('fal', 'fal-ai/ideogram/v2', 'ideogram-v2', 0.060000, 'per_generation', 'image', 'Ideogram v2'),
  ('fal', 'fal-ai/kling-image/o1', 'kling-o1', 0.050000, 'per_generation', 'image', 'Kling O1'),
  -- fal.ai Video
  ('fal', 'fal-ai/kling-video/v1/pro/image-to-video', 'kling-pro', 0.100000, 'per_generation', 'video', 'Kling Pro'),
  ('fal', 'fal-ai/wan-2.5', 'wan-2.5', 0.050000, 'per_generation', 'video', 'WAN 2.5'),
  ('fal', 'fal-ai/veo-3', 'veo-3', 0.400000, 'per_generation', 'video', 'Veo 3'),

  -- Runway Video
  ('runway', 'gen-4.5', 'gen4.5', 0.120000, 'per_second', 'video', 'Gen-4.5'),
  ('runway', 'gen-4', 'gen4', 0.050000, 'per_second', 'video', 'Gen-4'),
  ('runway', 'gen-4-turbo', 'gen4-turbo', 0.050000, 'per_second', 'video', 'Gen-4 Turbo'),
  ('runway', 'veo-3', NULL, 0.400000, 'per_second', 'video', 'Veo 3'),
  ('runway', 'veo-3.1', NULL, 0.250000, 'per_second', 'video', 'Veo 3.1'),

  -- ElevenLabs Audio
  ('elevenlabs', 'eleven_multilingual_v2', NULL, 0.000300, 'per_character', 'audio', 'Multilingual v2'),
  ('elevenlabs', 'eleven_turbo_v2', NULL, 0.000150, 'per_character', 'audio', 'Turbo v2'),

  -- Claude Text
  ('claude', 'claude-opus-4-5-20251101', 'opus-4.5', 5.000000, 'per_1m_tokens_input', 'text', 'Claude Opus 4.5'),
  ('claude', 'claude-sonnet-4-20250514', 'sonnet-4', 3.000000, 'per_1m_tokens_input', 'text', 'Claude Sonnet 4')
ON CONFLICT (provider, model) DO UPDATE SET
  price_per_unit = EXCLUDED.price_per_unit,
  display_name = EXCLUDED.display_name,
  updated_at = NOW();

-- Add output prices for Claude models (separate rows)
INSERT INTO provider_pricing (provider, model, model_alias, price_per_unit, unit_type, category, display_name) VALUES
  ('claude', 'claude-opus-4-5-20251101-output', 'opus-4.5-output', 25.000000, 'per_1m_tokens_output', 'text', 'Claude Opus 4.5 (output)'),
  ('claude', 'claude-sonnet-4-20250514-output', 'sonnet-4-output', 15.000000, 'per_1m_tokens_output', 'text', 'Claude Sonnet 4 (output)')
ON CONFLICT (provider, model) DO UPDATE SET
  price_per_unit = EXCLUDED.price_per_unit,
  updated_at = NOW();

-- Pricing sync log table
CREATE TABLE IF NOT EXISTS pricing_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  status TEXT NOT NULL,  -- success, failed, partial
  models_updated INTEGER DEFAULT 0,
  models_added INTEGER DEFAULT 0,
  error_message TEXT,
  sync_source TEXT,  -- api, manual, scrape
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE provider_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_sync_log ENABLE ROW LEVEL SECURITY;

-- Anyone can read pricing (public data)
CREATE POLICY "Anyone can read pricing" ON provider_pricing
  FOR SELECT USING (true);

-- Only service role can modify pricing
CREATE POLICY "Service role can manage pricing" ON provider_pricing
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage sync log" ON pricing_sync_log
  FOR ALL USING (auth.role() = 'service_role');
