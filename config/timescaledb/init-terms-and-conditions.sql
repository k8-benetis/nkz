-- =============================================================================
-- Terms and Conditions Table
-- =============================================================================
-- Table to store terms and conditions in multiple languages
-- =============================================================================

CREATE TABLE IF NOT EXISTS terms_and_conditions (
    id SERIAL PRIMARY KEY,
    language VARCHAR(10) NOT NULL,
    content TEXT NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(language, last_updated)
);

-- Index for faster lookups by language
CREATE INDEX IF NOT EXISTS idx_terms_language ON terms_and_conditions(language);
CREATE INDEX IF NOT EXISTS idx_terms_last_updated ON terms_and_conditions(last_updated DESC);

-- Insert default Spanish terms (can be updated later via admin panel)
INSERT INTO terms_and_conditions (language, content, last_updated)
VALUES (
    'es',
    '<h2>Términos y Condiciones de Uso</h2>
    <p>Al utilizar la plataforma Nekazari, aceptas los siguientes términos y condiciones:</p>
    <h3>1. Uso de la Plataforma</h3>
    <p>La plataforma Nekazari está diseñada para la gestión agrícola y el monitoreo de explotaciones.</p>
    <h3>2. Responsabilidades del Usuario</h3>
    <p>Eres responsable de mantener la confidencialidad de tus credenciales y de todas las actividades que ocurran bajo tu cuenta.</p>
    <h3>3. Protección de Datos</h3>
    <p>Respetamos tu privacidad y protegemos tus datos según nuestra política de privacidad.</p>
    <h3>4. Limitación de Responsabilidad</h3>
    <p>La plataforma se proporciona "tal cual" sin garantías de ningún tipo.</p>',
    NOW()
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE terms_and_conditions IS 'Stores terms and conditions in multiple languages for user acceptance during registration';
COMMENT ON COLUMN terms_and_conditions.language IS 'Language code (es, en, ca, eu, fr, pt)';
COMMENT ON COLUMN terms_and_conditions.content IS 'HTML content of the terms and conditions';
COMMENT ON COLUMN terms_and_conditions.last_updated IS 'Timestamp when terms were last updated';

